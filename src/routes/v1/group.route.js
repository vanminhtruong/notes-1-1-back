const express = require('express');
const authenticate = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const {
  createGroup,
  listMyGroups,
  getGroupMessages,
  searchGroupMessages,
  sendGroupMessage,
  recallGroupMessages,
  editGroupMessage,
  inviteMembers,
  removeMembers,
  leaveGroup,
  updateGroup,
  deleteGroup,
  acceptGroupInvite,
  declineGroupInvite,
  listMyInvites,
  markGroupMessagesRead,
  togglePinGroup,
  getGroupPinStatus,
  togglePinGroupMessage,
  listGroupPinnedMessages,
} = require('../../controllers/group.controller');
const {
  createGroupSchema,
  inviteMembersSchema,
  removeMembersSchema,
  groupIdParamSchema,
  getGroupMessagesSchema,
  searchGroupMessagesSchema,
  sendGroupMessageSchema,
  recallGroupMessagesSchema,
  editGroupMessageSchema,
  updateGroupSchema,
  inviteActionSchema,
  togglePinGroupMessageSchema,
  reactGroupMessageSchema,
  unreactGroupMessageSchema,
} = require('../../validators/group.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', listMyGroups);
router.get('/invites', listMyInvites);
router.post('/', validate(createGroupSchema), createGroup);

router.get('/:groupId/messages', validate(getGroupMessagesSchema), getGroupMessages);
router.get('/:groupId/messages/search', validate(searchGroupMessagesSchema), searchGroupMessages);
router.post('/:groupId/message', validate(sendGroupMessageSchema), sendGroupMessage);
router.put('/:groupId/message/:messageId', validate(editGroupMessageSchema), editGroupMessage);
// Reactions on group messages
router.post('/:groupId/message/:messageId/react', validate(reactGroupMessageSchema), require('../../controllers/group.controller').reactGroupMessage);
router.delete('/:groupId/message/:messageId/react', validate(unreactGroupMessageSchema), require('../../controllers/group.controller').unreactGroupMessage);
router.put('/:groupId/read', validate(groupIdParamSchema), markGroupMessagesRead);
router.post('/:groupId/message/recall', validate(recallGroupMessagesSchema), recallGroupMessages);

router.post('/:groupId/invite', validate(inviteMembersSchema), inviteMembers);
router.post('/:groupId/remove', validate(removeMembersSchema), removeMembers);
router.post('/:groupId/leave', validate(groupIdParamSchema), leaveGroup);

// Group invite actions (invitee only)
router.post('/:groupId/invites/:inviteId/accept', validate(inviteActionSchema), acceptGroupInvite);
router.post('/:groupId/invites/:inviteId/decline', validate(inviteActionSchema), declineGroupInvite);

// Update group (owner only)
router.patch('/:groupId', validate(updateGroupSchema), updateGroup);

// Delete group (owner only)
router.delete('/:groupId', validate(groupIdParamSchema), deleteGroup);

// Pin/Unpin group
router.put('/:groupId/pin', validate(groupIdParamSchema), togglePinGroup);
router.get('/:groupId/pin', validate(groupIdParamSchema), getGroupPinStatus);

// Pin/Unpin a specific group message and list pinned messages
router.put('/:groupId/message/:messageId/pin', validate(togglePinGroupMessageSchema), togglePinGroupMessage);
router.get('/:groupId/pins', validate(groupIdParamSchema), listGroupPinnedMessages);

module.exports = router;
