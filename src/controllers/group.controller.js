const { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');

const getGroupMemberIds = async (groupId) => {
  const members = await GroupMember.findAll({ where: { groupId }, attributes: ['userId'] });
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
  const { memberIds = [] } = req.body;
  const userId = req.user.id;

  const gm = await GroupMember.findOne({ where: { groupId, userId } });
  if (!gm || gm.role !== 'owner') {
    return res.status(403).json({ success: false, message: 'Only group owner can invite members' });
  }

  const currentIds = await getGroupMemberIds(groupId);
  const uniqueTargets = Array.from(new Set(memberIds.filter(id => id && id !== userId && !currentIds.includes(id))));

  const added = [];
  const pending = [];
  const pendingInvites = [];

  for (const uid of uniqueTargets) {
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

    if (friendship) {
      await GroupMember.create({ groupId, userId: uid, role: 'member' });
      added.push(uid);
      continue;
    }

    // Create or update pending invite
    let invite = await GroupInvite.findOne({ where: { groupId, inviteeId: uid } });
    
    if (!invite) {
      // Create new invite
      invite = await GroupInvite.create({ 
        groupId, 
        inviteeId: uid, 
        inviterId: userId, 
        status: 'pending' 
      });
    } else if (invite.status !== 'pending') {
      // Reset existing invite to pending if it was declined/accepted before
      invite.status = 'pending';
      invite.inviterId = userId; // Update inviter in case different
      await invite.save();
    }
    
    // Always add to pending list if status is now pending
    if (invite.status === 'pending') {
      pending.push(uid);
      pendingInvites.push({ inviteId: invite.id, inviteeId: uid });
    }
  }

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

  res.json({ success: true, data: { groupId: Number(groupId), added, pending, pendingInvites } });
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
  res.json({ success: true, data: invites });
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
};
