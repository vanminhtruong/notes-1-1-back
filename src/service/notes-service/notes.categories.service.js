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
      if (search) {
        whereClause.name = { [Op.like]: `%${search}%` };
      }

      const categories = await NoteCategory.findAll({
        where: whereClause,
        order: [
          ['maxSelectionCount', 'DESC'], // Sắp xếp theo số lần chọn tối đa (giữ nguyên vị trí khi đã hot)
          ['selectionCount', 'DESC'], // Sau đó theo số lần chọn hiện tại
          [sortBy, sortOrder]
        ],
        include: [
          {
            model: Note,
            as: 'notes',
            attributes: [],
            required: false,
          },
        ],
        attributes: {
          include: [
            [
              Note.sequelize.fn('COUNT', Note.sequelize.col('notes.id')),
              'notesCount'
            ]
          ]
        },
        group: ['NoteCategory.id'],
        subQuery: false,
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
        include: [
          {
            model: Note,
            as: 'notes',
            attributes: [],
            required: false,
          },
        ],
        attributes: {
          include: [
            [
              Note.sequelize.fn('COUNT', Note.sequelize.col('notes.id')),
              'notesCount'
            ]
          ]
        },
        group: ['NoteCategory.id'],
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

      // Check if category with same name exists for user
      const existingCategory = await NoteCategory.findOne({
        where: { 
          userId,
          name: { [Op.like]: name }
        }
      });

      if (existingCategory) {
        return res.status(400).json({ 
          message: 'Category with this name already exists' 
        });
      }

      const category = await NoteCategory.create({
        name,
        color: color || '#3B82F6',
        icon: icon || 'Tag',
        userId,
      });

      // Emit socket event for real-time update
      emitToUser(userId, 'category_created', category.toJSON());
      emitToAllAdmins('user_category_created', { ...category.toJSON(), userId });

      res.status(201).json({
        message: 'Category created successfully',
        category,
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

      // Check if new name conflicts with another category
      if (name && name !== category.name) {
        const existingCategory = await NoteCategory.findOne({
          where: { 
            userId,
            name: { [Op.like]: name },
            id: { [Op.ne]: id }
          }
        });

        if (existingCategory) {
          return res.status(400).json({ 
            message: 'Category with this name already exists' 
          });
        }
      }

      // Update fields
      if (name !== undefined) category.name = name;
      if (color !== undefined) category.color = color;
      if (icon !== undefined) category.icon = icon;

      await category.save();

      // Emit socket event for real-time update
      emitToUser(userId, 'category_updated', category.toJSON());
      emitToAllAdmins('user_category_updated', { ...category.toJSON(), userId });

      res.status(200).json({
        message: 'Category updated successfully',
        category,
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
      emitToUser(userId, 'category_deleted', { id });
      emitToAllAdmins('user_category_deleted', { id, userId });

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
