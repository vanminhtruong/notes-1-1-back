const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { adminAuth, requirePermission, superAdminOnly } = require('../../middlewares/adminAuth.middleware');
const {
  adminLogin,
  getAllUsersNotes,
  createNoteForUser,
  updateUserNote,
  deleteUserNote,
  getAllSharedNotes,
  getSharedNoteDetail,
  updateSharedNote,
  deleteSharedNote,
  getUserActivity,
  getAllUsers,
  createUser,
  editUser,
  toggleUserStatus,
  deleteUserPermanently,
  adminGetDMMessages,
  adminGetGroupMessages,
  adminGetGroupMembers,
  adminGetUserNotifications,
  adminDeleteUserNotification,
  adminDeleteAllUserNotifications,
  adminRecallDMMessage,
  adminDeleteDMMessage,
  adminEditDMMessage,
  adminRecallGroupMessage,
  adminDeleteGroupMessage,
  adminEditGroupMessage,
  refreshToken,
  getMyProfile,
  updateMyProfile,
  uploadAvatar,
  getAdminProfile,
  updateAdminProfile,
  getUserSessions,
  logoutUserSession,
  logoutAllUserSessions,
} = require('../../controllers/admin.controller');
const {
  getAllAdmins,
  createSubAdmin,
  updateAdminPermissions,
  deleteAdmin,
  getMyPermissions,
  revokeAdminPermission,
  toggleAdminStatus,
} = require('../../controllers/adminPermissions.controller');

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
router.post('/login', adminLogin);

// All other routes require admin authentication
router.use(adminAuth);

// Refresh token endpoint
router.post('/refresh-token', refreshToken);

// Admin profile
router.get('/me', getMyProfile);
router.put('/me', updateMyProfile);

// Admin file upload
router.post('/upload/image', upload.single('file'), uploadAvatar);

// Admin profile management (Super Admin only)
router.get('/admins/:adminId/profile', superAdminOnly, getAdminProfile);
router.put('/admins/:adminId/profile', superAdminOnly, updateAdminProfile);

// Admin permissions management (Super Admin only)
router.get('/permissions/me', getMyPermissions);
router.get('/admins', superAdminOnly, getAllAdmins);
router.post('/admins', superAdminOnly, createSubAdmin);
router.put('/admins/:adminId/permissions', superAdminOnly, updateAdminPermissions);
router.delete('/admins/:adminId/permissions', superAdminOnly, revokeAdminPermission);
router.patch('/admins/:adminId/toggle-status', superAdminOnly, toggleAdminStatus);
router.delete('/admins/:adminId', superAdminOnly, deleteAdmin);

// User management (require manage_users permission)
router.get('/users', requirePermission('manage_users'), getAllUsers);
router.post('/users', requirePermission('manage_users.create'), createUser);
router.put('/users/:id', requirePermission('manage_users.edit'), editUser);
router.get('/users/:userId/activity', requirePermission('manage_users.view'), getUserActivity);
router.get('/users/:userId/notifications', requirePermission('manage_users.activity.notifications'), adminGetUserNotifications);
router.delete('/users/:userId/notifications/:notificationId', requirePermission('manage_users.activity.notifications.delete'), adminDeleteUserNotification);
router.delete('/users/:userId/notifications', requirePermission('manage_users.activity.notifications.clear_all'), adminDeleteAllUserNotifications);
router.get('/users/:userId/dm/:otherUserId/messages', requirePermission('manage_users.activity.messages'), adminGetDMMessages);
router.get('/groups/:groupId/messages', requirePermission('manage_users.activity.groups'), adminGetGroupMessages);
router.get('/groups/:groupId/members', requirePermission('manage_users.activity.groups'), adminGetGroupMembers);

// Message management (require message permissions)
router.patch('/messages/:messageId/recall', requirePermission('manage_users.activity.messages.recall'), adminRecallDMMessage);
router.delete('/messages/:messageId', requirePermission('manage_users.activity.messages.delete'), adminDeleteDMMessage);
router.patch('/messages/:messageId/edit', requirePermission('manage_users.activity.messages.edit'), adminEditDMMessage);
router.patch('/group-messages/:messageId/recall', requirePermission('manage_users.activity.groups.recall'), adminRecallGroupMessage);
router.delete('/group-messages/:messageId', requirePermission('manage_users.activity.groups.delete'), adminDeleteGroupMessage);
router.patch('/group-messages/:messageId/edit', requirePermission('manage_users.activity.groups.edit'), adminEditGroupMessage);

router.patch('/users/:id/toggle-status', requirePermission('manage_users.activate'), toggleUserStatus);
router.delete('/users/:id/permanent', requirePermission('manage_users.delete_permanently'), deleteUserPermanently);

// User sessions management (require manage_users.sessions permissions)
router.get('/users/:userId/sessions', requirePermission('manage_users.sessions.view'), getUserSessions);
router.delete('/users/:userId/sessions/:sessionId', requirePermission('manage_users.sessions.logout'), logoutUserSession);
router.delete('/users/:userId/sessions', requirePermission('manage_users.sessions.logout_all'), logoutAllUserSessions);

// Notes management (require manage_notes permission)
router.get('/notes', requirePermission('manage_notes'), getAllUsersNotes);
router.post('/notes', requirePermission('manage_notes'), createNoteForUser);
router.put('/notes/:id', requirePermission('manage_notes'), updateUserNote);
router.delete('/notes/:id', requirePermission('manage_notes'), deleteUserNote);

// Shared notes management (require specific shared notes permissions) 
router.get('/shared-notes', requirePermission('manage_notes.shared.view'), getAllSharedNotes);
router.get('/shared-notes/:id', requirePermission('manage_notes.shared.view'), getSharedNoteDetail);
router.put('/shared-notes/:id', requirePermission('manage_notes.shared.edit'), updateSharedNote);
router.delete('/shared-notes/:id', requirePermission('manage_notes.shared.delete'), deleteSharedNote);

module.exports = router;
