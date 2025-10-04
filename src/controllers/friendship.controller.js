import FriendshipManagementChild from '../service/friendship-service/friendship.management.service.js';
import FriendshipRequestsChild from '../service/friendship-service/friendship.requests.service.js';
import FriendshipListChild from '../service/friendship-service/friendship.list.service.js';

class FriendshipController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.managementChild = new FriendshipManagementChild(this);
    this.requestsChild = new FriendshipRequestsChild(this);
    this.listChild = new FriendshipListChild(this);
  }

  getAllUsers = (...args) => this.managementChild.getAllUsers(...args);
  sendFriendRequest = (...args) => this.managementChild.sendFriendRequest(...args);
  removeFriend = (...args) => this.managementChild.removeFriend(...args);
  getFriendRequests = (...args) => this.requestsChild.getFriendRequests(...args);
  getSentRequests = (...args) => this.requestsChild.getSentRequests(...args);
  acceptFriendRequest = (...args) => this.requestsChild.acceptFriendRequest(...args);
  rejectFriendRequest = (...args) => this.requestsChild.rejectFriendRequest(...args);
  getFriends = (...args) => this.listChild.getFriends(...args);
}

const friendshipController = new FriendshipController();

export { FriendshipController };

export default friendshipController;
