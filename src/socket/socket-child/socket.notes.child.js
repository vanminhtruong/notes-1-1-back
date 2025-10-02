class SocketNotesChild {
  constructor(parent) {
    this.parent = parent;
  }

  registerHandlers = (socket, userId) => {
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
  };
}

export default SocketNotesChild;
