const { User, Friendship, Notification } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op, fn, col, where } = require('sequelize');
const { isUserOnline } = require('../socket/socketHandler');
const { isBlockedBetween, getBlockedUserIdSetFor } = require('../utils/block');

// Get all users (for searching)
const getAllUsers = asyncHandler(async (req, res) => {
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
    attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'createdAt', 'lastSeenAt', 'hidePhone', 'hideBirthDate'],
    order: [['name', 'ASC']]
  });

  res.json({
    success: true,
    data: users
  });
});

// Send friend request
const sendFriendRequest = asyncHandler(async (req, res) => {
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
      const { emitToAllAdmins } = require('../socket/socketHandler');
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

// Get friend requests (received)
const getFriendRequests = asyncHandler(async (req, res) => {
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
const getSentRequests = asyncHandler(async (req, res) => {
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
const acceptFriendRequest = asyncHandler(async (req, res) => {
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
const rejectFriendRequest = asyncHandler(async (req, res) => {
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

// Get friends list
const getFriends = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const friendships = await Friendship.findAll({
    where: {
      [Op.or]: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' }
      ]
    },
    include: [
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] },
      { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate'] }
    ]
  });

  // Filter out blocked users
  const blockedSet = await getBlockedUserIdSetFor(userId);
  const visibleFriendships = friendships.filter(friendship => {
    const friendId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
    return !blockedSet.has(friendId);
  });

  // Extract friend user data
  const friends = visibleFriendships.map(friendship => {
    const friend = friendship.requesterId === userId 
      ? friendship.addressee 
      : friendship.requester;
    
    return {
      ...friend.toJSON(),
      friendshipId: friendship.id,
      isOnline: isUserOnline(friend.id)
    };
  });

  res.json({
    success: true,
    data: friends
  });
});

// Remove friend
const removeFriend = asyncHandler(async (req, res) => {
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

module.exports = {
  getAllUsers,
  sendFriendRequest,
  getFriendRequests,
  getSentRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriends,
  removeFriend
};
