const Joi = require('joi');

const sendFriendRequestSchema = {
  body: Joi.object({
    userId: Joi.number().integer().positive().required()
  })
};

const friendshipIdSchema = {
  params: Joi.object({
    friendshipId: Joi.number().integer().positive().required()
  })
};

const getUsersSchema = {
  query: Joi.object({
    search: Joi.string().optional().allow(''),
    limit: Joi.number().integer().min(1).max(50).optional()
  })
};

module.exports = {
  sendFriendRequestSchema,
  friendshipIdSchema,
  getUsersSchema
};
