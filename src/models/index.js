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

// GroupMessageRead associations
GroupMessage.hasMany(GroupMessageRead, { foreignKey: 'messageId', as: 'GroupMessageReads' });
GroupMessageRead.belongsTo(GroupMessage, { foreignKey: 'messageId', as: 'message' });
GroupMessageRead.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(GroupMessageRead, { foreignKey: 'userId', as: 'groupMessageReads' });

// GroupInvite associations
GroupInvite.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupInvite.belongsTo(User, { foreignKey: 'inviterId', as: 'inviter' });
GroupInvite.belongsTo(User, { foreignKey: 'inviteeId', as: 'invitee' });
Group.hasMany(GroupInvite, { foreignKey: 'groupId', as: 'invites' });
User.hasMany(GroupInvite, { foreignKey: 'inviterId', as: 'sentGroupInvites' });
User.hasMany(GroupInvite, { foreignKey: 'inviteeId', as: 'receivedGroupInvites' });

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
};
