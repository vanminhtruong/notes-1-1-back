const { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction, Notification } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isBlockedBetween, getBlockedUserIdSetFor } = require('../utils/block');
const GroupMessagesChild = require('./group-child/group.messages.child');
const GroupMembersChild = require('./group-child/group.members.child');
const GroupManagementChild = require('./group-child/group.management.child');
const GroupPinsChild = require('./group-child/group.pins.child');
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

module.exports = {
  GroupController,
  // export bound instance methods so external code uses class-based handlers
  createGroup: groupController.createGroup,
  listMyGroups: groupController.listMyGroups,
  listUserGroups: groupController.listUserGroups,
  listCommonGroups: groupController.listCommonGroups,
  getGroupMessages: groupController.getGroupMessages,
  searchGroupMessages: groupController.searchGroupMessages,
  sendGroupMessage: groupController.sendGroupMessage,
  reactGroupMessage: groupController.reactGroupMessage,
  unreactGroupMessage: groupController.unreactGroupMessage,
  recallGroupMessages: groupController.recallGroupMessages,
  editGroupMessage: groupController.editGroupMessage,
  deleteAllGroupMessages: groupController.deleteAllGroupMessages,
  inviteMembers: groupController.inviteMembers,
  removeMembers: groupController.removeMembers,
  leaveGroup: groupController.leaveGroup,
  updateGroup: groupController.updateGroup,
  deleteGroup: groupController.deleteGroup,
  acceptGroupInvite: groupController.acceptGroupInvite,
  declineGroupInvite: groupController.declineGroupInvite,
  listMyInvites: groupController.listMyInvites,
  markGroupMessagesRead: groupController.markGroupMessagesRead,
  togglePinGroup: groupController.togglePinGroup,
  getGroupPinStatus: groupController.getGroupPinStatus,
  updateMemberRole: groupController.updateMemberRole,
  listGroupMembers: groupController.listGroupMembers,
  togglePinGroupMessage: groupController.togglePinGroupMessage,
  listGroupPinnedMessages: groupController.listGroupPinnedMessages,
};
