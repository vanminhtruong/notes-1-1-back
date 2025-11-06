import { Note, NoteTag, NoteTagMapping, User } from '../../models/index.js';
import { Op } from 'sequelize';

class NotesTagsChild {
  constructor(parent) {
    this.parent = parent;
    // Simple in-memory cache
    this.tagsCache = new Map();
    this.CACHE_TTL = 0; // disable cache to ensure realtime updates
  }

  // Clear cache for a specific user
  clearUserCache(userId) {
    this.tagsCache.delete(userId);
  }

  // Get all tags for a user
  getTags = async (req, res) => {
    try {
      const userId = req.user.id;
      const { search, sortBy = 'name', sortOrder = 'ASC' } = req.query;

      // Create cache key based on user and query params
      const cacheKey = `${userId}-${search || ''}-${sortBy}-${sortOrder}`;
      
      // Check cache
      const cached = this.tagsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('Returning cached tags for user', userId);
        return res.json(cached.data);
      }

      const where = { userId };
      
      if (search) {
        where.name = { [Op.like]: `%${search}%` };
      }

      const tags = await NoteTag.findAll({
        where,
        attributes: ['id', 'name', 'color', 'isPinned', 'createdAt', 'updatedAt'],
        order: [
          ['isPinned', 'DESC'], // Ghim lên đầu
          [sortBy, sortOrder],
        ],
        include: [
          {
            model: Note,
            as: 'notes',
            attributes: ['id'],
            through: { attributes: [] },
          },
        ],
      });

      // Count notes for each tag
      const tagsWithCount = tags.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        isPinned: tag.isPinned,
        notesCount: tag.notes?.length || 0,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      }));

      const responseData = {
        tags: tagsWithCount,
        total: tagsWithCount.length,
      };

      // Store in cache
      this.tagsCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now(),
      });

      res.json(responseData);
    } catch (error) {
      console.error('Get tags error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy danh sách tag' });
    }
  };

  // Get a single tag by ID
  getTagById = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const tag = await NoteTag.findOne({
        where: { id, userId },
        attributes: ['id', 'name', 'color', 'createdAt', 'updatedAt'],
        include: [
          {
            model: Note,
            as: 'notes',
            attributes: ['id', 'title', 'content', 'priority', 'isArchived', 'createdAt'],
            through: { attributes: [] },
          },
        ],
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      res.json({
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          notesCount: tag.notes?.length || 0,
          notes: tag.notes,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        },
      });
    } catch (error) {
      console.error('Get tag by ID error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy thông tin tag' });
    }
  };

  // Create a new tag
  createTag = async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, color = '#3B82F6' } = req.body;

      // Check if tag name already exists for this user
      const existingTag = await NoteTag.findOne({
        where: { userId, name: { [Op.like]: name } },
      });

      if (existingTag) {
        return res.status(400).json({ message: 'Tag với tên này đã tồn tại' });
      }

      const tag = await NoteTag.create({
        name,
        color,
        userId,
      });

      // Emit real-time events
      if (global.io) {
        const tagData = {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          isPinned: tag.isPinned || false,
          notesCount: 0,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        };
        
        // To user
        global.io.to(`user_${userId}`).emit('tag_created', { tag: tagData });
        
        // To admin room
        global.io.to('admin_room').emit('user_tag_created', { tag: tagData, userId });
      }

      // Clear cache after creating tag
      this.clearUserCache(userId);

      res.status(201).json({
        message: 'Tạo tag thành công',
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          isPinned: tag.isPinned || false,
          notesCount: 0,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        },
      });
    } catch (error) {
      console.error('Create tag error:', error);
      res.status(500).json({ message: 'Lỗi khi tạo tag' });
    }
  };

  // Update a tag
  updateTag = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { name, color } = req.body;

      const tag = await NoteTag.findOne({
        where: { id, userId },
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      // Check if new name conflicts with another tag
      if (name && name !== tag.name) {
        const existingTag = await NoteTag.findOne({
          where: {
            userId,
            name: { [Op.like]: name },
            id: { [Op.ne]: id },
          },
        });

        if (existingTag) {
          return res.status(400).json({ message: 'Tag với tên này đã tồn tại' });
        }
      }

      if (name) tag.name = name;
      if (color) tag.color = color;
      await tag.save();

      // Get notes count
      const notesCount = await NoteTagMapping.count({
        where: { tagId: id },
      });

      const updatedTag = {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        isPinned: tag.isPinned || false,
        notesCount,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      };

      // Clear cache after updating tag
      this.clearUserCache(userId);

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${userId}`).emit('tag_updated', { tag: updatedTag });
        
        // To admin room
        global.io.to('admin_room').emit('user_tag_updated', { tag: updatedTag, userId });
      }

      res.json({
        message: 'Cập nhật tag thành công',
        tag: updatedTag,
      });
    } catch (error) {
      console.error('Update tag error:', error);
      res.status(500).json({ message: 'Lỗi khi cập nhật tag' });
    }
  };

  // Delete a tag
  deleteTag = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const tag = await NoteTag.findOne({
        where: { id, userId },
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      // Delete all mappings first (cascade should handle this, but being explicit)
      await NoteTagMapping.destroy({
        where: { tagId: id },
      });

      await tag.destroy();

      // Clear cache after deleting tag
      this.clearUserCache(userId);

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${userId}`).emit('tag_deleted', { id: parseInt(id) });
        
        // To admin room
        global.io.to('admin_room').emit('user_tag_deleted', { id: parseInt(id), userId });
      }

      res.json({ message: 'Xóa tag thành công' });
    } catch (error) {
      console.error('Delete tag error:', error);
      res.status(500).json({ message: 'Lỗi khi xóa tag' });
    }
  };

  // Add tag to note
  addTagToNote = async (req, res) => {
    try {
      const userId = req.user.id;
      const { noteId } = req.params;
      const { tagId } = req.body;

      // Verify note belongs to user
      const note = await Note.findOne({
        where: { id: noteId, userId },
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      // Verify tag belongs to user
      const tag = await NoteTag.findOne({
        where: { id: tagId, userId },
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      // Check if mapping already exists
      const existingMapping = await NoteTagMapping.findOne({
        where: { noteId, tagId },
      });

      if (existingMapping) {
        return res.status(400).json({ message: 'Tag đã được gắn vào ghi chú này' });
      }

      // Enforce max 3 tags per note
      const currentTagCount = await NoteTagMapping.count({ where: { noteId } });
      if (currentTagCount >= 3) {
        return res.status(400).json({ message: 'Mỗi ghi chú chỉ được gắn tối đa 3 tag' });
      }

      await NoteTagMapping.create({ noteId, tagId });

      // Emit real-time event
      if (global.io) {
        global.io.to(`user_${userId}`).emit('note_tag_added', {
          noteId: parseInt(noteId),
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
          },
        });
      }

      // Clear cache after adding tag to note (notesCount changes)
      this.clearUserCache(userId);

      res.status(201).json({
        message: 'Thêm tag vào ghi chú thành công',
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
        },
      });
    } catch (error) {
      console.error('Add tag to note error:', error);
      res.status(500).json({ message: 'Lỗi khi thêm tag vào ghi chú' });
    }
  };

  // Remove tag from note
  removeTagFromNote = async (req, res) => {
    try {
      const userId = req.user.id;
      const { noteId, tagId } = req.params;

      // Verify note belongs to user
      const note = await Note.findOne({
        where: { id: noteId, userId },
      });

      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      // Delete mapping
      const deleted = await NoteTagMapping.destroy({
        where: { noteId, tagId },
      });

      if (!deleted) {
        return res.status(404).json({ message: 'Tag không được gắn vào ghi chú này' });
      }

      // Clear cache after removing tag from note (notesCount changes)
      this.clearUserCache(userId);

      // Emit real-time event
      if (global.io) {
        global.io.to(`user_${userId}`).emit('note_tag_removed', {
          noteId: parseInt(noteId),
          tagId: parseInt(tagId),
        });
      }

      res.json({ message: 'Xóa tag khỏi ghi chú thành công' });
    } catch (error) {
      console.error('Remove tag from note error:', error);
      res.status(500).json({ message: 'Lỗi khi xóa tag khỏi ghi chú' });
    }
  };

  // Toggle pin tag
  togglePinTag = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const tag = await NoteTag.findOne({
        where: { id, userId },
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      // Toggle isPinned
      tag.isPinned = !tag.isPinned;
      await tag.save();

      // Get notes count
      const notesCount = await NoteTagMapping.count({
        where: { tagId: id },
      });

      const updatedTag = {
        id: tag.id,
        name: tag.name,
        color: tag.color,
        isPinned: tag.isPinned,
        notesCount,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      };

      // Clear cache after toggling pin
      this.clearUserCache(userId);

      // Emit real-time events
      if (global.io) {
        const eventName = tag.isPinned ? 'tag_pinned' : 'tag_unpinned';
        
        // To user
        global.io.to(`user_${userId}`).emit(eventName, { tag: updatedTag });

        // To admins (emit to each admin's personal room)
        try {
          const adminEventName = tag.isPinned ? 'admin_tag_pinned' : 'admin_tag_unpinned';
          const adminUsers = await User.findAll({ where: { role: 'admin', isActive: true }, attributes: ['id'] });
          for (const admin of adminUsers) {
            global.io.to(`user_${admin.id}`).emit(adminEventName, { tag: updatedTag });
          }
        } catch (e) {
          console.error('Error emitting admin tag pin/unpin event:', e);
        }
      }

      res.json({
        message: tag.isPinned ? 'Đã ghim tag' : 'Đã bỏ ghim tag',
        tag: updatedTag,
      });
    } catch (error) {
      console.error('Toggle pin tag error:', error);
      res.status(500).json({ message: 'Lỗi khi ghim/bỏ ghim tag' });
    }
  };

  // Get notes by tag
  getNotesByTag = async (req, res) => {
    try {
      const userId = req.user.id;
      const { tagId } = req.params;
      const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

      // Verify tag belongs to user
      const tag = await NoteTag.findOne({
        where: { id: tagId, userId },
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { count, rows: notes } = await Note.findAndCountAll({
        where: { userId },
        include: [
          {
            model: NoteTag,
            as: 'tags',
            where: { id: tagId },
            attributes: ['id', 'name', 'color'],
            through: { attributes: [] },
          },
        ],
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset,
        distinct: true,
      });

      res.json({
        notes,
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
        },
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('Get notes by tag error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy danh sách ghi chú theo tag' });
    }
  };
}

export default NotesTagsChild;
