import express from 'express';
import chatController from '../../controllers/chat.controller.js';
import authenticate from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import { 
  sendMessageSchema,
  getChatMessagesSchema,
  searchChatMessagesSchema,
  reactMessageSchema,
  unreactMessageSchema,
  markAsReadSchema,
  recallMessagesSchema,
  editMessageSchema,
  setChatNicknameSchema
} from '../../validators/chat.validator.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get chat list (recent conversations)
router.get('/', chatController.getChatList);

// Get unread message count
router.get('/unread-count', chatController.getUnreadCount);

// Get chat messages with a specific user
router.get('/:userId', validate(getChatMessagesSchema), chatController.getChatMessages);

// Search chat messages with a specific user
router.get('/:userId/search', validate(searchChatMessagesSchema), chatController.searchChatMessages);

// Send a message
router.post('/message', validate(sendMessageSchema), chatController.sendMessage);

// Recall messages (self or all)
router.post('/message/recall', validate(recallMessagesSchema), chatController.recallMessages);

// Edit a message
router.put('/message/:messageId', validate(editMessageSchema), chatController.editMessage);

// React to a message
router.post('/message/:messageId/react', validate(reactMessageSchema), chatController.reactMessage);

// Unreact to a message
router.delete('/message/:messageId/react', validate(unreactMessageSchema), chatController.unreactMessage);

// Mark messages as read
router.put('/:senderId/read', validate(markAsReadSchema), chatController.markMessagesAsRead);

// Delete all messages with a specific user
router.delete('/:userId/messages', chatController.deleteAllMessages);

// Per-chat background (1-1 only)
router.get('/:userId/background', chatController.getChatBackground);
router.put('/:userId/background', chatController.setChatBackground);

// Per-chat nickname (alias) (1-1 only)
router.get('/:userId/nickname', chatController.getChatNickname);
router.put('/:userId/nickname', validate(setChatNicknameSchema), chatController.setChatNickname);

// Pin/Unpin chat
router.put('/:userId/pin', chatController.togglePinChat);
router.get('/:userId/pin', chatController.getPinStatus);

// Pin/Unpin a specific message (1-1) and list pinned messages for a chat
router.put('/message/:messageId/pin', chatController.togglePinMessage);
router.get('/:userId/pins', chatController.listPinnedMessages);

export default router;
