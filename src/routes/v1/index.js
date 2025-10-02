import { Router } from 'express';
import auth from './auth.route.js';
import notes from './notes.route.js';
import friendship from './friendship.route.js';
import chat from './chat.route.js';
import uploads from './upload.route.js';
import groups from './group.route.js';
import settings from './settings.route.js';
import blocks from './blocks.route.js';
import notifications from './notifications.route.js';
import admin from './admin.route.js';
import userSessions from './userSession.route.js';

const router = Router();

router.use('/auth', auth);
router.use('/notes', notes);
router.use('/friends', friendship);
router.use('/chat', chat);
router.use('/uploads', uploads);
router.use('/groups', groups);
router.use('/settings', settings);
router.use('/blocks', blocks);
router.use('/notifications', notifications);
router.use('/admin', admin);
router.use('/sessions', userSessions);

export default router;
