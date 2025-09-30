const router = require('express').Router();
const sample = require('./sample.route');
const auth = require('./auth.route');
const notes = require('./notes.route');
const friendship = require('./friendship.route');
const chat = require('./chat.route');
const uploads = require('./upload.route');
const groups = require('./group.route');
const settings = require('./settings.route');
const blocks = require('./blocks.route');
const notifications = require('./notifications.route');
const admin = require('./admin.route');
const userSessions = require('./userSession.route');

router.use('/sample', sample);
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

module.exports = router;
