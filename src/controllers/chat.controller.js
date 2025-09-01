const { User, Message, Friendship, MessageRead, ChatPreference } = require('../models');
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
    const unreadMessages = await Message.findAll({
      where: {
        senderId: userId,
        receiverId: currentUserId,
        isRead: true, // now marked read above; create receipts only once
      }
    });

    for (const message of unreadMessages) {
      // Create read record (idempotent)
      await MessageRead.findOrCreate({
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
    }
  }

  res.json({
    success: true,
    data: filtered.reverse(), // Reverse to show oldest first
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
    
    // Send to sender with correct status
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
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] },
      { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
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

  // Sort by last message timestamp
  chatList.sort((a, b) => {
    const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0);
    const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0);
    return bTime - aTime;
  });

  res.json({
    success: true,
    data: chatList
  });
});

// Mark messages as read (always persist read state; read receipts handled elsewhere)
const markMessagesAsRead = asyncHandler(async (req, res) => {
  const { senderId } = req.params;
  const receiverId = req.user.id;

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

  // Only emit socket event to current user (delete for me only)
  const io = req.app.get('io');
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
  sendMessage,
  getChatList,
  markMessagesAsRead,
  getUnreadCount,
  deleteAllMessages,
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
    } else {
      await Message.update({ isDeletedForAll: true }, { where: { id: { [Op.in]: messageIds } } });
    }

    // Prepare socket emission
    const io = req.app.get('io');
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

    const pref = await ChatPreference.findOne({ where: { userId: currentUserId, otherUserId: userId } });
    return res.json({ success: true, data: { backgroundUrl: pref?.backgroundUrl || null } });
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
  })
};
