import { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction, Notification } from '../models/index.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isBlockedBetween, getBlockedUserIdSetFor } from '../utils/block.js';
import GroupMessagesChild from './group-child/group.messages.child.js';
import GroupMembersChild from './group-child/group.members.child.js';
import GroupManagementChild from './group-child/group.management.child.js';
import GroupPinsChild from './group-child/group.pins.child.js';
class GroupController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.messagesChild = new GroupMessagesChild(this);
    this.membersChild = new GroupMembersChild(this);
    this.managementChild = new GroupManagementChild(this);
    this.pinsChild = new GroupPinsChild(this);
  }

  getGroupMemberIds = (...args) => this.membersChild.getGroupMemberIds(...args);
  listUserGroups = (...args) => this.managementChild.listUserGroups(...args);
  listCommonGroups = (...args) => this.managementChild.listCommonGroups(...args);
  createGroup = (...args) => this.managementChild.createGroup(...args);
  listMyGroups = (...args) => this.managementChild.listMyGroups(...args);
  deleteGroup = (...args) => this.managementChild.deleteGroup(...args);
  getGroupMessages = (...args) => this.messagesChild.getGroupMessages(...args);
  searchGroupMessages = (...args) => this.messagesChild.searchGroupMessages(...args);
  sendGroupMessage = (...args) => this.messagesChild.sendGroupMessage(...args);
  reactGroupMessage = (...args) => this.messagesChild.reactGroupMessage(...args);
  unreactGroupMessage = (...args) => this.messagesChild.unreactGroupMessage(...args);
  inviteMembers = (...args) => this.membersChild.inviteMembers(...args);
  removeMembers = (...args) => this.membersChild.removeMembers(...args);
  leaveGroup = (...args) => this.membersChild.leaveGroup(...args);
  listMyInvites = (...args) => this.membersChild.listMyInvites(...args);
  acceptGroupInvite = (...args) => this.membersChild.acceptGroupInvite(...args);
  declineGroupInvite = (...args) => this.membersChild.declineGroupInvite(...args);
  updateGroup = (...args) => this.managementChild.updateGroup(...args);
  markGroupMessagesRead = (...args) => this.messagesChild.markGroupMessagesRead(...args);
  deleteAllGroupMessages = (...args) => this.messagesChild.deleteAllGroupMessages(...args);
  togglePinGroup = (...args) => this.pinsChild.togglePinGroup(...args);
  getGroupPinStatus = (...args) => this.pinsChild.getGroupPinStatus(...args);
  updateMemberRole = (...args) => this.membersChild.updateMemberRole(...args);
  listGroupMembers = (...args) => this.membersChild.listGroupMembers(...args);
  togglePinGroupMessage = (...args) => this.pinsChild.togglePinGroupMessage(...args);
  listGroupPinnedMessages = (...args) => this.pinsChild.listGroupPinnedMessages(...args);
  recallGroupMessages = (...args) => this.messagesChild.recallGroupMessages(...args);
  editGroupMessage = (...args) => this.messagesChild.editGroupMessage(...args);
}

const groupController = new GroupController();

export { GroupController };

export default groupController;
