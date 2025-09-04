const express = require('express');
const authenticate = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const {
  createGroup,
  listMyGroups,
  getGroupMessages,
  sendGroupMessage,
  inviteMembers,
  removeMembers,
  leaveGroup,
  updateGroup,
  deleteGroup,
  acceptGroupInvite,
  declineGroupInvite,
  listMyInvites,
  markGroupMessagesRead,
} = require('../../controllers/group.controller');
const {
  createGroupSchema,
  inviteMembersSchema,
  removeMembersSchema,
  groupIdParamSchema,
  getGroupMessagesSchema,
  sendGroupMessageSchema,
  updateGroupSchema,
  inviteActionSchema,
} = require('../../validators/group.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', listMyGroups);
router.get('/invites', listMyInvites);
router.post('/', validate(createGroupSchema), createGroup);

router.get('/:groupId/messages', validate(getGroupMessagesSchema), getGroupMessages);
router.post('/:groupId/message', validate(sendGroupMessageSchema), sendGroupMessage);
router.put('/:groupId/read', validate(groupIdParamSchema), markGroupMessagesRead);

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

module.exports = router;
