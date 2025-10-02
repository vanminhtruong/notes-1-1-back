import { User, Message, Group, GroupMember, Friendship, GroupMessage, MessageRead, GroupMessageRead } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';

class AdminMonitorChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Admin: Get Group members with role (owner/admin/member) for monitoring
  adminGetGroupMembers = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const group = await Group.findByPk(groupId, { attributes: ['id', 'name', 'ownerId', 'avatar'] });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const rows = await GroupMember.findAll({
      where: { groupId: Number(groupId) },
      attributes: ['userId', 'role'],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }]
    });
    const members = rows.map(r => ({
      id: r.user?.id || r.userId,
      name: r.user?.name || `User ${r.userId}`,
      avatar: r.user?.avatar || null,
      role: r.role || (r.userId === group.ownerId ? 'owner' : 'member'),
    }));
    return res.json({ success: true, data: { group: { id: group.id, name: group.name, ownerId: group.ownerId, avatar: group.avatar }, members } });
  });

  // Admin: Get DM messages between two users (for monitoring)
  adminGetDMMessages = asyncHandler(async (req, res) => {
    const { userId, otherUserId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const a = Number(userId);
    const b = Number(otherUserId);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: a, receiverId: b },
          { senderId: b, receiverId: a }
        ],
        isDeletedForAll: { [Op.not]: true },
        [Op.and]: [
          { [Op.or]: [ { deletedForUserIds: { [Op.is]: null } }, { deletedForUserIds: { [Op.notLike]: `%${a}%` } } ] },
          { [Op.or]: [ { deletedForUserIds: { [Op.is]: null } }, { deletedForUserIds: { [Op.notLike]: `%${b}%` } } ] }
        ]
      },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'avatar'] },
        { model: Message, as: 'replyToMessage', attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'], include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }] },
        { model: MessageRead, as: 'MessageReads', attributes: ['userId', 'readAt'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    const data = messages.map(m => {
      const raw = m.toJSON();
      // Chuẩn hóa danh sách người đã đọc (DM thường là 1 người còn lại)
      const reads = Array.isArray(raw.MessageReads) ? raw.MessageReads : [];
      const readByUserIds = reads.map(r => r.userId);
      return { ...raw, readByUserIds };
    }).reverse();
    res.json({ success: true, data, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), hasMore: messages.length === parseInt(limit, 10) } });
  });

  // Admin: Get Group messages for a group (for monitoring)
  adminGetGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const gid = Number(groupId);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const messages = await GroupMessage.findAll({
      where: { groupId: gid, isDeletedForAll: { [Op.not]: true } },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] },
        { model: GroupMessage, as: 'replyToMessage', attributes: ['id', 'content', 'messageType', 'senderId', 'createdAt'], include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'avatar'] }] },
        { model: GroupMessageRead, as: 'GroupMessageReads', attributes: ['userId', 'readAt'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    const data = messages.map(m => {
      const raw = m.toJSON();
      const reads = Array.isArray(raw.GroupMessageReads) ? raw.GroupMessageReads : [];
      const readByUserIds = reads.map(r => r.userId);
      return { ...raw, readByUserIds };
    }).reverse();
    res.json({ success: true, data, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), hasMore: messages.length === parseInt(limit, 10) } });
  });

  // Get user activity (messages and groups)
  getUserActivity = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'avatar', 'lastSeenAt'] });
    if (!user) { return res.status(404).json({ message: 'Không tìm thấy người dùng' }); }

    const messages = await Message.findAll({
      where: {
        [Op.or]: [ { senderId: userId }, { receiverId: userId } ],
        isDeletedForAll: { [Op.not]: true },
        [Op.or]: [ { deletedForUserIds: { [Op.is]: null } }, { deletedForUserIds: { [Op.notLike]: `%${parseInt(userId)}%` } } ]
      },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    });

    const groups = await GroupMember.findAll({
      where: { userId },
      include: [{ model: Group, as: 'group', attributes: ['id', 'name', 'avatar', 'createdAt'], include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'email'] }] }],
      order: [['createdAt', 'DESC']]
    });

    const friendships = await Friendship.findAll({
      where: { [Op.or]: [ { requesterId: userId, status: 'accepted' }, { addresseeId: userId, status: 'accepted' } ] },
      include: [ { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar'] }, { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar'] } ]
    });

    const uid = parseInt(String(userId), 10);
    res.json({
      user,
      activity: {
        messages,
        groups: groups.map(gm => gm.group),
        friends: friendships.map(f => (f.requesterId === uid ? f.addressee : f.requester))
      }
    });
  });
}

export default AdminMonitorChild;
