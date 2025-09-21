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
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
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
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
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
        // Exclude messages deleted for all
        isDeletedForAll: { [Op.not]: true },
        // Exclude messages deleted by either user for themselves (SQLite compatible)
        [Op.and]: [
          {
            [Op.or]: [
              { deletedForUserIds: { [Op.is]: null } },
              { deletedForUserIds: { [Op.notLike]: `%${a}%` } }
            ]
          },
          {
            [Op.or]: [
              { deletedForUserIds: { [Op.is]: null } },
              { deletedForUserIds: { [Op.notLike]: `%${b}%` } }
            ]
          }
        ]
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

  // Admin: Recall a DM message for a user
  adminRecallDMMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    console.log('🔄 Backend: Admin RECALL DM message:', messageId);
    const message = await Message.findByPk(messageId);
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Update message content to indicate it was recalled (skip model hooks to avoid duplicate events)
    await message.update({
      content: 'Tin nhắn đã được thu hồi bởi admin',
      messageType: 'recalled',
      isRecalled: true,
      isDeletedForAll: true
    }, { hooks: false });
    console.log('🔄 Backend: Message marked as recalled, emitting message_recalled_by_admin');

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.senderId}`).emit('message_recalled_by_admin', {
        messageId: message.id,
        content: message.content,
        messageType: 'recalled'
      });
      io.to(`user_${message.receiverId}`).emit('message_recalled_by_admin', {
        messageId: message.id,
        content: message.content,
        messageType: 'recalled'
      });
      console.log('🔄 Backend: Emitted message_recalled_by_admin to users', message.senderId, message.receiverId);
    }

    // Also emit admin event manually since we skipped hooks
    const io2 = req.app.get('io');
    if (io2) {
      // Use the same emitToAdmins function from models/index.js
      const emitToAdmins = async (event, data) => {
        try {
          if (!global.io) return;
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of admins) {
            global.io.to(`admin_${admin.id}`).emit(event, data);
          }
        } catch (e) {
          console.error('emitToAdmins error:', e?.message || e);
        }
      };
      await emitToAdmins('admin_dm_recalled_all', { messageIds: [message.id], senderId: message.senderId, receiverId: message.receiverId });
    }

    res.json({ success: true, message: 'Message recalled successfully' });
  });

  // Admin: Delete a DM message for a user
  adminDeleteDMMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { targetUserId } = req.query;
    console.log('🗑️ Backend: Admin DELETE DM message:', messageId, 'targetUserId:', targetUserId);
    const message = await Message.findByPk(messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const io = req.app.get('io');

    // If targetUserId is provided, delete for that user only
    if (targetUserId) {
      const tuid = parseInt(String(targetUserId), 10);
      if (![message.senderId, message.receiverId].includes(tuid)) {
        return res.status(400).json({ success: false, message: 'targetUserId must be the sender or receiver of the message' });
      }

      // Update deletedForUserIds for that specific user (allow hooks to emit admin_dm_deleted_for_user)
      const deletedForUserIds = Array.isArray(message.get('deletedForUserIds')) ? [...message.get('deletedForUserIds')] : [];
      if (!deletedForUserIds.includes(tuid)) {
        deletedForUserIds.push(tuid);
      }
      await message.update({ deletedForUserIds }, { hooks: true });

      // Emit only to that user so only their side removes the message in UI
      if (io) {
        io.to(`user_${tuid}`).emit('message_deleted_by_admin', { messageId: message.id });
        console.log('🗑️ Backend: Emitted message_deleted_by_admin to user', tuid);
      }

      return res.json({ success: true, message: 'Message deleted for user successfully' });
    }

    // Otherwise delete for all (skip hooks to avoid duplicate events and emit manually)
    await message.update({ isDeletedForAll: true }, { hooks: false });
    console.log('🗑️ Backend: Message marked as deleted for all, emitting message_deleted_by_admin');

    if (io) {
      io.to(`user_${message.senderId}`).emit('message_deleted_by_admin', { messageId: message.id });
      io.to(`user_${message.receiverId}`).emit('message_deleted_by_admin', { messageId: message.id });
      console.log('🗑️ Backend: Emitted message_deleted_by_admin to users', message.senderId, message.receiverId);
    }

    // Also emit admin event manually since we skipped hooks
    const io2 = req.app.get('io');
    if (io2) {
      // Use the same emitToAdmins function from models/index.js
      const emitToAdmins = async (event, data) => {
        try {
          if (!global.io) return;
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of admins) {
            global.io.to(`admin_${admin.id}`).emit(event, data);
          }
        } catch (e) {
          console.error('emitToAdmins error:', e?.message || e);
        }
      };
      await emitToAdmins('admin_dm_deleted_all', { messageIds: [message.id], senderId: message.senderId, receiverId: message.receiverId });
    }

    res.json({ success: true, message: 'Message deleted for all successfully' });
  });

  // Admin: Recall a Group message for a user
  adminRecallGroupMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const message = await GroupMessage.findByPk(messageId, {
      include: [{ model: Group, as: 'group', attributes: ['id'] }]
    });
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Update message content to indicate it was recalled (skip hooks to avoid duplicate events)
    await message.update({
      content: 'Tin nhắn đã được thu hồi bởi admin',
      messageType: 'recalled',
      isRecalled: true,
      isDeletedForAll: true
    }, { hooks: false });

    // Emit socket event for real-time update to group members
    const io = req.app.get('io');
    if (io && message.group) {
      io.to(`group_${message.group.id}`).emit('group_message_recalled_by_admin', {
        messageId: message.id,
        groupId: message.group.id,
        content: message.content,
        messageType: 'recalled'
      });
    }

    res.json({ success: true, message: 'Group message recalled successfully' });
  });

  // Admin: Delete a Group message for a user
  adminDeleteGroupMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const message = await GroupMessage.findByPk(messageId, {
      include: [{ model: Group, as: 'group', attributes: ['id'] }]
    });
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Mark message as deleted for all (skip hooks to avoid duplicate events)
    await message.update({ isDeletedForAll: true }, { hooks: false });

    // Emit socket event for real-time update to group members
    const io = req.app.get('io');
    if (io && message.group) {
      io.to(`group_${message.group.id}`).emit('group_message_deleted_by_admin', {
        messageId: message.id,
        groupId: message.group.id
      });
    }

    res.json({ success: true, message: 'Group message deleted successfully' });
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

    // Get recent messages (both sent and received, excluding user-deleted ones)
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: userId },
          { receiverId: userId }
        ],
        // Exclude messages deleted for all
        isDeletedForAll: { [Op.not]: true },
        // Exclude messages deleted by the user for themselves (SQLite compatible)
        [Op.or]: [
          { deletedForUserIds: { [Op.is]: null } },
          { deletedForUserIds: { [Op.notLike]: `%${parseInt(userId)}%` } }
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
      const wantActive = isActive === 'true';
      whereClause.isActive = wantActive;
      // If requesting only active accounts, require specific sub-permission unless super admin
      try {
        const me = req.user;
        const isSuper = me && me.adminLevel === 'super_admin';
        const perms = Array.isArray(me?.adminPermissions) ? me.adminPermissions : [];
        if (wantActive && !isSuper) {
          const hasSpecific = perms.includes('manage_users.view_active_accounts');
          const hasParent = perms.includes('manage_users');
          // If user does not have specific sub-permission nor parent manage_users (explicit), deny
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

  // API để refresh token với permissions mới (cho real-time updates)
  refreshToken = asyncHandler(async (req, res) => {
    const user = req.user; // Từ adminAuth middleware

    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Làm mới token thành công',
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
      }
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
  adminRecallDMMessage: adminController.adminRecallDMMessage,
  adminDeleteDMMessage: adminController.adminDeleteDMMessage,
  adminRecallGroupMessage: adminController.adminRecallGroupMessage,
  adminDeleteGroupMessage: adminController.adminDeleteGroupMessage,
  refreshToken: adminController.refreshToken,
};
