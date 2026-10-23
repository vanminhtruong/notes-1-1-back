class SocketUtilsChild {
  constructor(parent) {
    this.parent = parent;
  }

  emitToUser = (userId, event, data) => {
    // Always emit to user's room, regardless of whether they're in connectedUsers map
    // This ensures the event is sent to all of user's connected devices
    if (global.io) {
      global.io.to(`user_${userId}`).emit(event, data);
    }
  };

  getConnectedUsers = () => {
    return Array.from(this.parent.connectedUsers.values()).map(conn => ({
      user: conn.user,
      connectedAt: conn.connectedAt,
    }));
  };

  isUserOnline = (userId) => {
    const rooms = global.io?.sockets?.adapter?.rooms;
    if (rooms) return (rooms.get(`user_${userId}`)?.size ?? 0) > 0;
    return this.parent.connectedUsers.has(Number(userId));
  };
}

export default SocketUtilsChild;
