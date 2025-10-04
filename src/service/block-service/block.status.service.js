import { User, BlockedUser } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';

class BlockStatusChild {
  constructor(parent) {
    this.parent = parent;
  }

  // GET /blocks/status?targetId=...
  getBlockStatus = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { targetId } = req.query || {};

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'targetId is required' });
    }

    const [blockedByMe, blockedMe] = await Promise.all([
      BlockedUser.findOne({ where: { userId: currentUserId, blockedUserId: targetId } }),
      BlockedUser.findOne({ where: { userId: targetId, blockedUserId: currentUserId } }),
    ]);

    return res.json({
      success: true,
      data: {
        blockedByMe: !!blockedByMe,
        blockedMe: !!blockedMe,
        isEitherBlocked: !!(blockedByMe || blockedMe),
        blockId: blockedByMe ? blockedByMe.id : null,
      },
    });
  });

  // GET /blocks
  listBlockedUsers = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    // Lấy danh sách id người bị chặn
    const rows = await BlockedUser.findAll({ where: { userId: currentUserId }, attributes: ['blockedUserId'] });
    const ids = rows.map((r) => r.blockedUserId).filter(Boolean);
    if (ids.length === 0) return res.json({ success: true, data: [] });
    // Lấy thông tin cơ bản của user bị chặn
    const users = await User.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'name', 'email', 'avatar', 'lastSeenAt']
    });
    return res.json({ success: true, data: users });
  });
}

export default BlockStatusChild;
