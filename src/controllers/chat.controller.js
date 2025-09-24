const { User, Message, Friendship, MessageRead, ChatPreference, BlockedUser, PinnedChat, PinnedMessage, MessageReaction, GroupMember, Notification } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isUserOnline } = require('../socket/socketHandler');
const ChatMessagesChild = require('./group-child/chat.messages.child');
const ChatPreferencesChild = require('./group-child/chat.preferences.child');
const ChatReactionsChild = require('./group-child/chat.reactions.child');
const ChatCoreChild = require('./group-child/chat.core.child');

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

module.exports = new ChatController();
