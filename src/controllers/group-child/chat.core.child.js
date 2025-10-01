const { User, Message, Friendship, MessageRead, ChatPreference, PinnedChat, Notification, MessageReaction } = require('../../models');
const asyncHandler = require('../../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { isUserOnline } = require('../../socket/socketHandler');

class ChatCoreChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  getChatList = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const friendships = await Friendship.findAll({
      where: {
        [Op.or]: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' }
        ]
      },
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate', 'isActive'] },
        { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate', 'isActive'] }
      ]
    });

    const chatList = [];

    for (const friendship of friendships) {
      const friend = friendship.requesterId === userId 
        ? friendship.addressee 
        : friendship.requester;

      // Fetch a batch of recent messages and select the latest one visible to this user
      const recentMessages = await Message.findAll({
        where: {
          [Op.or]: [
            { senderId: userId, receiverId: friend.id },
            { senderId: friend.id, receiverId: userId }
          ]
        },
        order: [['createdAt', 'DESC']],
        limit: 20,
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
          { model: MessageReaction, as: 'Reactions', attributes: ['userId', 'type', 'count'] },
        ]
      });

      // Filter out messages deleted for this user or deleted for all
      const lastVisible = (recentMessages || [])
        .map(m => (typeof m.toJSON === 'function' ? m.toJSON() : m))
        .find(m => !m.isDeletedForAll && !(Array.isArray(m.deletedForUserIds) && m.deletedForUserIds.includes(userId)));

      // Always preserve ordering by latest activity (even if last visible is null)
      const mostRecent = recentMessages && recentMessages.length > 0 ? recentMessages[0] : null;
      const mostRecentAt = mostRecent ? mostRecent.createdAt : null;

      const unreadCount = await Message.count({
        where: {
          senderId: friend.id,
          receiverId: userId,
          isRead: false
        }
      });

      let nickname = null;
      try {
        const pref = await ChatPreference.findOne({ where: { userId, otherUserId: friend.id } });
        nickname = pref?.nickname || null;
      } catch (e) {
        // ignore preference errors; nickname stays null
      }

      chatList.push({
        friend: {
          ...friend.toJSON(),
          isOnline: isUserOnline(friend.id)
        },
        lastMessage: lastVisible || null,
        unreadCount,
        friendshipId: friendship.id,
        nickname,
        lastActivityAt: mostRecentAt
      });
    }

    const pinnedChats = await PinnedChat.findAll({
      where: { userId, pinnedUserId: { [Op.not]: null } }
    });
    const pinnedUserIds = new Set(pinnedChats.map(p => p.pinnedUserId));

    chatList.forEach(chat => {
      chat.isPinned = pinnedUserIds.has(chat.friend.id);
    });

    chatList.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Use lastActivityAt for ordering to preserve position after user hides last message
      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt) : (a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(0));
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt) : (b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(0));
      return bTime - aTime;
    });

    res.json({
      success: true,
      data: chatList
    });
  });

  markMessagesAsRead = asyncHandler(async (req, res) => {
    const { senderId } = req.params;
    const receiverId = req.user.id;

    const toMarkRead = await Message.findAll({
      where: {
        senderId,
        receiverId,
        isRead: false,
      }
    });

    await Message.update(
      { isRead: true },
      {
        where: {
          senderId,
          receiverId,
          isRead: false,
        }
      }
    );

    // Also mark related message notifications as read for this pair
    try {
      await Notification.update(
        { isRead: true },
        { where: { userId: receiverId, type: 'message', fromUserId: senderId, isRead: false } }
      );
    } catch (e) { /* noop */ }

    if (toMarkRead.length > 0) {
      const currentUser = await User.findByPk(receiverId);
      const otherUser = await User.findByPk(senderId);
      if (currentUser && otherUser && currentUser.readStatusEnabled && otherUser.readStatusEnabled) {
        const io = req.app.get('io');
        for (const m of toMarkRead) {
          const [readRecord] = await MessageRead.findOrCreate({
            where: { messageId: m.id, userId: receiverId },
            defaults: {
              messageId: m.id,
              userId: receiverId,
              readAt: new Date()
            }
          });

          if (m.status !== 'read') {
            await m.update({ status: 'read' });
          }

          if (io) {
            const userPayload = { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar };
            io.to(`user_${senderId}`).emit('message_read', {
              messageId: m.id,
              userId: receiverId,
              readAt: readRecord.readAt,
              user: userPayload,
            });
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Messages marked as read'
    });
  });

  getUnreadCount = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const unreadCount = await Message.count({
      where: {
        receiverId: userId,
        isRead: false
      }
    });

    res.json({
      success: true,
      data: { unreadCount }
    });
  });
}

module.exports = ChatCoreChild;
