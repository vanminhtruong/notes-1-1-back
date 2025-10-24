import asyncHandler from '../../middlewares/asyncHandler.js';
import { User } from '../../models/index.js';
import { emitToAllAdmins } from '../../socket/socketHandler.js';
import { deleteOldFileOnUpdate, isUploadedFile } from '../../utils/fileHelper.js';

// Child controller: quản lý hồ sơ Admin (kế thừa qua composition từ AdminController)
class AdminProfileChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Lấy thông tin hồ sơ của admin hiện tại
  getMyProfile = asyncHandler(async (req, res) => {
    // Permission check: super admin bypass; others need profile.self.view
    if (req.user?.adminLevel !== 'super_admin') {
      const perms = req.user?.adminPermissions || [];
      if (!perms.includes('profile.self.view')) {
        return res.status(403).json({ message: 'Bạn không có quyền xem hồ sơ' });
      }
    }
    const me = await User.findByPk(req.user.id, {
      attributes: [
        'id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'isActive',
        'theme', 'language', 'rememberLogin', 'hidePhone', 'hideBirthDate',
        'allowMessagesFromNonFriends', 'role', 'adminLevel', 'adminPermissions', 'lastSeenAt', 'createdAt'
      ]
    });

    if (!me || me.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền truy cập hồ sơ admin' });
    }

    res.json({ success: true, admin: me });
  });

  // Cập nhật hồ sơ admin (không cho phép sửa email, role, adminLevel)
  updateMyProfile = asyncHandler(async (req, res) => {
    // Permission check: super admin bypass; others need profile.self.edit
    if (req.user?.adminLevel !== 'super_admin') {
      const perms = req.user?.adminPermissions || [];
      if (!perms.includes('profile.self.edit')) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa hồ sơ' });
      }
    }
    const me = await User.findByPk(req.user.id);
    if (!me || me.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền cập nhật hồ sơ admin' });
    }

    const {
      name,
      avatar,
      phone,
      birthDate,
      gender,
      theme,
      language,
      rememberLogin,
      hidePhone,
      hideBirthDate,
      allowMessagesFromNonFriends,
    } = req.body || {};

    // Khóa các trường không được phép
    if (typeof req.body?.email !== 'undefined' || typeof req.body?.role !== 'undefined' || typeof req.body?.adminLevel !== 'undefined') {
      return res.status(400).json({ message: 'Không thể cập nhật email/role/adminLevel' });
    }

    // Validate cơ bản
    const allowedGenders = ['male', 'female', 'other', 'unspecified'];
    if (gender && !allowedGenders.includes(gender)) {
      return res.status(400).json({ message: 'Giới tính không hợp lệ' });
    }
    if (theme && !['light', 'dark'].includes(theme)) {
      return res.status(400).json({ message: 'Theme không hợp lệ' });
    }

    // Lưu giá trị avatar cũ TRƯỚC khi update
    const oldAvatar = me.avatar;
    let shouldDeleteOldAvatar = false;

    const patch = {};
    if (typeof name !== 'undefined') patch.name = String(name).slice(0, 50);
    if (typeof avatar !== 'undefined') {
      const newAvatar = String(avatar);
      patch.avatar = newAvatar;
      
      // Check xem có cần xóa avatar cũ không
      if (newAvatar !== oldAvatar && oldAvatar && isUploadedFile(oldAvatar)) {
        shouldDeleteOldAvatar = true;
      }
    }
    if (typeof phone !== 'undefined') patch.phone = phone;
    if (typeof birthDate !== 'undefined') patch.birthDate = birthDate;
    if (typeof gender !== 'undefined') patch.gender = gender;
    if (typeof theme !== 'undefined') patch.theme = theme;
    if (typeof language !== 'undefined') patch.language = language;
    if (typeof rememberLogin !== 'undefined') patch.rememberLogin = !!rememberLogin;
    if (typeof hidePhone !== 'undefined') patch.hidePhone = !!hidePhone;
    if (typeof hideBirthDate !== 'undefined') patch.hideBirthDate = !!hideBirthDate;
    if (typeof allowMessagesFromNonFriends !== 'undefined') patch.allowMessagesFromNonFriends = !!allowMessagesFromNonFriends;

    await me.update(patch);

    // Xóa avatar cũ SAU khi update thành công
    if (shouldDeleteOldAvatar) {
      deleteOldFileOnUpdate(oldAvatar, patch.avatar);
    }

    const sanitized = await User.findByPk(me.id, {
      attributes: [
        'id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'isActive',
        'theme', 'language', 'rememberLogin', 'hidePhone', 'hideBirthDate',
        'allowMessagesFromNonFriends', 'role', 'adminLevel', 'adminPermissions', 'lastSeenAt', 'createdAt'
      ]
    });

    // Emit real-time tới chính admin để đồng bộ UI khác tab
    try {
      emitToUser(me.id, 'admin_profile_updated', { admin: sanitized });
    } catch {}

    res.json({ success: true, message: 'Cập nhật hồ sơ thành công', admin: sanitized });
  });

  // Upload avatar image for admin
  uploadAvatar = asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const publicUrl = `/uploads/${req.file.filename}`; // Served by express.static('public')
    return res.status(201).json({ 
      success: true, 
      data: { url: publicUrl, filename: req.file.filename } 
    });
  });

  // Lấy thông tin hồ sơ của admin khác (Super Admin only)
  getAdminProfile = asyncHandler(async (req, res) => {
    const { adminId } = req.params;
    
    // Chỉ super admin mới được xem profile admin khác
    if (req.user.adminLevel !== 'super_admin') {
      return res.status(403).json({ message: 'Chỉ Super Admin mới có thể xem hồ sơ admin khác' });
    }

    const admin = await User.findByPk(adminId, {
      attributes: [
        'id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'isActive',
        'theme', 'language', 'rememberLogin', 'hidePhone', 'hideBirthDate',
        'allowMessagesFromNonFriends', 'role', 'adminLevel', 'adminPermissions', 'lastSeenAt', 'createdAt'
      ]
    });

    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Admin không tồn tại' });
    }

    res.json({ success: true, admin });
  });

  // Đổi mật khẩu admin (Super Admin only - cho admin khác)
  changeAdminPassword = asyncHandler(async (req, res) => {
    const { adminId } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Chỉ super admin mới được đổi mật khẩu admin khác
    if (req.user.adminLevel !== 'super_admin') {
      return res.status(403).json({ message: 'Chỉ Super Admin mới có thể đổi mật khẩu admin khác' });
    }

    const admin = await User.findByPk(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Admin không tồn tại' });
    }

    // Không cho phép đổi mật khẩu super admin khác
    if (admin.adminLevel === 'super_admin') {
      return res.status(403).json({ message: 'Không thể đổi mật khẩu Super Admin khác' });
    }

    // Validate
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    // Verify current password
    const isPasswordValid = await admin.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });
    }

    // Check if new password is same as current
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  });

  // Cập nhật hồ sơ admin khác (Super Admin only)
  updateAdminProfile = asyncHandler(async (req, res) => {
    const { adminId } = req.params;
    
    // Chỉ super admin mới được sửa profile admin khác
    if (req.user.adminLevel !== 'super_admin') {
      return res.status(403).json({ message: 'Chỉ Super Admin mới có thể sửa hồ sơ admin khác' });
    }

    const admin = await User.findByPk(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ message: 'Admin không tồn tại' });
    }

    // Không cho phép sửa super admin khác
    if (admin.adminLevel === 'super_admin') {
      return res.status(403).json({ message: 'Không thể sửa hồ sơ Super Admin khác' });
    }

    const {
      name,
      avatar,
      phone,
      birthDate,
      gender,
      theme,
      language,
      rememberLogin,
      hidePhone,
      hideBirthDate,
      allowMessagesFromNonFriends,
    } = req.body || {};

    // Khóa các trường không được phép
    if (typeof req.body?.email !== 'undefined' || typeof req.body?.role !== 'undefined' || typeof req.body?.adminLevel !== 'undefined') {
      return res.status(400).json({ message: 'Không thể cập nhật email/role/adminLevel' });
    }

    // Validate cơ bản
    const allowedGenders = ['male', 'female', 'other', 'unspecified'];
    if (gender && !allowedGenders.includes(gender)) {
      return res.status(400).json({ message: 'Giới tính không hợp lệ' });
    }
    if (theme && !['light', 'dark'].includes(theme)) {
      return res.status(400).json({ message: 'Theme không hợp lệ' });
    }

    // Lưu giá trị avatar cũ TRƯỚC khi update
    const oldAvatar = admin.avatar;
    let shouldDeleteOldAvatar = false;

    const patch = {};
    if (typeof name !== 'undefined') patch.name = String(name).slice(0, 50);
    if (typeof avatar !== 'undefined') {
      const newAvatar = String(avatar);
      patch.avatar = newAvatar;
      
      // Check xem có cần xóa avatar cũ không
      if (newAvatar !== oldAvatar && oldAvatar && isUploadedFile(oldAvatar)) {
        shouldDeleteOldAvatar = true;
      }
    }
    if (typeof phone !== 'undefined') patch.phone = phone;
    if (typeof birthDate !== 'undefined') patch.birthDate = birthDate;
    if (typeof gender !== 'undefined') patch.gender = gender;
    if (typeof theme !== 'undefined') patch.theme = theme;
    if (typeof language !== 'undefined') patch.language = language;
    if (typeof rememberLogin !== 'undefined') patch.rememberLogin = !!rememberLogin;
    if (typeof hidePhone !== 'undefined') patch.hidePhone = !!hidePhone;
    if (typeof hideBirthDate !== 'undefined') patch.hideBirthDate = !!hideBirthDate;
    if (typeof allowMessagesFromNonFriends !== 'undefined') patch.allowMessagesFromNonFriends = !!allowMessagesFromNonFriends;

    await admin.update(patch);

    // Xóa avatar cũ SAU khi update thành công
    if (shouldDeleteOldAvatar) {
      deleteOldFileOnUpdate(oldAvatar, patch.avatar);
    }

    const sanitized = await User.findByPk(admin.id, {
      attributes: [
        'id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'isActive',
        'theme', 'language', 'rememberLogin', 'hidePhone', 'hideBirthDate',
        'allowMessagesFromNonFriends', 'role', 'adminLevel', 'adminPermissions', 'lastSeenAt', 'createdAt'
      ]
    });

    // Emit real-time tới chính admin để đồng bộ UI 
    try {
      emitToUser(admin.id, 'admin_profile_updated', { admin: sanitized });
    } catch {}

    res.json({ success: true, message: 'Cập nhật hồ sơ admin thành công', admin: sanitized });
  });
}

export default AdminProfileChild;
