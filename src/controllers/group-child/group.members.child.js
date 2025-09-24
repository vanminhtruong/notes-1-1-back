const { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction, Notification } = require('../../models');
const asyncHandler = require('../../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isBlockedBetween, getBlockedUserIdSetFor } = require('../../utils/block');

class GroupMembersChild {
  constructor(parent) {
    this.parent = parent;
  }

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
            const notif = await Notification.create({
              userId: inviteeId,
              type: 'group_invite',
              fromUserId: userId,
              groupId: Number(groupId),
              metadata: { inviteId },
              isRead: false,
              createdAt: payload.createdAt,
            });
            // Emit admin realtime to refresh notification tab in admin user activity
            try {
              const { emitToAllAdmins } = require('../../socket/socketHandler');
              emitToAllAdmins && emitToAllAdmins('admin_notification_created', { userId: inviteeId, type: notif.type });
            } catch {}
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
}

module.exports = GroupMembersChild;
