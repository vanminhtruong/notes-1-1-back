const express = require('express');
const { adminAuth } = require('../../middlewares/adminAuth.middleware');
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
} = require('../../controllers/admin.controller');

const router = express.Router();

// Admin login (no auth required)
router.post('/login', adminLogin);

// All other routes require admin authentication
router.use(adminAuth);

// User management
router.get('/users', getAllUsers);
router.get('/users/:userId/activity', getUserActivity);
router.get('/users/:userId/notifications', adminGetUserNotifications);
router.get('/users/:userId/dm/:otherUserId/messages', adminGetDMMessages);
router.get('/groups/:groupId/messages', adminGetGroupMessages);
router.get('/groups/:groupId/members', adminGetGroupMembers);
router.patch('/users/:id/toggle-status', toggleUserStatus);
router.delete('/users/:id/permanent', deleteUserPermanently);

// Notes management
router.get('/notes', getAllUsersNotes);
router.post('/notes', createNoteForUser);
router.put('/notes/:id', updateUserNote);
router.delete('/notes/:id', deleteUserNote);

module.exports = router;
