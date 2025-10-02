import express from 'express';
import authenticate from '../../middlewares/auth.js';
import { blockUser, unblockUser, getBlockStatus, listBlockedUsers } from '../../controllers/block.controller.js';

const router = express.Router();

router.use(authenticate);

// Block a user
router.post('/', blockUser);

// List my blocked users
router.get('/', listBlockedUsers);

// Unblock a user
router.delete('/:targetId', unblockUser);

// Check block status with a target
router.get('/status', getBlockStatus);

export default router;
