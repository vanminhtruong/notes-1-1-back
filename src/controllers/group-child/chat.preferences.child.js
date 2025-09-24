const { User, Message, Friendship, ChatPreference, PinnedChat, PinnedMessage, GroupMember } = require('../../models');
const asyncHandler = require('../../middlewares/asyncHandler');
const { Op } = require('sequelize');

class ChatPreferencesChild {
  constructor(parentController) {
    this.parent = parentController;
  }

  getChatNickname = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    let shareGroup = false;
    if (!friendship) {
      const myGroups = await GroupMember.findAll({ where: { userId: currentUserId }, attributes: ['groupId'] });
      const otherGroups = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
      const mySet = new Set(myGroups.map((g) => g.groupId));
      shareGroup = otherGroups.some((g) => mySet.has(g.groupId));
      if (!shareGroup) return res.status(403).json({ success: false, message: 'You can only view preferences with friends or group members' });
    }

    const pref = await ChatPreference.findOne({ where: { userId: currentUserId, otherUserId: userId } });
    return res.json({ success: true, data: { nickname: pref?.nickname || null } });
  });

  setChatNickname = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    let { nickname } = req.body || {};
    if (nickname !== null && nickname !== undefined) nickname = String(nickname).trim();

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      const myGroups = await GroupMember.findAll({ where: { userId: currentUserId }, attributes: ['groupId'] });
      const otherGroups = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
      const mySet = new Set(myGroups.map((g) => g.groupId));
      const shareGroup = otherGroups.some((g) => mySet.has(g.groupId));
      if (!shareGroup) return res.status(403).json({ success: false, message: 'You can only set preferences with friends or group members' });
    }

    const [pref] = await ChatPreference.findOrCreate({
      where: { userId: currentUserId, otherUserId: userId },
      defaults: { userId: currentUserId, otherUserId: userId, nickname: nickname || null }
    });
    if (pref.nickname !== (nickname || null)) await pref.update({ nickname: nickname || null });
    
    try {
      const io = req.app.get('io') || global.io;
      if (io) {
        io.to(`user_${currentUserId}`).emit('nickname_updated', {
          otherUserId: Number(userId),
          nickname: pref.nickname || null,
        });
      }
    } catch {}
    return res.json({ success: true, data: { nickname: pref.nickname || null } });
  });

  getChatBackground = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      return res.status(403).json({ success: false, message: 'You can only view preferences with friends' });
    }

    const [myPref, theirPref] = await Promise.all([
      ChatPreference.findOne({ where: { userId: currentUserId, otherUserId: userId } }),
      ChatPreference.findOne({ where: { userId: userId, otherUserId: currentUserId } })
    ]);

    const backgroundUrl = myPref?.backgroundUrl || theirPref?.backgroundUrl || null;
    return res.json({ success: true, data: { backgroundUrl } });
  });

  setChatBackground = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const { backgroundUrl } = req.body || {};

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });
    if (!friendship) {
      return res.status(403).json({ success: false, message: 'You can only set preferences with friends' });
    }

    const [pref] = await ChatPreference.findOrCreate({
      where: { userId: currentUserId, otherUserId: userId },
      defaults: { userId: currentUserId, otherUserId: userId, backgroundUrl: backgroundUrl || null }
    });
    if (pref.backgroundUrl !== backgroundUrl) {
      await pref.update({ backgroundUrl: backgroundUrl || null });
    }
    return res.json({ success: true, data: { backgroundUrl: pref.backgroundUrl || null } });
  });

  togglePinChat = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const { pinned } = req.body;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' }
        ]
      }
    });

    if (!friendship) {
      return res.status(403).json({
        success: false,
        message: 'You can only pin chats with friends'
      });
    }

    if (pinned) {
      const [pinnedChat, created] = await PinnedChat.findOrCreate({
        where: { userId: currentUserId, pinnedUserId: userId },
        defaults: { userId: currentUserId, pinnedUserId: userId }
      });
      
      return res.json({
        success: true,
        message: created ? 'Chat pinned' : 'Chat already pinned',
        data: { pinned: true }
      });
    } else {
      const deleted = await PinnedChat.destroy({
        where: { userId: currentUserId, pinnedUserId: userId }
      });
      
      return res.json({
        success: true,
        message: deleted > 0 ? 'Chat unpinned' : 'Chat was not pinned',
        data: { pinned: false }
      });
    }
  });

  getPinStatus = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const pinnedChat = await PinnedChat.findOne({
      where: { userId: currentUserId, pinnedUserId: userId }
    });

    return res.json({
      success: true,
      data: { pinned: !!pinnedChat }
    });
  });

  togglePinMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { messageId } = req.params;
    const { pinned } = req.body;

    const msg = await Message.findByPk(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (msg.senderId !== currentUserId && msg.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }

    if (pinned) {
      await PinnedMessage.findOrCreate({
        where: { userId: currentUserId, messageId },
        defaults: { userId: currentUserId, messageId },
      });
    } else {
      await PinnedMessage.destroy({ where: { messageId } });
    }

    try {
      const a = msg.senderId;
      const b = msg.receiverId;
      const payload = { messageId: msg.id, participants: [a, b], pinned: !!pinned };
      global.io && global.io.to(`user_${a}`).emit('message_pinned', payload);
      global.io && global.io.to(`user_${b}`).emit('message_pinned', payload);
    } catch (e) {
      // ignore socket errors
    }

    return res.json({ success: true, data: { pinned: !!pinned } });
  });

  listPinnedMessages = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const friendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId: currentUserId, addresseeId: userId, status: 'accepted' },
          { requesterId: userId, addresseeId: currentUserId, status: 'accepted' },
        ],
      },
    });
    if (!friendship) return res.status(403).json({ success: false, message: 'You can only view pinned with friends' });

    const msgs = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId },
        ],
      },
      attributes: ['id', 'content', 'messageType', 'createdAt', 'senderId', 'receiverId'],
      order: [['createdAt', 'ASC']],
    });
    const msgIdSet = new Set(msgs.map((m) => m.id));
    const pinned = await PinnedMessage.findAll({ where: { messageId: { [Op.in]: Array.from(msgIdSet) } }, order: [['pinnedAt', 'DESC']] });
    const pinnedMap = new Map(msgs.map((m) => [m.id, m]));
    const seen = new Set();
    const data = [];
    for (const p of pinned) {
      if (seen.has(p.messageId)) continue;
      seen.add(p.messageId);
      const m = pinnedMap.get(p.messageId);
      if (!m) continue;
      const deletedFor = Array.isArray(m.get('deletedForUserIds')) ? m.get('deletedForUserIds') : [];
      const isHiddenForMe = deletedFor.includes(currentUserId);
      const otherId = m.senderId === currentUserId ? m.receiverId : m.senderId;
      const isHiddenForOther = deletedFor.includes(otherId);
      if (m.isDeletedForAll || isHiddenForMe) {
        if (m.isDeletedForAll) {
          await PinnedMessage.destroy({ where: { messageId: p.messageId } });
        }
        continue;
      }
      if (isHiddenForOther) {
        await PinnedMessage.destroy({ where: { messageId: p.messageId } });
        continue;
      }
      data.push({ id: p.messageId, content: m.content, messageType: m.messageType, createdAt: m.createdAt });
    }
    return res.json({ success: true, data });
  });
}

module.exports = ChatPreferencesChild;
