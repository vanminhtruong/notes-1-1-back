import { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction, Notification } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isBlockedBetween, getBlockedUserIdSetFor } from '../../utils/block.js';

class GroupPinsChild {
  constructor(parent) {
    this.parent = parent;
  }

  togglePinGroup = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId } = req.params;
    const { pinned } = req.body;

    // Ensure user is a member of the group
    const membership = await GroupMember.findOne({
      where: { groupId, userId: currentUserId }
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You can only pin groups you are a member of'
      });
    }

    if (pinned) {
      // Pin the group
      const [pinnedGroup, created] = await PinnedChat.findOrCreate({
        where: { userId: currentUserId, pinnedGroupId: groupId },
        defaults: { userId: currentUserId, pinnedGroupId: groupId }
      });
      
      return res.json({
        success: true,
        message: created ? 'Group pinned' : 'Group already pinned',
        data: { pinned: true }
      });
    } else {
      // Unpin the group
      const deleted = await PinnedChat.destroy({
        where: { userId: currentUserId, pinnedGroupId: groupId }
      });
      
      return res.json({
        success: true,
        message: deleted > 0 ? 'Group unpinned' : 'Group was not pinned',
        data: { pinned: false }
      });
    }
  });

  getGroupPinStatus = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId } = req.params;

    const pinnedGroup = await PinnedChat.findOne({
      where: { userId: currentUserId, pinnedGroupId: groupId }
    });

    return res.json({
      success: true,
      data: { pinned: !!pinnedGroup }
    });
  });

  // Pin/Unpin a specific group message (per-user)
  togglePinGroupMessage = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId, messageId } = req.params;
    const { pinned } = req.body;

    // Verify membership
    const membership = await GroupMember.findOne({ where: { groupId, userId: currentUserId } });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a group member' });

    const msg = await GroupMessage.findOne({ where: { id: messageId, groupId } });
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    if (pinned) {
      // Create a record for current user; shared semantics derived from any record existence
      await PinnedMessage.findOrCreate({
        where: { userId: currentUserId, groupMessageId: messageId },
        defaults: { userId: currentUserId, groupMessageId: messageId },
      });
    } else {
      // Unpin globally for the group message
      await PinnedMessage.destroy({ where: { groupMessageId: messageId } });
    }

    // Realtime notify all group members
    try {
      const members = await GroupMember.findAll({ where: { groupId } });
      const payload = { messageId: Number(messageId), groupId: Number(groupId), pinned: !!pinned };
      for (const m of members) {
        global.io && global.io.to(`user_${m.userId}`).emit('group_message_pinned', payload);
      }
      
      // Notify all admins for monitoring
      const adminPayload = { messageId: Number(messageId), groupId: Number(groupId), pinned: !!pinned };
      global.io && global.io.emit('admin_group_message_pinned', adminPayload);
    } catch (e) {
      // ignore socket errors
    }

    return res.json({ success: true, data: { pinned: !!pinned } });
  });

  // List pinned messages in a group (current user scope)
  listGroupPinnedMessages = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { groupId } = req.params;

    // Verify membership
    const membership = await GroupMember.findOne({ where: { groupId, userId: currentUserId } });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a group member' });

    const msgs = await GroupMessage.findAll({
      where: { groupId },
      attributes: ['id', 'groupId', 'senderId', 'content', 'messageType', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    const idSet = new Set(msgs.map(m => m.id));
    // Shared pins: return distinct groupMessageIds regardless of who pinned
    const pins = await PinnedMessage.findAll({ where: { groupMessageId: { [Op.in]: Array.from(idSet) } }, order: [['pinnedAt', 'DESC']] });
    const map = new Map(msgs.map(m => [m.id, m]));
    const seen = new Set();
    const data = [];
    for (const p of pins) {
      if (seen.has(p.groupMessageId)) continue;
      seen.add(p.groupMessageId);
      const m = map.get(p.groupMessageId);
      if (!m) continue;
      const deletedFor = Array.isArray(m.get('deletedForUserIds')) ? m.get('deletedForUserIds') : [];
      const isHiddenForMe = deletedFor.includes(currentUserId);
      if (m.isDeletedForAll || isHiddenForMe) {
        if (m.isDeletedForAll) {
          await PinnedMessage.destroy({ where: { groupMessageId: p.groupMessageId } });
        }
        continue;
      }
      data.push({ id: p.groupMessageId, content: m.content, messageType: m.messageType, createdAt: m.createdAt });
    }
    return res.json({ success: true, data });
  });
}

export default GroupPinsChild;
