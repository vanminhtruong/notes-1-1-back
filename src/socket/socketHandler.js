const jwt = require('jsonwebtoken');
const { User, Friendship, GroupMember, MessageRead, GroupMessageRead, Message, GroupMessage, BlockedUser } = require('../models');

const connectedUsers = new Map(); // Store connected users

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    
    if (!user || !user.isActive) {
      return next(new Error('Authentication error'));
    }

    socket.userId = user.id;
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
};

const handleConnection = async (socket) => {
  const userId = socket.userId;
  
  // Store connected user
  connectedUsers.set(userId, {
    socketId: socket.id,
    user: socket.user,
    connectedAt: new Date(),
  });

  // E2EE status sync across user's devices
  socket.on('e2ee_status', (payload) => {
    try {
      const enabled = !!(payload && payload.enabled);
      socket.to(`user_${userId}`).emit('e2ee_status', { enabled });
    } catch (e) {
      // ignore
    }
  });

  socket.on('e2ee_pin_updated', (payload) => {
    try {
      const pinHash = payload ? payload.pinHash || null : null;
      socket.to(`user_${userId}`).emit('e2ee_pin_updated', { pinHash });
    } catch (e) {
      // ignore
    }
  });

  console.log(`User ${socket.user.name} connected (ID: ${userId})`);

  // Join user to their personal room
  socket.join(`user_${userId}`);

  // Send welcome message
  socket.emit('connected', {
    message: 'Kết nối WebSocket thành công',
    user: socket.user,
  });

  // Update message status to delivered for all undelivered messages sent to this user
  try {
    const undeliveredMessages = await Message.findAll({
      where: {
        receiverId: userId,
        status: 'sent'
      },
      include: [{ model: User, as: 'sender', attributes: ['id'] }]
    });

    for (const message of undeliveredMessages) {
      await message.update({ status: 'delivered' });
      
      // Notify sender about delivery
      global.io && global.io.to(`user_${message.senderId}`).emit('message_delivered', {
        messageId: message.id,
        status: 'delivered'
      });
    }

    // Do the same for group messages where this user is a member
    const { GroupMember } = require('../models');
    const userGroups = await GroupMember.findAll({
      where: { userId },
      attributes: ['groupId']
    });
    
    const groupIds = userGroups.map(ug => ug.groupId);
    
    if (groupIds.length > 0) {
      const undeliveredGroupMessages = await GroupMessage.findAll({
        where: {
          groupId: { [require('sequelize').Op.in]: groupIds },
          status: 'sent',
          senderId: { [require('sequelize').Op.ne]: userId } // Don't update own messages
        }
      });

      for (const groupMessage of undeliveredGroupMessages) {
        await groupMessage.update({ status: 'delivered' });
        
        // Notify sender about delivery
        global.io && global.io.to(`user_${groupMessage.senderId}`).emit('group_message_delivered', {
          messageId: groupMessage.id,
          groupId: groupMessage.groupId,
          status: 'delivered'
        });
      }
    }
  } catch (error) {
    console.error('Error updating delivered status on connection:', error);
  }

  // Notify all friends that this user is online
  try {
    const friendships = await Friendship.findAll({
      where: {
        [require('sequelize').Op.or]: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' }
        ]
      }
    });

    for (const friendship of friendships) {
      const friendId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
      if (friendId) {
        global.io && global.io.to(`user_${friendId}`).emit('user_online', {
          userId,
          name: socket.user.name
        });
      }
    }
  } catch (e) {
    console.error('Error notifying friends about online status:', e);
  }

  // Handle note events
  socket.on('note_created', (data) => {
    // Broadcast to user's other devices/tabs
    socket.to(`user_${userId}`).emit('note_created', data);
  });

  socket.on('note_updated', (data) => {
    socket.to(`user_${userId}`).emit('note_updated', data);
  });

  socket.on('note_deleted', (data) => {
    socket.to(`user_${userId}`).emit('note_deleted', data);
  });

  socket.on('note_archived', (data) => {
    socket.to(`user_${userId}`).emit('note_archived', data);
  });

  // Handle chat events
  socket.on('join_chat', async (data) => {
    const { receiverId } = data;
    const chatRoom = `chat_${Math.min(userId, receiverId)}_${Math.max(userId, receiverId)}`;
    socket.join(chatRoom);

    // When opening a chat, immediately mark partner->me messages as read and emit receipts
    try {
      if (!receiverId) return;
      // Find unread messages sent by the chat partner to current user
      const toMarkRead = await Message.findAll({
        where: {
          senderId: receiverId,
          receiverId: userId,
          isRead: false,
        }
      });

      if (toMarkRead && toMarkRead.length > 0) {
        // Persist read state (backend source of truth)
        await Message.update(
          { isRead: true },
          { where: { senderId: receiverId, receiverId: userId, isRead: false } }
        );

        // Only emit read receipts if BOTH users enabled it
        const me = await User.findByPk(userId);
        const other = await User.findByPk(receiverId);
        if (me && other && me.readStatusEnabled && other.readStatusEnabled) {
          // Suppress read receipt emissions if either party has blocked the other
          const blocked = await BlockedUser.findOne({
            where: {
              [require('sequelize').Op.or]: [
                { userId: userId, blockedUserId: receiverId },
                { userId: receiverId, blockedUserId: userId },
              ],
            },
          });
          if (!blocked) {
            for (const m of toMarkRead) {
              // Create read record idempotently
              const [rec] = await MessageRead.findOrCreate({
                where: { messageId: m.id, userId },
                defaults: { messageId: m.id, userId, readAt: new Date() }
              });

              // Update message status to 'read'
              if (m.status !== 'read') {
                await m.update({ status: 'read' });
              }

              // Notify the sender with avatar info
              const userPayload = { id: me.id, name: me.name, avatar: me.avatar };
              global.io && global.io.to(`user_${receiverId}`).emit('message_read', {
                messageId: m.id,
                userId,
                readAt: rec.readAt,
                user: userPayload,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Error handling join_chat read sync:', e);
    }
  });

  socket.on('leave_chat', (data) => {
    const { receiverId } = data;
    const chatRoom = `chat_${Math.min(userId, receiverId)}_${Math.max(userId, receiverId)}`;
    socket.leave(chatRoom);
  });

  socket.on('message_sent', async (data) => {
    try {
      const { receiverId, message } = data || {};
      if (!receiverId) return;
      // Block guard: if either user has blocked the other, do not forward
      const blocked = await BlockedUser.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { userId: userId, blockedUserId: receiverId },
            { userId: receiverId, blockedUserId: userId },
          ],
        },
      });
      if (blocked) {
        socket.emit('message_blocked', { receiverId });
        return;
      }
      // Emit to receiver's personal room
      socket.to(`user_${receiverId}`).emit('new_message', {
        ...message,
        senderId: userId,
        senderName: socket.user.name
      });
    } catch (e) {
      console.error('Error handling message_sent with block guard:', e);
    }
  });

  socket.on('typing_start', async (data) => {
    try {
      const { receiverId } = data || {};
      if (!receiverId) return;
      const blocked = await BlockedUser.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { userId: userId, blockedUserId: receiverId },
            { userId: receiverId, blockedUserId: userId },
          ],
        },
      });
      if (blocked) return;
      socket.to(`user_${receiverId}`).emit('user_typing', {
        userId: userId,
        userName: socket.user.name,
        isTyping: true
      });
    } catch (e) {
      console.error('Error handling typing_start with block guard:', e);
    }
  });

  socket.on('typing_stop', async (data) => {
    try {
      const { receiverId } = data || {};
      if (!receiverId) return;
      const blocked = await BlockedUser.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { userId: userId, blockedUserId: receiverId },
            { userId: receiverId, blockedUserId: userId },
          ],
        },
      });
      if (blocked) return;
      socket.to(`user_${receiverId}`).emit('user_typing', {
        userId: userId,
        userName: socket.user.name,
        isTyping: false
      });
    } catch (e) {
      console.error('Error handling typing_stop with block guard:', e);
    }
  });

  // Group typing indicator: broadcast to all group members except the sender
  socket.on('group_typing', async (data) => {
    try {
      const { groupId, isTyping } = data || {};
      if (!groupId) return;
      // Ensure the emitter is a member of the group
      const membership = await GroupMember.findOne({ where: { groupId, userId } });
      if (!membership) return;
      const members = await GroupMember.findAll({ where: { groupId } });
      for (const m of members) {
        const memberId = m.userId;
        if (memberId === userId) continue;
        global.io && global.io.to(`user_${memberId}`).emit('group_typing', {
          groupId,
          userId,
          isTyping: !!isTyping,
        });
      }
    } catch (e) {
      console.error('Error handling group_typing:', e);
    }
  });

  // Realtime per-chat background update (1-1 chat)
  socket.on('chat_background_update', async (payload) => {
    try {
      const otherUserId = payload && payload.userId;
      const backgroundUrl = payload ? payload.backgroundUrl ?? null : null;
      if (!otherUserId) return;

      // Notify the other user (their selectedChatId will be current user's id)
      global.io && global.io.to(`user_${otherUserId}`).emit('chat_background_update', {
        userId: userId,
        backgroundUrl,
      });

      // Notify my other devices/tabs (their selectedChatId equals otherUserId)
      socket.to(`user_${userId}`).emit('chat_background_update', {
        userId: otherUserId,
        backgroundUrl,
      });
    } catch (e) {
      console.error('Error handling chat_background_update:', e);
    }
  });

  // 1-1 Voice call signaling (audio only for now)
  // Events: call_request -> call_incoming, call_accept -> call_accepted,
  // call_reject -> call_rejected, call_signal <-> call_signal, call_end -> call_ended, call_cancel -> call_cancelled
  socket.on('call_request', async (payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      if (!to || !callId) return;
      // Block guard
      const blocked = await BlockedUser.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { userId: userId, blockedUserId: to },
            { userId: to, blockedUserId: userId },
          ],
        },
      });
      if (blocked) {
        socket.emit('call_rejected', { callId, by: { id: to }, reason: 'blocked' });
        return;
      }
      // If callee not online, immediately notify caller
      if (!connectedUsers.has(to)) {
        socket.emit('call_rejected', { callId, by: { id: to }, reason: 'offline' });
        return;
      }
      // Forward incoming call to callee's personal room
      global.io && global.io.to(`user_${to}`).emit('call_incoming', {
        callId,
        from: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
      });
    } catch (e) {
      console.error('Error handling call_request:', e);
    }
  });

  socket.on('call_accept', async (payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      if (!to || !callId) return;
      // Block guard (redundant but consistent)
      const blocked = await BlockedUser.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { userId: userId, blockedUserId: to },
            { userId: to, blockedUserId: userId },
          ],
        },
      });
      if (blocked) {
        socket.emit('call_rejected', { callId, by: { id: to }, reason: 'blocked' });
        return;
      }
      global.io && global.io.to(`user_${to}`).emit('call_accepted', {
        callId,
        by: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
      });
    } catch (e) {
      console.error('Error handling call_accept:', e);
    }
  });

  socket.on('call_reject', (payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      const reason = payload && String(payload.reason || 'rejected');
      if (!to || !callId) return;
      global.io && global.io.to(`user_${to}`).emit('call_rejected', {
        callId,
        by: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
        reason,
      });
    } catch (e) {
      console.error('Error handling call_reject:', e);
    }
  });

  socket.on('call_signal', (payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      const data = payload && payload.data;
      if (!to || !callId || !data) return;
      // Forward WebRTC signaling data
      global.io && global.io.to(`user_${to}`).emit('call_signal', {
        callId,
        from: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
        data,
      });
    } catch (e) {
      console.error('Error handling call_signal:', e);
    }
  });

  socket.on('call_end', (payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      if (!to || !callId) return;
      global.io && global.io.to(`user_${to}`).emit('call_ended', {
        callId,
        by: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
      });
    } catch (e) {
      console.error('Error handling call_end:', e);
    }
  });

  socket.on('call_cancel', (payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      if (!to || !callId) return;
      global.io && global.io.to(`user_${to}`).emit('call_cancelled', {
        callId,
        by: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
      });
    } catch (e) {
      console.error('Error handling call_cancel:', e);
    }
  });

  // Handle message read receipts for 1:1 chats
  socket.on('message_read', async (data) => {
    try {
      const { messageId, chatId } = data;
      
      // Check if BOTH users have read status enabled
      const message = await Message.findByPk(messageId);
      if (!message) return;
      
      const currentUser = await User.findByPk(userId);
      const senderUser = await User.findByPk(message.senderId);
      
      if (!currentUser || !senderUser || !currentUser.readStatusEnabled || !senderUser.readStatusEnabled) {
        return; // Don't send read receipts if either user has it disabled
      }
      
      // Record read receipt in database
      const [readRecord, created] = await MessageRead.findOrCreate({
        where: { messageId, userId },
        defaults: { 
          messageId, 
          userId, 
          readAt: new Date() 
        }
      });

      if (created || readRecord) {
        // Update message status
        await Message.update(
          { status: 'read' },
          { where: { id: messageId } }
        );

        // Get user info for avatar display
        const user = await User.findByPk(userId, {
          attributes: ['id', 'name', 'avatar']
        });

        // Before notifying sender, suppress if a block exists between users
        const blocked = await BlockedUser.findOne({
          where: {
            [require('sequelize').Op.or]: [
              { userId: userId, blockedUserId: message.senderId },
              { userId: message.senderId, blockedUserId: userId },
            ],
          },
        });
        if (blocked) return;

        // Notify sender about read receipt
        socket.to(`user_${message.senderId}`).emit('message_read', {
          messageId,
          userId,
          readAt: readRecord.readAt,
          user
        });
      }
    } catch (error) {
      console.error('Error handling message_read:', error);
    }
  });

  // Handle group message read receipts
  socket.on('group_message_read', async (data) => {
    try {
      const { messageId, groupId } = data;
      
      // Check if BOTH current user and message sender have read status enabled
      const message = await GroupMessage.findByPk(messageId);
      if (!message) return;
      
      const currentUser = await User.findByPk(userId);
      const senderUser = await User.findByPk(message.senderId);
      
      if (!currentUser || !senderUser || !currentUser.readStatusEnabled || !senderUser.readStatusEnabled) {
        return; // Don't send read receipts if either user has it disabled
      }
      
      // Verify user is group member
      const membership = await GroupMember.findOne({ 
        where: { groupId, userId } 
      });
      if (!membership) return;

      // Record read receipt with retry for database lock
      let readRecord, created;
      let retries = 3;
      while (retries > 0) {
        try {
          [readRecord, created] = await GroupMessageRead.findOrCreate({
            where: { messageId, userId },
            defaults: { 
              messageId, 
              userId, 
              readAt: new Date() 
            }
          });
          break; // Success, exit retry loop
        } catch (error) {
          retries--;
          if (error.name === 'SequelizeTimeoutError' && error.original?.code === 'SQLITE_BUSY' && retries > 0) {
            console.log(`Database busy, retrying... (${3 - retries}/3)`);
            await new Promise(resolve => setTimeout(resolve, 100 * (3 - retries))); // Exponential backoff
          } else {
            throw error; // Re-throw if not a retry-able error or out of retries
          }
        }
      }

      if (created || readRecord) {
        // Update message status
        await GroupMessage.update(
          { status: 'read' },
          { where: { id: messageId } }
        );

        // Get user info
        const user = await User.findByPk(userId, {
          attributes: ['id', 'name', 'avatar']
        });

        // Notify all group members about read receipt
        const members = await GroupMember.findAll({ where: { groupId } });
        for (const member of members) {
          if (member.userId !== userId) {
            global.io && global.io.to(`user_${member.userId}`).emit('group_message_read', {
              messageId,
              groupId,
              userId,
              readAt: readRecord.readAt,
              user
            });
          }
        }
      }
    } catch (error) {
      console.error('Error handling group_message_read:', error);
    }
  });

  // Handle friend request events
  socket.on('friend_request_sent', (data) => {
    const { receiverId, requester } = data;
    socket.to(`user_${receiverId}`).emit('new_friend_request', {
      requester: requester,
      createdAt: new Date()
    });
  });

  socket.on('friend_request_accepted', (data) => {
    const { requesterId, acceptedBy } = data;
    socket.to(`user_${requesterId}`).emit('friend_request_accepted', {
      acceptedBy: acceptedBy,
      acceptedAt: new Date()
    });
  });

  socket.on('friend_request_rejected', (data) => {
    const { requesterId, rejectedBy } = data;
    socket.to(`user_${requesterId}`).emit('friend_request_rejected', {
      rejectedBy: rejectedBy,
      rejectedAt: new Date()
    });
  });

  // Handle user status
  socket.on('get_online_status', () => {
    socket.emit('online_status', {
      isOnline: true,
      connectedAt: connectedUsers.get(userId)?.connectedAt,
    });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`User ${socket.user.name} disconnected (ID: ${userId})`);
    connectedUsers.delete(userId);

    // Update user's lastSeenAt timestamp
    try {
      await User.update(
        { lastSeenAt: new Date() },
        { where: { id: userId } }
      );
    } catch (e) {
      console.error('Error updating lastSeenAt:', e);
    }

    // Notify all friends that this user is offline
    try {
      const friendships = await Friendship.findAll({
        where: {
          [require('sequelize').Op.or]: [
            { requesterId: userId, status: 'accepted' },
            { addresseeId: userId, status: 'accepted' }
          ]
        }
      });

      for (const friendship of friendships) {
        const friendId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
        if (friendId) {
          global.io && global.io.to(`user_${friendId}`).emit('user_offline', {
            userId,
            name: socket.user.name,
            lastSeenAt: new Date()
          });
        }
      }
    } catch (e) {
      console.error('Error notifying friends about offline status:', e);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
};

const emitToUser = (userId, event, data) => {
  const userConnection = connectedUsers.get(userId);
  if (userConnection) {
    global.io.to(`user_${userId}`).emit(event, data);
  }
};

const getConnectedUsers = () => {
  return Array.from(connectedUsers.values()).map(conn => ({
    user: conn.user,
    connectedAt: conn.connectedAt,
  }));
};

const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

module.exports = {
  authenticateSocket,
  handleConnection,
  emitToUser,
  getConnectedUsers,
  isUserOnline,
};
