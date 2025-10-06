import { GroupController } from '../../controllers/group.controller.js';
import { GroupMember, GroupMessage, MessageReaction, GroupMessageRead, PinnedMessage } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { deleteMultipleFiles, hasUploadedFile } from '../../utils/fileHelper.js';

// Subclass dedicated to moderation/maintenance operations for groups
class GroupModerationController extends GroupController {
  constructor() {
    super();
  }

  // Owner-only: delete all messages in a group (hard delete) and notify members
  deleteAllGroupMessages = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;

    // Ensure requester is owner
    const owner = await GroupMember.findOne({ where: { groupId, userId } });
    if (!owner || owner.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only group owner can delete messages' });
    }

    // Collect all messages for this group (get full messages to extract file URLs)
    const messages = await GroupMessage.findAll({ 
      where: { groupId }, 
      attributes: ['id', 'content', 'messageType'] 
    });
    const messageIds = messages.map((m) => m.id);

    // Xóa các file đính kèm trong messages (image/file type)
    const filesToDelete = [];
    for (const msg of messages) {
      if (hasUploadedFile(msg)) {
        filesToDelete.push(msg.content);
      }
    }
    if (filesToDelete.length > 0) {
      console.log('[DeleteAllGroupMessages-Moderation] Deleting files:', filesToDelete);
      deleteMultipleFiles(filesToDelete);
    }

    // Cleanup related records then delete messages
    if (messageIds.length > 0) {
      try { await MessageReaction.destroy({ where: { groupMessageId: { [Op.in]: messageIds } } }); } catch {}
      try { await GroupMessageRead.destroy({ where: { messageId: { [Op.in]: messageIds } } }); } catch {}
      try { await PinnedMessage.destroy({ where: { groupMessageId: { [Op.in]: messageIds } } }); } catch {}
      await GroupMessage.destroy({ where: { id: { [Op.in]: messageIds }, groupId } });
    }

    // Notify all members
    const io = req.app.get('io') || global.io;
    if (io) {
      const members = await this.getGroupMemberIds(groupId);
      const payload = { groupId: Number(groupId), count: messageIds.length };
      for (const uid of members) {
        io.to(`user_${uid}`).emit('group_messages_deleted', payload);
      }
    }
    return res.json({ success: true, data: { groupId: Number(groupId), count: messageIds.length } });
  });
}

const moderationController = new GroupModerationController();

export { GroupModerationController };
export const deleteAllGroupMessages = moderationController.deleteAllGroupMessages;
export default moderationController;
