const { Note, User, SharedNote, GroupSharedNote, Group } = require('../models');
const { Op } = require('sequelize');
const { emitToUser, emitToAllAdmins } = require('../socket/socketHandler');

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
    
    // Emit to all admins for real-time admin panel updates
    emitToAllAdmins('user_note_deleted', { id: note.id, userId });

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

// Share a note with another user
const shareNote = async (req, res) => {
  try {
    const { id } = req.params; // note id
    const { userId: sharedWithUserId, canEdit = false, canDelete = false, message, messageId } = req.body;
    const sharedByUserId = req.user.id;

    // Check if note exists and belongs to the user
    const note = await Note.findOne({ 
      where: { id, userId: sharedByUserId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú hoặc bạn không có quyền chia sẻ ghi chú này' });
    }

    // Check if target user exists
    const targetUser = await User.findByPk(sharedWithUserId, {
      attributes: ['id', 'name', 'email']
    });

    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng muốn chia sẻ' });
    }

    // Check if already shared
    const existingShare = await SharedNote.findOne({
      where: { noteId: id, sharedWithUserId, sharedByUserId }
    });

    if (existingShare) {
      return res.status(400).json({ message: 'Ghi chú đã được chia sẻ với người dùng này' });
    }

    // Create shared note
    const sharedNote = await SharedNote.create({
      noteId: id,
      sharedWithUserId,
      sharedByUserId,
      canEdit,
      canDelete,
      message,
      messageId, // Store the message ID for deletion tracking
      isActive: true
    });

    // Get complete shared note data for response
    const completeSharedNote = await SharedNote.findByPk(sharedNote.id, {
      include: [
        { 
          model: Note, 
          as: 'note',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
        },
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Emit real-time events
    emitToUser(sharedWithUserId, 'note_shared_with_me', completeSharedNote);
    emitToUser(sharedByUserId, 'note_shared_by_me', completeSharedNote);
    emitToAllAdmins('user_shared_note_created', completeSharedNote);

    res.status(201).json({
      message: 'Chia sẻ ghi chú thành công',
      sharedNote: completeSharedNote
    });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(400).json({ message: error.message });
  }
};

// Get notes shared with me
const getSharedWithMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      search,
      sortBy = 'sharedAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = { sharedWithUserId: userId, isActive: true };

    // Search in note title or content
    let noteWhere = {};
    if (search) {
      noteWhere = {
        [Op.or]: [
          { title: { [Op.like]: `%${search}%` } },
          { content: { [Op.like]: `%${search}%` } },
        ]
      };
    }

    const { count, rows: sharedNotes } = await SharedNote.findAndCountAll({
      where: whereClause,
      include: [
        { 
          model: Note, 
          as: 'note', 
          where: search ? noteWhere : undefined,
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
        },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
      ],
      order: [[sortBy, sortOrder]],
      limit: limitNum,
      offset,
    });

    res.json({
      sharedNotes,
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

// Get notes I shared with others
const getSharedByMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      search,
      sortBy = 'sharedAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = { sharedByUserId: userId, isActive: true };

    // Search in note title or content
    let noteWhere = {};
    if (search) {
      noteWhere = {
        [Op.or]: [
          { title: { [Op.like]: `%${search}%` } },
          { content: { [Op.like]: `%${search}%` } },
        ]
      };
    }

    const { count, rows: sharedNotes } = await SharedNote.findAndCountAll({
      where: whereClause,
      include: [
        { 
          model: Note, 
          as: 'note', 
          where: search ? noteWhere : undefined,
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
        },
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email'] }
      ],
      order: [[sortBy, sortOrder]],
      limit: limitNum,
      offset,
    });

    res.json({
      sharedNotes,
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

// Remove shared note (only by sharer or receiver)
const removeSharedNote = async (req, res) => {
  try {
    const { id } = req.params; // shared note id
    const userId = req.user.id;

    const sharedNote = await SharedNote.findByPk(id, {
      include: [
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!sharedNote) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ' });
    }

    // Only sharer or receiver can remove
    if (sharedNote.sharedByUserId !== userId && sharedNote.sharedWithUserId !== userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa chia sẻ này' });
    }

    await sharedNote.destroy();

    // Emit real-time events
    if (sharedNote.sharedByUserId !== userId) {
      emitToUser(sharedNote.sharedByUserId, 'shared_note_removed', { id: sharedNote.id });
    }
    if (sharedNote.sharedWithUserId !== userId) {
      emitToUser(sharedNote.sharedWithUserId, 'shared_note_removed', { id: sharedNote.id });
    }
    emitToAllAdmins('user_shared_note_deleted', { 
      id: sharedNote.id, 
      sharedWithUserId: sharedNote.sharedWithUserId,
      sharedByUserId: sharedNote.sharedByUserId 
    });

    res.json({ message: 'Xóa chia sẻ ghi chú thành công' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get list of users for sharing (simple implementation)
const getUsers = async (req, res) => {
  try {
    const { limit = 50, search } = req.query;
    const currentUserId = req.user.id;
    
    console.log('🔍 Getting users for sharing. Current user ID:', currentUserId);
    
    let whereClause = { 
      id: { [Op.ne]: currentUserId }, // Exclude current user
      isActive: true,
      role: 'user' // Only include regular users, not admins
    };
    
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    console.log('🔍 Where clause:', whereClause);

    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'name', 'email', 'avatar'],
      limit: parseInt(limit),
      order: [['name', 'ASC']]
    });

    console.log('🔍 Found users:', users.length, users.map(u => ({ id: u.id, name: u.name })));

    res.json({ users });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(400).json({ message: error.message });
  }
};

// Share a note with a group
const shareNoteToGroup = async (req, res) => {
  try {
    const { id } = req.params; // note id
    const { groupId, message, groupMessageId } = req.body;
    const sharedByUserId = req.user.id;

    // Check if note exists and belongs to the user
    const note = await Note.findOne({ 
      where: { id, userId: sharedByUserId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú hoặc bạn không có quyền chia sẻ ghi chú này' });
    }

    // Check if target group exists and user is a member
    const group = await Group.findByPk(groupId, {
      attributes: ['id', 'name', 'avatar'],
      include: [{
        model: require('../models').GroupMember,
        as: 'members',
        where: { userId: sharedByUserId },
        required: true,
        attributes: []
      }]
    });

    if (!group) {
      return res.status(404).json({ message: 'Không tìm thấy nhóm hoặc bạn không phải thành viên của nhóm này' });
    }

    // Check if already shared to this group
    const existingShare = await GroupSharedNote.findOne({
      where: { noteId: id, groupId, sharedByUserId }
    });

    if (existingShare) {
      return res.status(400).json({ message: 'Ghi chú đã được chia sẻ trong nhóm này' });
    }

    // Create group shared note
    const groupSharedNote = await GroupSharedNote.create({
      noteId: id,
      groupId,
      sharedByUserId,
      message,
      groupMessageId, // Store the group message ID for deletion tracking
      isActive: true
    });

    // Get complete group shared note data for response
    const completeGroupSharedNote = await GroupSharedNote.findByPk(groupSharedNote.id, {
      include: [
        { 
          model: Note, 
          as: 'note',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
        },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
      ]
    });

    // Emit real-time events
    emitToAllAdmins('user_group_shared_note_created', completeGroupSharedNote);

    res.status(201).json({
      message: 'Chia sẻ ghi chú vào nhóm thành công',
      groupSharedNote: completeGroupSharedNote
    });
  } catch (error) {
    console.error('Error sharing note to group:', error);
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
  shareNote,
  getSharedWithMe,
  getSharedByMe,
  removeSharedNote,
  getUsers,
  shareNoteToGroup,
};
