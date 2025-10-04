import { Notification, User, Group } from '../../models/index.js';
import { emitToAllAdmins } from '../../socket/socketHandler.js';
import asyncHandler from '../../middlewares/asyncHandler.js';

class NotificationCoreChild {
  constructor(parent) {
    this.parent = parent;
  }

  listMyNotifications = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 50, unreadOnly, collapse } = req.query || {};

    const where = { userId };
    if (String(unreadOnly) === 'true') where.isRead = false;

    const rows = await Notification.findAll({
      where,
      include: [
        { model: User, as: 'fromUser', attributes: ['id', 'name', 'avatar'] },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
      ],
      // Show the most recently updated (or created) notifications first
      order: [['updatedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit),
    });

    // Backfill missing associations (in case include didn't resolve due to legacy data or alias issues)
    const missingUserIds = new Set();
    const missingGroupIds = new Set();
    for (const n of rows) {
      if (!n.fromUser && typeof n.fromUserId === 'number') missingUserIds.add(n.fromUserId);
      if (!n.group && typeof n.groupId === 'number') missingGroupIds.add(n.groupId);
    }
    let userMap = new Map();
    let groupMap = new Map();
    if (missingUserIds.size > 0) {
      const us = await User.findAll({ where: { id: Array.from(missingUserIds) }, attributes: ['id', 'name', 'avatar'] });
      userMap = new Map(us.map((u) => [u.id, u]));
    }
    if (missingGroupIds.size > 0) {
      const gs = await Group.findAll({ where: { id: Array.from(missingGroupIds) }, attributes: ['id', 'name', 'avatar'] });
      groupMap = new Map(gs.map((g) => [g.id, g]));
    }

    // Helper to normalize avatar URLs to absolute paths (so frontend can render regardless of its origin)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
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

    // Optional collapsing strategy for message notifications: keep latest per otherUserId
    if (String(collapse) === 'message_by_other') {
      const byOther = new Map();
      const others = [];
      for (const n of rows) {
        if (n.type !== 'message') continue;
        const meta = n.metadata || {};
        const otherId = (typeof meta.otherUserId === 'number' ? meta.otherUserId : n.fromUserId);
        if (typeof otherId !== 'number') continue;
        const key = otherId;
        const ts = new Date(String(n.updatedAt || n.createdAt)).getTime();
        const prev = byOther.get(key);
        if (!prev || ts > prev._ts) {
          const plain = n.toJSON();
          plain._ts = ts;
          byOther.set(key, plain);
        }
      }
      for (const v of byOther.values()) others.push(v);
      // Include non-message notifications as-is
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

    // Ensure strict ordering by latest update for non-collapsed path as well
    const data = rows
      .map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r))
      .map((n) => {
        if (n && n.fromUser) n.fromUser = absolutizeAvatar(n.fromUser);
        if (n && n.group) n.group = absolutizeAvatar(n.group);
        return n;
      });
    data.sort((a, b) => new Date(String(b.updatedAt || b.createdAt)).getTime() - new Date(String(a.updatedAt || a.createdAt)).getTime());
    res.json({ success: true, data });
  });

  markAllRead = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [count] = await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
    try {
      // Thông báo cho tất cả admin để reload realtime tab Notifications của user này
      emitToAllAdmins && emitToAllAdmins('admin_notifications_marked_all_read', { userId });
    } catch (e) { /* noop */ }
    res.json({ success: true, data: { updated: Array.isArray(count) ? count[0] : count } });
  });
}

export default NotificationCoreChild;
