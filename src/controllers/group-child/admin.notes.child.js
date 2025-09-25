const { User, Note, Message, Group, GroupMember, Notification } = require('../../models');
const asyncHandler = require('../../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { emitToAllAdmins, emitToUser } = require('../../socket/socketHandler');

// Child controller to manage admin notifications and notes endpoints
// Attached to AdminController instance in its constructor to keep API unchanged
class AdminNotesChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Admin: Get notifications of a specific user
  adminGetUserNotifications = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { limit = 50, unreadOnly, collapse } = req.query || {};
    const uid = Number(userId);

    if (!Number.isFinite(uid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Loại bỏ các bản ghi nội bộ dùng để lưu trạng thái ẩn/không hiển thị ở bell feed (bell_dismiss)
    // Những bản ghi này không phải là thông báo hiển thị cho admin
    const where = { userId: uid, type: { [Op.ne]: 'bell_dismiss' } };
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
        dm: new Map(),
        group: new Map(),
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
      rows.splice(0, rows.length, ...filtered);
    } catch (e) {}

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
              const content = typeof m.content === 'string' ? m.content : '';
              const preview = content.length > 120 ? content.slice(0, 117) + '...' : content;
              n.metadata = { ...(n.metadata || {}), preview, messageType: m.messageType };
            }
          }
        }
      }
    } catch (e) {}

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

  // Admin: Delete a specific notification of a user (must be outside of adminGetUserNotifications)
  adminDeleteUserNotification = asyncHandler(async (req, res) => {
    const { userId, notificationId } = req.params;
    const uid = Number(userId);
    const nid = Number(notificationId);
    if (!Number.isFinite(uid) || !Number.isFinite(nid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId or notificationId' });
    }

    const notif = await Notification.findOne({ where: { id: nid, userId: uid } });
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notif.destroy();

    try {
      emitToUser(uid, 'notification_deleted_by_admin', { id: nid });
      emitToAllAdmins('admin_notification_deleted', { userId: uid, notificationId: nid });
    } catch {}

    return res.json({ success: true, message: 'Notification deleted successfully' });
  });

  // Admin: Delete ALL notifications of a user (excluding internal bell_dismiss records)
  adminDeleteAllUserNotifications = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const uid = Number(userId);
    if (!Number.isFinite(uid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Do not delete internal bell_dismiss rows
    const { Op } = require('sequelize');
    const where = { userId: uid, type: { [Op.ne]: 'bell_dismiss' } };
    const deleted = await Notification.destroy({ where });

    try {
      // Notify the affected user and all admins to refresh in realtime
      emitToUser(uid, 'notifications_cleared_by_admin', { userId: uid, deleted });
      emitToAllAdmins('admin_notifications_cleared', { userId: uid, deleted });
    } catch {}

    return res.json({ success: true, message: 'All notifications cleared', data: { deleted } });
  });

  // Get all users notes for admin
  getAllUsersNotes = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, userId, category, priority, search, isArchived = false, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const archivedBool = typeof isArchived === 'string' ? isArchived.toLowerCase() === 'true' : !!isArchived;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = { isArchived: archivedBool };

    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const uid = parseInt(String(userId), 10);
      if (!Number.isNaN(uid)) {
        whereClause.userId = uid;
      }
    }
    if (category) whereClause.category = category;
    if (priority) whereClause.priority = priority;
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows: notes } = await Note.findAndCountAll({
      where: whereClause,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
      order: [[sortBy, sortOrder]],
      limit: limitNum,
      offset,
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
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

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
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
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
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

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
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    const userId = note.user.id;
    await note.destroy();

    emitToUser(userId, 'admin_note_deleted', { id: note.id });
    emitToAllAdmins('note_deleted_by_admin', { id: note.id, userId });

    res.json({ message: 'Xóa ghi chú thành công' });
  });
}

module.exports = AdminNotesChild;
