import SocketConnectionChild from './socket-child/socket.connection.child.js';
import SocketChatChild from './socket-child/socket.chat.child.js';
import SocketGroupChild from './socket-child/socket.group.child.js';
import SocketNotesChild from './socket-child/socket.notes.child.js';
import SocketFriendsChild from './socket-child/socket.friends.child.js';
import SocketCallsChild from './socket-child/socket.calls.child.js';
import SocketAdminChild from './socket-child/socket.admin.child.js';
import SocketUtilsChild from './socket-child/socket.utils.child.js';

class SocketHandler {
  constructor() {
    this.connectedUsers = new Map(); // Store connected users
    
    // Initialize child handlers
    this.connectionChild = new SocketConnectionChild(this);
    this.chatChild = new SocketChatChild(this);
    this.groupChild = new SocketGroupChild(this);
    this.notesChild = new SocketNotesChild(this);
    this.friendsChild = new SocketFriendsChild(this);
    this.callsChild = new SocketCallsChild(this);
    this.adminChild = new SocketAdminChild(this);
    this.utilsChild = new SocketUtilsChild(this);
  }

  // Delegate authentication to child
  authenticateSocket = (...args) => this.connectionChild.authenticateSocket(...args);
  
  // Delegate connection handling to child
  handleConnection = (...args) => this.connectionChild.handleConnection(...args);

  // Delegate utility methods to utilsChild
  emitToUser = (...args) => this.utilsChild.emitToUser(...args);
  getConnectedUsers = (...args) => this.utilsChild.getConnectedUsers(...args);
  isUserOnline = (...args) => this.utilsChild.isUserOnline(...args);

  // Delegate admin methods to adminChild
  emitToAllAdmins = (...args) => this.adminChild.emitToAllAdmins(...args);
  emitToAdminsWithPermission = (...args) => this.adminChild.emitToAdminsWithPermission(...args);
  emitToSuperAdmins = (...args) => this.adminChild.emitToSuperAdmins(...args);
}

// Create singleton instance
const socketHandler = new SocketHandler();

// Legacy function exports that delegate to the class instance (backwards compatibility)
const authenticateSocket = (...args) => socketHandler.authenticateSocket(...args);
const handleConnection = (...args) => socketHandler.handleConnection(...args);
const emitToUser = (...args) => socketHandler.emitToUser(...args);
const emitToAllAdmins = (...args) => socketHandler.emitToAllAdmins(...args);
const emitToAdminsWithPermission = (...args) => socketHandler.emitToAdminsWithPermission(...args);
const emitToSuperAdmins = (...args) => socketHandler.emitToSuperAdmins(...args);
const getConnectedUsers = (...args) => socketHandler.getConnectedUsers(...args);
const isUserOnline = (...args) => socketHandler.isUserOnline(...args);

// Export class for advanced usage
export { SocketHandler };

// Export all functions as named exports (backwards compatibility)
export {
  authenticateSocket,
  handleConnection,
  emitToUser,
  emitToAllAdmins,
  emitToAdminsWithPermission,
  emitToSuperAdmins,
  getConnectedUsers,
  isUserOnline,
};
