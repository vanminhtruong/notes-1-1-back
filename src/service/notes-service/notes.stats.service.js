import { noteRepository, noteFolderRepository } from '../../repositories/index.js';
import { Op } from 'sequelize';

class NotesStatsChild {
  constructor(parent) {
    this.parent = parent;
  }

  getNoteStats = async (req, res) => {
    try {
      const userId = req.user.id;

      // Match the Active and Archived lists and active folder contents.
      const totalNotes = await noteRepository.count({ where: { userId, [Op.or]: [{ folderId: null }, { isArchived: true }] } });
      const archivedNotes = await noteRepository.count({ where: { userId, isArchived: true } });
      const activeNotes = await noteRepository.count({ where: { userId, isArchived: false, folderId: null } });

      // Count folders
      const totalFolders = await noteFolderRepository.count({ where: { userId } });

      // Count notes in folders
      const notesInFolders = await noteRepository.count({ where: { userId, isArchived: false, folderId: { [Op.ne]: null } } });

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
          ['categoryId', 'category'],
          [noteRepository.sequelize.fn('COUNT', noteRepository.sequelize.col('id')), 'count']
        ],
        group: ['categoryId'],
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
