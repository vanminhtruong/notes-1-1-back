import { User, Message, MessageRead, BlockedUser } from '../../models/index.js';
import { Op } from 'sequelize';

class SocketChatChild {
  constructor(parent) {
    this.parent = parent;
  }

  registerHandlers = (socket, userId) => {
    socket.on('join_chat', async (data) => {
      await this.handleJoinChat(socket, userId, data);
    });

    socket.on('leave_chat', (data) => {
      this.handleLeaveChat(socket, userId, data);
    });

    socket.on('message_sent', async (data) => {
      await this.handleMessageSent(socket, userId, data);
    });

    socket.on('typing_start', async (data) => {
      await this.handleTypingStart(socket, userId, data);
    });

    socket.on('typing_stop', async (data) => {
      await this.handleTypingStop(socket, userId, data);
    });

    socket.on('chat_background_update', async (payload) => {
      await this.handleChatBackgroundUpdate(socket, userId, payload);
    });

    socket.on('message_read', async (data) => {
      await this.handleMessageRead(socket, userId, data);
    });

    socket.on('get_online_status', () => {
      this.handleGetOnlineStatus(socket, userId);
    });
  };

  handleJoinChat = async (socket, userId, data) => {
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
              [Op.or]: [
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
  };

  handleLeaveChat = (socket, userId, data) => {
    const { receiverId } = data;
    const chatRoom = `chat_${Math.min(userId, receiverId)}_${Math.max(userId, receiverId)}`;
    socket.leave(chatRoom);
  };

  handleMessageSent = async (socket, userId, data) => {
    try {
      const { receiverId, message } = data || {};
      if (!receiverId) return;
      // Block guard: if either user has blocked the other, do not forward
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
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
  };

  handleTypingStart = async (socket, userId, data) => {
    try {
      const { receiverId } = data || {};
      if (!receiverId) return;
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
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

      // Also notify admins who this user is typing with (for realtime UserActivity)
      try {
        const withUser = await User.findByPk(receiverId, { attributes: ['id', 'name'] });
        const adminPayload = {
          userId: userId,
          userName: socket.user.name,
          withUserId: receiverId,
          withUserName: withUser ? withUser.name : undefined,
          isTyping: true,
          at: new Date(),
        };
        // Reuse helper to emit to all admins if available at runtime
        if (global.io) {
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of admins) {
            global.io.to(`user_${admin.id}`).emit('admin_user_typing', adminPayload);
          }
        }
      } catch (e) {
        console.error('Error emitting admin_user_typing (start):', e);
      }
    } catch (e) {
      console.error('Error handling typing_start with block guard:', e);
    }
  };

  handleTypingStop = async (socket, userId, data) => {
    try {
      const { receiverId } = data || {};
      if (!receiverId) return;
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
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

      // Notify admins typing has stopped
      try {
        const withUser = await User.findByPk(receiverId, { attributes: ['id', 'name'] });
        const adminPayload = {
          userId: userId,
          userName: socket.user.name,
          withUserId: receiverId,
          withUserName: withUser ? withUser.name : undefined,
          isTyping: false,
          at: new Date(),
        };
        if (global.io) {
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of admins) {
            global.io.to(`user_${admin.id}`).emit('admin_user_typing', adminPayload);
          }
        }
      } catch (e) {
        console.error('Error emitting admin_user_typing (stop):', e);
      }
    } catch (e) {
      console.error('Error handling typing_stop with block guard:', e);
    }
  };

  handleChatBackgroundUpdate = async (socket, userId, payload) => {
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
  };

  handleMessageRead = async (socket, userId, data) => {
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
            [Op.or]: [
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
        // Notify admins for monitoring (DM read)
        try {
          await this.parent.adminChild.emitToAllAdmins('admin_message_read', {
            messageId,
            readerId: userId,
            senderId: message.senderId,
            receiverId: message.receiverId,
            readAt: readRecord.readAt
          });
        } catch (e) {
          console.error('Error emitting admin_message_read:', e);
        }
      }
    } catch (error) {
      console.error('Error handling message_read:', error);
    }
  };

  handleGetOnlineStatus = (socket, userId) => {
    socket.emit('online_status', {
      isOnline: true,
      connectedAt: this.parent.connectedUsers.get(userId)?.connectedAt,
    });
  };
}

export default SocketChatChild;
