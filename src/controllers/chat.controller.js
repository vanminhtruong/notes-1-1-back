const { User, Message, Friendship, MessageRead, ChatPreference, BlockedUser, PinnedChat, PinnedMessage, MessageReaction } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isUserOnline } = require('../socket/socketHandler');

// Get chat messages between two users
const getChatMessages = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  const { page = 1, limit = 50 } = req.query;

  // Check if users are friends
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
      message: 'You can only chat with friends'
    });
  }

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
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  // Filter out messages deleted for current user (self recall)
  const filtered = messages
    .map(m => m.toJSON())
    .filter(m => !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(currentUserId)));

  // Find messages that are currently unread (so we can emit receipts only for these)
  const toMarkRead = await Message.findAll({
    where: {
      senderId: userId,
      receiverId: currentUserId,
      isRead: false,
    }
  });

  // Always mark messages as read for the receiver (backend source of truth for unread counts)
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

  // Read receipts (MessageReads and status) remain opt-in: only if BOTH users enabled
  const currentUser = await User.findByPk(currentUserId);
  const otherUser = await User.findByPk(userId);
  
  if (currentUser && otherUser && currentUser.readStatusEnabled && otherUser.readStatusEnabled) {
    const io = req.app.get('io');
    for (const message of toMarkRead) {
      // Create read record (idempotent)
      const [readRecord] = await MessageRead.findOrCreate({
        where: { messageId: message.id, userId: currentUserId },
        defaults: { 
          messageId: message.id, 
          userId: currentUserId, 
          readAt: new Date() 
        }
      });

      // Update message delivery status to 'read' for UX if you track it
      if (message.status !== 'read') {
        await message.update({ status: 'read' });
      }

      // Emit real-time read receipt to the sender
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

  // Normalize API response so the client sees these messages as read immediately
  const normalized = filtered.map((m) => {
    if (m.senderId === Number(userId) && m.receiverId === currentUserId) {
      return { ...m, isRead: true };
    }
    return m;
  });

  res.json({
    success: true,
    data: normalized.reverse(), // Reverse to show oldest first
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: filtered.length === parseInt(limit)
    }
  });
});

// Send a message
const sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, content, messageType = 'text' } = req.body;
  const senderId = req.user.id;

  if (receiverId === senderId) {
    return res.status(400).json({
      success: false,
      message: 'Cannot send message to yourself'
    });
  }

  // Check if receiver exists
  const receiver = await User.findByPk(receiverId);
  if (!receiver) {
    return res.status(404).json({
      success: false,
      message: 'Receiver not found'
    });
  }

  // Enforce blocking: if either user has blocked the other, disallow sending
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

  // Check if users are friends
  const friendship = await Friendship.findOne({
    where: {
      [Op.or]: [
        { requesterId: senderId, addresseeId: receiverId, status: 'accepted' },
        { requesterId: receiverId, addresseeId: senderId, status: 'accepted' }
      ]
    }
  });

  if (!friendship) {
    return res.status(403).json({
      success: false,
      message: 'You can only send messages to friends'
    });
  }

  const message = await Message.create({
    senderId,
    receiverId,
    content,
    messageType,
    status: 'sent'
  });

  // Get message with user data
  const messageWithData = await Message.findByPk(message.id, {
    include: [
      { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
      { model: User, as: 'receiver', attributes: ['id', 'name', 'avatar'] }
    ]
  });

  // Emit socket event for real-time delivery
  const io = req.app.get('io');
  if (io) {
    const messageData = {
      id: messageWithData.id,
      senderId: senderId,
      receiverId: receiverId,
      content: messageWithData.content,
      messageType: messageWithData.messageType,
      createdAt: messageWithData.createdAt,
      senderName: messageWithData.sender.name
    };
    
    // Check if receiver is online to determine status
    const isReceiverOnline = require('../socket/socketHandler').isUserOnline(receiverId);
    const deliveryStatus = isReceiverOnline ? 'delivered' : 'sent';
    
    // Update message status in database if delivered
    if (isReceiverOnline) {
      await Message.update({ status: 'delivered' }, { where: { id: message.id } });
    }
    
    // Send to receiver
    io.to(`user_${receiverId}`).emit('new_message', {
      ...messageData,
      status: deliveryStatus
    });

    // Also send to sender as a new message to append in real-time
    io.to(`user_${senderId}`).emit('new_message', {
      ...messageData,
      status: deliveryStatus
    });

    // Send to sender status update (kept for compatibility with existing UI)
    io.to(`user_${senderId}`).emit('message_sent', {
      ...messageData,
      status: deliveryStatus
    });
    
    // If delivered, also emit delivered event to sender
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

// Get chat list (recent conversations)
const getChatList = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get all friends
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

    // Get last message with this friend
    const lastMessage = await Message.findOne({
      where: {
        [Op.or]: [
          { senderId: userId, receiverId: friend.id },
          { senderId: friend.id, receiverId: userId }
        ]
      },
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }
      ]
    });

    // Count unread messages using isRead field
    const unreadCount = await Message.count({
      where: {
        senderId: friend.id,
        receiverId: userId,
        isRead: false
      }
    });

    chatList.push({
      friend: {
        ...friend.toJSON(),
        isOnline: isUserOnline(friend.id)
      },
      lastMessage: lastMessage || null,
      unreadCount,
      friendshipId: friendship.id
    });
  }

  // Get pinned chats for current user
  const pinnedChats = await PinnedChat.findAll({
    where: { userId, pinnedUserId: { [Op.not]: null } }
  });
  const pinnedUserIds = new Set(pinnedChats.map(p => p.pinnedUserId));

  // Add isPinned flag and sort by pin status, then by last message timestamp
  chatList.forEach(chat => {
    chat.isPinned = pinnedUserIds.has(chat.friend.id);
  });

  chatList.sort((a, b) => {
    // Pinned chats always come first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // Within same pin status, sort by last message timestamp
    const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
    const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
    return bTime - aTime;
  });

  res.json({
    success: true,
    data: chatList
  });
});

