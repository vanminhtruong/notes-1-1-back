import { Background } from '../../models/index.js';
import { Op } from 'sequelize';
import { emitToAllAdmins } from '../../socket/socketHandler.js';

class AdminBackgroundsService {
  // GET /api/v1/admin/backgrounds/colors?page=1&limit=10&search=&category=&isActive=
  getColors = async (req, res) => {
    try {
      const { page: pageRaw, limit: limitRaw, search, category, isActive } = req.query || {};
      const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
      const limit = Math.max(parseInt(limitRaw || '8', 10) || 8, 1);

      const whereClause = {
        type: 'color', // Chỉ lấy colors
      };

      // Filter by search (label or uniqueId)
      if (search && search.trim()) {
        whereClause[Op.or] = [
          { label: { [Op.like]: `%${search.trim()}%` } },
          { uniqueId: { [Op.like]: `%${search.trim()}%` } },
        ];
      }

      // Filter by category
      if (category && category.trim()) {
        whereClause.category = category.trim();
      }

      // Filter by isActive
      if (isActive !== undefined && isActive !== '') {
        whereClause.isActive = isActive === 'true' || isActive === true;
      }

      const { count, rows } = await Background.findAndCountAll({
        where: whereClause,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      });

      const totalPages = Math.ceil(count / limit);

      return res.json({
        backgrounds: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error getting colors:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // POST /api/v1/admin/backgrounds/colors
  createColor = async (req, res) => {
    try {
      const { uniqueId, value, label, category, sortOrder, isActive } = req.body;

      // Check if uniqueId already exists
      const existingBackground = await Background.findOne({ where: { uniqueId } });
      if (existingBackground) {
        return res.status(400).json({ message: 'UniqueId already exists' });
      }

      const background = await Background.create({
        uniqueId,
        type: 'color', // Force type to color
        value,
        label,
        category: category || 'basic',
        sortOrder: sortOrder !== undefined ? sortOrder : 0,
        isActive: isActive !== undefined ? isActive : true,
      });

      // Emit real-time events
      emitToAllAdmins('background_created', background);
      if (global.io) {
        global.io.emit('background_created', background);
      }

      return res.status(201).json({
        message: 'Color background created successfully',
        background,
      });
    } catch (error) {
      console.error('Error creating color:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // GET /api/v1/admin/backgrounds/images?page=1&limit=10&search=&category=&isActive=
  getImages = async (req, res) => {
    try {
      const { page: pageRaw, limit: limitRaw, search, category, isActive } = req.query || {};
      const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
      const limit = Math.max(parseInt(limitRaw || '8', 10) || 8, 1);

      const whereClause = {
        type: 'image', // Chỉ lấy images
      };

      // Filter by search (label or uniqueId)
      if (search && search.trim()) {
        whereClause[Op.or] = [
          { label: { [Op.like]: `%${search.trim()}%` } },
          { uniqueId: { [Op.like]: `%${search.trim()}%` } },
        ];
      }

      // Filter by category
      if (category && category.trim()) {
        whereClause.category = category.trim();
      }

      // Filter by isActive
      if (isActive !== undefined && isActive !== '') {
        whereClause.isActive = isActive === 'true' || isActive === true;
      }

      const { count, rows } = await Background.findAndCountAll({
        where: whereClause,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      });

      const totalPages = Math.ceil(count / limit);

      return res.json({
        backgrounds: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error getting images:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // POST /api/v1/admin/backgrounds/images
  createImage = async (req, res) => {
    try {
      const { uniqueId, value, label, category, sortOrder, isActive } = req.body;

      // Check if uniqueId already exists
      const existingBackground = await Background.findOne({ where: { uniqueId } });
      if (existingBackground) {
        return res.status(400).json({ message: 'UniqueId already exists' });
      }

      const background = await Background.create({
        uniqueId,
        type: 'image', // Force type to image
        value,
        label,
        category: category || 'basic',
        sortOrder: sortOrder !== undefined ? sortOrder : 0,
        isActive: isActive !== undefined ? isActive : true,
      });

      // Emit real-time events
      emitToAllAdmins('background_created', background);
      if (global.io) {
        global.io.emit('background_created', background);
      }

      return res.status(201).json({
        message: 'Image background created successfully',
        background,
      });
    } catch (error) {
      console.error('Error creating image:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // GET /api/v1/admin/backgrounds (deprecated - for backward compatibility)
  getBackgrounds = async (req, res) => {
    try {
      const { page: pageRaw, limit: limitRaw, search, type, category, isActive } = req.query || {};
      const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
      const limit = Math.max(parseInt(limitRaw || '10', 10) || 10, 1);

      const whereClause = {};

      // Filter by search (label or uniqueId)
      if (search && search.trim()) {
        whereClause[Op.or] = [
          { label: { [Op.like]: `%${search.trim()}%` } },
          { uniqueId: { [Op.like]: `%${search.trim()}%` } },
        ];
      }

      // Filter by type
      if (type && ['color', 'image'].includes(type)) {
        whereClause.type = type;
      }

      // Filter by category
      if (category && category.trim()) {
        whereClause.category = category.trim();
      }

      // Filter by isActive
      if (isActive !== undefined && isActive !== '') {
        whereClause.isActive = isActive === 'true' || isActive === true;
      }

      const { count, rows } = await Background.findAndCountAll({
        where: whereClause,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        limit,
        offset: (page - 1) * limit,
      });

      const totalPages = Math.ceil(count / limit);

      return res.json({
        backgrounds: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages,
        },
      });
    } catch (error) {
      console.error('Error getting backgrounds:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // GET /api/v1/admin/backgrounds/:id
  getBackgroundById = async (req, res) => {
    try {
      const { id } = req.params;

      const background = await Background.findByPk(id);

      if (!background) {
        return res.status(404).json({ message: 'Background not found' });
      }

      return res.json({ background });
    } catch (error) {
      console.error('Error getting background by id:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // POST /api/v1/admin/backgrounds
  createBackground = async (req, res) => {
    try {
      const { uniqueId, type, value, label, category, sortOrder, isActive } = req.body;

      // Check if uniqueId already exists
      const existingBackground = await Background.findOne({ where: { uniqueId } });
      if (existingBackground) {
        return res.status(400).json({ message: 'UniqueId already exists' });
      }

      const background = await Background.create({
        uniqueId,
        type,
        value,
        label,
        category: category || 'basic',
        sortOrder: sortOrder !== undefined ? sortOrder : 0,
        isActive: isActive !== undefined ? isActive : true,
      });

      return res.status(201).json({
        message: 'Background created successfully',
        background,
      });
    } catch (error) {
      console.error('Error creating background:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // PUT /api/v1/admin/backgrounds/:id
  updateBackground = async (req, res) => {
    try {
      const { id } = req.params;
      const { uniqueId, type, value, label, category, sortOrder, isActive } = req.body;

      const background = await Background.findByPk(id);

      if (!background) {
        return res.status(404).json({ message: 'Background not found' });
      }

      // Check if uniqueId is being changed and already exists
      if (uniqueId && uniqueId !== background.uniqueId) {
        const existingBackground = await Background.findOne({ where: { uniqueId } });
        if (existingBackground) {
          return res.status(400).json({ message: 'UniqueId already exists' });
        }
      }

      await background.update({
        uniqueId: uniqueId !== undefined ? uniqueId : background.uniqueId,
        type: type !== undefined ? type : background.type,
        value: value !== undefined ? value : background.value,
        label: label !== undefined ? label : background.label,
        category: category !== undefined ? category : background.category,
        sortOrder: sortOrder !== undefined ? sortOrder : background.sortOrder,
        isActive: isActive !== undefined ? isActive : background.isActive,
      });

      // Emit real-time events
      emitToAllAdmins('background_updated', background);
      if (global.io) {
        global.io.emit('background_updated', background);
      }

      return res.json({
        message: 'Background updated successfully',
        background,
      });
    } catch (error) {
      console.error('Error updating background:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // DELETE /api/v1/admin/backgrounds/:id
  deleteBackground = async (req, res) => {
    try {
      const { id } = req.params;

      const background = await Background.findByPk(id);

      if (!background) {
        return res.status(404).json({ message: 'Background not found' });
      }

      const deletedBackground = background.toJSON();
      await background.destroy();

      // Emit real-time events
      emitToAllAdmins('background_deleted', { id: deletedBackground.id });
      if (global.io) {
        global.io.emit('background_deleted', { id: deletedBackground.id });
      }

      return res.json({ message: 'Background deleted successfully' });
    } catch (error) {
      console.error('Error deleting background:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // PATCH /api/v1/admin/backgrounds/:id/toggle-active
  toggleActive = async (req, res) => {
    try {
      const { id } = req.params;

      const background = await Background.findByPk(id);

      if (!background) {
        return res.status(404).json({ message: 'Background not found' });
      }

      await background.update({ isActive: !background.isActive });

      // Emit real-time events
      emitToAllAdmins('background_updated', background);
      if (global.io) {
        global.io.emit('background_updated', background);
      }

      return res.json({
        message: `Background ${background.isActive ? 'activated' : 'deactivated'} successfully`,
        background,
      });
    } catch (error) {
      console.error('Error toggling background active status:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default AdminBackgroundsService;
