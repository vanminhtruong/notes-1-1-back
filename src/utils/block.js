const { BlockedUser } = require('../models');
const { Op } = require('sequelize');

/**
 * Returns true if there is a block between two users in either direction
 * @param {number} a - user id A
 * @param {number} b - user id B
 * @returns {Promise<boolean>}
 */
async function isBlockedBetween(a, b) {
  if (!a || !b) return false;
  const blocked = await BlockedUser.findOne({
    where: {
      [Op.or]: [
        { userId: a, blockedUserId: b },
        { userId: b, blockedUserId: a },
      ],
    },
  });
  return !!blocked;
}

/**
 * Returns a Set of userIds who are blocked-with the given user (either they block you or you block them)
 * @param {number} userId
 * @returns {Promise<Set<number>>}
 */
async function getBlockedUserIdSetFor(userId) {
  const rows = await BlockedUser.findAll({
    where: {
      [Op.or]: [{ userId }, { blockedUserId: userId }],
    },
    attributes: ['userId', 'blockedUserId'],
  });
  const set = new Set();
  for (const r of rows) {
    if (r.userId !== userId) set.add(r.userId);
    if (r.blockedUserId !== userId) set.add(r.blockedUserId);
  }
  return set;
}

module.exports = { isBlockedBetween, getBlockedUserIdSetFor };
