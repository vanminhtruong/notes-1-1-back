const { Notification, User, Group, GroupMember, GroupMessage } = require('../models');
const { emitToAllAdmins } = require('../socket/socketHandler');
const asyncHandler = require('../middlewares/asyncHandler');

class NotificationController {
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

  bellFeed = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 4 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(50, parseInt(limit))); // Max 50 items per page
    const offset = (pageNum - 1) * limitNum;
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const absolutize = (obj) => {
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

    // Read dismiss preferences encoded as Notification rows (no schema changes needed)
    const dismissRows = await Notification.findAll({
      where: { userId, type: 'bell_dismiss' },
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

    const items = [];

    // Friend requests
    const frRows = await Notification.findAll({
      where: { userId, type: 'friend_request' },
      include: [
        { model: User, as: 'fromUser', attributes: ['id', 'name', 'avatar'] },
      ],
      order: [['updatedAt', 'DESC']],
    });
    if (frRows.length > 0) {
      const latest = frRows[0];
      const latestTs = new Date(String(latest.updatedAt || latest.createdAt));
      if (!dismissed.fr || latestTs > dismissed.fr) {
        items.push({ id: -1001, name: 'Friend requests', avatar: absolutize(latest.fromUser)?.avatar, count: frRows.length, time: latest.updatedAt || latest.createdAt });
      }
    }

    // Group invitations (consistent with FE type 'group_invite')
    const invites = await Notification.findAll({
      where: { userId, type: 'group_invite' },
      include: [ { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] } ],
      order: [['updatedAt', 'DESC']],
    });
    if (invites.length > 0) {
      const latest = invites[0];
      const single = invites.length === 1;
      const g = latest.group ? absolutize(latest.group) : null;
      const latestTs = new Date(String(latest.updatedAt || latest.createdAt));
      if (!dismissed.inv || latestTs > dismissed.inv) {
        items.push({ id: -1002, name: single ? (g?.name || 'Group invitations') : 'Group invitations', avatar: g?.avatar, count: invites.length, time: latest.updatedAt || latest.createdAt });
      }
    }

    // Direct messages: collapse latest per other user
    const dmRows = await Notification.findAll({
      where: { userId, type: 'message' },
      include: [ { model: User, as: 'fromUser', attributes: ['id', 'name', 'avatar'] } ],
      order: [['updatedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: 1000,
    });
    const dmByOther = new Map();
    for (const n of dmRows) {
      const meta = n.metadata || {};
      const otherId = (typeof meta.otherUserId === 'number' ? meta.otherUserId : n.fromUserId);
      if (typeof otherId !== 'number') continue;
      const ts = new Date(String(n.updatedAt || n.createdAt)).getTime();
      const prev = dmByOther.get(otherId);
      if (!prev || ts > prev._ts) {
        dmByOther.set(otherId, { _ts: ts, row: n });
      }
    }
    for (const [otherId, v] of dmByOther.entries()) {
      const n = v.row;
      const dAt = dismissed.dm.get(otherId);
      if (dAt && new Date(String(n.updatedAt || n.createdAt)).getTime() <= dAt.getTime()) continue;
      const u = n.fromUser ? absolutize(n.fromUser) : null;
      items.push({ id: otherId, name: u?.name || `User ${otherId}`, avatar: u?.avatar, count: 0, time: n.updatedAt || n.createdAt });
    }

    // Group messages: derive from membership and latest GroupMessage time
    const memberships = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length > 0) {
      const groups = await Group.findAll({ where: { id: groupIds }, attributes: ['id', 'name', 'avatar'] });
      for (const g of groups) {
        let lastMessageAt = null;
        try {
          const recent = await GroupMessage.findAll({ where: { groupId: g.id }, attributes: ['id', 'createdAt', 'deletedForUserIds'], order: [['createdAt', 'DESC']], limit: 10 });
          for (const m of recent) {
            let del = m.deletedForUserIds;
            if (typeof del === 'string') { try { del = JSON.parse(del); } catch { del = null; } }
            if (Array.isArray(del) && del.includes(userId)) continue;
            lastMessageAt = m.createdAt; break;
          }
        } catch {}
        if (lastMessageAt) {
          const dAt = dismissed.group.get(g.id);
          if (!dAt || new Date(String(lastMessageAt)).getTime() > dAt.getTime()) {
            const gg = absolutize(g.toJSON ? g.toJSON() : g);
            items.push({ id: -300000 - g.id, name: gg.name || `Group ${g.id}`, avatar: gg.avatar, count: 0, time: lastMessageAt });
          }
        }
      }
    }

    items.sort((a, b) => new Date(String(b.time)).getTime() - new Date(String(a.time)).getTime());
    
    // Apply pagination
    const totalItems = items.length;
    const paginatedItems = items.slice(offset, offset + limitNum);
    const totalPages = Math.ceil(totalItems / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;
    
    res.json({ 
      success: true, 
      data: {
        items: paginatedItems,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems,
          itemsPerPage: limitNum,
          hasNextPage,
          hasPrevPage
        }
      }
    });
  });

  deleteBellItem = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    let { scope, id } = req.body || {};
    scope = String(scope || '').trim();
    if (!['dm', 'group', 'fr', 'inv'].includes(scope)) {
      return res.status(400).json({ success: false, error: 'Invalid scope' });
    }

    const meta = { scope };
    try {
      if (scope === 'dm') {
        if (!Number.isFinite(Number(id))) return res.status(400).json({ success: false, error: 'Missing otherUserId' });
        meta.otherUserId = Number(id);
        // Optional: clear existing message notifications from this other user
        await Notification.destroy({ where: { userId, type: 'message', fromUserId: meta.otherUserId } });
      } else if (scope === 'group') {
        if (!Number.isFinite(Number(id))) return res.status(400).json({ success: false, error: 'Missing groupId' });
        meta.groupId = Number(id);
        // We derive group items from messages; no destructive delete needed.
      } else if (scope === 'fr') {
        // Clear friend_request rows for this user
        await Notification.destroy({ where: { userId, type: 'friend_request' } });
      } else if (scope === 'inv') {
        // Clear group_invite rows for this user
        await Notification.destroy({ where: { userId, type: 'group_invite' } });
      }
    } catch {}

    const notification = await Notification.create({ userId, type: 'bell_dismiss', metadata: meta, isRead: true });
    return res.json({ success: true, data: { id: notification.id } });
  });

  // Badge counter for the bell (DM + Group + Friend Requests + Group Invites)
  bellBadge = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { Op } = require('sequelize');
    try {
      // Direct messages: count unread Notification rows
      const dmCount = await Notification.count({ where: { userId, type: 'message', isRead: false } });

      // Friend requests and group invites
      const frCount = await Notification.count({ where: { userId, type: 'friend_request', isRead: false } });
      const invCount = await Notification.count({ where: { userId, type: 'group_invite', isRead: false } });

      // Group messages unread: derive by checking GroupMessageRead
      const memberships = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
      const groupIds = memberships.map((m) => m.groupId);
      let groupUnread = 0;
      if (groupIds.length > 0) {
        // For each group, count messages not read by this user
        for (const gid of groupIds) {
          const rows = await GroupMessage.findAll({
            where: {
              groupId: gid,
              senderId: { [Op.ne]: userId },
              messageType: { [Op.ne]: 'system' },
              [Op.or]: [
                { isDeletedForAll: { [Op.not]: true } },
                { isDeletedForAll: null },
              ],
            },
            attributes: ['id', 'deletedForUserIds'],
            include: [
              {
                model: require('../models').GroupMessageRead,
                as: 'GroupMessageReads',
                attributes: ['userId'],
                required: false,
              }
            ],
            order: [['createdAt', 'DESC']],
            limit: 500,
          });
          const filtered = rows
            .map(r => (typeof r.toJSON === 'function' ? r.toJSON() : r))
            .filter(m => {
              // Exclude messages I've deleted for me
              let del = m.deletedForUserIds;
              if (typeof del === 'string') {
                try { del = JSON.parse(del); } catch { del = null; }
              }
              if (Array.isArray(del) && del.includes(userId)) return false;
              // Count as unread if there is NO read record by me
              const reads = Array.isArray(m.GroupMessageReads) ? m.GroupMessageReads : [];
              const hasMyRead = reads.some((gr) => Number(gr.userId) === Number(userId));
              return !hasMyRead;
            });
          groupUnread += filtered.length;
        }
      }

      const total = Number(dmCount || 0) + Number(groupUnread || 0) + Number(frCount || 0) + Number(invCount || 0);
      return res.json({ success: true, data: { total, dm: dmCount, group: groupUnread, fr: frCount, inv: invCount } });
    } catch (e) {
      return res.json({ success: true, data: { total: 0, dm: 0, group: 0, fr: 0, inv: 0 } });
    }
  });
}

module.exports = new NotificationController();
