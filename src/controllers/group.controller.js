const { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isBlockedBetween, getBlockedUserIdSetFor } = require('../utils/block');

const getGroupMemberIds = async (groupId) => {
  console.log(`[getGroupMemberIds] Querying for groupId: ${groupId} (type: ${typeof groupId})`);
  const members = await GroupMember.findAll({ 
    where: { groupId: Number(groupId) }, 
    attributes: ['id', 'userId', 'groupId', 'role'] 
  });
  console.log(`[getGroupMemberIds] Found members:`, members.map(m => ({ id: m.id, userId: m.userId, groupId: m.groupId, role: m.role })));
  console.log(`[getGroupMemberIds] Returning userIds:`, members.map(m => m.userId));
  return members.map(m => m.userId);
};

const createGroup = asyncHandler(async (req, res) => {
  const { name, memberIds = [], avatar, background } = req.body;
  const ownerId = req.user.id;

  const uniqueMemberIds = Array.from(new Set(memberIds.filter(id => id && id !== ownerId)));

  const group = await Group.create({ name, ownerId, avatar, background });
  await GroupMember.create({ groupId: group.id, userId: ownerId, role: 'owner' });
  for (const uid of uniqueMemberIds) {
    await GroupMember.create({ groupId: group.id, userId: uid, role: 'member' });
  }

  const payload = { id: group.id, name: group.name, ownerId, avatar: group.avatar, background: group.background, members: [ownerId, ...uniqueMemberIds] };
  const io = req.app.get('io');
  if (io) {
    for (const uid of payload.members) {
      io.to(`user_${uid}`).emit('group_created', payload);
    }
  }

  res.status(201).json({ success: true, data: payload });
});

