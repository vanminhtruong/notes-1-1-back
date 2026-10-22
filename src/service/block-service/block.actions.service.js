import { userRepository, blockedUserRepository } from '../../repositories/index.js';
import { Op } from 'sequelize';
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
    const target = await userRepository.findByPk(targetId);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const [record, created] = await blockedUserRepository.findOrCreate({
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
      // Notify all admins for monitoring
      io.emit('admin_user_blocked', {
        blockerId: currentUserId,
        blockedUserId: Number(targetId),
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

    const count = await blockedUserRepository.destroy({ where: { userId: currentUserId, blockedUserId: targetId } });

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
      // Notify all admins for monitoring
      io.emit('admin_user_unblocked', {
        blockerId: currentUserId,
        blockedUserId: Number(targetId),
      });
    }

    return res.json({ success: true, data: { deleted: count } });
  });

  // POST /blocks/bulk { targetIds: number[] }
  bulkBlockUsers = asyncHandler(async (req, res) => {
    const currentUserId = req.user.id;
    const { targetIds } = req.body || {};

    if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
      return res.status(400).json({ success: false, message: 'targetIds array is required' });
    }

    // Filter out self and validate
    const validTargetIds = targetIds.filter(id => Number(id) !== Number(currentUserId));

    if (validTargetIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid target users' });
    }

    // Check all target users exist
    const existingUsers = await userRepository.findAll({
      where: { id: { [Op.in]: validTargetIds } },
      attributes: ['id']
    });
    const existingIds = existingUsers.map(u => u.id);

    const io = req.app.get('io');
    const blockedIds = [];
    const failedIds = [];

    for (const targetId of validTargetIds) {
      if (!existingIds.includes(Number(targetId))) {
        failedIds.push(targetId);
        continue;
      }

      try {
        const [record, created] = await blockedUserRepository.findOrCreate({
          where: { userId: currentUserId, blockedUserId: targetId },
          defaults: { userId: currentUserId, blockedUserId: targetId },
        });

        blockedIds.push(targetId);

        // Emit socket events
        if (io) {
          io.to(`user_${currentUserId}`).emit('user_blocked', {
            userId: currentUserId,
            targetId: Number(targetId),
          });
          io.to(`user_${targetId}`).emit('user_blocked', {
            userId: currentUserId,
            targetId: Number(targetId),
          });
          io.emit('admin_user_blocked', {
            blockerId: currentUserId,
            blockedUserId: Number(targetId),
          });
        }
      } catch (err) {
        failedIds.push(targetId);
      }
    }

    return res.status(201).json({
      success: true,
      message: `Successfully blocked ${blockedIds.length} user(s)`,
      data: {
        blockedCount: blockedIds.length,
        blockedIds,
        failedIds
      }
    });
  });
}

export default BlockActionsChild;
