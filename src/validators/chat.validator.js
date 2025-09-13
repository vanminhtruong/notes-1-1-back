const Joi = require('joi');

const sendMessageSchema = {
  body: Joi.object({
    receiverId: Joi.number().integer().positive().required(),
    content: Joi.string().min(1).max(1000).required(),
    messageType: Joi.string().valid('text', 'image', 'file').optional().default('text'),
    replyToMessageId: Joi.number().integer().positive().optional()
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

// Search messages in a 1-1 chat
const searchChatMessagesSchema = {
  params: Joi.object({
    userId: Joi.number().integer().positive().required()
  }),
  query: Joi.object({
    q: Joi.string().min(1).max(200).required(),
    limit: Joi.number().integer().min(1).max(100).optional().default(20)
  })
};

const markAsReadSchema = {
  params: Joi.object({
    senderId: Joi.number().integer().positive().required()
  })
};

const reactMessageSchema = {
  params: Joi.object({
    messageId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    type: Joi.string().valid('like','love','haha','wow','sad','angry').required(),
  })
};

const unreactMessageSchema = {
  params: Joi.object({
    messageId: Joi.number().integer().positive().required(),
  }),
  query: Joi.object({
    type: Joi.string().valid('like','love','haha','wow','sad','angry').optional(),
  }).optional()
};

const recallMessagesSchema = {
  body: Joi.object({
    messageIds: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    scope: Joi.string().valid('self', 'all').required()
  })
};

const editMessageSchema = {
  params: Joi.object({
    messageId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    content: Joi.string().min(1).max(1000).required(),
  })
};

// Set per-chat nickname (alias) for the other user
const setChatNicknameSchema = {
  params: Joi.object({
    userId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    nickname: Joi.string().allow('', null).max(60).optional(),
  })
};

module.exports = {
  sendMessageSchema,
  getChatMessagesSchema,
  searchChatMessagesSchema,
  markAsReadSchema,
  reactMessageSchema,
  unreactMessageSchema,
  recallMessagesSchema,
  editMessageSchema,
  setChatNicknameSchema
};
