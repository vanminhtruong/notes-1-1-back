import { Group, GroupMember, GroupMessage, User, Friendship, GroupInvite, GroupMessageRead, PinnedChat, PinnedMessage, MessageReaction, Notification } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { deleteMultipleFiles, deleteOldFileOnUpdate, isUploadedFile, hasUploadedFile } from '../../utils/fileHelper.js';

class GroupManagementChild {
  constructor(parent) {
    this.parent = parent;
  }

  listUserGroups = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const uid = Number(userId);

    // Collect group IDs where target user is a member
    const memberships = await GroupMember.findAll({ where: { userId: uid }, attributes: ['groupId'] });
    const groupIds = memberships.map(m => m.groupId);
    if (groupIds.length === 0) return res.json({ success: true, data: [] });

    const groups = await Group.findAll({ where: { id: { [Op.in]: groupIds } }, order: [['updatedAt', 'DESC']] });

    // Determine pinned groups for current user (for consistent shape)
    const pinnedGroups = await PinnedChat.findAll({ where: { userId: currentUserId, pinnedGroupId: { [Op.not]: null } } });
    const pinnedGroupIds = new Set(pinnedGroups.map(p => p.pinnedGroupId));

    const data = [];
    for (const g of groups) {
      const memberIds = await this.parent.membersChild.getGroupMemberIds(g.id);
      data.push({ id: g.id, name: g.name, ownerId: g.ownerId, avatar: g.avatar, background: g.background, adminsOnly: !!g.adminsOnly, members: memberIds, isPinned: pinnedGroupIds.has(g.id) });
    }

