import { Note } from '../../models/index.js';

class NotesStatsChild {
  constructor(parent) {
    this.parent = parent;
  }

  getNoteStats = async (req, res) => {
    try {
      const userId = req.user.id;

      const totalNotes = await Note.count({ where: { userId } });
      const archivedNotes = await Note.count({ where: { userId, isArchived: true } });
      const activeNotes = await Note.count({ where: { userId, isArchived: false } });

      const notesByPriority = await Note.findAll({
        where: { userId, isArchived: false },
        attributes: [
          'priority',
          [Note.sequelize.fn('COUNT', Note.sequelize.col('id')), 'count']
        ],
        group: ['priority'],
        raw: true,
      });

      const notesByCategory = await Note.findAll({
        where: { userId, isArchived: false },
        attributes: [
          'category',
          [Note.sequelize.fn('COUNT', Note.sequelize.col('id')), 'count']
        ],
        group: ['category'],
        raw: true,
      });

      res.json({
        stats: {
          total: totalNotes,
          active: activeNotes,
          archived: archivedNotes,
          byPriority: notesByPriority,
          byCategory: notesByCategory,
        },
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  };
}

export default NotesStatsChild;
