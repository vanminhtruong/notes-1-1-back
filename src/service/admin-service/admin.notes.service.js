import { User, Note, Message, Group, GroupMember, GroupMessage, Notification, SharedNote, GroupSharedNote, NoteFolder, NoteCategory } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { emitToAllAdmins, emitToUser } from '../../socket/socketHandler.js';
import { deleteMultipleFiles, deleteOldFileOnUpdate, isUploadedFile } from '../../utils/fileHelper.js';

// Child controller to manage admin notifications and notes endpoints
// Attached to AdminController instance in its constructor to keep API unchanged
class AdminNotesChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Admin: Get notifications of a specific user
  adminGetUserNotifications = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { limit = 50, unreadOnly, collapse } = req.query || {};
    const uid = Number(userId);

    if (!Number.isFinite(uid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Loại bỏ các bản ghi nội bộ dùng để lưu trạng thái ẩn/không hiển thị ở bell feed (bell_dismiss)
    // Những bản ghi này không phải là thông báo hiển thị cho admin
    const where = { userId: uid, type: { [Op.ne]: 'bell_dismiss' } };
    if (String(unreadOnly) === 'true') where.isRead = false;

    const rows = await Notification.findAll({
      where,
      include: [
        { model: User, as: 'fromUser', attributes: ['id', 'name', 'avatar'] },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
      ],
      order: [['updatedAt', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit, 10),
    });

    // Apply user's bell dismiss preferences to hide items they chose to dismiss
    try {
      const dismissRows = await Notification.findAll({
        where: { userId: uid, type: 'bell_dismiss' },
        order: [['createdAt', 'DESC']],
        limit: 1000,
      });
      const dismissed = {
        fr: null,
        inv: null,
        dm: new Map(),
        group: new Map(),
      };
      for (const r of dismissRows) {
        const m = r.metadata || {};
        const at = new Date(String(r.createdAt));
        if (m.scope === 'fr') {
          if (!dismissed.fr || at > dismissed.fr) dismissed.fr = at;
        } else if (m.scope === 'inv') {
          if (!dismissed.inv || at > dismissed.inv) dismissed.inv = at;
        } else if (m.scope === 'dm' && typeof m.otherUserId === 'number') {
          const prev = dismissed.dm.get(m.otherUserId);
          if (!prev || at > prev) dismissed.dm.set(m.otherUserId, at);
        } else if (m.scope === 'group' && typeof m.groupId === 'number') {
          const prev = dismissed.group.get(m.groupId);
          if (!prev || at > prev) dismissed.group.set(m.groupId, at);
        }
      }

      // Filter rows based on dismiss map
      const filtered = [];
      for (const n of rows) {
        const ts = new Date(String(n.updatedAt || n.createdAt));
        if (n.type === 'friend_request') {
          if (dismissed.fr && ts <= dismissed.fr) continue;
        } else if (n.type === 'group_invite') {
          if (dismissed.inv && ts <= dismissed.inv) continue;
        } else if (n.type === 'message') {
          const otherId = (n.metadata && typeof n.metadata.otherUserId === 'number') ? n.metadata.otherUserId : (typeof n.fromUserId === 'number' ? n.fromUserId : null);
          if (otherId !== null) {
            const dAt = dismissed.dm.get(otherId);
            if (dAt && ts <= dAt) continue;
          }
        }
        filtered.push(n);
      }
      rows.splice(0, rows.length, ...filtered);
    } catch (e) {}

    // Enrich preview for message notifications (batch fetch by messageId)
    try {
      const msgIds = rows
        .filter((n) => n && n.type === 'message' && n.metadata && Number.isFinite(Number(n.metadata.messageId)))
        .map((n) => Number(n.metadata.messageId));
      if (Array.isArray(msgIds) && msgIds.length > 0) {
        const uniq = Array.from(new Set(msgIds));
        const msgs = await Message.findAll({ where: { id: { [Op.in]: uniq } }, attributes: ['id', 'content', 'messageType'] });
        const map = new Map(msgs.map((m) => [Number(m.id), { content: m.content, messageType: m.messageType }]));
        for (const n of rows) {
          if (n && n.type === 'message' && n.metadata && Number.isFinite(Number(n.metadata.messageId))) {
            const m = map.get(Number(n.metadata.messageId));
            if (m) {
              const content = typeof m.content === 'string' ? m.content : '';
              const preview = content.length > 120 ? content.slice(0, 117) + '...' : content;
              n.metadata = { ...(n.metadata || {}), preview, messageType: m.messageType };
            }
          }
        }
      }
    } catch (e) {}

    // Ensure avatar urls are absolute for admin FE
    const baseUrl = (req && req.protocol && req.get) ? `${req.protocol}://${req.get('host')}` : '';
    const absolutizeAvatar = (obj) => {
      try {
        if (!obj || !obj.avatar) return obj;
        const av = String(obj.avatar);
        const lower = av.toLowerCase();
        if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) return obj;
        const needsSlash = !av.startsWith('/');
        obj.avatar = `${baseUrl}${needsSlash ? '/' : ''}${av}`;
      } catch {}
      return obj;
    };

    if (String(collapse) === 'message_by_other') {
      const byOther = new Map();
      const others = [];
      for (const n of rows) {
        if (n.type !== 'message') continue;
        const meta = n.metadata || {};
        const otherId = (typeof meta.otherUserId === 'number' ? meta.otherUserId : n.fromUserId);
        if (typeof otherId !== 'number') continue;
        const ts = new Date(String(n.updatedAt || n.createdAt)).getTime();
        const prev = byOther.get(otherId);
        if (!prev || ts > prev._ts) {
          const plain = n.toJSON();
          plain._ts = ts;
          byOther.set(otherId, plain);
        }
      }
      for (const v of byOther.values()) others.push(v);
      const nonMsg = rows.filter((n) => n.type !== 'message').map((m) => m.toJSON());
      const combined = [...others, ...nonMsg]
        .map((n) => {
          if (n && n.fromUser) n.fromUser = absolutizeAvatar(n.fromUser);
          if (n && n.group) n.group = absolutizeAvatar(n.group);
          return n;
        })
        .sort((a, b) => new Date(String(b.updatedAt || b.createdAt)).getTime() - new Date(String(a.updatedAt || a.createdAt)).getTime());
      return res.json({ success: true, data: combined });
    }

    const data = rows
      .map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r))
      .map((n) => {
        if (n && n.fromUser) n.fromUser = absolutizeAvatar(n.fromUser);
        if (n && n.group) n.group = absolutizeAvatar(n.group);
        return n;
      })
      .sort((a, b) => new Date(String(b.updatedAt || b.createdAt)).getTime() - new Date(String(a.updatedAt || a.createdAt)).getTime());

    return res.json({ success: true, data });
  });

  // Admin: Delete a specific notification of a user (must be outside of adminGetUserNotifications)
  adminDeleteUserNotification = asyncHandler(async (req, res) => {
    const { userId, notificationId } = req.params;
    const uid = Number(userId);
    const nid = Number(notificationId);
    if (!Number.isFinite(uid) || !Number.isFinite(nid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId or notificationId' });
    }

    const notif = await Notification.findOne({ where: { id: nid, userId: uid } });
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notif.destroy();

    try {
      emitToUser(uid, 'notification_deleted_by_admin', { id: nid });
      emitToAllAdmins('admin_notification_deleted', { userId: uid, notificationId: nid });
    } catch {}

    return res.json({ success: true, message: 'Notification deleted successfully' });
  });

  // Admin: Delete ALL notifications of a user (excluding internal bell_dismiss records)
  adminDeleteAllUserNotifications = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const uid = Number(userId);
    if (!Number.isFinite(uid)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Do not delete internal bell_dismiss rows
    const { Op } = require('sequelize');
    const where = { userId: uid, type: { [Op.ne]: 'bell_dismiss' } };
    const deleted = await Notification.destroy({ where });

    try {
      // Notify the affected user and all admins to refresh in realtime
      emitToUser(uid, 'notifications_cleared_by_admin', { userId: uid, deleted });
      emitToAllAdmins('admin_notifications_cleared', { userId: uid, deleted });
    } catch {}

    return res.json({ success: true, message: 'All notifications cleared', data: { deleted } });
  });

  // Get all users notes for admin
  getAllUsersNotes = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, userId, category, priority, search, isArchived, folderId, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};
    // Only apply archived filter when query param is explicitly provided
    if (typeof isArchived !== 'undefined' && String(isArchived).trim() !== '') {
      const archivedBool = String(isArchived).toLowerCase() === 'true';
      whereClause.isArchived = archivedBool;
    }

    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const uid = parseInt(String(userId), 10);
      if (!Number.isNaN(uid)) {
        whereClause.userId = uid;
      }
    }
    
    // Filter by folderId - Default to null (only show notes NOT in any folder)
    if (folderId !== undefined && String(folderId).trim() !== '') {
      if (String(folderId).toLowerCase() === 'null' || String(folderId) === '') {
        whereClause.folderId = null;
      } else {
        const fid = parseInt(String(folderId), 10);
        if (!Number.isNaN(fid)) {
          whereClause.folderId = fid;
        }
      }
    } else {
      // Default: only show notes not in any folder (like user app behavior)
      whereClause.folderId = null;
    }
    
    if (priority) whereClause.priority = priority;
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } },
      ];
    }

    // Include NoteCategory với điều kiện filter theo tên nếu có
    const categoryInclude = {
      model: NoteCategory,
      as: 'category',
      attributes: ['id', 'name', 'color', 'icon'],
      required: false
    };

    if (category) {
      categoryInclude.where = {
        name: { [Op.like]: `%${category}%` }
      };
      categoryInclude.required = true; // Chỉ lấy notes có category match
    }

    const { count, rows: notes } = await Note.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
        categoryInclude
      ],
      order: [
        ['isPinned', 'DESC'], // Ghim notes lên đầu
        [sortBy, sortOrder]    // Sau đó sắp xếp theo tiêu chí đã chọn
      ],
      limit: limitNum,
      offset,
    });

    // Count total folders and notes in folders for dashboard stats
    const totalFolders = await NoteFolder.count();
    const notesInFolders = await Note.count({ where: { folderId: { [Op.ne]: null } } });

    res.json({
      notes,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
      stats: {
        totalFolders,
        notesInFolders,
      },
    });
  });

  // Create note for user (admin)
  createNoteForUser = asyncHandler(async (req, res) => {
    const { userId, title, content, imageUrl, videoUrl, youtubeUrl, category, categoryId, priority, reminderAt, folderId } = req.body;

    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    } 

    const note = await Note.create({
      title,
      content,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      youtubeUrl: youtubeUrl || null,
      category,
      categoryId: categoryId || null,
      priority,
      reminderAt: reminderAt ? new Date(reminderAt) : null,
      reminderSent: false,
      folderId: folderId || null,
      userId,
    });

    // Tăng selectionCount nếu có categoryId
    if (categoryId) {
      await NoteCategory.increment('selectionCount', {
        where: { id: categoryId, userId }
      });
      
      // Cập nhật maxSelectionCount nếu selectionCount hiện tại lớn hơn
      const category = await NoteCategory.findByPk(categoryId);
      if (category && category.selectionCount > category.maxSelectionCount) {
        await category.update({ maxSelectionCount: category.selectionCount });
      }
      
      // Emit event để Frontend fetch lại danh sách categories
      emitToUser(userId, 'categories_reorder_needed', { action: 'create' });
    }

    const noteWithUser = await Note.findByPk(note.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'], required: false }
      ],
    });

    emitToUser(userId, 'admin_note_created', noteWithUser);
    emitToAllAdmins('note_created_by_admin', noteWithUser);

    res.status(201).json({
      message: 'Tạo ghi chú cho người dùng thành công',
      note: noteWithUser,
    });
  });

  // Update user's note (admin)
  updateUserNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, content, imageUrl, videoUrl, youtubeUrl, category, categoryId, priority, isArchived, reminderAt, folderId } = req.body;

    const note = await Note.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    // Lưu giá trị cũ TRƯỚC khi update
    const oldImageUrl = note.imageUrl;
    const oldVideoUrl = note.videoUrl;
    const oldCategoryId = note.categoryId;
    const newCategoryId = categoryId !== undefined ? categoryId : note.categoryId;
    let shouldDeleteOldImage = false;
    let shouldDeleteOldVideo = false;

    let nextReminderAt = (reminderAt === undefined)
      ? note.reminderAt
      : (reminderAt ? new Date(reminderAt) : null);
    const reminderChanged = reminderAt !== undefined && (
      (nextReminderAt === null && note.reminderAt !== null) ||
      (nextReminderAt !== null && note.reminderAt === null) ||
      (nextReminderAt !== null && note.reminderAt !== null && nextReminderAt.getTime() !== new Date(note.reminderAt).getTime())
    );

    const newImageUrl = imageUrl !== undefined ? (imageUrl || null) : note.imageUrl;
    const newVideoUrl = videoUrl !== undefined ? (videoUrl || null) : note.videoUrl;
    
    // Check xem có cần xóa file cũ không
    if (imageUrl !== undefined && newImageUrl !== oldImageUrl && oldImageUrl && isUploadedFile(oldImageUrl)) {
      shouldDeleteOldImage = true;
    }
    if (videoUrl !== undefined && newVideoUrl !== oldVideoUrl && oldVideoUrl && isUploadedFile(oldVideoUrl)) {
      shouldDeleteOldVideo = true;
    }

    await note.update({
      title: title !== undefined ? title : note.title,
      content: content !== undefined ? content : note.content,
      imageUrl: imageUrl !== undefined ? imageUrl : note.imageUrl,
      videoUrl: videoUrl !== undefined ? videoUrl : note.videoUrl,
      youtubeUrl: youtubeUrl !== undefined ? youtubeUrl : note.youtubeUrl,
      category: category !== undefined ? category : note.category,
      categoryId: categoryId !== undefined ? categoryId : note.categoryId,
      priority: priority !== undefined ? priority : note.priority,
      isArchived: isArchived !== undefined ? isArchived : note.isArchived,
      reminderAt: reminderAt !== undefined ? (reminderAt ? new Date(reminderAt) : null) : note.reminderAt,
      folderId: folderId !== undefined ? folderId : note.folderId,
      reminderSent: reminderChanged ? false : note.reminderSent,
      reminderAcknowledged: reminderChanged ? false : note.reminderAcknowledged,
    });

    // Xóa file cũ SAU khi update thành công
    if (shouldDeleteOldImage) {
      deleteOldFileOnUpdate(oldImageUrl, newImageUrl);
    }
    if (shouldDeleteOldVideo) {
      deleteOldFileOnUpdate(oldVideoUrl, newVideoUrl);
    }

    // Cập nhật selectionCount nếu categoryId thay đổi
    if (categoryId !== undefined && oldCategoryId !== newCategoryId) {
      // KHÔNG giảm count của category cũ - logic "once hot, always hot"
      
      // Chỉ tăng count của category mới
      if (newCategoryId) {
        await NoteCategory.increment('selectionCount', {
          where: { id: newCategoryId, userId: note.userId }
        });
        
        // Cập nhật maxSelectionCount nếu selectionCount hiện tại lớn hơn
        const category = await NoteCategory.findByPk(newCategoryId);
        if (category && category.selectionCount > category.maxSelectionCount) {
          await category.update({ maxSelectionCount: category.selectionCount });
        }
      }
      
      // Emit event để Frontend fetch lại danh sách categories
      emitToUser(note.userId, 'categories_reorder_needed', { action: 'update' });
    }

    const updatedNote = await Note.findByPk(note.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'], required: false }
      ],
    });

    emitToUser(note.user.id, 'admin_note_updated', updatedNote);
    emitToAllAdmins('note_updated_by_admin', updatedNote);

    res.json({
      message: 'Cập nhật ghi chú thành công',
      note: updatedNote,
    });
  });

  // Delete user's note (admin)
  deleteUserNote = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const note = await Note.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    const userId = note.user.id;
    
    // Xóa các file liên quan đến note
    const filesToDelete = [];
    if (note.imageUrl) filesToDelete.push(note.imageUrl);
    if (note.videoUrl) filesToDelete.push(note.videoUrl);
    if (filesToDelete.length > 0) {
      deleteMultipleFiles(filesToDelete);
    }
    
    await note.destroy();

    // KHÔNG giảm selectionCount khi xóa note
    // Logic "once hot, always hot" - category đã hot phải giữ nguyên vị trí

    emitToUser(userId, 'admin_note_deleted', { id: note.id });
    emitToAllAdmins('note_deleted_by_admin', { id: note.id, userId });

    res.json({ message: 'Xóa ghi chú thành công' });
  });

  // Move note to folder (admin)
  moveNoteToFolder = asyncHandler(async (req, res) => {
    const { noteId } = req.params;
    const { folderId } = req.body;

    const note = await Note.findByPk(noteId, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    const userId = note.user.id;

    // Verify folder belongs to user if folderId is provided
    if (folderId) {
      const folder = await NoteFolder.findOne({
        where: { id: folderId, userId }
      });
      if (!folder) {
        return res.status(404).json({ message: 'Không tìm thấy thư mục' });
      }
    }

    await note.update({ folderId: folderId || null });

    const noteWithUser = await Note.findByPk(note.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
      }],
    });

    // Emit socket events for real-time update
    emitToUser(userId, 'note_moved_to_folder', noteWithUser.toJSON());
    emitToAllAdmins('admin_note_moved_to_folder', { noteId: note.id, folderId, userId });

    res.json({
      message: folderId ? 'Chuyển ghi chú vào thư mục thành công' : 'Xóa ghi chú khỏi thư mục thành công',
      note: noteWithUser.toJSON()
    });
  });

  // Get all shared notes for admin (both individual and group shares)
  getAllSharedNotes = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, userId, search, sharedByUserId, sortBy = 'sharedAt', sortOrder = 'DESC' } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

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

    // Build where clauses for individual shares
    const individualWhereClause = { isActive: true };
    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const uid = parseInt(String(userId), 10);
      if (!Number.isNaN(uid)) {
        individualWhereClause.sharedWithUserId = uid;
      }
    }
    if (sharedByUserId !== undefined && sharedByUserId !== null && String(sharedByUserId).trim() !== '') {
      const sbid = parseInt(String(sharedByUserId), 10);
      if (!Number.isNaN(sbid)) {
        individualWhereClause.sharedByUserId = sbid;
      }
    }

    // Build where clauses for group shares
    const groupWhereClause = { isActive: true };
    if (sharedByUserId !== undefined && sharedByUserId !== null && String(sharedByUserId).trim() !== '') {
      const sbid = parseInt(String(sharedByUserId), 10);
      if (!Number.isNaN(sbid)) {
        groupWhereClause.sharedByUserId = sbid;
      }
    }

    // Get individual shares
    const individualShares = await SharedNote.findAll({
      where: individualWhereClause,
      include: [
        { 
          model: Note, 
          as: 'note', 
          where: search ? noteWhere : undefined,
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
        },
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
    });

    // Get group shares
    const groupShares = await GroupSharedNote.findAll({
      where: groupWhereClause,
      include: [
        { 
          model: Note, 
          as: 'note', 
          where: search ? noteWhere : undefined,
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
        },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
    });

    // Combine and format results
    const combinedShares = [
      ...individualShares.map(share => ({
        ...share.toJSON(),
        shareType: 'individual',
      })),
      ...groupShares.map(share => ({
        ...share.toJSON(),
        shareType: 'group',
      }))
    ];

    // Sort combined results
    combinedShares.sort((a, b) => {
      const aDate = new Date(a.sharedAt);
      const bDate = new Date(b.sharedAt);
      return sortOrder === 'DESC' ? bDate - aDate : aDate - bDate;
    });

    // Apply pagination to combined results
    const total = combinedShares.length;
    const paginatedShares = combinedShares.slice(offset, offset + limitNum);

    res.json({
      sharedNotes: paginatedShares,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  });

  // Get shared note detail by ID for admin
  getSharedNoteDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const sharedNote = await SharedNote.findByPk(id, {
      include: [
        { 
          model: Note, 
          as: 'note',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
        },
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
    });

    if (!sharedNote) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ' });
    }

    res.json({ sharedNote });
  });

  // Delete shared note (admin) - now supports both individual and group shares
  deleteSharedNote = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Try to find individual shared note first
    let sharedNote = await SharedNote.findByPk(id, {
      include: [
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
      ],
    });

    let isGroupShare = false;
    let groupSharedNote = null;

    // If not found, try group shared note
    if (!sharedNote) {
      groupSharedNote = await GroupSharedNote.findByPk(id, {
        include: [
          { model: Group, as: 'group', attributes: ['id', 'name'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email'] }
        ],
      });
      
      if (!groupSharedNote) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ' });
      }
      
      isGroupShare = true;
    }

    const targetNote = isGroupShare ? groupSharedNote : sharedNote;

    try {
      if (isGroupShare) {
        // Handle group share deletion
        const groupId = groupSharedNote.group.id;
        const sharedByUserId = groupSharedNote.sharedByUser.id;
        
        // Delete associated group message if exists
        if (groupSharedNote.groupMessageId) {
          const groupMessage = await GroupMessage.findByPk(groupSharedNote.groupMessageId);
          if (groupMessage) {
            console.log(`🗑️ Deleting group message ${groupSharedNote.groupMessageId} for group ${groupId}`);
            await groupMessage.destroy();
            
            // Emit to group members about message deletion
            if (global.io) {
              console.log(`📡 Emitting admin_group_message_deleted to group_${groupId}`);
              global.io.to(`group_${groupId}`).emit('admin_group_message_deleted', {
                messageId: groupSharedNote.groupMessageId,
                groupId,
                deletedBy: 'admin'
              });
              
              // Also emit to all users in case they're not in the socket room
              const groupMembers = await GroupMember.findAll({
                where: { groupId },
                attributes: ['userId']
              });
              
              for (const member of groupMembers) {
                emitToUser(member.userId, 'admin_group_message_deleted', {
                  messageId: groupSharedNote.groupMessageId,
                  groupId,
                  deletedBy: 'admin'
                });
              }
            }
          } else {
            console.log(`⚠️ Group message ${groupSharedNote.groupMessageId} not found`);
          }
        } else {
          console.log(`⚠️ No groupMessageId found for GroupSharedNote ${groupSharedNote.id}`);
        }
        
        await groupSharedNote.destroy();

        // Notify group members and admin
        if (global.io) {
          global.io.to(`group_${groupId}`).emit('group_shared_note_deleted_by_admin', { 
            id: groupSharedNote.id,
            groupId 
          });
        }
        emitToUser(sharedByUserId, 'shared_note_deleted_by_admin', { id: groupSharedNote.id, isGroupShare: true });
        emitToAllAdmins('admin_shared_note_deleted', { 
          id: groupSharedNote.id, 
          groupId,
          sharedByUserId,
          isGroupShare: true 
        });

      } else {
        // Handle individual share deletion
        const sharedWithUserId = sharedNote.sharedWithUser.id;
        const sharedByUserId = sharedNote.sharedByUser.id;
        
        // Delete associated message if exists
        if (sharedNote.messageId) {
          const message = await Message.findByPk(sharedNote.messageId);
          if (message) {
            console.log(`🗑️ Deleting message ${sharedNote.messageId} between users ${sharedByUserId} and ${sharedWithUserId}`);
            await message.destroy();
            
            // Emit to both users about message deletion
            console.log(`📡 Emitting admin_message_deleted to users ${sharedWithUserId} and ${sharedByUserId}`);
            emitToUser(sharedWithUserId, 'admin_message_deleted', {
              messageId: sharedNote.messageId,
              chatUserId: sharedByUserId,
              deletedBy: 'admin'
            });
            emitToUser(sharedByUserId, 'admin_message_deleted', {
              messageId: sharedNote.messageId,
              chatUserId: sharedWithUserId,
              deletedBy: 'admin'
            });
          } else {
            console.log(`⚠️ Message ${sharedNote.messageId} not found`);
          }
        } else {
          console.log(`⚠️ No messageId found for SharedNote ${sharedNote.id}`);
        }
        
        await sharedNote.destroy();

        // Notify both users
        emitToUser(sharedWithUserId, 'shared_note_deleted_by_admin', { id: sharedNote.id });
        emitToUser(sharedByUserId, 'shared_note_deleted_by_admin', { id: sharedNote.id });
        emitToAllAdmins('admin_shared_note_deleted', { 
          id: sharedNote.id, 
          sharedWithUserId, 
          sharedByUserId,
          isGroupShare: false 
        });
      }

      res.json({ 
        message: 'Xóa ghi chú chia sẻ thành công',
        deletedMessageAlso: true,
        shareType: isGroupShare ? 'group' : 'individual',
        deletedMessageId: isGroupShare ? groupSharedNote?.groupMessageId : sharedNote?.messageId
      });

    } catch (error) {
      console.error('Error deleting shared note and message:', error);
      res.status(500).json({ message: 'Lỗi khi xóa ghi chú chia sẻ' });
    }
  });

  // Update shared note (admin): supports individual and group shares
  updateSharedNote = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const sid = Number(id);
    if (!Number.isFinite(sid)) {
      return res.status(400).json({ message: 'Invalid shared note id' });
    }

    const { canCreate, canEdit, canDelete, message } = req.body || {};

    // Try update individual share first
    let sharedNote = await SharedNote.findByPk(sid, {
      include: [
        { model: Note, as: 'note', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }] },
        { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] },
      ],
    });

    if (sharedNote) {
      const fields = {};
      if (typeof canCreate !== 'undefined') fields.canCreate = !!canCreate;
      if (typeof canEdit !== 'undefined') fields.canEdit = !!canEdit;
      if (typeof canDelete !== 'undefined') fields.canDelete = !!canDelete;
      if (typeof message !== 'undefined') fields.message = message;

      await sharedNote.update(fields);

      sharedNote = await SharedNote.findByPk(sid, {
        include: [
          { 
            model: Note, 
            as: 'note', 
            include: [
              { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
              { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] }
            ] 
          },
          { model: User, as: 'sharedWithUser', attributes: ['id', 'name', 'email', 'avatar'] },
          { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] },
        ],
      });

      // Notify involved users (admin namespace specific + users app common events)
      try { emitToUser(sharedNote.sharedWithUser.id, 'shared_note_updated_by_admin', { id: sid }); } catch {}
      try { emitToUser(sharedNote.sharedByUser.id, 'shared_note_updated_by_admin', { id: sid }); } catch {}
      // Also emit existing user-facing events so user apps refresh without F5
      try { emitToUser(sharedNote.sharedWithUser.id, 'note_shared_with_me', sharedNote); } catch {}
      try { emitToUser(sharedNote.sharedByUser.id, 'note_shared_by_me', sharedNote); } catch {}
      // Emit dedicated permission-updated event to both parties for UI toggles like "Add note"
      const permPayload = {
        sharedNoteId: sharedNote.id,
        noteId: sharedNote.noteId,
        sharedByUserId: sharedNote.sharedByUser.id,
        sharedWithUserId: sharedNote.sharedWithUser.id,
        canCreate: !!sharedNote.canCreate,
        canEdit: !!sharedNote.canEdit,
        canDelete: !!sharedNote.canDelete,
        message: sharedNote.message || null,
      };
      try { emitToUser(sharedNote.sharedWithUser.id, 'shared_permissions_updated', permPayload); } catch {}
      try { emitToUser(sharedNote.sharedByUser.id, 'shared_permissions_updated', permPayload); } catch {}
      // Also notify clients that cache create-permissions lists should be refreshed
      try { emitToUser(sharedNote.sharedWithUser.id, 'create_permissions_changed', { byUserId: sharedNote.sharedByUser.id, canCreate: !!sharedNote.canCreate }); } catch {}
      try { emitToUser(sharedNote.sharedByUser.id, 'create_permissions_changed', { withUserId: sharedNote.sharedWithUser.id, canCreate: !!sharedNote.canCreate }); } catch {}
      try { emitToAllAdmins('admin_shared_note_updated', { id: sid, shareType: 'individual' }); } catch {}

      return res.json({ message: 'Cập nhật chia sẻ thành công', sharedNote: { ...sharedNote.toJSON(), shareType: 'individual' } });
    }

    // Else, try group share
    let groupShared = await GroupSharedNote.findByPk(sid, {
      include: [
        { model: Note, as: 'note', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }] },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] },
      ],
    });

    if (!groupShared) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú chia sẻ' });
    }

    // For group share, only message can be updated currently
    const gFields = {};
    if (typeof message !== 'undefined') gFields.message = message;
    if (Object.keys(gFields).length > 0) {
      await groupShared.update(gFields);
    }

    groupShared = await GroupSharedNote.findByPk(sid, {
      include: [
        { model: Note, as: 'note', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }] },
        { model: Group, as: 'group', attributes: ['id', 'name', 'avatar'] },
        { model: User, as: 'sharedByUser', attributes: ['id', 'name', 'email', 'avatar'] },
      ],
    });

    try {
      if (global.io) {
        global.io.to(`group_${groupShared.group.id}`).emit('group_shared_note_updated_by_admin', { id: sid });
        // Emit a generic event that user/group clients may already handle
        global.io.to(`group_${groupShared.group.id}`).emit('group_shared_note_updated', { id: sid });
      }
    } catch {}
    try { emitToUser(groupShared.sharedByUser.id, 'shared_note_updated_by_admin', { id: sid, isGroupShare: true }); } catch {}
    try { emitToAllAdmins('admin_shared_note_updated', { id: sid, shareType: 'group' }); } catch {}

    return res.json({ message: 'Cập nhật chia sẻ nhóm thành công', sharedNote: { ...groupShared.toJSON(), shareType: 'group' } });
  });

  // ==================== FOLDER MANAGEMENT ====================

  // Get all folders for admin (all users' folders)
  getAllFolders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, userId, search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    // Filter by userId if provided
    if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
      const uid = parseInt(String(userId), 10);
      if (!Number.isNaN(uid)) {
        whereClause.userId = uid;
      }
    }

    // Search by name
    if (search) {
      whereClause.name = { [Op.like]: `%${search}%` };
    }

    const { count, rows: folders } = await NoteFolder.findAndCountAll({
      where: whereClause,
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'name', 'email', 'avatar'] 
        },
        {
          model: Note,
          as: 'notes',
          attributes: ['id'],
          where: { isArchived: false },
          required: false
        }
      ],
      order: [[sortBy, sortOrder]],
      limit: limitNum,
      offset,
    });

    // Add notes count to each folder
    const foldersWithCount = folders.map(folder => {
      const folderData = folder.toJSON();
      folderData.notesCount = folderData.notes ? folderData.notes.length : 0;
      delete folderData.notes;
      return folderData;
    });

    res.json({
      folders: foldersWithCount,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  });

  // Get folder by ID for admin
  getFolderById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const folder = await NoteFolder.findByPk(id, {
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['id', 'name', 'email', 'avatar'] 
        },
        {
          model: Note,
          as: 'notes',
          where: { isArchived: false },
          required: false,
          include: [
            { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }
          ]
        }
      ],
    });

    if (!folder) {
      return res.status(404).json({ message: 'Không tìm thấy thư mục' });
    }

    res.json({ folder });
  });

  // Create folder for user (admin)
  createFolderForUser = asyncHandler(async (req, res) => {
    const { userId, name, color, icon } = req.body;

    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const folder = await NoteFolder.create({
      name,
      color: color || 'blue',
      icon: icon || '📁',
      userId,
    });

    const folderWithUser = await NoteFolder.findByPk(folder.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
    });

    // Emit real-time events
    emitToUser(userId, 'folder_created', folderWithUser);
    emitToAllAdmins('admin_folder_created', folderWithUser);

    res.status(201).json({
      message: 'Tạo thư mục cho người dùng thành công',
      folder: folderWithUser,
    });
  });

  // Update user's folder (admin)
  updateUserFolder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, color, icon } = req.body;

    const folder = await NoteFolder.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
    });

    if (!folder) {
      return res.status(404).json({ message: 'Không tìm thấy thư mục' });
    }

    await folder.update({
      name: name !== undefined ? name : folder.name,
      color: color !== undefined ? color : folder.color,
      icon: icon !== undefined ? icon : folder.icon,
    });

    const updatedFolder = await NoteFolder.findByPk(folder.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }
      ],
    });

    // Emit real-time events
    emitToUser(folder.user.id, 'folder_updated', updatedFolder);
    emitToAllAdmins('admin_folder_updated', updatedFolder);

    res.json({
      message: 'Cập nhật thư mục thành công',
      folder: updatedFolder,
    });
  });

  // Delete user's folder (admin)
  deleteFolder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'userId là bắt buộc' });
    }

    const folder = await NoteFolder.findOne({ where: { id: parseInt(id), userId } });
    if (!folder) {
      return res.status(404).json({ message: 'Không tìm thấy thư mục' });
    }

    await folder.destroy();

    // Emit real-time events
    emitToUser(userId, 'folder_deleted', { id: parseInt(id) });
    emitToAllAdmins('admin_folder_deleted', { id: parseInt(id), userId });

    res.json({ message: 'Xóa thư mục thành công' });
  });

  // Pin note (admin)
  pinUserNote = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const note = await Note.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    await note.update({ isPinned: true });

    const updatedNote = await Note.findByPk(note.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
    });

    // Emit real-time updates to both user and admin
    emitToUser(note.user.id, 'note:pinned', {
      noteId: note.id,
      note: updatedNote,
      isPinned: true
    });
    emitToAllAdmins('admin_note_pinned', {
      noteId: note.id,
      note: updatedNote,
      isPinned: true
    });

    res.json({
      message: 'Ghim ghi chú thành công',
      note: updatedNote,
    });
  });

  // Unpin note (admin)
  unpinUserNote = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const note = await Note.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }],
    });

    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }

    await note.update({ isPinned: false });

    const updatedNote = await Note.findByPk(note.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] }]
    });

    // Emit real-time updates to both user and admin
    emitToUser(note.user.id, 'note:unpinned', {
      noteId: note.id,
      note: updatedNote,
      isPinned: false
    });
    emitToAllAdmins('admin_note_unpinned', {
      noteId: note.id,
      note: updatedNote,
      isPinned: false
    });

    res.json({
      message: 'Bỏ ghim ghi chú thành công',
      note: updatedNote,
    });
  });

}

export default AdminNotesChild;
