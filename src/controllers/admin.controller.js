import { User, Note, Message, Group, GroupMember, Friendship, GroupMessage, Notification } from '../models/index.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import { emitToAllAdmins, isUserOnline, emitToUser } from '../socket/socketHandler.js';
import AdminNotesChild from '../service/admin-service/admin.notes.service.js';
import AdminMessagesChild from '../service/admin-service/admin.messages.service.js';
import AdminMonitorChild from '../service/admin-service/admin.monitor.service.js';
import AdminUsersChild from '../service/admin-service/admin.users.service.js';
import AdminAuthChild from '../service/admin-service/admin.auth.service.js';
import AdminProfileChild from '../service/admin-service/admin.profile.service.js';

// class này đã quá dài hãy tạo ra class con kế thừa để xử lý
class AdminController {
  constructor() {
    // Attach child controller to keep class short while preserving API surface
    this.notesChild = new AdminNotesChild(this);
    this.messagesChild = new AdminMessagesChild(this);
    this.monitorChild = new AdminMonitorChild(this);
    this.usersChild = new AdminUsersChild(this);
    this.authChild = new AdminAuthChild(this);
    this.profileChild = new AdminProfileChild(this);
  }

  // Admin login (delegated)
  adminLogin = (...args) => this.authChild.adminLogin(...args);
  adminGetUserNotifications = (...args) => this.notesChild.adminGetUserNotifications(...args);
  adminDeleteUserNotification = (...args) => this.notesChild.adminDeleteUserNotification(...args);
  adminDeleteAllUserNotifications = (...args) => this.notesChild.adminDeleteAllUserNotifications(...args);
  adminGetGroupMembers = (...args) => this.monitorChild.adminGetGroupMembers(...args);
  adminGetDMMessages = (...args) => this.monitorChild.adminGetDMMessages(...args);
  adminGetGroupMessages = (...args) => this.monitorChild.adminGetGroupMessages(...args);
  adminRecallDMMessage = (...args) => this.messagesChild.adminRecallDMMessage(...args);
  adminDeleteDMMessage = (...args) => this.messagesChild.adminDeleteDMMessage(...args);
  adminEditDMMessage = (...args) => this.messagesChild.adminEditDMMessage(...args);
  adminRecallGroupMessage = (...args) => this.messagesChild.adminRecallGroupMessage(...args);
  adminDeleteGroupMessage = (...args) => this.messagesChild.adminDeleteGroupMessage(...args);
  adminEditGroupMessage = (...args) => this.messagesChild.adminEditGroupMessage(...args);
  getAllUsersNotes = (...args) => this.notesChild.getAllUsersNotes(...args);
  createNoteForUser = (...args) => this.notesChild.createNoteForUser(...args)
  updateUserNote = (...args) => this.notesChild.updateUserNote(...args);
  deleteUserNote = (...args) => this.notesChild.deleteUserNote(...args);
  getAllSharedNotes = (...args) => this.notesChild.getAllSharedNotes(...args);
  getSharedNoteDetail = (...args) => this.notesChild.getSharedNoteDetail(...args);
  updateSharedNote = (...args) => this.notesChild.updateSharedNote(...args);
  deleteSharedNote = (...args) => this.notesChild.deleteSharedNote(...args);
  getUserActivity = (...args) => this.monitorChild.getUserActivity(...args);
  getAllUsers = (...args) => this.usersChild.getAllUsers(...args)
  createUser = (...args) => this.usersChild.createUser(...args);
  editUser = (...args) => this.usersChild.editUser(...args);
  toggleUserStatus = (...args) => this.usersChild.toggleUserStatus(...args);
  deleteUserPermanently = (...args) => this.usersChild.deleteUserPermanently(...args);
  getUserSessions = (...args) => this.usersChild.getUserSessions(...args);
  logoutUserSession = (...args) => this.usersChild.logoutUserSession(...args);
  logoutAllUserSessions = (...args) => this.usersChild.logoutAllUserSessions(...args);
  refreshToken = (...args) => this.authChild.refreshToken(...args);
  getMyProfile = (...args) => this.profileChild.getMyProfile(...args);
  updateMyProfile = (...args) => this.profileChild.updateMyProfile(...args);
  uploadAvatar = (...args) => this.profileChild.uploadAvatar(...args);
  getAdminProfile = (...args) => this.profileChild.getAdminProfile(...args);
  updateAdminProfile = (...args) => this.profileChild.updateAdminProfile(...args);
}

const adminController = new AdminController();

export { AdminController };

export default adminController;