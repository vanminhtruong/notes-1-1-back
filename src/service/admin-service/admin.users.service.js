import { User } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { emitToAllAdmins, isUserOnline } from '../../socket/socketHandler.js';
import { deleteUploadedFile, deleteOldFileOnUpdate, isUploadedFile } from '../../utils/fileHelper.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';

class AdminUsersChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Get all users list for admin
  getAllUsers = asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20, 
      search,
      role,
      isActive,
      e2eeEnabled,
      readStatusEnabled,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    // Only show users with role 'user', not admin users (ignore role filter)
    whereClause.role = 'user';
    
    if (isActive !== undefined) {
      const wantActive = isActive === 'true';
      whereClause.isActive = wantActive;
      try {
        const me = req.user;
        const isSuper = me && me.adminLevel === 'super_admin';
        const perms = Array.isArray(me?.adminPermissions) ? me.adminPermissions : [];
        if (wantActive && !isSuper) {
          const hasSpecific = perms.includes('manage_users.view_active_accounts');
          const hasParent = perms.includes('manage_users');
          if (!hasSpecific && !hasParent) {
            return res.status(403).json({
              success: false,
              message: 'Không có quyền xem danh sách tài khoản hoạt động',
              requiredPermission: 'manage_users.view_active_accounts',
            });
          }
        }
      } catch {}
    }

    // Filter by E2EE status
    if (e2eeEnabled !== undefined) {
      whereClause.e2eeEnabled = e2eeEnabled === 'true' || e2eeEnabled === true;
    }

    // Filter by Read Status
    if (readStatusEnabled !== undefined) {
      whereClause.readStatusEnabled = readStatusEnabled === 'true' || readStatusEnabled === true;
    }

    const users = await User.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'name', 'email', 'password',
        // Profile
        'avatar', 'lastSeenAt',
        // Contact
        'phone', 'birthDate', 'gender',
        // Account & role
        'role', 'isActive',
        // Settings
        'theme', 'language', 'e2eeEnabled', 'e2eePinHash', 'readStatusEnabled',
        // Privacy
        'hidePhone', 'hideBirthDate', 'allowMessagesFromNonFriends',
        // Timestamps
        'createdAt', 'updatedAt'
      ],
      offset,
      limit: limitNum,
      order: [[sortBy, sortOrder]]
    });

    const usersWithOnlineStatus = users.rows.map(user => {
      const userObj = user.toJSON();
      userObj.isOnline = isUserOnline(user.id);
      return userObj;
    });

    res.json({
      success: true,
      users: usersWithOnlineStatus,
      totalUsers: users.count,
      totalPages: Math.ceil(users.count / limitNum),
      currentPage: pageNum
    });
  });

  // Toggle user active status (activate/deactivate)
  toggleUserStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể thay đổi trạng thái tài khoản admin' });
    }

    const newStatus = !user.isActive;
    await user.update({ isActive: newStatus });

    emitToAllAdmins('user_status_changed', {
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: newStatus,
      action: newStatus ? 'activated' : 'deactivated',
      timestamp: new Date().toISOString()
    });

    if (!newStatus) {
      emitToUser(user.id, 'account_deactivated', {
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi quản trị viên',
        timestamp: new Date().toISOString()
      });
    }

    // Broadcast to ALL users that this user's status changed
    // So other users can update their chat UI in real-time
    if (global.io) {
      global.io.emit('user_status_updated', {
        userId: user.id,
        isActive: newStatus,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Tài khoản ${newStatus ? 'đã được kích hoạt' : 'đã bị vô hiệu hóa'}`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isActive: newStatus
      }
    });
  });

  // Create new user account
  createUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Tên, email và mật khẩu là bắt buộc' 
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'Email đã tồn tại trong hệ thống' 
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: 'user',
      isActive: true
    });

    // Remove password from response
    const userResponse = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt
    };

    // Emit to all admins
    emitToAllAdmins('user_registered', {
      user: userResponse,
      createdBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Tạo tài khoản người dùng thành công',
      user: userResponse
    });
  });

  // Edit user account
  editUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { 
      name, email, phone, birthDate, gender, avatar, password,
      // Chat settings
      e2eeEnabled, readStatusEnabled, allowMessagesFromNonFriends,
      hidePhone, hideBirthDate
    } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy người dùng' 
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Không thể chỉnh sửa tài khoản admin' 
      });
    }

    // Not allow email change
    try {
      if (typeof email === 'string') {
        const incoming = email.trim().toLowerCase();
        const current = (user.email || '').trim().toLowerCase();
        if (incoming !== '' && incoming !== current) {
          return res.status(400).json({
            success: false,
            message: 'Không được phép thay đổi email'
          });
        }
      }
    } catch {}

    // Validate input only if name/email are provided
    if (name !== undefined && (!name || name.trim() === '')) {
      return res.status(400).json({ 
        success: false,
        message: 'Tên người dùng là bắt buộc' 
      });
    }

    if (email !== undefined && (!email || email.trim() === '')) {
      return res.status(400).json({ 
        success: false,
        message: 'Email là bắt buộc' 
      });
    }

    // Check if email already exists (kept as safety, but will not reach if email changed)
    if (email !== undefined && email !== user.email) {
      const existingUser = await User.findOne({ 
        where: { 
          email,
          id: { [Op.ne]: id }
        } 
      });
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          message: 'Email đã tồn tại trong hệ thống' 
        });
      }
    }

    // Lưu giá trị avatar cũ TRƯỚC khi update
    const oldAvatar = user.avatar;

    // Prepare update data - handle empty strings as null
    const updateData = {};
    
    // Basic info (only if provided)
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone && phone.trim() !== '' ? phone.trim() : null;
    if (birthDate !== undefined) updateData.birthDate = birthDate && birthDate.trim() !== '' ? birthDate : null;
    if (gender !== undefined) updateData.gender = gender || 'unspecified';

    // Chat settings (only if provided)
    if (e2eeEnabled !== undefined) updateData.e2eeEnabled = Boolean(e2eeEnabled);
    if (readStatusEnabled !== undefined) updateData.readStatusEnabled = Boolean(readStatusEnabled);
    if (allowMessagesFromNonFriends !== undefined) updateData.allowMessagesFromNonFriends = Boolean(allowMessagesFromNonFriends);
    if (hidePhone !== undefined) updateData.hidePhone = Boolean(hidePhone);
    if (hideBirthDate !== undefined) updateData.hideBirthDate = Boolean(hideBirthDate);

    // Optional: update password if provided (hashing handled by model hooks)
    if (typeof password === 'string') {
      const newPw = password.trim();
      if (newPw.length > 0) {
        if (newPw.length < 6) {
          return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }
        updateData.password = newPw; // will be hashed in beforeUpdate hook
      }
    }
    let shouldDeleteOldAvatar = false;
    if (typeof avatar === 'string') {
      const newAvatar = avatar.trim() || null;
      updateData.avatar = newAvatar;
      
      // Check xem có cần xóa avatar cũ không
      if (newAvatar !== oldAvatar && oldAvatar && isUploadedFile(oldAvatar)) {
        shouldDeleteOldAvatar = true;
      }
    }

    // Update user with validation error handling
    try {
      await user.update(updateData);
      
      // Xóa avatar cũ SAU khi update thành công
      if (shouldDeleteOldAvatar) {
        deleteOldFileOnUpdate(oldAvatar, updateData.avatar);
      }
    } catch (validationError) {
      if (validationError.name === 'SequelizeValidationError') {
        const errorMessages = validationError.errors.map(err => err.message);
        return res.status(400).json({
          success: false,
          message: `Validation error: ${errorMessages.join(', ')}`
        });
      }
      throw validationError; // Re-throw if not validation error
    }

    // Build response (include password hash for admin detail view)
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      avatar: user.avatar,
      phone: user.phone,
      birthDate: user.birthDate,
      gender: user.gender,
      role: user.role,
      isActive: user.isActive,
      // Chat settings
      e2eeEnabled: user.e2eeEnabled,
      e2eePinHash: user.e2eePinHash,
      readStatusEnabled: user.readStatusEnabled,
      allowMessagesFromNonFriends: user.allowMessagesFromNonFriends,
      hidePhone: user.hidePhone,
      hideBirthDate: user.hideBirthDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Emit to all admins
    emitToAllAdmins('admin_user_updated', {
      user: userResponse,
      updatedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    // Also emit to user if chat settings were changed
    const chatSettingsChanged = 
      e2eeEnabled !== undefined || 
      readStatusEnabled !== undefined || 
      allowMessagesFromNonFriends !== undefined ||
      hidePhone !== undefined ||
      hideBirthDate !== undefined;

    if (chatSettingsChanged && global.io) {
      global.io.to(`user_${user.id}`).emit('user_settings_updated', {
        e2eeEnabled: user.e2eeEnabled,
        readStatusEnabled: user.readStatusEnabled,
        allowMessagesFromNonFriends: user.allowMessagesFromNonFriends,
        hidePhone: user.hidePhone,
        hideBirthDate: user.hideBirthDate,
        updatedBy: 'admin',
        message: 'Cài đặt chat của bạn đã được cập nhật bởi quản trị viên',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Cập nhật thông tin người dùng thành công',
      user: userResponse
    });
  });

  // Permanently delete user account
  deleteUserPermanently = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể xóa tài khoản admin' });
    }

    const userData = { id: user.id, name: user.name, email: user.email };

    // Xóa avatar khi xóa user
    if (user.avatar) {
      deleteUploadedFile(user.avatar);
    }

    await user.destroy();

    emitToAllAdmins('user_deleted_permanently', userData);

    res.json({ message: 'Xóa tài khoản vĩnh viễn thành công', deletedUser: userData });
  });

  // Get user sessions
  getUserSessions = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy người dùng' 
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Không thể xem sessions của tài khoản admin' 
      });
    }

    const sessions = await UserSession.findAll({
      where: { 
        userId,
        isActive: true 
      },
      order: [['lastActivityAt', 'DESC']],
      attributes: [
        'id', 'deviceType', 'deviceName', 'browser', 'os',
        'ipAddress', 'location', 'lastActivityAt', 'createdAt'
      ]
    });

    res.json({
      success: true,
      sessions: sessions.map(s => s.toJSON())
    });
  });

  // Logout user from specific session
  logoutUserSession = asyncHandler(async (req, res) => {
    const { userId, sessionId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy người dùng' 
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Không thể đăng xuất tài khoản admin' 
      });
    }

    const session = await UserSession.findOne({
      where: { id: sessionId, userId }
    });

    if (!session) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy session' 
      });
    }

    // Mark session as inactive
    await session.update({ isActive: false });

    // Emit real-time event to user to force logout on that device
    emitToUser(userId, 'session_terminated', {
      sessionId,
      reason: 'admin_logout',
      message: 'Phiên đăng nhập của bạn đã bị đăng xuất bởi quản trị viên',
      timestamp: new Date().toISOString()
    });

    // Notify all admins
    emitToAllAdmins('user_session_logged_out', {
      userId,
      userName: user.name,
      sessionId,
      deviceInfo: {
        deviceType: session.deviceType,
        deviceName: session.deviceName,
        browser: session.browser
      },
      loggedOutBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Đã đăng xuất thiết bị thành công'
    });
  });

  // Logout user from all sessions
  logoutAllUserSessions = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Không tìm thấy người dùng' 
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Không thể đăng xuất tài khoản admin' 
      });
    }

    // Mark all active sessions as inactive
    const updatedCount = await UserSession.update(
      { isActive: false },
      { 
        where: { 
          userId,
          isActive: true 
        }
      }
    );

    // Emit real-time event to user to force logout on all devices
    emitToUser(userId, 'all_sessions_terminated', {
      reason: 'admin_logout_all',
      message: 'Tất cả phiên đăng nhập của bạn đã bị đăng xuất bởi quản trị viên',
      timestamp: new Date().toISOString()
    });

    // Notify all admins
    emitToAllAdmins('user_all_sessions_logged_out', {
      userId,
      userName: user.name,
      sessionsCount: updatedCount[0] || 0,
      loggedOutBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Đã đăng xuất ${updatedCount[0] || 0} thiết bị thành công`
    });
  });
}

export default AdminUsersChild;
