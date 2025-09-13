const Joi = require('joi');

const createGroupSchema = {
  body: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    memberIds: Joi.array().items(Joi.number().integer().positive()).optional().default([]),
    avatar: Joi.string().max(500).optional(),
    background: Joi.string().max(500).optional(),
    adminsOnly: Joi.boolean().optional(),
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

// userId param validator (for listing user's groups and common groups)
const userIdParamSchema = {
  params: Joi.object({
    userId: Joi.number().integer().positive().required(),
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

// Search messages in a group by content
const searchGroupMessagesSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  query: Joi.object({
    q: Joi.string().min(1).max(200).required(),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
  })
};

const sendGroupMessageSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    content: Joi.string().min(1).max(2000).required(),
    messageType: Joi.string().valid('text', 'image', 'file').optional().default('text'),
    replyToMessageId: Joi.number().integer().positive().optional()
  })
};

const recallGroupMessagesSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    messageIds: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
    scope: Joi.string().valid('self', 'all').required()
  })
};

const editGroupMessageSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
    messageId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    content: Joi.string().min(1).max(2000).required(),
  })
};

const togglePinGroupMessageSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
    messageId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    pinned: Joi.boolean().required(),
  })
};

const reactGroupMessageSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
    messageId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    type: Joi.string().valid('like','love','haha','wow','sad','angry').required(),
  })
};

const unreactGroupMessageSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
    messageId: Joi.number().integer().positive().required(),
  }),
  query: Joi.object({
    type: Joi.string().valid('like','love','haha','wow','sad','angry').optional(),
  }).optional()
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
    adminsOnly: Joi.boolean().optional(),
  }).min(1)
};

const listGroupMembersSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
  })
};

const updateMemberRoleSchema = {
  params: Joi.object({
    groupId: Joi.number().integer().positive().required(),
    memberId: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    role: Joi.string().valid('admin','member').required(),
  })
};

module.exports = {
  createGroupSchema,
  inviteMembersSchema,
  removeMembersSchema,
  groupIdParamSchema,
  userIdParamSchema,
  getGroupMessagesSchema,
  searchGroupMessagesSchema,
  sendGroupMessageSchema,
  updateGroupSchema,
  inviteActionSchema,
  recallGroupMessagesSchema,
  editGroupMessageSchema,
  togglePinGroupMessageSchema,
  reactGroupMessageSchema,
  unreactGroupMessageSchema,
  listGroupMembersSchema,
  updateMemberRoleSchema,
};
