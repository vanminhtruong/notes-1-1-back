class SocketFriendsChild {
  constructor(parent) {
    this.parent = parent;
  }

  registerHandlers = (socket, userId) => {
    socket.on('friend_request_sent', (data) => {
      this.handleFriendRequestSent(socket, userId, data);
    });

    socket.on('friend_request_accepted', (data) => {
      this.handleFriendRequestAccepted(socket, userId, data);
    });

    socket.on('friend_request_rejected', (data) => {
      this.handleFriendRequestRejected(socket, userId, data);
    });
  };

  handleFriendRequestSent = (socket, userId, data) => {
    const { receiverId, requester } = data;
    socket.to(`user_${receiverId}`).emit('new_friend_request', {
      requester: requester,
      createdAt: new Date()
    });
  };

  handleFriendRequestAccepted = (socket, userId, data) => {
    const { requesterId, acceptedBy } = data;
    socket.to(`user_${requesterId}`).emit('friend_request_accepted', {
      acceptedBy: acceptedBy,
      acceptedAt: new Date()
    });
  };

  handleFriendRequestRejected = (socket, userId, data) => {
    const { requesterId, rejectedBy } = data;
    socket.to(`user_${requesterId}`).emit('friend_request_rejected', {
      rejectedBy: rejectedBy,
      rejectedAt: new Date()
    });
  };
}

export default SocketFriendsChild;