// Mark messages as read (persist read state and emit receipts for those newly marked)
const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { senderId } = req.params;
  const receiverId = req.user.id;

  // Capture which messages are currently unread to emit receipts just for these
  const toMarkRead = await Message.findAll({
    where: {
      senderId,
      receiverId,
      isRead: false,
    }
  });

  // Persist read state (backend source of truth)
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

  // Emit read receipts only if BOTH users enabled read status
  if (toMarkRead.length > 0) {
    const currentUser = await User.findByPk(receiverId);
    const otherUser = await User.findByPk(senderId);
    if (currentUser && otherUser && currentUser.readStatusEnabled && otherUser.readStatusEnabled) {
      const io = req.app.get('io');
      for (const m of toMarkRead) {
        // Create MessageRead idempotently
        const [readRecord] = await MessageRead.findOrCreate({
          where: { messageId: m.id, userId: receiverId },
          defaults: {
            messageId: m.id,
            userId: receiverId,
            readAt: new Date()
          }
        });

        // Update per-message status
        if (m.status !== 'read') {
          await m.update({ status: 'read' });
        }

        // Notify sender immediately with avatar info
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

// Get unread message count
const getUnreadCount = asyncHandler(async (req, res) => {
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

// Delete all messages with a specific user (for current user only)
const deleteAllMessages = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  // Check if users are friends
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

  // Find all messages between the two users
  const messages = await Message.findAll({
    where: {
      [Op.or]: [
        { senderId: currentUserId, receiverId: userId },
        { senderId: userId, receiverId: currentUserId }
      ]
    }
  });

  let updatedCount = 0;

  // Mark messages as deleted for current user only (using deletedForUserIds)
  for (const message of messages) {
    const deletedForUserIds = message.get('deletedForUserIds') || [];
    if (!deletedForUserIds.includes(currentUserId)) {
      deletedForUserIds.push(currentUserId);
      message.set('deletedForUserIds', deletedForUserIds);
      await message.save();
      updatedCount++;
    }
  }

  // Also remove any pins for these messages for the current user (so pinned banner won't persist)
  try {
    const messageIds = messages.map(m => m.id);
    if (messageIds.length > 0) {
      await PinnedMessage.destroy({ where: { userId: currentUserId, messageId: { [Op.in]: messageIds } } });
    }
  } catch (e) {
    // Non-fatal cleanup; log and continue
    console.log('Failed to cleanup user pins on deleteAllMessages:', e?.name || e);
  }

  // Only emit socket event to current user (delete for me only)
  const io = req.app.get('io') || global.io;
  if (io) {
    const payload = { 
      deletedWith: userId,
      deletedBy: currentUserId,
      count: updatedCount,
      scope: 'self' // Indicate this is delete for me only
    };
    
    // Only notify the current user
    io.to(`user_${currentUserId}`).emit('messages_deleted', payload);
  }

  res.json({
    success: true,
    message: `Deleted ${updatedCount} messages for you`,
    data: { deletedCount: updatedCount }
  });
});

module.exports = {
  getChatMessages,
  // Search messages between current user and :userId
  searchChatMessages: asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { q, limit = 20 } = req.query || {};

    if (!q || String(q).trim().length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Ensure they are friends
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

    // Filter out messages deleted for current user
    const filtered = rows
      .map(r => r.toJSON())
      .filter(m => !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(currentUserId)));

    return res.json({ success: true, data: filtered });
  }),
  sendMessage,
  getChatList,
  markMessagesAsRead,
  getUnreadCount,
  deleteAllMessages,
  // React to a direct message (allow multiple reactions per user per message)
  reactMessage: asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { type } = req.body || {};

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    // If same type already exists, increment count
    const existingSame = await MessageReaction.findOne({ where: { userId: currentUserId, messageId, type } });
    if (existingSame) {
      await existingSame.increment('count', { by: 1 });
      await existingSame.update({ reactedAt: new Date() });
    } else {
      let removedType = null;
      // Remove the oldest so the first two stay intact and the new becomes the 3rd
      const list = await MessageReaction.findAll({ where: { userId: currentUserId, messageId }, order: [['reactedAt', 'ASC']] });
      if (list.length >= 3) {
        // list is ASC by reactedAt, so list[2] is the current 3rd slot
        try { removedType = list[2].type; await list[2].destroy(); } catch {}
      }
      await MessageReaction.findOrCreate({
        where: { userId: currentUserId, messageId, type },
        defaults: { userId: currentUserId, messageId, type, count: 1 }
      });
      // Emit unreact for removed type if any
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

    // Emit to both participants
    try {
      // Fetch current count for this reaction
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
  }),

  // Remove reaction from a direct message (by current user). If ?type is provided, remove only that type; otherwise remove all of current user's reactions.
  unreactMessage: asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { type } = req.query || {};

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

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
  }),
  editMessage: asyncHandler(async (req, res) => {
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
  }),
  // Added below
  recallMessages: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { messageIds, scope } = req.body; // scope: 'self' | 'all'

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'messageIds is required' });
    }
    if (!['self', 'all'].includes(scope)) {
      return res.status(400).json({ success: false, message: 'Invalid scope' });
    }

    // Load messages
    const msgs = await Message.findAll({ where: { id: { [Op.in]: messageIds } } });
    if (msgs.length !== messageIds.length) {
      return res.status(404).json({ success: false, message: 'Some messages not found' });
    }

    // For 'all', only sender can recall their own messages
    if (scope === 'all') {
      const notOwned = msgs.find(m => m.senderId !== userId);
      if (notOwned) {
        return res.status(403).json({ success: false, message: 'Only the sender can recall for everyone' });
      }
    }

    // Apply updates
    if (scope === 'self') {
      for (const m of msgs) {
        const list = m.get('deletedForUserIds') || [];
        if (!list.includes(userId)) {
          list.push(userId);
          m.set('deletedForUserIds', list);
          await m.save();
        }
      }
      // Remove current user's pins for these messages to avoid stale pinned entries
      try {
        await PinnedMessage.destroy({ where: { userId, messageId: { [Op.in]: messageIds } } });
      } catch (e) {
        console.log('Failed to cleanup user pins on recallMessages(self):', e?.name || e);
      }
    } else {
      await Message.update({ isDeletedForAll: true }, { where: { id: { [Op.in]: messageIds } } });
      // Remove any pins associated with these messages
      await PinnedMessage.destroy({ where: { messageId: { [Op.in]: messageIds } } });
    }

    // Prepare socket emission
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
  }),
  // Get per-chat background for current user vs other user
  getChatBackground: asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    // Ensure they are friends (accepted) to prevent probing
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

    // Check both users' preferences - current user first, then the other user
    const [myPref, theirPref] = await Promise.all([
      ChatPreference.findOne({ where: { userId: currentUserId, otherUserId: userId } }),
      ChatPreference.findOne({ where: { userId: userId, otherUserId: currentUserId } })
    ]);

    // Priority: my preference first, then their preference (for "background for both" scenario)
    const backgroundUrl = myPref?.backgroundUrl || theirPref?.backgroundUrl || null;
    return res.json({ success: true, data: { backgroundUrl } });
  }),
  // Set per-chat background (null to reset)
  setChatBackground: asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const { backgroundUrl } = req.body || {};

    // Ensure they are friends (accepted)
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
  }),
  // Pin/Unpin a chat
  togglePinChat: asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const { pinned } = req.body;

    // Ensure they are friends
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
      // Pin the chat
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
      // Unpin the chat
      const deleted = await PinnedChat.destroy({
        where: { userId: currentUserId, pinnedUserId: userId }
      });
      
      return res.json({
        success: true,
        message: deleted > 0 ? 'Chat unpinned' : 'Chat was not pinned',
        data: { pinned: false }
      });
    }
  }),
  // Get pin status for a chat
  getPinStatus: asyncHandler(async (req, res) => {
  const currentUserId = req.user.id;
  const { userId } = req.params;

  const pinnedChat = await PinnedChat.findOne({
    where: { userId: currentUserId, pinnedUserId: userId }
  });

  return res.json({
    success: true,
    data: { pinned: !!pinnedChat }
  });
}),
// Pin/Unpin a specific message in 1-1 chat (per-user)
togglePinMessage: asyncHandler(async (req, res) => {
  const currentUserId = req.user.id;
  const { messageId } = req.params;
  const { pinned } = req.body;

  const msg = await Message.findByPk(messageId);
  if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

  // Ensure the current user is participant of this message
  if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
    return res.status(403).json({ success: false, message: 'Not allowed' });
  }

  if (pinned) {
    // Create a record for current user if not exists (shared semantics derive from existence of any record)
    await PinnedMessage.findOrCreate({
      where: { userId: currentUserId, messageId },
      defaults: { userId: currentUserId, messageId },
    });
  } else {
    // Unpin globally for this conversation by removing all records of this message
    await PinnedMessage.destroy({ where: { messageId } });
  }

  // Notify both participants in real-time
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
}),
// List pinned messages for a 1-1 chat with specific user (current user scope)
listPinnedMessages: asyncHandler(async (req, res) => {
  const currentUserId = req.user.id;
  const { userId } = req.params;

  // Ensure they are friends
  const friendship = await Friendship.findOne({
    where: {
      [Op.or]: [
        { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
        { requesterId: userId, addresseeId: currentUserId, status: 'accepted' },
      ],
    },
  });
  if (!friendship) return res.status(403).json({ success: false, message: 'You can only view pinned with friends' });

  // messages between two users
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
  // Shared pins: return distinct messageIds regardless of who pinned
  const pinned = await PinnedMessage.findAll({ where: { messageId: { [Op.in]: Array.from(msgIdSet) } }, order: [['pinnedAt', 'DESC']] });
  const pinnedMap = new Map(msgs.map((m) => [m.id, m]));
  const seen = new Set();
  const data = [];
  for (const p of pinned) {
    if (seen.has(p.messageId)) continue;
    seen.add(p.messageId);
    const m = pinnedMap.get(p.messageId);
    if (!m) continue;
    // Exclude recalled or hidden-for-current-user messages
    const deletedFor = Array.isArray(m.get('deletedForUserIds')) ? m.get('deletedForUserIds') : [];
    const isHiddenForMe = deletedFor.includes(currentUserId);
    const otherId = m.senderId === currentUserId ? m.receiverId : m.senderId;
    const isHiddenForOther = deletedFor.includes(otherId);
    if (m.isDeletedForAll || isHiddenForMe) {
      // If recalled for all remove; if hidden for me, just skip in my view
      if (m.isDeletedForAll) {
        await PinnedMessage.destroy({ where: { messageId: p.messageId } });
      }
      continue;
    }
    // If both sides hid it (delete-for-self for both), clean up pins
    if (isHiddenForOther) {
      await PinnedMessage.destroy({ where: { messageId: p.messageId } });
      continue;
    }
    data.push({ id: p.messageId, content: m.content, messageType: m.messageType, createdAt: m.createdAt });
  }
  return res.json({ success: true, data });
}),
};