const listMyGroups = asyncHandler(async (req, res) => {
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
    const memberIds = await getGroupMemberIds(g.id);
    data.push({ 
      id: g.id, 
      name: g.name, 
      ownerId: g.ownerId, 
      avatar: g.avatar, 
      background: g.background, 
      members: memberIds,
      isPinned: pinnedGroupIds.has(g.id)
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

const deleteGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;

  // Ensure requester is owner
  const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
  if (!ownerMembership || ownerMembership.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Only group owner can delete group' });
  }

  // Collect members for notification before deletion
  const members = await getGroupMemberIds(groupId);

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

const getGroupMessages = asyncHandler(async (req, res) => {
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
        required: false, // Left join to include messages without reads
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
      },
      { 
        model: MessageReaction, 
        as: 'Reactions', 
        attributes: ['userId', 'type', 'count'],
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
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
            break; // Success, exit retry loop
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
          const members = await getGroupMemberIds(groupId);
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

// React to a group message (allow multiple reactions per user per message)
const reactGroupMessage = asyncHandler(async (req, res) => {
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
          const members = await getGroupMemberIds(groupId);
          const payloadUn = { groupId: Number(groupId), messageId: Number(messageId), userId, type: removedType };
          for (const uid of members) io.to(`user_${uid}`).emit('group_message_unreacted', payloadUn);
        }
      }
    } catch {}
  }

  const io = req.app.get('io') || global.io;
  if (io) {
    const members = await getGroupMemberIds(groupId);
    const current = await MessageReaction.findOne({ where: { userId, groupMessageId: messageId, type } });
    const userInfo = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
    const payload = { groupId: Number(groupId), messageId: Number(messageId), userId, type, count: current?.count ?? 1, user: userInfo };
    for (const uid of members) io.to(`user_${uid}`).emit('group_message_reacted', payload);
  }

  return res.json({ success: true, data: { groupId: Number(groupId), messageId: Number(messageId), type } });
});

// Remove reaction from a group message. If ?type is provided, remove only that type; otherwise remove all of current user's reactions.
const unreactGroupMessage = asyncHandler(async (req, res) => {
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
    const members = await getGroupMemberIds(groupId);
    const payload = { groupId: Number(groupId), messageId: Number(messageId), userId, ...(type ? { type } : {}) };
    for (const uid of members) io.to(`user_${uid}`).emit('group_message_unreacted', payload);
  }

  return res.json({ success: true, data: { groupId: Number(groupId), messageId: Number(messageId), ...(type ? { type } : {}) } });
});

// Search messages in a group by content
const searchGroupMessages = asyncHandler(async (req, res) => {
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

const sendGroupMessage = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const senderId = req.user.id;
  const { content, messageType = 'text' } = req.body;

  const membership = await GroupMember.findOne({ where: { groupId, userId: senderId } });
  if (!membership) {
    return res.status(403).json({ success: false, message: 'Not a group member' });
  }

  const msg = await GroupMessage.create({ groupId, senderId, content, messageType, status: 'sent' });
  const messageWithData = await GroupMessage.findByPk(msg.id, {
    include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
  });

  const io = req.app.get('io');
  if (io) {
    const members = await getGroupMemberIds(groupId);
    const payload = {
      id: messageWithData.id,
      groupId: Number(groupId),
      senderId,
      content: messageWithData.content,
      messageType: messageWithData.messageType,
      createdAt: messageWithData.createdAt,
      senderName: messageWithData.sender.name,
      senderAvatar: messageWithData.sender.avatar,
      status: 'delivered'
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

const inviteMembers = asyncHandler(async (req, res) => {
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

  const currentIds = await getGroupMemberIds(groupId);
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
      // Notify each invitee with their specific invite ID
      for (const { inviteId, inviteeId } of pendingInvites) {
        const payload = { groupId: Number(groupId), inviteId, inviterId: userId };
        io.to(`user_${inviteeId}`).emit('group_invited', payload);
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
    }
  }

  res.json({ success: true, data: { groupId: Number(groupId), added, pending, pendingInvites, blocked } });
});

const removeMembers = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { memberIds = [] } = req.body;
  const userId = req.user.id;

  const owner = await GroupMember.findOne({ where: { groupId, userId } });
  if (!owner || owner.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Only group owner can remove members' });
  }
 
  const currentIds = await getGroupMemberIds(groupId);
  const toRemove = Array.from(new Set(memberIds.filter(id => id && currentIds.includes(id) && id !== userId)));

  if (toRemove.length === 0) {
    return res.json({ success: true, data: { groupId: Number(groupId), removed: [] } });
  }

  await GroupMember.destroy({ where: { groupId, userId: { [Op.in]: toRemove } } });

  // If owner removed everyone (except maybe themselves), handle empty group
  const remaining = await getGroupMemberIds(groupId);
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

const leaveGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;

  const gm = await GroupMember.findOne({ where: { groupId, userId } });
  if (!gm) {
    return res.status(404).json({ success: false, message: 'Not in group' });
  }

  await gm.destroy();

  const remaining = await getGroupMemberIds(groupId);

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
  }

  res.json({ success: true, data: { groupId: Number(groupId), userId } });
});

// List pending invites for current user
const listMyInvites = asyncHandler(async (req, res) => {
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
  res.json({ success: true, data: filtered });
});

// Accept a pending group invite
const acceptGroupInvite = asyncHandler(async (req, res) => {
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

  const memberIds = await getGroupMemberIds(groupId);
  const io = req.app.get('io');
  if (io) {
    const payload = { groupId: Number(groupId), added: [userId] };
    for (const uid of memberIds) {
      io.to(`user_${uid}`).emit('group_members_added', payload);
    }
  }

  res.json({ success: true, data: { groupId: Number(groupId), userId } });
});

// Decline a pending group invite
const declineGroupInvite = asyncHandler(async (req, res) => {
  const { groupId, inviteId } = req.params;
  const userId = req.user.id;

  const invite = await GroupInvite.findOne({ where: { id: inviteId, groupId, inviteeId: userId, status: 'pending' } });
  if (!invite) {
    return res.status(404).json({ success: false, message: 'Invite not found or already processed' });
  }

  invite.status = 'declined';
  await invite.save();

  res.json({ success: true, data: { groupId: Number(groupId), inviteId: Number(inviteId), status: 'declined' } });
});

const updateGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;
  const { name, avatar, background } = req.body;

  const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
  if (!ownerMembership || ownerMembership.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Only group owner can update group' });
  }

  const fieldsToUpdate = {};
  if (typeof name !== 'undefined') fieldsToUpdate.name = name;
  if (typeof avatar !== 'undefined') fieldsToUpdate.avatar = avatar;
  if (typeof background !== 'undefined') fieldsToUpdate.background = background;

  await Group.update(fieldsToUpdate, { where: { id: groupId } });
  const updated = await Group.findByPk(groupId);
  const members = await getGroupMemberIds(groupId);

  const data = { id: updated.id, name: updated.name, ownerId: updated.ownerId, avatar: updated.avatar, background: updated.background, members };

  const io = req.app.get('io');
  if (io) {
    for (const uid of members) {
      io.to(`user_${uid}`).emit('group_updated', data);
    }
  }

  res.json({ success: true, data });
});

