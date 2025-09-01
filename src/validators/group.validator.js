const Joi = require('joi');

const createGroupSchema = {
  body: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    memberIds: Joi.array().items(Joi.number().integer().positive()).optional().default([]),
    avatar: Joi.string().max(500).optional(),
    background: Joi.string().max(500).optional(),
  })
};

const inviteMembersSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    memberIds: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  })
};

const removeMembersSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    memberIds: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  })
};

const groupIdParamSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
};

const getGroupMessagesSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  query: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })
};

const sendGroupMessageSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    content: Joi.string().min(1).max(2000).required(),
    messageType: Joi.string().valid('text', 'image', 'file').optional().default('text')
  })
};

const inviteActionSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
    inviteId: Joi.number().integer().positive().required(),
  })
};

const updateGroupSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    avatar: Joi.string().max(500).optional(),
    background: Joi.string().max(500).optional(),
  }).min(1)
};

module.exports = {
  createGroupSchema,
  inviteMembersSchema,
  removeMembersSchema,
  groupIdParamSchema,
  getGroupMessagesSchema,
  sendGroupMessageSchema,
  updateGroupSchema,
  inviteActionSchema,
};
