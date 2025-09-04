const { Note, User } = require('../models');
const { Op } = require('sequelize');
const { emitToUser } = require('../socket/socketHandler');

const createNote = async (req, res) => {
  try {
    const { title, content, imageUrl, category, priority, reminderAt } = req.body;
    const userId = req.user.id;

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

    res.status(201).json({
      message: 'Tạo ghi chú thành công',
      note: noteWithUser,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Acknowledge reminder: persist that user has clicked the bell
const acknowledgeReminder = async (req, res) => {
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

const getNotes = async (req, res) => {
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

const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const note = await Note.findOne({
      where: { id, userId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email'],
      }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    res.json({ note });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, imageUrl, category, priority, isArchived, reminderAt } = req.body;
    const userId = req.user.id;

    const note = await Note.findOne({ where: { id, userId } });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
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

    // Emit WebSocket event
    emitToUser(userId, 'note_updated', updatedNote);

    res.json({
      message: 'Cập nhật ghi chú thành công',
      note: updatedNote,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const note = await Note.findOne({ where: { id, userId } });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    await note.destroy();

    // Emit WebSocket event
    emitToUser(userId, 'note_deleted', { id: note.id });

    res.json({ message: 'Xóa ghi chú thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const archiveNote = async (req, res) => {
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

    res.json({
      message: note.isArchived ? 'Lưu trữ ghi chú thành công' : 'Bỏ lưu trữ ghi chú thành công',
      note,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getNoteStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const totalNotes = await Note.count({ where: { userId } });
    const archivedNotes = await Note.count({ where: { userId, isArchived: true } });
    const activeNotes = await Note.count({ where: { userId, isArchived: false } });

    const notesByPriority = await Note.findAll({
      where: { userId, isArchived: false },
      attributes: [
        'priority',
        [Note.sequelize.fn('COUNT', Note.sequelize.col('id')), 'count']
      ],
      group: ['priority'],
      raw: true,
    });

    const notesByCategory = await Note.findAll({
      where: { userId, isArchived: false },
      attributes: [
        'category',
        [Note.sequelize.fn('COUNT', Note.sequelize.col('id')), 'count']
      ],
      group: ['category'],
      raw: true,
    });

    res.json({
      stats: {
        total: totalNotes,
        active: activeNotes,
        archived: archivedNotes,
        byPriority: notesByPriority,
        byCategory: notesByCategory,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  archiveNote,
  getNoteStats,
  acknowledgeReminder,
};
