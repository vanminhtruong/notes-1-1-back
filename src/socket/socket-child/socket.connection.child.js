import jwt from 'jsonwebtoken';
import { User, Friendship, GroupMember, Message, GroupMessage } from '../../models/index.js';
import { Op } from 'sequelize';

class SocketConnectionChild {
  constructor(parent) {
    this.parent = parent;
  }

  authenticateSocket = async (socket, next) => {
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

  handleConnection = async (socket) => {
    const userId = socket.userId;
    
    // Check if user was already connected (prevent duplicate logs)
    const prevConn = this.parent.connectedUsers.get(userId);
    const wasConnected = !!prevConn;
    
    // Store connected user
    this.parent.connectedUsers.set(userId, {
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

    // Only log for new connections, not reconnections
    if (!wasConnected) {
      console.log(`User ${socket.user.name} connected (ID: ${userId})`);
    } else {
      const nowTs = Date.now();
      const prevAtTs = prevConn && prevConn.connectedAt ? new Date(prevConn.connectedAt).getTime() : 0;
      const isDuplicateBurst = prevAtTs && (nowTs - prevAtTs < 2000);
      if (!isDuplicateBurst) {
        console.log(`User ${socket.user.name} reconnected (ID: ${userId})`);
      }
    }

    // Join user to their personal room
    socket.join(`user_${userId}`);

    // Send welcome message
    socket.emit('connected', {
      message: 'Kết nối WebSocket thành công',
      user: socket.user,
    });

    // Update message status to delivered for all undelivered messages sent to this user
    await this._updateDeliveredStatus(userId);

    // Notify all friends that this user is online
    await this._notifyFriendsOnline(socket, userId);

    // Also notify all admins that a user is online (admin realtime dashboard)
    await this._notifyAdminsOnline(socket, userId);

    // Register all event handlers
    this.parent.notesChild.registerHandlers(socket, userId);
    this.parent.chatChild.registerHandlers(socket, userId);
    this.parent.groupChild.registerHandlers(socket, userId);
    this.parent.friendsChild.registerHandlers(socket, userId);
    this.parent.callsChild.registerHandlers(socket, userId);

    // Handle disconnection
    socket.on('disconnect', async () => {
      await this.handleDisconnection(socket, userId);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  };

  handleDisconnection = async (socket, userId) => {
    console.log(`User ${socket.user.name} disconnected (ID: ${userId})`);
    this.parent.connectedUsers.delete(userId);

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
    await this._notifyFriendsOffline(socket, userId);

    // Also notify all admins that a user is offline
    await this._notifyAdminsOffline(socket, userId);
  };

  _updateDeliveredStatus = async (userId) => {
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
        // Notify admins for monitoring (DM delivered)
        try {
          await this.parent.adminChild.emitToAllAdmins('admin_message_delivered', {
            messageId: message.id,
            senderId: message.senderId,
            receiverId: message.receiverId,
            status: 'delivered'
          });
        } catch (e) {
          console.error('Error emitting admin_message_delivered:', e);
        }
      }

      // Do the same for group messages where this user is a member
      const userGroups = await GroupMember.findAll({
        where: { userId },
        attributes: ['groupId']
      });
      
      const groupIds = userGroups.map(ug => ug.groupId);
      
      if (groupIds.length > 0) {
        const undeliveredGroupMessages = await GroupMessage.findAll({
          where: {
            groupId: { [Op.in]: groupIds },
            status: 'sent',
            senderId: { [Op.ne]: userId } // Don't update own messages
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
          // Notify admins for monitoring (Group delivered)
          try {
            await this.parent.adminChild.emitToAllAdmins('admin_group_message_delivered', {
              messageId: groupMessage.id,
              groupId: groupMessage.groupId,
              senderId: groupMessage.senderId,
              status: 'delivered'
            });
          } catch (e) {
            console.error('Error emitting admin_group_message_delivered:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error updating delivered status on connection:', error);
    }
  };

  _notifyFriendsOnline = async (socket, userId) => {
    try {
      const friendships = await Friendship.findAll({
        where: {
          [Op.or]: [
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
  };

  _notifyAdminsOnline = async (socket, userId) => {
    try {
      if (global.io) {
        const payload = {
          userId,
          name: socket.user.name,
          email: socket.user.email,
          avatar: socket.user.avatar || null,
          online: true,
          at: new Date(),
        };
        const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
        for (const admin of admins) {
          global.io.to(`user_${admin.id}`).emit('admin_user_online', payload);
        }
      }
    } catch (e) {
      console.error('Error emitting admin_user_online:', e);
    }
  };

  _notifyFriendsOffline = async (socket, userId) => {
    try {
      const friendships = await Friendship.findAll({
        where: {
          [Op.or]: [
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
  };

  _notifyAdminsOffline = async (socket, userId) => {
    try {
      if (global.io) {
        const payload = {
          userId,
          name: socket.user.name,
          email: socket.user.email,
          avatar: socket.user.avatar || null,
          online: false,
          lastSeenAt: new Date(),
        };
        const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
        for (const admin of admins) {
          global.io.to(`user_${admin.id}`).emit('admin_user_offline', payload);
        }
      }
    } catch (e) {
      console.error('Error emitting admin_user_offline:', e);
    }
  };
}

export default SocketConnectionChild;
