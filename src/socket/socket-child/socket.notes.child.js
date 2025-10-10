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

    // Folder events
    socket.on('folder_created', (data) => {
      socket.to(`user_${userId}`).emit('folder_created', data);
    });

    socket.on('folder_updated', (data) => {
      socket.to(`user_${userId}`).emit('folder_updated', data);
    });

    socket.on('folder_deleted', (data) => {
      socket.to(`user_${userId}`).emit('folder_deleted', data);
    });

    socket.on('note_moved_to_folder', (data) => {
      socket.to(`user_${userId}`).emit('note_moved_to_folder', data);
    });

    // Category events
    socket.on('category_created', (data) => {
      socket.to(`user_${userId}`).emit('category_created', data);
    });

    socket.on('category_updated', (data) => {
      socket.to(`user_${userId}`).emit('category_updated', data);
    });

    socket.on('category_deleted', (data) => {
      socket.to(`user_${userId}`).emit('category_deleted', data);
    });
  };
}

export default SocketNotesChild;
