import express from 'express';
import authenticate from '../../middlewares/auth.js';
import * as controller from '../../controllers/notification.controller.js';

const router = express.Router();

router.use(authenticate);

// GET /api/v1/notifications?unreadOnly=true&limit=50
router.get('/', controller.listMyNotifications);

// GET /api/v1/notifications/bell
router.get('/bell', controller.bellFeed);

// GET /api/v1/notifications/bell/badge
router.get('/bell/badge', controller.bellBadge);

// POST /api/v1/notifications/bell/dismiss
router.post('/bell/dismiss', controller.deleteBellItem);

// PUT /api/v1/notifications/read-all
router.put('/read-all', controller.markAllRead);

export default router;
