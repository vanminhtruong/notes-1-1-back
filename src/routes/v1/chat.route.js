const express = require('express');
const { 
  getChatMessages,
  sendMessage,
  getChatList,
  markMessagesAsRead,
  getUnreadCount,
  recallMessages,
  deleteAllMessages,
  getChatBackground,
  setChatBackground,
  togglePinChat,
  getPinStatus,
  togglePinMessage,
  listPinnedMessages,
} = require('../../controllers/chat.controller');
const authenticate = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { 
  sendMessageSchema,
  getChatMessagesSchema,
  markAsReadSchema,
  recallMessagesSchema,
  editMessageSchema
} = require('../../validators/chat.validator');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get chat list (recent conversations)
router.get('/', getChatList);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Get chat messages with a specific user
router.get('/:userId', validate(getChatMessagesSchema), getChatMessages);

// Send a message
router.post('/message', validate(sendMessageSchema), sendMessage);

// Recall messages (self or all)
router.post('/message/recall', validate(recallMessagesSchema), recallMessages);

// Edit a message
router.put('/message/:messageId', validate(editMessageSchema), require('../../controllers/chat.controller').editMessage);

// Mark messages as read
router.put('/:senderId/read', validate(markAsReadSchema), markMessagesAsRead);

// Delete all messages with a specific user
router.delete('/:userId/messages', deleteAllMessages);

// Per-chat background (1-1 only)
router.get('/:userId/background', getChatBackground);
router.put('/:userId/background', setChatBackground);

// Pin/Unpin chat
router.put('/:userId/pin', togglePinChat);
router.get('/:userId/pin', getPinStatus);

// Pin/Unpin a specific message (1-1) and list pinned messages for a chat
router.put('/message/:messageId/pin', togglePinMessage);
router.get('/:userId/pins', listPinnedMessages);

module.exports = router;
