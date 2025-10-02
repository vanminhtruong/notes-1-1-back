import { BlockedUser } from '../../models/index.js';
import { Op } from 'sequelize';

class SocketCallsChild {
  constructor(parent) {
    this.parent = parent;
  }

  registerHandlers = (socket, userId) => {
    // 1-1 Voice call signaling (audio only for now)
    // Events: call_request -> call_incoming, call_accept -> call_accepted,
    // call_reject -> call_rejected, call_signal <-> call_signal, call_end -> call_ended, call_cancel -> call_cancelled
    socket.on('call_request', async (payload) => {
      await this.handleCallRequest(socket, userId, payload);
    });

    socket.on('call_accept', async (payload) => {
      await this.handleCallAccept(socket, userId, payload);
    });

    socket.on('call_reject', (payload) => {
      this.handleCallReject(socket, userId, payload);
    });

    socket.on('call_signal', (payload) => {
      this.handleCallSignal(socket, userId, payload);
    });

    socket.on('call_end', (payload) => {
      this.handleCallEnd(socket, userId, payload);
    });

    socket.on('call_cancel', (payload) => {
      this.handleCallCancel(socket, userId, payload);
    });
  };

  handleCallRequest = async (socket, userId, payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      if (!to || !callId) return;
      // Block guard
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
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
      if (!this.parent.connectedUsers.has(to)) {
        socket.emit('call_rejected', { callId, by: { id: to }, reason: 'offline' });
        return;
      }
      // Forward incoming call to callee's personal room (include media type if provided)
      global.io && global.io.to(`user_${to}`).emit('call_incoming', {
        callId,
        from: { id: userId, name: socket.user.name, avatar: socket.user.avatar || null },
        media: payload && (payload.media === 'video' ? 'video' : 'audio'),
      });
    } catch (e) {
      console.error('Error handling call_request:', e);
    }
  };

  handleCallAccept = async (socket, userId, payload) => {
    try {
      const to = payload && Number(payload.to);
      const callId = payload && String(payload.callId || '');
      if (!to || !callId) return;
      // Block guard (redundant but consistent)
      const blocked = await BlockedUser.findOne({
        where: {
          [Op.or]: [
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
  };

  handleCallReject = (socket, userId, payload) => {
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
  };

  handleCallSignal = (socket, userId, payload) => {
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
  };

  handleCallEnd = (socket, userId, payload) => {
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
  };

  handleCallCancel = (socket, userId, payload) => {
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
  };
}

export default SocketCallsChild;
