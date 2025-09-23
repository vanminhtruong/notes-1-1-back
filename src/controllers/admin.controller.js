const { User, Note, Message, Group, GroupMember, Friendship, GroupMessage, Notification } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { emitToAllAdmins, isUserOnline, emitToUser } = require('../socket/socketHandler');
const AdminNotesChild = require('./group-child/admin.notes.child');
const AdminMessagesChild = require('./group-child/admin.messages.child');
const AdminMonitorChild = require('./group-child/admin.monitor.child');
const AdminUsersChild = require('./group-child/admin.users.child');
const AdminAuthChild = require('./group-child/admin.auth.child');
// class này đã quá dài hãy tạo ra class con kế thừa để xử lý
class AdminController {
  constructor() {
    // Attach child controller to keep class short while preserving API surface
    this.notesChild = new AdminNotesChild(this);
    this.messagesChild = new AdminMessagesChild(this);
    this.monitorChild = new AdminMonitorChild(this);
    this.usersChild = new AdminUsersChild(this);
    this.authChild = new AdminAuthChild(this);
  }

  // Admin login (delegated)
  adminLogin = (...args) => this.authChild.adminLogin(...args);
  adminGetUserNotifications = (...args) => this.notesChild.adminGetUserNotifications(...args);
  adminDeleteUserNotification = (...args) => this.notesChild.adminDeleteUserNotification(...args);
  adminGetGroupMembers = (...args) => this.monitorChild.adminGetGroupMembers(...args);
  adminGetDMMessages = (...args) => this.monitorChild.adminGetDMMessages(...args);
  adminGetGroupMessages = (...args) => this.monitorChild.adminGetGroupMessages(...args);
  adminRecallDMMessage = (...args) => this.messagesChild.adminRecallDMMessage(...args);
  adminDeleteDMMessage = (...args) => this.messagesChild.adminDeleteDMMessage(...args);
  adminRecallGroupMessage = (...args) => this.messagesChild.adminRecallGroupMessage(...args);
  adminDeleteGroupMessage = (...args) => this.messagesChild.adminDeleteGroupMessage(...args);
  getAllUsersNotes = (...args) => this.notesChild.getAllUsersNotes(...args);
  createNoteForUser = (...args) => this.notesChild.createNoteForUser(...args)
  updateUserNote = (...args) => this.notesChild.updateUserNote(...args);
  deleteUserNote = (...args) => this.notesChild.deleteUserNote(...args);
  getUserActivity = (...args) => this.monitorChild.getUserActivity(...args);
  getAllUsers = (...args) => this.usersChild.getAllUsers(...args)
  toggleUserStatus = (...args) => this.usersChild.toggleUserStatus(...args);
  deleteUserPermanently = (...args) => this.usersChild.deleteUserPermanently(...args);
  refreshToken = (...args) => this.authChild.refreshToken(...args);
}

const adminController = new AdminController();

module.exports = {
  AdminController,
  // export bound instance methods so external code uses class-based handlers
  adminLogin: adminController.adminLogin,
  getAllUsersNotes: adminController.getAllUsersNotes,
  createNoteForUser: adminController.createNoteForUser,
  updateUserNote: adminController.updateUserNote,
  deleteUserNote: adminController.deleteUserNote,
  getUserActivity: adminController.getUserActivity,
  getAllUsers: adminController.getAllUsers,
  toggleUserStatus: adminController.toggleUserStatus,
  deleteUserPermanently: adminController.deleteUserPermanently,
  adminGetDMMessages: adminController.adminGetDMMessages,
  adminGetGroupMessages: adminController.adminGetGroupMessages,
  adminGetGroupMembers: adminController.adminGetGroupMembers,
  adminGetUserNotifications: adminController.adminGetUserNotifications,
  adminDeleteUserNotification: adminController.adminDeleteUserNotification,
  adminRecallDMMessage: adminController.adminRecallDMMessage,
  adminDeleteDMMessage: adminController.adminDeleteDMMessage,
  adminRecallGroupMessage: adminController.adminRecallGroupMessage,
  adminDeleteGroupMessage: adminController.adminDeleteGroupMessage,
  refreshToken: adminController.refreshToken,
};
