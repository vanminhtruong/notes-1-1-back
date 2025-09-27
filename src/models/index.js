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
const defineNotification = require('./notification.model');
const defineSharedNote = require('./sharedNote.model');
const defineGroupSharedNote = require('./groupSharedNote.model');

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
const Notification = defineNotification(sequelize, DataTypes);
const SharedNote = defineSharedNote(sequelize, DataTypes);
const GroupSharedNote = defineGroupSharedNote(sequelize, DataTypes);

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

// Notification associations
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' }); // recipient
Notification.belongsTo(User, { foreignKey: 'fromUserId', as: 'fromUser' });
Notification.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });

// SharedNote associations
SharedNote.belongsTo(Note, { foreignKey: 'noteId', as: 'note' });
SharedNote.belongsTo(User, { foreignKey: 'sharedWithUserId', as: 'sharedWithUser' });
SharedNote.belongsTo(User, { foreignKey: 'sharedByUserId', as: 'sharedByUser' });
Note.hasMany(SharedNote, { foreignKey: 'noteId', as: 'sharedNotes' });
User.hasMany(SharedNote, { foreignKey: 'sharedWithUserId', as: 'receivedSharedNotes' });
User.hasMany(SharedNote, { foreignKey: 'sharedByUserId', as: 'sentSharedNotes' });

// GroupSharedNote associations
GroupSharedNote.belongsTo(Note, { foreignKey: 'noteId', as: 'note' });
GroupSharedNote.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
GroupSharedNote.belongsTo(User, { foreignKey: 'sharedByUserId', as: 'sharedByUser' });
Note.hasMany(GroupSharedNote, { foreignKey: 'noteId', as: 'groupSharedNotes' });
Group.hasMany(GroupSharedNote, { foreignKey: 'groupId', as: 'sharedNotes' });
User.hasMany(GroupSharedNote, { foreignKey: 'sharedByUserId', as: 'sentGroupSharedNotes' });

// --- Admin realtime hooks (do NOT modify other controllers) ---
const emitToAdmins = async (event, data) => {
  try {
    if (!global.io) return;
    const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
    for (const a of admins) {
      global.io.to(`user_${a.id}`).emit(event, data);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('emitToAdmins error:', e?.message || e);
  }
};

const sanitizeUser = (u) => u ? ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar }) : null;
const sanitizeMessage = (m) => ({
  id: m.id,
  senderId: m.senderId,
  receiverId: m.receiverId,
  content: m.content,
  messageType: m.messageType,
  isDeletedForAll: !!m.isDeletedForAll,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
  sender: sanitizeUser(m.sender || null),
  receiver: sanitizeUser(m.receiver || null),
});

// DM: after create/edit/recall
Message.addHook('afterCreate', async (message) => {
  try {
    const full = await Message.findByPk(message.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'email', 'avatar'] },
      ]
    });
    await emitToAdmins('admin_dm_created', sanitizeMessage(full));
  } catch (e) { /* noop */ }
});

Message.addHook('afterUpdate', async (message) => {
  try {
    const changed = message.changed();
    if (!changed) return;
    if (Array.isArray(changed) && (changed.includes('content') || changed.includes('updatedAt'))) {
      const full = await Message.findByPk(message.id, {
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'receiver', attributes: ['id', 'name', 'email', 'avatar'] },
        ]
      });
      await emitToAdmins('admin_dm_edited', {
        id: message.id,
        content: full?.content,
        updatedAt: full?.updatedAt,
        senderId: full?.senderId,
        receiverId: full?.receiverId,
      });
    }
    if (message.changed('isDeletedForAll') && message.get('isDeletedForAll') === true) {
      // Check if this was a recall (has isRecalled flag) or delete (admin action)
      const isRecall = message.get('isRecalled') === true;
      if (isRecall) {
        await emitToAdmins('admin_dm_recalled_all', { messageIds: [message.id], senderId: message.senderId, receiverId: message.receiverId });
      } else {
        await emitToAdmins('admin_dm_deleted_all', { messageIds: [message.id], senderId: message.senderId, receiverId: message.receiverId });
      }
    }
    if (Array.isArray(changed) && changed.includes('deletedForUserIds')) {
      await emitToAdmins('admin_dm_deleted_for_user', { messageId: message.id, senderId: message.senderId, receiverId: message.receiverId });
    }
  } catch (e) { /* noop */ }
});

// Group message hooks (basic create + recall)
const sanitizeGroupMessage = (gm) => ({
  id: gm.id,
  groupId: gm.groupId,
  senderId: gm.senderId,
  content: gm.content,
  messageType: gm.messageType,
  createdAt: gm.createdAt,
  updatedAt: gm.updatedAt,
});

if (GroupMessage && typeof GroupMessage.addHook === 'function') {
  GroupMessage.addHook('afterCreate', async (gm) => {
    try {
      await emitToAdmins('admin_group_message_created', sanitizeGroupMessage(gm));
    } catch {}
  });
  GroupMessage.addHook('afterUpdate', async (gm) => {
    try {
      const changed = gm.changed();
      if (Array.isArray(changed) && (changed.includes('content') || changed.includes('updatedAt'))) {
        await emitToAdmins('admin_group_message_edited', { id: gm.id, content: gm.content, updatedAt: gm.updatedAt, senderId: gm.senderId });
      }
    } catch {}
  });
}

// Group membership changes
if (GroupMember && typeof GroupMember.addHook === 'function') {
  GroupMember.addHook('afterCreate', async (gm) => {
    try {
      await emitToAdmins('admin_group_membership_changed', { userId: gm.userId, groupId: gm.groupId, action: 'joined' });
    } catch {}
  });
  GroupMember.addHook('afterDestroy', async (gm) => {
    try {
      await emitToAdmins('admin_group_membership_changed', { userId: gm.userId, groupId: gm.groupId, action: 'left' });
    } catch {}
  });
}

// Friendship changes (accept/remove)
if (Friendship && typeof Friendship.addHook === 'function') {
  Friendship.addHook('afterUpdate', async (fr) => {
    try {
      if (fr.changed('status')) {
        const payload = { requesterId: fr.requesterId, addresseeId: fr.addresseeId, status: fr.status };
        if (fr.status === 'accepted') {
          await emitToAdmins('admin_friendship_accepted', payload);
        } else if (fr.status === 'rejected') {
          await emitToAdmins('admin_friendship_rejected', payload);
        }
      }
    } catch {}
  });
  Friendship.addHook('afterDestroy', async (fr) => {
    try {
      await emitToAdmins('admin_friendship_removed', { requesterId: fr.requesterId, addresseeId: fr.addresseeId });
    } catch {}
  });
}

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
  Notification,
  SharedNote,
  GroupSharedNote,
};

