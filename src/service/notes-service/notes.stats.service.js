import { Note, NoteFolder } from '../../models/index.js';
import { Op } from 'sequelize';

class NotesStatsChild {
  constructor(parent) {
    this.parent = parent;
  }

  getNoteStats = async (req, res) => {
    try {
      const userId = req.user.id;

      // Only count notes that are NOT in any folder
      const totalNotes = await Note.count({ where: { userId, folderId: null } });
      const archivedNotes = await Note.count({ where: { userId, isArchived: true, folderId: null } });
      const activeNotes = await Note.count({ where: { userId, isArchived: false, folderId: null } });

      // Count folders
      const totalFolders = await NoteFolder.count({ where: { userId } });

      // Count notes in folders
      const notesInFolders = await Note.count({ where: { userId, folderId: { [Op.ne]: null } } });

      const notesByPriority = await Note.findAll({
        where: { userId, isArchived: false, folderId: null },
        attributes: [
          'priority',
          [Note.sequelize.fn('COUNT', Note.sequelize.col('id')), 'count']
        ],
        group: ['priority'],
        raw: true,
      });

      const notesByCategory = await Note.findAll({
        where: { userId, isArchived: false, folderId: null },
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
          totalFolders,
          notesInFolders,
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
