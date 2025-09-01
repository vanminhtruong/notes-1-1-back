const express = require('express');
const { 
  getAllUsers,
  sendFriendRequest,
  getFriendRequests,
  getSentRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend
} = require('../../controllers/friendship.controller');
const authenticate = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { 
  sendFriendRequestSchema,
  friendshipIdSchema,
  getUsersSchema
} = require('../../validators/friendship.validator');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all users (for searching)
router.get('/users', validate(getUsersSchema), getAllUsers);

// Send friend request
router.post('/request', validate(sendFriendRequestSchema), sendFriendRequest);

// Get received friend requests
router.get('/requests', getFriendRequests);

// Get sent friend requests
router.get('/requests/sent', getSentRequests);

// Accept friend request
router.put('/requests/:friendshipId/accept', validate(friendshipIdSchema), acceptFriendRequest);

// Reject friend request
router.delete('/requests/:friendshipId/reject', validate(friendshipIdSchema), rejectFriendRequest);

// Get friends list
router.get('/', getFriends);

// Remove friend
router.delete('/:friendshipId', validate(friendshipIdSchema), removeFriend);

module.exports = router;
