const { User, Message, Friendship, MessageRead, ChatPreference, BlockedUser, PinnedChat, PinnedMessage, MessageReaction, GroupMember } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isUserOnline } = require('../socket/socketHandler');

class ChatController {
  constructor() {}

  // Get chat messages between two users
  getChatMessages = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { page = 1, limit = 50 } = req.query;

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

    res.json({
      success: true,
      data: normalized.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: filtered.length === parseInt(limit)
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
      
      const isReceiverOnline = require('../socket/socketHandler').isUserOnline(receiverId);
      const deliveryStatus = isReceiverOnline ? 'delivered' : 'sent';
      
      if (isReceiverOnline) {
        await Message.update({ status: 'delivered' }, { where: { id: message.id } });
      }
      
      io.to(`user_${receiverId}`).emit('new_message', {
        ...messageData,
        status: deliveryStatus
      });

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

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: messageWithData
    });
  });

  getChatList = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const friendships = await Friendship.findAll({
      where: {
        [Op.or]: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' }
        ]
      },
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] },
        { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
      ]
    });

    const chatList = [];

    for (const friendship of friendships) {
      const friend = friendship.requesterId === userId 
        ? friendship.addressee 
        : friendship.requester;

      const lastMessage = await Message.findOne({
        where: {
          [Op.or]: [
            { senderId: userId, receiverId: friend.id },
            { senderId: friend.id, receiverId: userId }
          ]
        },
        order: [['createdAt', 'DESC']],
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
          { model: MessageReaction, as: 'Reactions', attributes: ['userId', 'type', 'count'] },
        ]
      });

      const unreadCount = await Message.count({
        where: {
          senderId: friend.id,
          receiverId: userId,
          isRead: false
        }
      });

      let nickname = null;
      try {
        const pref = await ChatPreference.findOne({ where: { userId, otherUserId: friend.id } });
        nickname = pref?.nickname || null;
      } catch (e) {
        // ignore preference errors; nickname stays null
      }

      chatList.push({
        friend: {
          ...friend.toJSON(),
          isOnline: isUserOnline(friend.id)
        },
        lastMessage: lastMessage || null,
        unreadCount,
        friendshipId: friendship.id,
        nickname
      });
    }

    const pinnedChats = await PinnedChat.findAll({
      where: { userId, pinnedUserId: { [Op.not]: null } }
    });
    const pinnedUserIds = new Set(pinnedChats.map(p => p.pinnedUserId));

    chatList.forEach(chat => {
      chat.isPinned = pinnedUserIds.has(chat.friend.id);
    });

    chatList.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
      return bTime - aTime;
    });

    res.json({
      success: true,
      data: chatList
    });
  });

  markMessagesAsRead = asyncHandler(async (req, res) => {
    const { senderId } = req.params;
    const receiverId = req.user.id;

    const toMarkRead = await Message.findAll({
      where: {
        senderId,
        receiverId,
        isRead: false,
      }
    });

    await Message.update(
      { isRead: true },
      {
        where: {
          senderId,
          receiverId,
          isRead: false,
        }
      }
    );

    if (toMarkRead.length > 0) {
      const currentUser = await User.findByPk(receiverId);
      const otherUser = await User.findByPk(senderId);
      if (currentUser && otherUser && currentUser.readStatusEnabled && otherUser.readStatusEnabled) {
        const io = req.app.get('io');
        for (const m of toMarkRead) {
          const [readRecord] = await MessageRead.findOrCreate({
            where: { messageId: m.id, userId: receiverId },
            defaults: {
              messageId: m.id,
              userId: receiverId,
              readAt: new Date()
            }
          });

          if (m.status !== 'read') {
            await m.update({ status: 'read' });
          }

          if (io) {
            const userPayload = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
            io.to(`user_${senderId}`).emit('message_read', {
              messageId: m.id,
              userId: receiverId,
              readAt: readRecord.readAt,
              user: userPayload,
            });
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  });

  getUnreadCount = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const unreadCount = await Message.count({
      where: {
        receiverId: userId,
        isRead: false
      }
    });

    res.json({
      success: true,
      data: { unreadCount }
    });
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

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId }
        ]
      }
    });

    let updatedCount = 0;

    for (const message of messages) {
      const deletedForUserIds = message.get('deletedForUserIds') || [];
      if (!deletedForUserIds.includes(currentUserId)) {
        deletedForUserIds.push(currentUserId);
        message.set('deletedForUserIds', deletedForUserIds);
        await message.save();
        updatedCount++;
      }
    }

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
      
      io.to(`user_${currentUserId}`).emit('messages_deleted', payload);
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

  getChatNickname = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    let shareGroup = false;
    if (!friendship) {
      const myGroups = await GroupMember.findAll({ where: { userId: currentUserId }, attributes: ['groupId'] });
      const otherGroups = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
      const mySet = new Set(myGroups.map((g) => g.groupId));
      shareGroup = otherGroups.some((g) => mySet.has(g.groupId));
      if (!shareGroup) return res.status(403).json({ success: false, message: 'You can only view preferences with friends or group members' });
    }

    const pref = await ChatPreference.findOne({ where: { userId: currentUserId, otherUserId: userId } });
    return res.json({ success: true, data: { nickname: pref?.nickname || null } });
  });

  setChatNickname = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    let { nickname } = req.body || {};
    if (nickname !== null && nickname !== undefined) nickname = String(nickname).trim();

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      const myGroups = await GroupMember.findAll({ where: { userId: currentUserId }, attributes: ['groupId'] });
      const otherGroups = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
      const mySet = new Set(myGroups.map((g) => g.groupId));
      const shareGroup = otherGroups.some((g) => mySet.has(g.groupId));
      if (!shareGroup) return res.status(403).json({ success: false, message: 'You can only set preferences with friends or group members' });
    }

    const [pref] = await ChatPreference.findOrCreate({
      where: { userId: currentUserId, otherUserId: userId },
      defaults: { userId: currentUserId, otherUserId: userId, nickname: nickname || null }
    });
    if (pref.nickname !== (nickname || null)) await pref.update({ nickname: nickname || null });
    
    try {
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`user_${currentUserId}`).emit('nickname_updated', {
          otherUserId: Number(userId),
          nickname: pref.nickname || null,
        });
      }
    } catch {}
    return res.json({ success: true, data: { nickname: pref.nickname || null } });
  });

  reactMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { type } = req.body || {};

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    try {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
            { userId: currentUserId, blockedUserId: otherUserId },
            { userId: otherUserId, blockedUserId: currentUserId },
          ],
        },
      });
      if (blocked) {
        return res.status(403).json({ success: false, message: 'Messaging is blocked between you and this user' });
      }
    } catch {}

    const existingSame = await MessageReaction.findOne({ where: { userId: currentUserId, messageId, type } });
    if (existingSame) {
      await existingSame.increment('count', { by: 1 });
      await existingSame.update({ reactedAt: new Date() });
    } else {
      let removedType = null;
      const list = await MessageReaction.findAll({ where: { userId: currentUserId, messageId }, order: [['reactedAt', 'ASC']] });
      if (list.length >= 3) {
        try { removedType = list[2].type; await list[2].destroy(); } catch {}
      }
      await MessageReaction.findOrCreate({
        where: { userId: currentUserId, messageId, type },
        defaults: { userId: currentUserId, messageId, type, count: 1 }
      });
      
      try {
        if (removedType) {
          const io = req.app.get('io') || global.io;
          const payloadUnreact = { messageId: Number(messageId), userId: currentUserId, type: removedType };
          if (io) {
            io.to(`user_${msg.senderId}`).emit('message_unreacted', payloadUnreact);
            io.to(`user_${msg.receiverId}`).emit('message_unreacted', payloadUnreact);
          }
        }
      } catch {}
    }

    try {
      const current = await MessageReaction.findOne({ where: { userId: currentUserId, messageId, type } });
      const userInfo = await User.findByPk(currentUserId, { attributes: ['id', 'name', 'avatar'] });
      const payload = { messageId: Number(messageId), userId: currentUserId, type, count: current?.count ?? 1, user: userInfo };
      const a = msg.senderId, b = msg.receiverId;
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`user_${a}`).emit('message_reacted', payload);
        io.to(`user_${b}`).emit('message_reacted', payload);
      }
    } catch {}

    return res.json({ success: true, data: { messageId: Number(messageId), type } });
  });

  unreactMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { type } = req.query || {};

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    try {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
            { userId: currentUserId, blockedUserId: otherUserId },
            { userId: otherUserId, blockedUserId: currentUserId },
          ],
        },
      });
      if (blocked) {
        return res.status(403).json({ success: false, message: 'Messaging is blocked between you and this user' });
      }
    } catch {}

    const where = { userId: currentUserId, messageId };
    if (type) where.type = type;
    await MessageReaction.destroy({ where });

    try {
      const payload = { messageId: Number(messageId), userId: currentUserId, ...(type ? { type } : {}) };
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`user_${msg.senderId}`).emit('message_unreacted', payload);
        io.to(`user_${msg.receiverId}`).emit('message_unreacted', payload);
      }
    } catch {}

    return res.json({ success: true, data: { messageId: Number(messageId), ...(type ? { type } : {}) } });
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
    if (msgs.length !== messageIds.length) {
      return res.status(404).json({ success: false, message: 'Some messages not found' });
    }

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
      try {
        await PinnedMessage.destroy({ where: { userId, messageId: { [Op.in]: messageIds } } });
      } catch (e) {
        console.log('Failed to cleanup user pins on recallMessages(self):', e?.name || e);
      }
    } else {
      await Message.update({ isDeletedForAll: true }, { where: { id: { [Op.in]: messageIds } } });
      await PinnedMessage.destroy({ where: { messageId: { [Op.in]: messageIds } } });
    }

    const io = req.app.get('io') || global.io;
    if (io) {
      const participants = new Set();
      for (const m of msgs) {
        participants.add(m.senderId);
        participants.add(m.receiverId);
      }
      const payload = { scope, messageIds };
      if (scope === 'self') {
        io.to(`user_${userId}`).emit('messages_recalled', payload);
      } else {
        for (const pid of participants) {
          io.to(`user_${pid}`).emit('messages_recalled', payload);
        }
      }
    }

    return res.json({ success: true, data: { scope, messageIds } });
  });

  getChatBackground = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      return res.status(403).json({ success: false, message: 'You can only view preferences with friends' });
    }

    const [myPref, theirPref] = await Promise.all([
      ChatPreference.findOne({ where: { userId: currentUserId, otherUserId: userId } }),
      ChatPreference.findOne({ where: { userId: userId, otherUserId: currentUserId } })
    ]);

    const backgroundUrl = myPref?.backgroundUrl || theirPref?.backgroundUrl || null;
    return res.json({ success: true, data: { backgroundUrl } });
  });

  setChatBackground = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const { backgroundUrl } = req.body || {};

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      return res.status(403).json({ success: false, message: 'You can only set preferences with friends' });
    }

    const [pref] = await ChatPreference.findOrCreate({
      where: { userId: currentUserId, otherUserId: userId },
      defaults: { userId: currentUserId, otherUserId: userId, backgroundUrl: backgroundUrl || null }
    });
    if (pref.backgroundUrl !== backgroundUrl) {
      await pref.update({ backgroundUrl: backgroundUrl || null });
    }
    return res.json({ success: true, data: { backgroundUrl: pref.backgroundUrl || null } });
  });

  togglePinChat = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const { pinned } = req.body;

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
        message: 'You can only pin chats with friends'
      });
    }

    if (pinned) {
      const [pinnedChat, created] = await PinnedChat.findOrCreate({
        where: { userId: currentUserId, pinnedUserId: userId },
        defaults: { userId: currentUserId, pinnedUserId: userId }
      });
      
      return res.json({
        success: true,
        message: created ? 'Chat pinned' : 'Chat already pinned',
        data: { pinned: true }
      });
    } else {
      const deleted = await PinnedChat.destroy({
        where: { userId: currentUserId, pinnedUserId: userId }
      });
      
      return res.json({
        success: true,
        message: deleted > 0 ? 'Chat unpinned' : 'Chat was not pinned',
        data: { pinned: false }
      });
    }
  });

  getPinStatus = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const pinnedChat = await PinnedChat.findOne({
      where: { userId: currentUserId, pinnedUserId: userId }
    });

    return res.json({
      success: true,
      data: { pinned: !!pinnedChat }
    });
  });

  togglePinMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { pinned } = req.body;

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    if (pinned) {
      await PinnedMessage.findOrCreate({
        where: { userId: currentUserId, messageId },
        defaults: { userId: currentUserId, messageId },
      });
    } else {
      await PinnedMessage.destroy({ where: { messageId } });
    }

    try {
      const a = msg.senderId;
      const b = msg.receiverId;
      const payload = { messageId: msg.id, participants: [a, b], pinned: !!pinned };
      global.io && global.io.to(`user_${a}`).emit('message_pinned', payload);
      global.io && global.io.to(`user_${b}`).emit('message_pinned', payload);
    } catch (e) {
      // ignore socket errors
    }

    return res.json({ success: true, data: { pinned: !!pinned } });
  });

  listPinnedMessages = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' },
        ],
      },
    });
    if (!friendship) return res.status(403).json({ success: false, message: 'You can only view pinned with friends' });

    const msgs = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId },
        ],
      },
      attributes: ['id', 'content', 'messageType', 'createdAt', 'senderId', 'receiverId'],
      order: [['createdAt', 'ASC']],
    });
    const msgIdSet = new Set(msgs.map((m) => m.id));
    const pinned = await PinnedMessage.findAll({ where: { messageId: { [Op.in]: Array.from(msgIdSet) } }, order: [['pinnedAt', 'DESC']] });
    const pinnedMap = new Map(msgs.map((m) => [m.id, m]));
    const seen = new Set();
    const data = [];
    for (const p of pinned) {
      if (seen.has(p.messageId)) continue;
      seen.add(p.messageId);
      const m = pinnedMap.get(p.messageId);
      if (!m) continue;
      const deletedFor = Array.isArray(m.get('deletedForUserIds')) ? m.get('deletedForUserIds') : [];
      const isHiddenForMe = deletedFor.includes(currentUserId);
      const otherId = m.senderId === currentUserId ? m.receiverId : m.senderId;
      const isHiddenForOther = deletedFor.includes(otherId);
      if (m.isDeletedForAll || isHiddenForMe) {
        if (m.isDeletedForAll) {
          await PinnedMessage.destroy({ where: { messageId: p.messageId } });
        }
        continue;
      }
      if (isHiddenForOther) {
        await PinnedMessage.destroy({ where: { messageId: p.messageId } });
        continue;
      }
      data.push({ id: p.messageId, content: m.content, messageType: m.messageType, createdAt: m.createdAt });
    }
    return res.json({ success: true, data });
  });
}

module.exports = new ChatController();
