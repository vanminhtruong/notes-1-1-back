const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');
const defineSample = require('./sample.model');
const defineUser = require('./user.model');
const defineNote = require('./note.model');
const defineFriendship = require('./friendship.model');
const defineMessage = require('./message.model');
const definePasswordReset = require('./passwordReset.model');
const defineGroup = require('./group.model');
const defineGroupMember = require('./groupMember.model');
const defineGroupMessage = require('./groupMessage.model');
const defineGroupInvite = require('./groupInvite.model');
const defineMessageRead = require('./messageRead.model');
const defineGroupMessageRead = require('./groupMessageRead.model');
const defineChatPreference = require('./chatPreference.model');
const defineBlockedUser = require('./blockedUser.model');
const definePinnedChat = require('./pinnedChat.model');
const definePinnedMessage = require('./pinnedMessage.model');
const defineMessageReaction = require('./messageReaction.model');

const Sample = defineSample(sequelize, DataTypes);
const User = defineUser(sequelize, DataTypes);
const Note = defineNote(sequelize, DataTypes);
const Friendship = defineFriendship(sequelize, DataTypes);
const Message = defineMessage(sequelize, DataTypes);
const PasswordReset = definePasswordReset(sequelize, DataTypes);
const Group = defineGroup(sequelize, DataTypes);
const GroupMember = defineGroupMember(sequelize, DataTypes);
const GroupMessage = defineGroupMessage(sequelize, DataTypes);
const GroupInvite = defineGroupInvite(sequelize, DataTypes);
const MessageRead = defineMessageRead(sequelize, DataTypes);
const GroupMessageRead = defineGroupMessageRead(sequelize, DataTypes);
const ChatPreference = defineChatPreference(sequelize, DataTypes);
const BlockedUser = defineBlockedUser(sequelize, DataTypes);
const PinnedChat = definePinnedChat(sequelize, DataTypes);
const PinnedMessage = definePinnedMessage(sequelize, DataTypes);
const MessageReaction = defineMessageReaction(sequelize, DataTypes);

// Define associations
User.hasMany(Note, { foreignKey: 'userId', as: 'notes' });
Note.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Friendship associations
Friendship.belongsTo(User, { foreignKey: 'requesterId', as: 'requester' });
Friendship.belongsTo(User, { foreignKey: 'addresseeId', as: 'addressee' });
User.hasMany(Friendship, { foreignKey: 'requesterId', as: 'sentRequests' });
User.hasMany(Friendship, { foreignKey: 'addresseeId', as: 'receivedRequests' });

// Message associations
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });
User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
User.hasMany(Message, { foreignKey: 'receiverId', as: 'receivedMessages' });

// Message reply associations
Message.belongsTo(Message, { foreignKey: 'replyToMessageId', as: 'replyToMessage' });
Message.hasMany(Message, { foreignKey: 'replyToMessageId', as: 'replies' });

// MessageRead associations
Message.hasMany(MessageRead, { foreignKey: 'messageId', as: 'MessageReads' });
MessageRead.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
MessageRead.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(MessageRead, { foreignKey: 'userId', as: 'messageReads' });

// PasswordReset associations
PasswordReset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PasswordReset, { foreignKey: 'userId', as: 'passwordResets' });

// Group associations
Group.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
User.hasMany(Group, { foreignKey: 'ownerId', as: 'ownedGroups' });

GroupMember.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Group.hasMany(GroupMember, { foreignKey: 'groupId', as: 'members' });
User.hasMany(GroupMember, { foreignKey: 'userId', as: 'groupMemberships' });

GroupMessage.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupMessage.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
Group.hasMany(GroupMessage, { foreignKey: 'groupId', as: 'messages' });
User.hasMany(GroupMessage, { foreignKey: 'senderId', as: 'groupMessages' });

// GroupMessage reply associations
GroupMessage.belongsTo(GroupMessage, { foreignKey: 'replyToMessageId', as: 'replyToMessage' });
GroupMessage.hasMany(GroupMessage, { foreignKey: 'replyToMessageId', as: 'replies' });

// GroupMessageRead associations
GroupMessage.hasMany(GroupMessageRead, { foreignKey: 'messageId', as: 'GroupMessageReads' });
GroupMessageRead.belongsTo(GroupMessage, { foreignKey: 'messageId', as: 'message' });
GroupMessageRead.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(GroupMessageRead, { foreignKey: 'userId', as: 'groupMessageReads' });

// ChatPreference associations
ChatPreference.belongsTo(User, { foreignKey: 'userId', as: 'user' });
ChatPreference.belongsTo(User, { foreignKey: 'otherUserId', as: 'otherUser' });

// BlockedUser associations (1-1 blocking)
BlockedUser.belongsTo(User, { foreignKey: 'userId', as: 'blocker' });
BlockedUser.belongsTo(User, { foreignKey: 'blockedUserId', as: 'blocked' });
User.hasMany(BlockedUser, { foreignKey: 'userId', as: 'blocks' });
User.hasMany(BlockedUser, { foreignKey: 'blockedUserId', as: 'blockedBy' });

// GroupInvite associations
GroupInvite.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupInvite.belongsTo(User, { foreignKey: 'inviterId', as: 'inviter' });
GroupInvite.belongsTo(User, { foreignKey: 'inviteeId', as: 'invitee' });
Group.hasMany(GroupInvite, { foreignKey: 'groupId', as: 'invites' });
User.hasMany(GroupInvite, { foreignKey: 'inviterId', as: 'sentGroupInvites' });
User.hasMany(GroupInvite, { foreignKey: 'inviteeId', as: 'receivedGroupInvites' });

// PinnedChat associations
PinnedChat.belongsTo(User, { foreignKey: 'userId', as: 'user' });
PinnedChat.belongsTo(User, { foreignKey: 'pinnedUserId', as: 'pinnedUser' });
PinnedChat.belongsTo(Group, { foreignKey: 'pinnedGroupId', as: 'pinnedGroup' });
User.hasMany(PinnedChat, { foreignKey: 'userId', as: 'pinnedChats' });

// PinnedMessage associations
PinnedMessage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
PinnedMessage.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
PinnedMessage.belongsTo(GroupMessage, { foreignKey: 'groupMessageId', as: 'groupMessage' });
User.hasMany(PinnedMessage, { foreignKey: 'userId', as: 'pinnedMessages' });

// MessageReaction associations
MessageReaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
MessageReaction.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
MessageReaction.belongsTo(GroupMessage, { foreignKey: 'groupMessageId', as: 'groupMessage' });
User.hasMany(MessageReaction, { foreignKey: 'userId', as: 'messageReactions' });
Message.hasMany(MessageReaction, { foreignKey: 'messageId', as: 'Reactions' });
GroupMessage.hasMany(MessageReaction, { foreignKey: 'groupMessageId', as: 'Reactions' });

module.exports = {
  sequelize,
  Sample,
  User,
  Note,
  Friendship,
  Message,
  PasswordReset,
  Group,
  GroupMember,
  GroupMessage,
  GroupInvite,
  MessageRead,
  GroupMessageRead,
  ChatPreference,
  BlockedUser,
  PinnedChat,
  PinnedMessage,
  MessageReaction,
};

