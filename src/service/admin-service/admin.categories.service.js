import { User, NoteCategory, Note } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { emitToAllAdmins, emitToUser } from '../../socket/socketHandler.js';

// Child controller để quản lý categories cho admin
class AdminCategoriesChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Lấy tất cả categories của tất cả users (với filter)
  getAllCategories = asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      userId,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};
    
    // Filter by userId if provided
    if (userId) {
      whereClause.userId = userId;
    }

    // Search by category name
    if (search) {
      whereClause.name = { [Op.like]: `%${search}%` };
    }

    // Nếu filter theo userId, sort theo maxSelectionCount để giống users
    const orderClause = userId 
      ? [
          ['maxSelectionCount', 'DESC'],
          ['selectionCount', 'DESC'],
          [sortBy, sortOrder]
        ]
      : [[sortBy, sortOrder]];

    const { count, rows: categories } = await NoteCategory.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ],
      order: orderClause,
      limit: limitNum,
      offset,
    });

    // Get notes count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const notesCount = await Note.count({
          where: { categoryId: category.id }
        });
        return {
          ...category.toJSON(),
          notesCount
        };
      })
    );

    res.json({
      categories: categoriesWithCount,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  });

  // Lấy chi tiết category
  getCategoryDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const category = await NoteCategory.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ]
    });

    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy category' });
    }

    // Get notes count
    const notesCount = await Note.count({
      where: { categoryId: category.id }
    });

    // Get some sample notes
    const sampleNotes = await Note.findAll({
      where: { categoryId: category.id },
      limit: 5,
      attributes: ['id', 'title', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      category: {
        ...category.toJSON(),
        notesCount,
        sampleNotes
      }
    });
  });

  // Tạo category cho user
  createCategoryForUser = asyncHandler(async (req, res) => {
    const { userId, name, color, icon } = req.body;

    if (!userId || !name || !color || !icon) {
      return res.status(400).json({ 
        message: 'userId, name, color và icon là bắt buộc' 
      });
    }

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    // Check duplicate name for this user
    const existingCategory = await NoteCategory.findOne({
      where: {
        userId,
        name
      }
    });

    if (existingCategory) {
      return res.status(400).json({ 
        message: 'Người dùng đã có category với tên này' 
      });
    }

    // Create category
    const category = await NoteCategory.create({
      userId,
      name,
      color,
      icon
    });

    const categoryWithUser = await NoteCategory.findByPk(category.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ]
    });

    // Emit real-time events
    emitToUser(userId, 'category_created', categoryWithUser);
    emitToAllAdmins('admin_category_created', {
      category: categoryWithUser,
      createdBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Tạo category thành công',
      category: categoryWithUser
    });
  });

  // Cập nhật category
  updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, color, icon } = req.body;

    const category = await NoteCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy category' });
    }

    // Check duplicate name for this user (if name is being changed)
    if (name && name !== category.name) {
      const existingCategory = await NoteCategory.findOne({
        where: {
          userId: category.userId,
          name,
          id: { [Op.ne]: id }
        }
      });

      if (existingCategory) {
        return res.status(400).json({ 
          message: 'Người dùng đã có category với tên này' 
        });
      }
    }

    // Update category
    const updateData = {};
    if (name) updateData.name = name;
    if (color) updateData.color = color;
    if (icon) updateData.icon = icon;

    await category.update(updateData);

    const updatedCategory = await NoteCategory.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'avatar']
        }
      ]
    });

    // Emit real-time events
    emitToUser(category.userId, 'category_updated', updatedCategory);
    emitToAllAdmins('admin_category_updated', {
      category: updatedCategory,
      updatedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Cập nhật category thành công',
      category: updatedCategory
    });
  });

  // Xóa category
  deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const category = await NoteCategory.findByPk(id);

    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy category' });
    }

    // Check if category has notes
    const notesCount = await Note.count({
      where: { categoryId: id }
    });

    if (notesCount > 0) {
      // Update notes to remove category
      await Note.update(
        { categoryId: null },
        { where: { categoryId: id } }
      );
    }

    const userId = category.userId;
    await category.destroy();

    // Emit real-time events
    emitToUser(userId, 'category_deleted', { id: parseInt(id) });
    emitToAllAdmins('admin_category_deleted', {
      categoryId: parseInt(id),
      userId,
      deletedBy: req.user.id,
      notesAffected: notesCount,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Xóa category thành công',
      notesAffected: notesCount
    });
  });

  // Lấy thống kê categories
  getCategoriesStats = asyncHandler(async (req, res) => {
    // Total categories
    const totalCategories = await NoteCategory.count();

    // Categories by user
    const categoriesByUser = await NoteCategory.findAll({
      attributes: [
        'userId',
        [NoteCategory.sequelize.fn('COUNT', NoteCategory.sequelize.col('id')), 'count']
      ],
      group: ['userId'],
      order: [[NoteCategory.sequelize.fn('COUNT', NoteCategory.sequelize.col('id')), 'DESC']],
      limit: 10,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    // Most used categories (by notes count)
    const mostUsedCategories = await NoteCategory.findAll({
      limit: 10,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    const categoriesWithNotesCount = await Promise.all(
      mostUsedCategories.map(async (cat) => {
        const notesCount = await Note.count({
          where: { categoryId: cat.id }
        });
        return {
          ...cat.toJSON(),
          notesCount
        };
      })
    );

    const sortedByUsage = categoriesWithNotesCount
      .sort((a, b) => b.notesCount - a.notesCount)
      .slice(0, 10);

    res.json({
      totalCategories,
      categoriesByUser,
      mostUsedCategories: sortedByUsage
    });
  });
}

export default AdminCategoriesChild;
