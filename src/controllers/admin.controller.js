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
import AdminCategoriesChild from '../service/admin-service/admin.categories.service.js';
import AdminTagsService from '../service/admin-service/admin.tags.service.js';

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
    this.categoriesChild = new AdminCategoriesChild(this);
    this.tagsService = AdminTagsService;
  }

  // Admin login (delegated)
  adminLogin = (...args) => this.authChild.adminLogin(...args);
  adminGetUserNotifications = (...args) => this.notesChild.adminGetUserNotifications(...args);
  adminDeleteUserNotification = (...args) => this.notesChild.adminDeleteUserNotification(...args);
  adminDeleteAllUserNotifications = (...args) => this.notesChild.adminDeleteAllUserNotifications(...args);
  adminGetGroupMembers = (...args) => this.monitorChild.adminGetGroupMembers(...args);
  adminGetDMMessages = (...args) => this.monitorChild.adminGetDMMessages(...args);
  adminGetGroupMessages = (...args) => this.monitorChild.adminGetGroupMessages(...args);
  adminGetDMPinnedMessages = (...args) => this.monitorChild.adminGetDMPinnedMessages(...args);
  adminGetGroupPinnedMessages = (...args) => this.monitorChild.adminGetGroupPinnedMessages(...args);
  adminGetUserBlockedList = (...args) => this.monitorChild.adminGetUserBlockedList(...args);
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
  moveNoteToFolder = (...args) => this.notesChild.moveNoteToFolder(...args);
  getAllSharedNotes = (...args) => this.notesChild.getAllSharedNotes(...args);
  getSharedNoteDetail = (...args) => this.notesChild.getSharedNoteDetail(...args);
  updateSharedNote = (...args) => this.notesChild.updateSharedNote(...args);
  deleteSharedNote = (...args) => this.notesChild.deleteSharedNote(...args);
  getAllFolders = (...args) => this.notesChild.getAllFolders(...args);
  getFolderById = (...args) => this.notesChild.getFolderById(...args);
  createFolderForUser = (...args) => this.notesChild.createFolderForUser(...args);
  updateUserFolder = (...args) => this.notesChild.updateUserFolder(...args);
  deleteUserFolder = (...args) => this.notesChild.deleteFolder(...args);
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
  changeAdminPassword = (...args) => this.profileChild.changeAdminPassword(...args);
  pinUserNote = (...args) => this.notesChild.pinUserNote(...args);
  unpinUserNote = (...args) => this.notesChild.unpinUserNote(...args);
  
  // Categories management
  getAllCategories = (...args) => this.categoriesChild.getAllCategories(...args);
  searchCategories = (...args) => this.categoriesChild.searchCategories(...args);
  getCategoryDetail = (...args) => this.categoriesChild.getCategoryDetail(...args);
  createCategoryForUser = (...args) => this.categoriesChild.createCategoryForUser(...args);
  updateCategory = (...args) => this.categoriesChild.updateCategory(...args);
  deleteCategory = (...args) => this.categoriesChild.deleteCategory(...args);
  getCategoriesStats = (...args) => this.categoriesChild.getCategoriesStats(...args);
  pinCategory = (...args) => this.categoriesChild.pinCategory(...args);
  unpinCategory = (...args) => this.categoriesChild.unpinCategory(...args);
  
  // Tags management
  getAllTags = (...args) => this.tagsService.getAllTags(...args);
  getTagsStats = (...args) => this.tagsService.getTagsStats(...args);
  getTagDetail = (...args) => this.tagsService.getTagDetail(...args);
  createTagForUser = (...args) => this.tagsService.createTagForUser(...args);
  updateTag = (...args) => this.tagsService.updateTag(...args);
  deleteTag = (...args) => this.tagsService.deleteTag(...args);
  pinTag = (...args) => this.tagsService.pinTag(...args);
  unpinTag = (...args) => this.tagsService.unpinTag(...args);
  assignTagToNote = (...args) => this.tagsService.assignTagToNote(...args);
  removeTagFromNote = (...args) => this.tagsService.removeTagFromNote(...args);
}

const adminController = new AdminController();

export { AdminController };

export default adminController;