    // Sort pinned first, then updatedAt
    data.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aGroup = groups.find(gr => gr.id === a.id);
      const bGroup = groups.find(gr => gr.id === b.id);
      return new Date(bGroup.updatedAt) - new Date(aGroup.updatedAt);
    });

    res.json({ success: true, data });
  });

  listCommonGroups = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const uid = Number(userId);

    // Get memberships for both users
    const [mine, theirs] = await Promise.all([
      GroupMember.findAll({ where: { userId: currentUserId }, attributes: ['groupId'] }),
      GroupMember.findAll({ where: { userId: uid }, attributes: ['groupId'] }),
    ]);
    const mySet = new Set(mine.map(m => m.groupId));
    const commonIds = Array.from(new Set(theirs.map(t => t.groupId))).filter(id => mySet.has(id));
    if (commonIds.length === 0) return res.json({ success: true, data: [] });

    const groups = await Group.findAll({ where: { id: { [Op.in]: commonIds } }, order: [['updatedAt', 'DESC']] });

    // Pinned status for current user
    const pinnedGroups = await PinnedChat.findAll({ where: { userId: currentUserId, pinnedGroupId: { [Op.not]: null } } });
    const pinnedGroupIds = new Set(pinnedGroups.map(p => p.pinnedGroupId));

    const data = [];
    for (const g of groups) {
      const memberIds = await this.parent.membersChild.getGroupMemberIds(g.id);
      data.push({ id: g.id, name: g.name, ownerId: g.ownerId, avatar: g.avatar, background: g.background, members: memberIds, isPinned: pinnedGroupIds.has(g.id) });
    }

    data.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aGroup = groups.find(gr => gr.id === a.id);
      const bGroup = groups.find(gr => gr.id === b.id);
      return new Date(bGroup.updatedAt) - new Date(aGroup.updatedAt);
    });

    res.json({ success: true, data });
  });

  createGroup = asyncHandler(async (req, res) => {
    const { name, memberIds = [], avatar, background, adminsOnly = false } = req.body;
    const ownerId = req.user.id;

    const uniqueMemberIds = Array.from(new Set(memberIds.filter(id => id && id !== ownerId)));

    const group = await Group.create({ name, ownerId, avatar, background, adminsOnly: !!adminsOnly });
    await GroupMember.create({ groupId: group.id, userId: ownerId, role: 'owner' });
    for (const uid of uniqueMemberIds) {
      await GroupMember.create({ groupId: group.id, userId: uid, role: 'member' });
    }

    const payload = { id: group.id, name: group.name, ownerId, avatar: group.avatar, background: group.background, adminsOnly: !!group.adminsOnly, members: [ownerId, ...uniqueMemberIds] };
    const io = req.app.get('io') || global.io;
    if (io) {
      for (const uid of payload.members) {
        io.to(`user_${uid}`).emit('group_created', payload);
      }
    }

    res.status(201).json({ success: true, data: payload });
  });

  listMyGroups = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { search } = req.query;
    const memberships = await GroupMember.findAll({ where: { userId }, attributes: ['groupId'] });
    const groupIds = memberships.map(m => m.groupId);
    
    // Build where clause with optional search filter
    const whereClause = { id: { [Op.in]: groupIds } };
    if (search && search.trim()) {
      whereClause.name = { [Op.like]: `%${search.trim()}%` };
    }
    
    const groups = await Group.findAll({ where: whereClause, order: [['updatedAt', 'DESC']] });

    // Get pinned groups for current user
    const pinnedGroups = await PinnedChat.findAll({
      where: { userId, pinnedGroupId: { [Op.not]: null } }
    });
    const pinnedGroupIds = new Set(pinnedGroups.map(p => p.pinnedGroupId));

    const data = [];
    for (const g of groups) {
      const memberIds = await this.parent.membersChild.getGroupMemberIds(g.id);
      // Determine my role in this group for convenience on the client
      const myMembership = await GroupMember.findOne({ where: { groupId: g.id, userId }, attributes: ['role'] });
      // Compute unread count per user using GroupMessageRead (per-user tracking)
      let unreadCount = 0;
      try {
        const rows = await GroupMessage.findAll({
          where: {
            groupId: g.id,
            senderId: { [Op.ne]: userId },
            messageType: { [Op.ne]: 'system' },
            [Op.or]: [
              { isDeletedForAll: { [Op.not]: true } },
              { isDeletedForAll: null },
            ],
          },
          attributes: ['id', 'deletedForUserIds'],
          include: [
            {
              model: GroupMessageRead,
              as: 'GroupMessageReads',
              attributes: ['userId'],
              required: false,
              where: { userId }
            }
          ]
        });
        const filtered = rows
          .map(r => (typeof r.toJSON === 'function' ? r.toJSON() : r))
          .filter(m => {
            // Exclude messages I've deleted for me
            let del = m.deletedForUserIds;
            if (typeof del === 'string') {
              try { del = JSON.parse(del); } catch { del = null; }
            }
            if (Array.isArray(del) && del.includes(userId)) return false;
            // Count as unread if there is NO read record by me
            const hasMyRead = Array.isArray(m.GroupMessageReads) && m.GroupMessageReads.some((gr) => Number(gr.userId) === Number(userId));
            return !hasMyRead;
          });
        unreadCount = filtered.length;
      } catch (e) {
        unreadCount = 0;
      }
      // Determine latest visible message time for current user (exclude system messages, and messages deleted-for-me)
      let lastMessageAt = null;
      try {
        const recent = await GroupMessage.findAll({
          where: { groupId: g.id, messageType: { [Op.ne]: 'system' } },
          attributes: ['id', 'createdAt', 'deletedForUserIds'],
          order: [['createdAt', 'DESC']],
          limit: 20,
        });
        for (const m of recent) {
          let del = m.deletedForUserIds;
          if (typeof del === 'string') {
            try { del = JSON.parse(del); } catch { del = null; }
          }
          if (Array.isArray(del) && del.includes(userId)) {
            continue;
          }
          lastMessageAt = m.createdAt;
          break;
        }
      } catch (e) {
        lastMessageAt = null;
      }

      data.push({ 
        id: g.id, 
        name: g.name, 
        ownerId: g.ownerId, 
        avatar: g.avatar, 
        background: g.background, 
        adminsOnly: !!g.adminsOnly,
        members: memberIds,
        isPinned: pinnedGroupIds.has(g.id),
        myRole: myMembership?.role || (g.ownerId === userId ? 'owner' : 'member'),
        unreadCount,
        lastMessageAt
      });
    }

    // Sort by pin status first, then by updatedAt
    data.sort((a, b) => {
      // Pinned groups always come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      
      // Within same pin status, sort by updatedAt (most recent first)
      const aGroup = groups.find(g => g.id === a.id);
      const bGroup = groups.find(g => g.id === b.id);
      return new Date(bGroup.updatedAt) - new Date(aGroup.updatedAt);
    });

    res.json({ success: true, data });
  });

  deleteGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Ensure requester is owner
    const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!ownerMembership || ownerMembership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can delete group' });
    }

    // Collect members for notification before deletion
    const members = await this.parent.membersChild.getGroupMemberIds(groupId);

    // Lấy thông tin group để xóa files
    const group = await Group.findByPk(groupId);
    
    // Xóa avatar và background của group
    const filesToDelete = [];
    if (group?.avatar) filesToDelete.push(group.avatar);
    if (group?.background) filesToDelete.push(group.background);
    
    // Lấy tất cả messages và xóa files đính kèm
    const messages = await GroupMessage.findAll({ 
      where: { groupId }, 
      attributes: ['id', 'content', 'messageType'] 
    });
    for (const msg of messages) {
      if (hasUploadedFile(msg)) {
        filesToDelete.push(msg.content);
      }
    }
    
    if (filesToDelete.length > 0) {
      deleteMultipleFiles(filesToDelete);
    }

    // Remove messages and memberships, then the group
    await GroupMessage.destroy({ where: { groupId } });
    await GroupMember.destroy({ where: { groupId } });
    await Group.destroy({ where: { id: groupId } });

    const io = req.app.get('io');
    if (io && Array.isArray(members)) {
      const payload = { groupId: Number(groupId) };
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_deleted', payload);
      }
    }

    res.json({ success: true, data: { groupId: Number(groupId) } });
  });

  updateGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    const { name, avatar, background, adminsOnly } = req.body;

    const ownerMembership = await GroupMember.findOne({ where: { groupId, userId } });
    if (!ownerMembership || ownerMembership.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can update group' });
    }

    // Lấy thông tin group hiện tại để lưu giá trị cũ
    const currentGroup = await Group.findByPk(groupId);
    const oldAvatar = currentGroup.avatar;
    const oldBackground = currentGroup.background;
    let shouldDeleteOldAvatar = false;
    let shouldDeleteOldBackground = false;
    
    const fieldsToUpdate = {};
    if (typeof name !== 'undefined') fieldsToUpdate.name = name;
    if (typeof avatar !== 'undefined') {
      fieldsToUpdate.avatar = avatar;
      // Check xem có cần xóa avatar cũ không
      if (avatar !== oldAvatar && oldAvatar && isUploadedFile(oldAvatar)) {
        shouldDeleteOldAvatar = true;
      }
    }
    if (typeof background !== 'undefined') {
      fieldsToUpdate.background = background;
      // Check xem có cần xóa background cũ không
      if (background !== oldBackground && oldBackground && isUploadedFile(oldBackground)) {
        shouldDeleteOldBackground = true;
      }
    }
    if (typeof adminsOnly !== 'undefined') fieldsToUpdate.adminsOnly = !!adminsOnly;

    await Group.update(fieldsToUpdate, { where: { id: groupId } });

    // Xóa files cũ SAU khi update thành công
    if (shouldDeleteOldAvatar) {
      deleteOldFileOnUpdate(oldAvatar, fieldsToUpdate.avatar);
    }
    if (shouldDeleteOldBackground) {
      deleteOldFileOnUpdate(oldBackground, fieldsToUpdate.background);
    }
    const updated = await Group.findByPk(groupId);
    const members = await this.parent.membersChild.getGroupMemberIds(groupId);

    const data = { id: updated.id, name: updated.name, ownerId: updated.ownerId, avatar: updated.avatar, background: updated.background, adminsOnly: !!updated.adminsOnly, members };

    const io = req.app.get('io') || global.io;
    if (io) {
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_updated', data);
      }
    }

    res.json({ success: true, data });
  });
}

export default GroupManagementChild;
