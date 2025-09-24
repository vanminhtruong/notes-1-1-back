const express = require('express');
const { adminAuth, requirePermission, superAdminOnly } = require('../../middlewares/adminAuth.middleware');
const {
  adminLogin,
  getAllUsersNotes,
  createNoteForUser,
  updateUserNote,
  deleteUserNote,
  getUserActivity,
  getAllUsers,
  toggleUserStatus,
  deleteUserPermanently,
  adminGetDMMessages,
  adminGetGroupMessages,
  adminGetGroupMembers,
  adminGetUserNotifications,
  adminDeleteUserNotification,
  adminRecallDMMessage,
  adminDeleteDMMessage,
  adminEditDMMessage,
  adminRecallGroupMessage,
  adminDeleteGroupMessage,
  adminEditGroupMessage,
  refreshToken,
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

const router = express.Router();

// Admin login (no auth required)
router.post('/login', adminLogin);

// All other routes require admin authentication
router.use(adminAuth);

// Refresh token endpoint
router.post('/refresh-token', refreshToken);

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
router.get('/users/:userId/activity', requirePermission('manage_users.view'), getUserActivity);
router.get('/users/:userId/notifications', requirePermission('manage_users.activity.notifications'), adminGetUserNotifications);
router.delete('/users/:userId/notifications/:notificationId', requirePermission('manage_users.activity.notifications.delete'), adminDeleteUserNotification);
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

// Notes management (require manage_notes permission)
router.get('/notes', requirePermission('manage_notes'), getAllUsersNotes);
router.post('/notes', requirePermission('manage_notes'), createNoteForUser);
router.put('/notes/:id', requirePermission('manage_notes'), updateUserNote);
router.delete('/notes/:id', requirePermission('manage_notes'), deleteUserNote);

module.exports = router;