const markGroupMessagesRead = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;

  // Verify user is group member
  const membership = await GroupMember.findOne({ where: { groupId, userId } });
  if (!membership) {
    return res.status(403).json({ success: false, message: 'Not a group member' });
  }

  // Get all unread messages in this group (sent by others)
  const unreadMessages = await GroupMessage.findAll({
    where: { 
      groupId,
      senderId: { [Op.ne]: userId },
      isRead: false
    }
  });

  const toMarkRead = [];
  const readReceiptsToCreate = [];

  for (const message of unreadMessages) {
    // Always mark as read for unread count purposes
    await GroupMessage.update(
      { isRead: true },
      { where: { id: message.id } }
    );
    toMarkRead.push(message);

    // Only create read receipts if BOTH users have read status enabled
    const currentUser = await User.findByPk(userId);
    const senderUser = await User.findByPk(message.senderId);
    
    if (currentUser && senderUser && currentUser.readStatusEnabled && senderUser.readStatusEnabled) {
      // Create GroupMessageRead record for read receipts with retry for database lock
      let readRecord;
      let retries = 3;
      while (retries > 0) {
        try {
          [readRecord] = await GroupMessageRead.findOrCreate({
            where: { messageId: message.id, userId },
            defaults: { messageId: message.id, userId, readAt: new Date() }
          });
          break; // Success, exit retry loop
        } catch (error) {
          retries--;
          if (error.name === 'SequelizeTimeoutError' && error.original?.code === 'SQLITE_BUSY' && retries > 0) {
            console.log(`Database busy in markGroupMessagesRead, retrying... (${3 - retries}/3)`);
            await new Promise(resolve => setTimeout(resolve, 100 * (3 - retries))); // Exponential backoff
          } else {
            console.error('Error creating GroupMessageRead:', error);
            break; // Exit on non-retryable error
          }
        }
      }
      if (readRecord) {
        readReceiptsToCreate.push({ message, readRecord });
      }
    }
  }

  // Send read receipts via socket
  if (readReceiptsToCreate.length > 0) {
    const io = req.app.get('io');
    if (io) {
      const members = await getGroupMemberIds(groupId);
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

// Extracted recall to a named function (avoid inline function in module.exports)
const recallGroupMessages = asyncHandler(async (req, res) => {
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

// Edit a single group message (only sender, only text messages)
const editGroupMessage = asyncHandler(async (req, res) => {
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
    const members = await getGroupMemberIds(groupId);
    for (const uid of members) {
      io.to(`user_${uid}`).emit('group_message_edited', payload);
    }
  }

  return res.json({ success: true, data: payload });
});

// Pin/Unpin a group
const togglePinGroup = asyncHandler(async (req, res) => {
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

// Get pin status for a group
const getGroupPinStatus = asyncHandler(async (req, res) => {
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

module.exports = {
  createGroup,
  listMyGroups,
  getGroupMessages,
  searchGroupMessages,
  sendGroupMessage,
  reactGroupMessage,
  unreactGroupMessage,
  recallGroupMessages,
  editGroupMessage,
  inviteMembers,
  removeMembers,
  leaveGroup,
  updateGroup,
  deleteGroup,
  acceptGroupInvite,
  declineGroupInvite,
  listMyInvites,
  markGroupMessagesRead,
  togglePinGroup,
  getGroupPinStatus,
  // Pin/Unpin a specific group message (per-user)
  togglePinGroupMessage: asyncHandler(async (req, res) => {
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
  }),
  // List pinned messages in a group (current user scope)
  listGroupPinnedMessages: asyncHandler(async (req, res) => {
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
  }),
};
