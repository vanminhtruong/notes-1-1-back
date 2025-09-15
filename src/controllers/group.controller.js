const { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction, Notification } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isBlockedBetween, getBlockedUserIdSetFor } = require('../utils/block');
class GroupController {
  constructor() {}
  // Map instance methods to existing handlers
  getGroupMemberIds = async (groupId) => {
    console.log(`[getGroupMemberIds] Querying for groupId: ${groupId} (type: ${typeof groupId})`);
    const members = await GroupMember.findAll({ 
      where: { groupId: Number(groupId) }, 
      attributes: ['id', 'userId', 'groupId', 'role'] 
    });
    console.log(`[getGroupMemberIds] Found members:`, members.map(m => ({ id: m.id, userId: m.userId, groupId: m.groupId, role: m.role })));
    console.log(`[getGroupMemberIds] Returning userIds:`, members.map(m => m.userId));
    return members.map(m => m.userId);
  };

  listUserGroups = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const uid = Number(userId);

    // Collect group IDs where target user is a member
    const memberships = await GroupMember.findAll({ where: { userId: uid }, attributes: ['groupId'] });
    const groupIds = memberships.map(m => m.groupId);
    if (groupIds.length === 0) return res.json({ success: true, data: [] });

    const groups = await Group.findAll({ where: { id: { [Op.in]: groupIds } }, order: [['updatedAt', 'DESC']] });

    // Determine pinned groups for current user (for consistent shape)
    const pinnedGroups = await PinnedChat.findAll({ where: { userId: currentUserId, pinnedGroupId: { [Op.not]: null } } });
    const pinnedGroupIds = new Set(pinnedGroups.map(p => p.pinnedGroupId));

    const data = [];
    for (const g of groups) {
      const memberIds = await this.getGroupMemberIds(g.id);
      data.push({ id: g.id, name: g.name, ownerId: g.ownerId, avatar: g.avatar, background: g.background, adminsOnly: !!g.adminsOnly, members: memberIds, isPinned: pinnedGroupIds.has(g.id) });
    }

