import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { adminAuth, requirePermission, superAdminOnly } from '../../middlewares/adminAuth.middleware.js';
import adminController from '../../controllers/admin.controller.js';
import * as permissionsController from '../../controllers/adminPermissions.controller.js';

// Configure multer for admin uploads  
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

// Admin login (no auth required)
router.post('/login', adminController.adminLogin);

// All other routes require admin authentication
router.use(adminAuth);

// Refresh token endpoint
router.post('/refresh-token', adminController.refreshToken);

// Admin profile
router.get('/me', adminController.getMyProfile);
router.put('/me', adminController.updateMyProfile);

// Admin file upload
router.post('/upload/image', upload.single('file'), adminController.uploadAvatar);

// Admin profile management (Super Admin only)
router.get('/admins/:adminId/profile', superAdminOnly, adminController.getAdminProfile);
router.put('/admins/:adminId/profile', superAdminOnly, adminController.updateAdminProfile);

// Admin permissions management (Super Admin only)
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
router.get('/users/:userId/activity', requirePermission('manage_users.view'), adminController.getUserActivity);
router.get('/users/:userId/notifications', requirePermission('manage_users.activity.notifications'), adminController.adminGetUserNotifications);
router.delete('/users/:userId/notifications/:notificationId', requirePermission('manage_users.activity.notifications.delete'), adminController.adminDeleteUserNotification);
router.delete('/users/:userId/notifications', requirePermission('manage_users.activity.notifications.clear_all'), adminController.adminDeleteAllUserNotifications);
router.get('/users/:userId/dm/:otherUserId/messages', requirePermission('manage_users.activity.messages'), adminController.adminGetDMMessages);
router.get('/groups/:groupId/messages', requirePermission('manage_users.activity.groups'), adminController.adminGetGroupMessages);
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

// Shared notes management (require specific shared notes permissions) 
router.get('/shared-notes', requirePermission('manage_notes.shared.view'), adminController.getAllSharedNotes);
router.get('/shared-notes/:id', requirePermission('manage_notes.shared.view'), adminController.getSharedNoteDetail);
router.put('/shared-notes/:id', requirePermission('manage_notes.shared.edit'), adminController.updateSharedNote);
router.delete('/shared-notes/:id', requirePermission('manage_notes.shared.delete'), adminController.deleteSharedNote);

export default router;
