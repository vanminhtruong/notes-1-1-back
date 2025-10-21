import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { adminAuth, requirePermission, superAdminOnly } from '../../middlewares/adminAuth.middleware.js';
import adminController from '../../controllers/admin.controller.js';
import * as permissionsController from '../../controllers/adminPermissions.controller.js'; 
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const router = express.Router();

router.post('/login', adminController.adminLogin);

router.use(adminAuth);

router.post('/refresh-token', adminController.refreshToken);

router.get('/me', adminController.getMyProfile);
router.put('/me', adminController.updateMyProfile);

router.post('/upload/image', upload.single('file'), adminController.uploadAvatar);

router.get('/admins/:adminId/profile', superAdminOnly, adminController.getAdminProfile);
router.put('/admins/:adminId/profile', superAdminOnly, adminController.updateAdminProfile);

router.get('/permissions/me', permissionsController.getMyPermissions);
router.get('/admins', superAdminOnly, permissionsController.getAllAdmins);
router.post('/admins', superAdminOnly, permissionsController.createSubAdmin);
router.put('/admins/:adminId/permissions', superAdminOnly, permissionsController.updateAdminPermissions);
router.delete('/admins/:adminId/permissions', superAdminOnly, permissionsController.revokeAdminPermission);
router.patch('/admins/:adminId/toggle-status', superAdminOnly, permissionsController.toggleAdminStatus);
router.delete('/admins/:adminId', superAdminOnly, permissionsController.deleteAdmin);

// User management (require manage_users permission)
router.get('/users', requirePermission('manage_users'), adminController.getAllUsers);
router.post('/users', requirePermission('manage_users.create'), adminController.createUser);
router.put('/users/:id', requirePermission('manage_users.edit'), adminController.editUser);
router.put('/users/:id/chat-settings', requirePermission('manage_users.chat_settings.edit'), adminController.editUser);
router.get('/users/:userId/activity', requirePermission('manage_users.view'), adminController.getUserActivity);
router.get('/users/:userId/notifications', requirePermission('manage_users.activity.notifications'), adminController.adminGetUserNotifications);
router.delete('/users/:userId/notifications/:notificationId', requirePermission('manage_users.activity.notifications.delete'), adminController.adminDeleteUserNotification);
router.delete('/users/:userId/notifications', requirePermission('manage_users.activity.notifications.clear_all'), adminController.adminDeleteAllUserNotifications);
router.get('/users/:userId/dm/:otherUserId/messages', requirePermission('manage_users.activity.messages'), adminController.adminGetDMMessages);
router.get('/users/:userId/dm/:otherUserId/pinned-messages', requirePermission('manage_users.activity.messages'), adminController.adminGetDMPinnedMessages);
router.get('/users/:userId/blocked-users', requirePermission('manage_users.activity.messages'), adminController.adminGetUserBlockedList);
router.get('/groups/:groupId/messages', requirePermission('manage_users.activity.groups'), adminController.adminGetGroupMessages);
router.get('/groups/:groupId/pinned-messages', requirePermission('manage_users.activity.groups'), adminController.adminGetGroupPinnedMessages);
router.get('/groups/:groupId/members', requirePermission('manage_users.activity.groups'), adminController.adminGetGroupMembers);

// Message management (require message permissions)
router.patch('/messages/:messageId/recall', requirePermission('manage_users.activity.messages.recall'), adminController.adminRecallDMMessage);
router.delete('/messages/:messageId', requirePermission('manage_users.activity.messages.delete'), adminController.adminDeleteDMMessage);
router.patch('/messages/:messageId/edit', requirePermission('manage_users.activity.messages.edit'), adminController.adminEditDMMessage);
router.patch('/group-messages/:messageId/recall', requirePermission('manage_users.activity.groups.recall'), adminController.adminRecallGroupMessage);
router.delete('/group-messages/:messageId', requirePermission('manage_users.activity.groups.delete'), adminController.adminDeleteGroupMessage);
router.patch('/group-messages/:messageId/edit', requirePermission('manage_users.activity.groups.edit'), adminController.adminEditGroupMessage);

