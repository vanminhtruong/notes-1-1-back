import { Note, User, SharedNote } from '../../models/index.js';
import { Op } from 'sequelize';
import { emitToUser, emitToAllAdmins } from '../../socket/socketHandler.js';

class NotesBasicChild {
  constructor(parent) {
    this.parent = parent;
  }

  createNote = async (req, res) => {
    try {
      const { title, content, imageUrl, category, priority, reminderAt, sharedFromUserId } = req.body;
      const userId = req.user.id;

      // If creating via canCreate permission, verify permission
      if (sharedFromUserId) {
        const permission = await SharedNote.findOne({
          where: { 
            sharedByUserId: sharedFromUserId,
            sharedWithUserId: userId,
            canCreate: true,
            isActive: true
          }
        });
        if (!permission) {
          return res.status(403).json({ message: 'Bạn không có quyền tạo ghi chú' });
        }
      }

      const note = await Note.create({
        title,
        content,
        imageUrl: imageUrl || null,
        category,
        priority,
        reminderAt: reminderAt ? new Date(reminderAt) : null,
        reminderSent: false,
        userId,
      });

      const noteWithUser = await Note.findByPk(note.id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        }],
      });

      // Emit WebSocket event
      emitToUser(userId, 'note_created', noteWithUser);
      
      // Emit to all admins for real-time admin panel updates
      emitToAllAdmins('user_note_created', noteWithUser);

      res.status(201).json({
        message: 'Tạo ghi chú thành công',
        note: noteWithUser,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  acknowledgeReminder = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const note = await Note.findOne({ where: { id, userId } });
      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      await note.update({ reminderAcknowledged: true, reminderSent: true });

      // Optionally emit event so other clients update UI
      emitToUser(userId, 'note_acknowledged', { id: note.id });

      res.json({ message: 'Đã xác nhận nhắc nhở', note });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  getNotes = async (req, res) => {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 10, 
        category, 
        priority, 
        search, 
        isArchived = false,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      // Coerce query params to proper types
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const archivedBool = typeof isArchived === 'string' ? isArchived.toLowerCase() === 'true' : !!isArchived;

      const offset = (pageNum - 1) * limitNum;
      const whereClause = { userId, isArchived: archivedBool };

      // Add filters
      if (category) {
        whereClause.category = category;
      }
      if (priority) {
        whereClause.priority = priority;
      }
      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.like]: `%${search}%` } },
          { content: { [Op.like]: `%${search}%` } },
        ];
      }

      const { count, rows: notes } = await Note.findAndCountAll({
        where: whereClause,
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        }],
        order: [[sortBy, sortOrder]],
        limit: limitNum,
        offset: offset,
      });

      res.json({
        notes,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  getNoteById = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Load note by id first
      const note = await Note.findByPk(id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        }],
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      // Permission: owner OR shared recipient (read-only is fine)
      if (note.userId !== userId) {
        const shared = await SharedNote.findOne({
          where: { noteId: id, sharedWithUserId: userId, isActive: true },
          attributes: ['id']
        });
        if (!shared) {
          return res.status(403).json({ message: 'Bạn không có quyền xem ghi chú này' });
        }
      }

      res.json({ note });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  updateNote = async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, imageUrl, category, priority, isArchived, reminderAt } = req.body;
      const userId = req.user.id;

      // Load note by id first
      const note = await Note.findByPk(id);

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      // Permission: owner OR shared recipient with canEdit
      let canEditByUser = false;
      if (note.userId === userId) {
        canEditByUser = true;
      } else {
        const sharedPerm = await SharedNote.findOne({
          where: { noteId: id, sharedWithUserId: userId, isActive: true, canEdit: true },
          attributes: ['id']
        });
        canEditByUser = !!sharedPerm;
      }

      if (!canEditByUser) {
        return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa ghi chú này' });
      }

      // Determine if reminderAt changed; normalize to Date or null
      let nextReminderAt = (reminderAt === undefined)
        ? note.reminderAt
        : (reminderAt ? new Date(reminderAt) : null);
      const reminderChanged = reminderAt !== undefined && (
        // one is null and the other not
        (nextReminderAt === null && note.reminderAt !== null) ||
        (nextReminderAt !== null && note.reminderAt === null) ||
        // both not null but timestamp differs
        (nextReminderAt !== null && note.reminderAt !== null && nextReminderAt.getTime() !== new Date(note.reminderAt).getTime())
      );

      await note.update({
        title: title !== undefined ? title : note.title,
        content: content !== undefined ? content : note.content,
        imageUrl: imageUrl !== undefined ? (imageUrl || null) : note.imageUrl,
        category: category !== undefined ? category : note.category,
        priority: priority !== undefined ? priority : note.priority,
        isArchived: isArchived !== undefined ? isArchived : note.isArchived,
        reminderAt: nextReminderAt,
        // Reset reminderSent if reminderAt changed; otherwise keep as is
        reminderSent: reminderChanged ? false : note.reminderSent,
        // If rescheduled, user hasn't acknowledged the new schedule yet
        reminderAcknowledged: reminderChanged ? false : note.reminderAcknowledged,
      });

      const updatedNote = await Note.findByPk(note.id, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        }],
      });

      // Emit WebSocket event to owner
      emitToUser(note.userId, 'note_updated', updatedNote);
      
      // Emit to all shared note receivers
      try {
        // Emit to shared users about the update
        const shares = await SharedNote.findAll({
          where: { noteId: note.id, isActive: true },
          attributes: ['sharedWithUserId', 'sharedByUserId']
        });
        for (const share of shares) {
          emitToUser(share.sharedWithUserId, 'note_updated', updatedNote);
          // If current user is not the owner, also emit to owner (sharedByUserId)
          if (userId !== note.userId) {
            emitToUser(share.sharedByUserId, 'note_updated', updatedNote);
          }
        }
      } catch (e) {
        console.error('Error emitting note_updated to shared users:', e);
      }
      
      // Emit to all admins for real-time admin panel updates
      emitToAllAdmins('user_note_updated', updatedNote);

      res.json({
        message: 'Cập nhật ghi chú thành công',
        note: updatedNote,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  deleteNote = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const note = await Note.findOne({ where: { id, userId } });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      // Before deleting note, collect all shares to notify receivers and remove share rows
      const shares = await SharedNote.findAll({ where: { noteId: id } });
      // Emit to each receiver to remove the shared message in realtime and cleanup share rows
      for (const share of shares) {
        try {
          // Emit to receiver and to owner as well for multi-device sync
          const payload = { id: share.id, noteId: id, messageId: share.messageId };
          emitToUser(share.sharedWithUserId, 'shared_note_removed', payload);
          // Emit to owner too so their own message disappears realtime
          emitToUser(userId, 'shared_note_removed', payload);
        } catch (e) {
          // ignore
        }
      }
      // Hard delete share records
      await SharedNote.destroy({ where: { noteId: id } });

      await note.destroy();

      // Emit WebSocket event to owner's devices
      emitToUser(userId, 'note_deleted', { id: Number(id) });
      
      // Emit to all admins for real-time admin panel updates
      emitToAllAdmins('user_note_deleted', { id: note.id, userId });

      res.json({ message: 'Xóa ghi chú thành công' });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };

  archiveNote = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const note = await Note.findOne({ where: { id, userId } });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      await note.update({ isArchived: !note.isArchived });

      // Emit WebSocket event
      emitToUser(userId, 'note_archived', {
        id: note.id,
        isArchived: note.isArchived,
      });
      
      // Emit to all admins for real-time admin panel updates
      emitToAllAdmins('user_note_archived', {
        id: note.id,
        isArchived: note.isArchived,
        userId
      });

      res.json({
        message: note.isArchived ? 'Lưu trữ ghi chú thành công' : 'Bỏ lưu trữ ghi chú thành công',
        note,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
}

export default NotesBasicChild;
