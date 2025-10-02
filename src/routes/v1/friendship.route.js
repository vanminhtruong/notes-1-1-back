import express from 'express';
import friendshipController from '../../controllers/friendship.controller.js';
import authenticate from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import { 
  sendFriendRequestSchema,
  friendshipIdSchema,
  getUsersSchema
} from '../../validators/friendship.validator.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all users (for searching)
router.get('/users', validate(getUsersSchema), friendshipController.getAllUsers);

// Send friend request
router.post('/request', validate(sendFriendRequestSchema), friendshipController.sendFriendRequest);

// Get received friend requests
router.get('/requests', friendshipController.getFriendRequests);

// Get sent friend requests
router.get('/requests/sent', friendshipController.getSentRequests);

// Accept friend request
router.put('/requests/:friendshipId/accept', validate(friendshipIdSchema), friendshipController.acceptFriendRequest);

// Reject friend request
router.delete('/requests/:friendshipId/reject', validate(friendshipIdSchema), friendshipController.rejectFriendRequest);

// Get friends list
router.get('/', friendshipController.getFriends);

// Remove friend
router.delete('/:friendshipId', validate(friendshipIdSchema), friendshipController.removeFriend);

export default router;