    // Sort pinned first, then updatedAt
    data.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aGroup = groups.find(gr => gr.id === a.id);
      const bGroup = groups.find(gr => gr.id === b.id);
      return new Date(bGroup.updatedAt) - new Date(aGroup.updatedAt);
    });

    res.json({ success: true, data });
  });

  listCommonGroups = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const uid = Number(userId);

    // Get memberships for both users
    const [mine, theirs] = await Promise.all([
      GroupMember.findAll({ where: { userId: currentUserId }, attributes: ['groupId'] }),
      GroupMember.findAll({ where: { userId: uid }, attributes: ['groupId'] }),
    ]);
    const mySet = new Set(mine.map(m => m.groupId));
    const commonIds = Array.from(new Set(theirs.map(t => t.groupId))).filter(id => mySet.has(id));
    if (commonIds.length === 0) return res.json({ success: true, data: [] });

    const groups = await Group.findAll({ where: { id: { [Op.in]: commonIds } }, order: [['updatedAt', 'DESC']] });

    // Pinned status for current user
    const pinnedGroups = await PinnedChat.findAll({ where: { userId: currentUserId, pinnedGroupId: { [Op.not]: null } } });
    const pinnedGroupIds = new Set(pinnedGroups.map(p => p.pinnedGroupId));

    const data = [];
    for (const g of groups) {
      const memberIds = await this.getGroupMemberIds(g.id);
      data.push({ id: g.id, name: g.name, ownerId: g.ownerId, avatar: g.avatar, background: g.background, members: memberIds, isPinned: pinnedGroupIds.has(g.id) });
    }

    data.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aGroup = groups.find(gr => gr.id === a.id);
      const bGroup = groups.find(gr => gr.id === b.id);
      return new Date(bGroup.updatedAt) - new Date(aGroup.updatedAt);
    });

    res.json({ success: true, data });
  });

  createGroup = asyncHandler(async (req, res) => {
    const { name, memberIds = [], avatar, background, adminsOnly = false } = req.body;
    const ownerId = req.user.id;

    const uniqueMemberIds = Array.from(new Set(memberIds.filter(id => id && id !== ownerId)));

    const group = await Group.create({ name, ownerId, avatar, background, adminsOnly: !!adminsOnly });
    await GroupMember.create({ groupId: group.id, userId: ownerId, role: 'owner' });
    for (const uid of uniqueMemberIds) {
      await GroupMember.create({ groupId: group.id, userId: uid, role: 'member' });
    }

    const payload = { id: group.id, name: group.name, ownerId, avatar: group.avatar, background: group.background, adminsOnly: !!group.adminsOnly, members: [ownerId, ...uniqueMemberIds] };
    const io = req.app.get('io') || global.io;
    if (io) {
      for (const uid of payload.members) {
        io.to(`user_${uid}`).emit('group_created', payload);
      }
    }

    res.status(201).json({ success: true, data: payload });
  });

  listMyGroups = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const memberships = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
    const groupIds = memberships.map(m => m.groupId);
    const groups = await Group.findAll({ where: { id: { [Op.in]: groupIds } }, order: [['updatedAt', 'DESC']] });

    // Get pinned groups for current user
    const pinnedGroups = await PinnedChat.findAll({
      where: { userId, pinnedGroupId: { [Op.not]: null } }
    });
    const pinnedGroupIds = new Set(pinnedGroups.map(p => p.pinnedGroupId));

    const data = [];
    for (const g of groups) {
      const memberIds = await this.getGroupMemberIds(g.id);
      // Determine my role in this group for convenience on the client
      const myMembership = await GroupMember.findOne({ where: { groupId: g.id, userId }, attributes: ['role'] });
      // Compute unread count per user using GroupMessageRead (per-user tracking)
      let unreadCount = 0;
      try {
        const rows = await GroupMessage.findAll({
          where: {
            groupId: g.id,
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
              model: GroupMessageRead,
              as: 'GroupMessageReads',
              attributes: ['userId'],
              required: false,
              where: { userId }
            }
          ]
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
            const hasMyRead = Array.isArray(m.GroupMessageReads) && m.GroupMessageReads.some((gr) => Number(gr.userId) === Number(userId));
            return !hasMyRead;
          });
        unreadCount = filtered.length;
      } catch (e) {
        unreadCount = 0;
      }
      // Determine latest visible message time for current user (exclude system messages, and messages deleted-for-me)
      let lastMessageAt = null;
      try {
        const recent = await GroupMessage.findAll({
          where: { groupId: g.id, messageType: { [Op.ne]: 'system' } },
          attributes: ['id', 'createdAt', 'deletedForUserIds'],
          order: [['createdAt', 'DESC']],
          limit: 20,
        });
        for (const m of recent) {
          let del = m.deletedForUserIds;
          if (typeof del === 'string') {
            try { del = JSON.parse(del); } catch { del = null; }
          }
          if (Array.isArray(del) && del.includes(userId)) {
            continue;
          }
          lastMessageAt = m.createdAt;
          break;
        }
      } catch (e) {
        lastMessageAt = null;
      }

      data.push({ 
        id: g.id, 
        name: g.name, 
        ownerId: g.ownerId, 
        avatar: g.avatar, 
        background: g.background, 
        adminsOnly: !!g.adminsOnly,
        members: memberIds,
        isPinned: pinnedGroupIds.has(g.id),
        myRole: myMembership?.role || (g.ownerId === userId ? 'owner' : 'member'),
        unreadCount,
        lastMessageAt
      });
    }

    // Sort by pin status first, then by updatedAt
    data.sort((a, b) => {
      // Pinned groups always come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      // Within same pin status, sort by updatedAt (most recent first)
      const aGroup = groups.find(g => g.id === a.id);
      const bGroup = groups.find(g => g.id === b.id);
      return new Date(bGroup.updatedAt) - new Date(aGroup.updatedAt);
    });

    res.json({ success: true, data });
  });

  deleteGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Ensure requester is owner
    const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!ownerMembership || ownerMembership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can delete group' });
    }

    // Collect members for notification before deletion
    const members = await this.getGroupMemberIds(groupId);

    // Remove messages and memberships, then the group
    await GroupMessage.destroy({ where: { groupId } });
    await GroupMember.destroy({ where: { groupId } });
    await Group.destroy({ where: { id: groupId } });

    const io = req.app.get('io');
    if (io && Array.isArray(members)) {
      const payload = { groupId: Number(groupId) };
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_deleted', payload);
      }
    }

    res.json({ success: true, data: { groupId: Number(groupId) } });
  });
  getGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;

    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    const offset = (page - 1) * limit;
    const messages = await GroupMessage.findAll({
      where: { groupId },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        { 
          model: GroupMessageRead, 
          as: 'GroupMessageReads',
          required: false,
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
        },
        { 
          model: MessageReaction, 
          as: 'Reactions', 
          attributes: ['userId', 'type', 'count'],
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
        },
        {
          model: GroupMessage,
          as: 'replyToMessage',
          attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const filtered = messages
      .map(m => m.toJSON())
      .filter(m => !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(userId)))
      .reverse();

    // Mark messages as read (always set isRead=true regardless of read status preferences)
    const toMarkRead = filtered.filter(m => m.senderId !== userId && !m.isRead);
    
    if (toMarkRead.length > 0) {
      // Always mark messages as read for unread count purposes
      for (const message of toMarkRead) {
        // Set isRead flag
        await GroupMessage.update(
          { isRead: true },
          { where: { id: message.id } }
        );
        
        // Only create read receipts if BOTH users have read status enabled
        const currentUser = await User.findByPk(userId);
        const senderUser = await User.findByPk(message.senderId);
        
        if (currentUser && senderUser && currentUser.readStatusEnabled && senderUser.readStatusEnabled) {
          // Create GroupMessageRead record for read receipts with retry
          let readRecord;
          let retries = 3;
          while (retries > 0) {
            try {
              [readRecord] = await GroupMessageRead.findOrCreate({
                where: { messageId: message.id, userId },
                defaults: { messageId: message.id, userId, readAt: new Date() }
              });
              break;
            } catch (error) {
              retries--;
              if (error.name === 'SequelizeTimeoutError' && error.original?.code === 'SQLITE_BUSY' && retries > 0) {
                console.log(`Database busy in getGroupMessages, retrying... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 100 * (3 - retries)));
              } else {
                console.error('Error creating GroupMessageRead in getGroupMessages:', error);
                break;
              }
            }
          }

          // Notify sender and other group members about read receipt via socket
          const io = req.app.get('io');
          if (io) {
            const members = await this.getGroupMemberIds(groupId);
            const userInfo = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
            for (const memberId of members) {
              if (memberId !== userId) {
                io.to(`user_${memberId}`).emit('group_message_read', {
                  messageId: message.id,
                  groupId: Number(groupId),
                  userId,
                  readAt: readRecord.readAt,
                  user: userInfo
                });
              }
            }
          }
        }
      }
    }

    res.json({ success: true, data: filtered, pagination: { page: parseInt(page), limit: parseInt(limit), hasMore: filtered.length === parseInt(limit) } });
  });

  searchGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { q, limit = 20 } = req.query || {};

    if (!q || String(q).trim().length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Verify membership
    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    const like = { [Op.like]: `%${q}%` };
    const rows = await GroupMessage.findAll({
      where: { groupId, content: like, isDeletedForAll: { [Op.not]: true } },
      attributes: ['id', 'groupId', 'senderId', 'content', 'messageType', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
    });

    const filtered = rows
      .map(r => r.toJSON())
      .filter(m => !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(userId)));

    return res.json({ success: true, data: filtered });
  });

  sendGroupMessage = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const senderId = req.user.id;
    const { content, messageType = 'text', replyToMessageId } = req.body;

    const membership = await GroupMember.findOne({ where: { groupId, userId: senderId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    // Enforce adminsOnly setting: only owner/admin can send when enabled
    const grp = await Group.findByPk(groupId);
    if (grp && grp.adminsOnly === true) {
      const role = membership.role || 'member';
      if (role !== 'owner' && role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only admins can send messages in this group' });
      }
    }

    // Validate replyToMessageId if provided
    let replyToMessage = null;
    if (replyToMessageId) {
      replyToMessage = await GroupMessage.findOne({
        where: {
          id: replyToMessageId,
          groupId: groupId
        }
      });
      
      if (!replyToMessage) {
        return res.status(404).json({
          success: false,
          message: 'Reply target message not found'
        });
      }
    }

    const msg = await GroupMessage.create({ 
      groupId, 
      senderId, 
      content, 
      messageType, 
      status: 'sent',
      replyToMessageId: replyToMessageId || null 
    });
    const messageWithData = await GroupMessage.findByPk(msg.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        {
          model: GroupMessage,
          as: 'replyToMessage',
          attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
        }
      ]
    });

    const io = req.app.get('io');
    if (io) {
      const members = await this.getGroupMemberIds(groupId);
      const replyPayload = messageWithData.replyToMessage
        ? {
            id: messageWithData.replyToMessage.id,
            content: messageWithData.replyToMessage.content,
            messageType: messageWithData.replyToMessage.messageType,
            senderId: messageWithData.replyToMessage.senderId,
            createdAt: messageWithData.replyToMessage.createdAt,
            sender: messageWithData.replyToMessage.sender
              ? {
                  id: messageWithData.replyToMessage.sender.id,
                  name: messageWithData.replyToMessage.sender.name,
                  avatar: messageWithData.replyToMessage.sender.avatar,
                }
              : undefined,
          }
        : null;
      const payload = {
        id: messageWithData.id,
        groupId: Number(groupId),
        senderId,
        content: messageWithData.content,
        messageType: messageWithData.messageType,
        createdAt: messageWithData.createdAt,
        senderName: messageWithData.sender.name,
        senderAvatar: messageWithData.sender.avatar,
        status: 'delivered',
        // Reply fields for real-time rendering
        replyToMessageId: messageWithData.replyToMessageId || null,
        replyToMessage: replyPayload,
      };
      
      // Check which members are online to update status
      const { isUserOnline } = require('../socket/socketHandler');
      let hasOnlineMembers = false;
      
      for (const uid of members) {
        if (uid !== senderId) {
          io.to(`user_${uid}`).emit('group_message', payload);
          if (isUserOnline(uid)) {
            hasOnlineMembers = true;
          }
        }
      }

      // Also emit to sender to ensure real-time append on their client
      io.to(`user_${senderId}`).emit('group_message', payload);
      
      // Update message status to delivered if any member is online
      if (hasOnlineMembers) {
        await GroupMessage.update({ status: 'delivered' }, { where: { id: msg.id } });
        io.to(`user_${senderId}`).emit('group_message_delivered', {
          messageId: msg.id,
          groupId: Number(groupId),
          status: 'delivered'
        });
      }
    }

    res.status(201).json({ success: true, data: messageWithData });
  });

  reactGroupMessage = asyncHandler(async (req, res) => {
    const { groupId, messageId } = req.params;
    const userId = req.user.id;
    const { type } = req.body || {};

    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a group member' });

    const msg = await GroupMessage.findOne({ where: { id: messageId, groupId } });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    // If same type already exists, increment count
    const existingSame = await MessageReaction.findOne({ where: { userId, groupMessageId: messageId, type } });
    if (existingSame) {
      await existingSame.increment('count', { by: 1 });
      await existingSame.update({ reactedAt: new Date() });
    } else {
      // If already 3, delete the current 3rd slot (keep first two)
      let removedType = null;
      const list = await MessageReaction.findAll({ where: { userId, groupMessageId: messageId }, order: [['reactedAt', 'ASC']] });
      if (list.length >= 3) {
        try { removedType = list[2].type; await list[2].destroy(); } catch {}
      }
      await MessageReaction.findOrCreate({
        where: { userId, groupMessageId: messageId, type },
        defaults: { userId, groupMessageId: messageId, type, count: 1 }
      });
      // Emit unreact for removedType if any
      try {
        if (removedType) {
          const io = req.app.get('io') || global.io;
          if (io) {
            const members = await this.getGroupMemberIds(groupId);
            const payloadUn = { groupId: Number(groupId), messageId: Number(messageId), userId, type: removedType };
            for (const uid of members) io.to(`user_${uid}`).emit('group_message_unreacted', payloadUn);
          }
        }
      } catch {}
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      const members = await this.getGroupMemberIds(groupId);
      const current = await MessageReaction.findOne({ where: { userId, groupMessageId: messageId, type } });
      const userInfo = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
      const payload = { groupId: Number(groupId), messageId: Number(messageId), userId, type, count: current?.count ?? 1, user: userInfo };
      for (const uid of members) io.to(`user_${uid}`).emit('group_message_reacted', payload);
    }

    return res.json({ success: true, data: { groupId: Number(groupId), messageId: Number(messageId), type } });
  });

  unreactGroupMessage = asyncHandler(async (req, res) => {
    const { groupId, messageId } = req.params;
    const userId = req.user.id;
    const { type } = req.query || {};
    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a group member' });

    const where = { userId, groupMessageId: messageId };
    if (type) where.type = type;
    await MessageReaction.destroy({ where });

    const io = req.app.get('io') || global.io;
    if (io) {
      const members = await this.getGroupMemberIds(groupId);
      const payload = { groupId: Number(groupId), messageId: Number(messageId), userId, ...(type ? { type } : {}) };
      for (const uid of members) io.to(`user_${uid}`).emit('group_message_unreacted', payload);
    }

    return res.json({ success: true, data: { groupId: Number(groupId), messageId: Number(messageId), ...(type ? { type } : {}) } });
  });

  inviteMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    // Sanitize and normalize memberIds to integers
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    const normalizedIds = Array.from(new Set(
      memberIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ));
    const userId = req.user.id;
    
    console.log(`[InviteMembers] Starting invite process:`, { groupId, userId, normalizedIds });

    // Ensure group exists
    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const gm = await GroupMember.findOne({ where: { groupId, userId } });
    if (!gm || gm.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can invite members' });
    }

    const currentIds = await this.getGroupMemberIds(groupId);
    console.log(`[InviteMembers] Current group members:`, currentIds);
    const uniqueTargets = normalizedIds.filter((id) => id && id !== userId && !currentIds.includes(id));
    console.log(`[InviteMembers] Unique targets after filtering:`, uniqueTargets);

    const added = [];
    const pending = [];
    const pendingInvites = [];
    const blocked = [];

    for (const uid of uniqueTargets) {
      console.log(`[InviteMembers] Processing user ${uid}`);
      // Skip if blocked between inviter and invitee
      if (await isBlockedBetween(userId, uid)) {
        console.log(`[InviteMembers] Skipping user ${uid} due to block`);
        blocked.push(uid);
        continue;
      }
      // Skip if somehow already a member (double-check to avoid race)
      const exists = await GroupMember.findOne({ where: { groupId: Number(groupId), userId: Number(uid) } });
      console.log(`[InviteMembers] Double-check membership for user ${uid}:`, exists ? 'EXISTS' : 'NOT_EXISTS');
      if (exists) {
        console.log(`[InviteMembers] User ${uid} already exists in group, skipping`);
        continue;
      }

      // Check friendship accepted between inviter (owner) and invitee
      const friendship = await Friendship.findOne({
        where: {
          status: 'accepted',
          [Op.or]: [
            { requesterId: userId, addresseeId: uid },
            { requesterId: uid, addresseeId: userId },
          ],
        },
      });

      console.log(`[InviteMembers] User ${uid} - friendship check:`, friendship ? 'FRIENDS' : 'NOT_FRIENDS');

      if (friendship) {
        // Already friends - add directly to group, no invite needed
        try {
          console.log(`[InviteMembers] Attempting GroupMember.create with:`, { groupId: Number(groupId), userId: Number(uid), role: 'member' });
          await GroupMember.create({ groupId: Number(groupId), userId: Number(uid), role: 'member' });
          // Clean up any pending invite for this user in this group if exists
          await GroupInvite.destroy({ where: { groupId, inviteeId: uid, status: 'pending' } });
          added.push(uid);
          console.log(`[InviteMembers] User ${uid} added directly to group (friends)`);
          continue;
        } catch (err) {
          // Gracefully handle unique or race conditions
          console.log(`[InviteMembers] Error adding friend ${uid} to group:`, {
            name: err.name,
            message: err.message,
            errors: err.errors?.map(e => ({ field: e.path, message: e.message, type: e.type })),
            sql: err.sql
          });
          if (err && (err.name === 'SequelizeUniqueConstraintError' || err.name === 'SequelizeForeignKeyConstraintError' || err.name === 'SequelizeValidationError')) {
            // Clean up pending invite if any
            await GroupInvite.destroy({ where: { groupId, inviteeId: uid, status: 'pending' } });
            continue;
          }
          continue;
        }
      }

      // Not friends - create or update pending invite
      console.log(`[InviteMembers] User ${uid} not friends, creating invite`);
      let invite = await GroupInvite.findOne({ where: { groupId, inviteeId: uid } });
      
      try {
        if (!invite) {
          // Create new invite
          invite = await GroupInvite.create({ 
            groupId, 
            inviteeId: uid, 
            inviterId: userId, 
            status: 'pending' 
          });
          console.log(`[InviteMembers] Created new invite for user ${uid}`);
        } else if (invite.status !== 'pending') {
          // Reset existing invite to pending if it was declined/accepted before
          invite.status = 'pending';
          invite.inviterId = userId; // Update inviter in case different
          await invite.save();
          console.log(`[InviteMembers] Reset existing invite for user ${uid}`);
        } else {
          console.log(`[InviteMembers] Using existing pending invite for user ${uid}`);
        }
      } catch (err) {
        // Skip invalid user IDs or constraint issues without failing the whole request
        console.log(`[InviteMembers] Error creating invite for user ${uid}:`, err.name);
        if (err && (err.name === 'SequelizeUniqueConstraintError' || err.name === 'SequelizeForeignKeyConstraintError' || err.name === 'SequelizeValidationError')) {
          continue;
        }
        continue;
      }
      
      // Always add to pending list if status is now pending
      if (invite && invite.status === 'pending') {
        pending.push(uid);
        pendingInvites.push({ inviteId: invite.id, inviteeId: uid });
      }
    }

    console.log(`[InviteMembers] Final results:`, { added, pending, pendingInvites });

    const io = req.app.get('io');
    if (io) {
      if (pending.length) {
        // Prepare inviter and group info for richer payload
        let inviterInfo = null;
        try { inviterInfo = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar', 'email'] }); } catch {}
        const groupInfo = group ? { id: group.id, name: group.name, avatar: group.avatar } : null;
        // Notify each invitee with their specific invite ID
        for (const item of pendingInvites) {
          const { inviteId, inviteeId, createdAt } = item;
          const payload = {
            groupId: Number(groupId),
            inviteId,
            inviterId: userId,
            inviter: inviterInfo ? { id: inviterInfo.id, name: inviterInfo.name, avatar: inviterInfo.avatar, email: inviterInfo.email } : undefined,
            group: groupInfo || undefined,
            createdAt: createdAt || new Date()
          };
          io.to(`user_${inviteeId}`).emit('group_invited', payload);
          // Persist notification for the invitee
          try {
            await Notification.create({
              userId: inviteeId,
              type: 'group_invite',
              fromUserId: userId,
              groupId: Number(groupId),
              metadata: { inviteId },
              isRead: false,
              createdAt: payload.createdAt,
            });
          } catch (e) {}
        }
      }
      if (added.length) {
        const payload = { groupId: Number(groupId), added };
        // Notify newly added users
        for (const uid of added) {
          io.to(`user_${uid}`).emit('group_members_added', payload);
        }
        // Notify existing members
        for (const uid of currentIds) {
          io.to(`user_${uid}`).emit('group_members_added', payload);
        }

        // Persist and broadcast a system message for each newly added user so it survives refresh
        try {
          const membersNow = await this.getGroupMemberIds(groupId);
          if (Array.isArray(membersNow) && membersNow.length > 0) {
            const users = await User.findAll({ where: { id: { [Op.in]: added } }, attributes: ['id', 'name', 'avatar'] });
            for (const u of users) {
              const sysContent = `${u.name || 'A member'} joined the group`;
              const sysMsg = await GroupMessage.create({ groupId, senderId: u.id, content: sysContent, messageType: 'system', status: 'sent' });
              const messageWithData = await GroupMessage.findByPk(sysMsg.id, {
                include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
              });
              const msgPayload = {
                id: messageWithData.id,
                groupId: Number(groupId),
                senderId: u.id,
                content: messageWithData.content,
                messageType: messageWithData.messageType,
                createdAt: messageWithData.createdAt,
                senderName: messageWithData.sender?.name,
                senderAvatar: messageWithData.sender?.avatar,
                status: 'delivered'
              };
              for (const mId of membersNow) {
                io.to(`user_${mId}`).emit('group_message', msgPayload);
              }
            }
          }
        } catch (e) {
          // ignore persistence errors for system join messages
        }
      }
    }

    res.json({ success: true, data: { groupId: Number(groupId), added, pending, pendingInvites, blocked } });
  });

  removeMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { memberIds = [] } = req.body;
    const userId = req.user.id;

    const owner = await GroupMember.findOne({ where: { groupId, userId } });
    if (!owner || owner.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can remove members' });
    }
  
    const currentIds = await this.getGroupMemberIds(groupId);
    const toRemove = Array.from(new Set(memberIds.filter(id => id && currentIds.includes(id) && id !== userId)));

    if (toRemove.length === 0) {
      return res.json({ success: true, data: { groupId: Number(groupId), removed: [] } });
    }

    await GroupMember.destroy({ where: { groupId, userId: { [Op.in]: toRemove } } });

    // If owner removed everyone (except maybe themselves), handle empty group
    const remaining = await this.getGroupMemberIds(groupId);
    if (remaining.length === 0) {
      await GroupMessage.destroy({ where: { groupId } });
      await Group.destroy({ where: { id: groupId } });
    }

    const io = req.app.get('io');
    if (io) {
      const payload = { groupId: Number(groupId), removed: toRemove };
      // Notify removed users
      for (const uid of toRemove) {
        io.to(`user_${uid}`).emit('group_member_removed', payload);
      }
      // Notify remaining users
      for (const uid of remaining) {
        io.to(`user_${uid}`).emit('group_members_removed', payload);
      }
    }

    res.json({ success: true, data: { groupId: Number(groupId), removed: toRemove } });
  });

  leaveGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    const gm = await GroupMember.findOne({ where: { groupId, userId } });
    if (!gm) {
      return res.status(404).json({ success: false, message: 'Not in group' });
    }

    await gm.destroy();

    const remaining = await this.getGroupMemberIds(groupId);

    // If owner left, handle ownership transfer or delete group if empty
    const group = await Group.findByPk(groupId);
    if (group && group.ownerId === userId) {
      if (remaining.length === 0) {
        await Group.destroy({ where: { id: groupId } });
      } else {
        // Promote first remaining member to admin (not persisted as role change here for brevity)
        await Group.update({ ownerId: remaining[0] }, { where: { id: groupId } });
        await GroupMember.update({ role: 'owner' }, { where: { groupId, userId: remaining[0] } });
      }
    }

    const io = req.app.get('io');
    if (io) {
      const payload = { groupId: Number(groupId), userId };
      for (const uid of remaining) {
        io.to(`user_${uid}`).emit('group_member_left', payload);
      }
      io.to(`user_${userId}`).emit('group_left', payload);

      // Persist and broadcast a system message for remaining members (so it survives refresh)
      try {
        // Only create if group still exists and there are remaining members
        if (remaining.length > 0) {
          const leaver = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
          const sysContent = `${leaver?.name || 'A member'} left the group`;
          const sysMsg = await GroupMessage.create({ groupId, senderId: userId, content: sysContent, messageType: 'system', status: 'sent' });
          const messageWithData = await GroupMessage.findByPk(sysMsg.id, {
            include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
          });
          const msgPayload = {
            id: messageWithData.id,
            groupId: Number(groupId),
            senderId: userId,
            content: messageWithData.content,
            messageType: messageWithData.messageType,
            createdAt: messageWithData.createdAt,
            senderName: messageWithData.sender?.name,
            senderAvatar: messageWithData.sender?.avatar,
            status: 'delivered'
          };
          for (const uid of remaining) {
            io.to(`user_${uid}`).emit('group_message', msgPayload);
          }
        }
      } catch (e) {
        // silent fail for system message persistence
      }
    }

    res.json({ success: true, data: { groupId: Number(groupId), userId } });
  });

  listMyInvites = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const invites = await GroupInvite.findAll({
      where: { inviteeId: userId, status: 'pending' },
      include: [
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar', 'background', 'ownerId'] },
        { model: User, as: 'inviter', attributes: ['id', 'name', 'email', 'avatar'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    // Filter out invites where inviter is blocked-with current user
    const blockedSet = await getBlockedUserIdSetFor(userId);
    const filtered = invites.filter(inv => inv.inviter && !blockedSet.has(inv.inviter.id));

    // Absolutize avatar URLs to be robust for frontend origin
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const absolutize = (obj) => {
      if (!obj || !obj.avatar) return obj;
      try {
        const av = String(obj.avatar);
        const lower = av.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) return obj;
        const needsSlash = !av.startsWith('/');
        obj.avatar = `${baseUrl}${needsSlash ? '/' : ''}${av}`;
      } catch {}
      return obj;
    };

    const data = filtered.map((row) => {
      const r = typeof row.toJSON === 'function' ? row.toJSON() : row;
      if (r.group) r.group = absolutize(r.group);
      if (r.inviter) r.inviter = absolutize(r.inviter);
      return r;
    });

    res.json({ success: true, data });
  });

  acceptGroupInvite = asyncHandler(async (req, res) => {
    const { groupId, inviteId } = req.params;
    const userId = req.user.id;

    // Validate invite
    const invite = await GroupInvite.findOne({ where: { id: inviteId, groupId, inviteeId: userId, status: 'pending' } });
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite not found or already processed' });
    }

    // Prevent accepting invite if blocked between inviter and invitee
    if (await isBlockedBetween(userId, invite.inviterId)) {
      return res.status(403).json({ success: false, message: 'Cannot accept group invite due to block' });
    }

    // Add member if not already a member
    const existing = await GroupMember.findOne({ where: { groupId, userId } });
    if (!existing) {
      await GroupMember.create({ groupId, userId, role: 'member' });
    }

    // Mark invite accepted
    invite.status = 'accepted';
    await invite.save();

    // Mark persisted notification as read for this invite
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            userId: userId,
            type: 'group_invite',
            groupId: Number(groupId),
            isRead: false,
          }
        }
      );
    } catch (e) {}

    const memberIds = await this.getGroupMemberIds(groupId);
    const io = req.app.get('io');
    if (io) {
      const payload = { groupId: Number(groupId), added: [userId] };
      for (const uid of memberIds) {
        io.to(`user_${uid}`).emit('group_members_added', payload);
      }

      // Persist and broadcast a system message for the new member so it survives refresh
      try {
        const u = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
        const sysContent = `${u?.name || 'A member'} joined the group`;
        const sysMsg = await GroupMessage.create({ groupId, senderId: userId, content: sysContent, messageType: 'system', status: 'sent' });
        const messageWithData = await GroupMessage.findByPk(sysMsg.id, {
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
        });
        const msgPayload = {
          id: messageWithData.id,
          groupId: Number(groupId),
          senderId: userId,
          content: messageWithData.content,
          messageType: messageWithData.messageType,
          createdAt: messageWithData.createdAt,
          senderName: messageWithData.sender?.name,
          senderAvatar: messageWithData.sender?.avatar,
          status: 'delivered'
        };
        for (const uid of memberIds) {
          io.to(`user_${uid}`).emit('group_message', msgPayload);
        }
      } catch (e) {
        // ignore persistence errors for system join messages
      }
    }

    res.json({ success: true, data: { groupId: Number(groupId), userId } });
  });

  declineGroupInvite = asyncHandler(async (req, res) => {
    const { groupId, inviteId } = req.params;
    const userId = req.user.id;

    const invite = await GroupInvite.findOne({ where: { id: inviteId, groupId, inviteeId: userId, status: 'pending' } });
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite not found or already processed' });
    }

    invite.status = 'declined';
    await invite.save();

    // Mark persisted notification as read for this invite
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            userId: userId,
            type: 'group_invite',
            groupId: Number(groupId),
            isRead: false,
          }
        }
      );
    } catch (e) {}

    res.json({ success: true, data: { groupId: Number(groupId), inviteId: Number(inviteId), status: 'declined' } });
  });

  updateGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { name, avatar, background, adminsOnly } = req.body;

    const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!ownerMembership || ownerMembership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can update group' });
    }

    const fieldsToUpdate = {};
    if (typeof name !== 'undefined') fieldsToUpdate.name = name;
    if (typeof avatar !== 'undefined') fieldsToUpdate.avatar = avatar;
    if (typeof background !== 'undefined') fieldsToUpdate.background = background;
    if (typeof adminsOnly !== 'undefined') fieldsToUpdate.adminsOnly = !!adminsOnly;

    await Group.update(fieldsToUpdate, { where: { id: groupId } });
    const updated = await Group.findByPk(groupId);
    const members = await this.getGroupMemberIds(groupId);

    const data = { id: updated.id, name: updated.name, ownerId: updated.ownerId, avatar: updated.avatar, background: updated.background, adminsOnly: !!updated.adminsOnly, members };

    const io = req.app.get('io') || global.io;
    if (io) {
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_updated', data);
      }
    }

    res.json({ success: true, data });
  });

  markGroupMessagesRead = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Verify user is group member
    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    // Get candidate messages in this group (sent by others), excluding system and globally-deleted
    // We will ensure GroupMessageRead exists per message for current user (if missing)
    const candidates = await GroupMessage.findAll({
      where: { 
        groupId,
        senderId: { [Op.ne]: userId },
        messageType: { [Op.ne]: 'system' },
        [Op.or]: [
          { isDeletedForAll: { [Op.not]: true } },
          { isDeletedForAll: null },
        ],
      },
      attributes: ['id','senderId']
    });

    const toMarkRead = [];
    const readReceiptsToCreate = [];

    for (const message of candidates) {
      // Skip if read record already exists for this user
      const alreadyRead = await GroupMessageRead.findOne({ where: { messageId: message.id, userId } });
      if (alreadyRead) {
        continue;
      }
      // Always mark as read for unread tracking purposes (legacy flag)
      await GroupMessage.update(
        { isRead: true },
        { where: { id: message.id } }
      );
      toMarkRead.push(message);

      // Always create GroupMessageRead for current user (per-user unread tracking),
      // but only EMIT read receipts if both parties have readStatusEnabled
      let readRecord;
      let retries = 3;
      while (retries > 0) {
        try {
          [readRecord] = await GroupMessageRead.findOrCreate({
            where: { messageId: message.id, userId },
            defaults: { messageId: message.id, userId, readAt: new Date() }
          });
          break;
        } catch (error) {
          retries--;
          if (error.name === 'SequelizeTimeoutError' && error.original?.code === 'SQLITE_BUSY' && retries > 0) {
            console.log(`Database busy in markGroupMessagesRead, retrying... (${3 - retries}/3)`);
            await new Promise(resolve => setTimeout(resolve, 100 * (3 - retries)));
          } else {
            console.error('Error creating GroupMessageRead:', error);
            break;
          }
        }
      }
      // Queue for socket emit if receipts enabled
      const currentUser = await User.findByPk(userId);
      const senderUser = await User.findByPk(message.senderId);
      if (readRecord && currentUser && senderUser && currentUser.readStatusEnabled && senderUser.readStatusEnabled) {
        readReceiptsToCreate.push({ message, readRecord });
      }
    }

    // Send read receipts via socket
    if (readReceiptsToCreate.length > 0) {
      const io = req.app.get('io');
      if (io) {
        const members = await this.getGroupMemberIds(groupId);
        const userInfo = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
        
        for (const { message, readRecord } of readReceiptsToCreate) {
          for (const memberId of members) {
            if (memberId !== userId) {
              io.to(`user_${memberId}`).emit('group_message_read', {
                messageId: message.id,
                groupId: Number(groupId),
                userId,
                readAt: readRecord.readAt,
                user: userInfo
              });
            }
          }
        }
      }
    }

    res.json({ 
      success: true, 
      data: { 
        groupId: Number(groupId), 
        markedCount: toMarkRead.length,
        readReceiptsCount: readReceiptsToCreate.length
      } 
    });
  });

  togglePinGroup = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId } = req.params;
    const { pinned } = req.body;

    // Ensure user is a member of the group
    const membership = await GroupMember.findOne({
      where: { groupId, userId: currentUserId }
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You can only pin groups you are a member of'
      });
    }

    if (pinned) {
      // Pin the group
      const [pinnedGroup, created] = await PinnedChat.findOrCreate({
        where: { userId: currentUserId, pinnedGroupId: groupId },
        defaults: { userId: currentUserId, pinnedGroupId: groupId }
      });
      
      return res.json({
        success: true,
        message: created ? 'Group pinned' : 'Group already pinned',
        data: { pinned: true }
      });
    } else {
      // Unpin the group
      const deleted = await PinnedChat.destroy({
        where: { userId: currentUserId, pinnedGroupId: groupId }
      });
      
      return res.json({
        success: true,
        message: deleted > 0 ? 'Group unpinned' : 'Group was not pinned',
        data: { pinned: false }
      });
    }
  });

  getGroupPinStatus = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId } = req.params;

    const pinnedGroup = await PinnedChat.findOne({
      where: { userId: currentUserId, pinnedGroupId: groupId }
    });

    return res.json({
      success: true,
      data: { pinned: !!pinnedGroup }
    });
  });

  // Update a member's role (owner only)
  updateMemberRole = asyncHandler(async (req, res) => {
    const { groupId, memberId } = req.params;
    const { role } = req.body; // 'admin' | 'member'
    const actorId = req.user.id;

    // Only owner can change roles
    const actorMembership = await GroupMember.findOne({ where: { groupId, userId: actorId } });
    if (!actorMembership || actorMembership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can update member roles' });
    }

    // Target must be a member
    const target = await GroupMember.findOne({ where: { groupId, userId: memberId } });
    if (!target) return res.status(404).json({ success: false, message: 'Target user is not a group member' });

    // Cannot change owner via this endpoint
    if (target.role === 'owner') {
      return res.status(400).json({ success: false, message: 'Cannot change owner role' });
    }

    // Apply role change
    await GroupMember.update({ role }, { where: { id: target.id } });

    // Notify all members
    const io = req.app.get('io') || global.io;
    if (io) {
      const members = await this.getGroupMemberIds(groupId);
      const payload = { groupId: Number(groupId), userId: Number(memberId), role };
      for (const uid of members) io.to(`user_${uid}`).emit('group_member_role_updated', payload);
    }

    return res.json({ success: true, data: { groupId: Number(groupId), userId: Number(memberId), role } });
  });

  // List members with basic user info and role
  listGroupMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    const rows = await GroupMember.findAll({
      where: { groupId },
      attributes: ['userId', 'role'],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar', 'email', 'phone', 'birthDate', 'gender', 'hidePhone', 'hideBirthDate'] }]
    });

    const data = rows.map(r => {
      const isSelf = r.user?.id === userId;
      const hidePhone = !!r.user?.hidePhone;
      const hideBirthDate = !!r.user?.hideBirthDate;
      return {
        id: r.user?.id || r.userId,
        name: r.user?.name || `User ${r.userId}`,
        avatar: r.user?.avatar || null,
        email: r.user?.email || null,
        // Do not leak hidden fields to others; allow self to see own
        phone: hidePhone && !isSelf ? null : (r.user?.phone || null),
        birthDate: hideBirthDate && !isSelf ? null : (r.user?.birthDate || null),
        gender: r.user?.gender || 'unspecified',
        role: r.role,
        hidePhone,
        hideBirthDate,
      };
    });

    // Sort by role priority: owner -> admin -> member; then by name (asc)
    const rolePriority = { owner: 0, admin: 1, member: 2 };
    data.sort((a, b) => {
      const pa = rolePriority[a.role] ?? 99;
      const pb = rolePriority[b.role] ?? 99;
      if (pa !== pb) return pa - pb;
      const na = (a.name || '').toLowerCase();
      const nb = (b.name || '').toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });

    return res.json({ success: true, data });
  });

  // Pin/Unpin a specific group message (per-user)
  togglePinGroupMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId, messageId } = req.params;
    const { pinned } = req.body;

    // Verify membership
    const membership = await GroupMember.findOne({ where: { groupId, userId: currentUserId } });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a group member' });

    const msg = await GroupMessage.findOne({ where: { id: messageId, groupId } });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (pinned) {
      // Create a record for current user; shared semantics derived from any record existence
      await PinnedMessage.findOrCreate({
        where: { userId: currentUserId, groupMessageId: messageId },
        defaults: { userId: currentUserId, groupMessageId: messageId },
      });
    } else {
      // Unpin globally for the group message
      await PinnedMessage.destroy({ where: { groupMessageId: messageId } });
    }

    // Realtime notify all group members
    try {
      const members = await GroupMember.findAll({ where: { groupId } });
      const payload = { messageId: Number(messageId), groupId: Number(groupId), pinned: !!pinned };
      for (const m of members) {
        global.io && global.io.to(`user_${m.userId}`).emit('group_message_pinned', payload);
      }
    } catch (e) {
      // ignore socket errors
    }

    return res.json({ success: true, data: { pinned: !!pinned } });
  });

  // List pinned messages in a group (current user scope)
  listGroupPinnedMessages = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId } = req.params;

    // Verify membership
    const membership = await GroupMember.findOne({ where: { groupId, userId: currentUserId } });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a group member' });

    const msgs = await GroupMessage.findAll({
      where: { groupId },
      attributes: ['id', 'groupId', 'senderId', 'content', 'messageType', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    const idSet = new Set(msgs.map(m => m.id));
    // Shared pins: return distinct groupMessageIds regardless of who pinned
    const pins = await PinnedMessage.findAll({ where: { groupMessageId: { [Op.in]: Array.from(idSet) } }, order: [['pinnedAt', 'DESC']] });
    const map = new Map(msgs.map(m => [m.id, m]));
    const seen = new Set();
    const data = [];
    for (const p of pins) {
      if (seen.has(p.groupMessageId)) continue;
      seen.add(p.groupMessageId);
      const m = map.get(p.groupMessageId);
      if (!m) continue;
      const deletedFor = Array.isArray(m.get('deletedForUserIds')) ? m.get('deletedForUserIds') : [];
      const isHiddenForMe = deletedFor.includes(currentUserId);
      if (m.isDeletedForAll || isHiddenForMe) {
        if (m.isDeletedForAll) {
          await PinnedMessage.destroy({ where: { groupMessageId: p.groupMessageId } });
        }
        continue;
      }
      data.push({ id: p.groupMessageId, content: m.content, messageType: m.messageType, createdAt: m.createdAt });
    }
    return res.json({ success: true, data });
  });

  // Recall and Edit message handlers inside class
  recallGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { messageIds, scope } = req.body;

    // Validate membership
    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'messageIds is required' });
    }
    if (!['self', 'all'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'Invalid scope' });
    }

    // Load messages ensure they belong to this group
    const msgs = await GroupMessage.findAll({ where: { id: { [Op.in]: messageIds }, groupId } });
    if (msgs.length !== messageIds.length) {
      return res.status(404).json({ success: false, message: 'Some messages not found' });
    }

    // For 'all', only the sender can recall their own messages
    if (scope === 'all') {
      const notOwned = msgs.find(m => m.senderId !== userId);
      if (notOwned) {
        return res.status(403).json({ success: false, message: 'Only the sender can recall for everyone' });
      }
    }

    if (scope === 'self') {
      for (const m of msgs) {
        const list = m.get('deletedForUserIds') || [];
        if (!list.includes(userId)) {
          list.push(userId);
          m.set('deletedForUserIds', list);
          await m.save();
        }
      }
      // Remove current user's pins for these group messages to prevent stale pinned entries in UI
      try {
        await PinnedMessage.destroy({ where: { userId, groupMessageId: { [Op.in]: messageIds } } });
      } catch (e) {
        console.log('Failed to cleanup user pins on recallGroupMessages(self):', e?.name || e);
      }
    } else {
      await GroupMessage.update({ isDeletedForAll: true }, { where: { id: { [Op.in]: messageIds }, groupId } });
      // Remove pins associated with these group messages
      await PinnedMessage.destroy({ where: { groupMessageId: { [Op.in]: messageIds } } });
    }

    // Emit socket update
    const io = req.app.get('io') || global.io;
    if (io) {
      const payload = { groupId: Number(groupId), scope, messageIds };
      if (scope === 'self') {
        // Only notify the recalling user (delete for me)
        io.to(`user_${userId}`).emit('group_messages_recalled', payload);
      } else {
        // Notify all members for recall for everyone
        const members = await GroupMember.findAll({ where: { groupId }, attributes: ['userId'] });
        for (const m of members) {
          io.to(`user_${m.userId}`).emit('group_messages_recalled', payload);
        }
      }
    }

    return res.json({ success: true, data: { groupId: Number(groupId), scope, messageIds } });
  });

  editGroupMessage = asyncHandler(async (req, res) => {
    const { groupId, messageId } = req.params;
    const userId = req.user.id;
    const { content } = req.body || {};

    // Ensure user is a member
    const membership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Not a group member' });
    }

    const msg = await GroupMessage.findOne({ where: { id: messageId, groupId } });
    if (!msg) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    if (msg.senderId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own messages' });
    }
    if (msg.messageType !== 'text') {
      return res.status(400).json({ success: false, message: 'Only text messages can be edited' });
    }

    await msg.update({ content });

    const io = req.app.get('io');
    const payload = { id: msg.id, groupId: Number(groupId), content: msg.content, updatedAt: msg.updatedAt };
    if (io) {
      const members = await this.getGroupMemberIds(groupId);
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_message_edited', payload);
      }
    }

    return res.json({ success: true, data: payload });
  });
}

const groupController = new GroupController();

module.exports = {
  GroupController,
  // export bound instance methods so external code uses class-based handlers
  createGroup: groupController.createGroup,
  listMyGroups: groupController.listMyGroups,
  listUserGroups: groupController.listUserGroups,
  listCommonGroups: groupController.listCommonGroups,
  getGroupMessages: groupController.getGroupMessages,
  searchGroupMessages: groupController.searchGroupMessages,
  sendGroupMessage: groupController.sendGroupMessage,
  reactGroupMessage: groupController.reactGroupMessage,
  unreactGroupMessage: groupController.unreactGroupMessage,
  recallGroupMessages: groupController.recallGroupMessages,
  editGroupMessage: groupController.editGroupMessage,
  inviteMembers: groupController.inviteMembers,
  removeMembers: groupController.removeMembers,
  leaveGroup: groupController.leaveGroup,
  updateGroup: groupController.updateGroup,
  deleteGroup: groupController.deleteGroup,
  acceptGroupInvite: groupController.acceptGroupInvite,
  declineGroupInvite: groupController.declineGroupInvite,
  listMyInvites: groupController.listMyInvites,
  markGroupMessagesRead: groupController.markGroupMessagesRead,
  togglePinGroup: groupController.togglePinGroup,
  getGroupPinStatus: groupController.getGroupPinStatus,
  updateMemberRole: groupController.updateMemberRole,
  listGroupMembers: groupController.listGroupMembers,
  togglePinGroupMessage: groupController.togglePinGroupMessage,
  listGroupPinnedMessages: groupController.listGroupPinnedMessages,
};
