import express from 'express';
import authMiddleware from '../../middlewares/auth.js';
import * as userSessionController from '../../controllers/userSession.controller.js';

const router = express.Router();

// Get all active sessions for current user
router.get('/', authMiddleware, userSessionController.getUserSessions);

// Delete a specific session
router.delete('/:sessionId', authMiddleware, userSessionController.deleteSession);

// Delete all other sessions except current
router.delete('/others/all', authMiddleware, userSessionController.deleteAllOtherSessions);

// Update session activity (optional, can be called periodically)
router.patch('/activity', authMiddleware, userSessionController.updateSessionActivity);

export default router;
