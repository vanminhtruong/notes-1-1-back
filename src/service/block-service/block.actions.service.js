import { User, BlockedUser } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';

class BlockActionsChild {
  constructor(parent) {
    this.parent = parent;
  }

  // POST /blocks { targetId }
  blockUser = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { targetId } = req.body || {};

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'targetId is required' });
    }
    if (Number(targetId) === Number(currentUserId)) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    // Ensure target user exists
    const target = await User.findByPk(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const [record, created] = await BlockedUser.findOrCreate({
      where: { userId: currentUserId, blockedUserId: targetId },
      defaults: { userId: currentUserId, blockedUserId: targetId },
    });

    // Emit socket events for realtime UI sync
    const io = req.app.get('io');
    if (io) {
      // Notify my other devices
      io.to(`user_${currentUserId}`).emit('user_blocked', {
        userId: currentUserId,
        targetId: Number(targetId),
      });
      // Notify the target user
      io.to(`user_${targetId}`).emit('user_blocked', {
        userId: currentUserId,
        targetId: Number(targetId),
      });
    }

    return res.status(created ? 201 : 200).json({ success: true, data: record });
  });

  // DELETE /blocks?targetId=... or /blocks/:targetId
  unblockUser = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const targetId = req.params.targetId || req.query.targetId;

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'targetId is required' });
    }

    const count = await BlockedUser.destroy({ where: { userId: currentUserId, blockedUserId: targetId } });

    const io = req.app.get('io');
    if (io && count > 0) {
      // Notify my other devices
      io.to(`user_${currentUserId}`).emit('user_unblocked', {
        userId: currentUserId,
        targetId: Number(targetId),
      });
      // Notify the target user
      io.to(`user_${targetId}`).emit('user_unblocked', {
        userId: currentUserId,
        targetId: Number(targetId),
      });
    }

    return res.json({ success: true, data: { deleted: count } });
  });
}

export default BlockActionsChild;
