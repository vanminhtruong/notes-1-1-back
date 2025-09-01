const { User, Friendship } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op, fn, col, where } = require('sequelize');
const { isUserOnline } = require('../socket/socketHandler');

// Get all users (for searching)
const getAllUsers = asyncHandler(async (req, res) => {
  const { search, limit = 10 } = req.query;
  const currentUserId = req.user.id;

  const whereClause = {
    id: { [Op.ne]: currentUserId }, // Exclude current user
    isActive: true
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
    attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'createdAt', 'lastSeenAt'],
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

  // Emit WebSocket event to notify the receiver
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${userId}`).emit('new_friend_request', {
      requester: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email
      },
      createdAt: new Date()
    });
  }

  // Get the friendship with user data
  const friendshipWithData = await Friendship.findByPk(friendship.id, {
    include: [
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] },
      { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
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
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
    ],
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    data: friendRequests
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
      { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
    ],
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    data: sentRequests
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
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
    ]
  });

  if (!friendship) {
    return res.status(404).json({
      success: false,
      message: 'Friend request not found'
    });
  }

  friendship.status = 'accepted';
  await friendship.save();

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

  await friendship.destroy();

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
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] },
      { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
    ]
  });

  // Extract friend user data
  const friends = friendships.map(friendship => {
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
      { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] },
      { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt'] }
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
