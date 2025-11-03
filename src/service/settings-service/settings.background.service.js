import { Background } from '../../models/index.js';
import { Op } from 'sequelize';

class SettingsBackgroundChild {
  constructor(parent) {
    this.parent = parent;
  }

  // GET /api/v1/settings/background/colors?search=query&page=1&limit=10
  getBackgroundColors = async (req, res) => {
    try {
      const { search, page: pageRaw, limit: limitRaw } = req.query || {};
      const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
      const limit = Math.max(parseInt(limitRaw || '10', 10) || 10, 1);

      const whereClause = {
        type: 'color',
        isActive: true,
      };

      if (search && search.trim()) {
        whereClause.label = {
          [Op.like]: `%${search.trim()}%`,
        };
      }

      const { count, rows } = await Background.findAndCountAll({
        where: whereClause,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        limit,
        offset: (page - 1) * limit,
      });

      const items = rows.map(bg => ({
        id: bg.uniqueId,
        color: bg.value,
        label: bg.label,
      }));

      const hasMore = (page * limit) < count;

      return res.json({ items, total: count, page, limit, hasMore });
    } catch (error) {
      console.error('Error getting background colors:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // GET /api/v1/settings/background/images?search=query&page=1&limit=10
  getBackgroundImages = async (req, res) => {
    try {
      const { search, page: pageRaw, limit: limitRaw } = req.query || {};
      const page = Math.max(parseInt(pageRaw || '1', 10) || 1, 1);
      const limit = Math.max(parseInt(limitRaw || '10', 10) || 10, 1);

      const whereClause = {
        type: 'image',
        isActive: true,
      };

      if (search && search.trim()) {
        whereClause.label = {
          [Op.like]: `%${search.trim()}%`,
        };
      }

      const { count, rows } = await Background.findAndCountAll({
        where: whereClause,
        order: [['sortOrder', 'ASC'], ['id', 'ASC']],
        limit,
        offset: (page - 1) * limit,
      });

      const items = rows.map(bg => ({
        id: bg.uniqueId,
        url: bg.value,
        label: bg.label,
      }));

      const hasMore = (page * limit) < count;

      return res.json({ items, total: count, page, limit, hasMore });
    } catch (error) {
      console.error('Error getting background images:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default SettingsBackgroundChild;
