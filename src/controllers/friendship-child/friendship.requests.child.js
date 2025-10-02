import { User, Friendship, Notification } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isBlockedBetween, getBlockedUserIdSetFor } from '../../utils/block.js';

class FriendshipRequestsChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Get friend requests (received)
  getFriendRequests = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const friendRequests = await Friendship.findAll({
      where: {
        addresseeId: userId,
        status: 'pending'
      },
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Filter out requests from users blocked-with current user
    const blockedSet = await getBlockedUserIdSetFor(userId);
    const filtered = friendRequests.filter(fr => !blockedSet.has(fr.requesterId));

    res.json({
      success: true,
      data: filtered
    });
  });

  // Get sent friend requests
  getSentRequests = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const sentRequests = await Friendship.findAll({
      where: {
        requesterId: userId,
        status: 'pending'
      },
      include: [
        { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Filter out requests sent to users blocked-with current user
    const blockedSet = await getBlockedUserIdSetFor(userId);
    const filtered = sentRequests.filter(fr => !blockedSet.has(fr.addresseeId));

    res.json({
      success: true,
      data: filtered
    });
  });

  // Accept friend request
  acceptFriendRequest = asyncHandler(async (req, res) => {
    const { friendshipId } = req.params;
    const userId = req.user.id;

    const friendship = await Friendship.findOne({
      where: {
        id: friendshipId,
        addresseeId: userId,
        status: 'pending'
      },
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
      ]
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }
    // Disallow accepting if there's a block between users
    if (await isBlockedBetween(userId, friendship.requesterId)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot accept friend request due to block'
      });
    }

    friendship.status = 'accepted';
    await friendship.save();

    // Mark persisted notification as read for the addressee (current user)
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            userId: userId,
            type: 'friend_request',
            fromUserId: friendship.requesterId,
            isRead: false,
          },
        }
      );
    } catch (e) {}

    // Emit WebSocket event to notify both requester and accepter
    const io = req.app.get('io');
    if (io) {
      // To requester: include who accepted
      const payloadForRequester = {
        acceptedBy: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          avatar: req.user.avatar,
          lastSeenAt: req.user.lastSeenAt,
        },
        acceptedAt: new Date(),
      };
      io.to(`user_${friendship.requesterId}`).emit('friend_request_accepted', payloadForRequester);

      // To accepter: include requester info (so other client sessions update too)
      if (friendship.requester) {
        const payloadForAccepter = {
          requester: {
            id: friendship.requester.id,
            name: friendship.requester.name,
            email: friendship.requester.email,
            avatar: friendship.requester.avatar,
            lastSeenAt: friendship.requester.lastSeenAt,
          },
          acceptedAt: new Date(),
        };
        io.to(`user_${userId}`).emit('friend_request_accepted', payloadForAccepter);
      }
    }

    res.json({
      success: true,
      message: 'Friend request accepted',
      data: friendship
    });
  });

  // Reject friend request
  rejectFriendRequest = asyncHandler(async (req, res) => {
    const { friendshipId } = req.params;
    const userId = req.user.id;

    const friendship = await Friendship.findOne({
      where: {
        id: friendshipId,
        addresseeId: userId,
        status: 'pending'
      }
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }

    // Capture requesterId before destroy
    const requesterId = friendship.requesterId;
    await friendship.destroy();

    // Mark persisted notification as read since it has been processed (rejected)
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            userId: userId,
            type: 'friend_request',
            fromUserId: requesterId,
            isRead: false,
          },
        }
      );
    } catch (e) {}

    // Emit WebSocket event để thông báo cho người gửi (requester)
    try {
      const io = req.app.get('io');
      if (io && requesterId) {
        io.to(`user_${requesterId}`).emit('friend_request_rejected', {
          rejectedBy: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            avatar: req.user.avatar,
          },
          rejectedAt: new Date(),
        });
      }
    } catch (e) {
      // non-blocking
    }

    res.json({
      success: true,
      message: 'Friend request rejected'
    });
  });
}

export default FriendshipRequestsChild;
