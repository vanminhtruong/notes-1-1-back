import { User, Friendship, Notification } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op, fn, col, where } from 'sequelize';
import { emitToAllAdmins } from '../../socket/socketHandler.js';
import { isBlockedBetween } from '../../utils/block.js';

class FriendshipManagementChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Get all users (for searching)
  getAllUsers = asyncHandler(async (req, res) => {
    const { search, limit = 10 } = req.query;
    const currentUserId = req.user.id;

    const whereClause = {
      id: { [Op.ne]: currentUserId }, // Exclude current user
      isActive: true,
      role: { [Op.ne]: 'admin' } // Exclude admin accounts from public users search
    };

    if (search) {
      const term = `%${String(search).toLowerCase()}%`;
      whereClause[Op.or] = [
        where(fn('lower', col('name')), { [Op.like]: term }),
        where(fn('lower', col('email')), { [Op.like]: term })
      ];
    }

    const users = await User.findAll({
      where: whereClause,
      limit: parseInt(limit),
      attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'createdAt', 'lastSeenAt', 'hidePhone', 'hideBirthDate', 'isActive'],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: users
    });
  });

  // Send friend request
  sendFriendRequest = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const requesterId = req.user.id;

    if (userId === requesterId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send friend request to yourself'
      });
    }

    // Check if target user exists
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    // Prevent sending request if either user has blocked the other
    if (await isBlockedBetween(requesterId, userId)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send friend request due to block'
      });
    }
    
    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      where: {
        [Op.or]: [
          { requesterId, addresseeId: userId },
          { requesterId: userId, addresseeId: requesterId }
        ]
      }
    });

    if (existingFriendship) {
      return res.status(400).json({
        success: false,
        message: 'Friend request already exists or you are already friends'
      });
    }

    let friendship;
    try {
      friendship = await Friendship.create({
        requesterId,
        addresseeId: userId,
        status: 'pending'
      });
    } catch (err) {
      // Handle race condition or legacy unique index errors gracefully
      if (err && (err.name === 'SequelizeUniqueConstraintError' || err.message?.includes('UNIQUE constraint failed'))) {
        return res.status(400).json({
          success: false,
          message: 'Friend request already exists or you are already friends'
        });
      }
      throw err;
    }

    // Persist a notification for the addressee
    try {
      const notif = await Notification.create({
        userId: userId,
        type: 'friend_request',
        fromUserId: requesterId,
        metadata: { friendshipId: friendship.id },
        isRead: false,
      });
      // Emit admin realtime to refresh notification tab in admin user activity
      try {
        emitToAllAdmins && emitToAllAdmins('admin_notification_created', { userId, type: notif.type });
      } catch {}
    } catch (e) {
      // non-blocking
    }

    // Emit WebSocket event to notify the receiver
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${userId}`).emit('new_friend_request', {
        requester: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar
        },
        createdAt: new Date()
      });
    }

    // Get the friendship with user data
    const friendshipWithData = await Friendship.findByPk(friendship.id, {
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] },
        { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      data: friendshipWithData
    });
  });

  // Remove friend
  removeFriend = asyncHandler(async (req, res) => {
    const { friendshipId } = req.params;
    const userId = req.user.id;

    const friendship = await Friendship.findOne({
      where: {
        id: friendshipId,
        [Op.or]: [
          { requesterId: userId },
          { addresseeId: userId }
        ],
        status: 'accepted'
      },
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] },
        { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
      ]
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    // Get the other user ID
    const otherUserId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
    const otherUser = friendship.requesterId === userId ? friendship.addressee : friendship.requester;

    await friendship.destroy();

    // Emit socket event to notify the other user about unfriending
    const io = req.app.get('io');
    if (io && otherUser) {
      io.to(`user_${otherUserId}`).emit('friend_removed', {
        removedBy: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar
        },
        friendshipId: friendshipId,
        removedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Friend removed successfully'
    });
  });
}

export default FriendshipManagementChild;
