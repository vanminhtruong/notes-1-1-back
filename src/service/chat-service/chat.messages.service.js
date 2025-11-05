import { User, Message, Friendship, MessageRead, BlockedUser, PinnedMessage, MessageReaction, Notification } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isUserOnline, emitToAllAdmins } from '../../socket/socketHandler.js';
import { deleteMultipleFiles, hasUploadedFile } from '../../utils/fileHelper.js';

class ChatMessagesChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  // Get chat messages between two users
  getChatMessages = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });

    const offset = (page - 1) * limit;

    let messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId }
        ]
      },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'avatar'] },
        { 
          model: MessageRead, 
          as: 'MessageReads',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
        },
        { 
          model: MessageReaction, 
          as: 'Reactions', 
          attributes: ['userId', 'type', 'count'],
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
        },
        {
          model: Message,
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
      .filter(m => !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(currentUserId)));

    const toMarkRead = await Message.findAll({
      where: {
        senderId: userId,
        receiverId: currentUserId,
        isRead: false,
      }
    });

    await Message.update(
      { isRead: true },
      {
        where: {
          senderId: userId,
          receiverId: currentUserId,
          isRead: false,
        }
      }
    );

    const currentUser = await User.findByPk(currentUserId);
    const otherUser = await User.findByPk(userId);
    
    if (currentUser && otherUser && currentUser.readStatusEnabled && otherUser.readStatusEnabled) {
      const io = req.app.get('io');
      for (const message of toMarkRead) {
        const [readRecord] = await MessageRead.findOrCreate({
          where: { messageId: message.id, userId: currentUserId },
          defaults: { 
            messageId: message.id, 
            userId: currentUserId, 
            readAt: new Date() 
          }
        });

        if (message.status !== 'read') {
          await message.update({ status: 'read' });
        }

        if (io) {
          const userPayload = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
          io.to(`user_${message.senderId}`).emit('message_read', {
            messageId: message.id,
            userId: currentUserId,
            readAt: readRecord.readAt,
            user: userPayload,
          });
        }
      }
    }

    const normalized = filtered.map((m) => {
      if (m.senderId === Number(userId) && m.receiverId === currentUserId) {
        return { ...m, isRead: true };
      }
      return m;
    });

    // Get recipient info including isActive status
    const recipient = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'avatar', 'isActive']
    });

    res.json({
      success: true,
      data: normalized.reverse(),
      recipient: recipient ? {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        avatar: recipient.avatar,
        isActive: recipient.isActive
      } : null,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: messages.length === parseInt(limit),
        sourceCount: messages.length
      }
    });
  });

  sendMessage = asyncHandler(async (req, res) => {
    const { receiverId, content, messageType = 'text', replyToMessageId } = req.body;
    const senderId = req.user.id;

    if (receiverId === senderId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send message to yourself'
      });
    }

    const receiver = await User.findByPk(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    // Check if receiver is active
    if (!receiver.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message to deactivated account'
      });
    }

    const blocked = await BlockedUser.findOne({
      where: {
        [Op.or]: [
          { userId: senderId, blockedUserId: receiverId },
          { userId: receiverId, blockedUserId: senderId },
        ],
      },
    });
    if (blocked) {
      return res.status(403).json({
        success: false,
        message: 'Messaging is blocked between you and this user',
      });
    }

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: senderId, addresseeId: receiverId, status: 'accepted' },
          { requesterId: receiverId, addresseeId: senderId, status: 'accepted' }
        ]
      }
    });

    if (!friendship) {
      if (!receiver.allowMessagesFromNonFriends) {
        return res.status(403).json({
          success: false,
          message: 'Recipient does not allow messages from non-friends'
        });
      }
    }

    let replyToMessage = null;
    if (replyToMessageId) {
      replyToMessage = await Message.findOne({
        where: {
          id: replyToMessageId,
          [Op.or]: [
            { senderId: senderId, receiverId: receiverId },
            { senderId: receiverId, receiverId: senderId }
          ]
        }
      });
      
      if (!replyToMessage) {
        return res.status(404).json({
          success: false,
          message: 'Reply target message not found'
        });
      }
    }

    const message = await Message.create({
      senderId,
      receiverId,
      content,
      messageType,
      status: 'sent',
      replyToMessageId: replyToMessageId || null
    });

    const messageWithData = await Message.findByPk(message.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'avatar'] },
        {
          model: Message,
          as: 'replyToMessage',
          attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'],
          include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }]
        }
      ]
    });

    // Response immediately for best UX
    res.status(201).json({ success: true, data: messageWithData });

    // Perform all socket and notification operations asynchronously (fire and forget)
    setImmediate(async () => {
      try {
        // Persist a notification ONLY for the receiver so bell feed shows incoming messages for them
        const notif = await Notification.create({
          userId: receiverId,
          type: 'message',
          fromUserId: senderId,
          metadata: { messageId: message.id, otherUserId: senderId },
          isRead: false,
        });
        // Cleanup legacy sender-side 'message' notifications created by previous versions
        try {
          await Notification.destroy({ where: { userId: senderId, type: 'message', fromUserId: senderId } });
        } catch {}
        // Emit admin realtime to refresh notification tab in admin user activity
        try {
          emitToAllAdmins && emitToAllAdmins('admin_notification_created', { userId: receiverId, type: notif.type });
        } catch {}
      } catch (e) {
        console.error('Error creating notification:', e);
      }
    });

    const io = req.app.get('io');
    if (io) {
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

      const messageData = {
        id: messageWithData.id,
        senderId: senderId,
        receiverId: receiverId,
        content: messageWithData.content,
        messageType: messageWithData.messageType,
        createdAt: messageWithData.createdAt,
        senderName: messageWithData.sender?.name,
        senderAvatar: messageWithData.sender?.avatar || null,
        receiverName: messageWithData.receiver?.name,
        receiverAvatar: messageWithData.receiver?.avatar || null,
        replyToMessageId: messageWithData.replyToMessageId || null,
        replyToMessage: replyPayload,
      };
      
      const isReceiverOnline = isUserOnline(receiverId);
      const deliveryStatus = isReceiverOnline ? 'delivered' : 'sent';
      
      // Emit socket events immediately for real-time chat
      io.to(`user_${receiverId}`).emit('new_message', {
        ...messageData,
        status: deliveryStatus
      });

      // Update delivery status asynchronously
      if (isReceiverOnline) {
        setImmediate(async () => {
          try {
            await Message.update({ status: 'delivered' }, { where: { id: message.id } });
          } catch (e) {
            console.error('Error updating message status:', e);
          }
        });
      }

      io.to(`user_${senderId}`).emit('new_message', {
        ...messageData,
        status: deliveryStatus
      });

      io.to(`user_${senderId}`).emit('message_sent', {
        ...messageData,
        status: deliveryStatus
      });
      
      if (isReceiverOnline) {
        io.to(`user_${senderId}`).emit('message_delivered', {
          messageId: message.id,
          status: 'delivered'
        });
      }
    }

    // Emit to all admins for monitoring UI (async)
    setImmediate(async () => {
      try {
        const adminPayload = {
          id: messageWithData.id,
          senderId,
          receiverId,
          content: messageWithData.content,
          messageType: messageWithData.messageType,
          createdAt: messageWithData.createdAt,
          senderName: messageWithData.sender?.name,
          receiverName: messageWithData.receiver?.name,
          replyToMessageId: messageWithData.replyToMessageId || null,
        };
        emitToAllAdmins && emitToAllAdmins('admin_dm_created', adminPayload);
      } catch (e) {
        // no-op for admin emit errors
      }
    });
  });

  editMessage = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { content } = req.body || {};

    const msg = await Message.findByPk(messageId);
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
    const payload = { id: msg.id, content: msg.content, updatedAt: msg.updatedAt };
    if (io) {
      io.to(`user_${msg.senderId}`).emit('message_edited', payload);
      io.to(`user_${msg.receiverId}`).emit('message_edited', payload);
    }

    return res.json({ success: true, data: payload });
  });

  recallMessages = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { messageIds, scope } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'messageIds is required' });
    }
    if (!['self', 'all'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'Invalid scope' });
    }

    const msgs = await Message.findAll({ where: { id: { [Op.in]: messageIds } } });
    
    // Nếu không tìm thấy tin nhắn nào, có thể đã bị xóa trước đó
    if (msgs.length === 0) {
      return res.json({ success: true, message: 'Messages already deleted', data: { scope, messageIds } });
    }

    if (scope === 'all') {
      const notOwned = msgs.find(m => m.senderId !== userId);
      if (notOwned) {
        return res.status(403).json({ success: false, message: 'Only the sender can recall for everyone' });
      }
    }

    // Chỉ xử lý các tin nhắn còn tồn tại
    const foundMessageIds = msgs.map(m => m.id);

    if (scope === 'self') {
      // Thu hồi cho bản thân: chỉ thêm vào deletedForUserIds
      for (const m of msgs) {
        const list = m.get('deletedForUserIds') || [];
        if (!list.includes(userId)) {
          list.push(userId);
          m.set('deletedForUserIds', list);
          await m.save();
        }
      }
      // Xóa pinned messages của user hiện tại
      try {
        await PinnedMessage.destroy({ where: { userId, messageId: { [Op.in]: foundMessageIds } } });
      } catch (e) {
        console.log('Failed to cleanup user pins on recallMessages(self):', e?.name || e);
      }
    } else {
      // Thu hồi cho mọi người: giữ bản ghi để hiển thị placeholder nhưng xoá dữ liệu nhạy cảm
      // 1) Xoá file đính kèm nếu có
      const filesToDelete = [];
      for (const msg of msgs) {
        if (hasUploadedFile(msg)) {
          filesToDelete.push(msg.content);
        }
      }
      if (filesToDelete.length > 0) {
        console.log('[RecallMessages] Deleting files:', filesToDelete);
        deleteMultipleFiles(filesToDelete);
      }
      // 2) Đánh dấu isDeletedForAll, đồng thời clear content & replyToMessageId (giữ nguyên messageType để UI biết loại gốc)
      await Message.update(
        { isDeletedForAll: true, content: '', replyToMessageId: null },
        { where: { id: { [Op.in]: foundMessageIds } } }
      );
      // 3) Cleanup dữ liệu liên quan (cho cả hai phía)
      try { await MessageRead.destroy({ where: { messageId: { [Op.in]: foundMessageIds } } }); } catch (e) { console.log('Failed to cleanup reads on recall(all):', e?.name || e); }
      try { await MessageReaction.destroy({ where: { messageId: { [Op.in]: foundMessageIds } } }); } catch (e) { console.log('Failed to cleanup reactions on recall(all):', e?.name || e); }
      try { await PinnedMessage.destroy({ where: { messageId: { [Op.in]: foundMessageIds } } }); } catch (e) { console.log('Failed to cleanup pins on recall(all):', e?.name || e); }
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      const participants = new Set();
      for (const m of msgs) {
        participants.add(m.senderId);
        participants.add(m.receiverId);
      }
      const payload = { scope, messageIds: foundMessageIds, userId };
      console.log(`🔄 Backend: Emitting messages_recalled, scope=${scope}, messageIds=${foundMessageIds}, participants:`, Array.from(participants));
      
      if (scope === 'self') {
        console.log(`🔄 Backend: Emitting to user_${userId} (self recall)`);
        io.to(`user_${userId}`).emit('messages_recalled', payload);
        // Emit to admin for real-time monitoring
        io.emit('admin_messages_recalled', { ...payload, senderId: userId, receiverId: msgs[0]?.receiverId });
      } else {
        console.log(`🔄 Backend: Emitting to all participants (recall for all):`, Array.from(participants));
        for (const pid of participants) {
          console.log(`🔄 Backend: Emitting to user_${pid}`);
          io.to(`user_${pid}`).emit('messages_recalled', payload);
        }
        // Emit to admin for real-time monitoring
        io.emit('admin_messages_recalled', { ...payload, senderId: userId, receiverId: msgs[0]?.receiverId });
      }
    }

    return res.json({ success: true, data: { scope, messageIds: foundMessageIds } });
  });

  deleteAllMessages = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });

    if (!friendship) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete messages with friends'
      });
    }

    // Lấy tất cả tin nhắn giữa 2 người
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId }
        ]
      }
    });

    let updatedCount = 0;

    // Chỉ thêm currentUserId vào deletedForUserIds - chỉ bên xóa mất, bên kia vẫn thấy
    for (const message of messages) {
      const deletedForUserIds = message.get('deletedForUserIds') || [];
      if (!deletedForUserIds.includes(currentUserId)) {
        deletedForUserIds.push(currentUserId);
        message.set('deletedForUserIds', deletedForUserIds);
        await message.save();
        updatedCount++;
      }
    }

    // Xóa pinned messages của user hiện tại
    try {
      const messageIds = messages.map(m => m.id);
      if (messageIds.length > 0) {
        await PinnedMessage.destroy({ where: { userId: currentUserId, messageId: { [Op.in]: messageIds } } });
      }
    } catch (e) {
      console.log('Failed to cleanup user pins on deleteAllMessages:', e?.name || e);
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      const payload = { 
        deletedWith: userId,
        deletedBy: currentUserId,
        count: updatedCount,
        scope: 'self'
      };
      
      // Chỉ emit cho người xóa
      io.to(`user_${currentUserId}`).emit('messages_deleted', payload);
      
      // Emit to admin for real-time monitoring
      io.emit('admin_messages_deleted', {
        ...payload,
        senderId: currentUserId,
        receiverId: parseInt(userId),
        deletedCount: updatedCount
      });
    }

    res.json({
      success: true,
      message: `Deleted ${updatedCount} messages for you`,
      data: { deletedCount: updatedCount }
    });
  });

  searchChatMessages = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { q, limit = 20 } = req.query || {};

    if (!q || String(q).trim().length === 0) {
      return res.json({ success: true, data: [] });
    }

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      return res.status(403).json({ success: false, message: 'You can only search messages with friends' });
    }

    const like = { [Op.like]: `%${q}%` };
    const rows = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId, content: like },
          { senderId: userId, receiverId: currentUserId, content: like }
        ],
        isDeletedForAll: { [Op.not]: true },
      },
      attributes: ['id', 'senderId', 'receiverId', 'content', 'messageType', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
    });

    const filtered = rows
      .map(r => r.toJSON())
      .filter(m => !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(currentUserId)));

    return res.json({ success: true, data: filtered });
  });
}

export default ChatMessagesChild;
