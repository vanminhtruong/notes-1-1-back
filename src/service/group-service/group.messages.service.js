import { Group, GroupMember, GroupMessage, User, MessageReaction, Notification, PinnedMessage, GroupMessageRead } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { emitToAllAdmins, isUserOnline } from '../../socket/socketHandler.js';
import { deleteMultipleFiles, hasUploadedFile } from '../../utils/fileHelper.js';

class GroupMessagesChild {
  constructor(parent) {
    this.parent = parent;
  }

  getGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

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
            const members = await this.parent.membersChild.getGroupMemberIds(groupId);
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

    res.json({ success: true, data: filtered, pagination: { page: parseInt(page), limit: parseInt(limit), hasMore: messages.length === parseInt(limit), sourceCount: messages.length } });
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
      const members = await this.parent.membersChild.getGroupMemberIds(groupId);
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

    // Emit to all admins for monitoring UI
    try {
      const adminPayload = {
        id: messageWithData.id,
        groupId: Number(groupId),
        senderId,
        content: messageWithData.content,
        messageType: messageWithData.messageType,
        createdAt: messageWithData.createdAt,
        senderName: messageWithData.sender?.name,
        senderAvatar: messageWithData.sender?.avatar,
        replyToMessageId: messageWithData.replyToMessageId || null,
      };
      emitToAllAdmins && emitToAllAdmins('admin_group_message_created', adminPayload);
    } catch (e) {
      // no-op for admin emit errors
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
            const members = await this.parent.membersChild.getGroupMemberIds(groupId);
            const payloadUn = { groupId: Number(groupId), messageId: Number(messageId), userId, type: removedType };
            for (const uid of members) io.to(`user_${uid}`).emit('group_message_unreacted', payloadUn);
            // Notify admins as well để Monitor cập nhật realtime
            try {
              emitToAllAdmins && emitToAllAdmins('admin_group_message_unreacted', { ...payloadUn });
            } catch (e) { /* noop */ }
          }
        }
      } catch {}
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      const members = await this.parent.membersChild.getGroupMemberIds(groupId);
      const current = await MessageReaction.findOne({ where: { userId, groupMessageId: messageId, type } });
      const userInfo = await User.findByPk(userId, { attributes: ['id', 'name', 'avatar'] });
      const payload = { groupId: Number(groupId), messageId: Number(messageId), userId, type, count: current?.count ?? 1, user: userInfo };
      for (const uid of members) io.to(`user_${uid}`).emit('group_message_reacted', payload);
      // Emit to admins
      try {
        emitToAllAdmins && emitToAllAdmins('admin_group_message_reacted', { ...payload });
      } catch (e) { /* noop */ }
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
      const members = await this.parent.membersChild.getGroupMemberIds(groupId);
      const payload = { groupId: Number(groupId), messageId: Number(messageId), userId, ...(type ? { type } : {}) };
      for (const uid of members) io.to(`user_${uid}`).emit('group_message_unreacted', payload);
      // Emit to admins
      try {
        emitToAllAdmins && emitToAllAdmins('admin_group_message_unreacted', { ...payload });
      } catch (e) { /* noop */ }
    }

    return res.json({ success: true, data: { groupId: Number(groupId), messageId: Number(messageId), ...(type ? { type } : {}) } });
  });

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
      // Xóa files đính kèm khi recall for all
      const filesToDelete = [];
      for (const msg of msgs) {
        if (hasUploadedFile(msg)) {
          filesToDelete.push(msg.content);
        }
      }
      if (filesToDelete.length > 0) {
        console.log('[RecallGroupMessages] Deleting files:', filesToDelete);
        deleteMultipleFiles(filesToDelete);
      }
      
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
      const members = await this.parent.membersChild.getGroupMemberIds(groupId);
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_message_edited', payload);
      }
    }

    return res.json({ success: true, data: payload });
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
        const members = await this.parent.membersChild.getGroupMemberIds(groupId);
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

  // Delete all messages in a group (owner only)
  deleteAllGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Verify user is group owner
    const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!ownerMembership || ownerMembership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can delete all messages' });
    }

    // Lấy tất cả messages để xóa files trước
    const messages = await GroupMessage.findAll({ 
      where: { groupId }, 
      attributes: ['id', 'content', 'messageType'] 
    });
    const messageIds = messages.map(m => m.id);

    // Xóa các file đính kèm trong messages (image/file type)
    const filesToDelete = [];
    for (const msg of messages) {
      if (msg.messageType === 'image' || msg.messageType === 'file') {
        if (msg.content && isUploadedFile(msg.content)) {
          filesToDelete.push(msg.content);
        }
      }
    }
    if (filesToDelete.length > 0) {
      console.log('[DeleteAllGroupMessages] Deleting files:', filesToDelete);
      deleteMultipleFiles(filesToDelete);
    }

    // Hard delete all messages and related data
    if (messageIds.length > 0) {
      await MessageReaction.destroy({ 
        where: { 
          groupMessageId: { [Op.in]: messageIds }
        }
      });
      await GroupMessageRead.destroy({ 
        where: { 
          messageId: { [Op.in]: messageIds }
        }
      });
      await PinnedMessage.destroy({ 
        where: { 
          groupMessageId: { [Op.in]: messageIds }
        }
      });
    }
    await GroupMessage.destroy({ where: { groupId } });

    // Emit to all group members
    const io = req.app.get('io') || global.io;
    if (io) {
      const members = await this.parent.membersChild.getGroupMemberIds(groupId);
      const payload = { groupId: Number(groupId) };
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_messages_deleted', payload);
      }
    }

    return res.json({ success: true, data: { groupId: Number(groupId) } });
  });
}

export default GroupMessagesChild;
