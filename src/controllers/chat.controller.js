import { User, Message, Friendship, MessageRead, ChatPreference, BlockedUser, PinnedChat, PinnedMessage, MessageReaction, GroupMember, Notification } from '../models/index.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isUserOnline } from '../socket/socketHandler.js';
import ChatMessagesChild from '../service/chat-service/chat.messages.service.js';
import ChatPreferencesChild from '../service/chat-service/chat.preferences.service.js';
import ChatReactionsChild from '../service/chat-service/chat.reactions.service.js';
import ChatCoreChild from '../service/chat-service/chat.core.service.js';

class ChatController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.messagesChild = new ChatMessagesChild(this);
    this.preferencesChild = new ChatPreferencesChild(this);
    this.reactionsChild = new ChatReactionsChild(this);
    this.coreChild = new ChatCoreChild(this);
  }

  // Delegated methods to child controllers
  getChatMessages = (...args) => this.messagesChild.getChatMessages(...args);

  sendMessage = (...args) => this.messagesChild.sendMessage(...args);

  getChatList = (...args) => this.coreChild.getChatList(...args);

  markMessagesAsRead = (...args) => this.coreChild.markMessagesAsRead(...args);
  getUnreadCount = (...args) => this.coreChild.getUnreadCount(...args);

  deleteAllMessages = (...args) => this.messagesChild.deleteAllMessages(...args);
  searchChatMessages = (...args) => this.messagesChild.searchChatMessages(...args);
  editMessage = (...args) => this.messagesChild.editMessage(...args);
  recallMessages = (...args) => this.messagesChild.recallMessages(...args);

  getChatNickname = (...args) => this.preferencesChild.getChatNickname(...args);
  setChatNickname = (...args) => this.preferencesChild.setChatNickname(...args);
  getChatBackground = (...args) => this.preferencesChild.getChatBackground(...args);
  setChatBackground = (...args) => this.preferencesChild.setChatBackground(...args);
  togglePinChat = (...args) => this.preferencesChild.togglePinChat(...args);
  getPinStatus = (...args) => this.preferencesChild.getPinStatus(...args);
  togglePinMessage = (...args) => this.preferencesChild.togglePinMessage(...args);
  listPinnedMessages = (...args) => this.preferencesChild.listPinnedMessages(...args);
  reactMessage = (...args) => this.reactionsChild.reactMessage(...args);
  unreactMessage = (...args) => this.reactionsChild.unreactMessage(...args);
}

const chatController = new ChatController();

export { ChatController };

export default chatController;