router.patch('/users/:id/toggle-status', requirePermission('manage_users.activate'), adminController.toggleUserStatus);
router.delete('/users/:id/permanent', requirePermission('manage_users.delete_permanently'), adminController.deleteUserPermanently);

// User sessions management (require manage_users.sessions permissions)
router.get('/users/:userId/sessions', requirePermission('manage_users.sessions.view'), adminController.getUserSessions);
router.delete('/users/:userId/sessions/:sessionId', requirePermission('manage_users.sessions.logout'), adminController.logoutUserSession);
router.delete('/users/:userId/sessions', requirePermission('manage_users.sessions.logout_all'), adminController.logoutAllUserSessions);

// Notes management (require specific manage_notes permissions)
router.get('/notes', requirePermission('manage_notes.view'), adminController.getAllUsersNotes);
router.post('/notes', requirePermission('manage_notes.create'), adminController.createNoteForUser);
router.put('/notes/:id', requirePermission('manage_notes.edit'), adminController.updateUserNote);
router.delete('/notes/:id', requirePermission('manage_notes.delete'), adminController.deleteUserNote);
router.patch('/notes/:noteId/move-to-folder', requirePermission('manage_notes.folders.move'), adminController.moveNoteToFolder);
router.patch('/notes/:id/pin', requirePermission('manage_notes.edit'), adminController.pinUserNote);
router.patch('/notes/:id/unpin', requirePermission('manage_notes.edit'), adminController.unpinUserNote);

// Shared notes management (require specific shared notes permissions) 
router.get('/shared-notes', requirePermission('manage_notes.shared.view'), adminController.getAllSharedNotes);
router.get('/shared-notes/:id', requirePermission('manage_notes.shared.view'), adminController.getSharedNoteDetail);
router.put('/shared-notes/:id', requirePermission('manage_notes.shared.edit'), adminController.updateSharedNote);
router.delete('/shared-notes/:id', requirePermission('manage_notes.shared.delete'), adminController.deleteSharedNote);

// Folders management (require specific folders permissions)
router.get('/folders', requirePermission('manage_notes.folders.view'), adminController.getAllFolders);
router.get('/folders/:id', requirePermission('manage_notes.folders.view_detail'), adminController.getFolderById);
router.post('/folders', requirePermission('manage_notes.folders.create'), adminController.createFolderForUser);
router.put('/folders/:id', requirePermission('manage_notes.folders.edit'), adminController.updateUserFolder);
router.delete('/folders/:id', requirePermission('manage_notes.folders.delete'), adminController.deleteUserFolder);

// Categories management (require specific categories permissions)
router.get('/categories/search', requirePermission('manage_notes.categories.view'), adminController.searchCategories);
router.get('/categories/stats', requirePermission('manage_notes.categories.view'), adminController.getCategoriesStats);
router.get('/categories', requirePermission('manage_notes.categories.view'), adminController.getAllCategories);
router.get('/categories/:id', requirePermission('manage_notes.categories.view'), adminController.getCategoryDetail);
router.post('/categories', requirePermission('manage_notes.categories.create'), adminController.createCategoryForUser);
router.put('/categories/:id', requirePermission('manage_notes.categories.edit'), adminController.updateCategory);
router.delete('/categories/:id', requirePermission('manage_notes.categories.delete'), adminController.deleteCategory);

// Tags management (require specific tags permissions)
router.get('/tags', requirePermission('manage_notes.tags.view'), adminController.getAllTags);
router.get('/tags/stats', requirePermission('manage_notes.tags.view'), adminController.getTagsStats);
router.get('/tags/:id', requirePermission('manage_notes.tags.view_detail'), adminController.getTagDetail);
router.post('/tags', requirePermission('manage_notes.tags.create'), adminController.createTagForUser);
router.put('/tags/:id', requirePermission('manage_notes.tags.edit'), adminController.updateTag);
router.delete('/tags/:id', requirePermission('manage_notes.tags.delete'), adminController.deleteTag);
router.post('/tags/assign', requirePermission('manage_notes.tags.assign'), adminController.assignTagToNote);
router.delete('/tags/:noteId/:tagId', requirePermission('manage_notes.tags.assign'), adminController.removeTagFromNote);

export default router;
