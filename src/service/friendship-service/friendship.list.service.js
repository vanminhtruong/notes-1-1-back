import { User, Friendship } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isUserOnline } from '../../socket/socketHandler.js';
import { getBlockedUserIdSetFor } from '../../utils/block.js';

class FriendshipListChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Get friends list
  getFriends = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const friendships = await Friendship.findAll({
      where: {
        [Op.or]: [
          { requesterId: userId, status: 'accepted' },
          { addresseeId: userId, status: 'accepted' }
        ]
      },
      include: [
        { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate', 'isActive'] },
        { model: User, as: 'addressee', attributes: ['id', 'name', 'email', 'avatar', 'phone', 'birthDate', 'gender', 'lastSeenAt', 'hidePhone', 'hideBirthDate', 'isActive'] }
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
}

export default FriendshipListChild;
