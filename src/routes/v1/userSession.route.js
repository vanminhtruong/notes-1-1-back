const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const userSessionController = require('../../controllers/userSession.controller');

// Get all active sessions for current user
router.get('/', authMiddleware, userSessionController.getUserSessions);

// Delete a specific session
router.delete('/:sessionId', authMiddleware, userSessionController.deleteSession);

// Delete all other sessions except current
router.delete('/others/all', authMiddleware, userSessionController.deleteAllOtherSessions);

// Update session activity (optional, can be called periodically)
router.patch('/activity', authMiddleware, userSessionController.updateSessionActivity);

module.exports = router;
