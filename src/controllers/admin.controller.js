const { User, Note, Message, Group, GroupMember, Friendship, GroupMessage, Notification } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { emitToAllAdmins, isUserOnline, emitToUser } = require('../socket/socketHandler');
// class này đã quá dài hãy tạo ra class con kế thừa để xử lý
class AdminController {
  constructor() {}

  // Admin login
  adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Email không tồn tại' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền truy cập admin' });
    }

    if (!user.isActive) {
      return res.status(400).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    }

    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mật khẩu không đúng' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Đăng nhập admin thành công',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  });

  // Admin: Get notifications of a specific user
  adminGetUserNotifications = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { limit = 50, unreadOnly, collapse } = req.query || {};
    const uid = Number(userId);

    if (!Number.isFinite(uid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    const where = { userId: uid };
    if (String(unreadOnly) === 'true') where.isRead = false;

    const rows = await Notification.findAll({
      where,
      include: [
        { model: User, as: 'fromUser', attributes: ['id', 'name', 'avatar'] },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
      ],
      order: [['updatedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });

    // Apply user's bell dismiss preferences to hide items they chose to dismiss
    try {
      const dismissRows = await Notification.findAll({
        where: { userId: uid, type: 'bell_dismiss' },
        order: [['createdAt', 'DESC']],
        limit: 1000,
      });
      const dismissed = {
        fr: null,
        inv: null,
        dm: new Map(), // otherUserId -> Date
        group: new Map(), // groupId -> Date
      };
      for (const r of dismissRows) {
        const m = r.metadata || {};
        const at = new Date(String(r.createdAt));
        if (m.scope === 'fr') {
          if (!dismissed.fr || at > dismissed.fr) dismissed.fr = at;
        } else if (m.scope === 'inv') {
          if (!dismissed.inv || at > dismissed.inv) dismissed.inv = at;
        } else if (m.scope === 'dm' && typeof m.otherUserId === 'number') {
          const prev = dismissed.dm.get(m.otherUserId);
          if (!prev || at > prev) dismissed.dm.set(m.otherUserId, at);
        } else if (m.scope === 'group' && typeof m.groupId === 'number') {
          const prev = dismissed.group.get(m.groupId);
          if (!prev || at > prev) dismissed.group.set(m.groupId, at);
        }
      }

      // Filter rows based on dismiss map
      const filtered = [];
      for (const n of rows) {
        const ts = new Date(String(n.updatedAt || n.createdAt));
        if (n.type === 'friend_request') {
          if (dismissed.fr && ts <= dismissed.fr) continue;
        } else if (n.type === 'group_invite') {
          if (dismissed.inv && ts <= dismissed.inv) continue;
        } else if (n.type === 'message') {
          const otherId = (n.metadata && typeof n.metadata.otherUserId === 'number') ? n.metadata.otherUserId : (typeof n.fromUserId === 'number' ? n.fromUserId : null);
          if (otherId !== null) {
            const dAt = dismissed.dm.get(otherId);
            if (dAt && ts <= dAt) continue;
          }
        }
        filtered.push(n);
      }
      // Replace rows with filtered for subsequent steps
      rows.splice(0, rows.length, ...filtered);
    } catch (e) {
      // non-blocking dismiss filter error
    }

    // Enrich preview for message notifications (batch fetch by messageId)
    try {
      const msgIds = rows
        .filter((n) => n && n.type === 'message' && n.metadata && Number.isFinite(Number(n.metadata.messageId)))
        .map((n) => Number(n.metadata.messageId));
      if (Array.isArray(msgIds) && msgIds.length > 0) {
        const uniq = Array.from(new Set(msgIds));
        const msgs = await Message.findAll({ where: { id: { [Op.in]: uniq } }, attributes: ['id', 'content', 'messageType'] });
        const map = new Map(msgs.map((m) => [Number(m.id), { content: m.content, messageType: m.messageType }]));
        for (const n of rows) {
          if (n && n.type === 'message' && n.metadata && Number.isFinite(Number(n.metadata.messageId))) {
            const m = map.get(Number(n.metadata.messageId));
            if (m) {
              // Attach a short preview (truncate to 120 chars)
              const content = typeof m.content === 'string' ? m.content : '';
              const preview = content.length > 120 ? content.slice(0, 117) + '...' : content;
              n.metadata = { ...(n.metadata || {}), preview, messageType: m.messageType };
            }
          }
        }
      }
    } catch (e) {
      // non-blocking enrichment error
    }

    // Ensure avatar urls are absolute for admin FE
    const baseUrl = (req && req.protocol && req.get) ? `${req.protocol}://${req.get('host')}` : '';
    const absolutizeAvatar = (obj) => {
      try {
        if (!obj || !obj.avatar) return obj;
        const av = String(obj.avatar);
        const lower = av.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) return obj;
        const needsSlash = !av.startsWith('/');
        obj.avatar = `${baseUrl}${needsSlash ? '/' : ''}${av}`;
      } catch {}
      return obj;
    };

    if (String(collapse) === 'message_by_other') {
      const byOther = new Map();
      const others = [];
      for (const n of rows) {
        if (n.type !== 'message') continue;
        const meta = n.metadata || {};
        const otherId = (typeof meta.otherUserId === 'number' ? meta.otherUserId : n.fromUserId);
        if (typeof otherId !== 'number') continue;
        const ts = new Date(String(n.updatedAt || n.createdAt)).getTime();
        const prev = byOther.get(otherId);
        if (!prev || ts > prev._ts) {
          const plain = n.toJSON();
          plain._ts = ts;
          byOther.set(otherId, plain);
        }
      }
      for (const v of byOther.values()) others.push(v);
      const nonMsg = rows.filter((n) => n.type !== 'message').map((m) => m.toJSON());
      const combined = [...others, ...nonMsg]
        .map((n) => {
          if (n && n.fromUser) n.fromUser = absolutizeAvatar(n.fromUser);
          if (n && n.group) n.group = absolutizeAvatar(n.group);
          return n;
        })
        .sort((a, b) => new Date(String(b.updatedAt || b.createdAt)).getTime() - new Date(String(a.updatedAt || a.createdAt)).getTime());
      return res.json({ success: true, data: combined });
    }

    const data = rows
      .map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r))
      .map((n) => {
        if (n && n.fromUser) n.fromUser = absolutizeAvatar(n.fromUser);
        if (n && n.group) n.group = absolutizeAvatar(n.group);
        return n;
      })
      .sort((a, b) => new Date(String(b.updatedAt || b.createdAt)).getTime() - new Date(String(a.updatedAt || a.createdAt)).getTime());

    return res.json({ success: true, data });
  });

  // Admin: Get Group members with role (owner/admin/member) for monitoring
  adminGetGroupMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const group = await Group.findByPk(groupId, { attributes: ['id', 'name', 'ownerId', 'avatar'] });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const rows = await GroupMember.findAll({
      where: { groupId: Number(groupId) },
      attributes: ['userId', 'role'],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
    });
    const members = rows.map(r => ({
      id: r.user?.id || r.userId,
      name: r.user?.name || `User ${r.userId}`,
      avatar: r.user?.avatar || null,
      role: r.role || (r.userId === group.ownerId ? 'owner' : 'member'),
    }));
    return res.json({ success: true, data: { group: { id: group.id, name: group.name, ownerId: group.ownerId, avatar: group.avatar }, members } });
  });

  // Admin: Get DM messages between two users (for monitoring)
  adminGetDMMessages = asyncHandler(async (req, res) => {
    const { userId, otherUserId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const a = Number(userId);
    const b = Number(otherUserId);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: a, receiverId: b },
          { senderId: b, receiverId: a }
        ],
        // Exclude messages deleted for all (admin still sees user-deleted-for-self)
        isDeletedForAll: { [Op.not]: true }
      },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'avatar'] },
        {
          model: Message,
          as: 'replyToMessage',
          attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    const data = messages.map(m => m.toJSON()).reverse();
    res.json({ success: true, data, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), hasMore: messages.length === parseInt(limit, 10) } });
  });

  // Admin: Get Group messages for a group (for monitoring)
  adminGetGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const gid = Number(groupId);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const messages = await GroupMessage.findAll({
      where: { groupId: gid, isDeletedForAll: { [Op.not]: true } },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        {
          model: GroupMessage,
          as: 'replyToMessage',
          attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    const data = messages.map(m => m.toJSON()).reverse();
    res.json({ success: true, data, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), hasMore: messages.length === parseInt(limit, 10) } });
  });

  // Get all users notes for admin
  getAllUsersNotes = asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20, 
      userId, 
      category, 
      priority, 
      search,
      isArchived = false,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const archivedBool = typeof isArchived === 'string' ? isArchived.toLowerCase() === 'true' : !!isArchived;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = { isArchived: archivedBool };

    // Ensure userId is filtered correctly by casting to number
    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const uid = parseInt(String(userId), 10);
      if (!Number.isNaN(uid)) {
        whereClause.userId = uid;
      }
    }
    if (category) {
      whereClause.category = category;
    }
    if (priority) {
      whereClause.priority = priority;
    }
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows: notes } = await Note.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
      }],
      order: [[sortBy, sortOrder]],
      limit: limitNum,
      offset: offset,
    });

    res.json({
      notes,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  });

  // Create note for user (admin)
  createNoteForUser = asyncHandler(async (req, res) => {
    const { userId, title, content, imageUrl, category, priority, reminderAt } = req.body;

    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const note = await Note.create({
      title,
      content,
      imageUrl: imageUrl || null,
      category,
      priority,
      reminderAt: reminderAt ? new Date(reminderAt) : null,
      reminderSent: false,
      userId,
    });

    const noteWithUser = await Note.findByPk(note.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
      }],
    });

    // Emit to user and all admins
    emitToUser(userId, 'admin_note_created', noteWithUser);
    emitToAllAdmins('note_created_by_admin', noteWithUser);

    res.status(201).json({
      message: 'Tạo ghi chú cho người dùng thành công',
      note: noteWithUser,
    });
  });

  // Update user's note (admin)
  updateUserNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, content, imageUrl, category, priority, isArchived, reminderAt } = req.body;

    const note = await Note.findByPk(id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
      }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    let nextReminderAt = (reminderAt === undefined)
      ? note.reminderAt
      : (reminderAt ? new Date(reminderAt) : null);
    const reminderChanged = reminderAt !== undefined && (
      (nextReminderAt === null && note.reminderAt !== null) ||
      (nextReminderAt !== null && note.reminderAt === null) ||
      (nextReminderAt !== null && note.reminderAt !== null && nextReminderAt.getTime() !== new Date(note.reminderAt).getTime())
    );

    await note.update({
      title: title !== undefined ? title : note.title,
      content: content !== undefined ? content : note.content,
      imageUrl: imageUrl !== undefined ? (imageUrl || null) : note.imageUrl,
      category: category !== undefined ? category : note.category,
      priority: priority !== undefined ? priority : note.priority,
      isArchived: isArchived !== undefined ? isArchived : note.isArchived,
      reminderAt: nextReminderAt,
      reminderSent: reminderChanged ? false : note.reminderSent,
      reminderAcknowledged: reminderChanged ? false : note.reminderAcknowledged,
    });

    const updatedNote = await Note.findByPk(note.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
      }],
    });

    // Emit to user and all admins
    emitToUser(note.user.id, 'admin_note_updated', updatedNote);
    emitToAllAdmins('note_updated_by_admin', updatedNote);

    res.json({
      message: 'Cập nhật ghi chú thành công',
      note: updatedNote,
    });
  });

  // Delete user's note (admin)
  deleteUserNote = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const note = await Note.findByPk(id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
      }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    const userId = note.user.id;
    await note.destroy();

    // Emit to user and all admins
    emitToUser(userId, 'admin_note_deleted', { id: note.id });
    emitToAllAdmins('note_deleted_by_admin', { id: note.id, userId });

    res.json({ message: 'Xóa ghi chú thành công' });
  });

  // Get user activity (messages and groups)
  getUserActivity = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'avatar', 'lastSeenAt']
    });

    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Get recent messages (both sent and received)
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'email', 'avatar']
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: offset,
    });

    // Get user's groups
    const groups = await GroupMember.findAll({
      where: { userId },
      include: [{
        model: Group,
        as: 'group',
        attributes: ['id', 'name', 'avatar', 'createdAt'],
        include: [{
          model: User,
          as: 'owner',
          attributes: ['id', 'name', 'email']
        }]
      }],
      order: [['createdAt', 'DESC']]
    });

    // Get user's friends
    const friendships = await Friendship.findAll({
      where: {
        [Op.or]: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' }
        ]
      },
      include: [
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name', 'email', 'avatar']
        },
        {
          model: User,
          as: 'addressee',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ]
    });

    const uid = parseInt(String(userId), 10);
    res.json({
      user,
      activity: {
        messages,
        groups: groups.map(gm => gm.group),
        friends: friendships.map(f => (f.requesterId === uid ? f.addressee : f.requester))
      }
    });
  });

  // Get all users list for admin
  getAllUsers = asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20, 
      search,
      role,
      isActive,
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
    if (role) {
      whereClause.role = role;
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const users = await User.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'avatar', 'lastSeenAt', 'createdAt'],
      offset,
      limit,
      order: [['createdAt', 'DESC']]
    });

    // Add online status to each user
    const usersWithOnlineStatus = users.rows.map(user => {
      const userObj = user.toJSON();
      userObj.isOnline = isUserOnline(user.id);
      return userObj;
    });

    res.json({
      success: true,
      users: usersWithOnlineStatus,
      totalUsers: users.count,
      totalPages: Math.ceil(users.count / limit),
      currentPage: page
    });
  });

  // Toggle user active status (activate/deactivate)
  toggleUserStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Prevent deactivating admin accounts
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể thay đổi trạng thái tài khoản admin' });
    }

    const newStatus = !user.isActive;
    await user.update({ isActive: newStatus });

    // Emit real-time event to all admins
    emitToAllAdmins('user_status_changed', {
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: newStatus,
      action: newStatus ? 'activated' : 'deactivated',
      timestamp: new Date().toISOString()
    });

    // If user is being deactivated, emit logout event to that specific user
    if (!newStatus) {
      emitToUser(user.id, 'account_deactivated', {
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi quản trị viên',
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

  // Permanently delete user account
  deleteUserPermanently = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Prevent deleting admin accounts
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể xóa tài khoản admin' });
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email
    };

    // Delete user permanently (cascade will handle related data)
    await user.destroy();

    // Emit to all admins for real-time update
    emitToAllAdmins('user_deleted_permanently', userData);

    res.json({
      message: 'Xóa tài khoản vĩnh viễn thành công',
      deletedUser: userData
    });
  });
}

const adminController = new AdminController();

module.exports = {
  AdminController,
  // export bound instance methods so external code uses class-based handlers
  adminLogin: adminController.adminLogin,
  getAllUsersNotes: adminController.getAllUsersNotes,
  createNoteForUser: adminController.createNoteForUser,
  updateUserNote: adminController.updateUserNote,
  deleteUserNote: adminController.deleteUserNote,
  getUserActivity: adminController.getUserActivity,
  getAllUsers: adminController.getAllUsers,
  toggleUserStatus: adminController.toggleUserStatus,
  deleteUserPermanently: adminController.deleteUserPermanently,
  adminGetDMMessages: adminController.adminGetDMMessages,
  adminGetGroupMessages: adminController.adminGetGroupMessages,
  adminGetGroupMembers: adminController.adminGetGroupMembers,
  adminGetUserNotifications: adminController.adminGetUserNotifications,
};
