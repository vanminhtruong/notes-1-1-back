const { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead } = require('../models');
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

  const data = [];
  for (const g of groups) {
    const memberIds = await getGroupMemberIds(g.id);
    data.push({ id: g.id, name: g.name, ownerId: g.ownerId, avatar: g.avatar, background: g.background, members: memberIds });
  }
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
      if (uid === senderId) continue; // exclude sender from notification
      io.to(`user_${uid}`).emit('group_message', payload);
      
      if (isUserOnline(uid)) {
        hasOnlineMembers = true;
      }
    }
    
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

module.exports = {
  createGroup,
  listMyGroups,
  getGroupMessages,
  sendGroupMessage,
  inviteMembers,
  removeMembers,
  leaveGroup,
  updateGroup,
  deleteGroup,
  acceptGroupInvite,
  declineGroupInvite,
  listMyInvites,
  markGroupMessagesRead,
};
