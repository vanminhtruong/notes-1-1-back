import { Note, NoteTag, NoteTagMapping, User } from '../../models/index.js';
import { Op } from 'sequelize';

class AdminTagsService {
  // Get all tags across all users with pagination and filters
  async getAllTags(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        userId,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);
      const where = {};

      // Filter by search term
      if (search) {
        where.name = { [Op.like]: `%${search}%` };
      }

      // Filter by specific user
      if (userId) {
        where.userId = userId;
      }

      const { count, rows: tags } = await NoteTag.findAndCountAll({
        where,
        attributes: ['id', 'name', 'color', 'isPinned', 'userId', 'createdAt', 'updatedAt'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: Note,
            as: 'notes',
            attributes: ['id'],
            through: { attributes: [] },
          },
        ],
        order: [
          ['isPinned', 'DESC'], // Pinned tags first
          [sortBy, sortOrder]
        ],
        limit: parseInt(limit),
        offset,
        distinct: true,
      });

      // Format tags with notes count
      const tagsWithCount = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        isPinned: tag.isPinned || false,
        userId: tag.userId,
        user: tag.user,
        notesCount: tag.notes?.length || 0,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      }));

      res.json({
        tags: tagsWithCount,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('[Admin] Get all tags error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy danh sách tags' });
    }
  }

  // Get tag stats
  async getTagsStats(req, res) {
    try {
      const totalTags = await NoteTag.count();
      const totalTagMappings = await NoteTagMapping.count();
      
      // Get most used tags
      const mostUsedTags = await NoteTag.findAll({
        attributes: [
          'id',
          'name',
          'color',
          'userId',
        ],
        include: [
          {
            model: Note,
            as: 'notes',
            attributes: ['id'],
            through: { attributes: [] },
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
          },
        ],
        limit: 10,
        order: [
          [{ model: Note, as: 'notes' }, 'id', 'DESC']
        ],
      });

      const formattedMostUsed = mostUsedTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        userId: tag.userId,
        user: tag.user,
        notesCount: tag.notes?.length || 0,
      }));

      res.json({
        stats: {
          totalTags,
          totalTagMappings,
          averageTagsPerNote: totalTagMappings / totalTags || 0,
        },
        mostUsedTags: formattedMostUsed,
      });
    } catch (error) {
      console.error('[Admin] Get tags stats error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy thống kê tags' });
    }
  }

  // Get tag detail by ID
  async getTagDetail(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const tag = await NoteTag.findByPk(id, {
        attributes: ['id', 'name', 'color', 'isPinned', 'userId', 'createdAt', 'updatedAt'],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'phone'],
          },
        ],
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      // Get notes with this tag (paginated)
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const { count, rows: notes } = await Note.findAndCountAll({
        where: { userId: tag.userId },
        include: [
          {
            model: NoteTag,
            as: 'tags',
            where: { id },
            attributes: ['id', 'name', 'color'],
            through: { attributes: [] },
          },
        ],
        attributes: ['id', 'title', 'content', 'priority', 'isArchived', 'createdAt'],
        limit: parseInt(limit),
        offset,
        distinct: true,
      });

      res.json({
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          isPinned: tag.isPinned || false,
          userId: tag.userId,
          user: tag.user,
          notesCount: count,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        },
        notes,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error('[Admin] Get tag detail error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy thông tin tag' });
    }
  }

  // Create tag for a user
  async createTagForUser(req, res) {
    try {
      const { userId, name, color = '#3B82F6' } = req.body;

      // Check if user exists
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'Không tìm thấy người dùng' });
      }

      // Check if tag name already exists for this user
      const existingTag = await NoteTag.findOne({
        where: { userId, name: { [Op.like]: name } },
      });

      if (existingTag) {
        return res.status(400).json({ message: 'Tag với tên này đã tồn tại cho người dùng này' });
      }

      const tag = await NoteTag.create({
        name,
        color,
        userId,
      });

      // Emit real-time event to user
      if (global.io) {
        global.io.to(`user_${userId}`).emit('tag_created', {
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

        // Emit to admin rooms
        global.io.to('admin_room').emit('admin_tag_created', {
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
            isPinned: tag.isPinned || false,
            userId: tag.userId,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
            },
            notesCount: 0,
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt,
          },
        });
      }

      res.status(201).json({
        message: 'Tạo tag thành công',
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          isPinned: tag.isPinned || false,
          userId: tag.userId,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          notesCount: 0,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        },
      });
    } catch (error) {
      console.error('[Admin] Create tag error:', error);
      res.status(500).json({ message: 'Lỗi khi tạo tag' });
    }
  }

  // Update tag
  async updateTag(req, res) {
    try {
      const { id } = req.params;
      const { name, color } = req.body;

      const tag = await NoteTag.findByPk(id, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      // Check if new name conflicts with another tag for this user
      if (name && name !== tag.name) {
        const existingTag = await NoteTag.findOne({
          where: {
            userId: tag.userId,
            name: { [Op.like]: name },
            id: { [Op.ne]: id },
          },
        });

        if (existingTag) {
          return res.status(400).json({ message: 'Tag với tên này đã tồn tại cho người dùng này' });
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
        userId: tag.userId,
        user: tag.user,
        notesCount,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      };

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${tag.userId}`).emit('tag_updated', {
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
            notesCount,
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt,
          },
        });

        // To admin
        global.io.to('admin_room').emit('admin_tag_updated', {
          tag: updatedTag,
        });
      }

      res.json({
        message: 'Cập nhật tag thành công',
        tag: updatedTag,
      });
    } catch (error) {
      console.error('[Admin] Update tag error:', error);
      res.status(500).json({ message: 'Lỗi khi cập nhật tag' });
    }
  }

  // Delete tag
  async deleteTag(req, res) {
    try {
      const { id } = req.params;

      const tag = await NoteTag.findByPk(id, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      const userId = tag.userId;

      // Delete all mappings first
      await NoteTagMapping.destroy({
        where: { tagId: id },
      });

      await tag.destroy();

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${userId}`).emit('tag_deleted', {
          id: parseInt(id),
        });

        // To admin
        global.io.to('admin_room').emit('admin_tag_deleted', {
          id: parseInt(id),
          userId,
        });
      }

      res.json({ message: 'Xóa tag thành công' });
    } catch (error) {
      console.error('[Admin] Delete tag error:', error);
      res.status(500).json({ message: 'Lỗi khi xóa tag' });
    }
  }

  // Pin tag
  async pinTag(req, res) {
    try {
      const { id } = req.params;

      const tag = await NoteTag.findByPk(id, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      const userId = tag.userId;
      
      tag.isPinned = true;
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
        userId: tag.userId,
        user: tag.user,
        notesCount,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      };

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${tag.userId}`).emit('tag_pinned', {
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
            isPinned: tag.isPinned,
            notesCount,
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt,
          },
        });

        // To admin
        global.io.to('admin_room').emit('admin_tag_pinned', {
          tag: updatedTag,
        });
      }

      res.json({
        message: 'Ghim tag thành công',
        tag: updatedTag,
      });
    } catch (error) {
      console.error('[Admin] Pin tag error:', error);
      res.status(500).json({ message: 'Lỗi khi ghim tag' });
    }
  }

  // Unpin tag
  async unpinTag(req, res) {
    try {
      const { id } = req.params;

      const tag = await NoteTag.findByPk(id, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });

      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      tag.isPinned = false;
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
        userId: tag.userId,
        user: tag.user,
        notesCount,
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      };

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${tag.userId}`).emit('tag_unpinned', {
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
            isPinned: tag.isPinned,
            notesCount,
            createdAt: tag.createdAt,
            updatedAt: tag.updatedAt,
          },
        });

        // To admin
        global.io.to('admin_room').emit('admin_tag_unpinned', {
          tag: updatedTag,
        });
      }

      res.json({
        message: 'Bỏ ghim tag thành công',
        tag: updatedTag,
      });
    } catch (error) {
      console.error('[Admin] Unpin tag error:', error);
      res.status(500).json({ message: 'Lỗi khi bỏ ghim tag' });
    }
  }

  // Assign tag to note
  async assignTagToNote(req, res) {
    try {
      const { noteId, tagId } = req.body;

      // Verify note and tag exist and belong to same user
      const note = await Note.findByPk(noteId);
      if (!note) {
        return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
      }

      const tag = await NoteTag.findByPk(tagId);
      if (!tag) {
        return res.status(404).json({ message: 'Không tìm thấy tag' });
      }

      if (note.userId !== tag.userId) {
        return res.status(400).json({ message: 'Ghi chú và tag không thuộc cùng một người dùng' });
      }

      // Check if mapping already exists
      const existingMapping = await NoteTagMapping.findOne({
        where: { noteId, tagId },
      });

      if (existingMapping) {
        return res.status(400).json({ message: 'Tag đã được gắn vào ghi chú này' });
      }

      await NoteTagMapping.create({ noteId, tagId });

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${note.userId}`).emit('note_tag_added', {
          noteId: parseInt(noteId),
          tag: {
            id: tag.id,
            name: tag.name,
            color: tag.color,
          },
        });

        // To admin
        global.io.to('admin_room').emit('admin_note_tag_assigned', {
          noteId: parseInt(noteId),
          tagId: parseInt(tagId),
          userId: note.userId,
        });
      }

      res.status(201).json({
        message: 'Gắn tag vào ghi chú thành công',
        tag: {
          id: tag.id,
          name: tag.name,
          color: tag.color,
        },
      });
    } catch (error) {
      console.error('[Admin] Assign tag to note error:', error);
      res.status(500).json({ message: 'Lỗi khi gắn tag vào ghi chú' });
    }
  }

  // Remove tag from note
  async removeTagFromNote(req, res) {
    try {
      const { noteId, tagId } = req.params;

      const note = await Note.findByPk(noteId);
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

      // Emit real-time events
      if (global.io) {
        // To user
        global.io.to(`user_${note.userId}`).emit('note_tag_removed', {
          noteId: parseInt(noteId),
          tagId: parseInt(tagId),
        });

        // To admin
        global.io.to('admin_room').emit('admin_note_tag_removed', {
          noteId: parseInt(noteId),
          tagId: parseInt(tagId),
          userId: note.userId,
        });
      }

      res.json({ message: 'Xóa tag khỏi ghi chú thành công' });
    } catch (error) {
      console.error('[Admin] Remove tag from note error:', error);
      res.status(500).json({ message: 'Lỗi khi xóa tag khỏi ghi chú' });
    }
  }
}

export default new AdminTagsService();
