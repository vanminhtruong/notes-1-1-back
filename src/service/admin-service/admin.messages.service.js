import { User, Message, Group, GroupMessage } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { deleteUploadedFile, hasUploadedFile } from '../../utils/fileHelper.js';

class AdminMessagesChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Admin: Recall a DM message for a user
  adminRecallDMMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    console.log('🔄 Backend: Admin RECALL DM message:', messageId);
    const message = await Message.findByPk(messageId);
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Xóa file đính kèm nếu message có file upload
    if (hasUploadedFile(message)) {
      console.log('[AdminRecallDM] Deleting file:', message.content);
      deleteUploadedFile(message.content);
    }

    await message.update({
      content: 'Tin nhắn đã được thu hồi bởi admin',
      messageType: 'recalled',
      isRecalled: true,
      isDeletedForAll: true
    }, { hooks: false });
    console.log('🔄 Backend: Message marked as recalled, emitting message_recalled_by_admin');

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${message.senderId}`).emit('message_recalled_by_admin', {
        messageId: message.id,
        content: message.content,
        messageType: 'recalled'
      });
      io.to(`user_${message.receiverId}`).emit('message_recalled_by_admin', {
        messageId: message.id,
        content: message.content,
        messageType: 'recalled'
      });
      console.log('🔄 Backend: Emitted message_recalled_by_admin to users', message.senderId, message.receiverId);
    }

    const io2 = req.app.get('io');
    if (io2) {
      const emitToAdmins = async (event, data) => {
        try {
          if (!global.io) return;
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of admins) {
            global.io.to(`admin_${admin.id}`).emit(event, data);
          }
        } catch (e) {
          console.error('emitToAdmins error:', e?.message || e);
        }
      };
      await emitToAdmins('admin_dm_recalled_all', { messageIds: [message.id], senderId: message.senderId, receiverId: message.receiverId });
    }

    res.json({ success: true, message: 'Message recalled successfully' });
  });

  // Admin: Delete a DM message for a user
  adminDeleteDMMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { targetUserId } = req.query;
    console.log('🗑️ Backend: Admin DELETE DM message:', messageId, 'targetUserId:', targetUserId);
    const message = await Message.findByPk(messageId);

    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const io = req.app.get('io');

    if (targetUserId) {
      const tuid = parseInt(String(targetUserId), 10);
      if (![message.senderId, message.receiverId].includes(tuid)) {
        return res.status(400).json({ success: false, message: 'targetUserId must be the sender or receiver of the message' });
      }

      const deletedForUserIds = Array.isArray(message.get('deletedForUserIds')) ? [...message.get('deletedForUserIds')] : [];
      if (!deletedForUserIds.includes(tuid)) {
        deletedForUserIds.push(tuid);
      }
      await message.update({ deletedForUserIds }, { hooks: true });
      if (io) {
        io.to(`user_${tuid}`).emit('message_deleted_by_admin', { messageId: message.id });
        console.log('🗑️ Backend: Emitted message_deleted_by_admin to user', tuid);
      }

      return res.json({ success: true, message: 'Message deleted for user successfully' });
    }

    // Xóa file đính kèm nếu delete for all và message có file upload
    if (hasUploadedFile(message)) {
      console.log('[AdminDeleteDM] Deleting file:', message.content);
      deleteUploadedFile(message.content);
    }

    await message.update({ isDeletedForAll: true }, { hooks: false });
    console.log('🗑️ Backend: Message marked as deleted for all, emitting message_deleted_by_admin');

    if (io) {
      io.to(`user_${message.senderId}`).emit('message_deleted_by_admin', { messageId: message.id });
      io.to(`user_${message.receiverId}`).emit('message_deleted_by_admin', { messageId: message.id });
      console.log('🗑️ Backend: Emitted message_deleted_by_admin to users', message.senderId, message.receiverId);
    }

    const io2 = req.app.get('io');
    if (io2) {
      const emitToAdmins = async (event, data) => {
        try {
          if (!global.io) return;
          const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of admins) {
            global.io.to(`admin_${admin.id}`).emit(event, data);
          }
        } catch (e) {
          console.error('emitToAdmins error:', e?.message || e);
        }
      };
      await emitToAdmins('admin_dm_deleted_all', { messageIds: [message.id], senderId: message.senderId, receiverId: message.receiverId });
    }

    res.json({ success: true, message: 'Message deleted for all successfully' });
  });

  // Admin: Recall a Group message for a user
  adminRecallGroupMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const message = await GroupMessage.findByPk(messageId, {
      include: [{ model: Group, as: 'group', attributes: ['id'] }]
    });
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Xóa file đính kèm nếu message có file upload
    if (hasUploadedFile(message)) {
      console.log('[AdminRecallGroup] Deleting file:', message.content);
      deleteUploadedFile(message.content);
    }

    await message.update({
      content: 'Tin nhắn đã được thu hồi bởi admin',
      messageType: 'recalled',
      isRecalled: true,
      isDeletedForAll: true
    }, { hooks: false });

    const io = req.app.get('io');
    if (io && message.group) {
      io.to(`group_${message.group.id}`).emit('group_message_recalled_by_admin', {
        messageId: message.id,
        groupId: message.group.id,
        content: message.content,
        messageType: 'recalled'
      });
    }

    res.json({ success: true, message: 'Group message recalled successfully' });
  });

  // Admin: Delete a Group message for a user
  adminDeleteGroupMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { targetUserId } = req.query;
    const message = await GroupMessage.findByPk(messageId, {
      include: [{ model: Group, as: 'group', attributes: ['id'] }]
    });
    
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const io = req.app.get('io');

    // Nếu chỉ định targetUserId, xóa phía user đó (deletedForUserIds)
    if (targetUserId) {
      const tuid = parseInt(String(targetUserId), 10);
      let deletedForUserIds = message.get('deletedForUserIds');
      if (typeof deletedForUserIds === 'string') {
        try { deletedForUserIds = JSON.parse(deletedForUserIds); } catch { deletedForUserIds = null; }
      }
      if (!Array.isArray(deletedForUserIds)) deletedForUserIds = [];
      if (!deletedForUserIds.includes(tuid)) {
        deletedForUserIds.push(tuid);
      }
      await message.update({ deletedForUserIds }, { hooks: true });

      if (io) {
        io.to(`user_${tuid}`).emit('group_message_deleted_by_admin', { messageId: message.id, groupId: message.group?.id || message.groupId });
      }

      return res.json({ success: true, message: 'Group message deleted for user successfully' });
    }

    // Xóa file đính kèm nếu delete for all và message có file upload
    if (hasUploadedFile(message)) {
      console.log('[AdminDeleteGroup] Deleting file:', message.content);
      deleteUploadedFile(message.content);
    }

    // Mặc định: xóa cho tất cả
    await message.update({ isDeletedForAll: true }, { hooks: false });

    if (io && message.group) {
      io.to(`group_${message.group.id}`).emit('group_message_deleted_by_admin', {
        messageId: message.id,
        groupId: message.group.id
      });
    }

    res.json({ success: true, message: 'Group message deleted successfully' });
  });

  // Admin: Edit a DM message content (text only)
  adminEditDMMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body || {};
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    if (message.messageType !== 'text') {
      return res.status(400).json({ success: false, message: 'Only text messages can be edited' });
    }

    await message.update({ content }, { hooks: false });

    const io = req.app.get('io');
    const payload = { messageId: message.id, content: message.content, updatedAt: message.updatedAt };
    if (io) {
      io.to(`user_${message.senderId}`).emit('message_edited_by_admin', payload);
      io.to(`user_${message.receiverId}`).emit('message_edited_by_admin', payload);
    }

    // Also notify all admins (for admin monitors if needed)
    try {
      if (global.io) {
        const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
        for (const admin of admins) {
          global.io.to(`admin_${admin.id}`).emit('admin_dm_edited', { messageId: message.id });
        }
      }
    } catch {}

    return res.json({ success: true, message: 'Message edited successfully', data: payload });
  });

  // Admin: Edit a Group message content (text only)
  adminEditGroupMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { content } = req.body || {};
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const message = await GroupMessage.findByPk(messageId, {
      include: [{ model: Group, as: 'group', attributes: ['id'] }]
    });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    if (message.messageType !== 'text') {
      return res.status(400).json({ success: false, message: 'Only text messages can be edited' });
    }

    await message.update({ content }, { hooks: false });

    const io = req.app.get('io');
    const payload = { messageId: message.id, groupId: message.group?.id || message.groupId, content: message.content, updatedAt: message.updatedAt };
    if (io && (message.group || message.groupId)) {
      const gid = message.group?.id || message.groupId;
      io.to(`group_${gid}`).emit('group_message_edited_by_admin', payload);
    }

    try {
      if (global.io) {
        const admins = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
        for (const admin of admins) {
          global.io.to(`admin_${admin.id}`).emit('admin_group_message_edited', { messageId: message.id });
        }
      }
    } catch {}

    return res.json({ success: true, message: 'Group message edited successfully', data: payload });
  });
}

export default AdminMessagesChild;
