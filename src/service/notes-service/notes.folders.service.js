import { NoteFolder, Note, User, NoteCategory } from '../../models/index.js';
import { Op } from 'sequelize';
import { emitToUser, emitToAllAdmins } from '../../socket/socketHandler.js';

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
      const { page = 1, limit = 9 } = req.query;

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
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'avatar'],
          },
          {
            model: NoteCategory,
            as: 'category',
            attributes: ['id', 'name', 'color', 'icon'],
          }
        ],
        order: [
          ['isPinned', 'DESC'], // Ghim notes lên đầu
          ['createdAt', 'DESC']  // Sau đó sắp xếp theo ngày tạo
        ],
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
        icon: icon || '📁',
        userId,
      });

      // Emit socket event for real-time update
      emitToUser(userId, 'folder_created', folder.toJSON());
      emitToAllAdmins('user_folder_created', { ...folder.toJSON(), userId });

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
      emitToAllAdmins('user_folder_updated', { ...folder.toJSON(), userId });

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
      emitToAllAdmins('user_folder_deleted', { id: parseInt(id), userId });

      return res.status(200).json({
        message: 'Xóa thư mục thành công'
      });
    } catch (error) {
      console.error('Delete folder error:', error);
      return res.status(500).json({ message: 'Lỗi khi xóa thư mục' });
    }
  };

  // Search folders and notes in folders
  searchFolders = async (req, res) => {
    try {
      const userId = req.user.id;
      const { search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

      if (!search || search.trim() === '') {
        return res.status(200).json({
          folders: [],
          notes: [],
          total: 0
        });
      }

      const searchTerm = search.trim();

      // Search folders by name
      const folders = await NoteFolder.findAll({
        where: {
          userId,
          name: { [Op.like]: `%${searchTerm}%` }
        },
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

      // Search notes inside folders by title or content
      const notes = await Note.findAll({
        where: {
          userId,
          folderId: { [Op.not]: null }, // Only notes in folders
          isArchived: false,
          [Op.or]: [
            { title: { [Op.like]: `%${searchTerm}%` } },
            { content: { [Op.like]: `%${searchTerm}%` } }
          ]
        },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'avatar'],
          },
          {
            model: NoteFolder,
            as: 'folder',
            attributes: ['id', 'name', 'color', 'icon']
          },
          {
            model: NoteCategory,
            as: 'category',
            attributes: ['id', 'name', 'color', 'icon'],
          }
        ],
        order: [['updatedAt', 'DESC']],
        limit: 50, // Limit results to avoid too many results
      });

      return res.status(200).json({
        folders: foldersWithCount,
        notes: notes.map(note => note.toJSON()),
        total: foldersWithCount.length + notes.length,
        query: searchTerm
      });
    } catch (error) {
      console.error('Search folders error:', error);
      return res.status(500).json({ message: 'Lỗi khi tìm kiếm thư mục' });
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
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'avatar'],
          },
          {
            model: NoteCategory,
            as: 'category',
            attributes: ['id', 'name', 'color', 'icon'],
          }
        ],
      });

      // Emit socket event for real-time update
      emitToUser(userId, 'note_moved_to_folder', noteWithUser.toJSON());
      emitToAllAdmins('note_moved_to_folder', { ...noteWithUser.toJSON(), userId });

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
