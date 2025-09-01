const Joi = require('joi');

const sendMessageSchema = {
  body: Joi.object({
    receiverId: Joi.number().integer().positive().required(),
    content: Joi.string().min(1).max(1000).required(),
    messageType: Joi.string().valid('text', 'image', 'file').optional().default('text')
  })
};

const getChatMessagesSchema = {
  params: Joi.object({
    userId: Joi.number().integer().positive().required()
  }),
  query: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })
};

const markAsReadSchema = {
  params: Joi.object({
    senderId: Joi.number().integer().positive().required()
  })
};

const recallMessagesSchema = {
  body: Joi.object({
    messageIds: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    scope: Joi.string().valid('self', 'all').required()
  })
};

module.exports = {
  sendMessageSchema,
  getChatMessagesSchema,
  markAsReadSchema,
  recallMessagesSchema
};
