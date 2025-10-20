import { NoteCategory, Note } from '../../models/index.js';
import { Op } from 'sequelize';
import { emitToUser, emitToAllAdmins } from '../../socket/socketHandler.js';

class NotesCategoriesChild {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Get all categories for the user
   */
  getCategories = async (req, res) => {
    try {
      const userId = req.user.id;
      const { search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

      const whereClause = { userId };
      
      // Case-insensitive search
      if (search && search.trim()) {
        const searchTerm = search.trim();
        whereClause[Op.and] = whereClause[Op.and] || [];
        whereClause[Op.and].push(
          Note.sequelize.where(
            Note.sequelize.fn('LOWER', Note.sequelize.col('NoteCategory.name')),
            { [Op.like]: `%${searchTerm.toLowerCase()}%` }
          )
        );
      }

      // Tối ưu: Sử dụng subquery để tính notesCount thay vì GROUP BY
      // Order: Mới nhất trước (createdAt DESC), sau đó theo usage
      const categories = await NoteCategory.findAll({
        where: whereClause,
        order: [
          [sortBy, sortOrder], // Mặc định: createdAt DESC - mới nhất lên đầu
          ['maxSelectionCount', 'DESC'],
          ['selectionCount', 'DESC']
        ],
        attributes: {
          include: [
            [
              Note.sequelize.literal(
                `(SELECT COUNT(*) FROM Notes WHERE Notes.categoryId = NoteCategory.id)`
              ),
              'notesCount'
            ]
          ]
        },
      });

      const total = categories.length;

      res.status(200).json({
        categories,
        total,
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ 
        message: 'Error retrieving categories', 
        error: error.message 
      });
    }
  };

  /**
   * Search categories for autocomplete/dropdown (optimized for UI)
   */
  searchCategories = async (req, res) => {
    try {
      const userId = req.user.id;
      const { q, limit = 4 } = req.query;

      // Validate search query
      if (!q || !q.trim()) {
        return res.status(400).json({ 
          message: 'Search query is required',
          categories: [],
          total: 0
        });
      }

      const searchTerm = q.trim();
      
      // Sanitize input to prevent SQL injection
      if (searchTerm.length > 100) {
        return res.status(400).json({ 
          message: 'Search query too long',
          categories: [],
          total: 0
        });
      }

      // Case-insensitive search với LOWER
      const whereClause = {
        userId,
        [Op.and]: [
          Note.sequelize.where(
            Note.sequelize.fn('LOWER', Note.sequelize.col('NoteCategory.name')),
            { [Op.like]: `%${searchTerm.toLowerCase()}%` }
          )
        ]
      };

      // Tìm kiếm với limit và sắp xếp theo usage
      const categories = await NoteCategory.findAll({
        where: whereClause,
        limit: parseInt(limit),
        order: [
          ['maxSelectionCount', 'DESC'],
          ['selectionCount', 'DESC'],
          ['createdAt', 'DESC']
        ],
        attributes: {
          include: [
            [
              Note.sequelize.literal(
                `(SELECT COUNT(*) FROM Notes WHERE Notes.categoryId = NoteCategory.id)`
              ),
              'notesCount'
            ]
          ]
        },
      });

      res.status(200).json({
        categories,
        total: categories.length,
        query: searchTerm,
        limit: parseInt(limit)
      });
    } catch (error) {
      console.error('Search categories error:', error);
      res.status(500).json({ 
        message: 'Error searching categories', 
        error: error.message,
        categories: [],
        total: 0
      });
    }
  };

  /**
   * Get category by ID
   */
  getCategoryById = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const category = await NoteCategory.findOne({
        where: { 
          id,
          userId 
        },
        attributes: {
          include: [
            [
              Note.sequelize.literal(
                `(SELECT COUNT(*) FROM Notes WHERE Notes.categoryId = NoteCategory.id)`
              ),
              'notesCount'
            ]
          ]
        },
      });

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      res.status(200).json({ category });
    } catch (error) {
      console.error('Get category error:', error);
      res.status(500).json({ 
        message: 'Error retrieving category', 
        error: error.message 
      });
    }
  };

  /**
   * Create a new category
   */
  createCategory = async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, color, icon } = req.body;

      // Tối ưu: Check trùng lặp nhanh với composite index
      const trimmedName = name.trim().toLowerCase();
      const existingCategory = await NoteCategory.findOne({
        where: { 
          userId,
          name: Note.sequelize.where(
            Note.sequelize.fn('LOWER', Note.sequelize.col('name')),
            trimmedName
          )
        },
        attributes: ['id'] // Chỉ lấy id để nhanh hơn
      });

      if (existingCategory) {
        return res.status(400).json({ 
          message: 'Category with this name already exists' 
        });
      }

      const category = await NoteCategory.create({
        name: name.trim(),
        color: color || '#3B82F6',
        icon: icon || 'Tag',
        userId,
      });

      // Tối ưu: Trả về category với notesCount = 0 ngay (vì mới tạo)
      const categoryData = {
        ...category.toJSON(),
        notesCount: 0
      };

      // Emit socket event for real-time update
      emitToUser(userId, 'category_created', categoryData);
      emitToAllAdmins('user_category_created', { ...categoryData, userId });

      res.status(201).json({
        message: 'Category created successfully',
        category: categoryData,
      });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({ 
        message: 'Error creating category', 
        error: error.message 
      });
    }
  };

  /**
   * Update a category
   */
  updateCategory = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { name, color, icon } = req.body;

      const category = await NoteCategory.findOne({
        where: { 
          id,
          userId 
        }
      });

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      // Tối ưu: Chỉ check trùng tên khi tên thay đổi
      if (name && name.trim().toLowerCase() !== category.name.toLowerCase()) {
        const trimmedName = name.trim().toLowerCase();
        const existingCategory = await NoteCategory.findOne({
          where: { 
            userId,
            name: Note.sequelize.where(
              Note.sequelize.fn('LOWER', Note.sequelize.col('name')),
              trimmedName
            ),
            id: { [Op.ne]: id }
          },
          attributes: ['id'] // Chỉ lấy id để nhanh hơn
        });

        if (existingCategory) {
          return res.status(400).json({ 
            message: 'Category with this name already exists' 
          });
        }
      }

      // Update fields
      if (name !== undefined) category.name = name.trim();
      if (color !== undefined) category.color = color;
      if (icon !== undefined) category.icon = icon;

      await category.save();

      // Tối ưu: Lấy notesCount hiện tại với hint index
      const notesCount = await Note.count({
        where: { categoryId: id },
        benchmark: true,
        logging: false
      });

      const categoryData = {
        ...category.toJSON(),
        notesCount
      };

      // Emit socket event for real-time update
      emitToUser(userId, 'category_updated', categoryData);
      emitToAllAdmins('user_category_updated', { ...categoryData, userId });

      res.status(200).json({
        message: 'Category updated successfully',
        category: categoryData,
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({ 
        message: 'Error updating category', 
        error: error.message 
      });
    }
  };

  /**
   * Delete a category
   */
  deleteCategory = async (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const category = await NoteCategory.findOne({
        where: { 
          id,
          userId 
        }
      });

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      // Set all notes with this category to null
      await Note.update(
        { categoryId: null },
        { where: { categoryId: id } }
      );

      await category.destroy();

      // Emit socket event for real-time update
      console.log(`🔴 Emitting category_deleted event to user ${userId}, category id: ${id}`);
      emitToUser(userId, 'category_deleted', { id: parseInt(id) });
      emitToAllAdmins('user_category_deleted', { id: parseInt(id), userId });
      console.log(`✅ Socket events emitted successfully`);

      res.status(200).json({
        message: 'Category deleted successfully',
      });
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({ 
        message: 'Error deleting category', 
        error: error.message 
      });
    }
  };
}

export default NotesCategoriesChild;
