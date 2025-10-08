import { NoteFolder, Note, User } from '../../models/index.js';
import { Op } from 'sequelize';
import { emitToUser } from '../../socket/socketHandler.js';

class NotesFoldersChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Get all folders for a user
  getFolders = async (req, res) => {
    try {
      const userId = req.user.id;
      const { search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

      const whereClause = { userId };

      // Add search filter
      if (search) {
        whereClause.name = {
          [Op.like]: `%${search}%`
        };
      }

      const folders = await NoteFolder.findAll({
        where: whereClause,
        include: [{
          model: Note,
          as: 'notes',
          attributes: ['id'],
          where: { isArchived: false },
          required: false
        }],
        order: [[sortBy, sortOrder]],
      });

      // Add note count to each folder
      const foldersWithCount = folders.map(folder => {
        const folderData = folder.toJSON();
        folderData.notesCount = folderData.notes ? folderData.notes.length : 0;
        delete folderData.notes;
        return folderData;
      });

      return res.status(200).json({
        folders: foldersWithCount,
        total: foldersWithCount.length
      });
    } catch (error) {
      console.error('Get folders error:', error);
      return res.status(500).json({ message: 'Lỗi khi tải danh sách thư mục' });
    }
  };

  // Get folder by ID with notes
  getFolderById = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const offset = (page - 1) * limit;

      const folder = await NoteFolder.findOne({
        where: { id, userId },
      });

      if (!folder) {
        return res.status(404).json({ message: 'Không tìm thấy thư mục' });
      }

      // Get notes in folder with pagination
      const { count, rows: notes } = await Note.findAndCountAll({
        where: { 
          folderId: id,
          userId,
          isArchived: false
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar'],
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      return res.status(200).json({
        folder: folder.toJSON(),
        notes,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get folder by ID error:', error);
      return res.status(500).json({ message: 'Lỗi khi tải thư mục' });
    }
  };

  // Create new folder
  createFolder = async (req, res) => {
    try {
      const { name, color, icon } = req.body;
      const userId = req.user.id;

      const folder = await NoteFolder.create({
        name,
        color: color || 'blue',
        icon: icon || 'folder',
        userId,
      });

      // Emit socket event for real-time update
      emitToUser(userId, 'folder_created', folder.toJSON());

      return res.status(201).json({
        message: 'Tạo thư mục thành công',
        folder: folder.toJSON()
      });
    } catch (error) {
      console.error('Create folder error:', error);
      return res.status(500).json({ message: 'Lỗi khi tạo thư mục' });
    }
  };

  // Update folder
  updateFolder = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, color, icon } = req.body;
      const userId = req.user.id;

      const folder = await NoteFolder.findOne({
        where: { id, userId }
      });

      if (!folder) {
        return res.status(404).json({ message: 'Không tìm thấy thư mục' });
      }

      await folder.update({
        name: name !== undefined ? name : folder.name,
        color: color !== undefined ? color : folder.color,
        icon: icon !== undefined ? icon : folder.icon,
      });

      // Emit socket event for real-time update
      emitToUser(userId, 'folder_updated', folder.toJSON());

      return res.status(200).json({
        message: 'Cập nhật thư mục thành công',
        folder: folder.toJSON()
      });
    } catch (error) {
      console.error('Update folder error:', error);
      return res.status(500).json({ message: 'Lỗi khi cập nhật thư mục' });
    }
  };

  // Delete folder
  deleteFolder = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const folder = await NoteFolder.findOne({
        where: { id, userId }
      });

      if (!folder) {
        return res.status(404).json({ message: 'Không tìm thấy thư mục' });
      }

      // Remove folderId from all notes in this folder
      await Note.update(
        { folderId: null },
        { where: { folderId: id, userId } }
      );

      await folder.destroy();

      // Emit socket event for real-time update
      emitToUser(userId, 'folder_deleted', { id: parseInt(id) });

      return res.status(200).json({
        message: 'Xóa thư mục thành công'
      });
    } catch (error) {
      console.error('Delete folder error:', error);
      return res.status(500).json({ message: 'Lỗi khi xóa thư mục' });
    }
  };

  // Move note to folder
  moveNoteToFolder = async (req, res) => {
    try {
      const { noteId } = req.params;
      const { folderId } = req.body;
      const userId = req.user.id;

      const note = await Note.findOne({
        where: { id: noteId, userId }
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

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

      // Emit socket event for real-time update
      emitToUser(userId, 'note_moved_to_folder', noteWithUser.toJSON());

      return res.status(200).json({
        message: folderId ? 'Chuyển ghi chú vào thư mục thành công' : 'Xóa ghi chú khỏi thư mục thành công',
        note: noteWithUser.toJSON()
      });
    } catch (error) {
      console.error('Move note to folder error:', error);
      return res.status(500).json({ message: 'Lỗi khi chuyển ghi chú' });
    }
  };
}

export default NotesFoldersChild;
