const express = require('express');
const authenticate = require('../../middlewares/auth');
const { blockUser, unblockUser, getBlockStatus } = require('../../controllers/block.controller');

const router = express.Router();

router.use(authenticate);

// Block a user
router.post('/', blockUser);

// Unblock a user
router.delete('/:targetId', unblockUser);

// Check block status with a target
router.get('/status', getBlockStatus);

module.exports = router;
