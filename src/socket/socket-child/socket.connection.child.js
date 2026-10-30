import { CapacityGate, positiveLimit, installSocketBudget } from '../../utils/chatCapacity.js';
import jwt from 'jsonwebtoken';
import { User, Friendship, GroupMember, Message, GroupMessage } from '../../models/index.js';
import { Op } from 'sequelize';

const setupGate = new CapacityGate(positiveLimit(process.env.CHAT_MAX_CONNECTING, 16));

class SocketConnectionChild {
  constructor(parent) {
    this.parent = parent;
  }

  authenticateSocket = async (socket, next) => {
    const release = setupGate.acquire();
    if (!release) return next(new Error('CHAT_BUSY'));
    socket.releaseChatSetup = release;
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        release();
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'name', 'email', 'avatar', 'role', 'isActive'],
      });
      
      if (!user || !user.isActive) {
        release();
        return next(new Error('Authentication error'));
      }

      socket.userId = user.id;
      socket.user = { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role };
      next();
    } catch (error) {
      release();
      next(new Error('Authentication error'));
    }
  };

  handleConnection = async (socket) => {
    const userId = socket.userId;
    try {
      installSocketBudget(socket);

      // Check if user was already connected (prevent duplicate logs)
      const prevConn = this.parent.connectedUsers.get(userId);
      const wasConnected = !!prevConn;

      // Store connected user
      this.parent.connectedUsers.set(userId, {
        socketId: socket.id,
        user: socket.user,
        connectedAt: new Date(),
      });
      // Register cleanup before the first await: clients can leave during setup.
      socket.on('disconnect', () => {
        void this.handleDisconnection(socket, userId).catch(error => console.error('Socket cleanup failed:', error));
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
      await socket.join(`user_${userId}`);
      if (socket.user.role === 'admin') await socket.join('chat_admins');
      if (!socket.connected) return;

      // Send welcome message
      socket.emit('connected', {
        message: 'Kết nối WebSocket thành công',
        user: { id: socket.user.id, name: socket.user.name, avatar: socket.user.avatar },
      });

      // Register all event handlers
      this.parent.notesChild.registerHandlers(socket, userId);
      this.parent.chatChild.registerHandlers(socket, userId);
      this.parent.groupChild.registerHandlers(socket, userId);
      this.parent.friendsChild.registerHandlers(socket, userId);
      this.parent.callsChild.registerHandlers(socket, userId);

      // Handle errors
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
      if (wasConnected) return;
      // Update message status to delivered for all undelivered messages sent to this user
      await this._updateDeliveredStatus(userId);

      // Notify all friends that this user is online
      await this._notifyFriendsOnline(socket, userId);

      // Also notify all admins that a user is online (admin realtime dashboard)
      await this._notifyAdminsOnline(socket, userId);

    } finally { socket.releaseChatSetup?.(); }
  };

  handleDisconnection = async (socket, userId) => {
    console.log(`User ${socket.user.name} disconnected (ID: ${userId})`);
    // A user remains online until their last tab/device disconnects.
    if ((global.io?.sockets?.adapter?.rooms?.get(`user_${userId}`)?.size ?? 0) > 0) return;
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

  _deliverBacklog = async (model, where, event, adminEvent) => {
    let afterId = 0;
    while (true) {
      const batch = await model.findAll({
        where: { ...where, status: 'sent', id: { [Op.gt]: afterId } },
        attributes: ['id', 'senderId', ...(model === Message ? ['receiverId'] : ['groupId'])],
        order: [['id', 'ASC']], limit: 200,
      });
      if (!batch.length) return;
      await model.update({ status: 'delivered' }, {
        where: { id: { [Op.in]: batch.map(m => m.id) }, status: 'sent' },
      });
      for (const message of batch) {
        const payload = { messageId: message.id, status: 'delivered',
          ...(model === GroupMessage ? { groupId: message.groupId } : {}) };
        global.io?.to(`user_${message.senderId}`).emit(event, payload);
        await this.parent.adminChild.emitToAllAdmins(adminEvent, {
          ...payload, senderId: message.senderId, receiverId: message.receiverId,
        });
      }
      afterId = batch[batch.length - 1].id;
      // Yield between bounded batches so other sockets continue to make progress.
      await new Promise(resolve => setImmediate(resolve));
    }
  };

  _updateDeliveredStatus = async (userId) => {
    try {
      await this._deliverBacklog(Message, { receiverId: userId }, 'message_delivered', 'admin_message_delivered');
      const groups = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
      // Bound IN-list size as well as each message batch.
      for (let i = 0; i < groups.length; i += 100) {
        await this._deliverBacklog(GroupMessage, {
          groupId: { [Op.in]: groups.slice(i, i + 100).map(g => g.groupId) },
          senderId: { [Op.ne]: userId },
        }, 'group_message_delivered', 'admin_group_message_delivered');
      }
    } catch (error) { console.error('Error updating delivered status:', error); }
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
        global.io.to('chat_admins').volatile.emit('admin_user_online', payload);
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
        global.io.to('chat_admins').volatile.emit('admin_user_offline', payload);
      }
    } catch (e) {
      console.error('Error emitting admin_user_offline:', e);
    }
  };
}

export default SocketConnectionChild;
