import express from 'express';
import authenticate from '../../middlewares/auth.js';
import validate from '../../middlewares/validate.js';
import groupController from '../../controllers/group.controller.js';
// Moderation operations (subclassed controller)
import { deleteAllGroupMessages } from '../../service/group-service/group.moderation.service.js';
import {
  createGroupSchema,
  inviteMembersSchema,
  removeMembersSchema,
  groupIdParamSchema,
  userIdParamSchema,
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
  listGroupMembersSchema,
  updateMemberRoleSchema,
} from '../../validators/group.validator.js';

const router = express.Router();

router.use(authenticate);

router.get('/', groupController.listMyGroups);
router.get('/user/:userId', validate(userIdParamSchema), groupController.listUserGroups);
router.get('/common/:userId', validate(userIdParamSchema), groupController.listCommonGroups);
router.get('/invites', groupController.listMyInvites);
router.post('/', validate(createGroupSchema), groupController.createGroup);

router.get('/:groupId/messages', validate(getGroupMessagesSchema), groupController.getGroupMessages);
router.get('/:groupId/messages/search', validate(searchGroupMessagesSchema), groupController.searchGroupMessages);
router.post('/:groupId/message', validate(sendGroupMessageSchema), groupController.sendGroupMessage);
router.put('/:groupId/message/:messageId', validate(editGroupMessageSchema), groupController.editGroupMessage);
// Reactions on group messages
router.post('/:groupId/message/:messageId/react', validate(reactGroupMessageSchema), groupController.reactGroupMessage);
router.delete('/:groupId/message/:messageId/react', validate(unreactGroupMessageSchema), groupController.unreactGroupMessage);
router.put('/:groupId/read', validate(groupIdParamSchema), groupController.markGroupMessagesRead);
router.post('/:groupId/message/recall', validate(recallGroupMessagesSchema), groupController.recallGroupMessages);

router.post('/:groupId/invite', validate(inviteMembersSchema), groupController.inviteMembers);
router.post('/:groupId/remove', validate(removeMembersSchema), groupController.removeMembers);
router.post('/:groupId/leave', validate(groupIdParamSchema), groupController.leaveGroup);

// Group invite actions (invitee only)
router.post('/:groupId/invites/:inviteId/accept', validate(inviteActionSchema), groupController.acceptGroupInvite);
router.post('/:groupId/invites/:inviteId/decline', validate(inviteActionSchema), groupController.declineGroupInvite);

// Update group (owner only)
router.patch('/:groupId', validate(updateGroupSchema), groupController.updateGroup);

// Delete group (owner only)
router.delete('/:groupId', validate(groupIdParamSchema), groupController.deleteGroup);

// Pin/Unpin group
router.put('/:groupId/pin', validate(groupIdParamSchema), groupController.togglePinGroup);
router.get('/:groupId/pin', validate(groupIdParamSchema), groupController.getGroupPinStatus);

// Pin/Unpin a specific group message and list pinned messages
router.put('/:groupId/message/:messageId/pin', validate(togglePinGroupMessageSchema), groupController.togglePinGroupMessage);
router.get('/:groupId/pins', validate(groupIdParamSchema), groupController.listGroupPinnedMessages);

// List group members
router.get('/:groupId/members', validate(listGroupMembersSchema), groupController.listGroupMembers);

// Update member role (owner only)
router.put('/:groupId/members/:memberId/role', validate(updateMemberRoleSchema), groupController.updateMemberRole);

// Delete all messages in a group (owner only)
router.delete('/:groupId/messages', validate(groupIdParamSchema), deleteAllGroupMessages);

export default router;
