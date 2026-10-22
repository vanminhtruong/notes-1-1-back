import { noteRepository, noteFolderRepository } from '../../repositories/index.js';
import { Op } from 'sequelize';

class NotesStatsChild {
  constructor(parent) {
    this.parent = parent;
  }

  getNoteStats = async (req, res) => {
    try {
      const userId = req.user.id;

      // Only count notes that are NOT in any folder
      const totalNotes = await noteRepository.count({ where: { userId, folderId: null } });
      const archivedNotes = await noteRepository.count({ where: { userId, isArchived: true, folderId: null } });
      const activeNotes = await noteRepository.count({ where: { userId, isArchived: false, folderId: null } });

      // Count folders
      const totalFolders = await noteFolderRepository.count({ where: { userId } });

      // Count notes in folders
      const notesInFolders = await noteRepository.count({ where: { userId, folderId: { [Op.ne]: null } } });

      const notesByPriority = await noteRepository.findAll({
        where: { userId, isArchived: false, folderId: null },
        attributes: [
          'priority',
          [noteRepository.sequelize.fn('COUNT', noteRepository.sequelize.col('id')), 'count']
        ],
        group: ['priority'],
        raw: true,
      });

      const notesByCategory = await noteRepository.findAll({
        where: { userId, isArchived: false, folderId: null },
        attributes: [
          'category',
          [noteRepository.sequelize.fn('COUNT', noteRepository.sequelize.col('id')), 'count']
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
