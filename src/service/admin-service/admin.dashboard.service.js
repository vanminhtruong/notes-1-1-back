import { User, Note, NoteFolder } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { isUserOnline } from '../../socket/socketHandler.js';

class AdminDashboardService {
  constructor(parentController) {
    this.parent = parentController;
  }

  /**
   * Lấy top users tạo notes nhiều nhất
   */
  getTopNotesCreators = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const topUsers = await Note.findAll({
      attributes: [
        'userId',
        [Note.sequelize.fn('COUNT', Note.sequelize.col('Note.id')), 'notesCount']
      ],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
        where: {
          isActive: true,
          role: 'user' // Chỉ thống kê user, không bao gồm admin
        }
      }],
      group: ['userId', 'user.id'],
      order: [[Note.sequelize.literal('notesCount'), 'DESC']],
      limit: limit,
      subQuery: false
    });

    const formattedData = topUsers.map(item => ({
      userId: item.userId,
      username: item.user?.name || 'Unknown',
      email: item.user?.email || '',
      avatar: item.user?.avatar || '',
      notesCount: parseInt(item.dataValues.notesCount)
    }));

    res.json({
      success: true,
      data: formattedData
    });
  });

  /**
   * Lấy danh sách users online gần nhất
   */
  getRecentOnlineUsers = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const recentUsers = await User.findAll({
      attributes: ['id', 'name', 'email', 'avatar', 'lastSeenAt'],
      where: {
        isActive: true,
        role: 'user', // Chỉ thống kê user, không bao gồm admin
        lastSeenAt: {
          [Op.ne]: null
        }
      },
      order: [['lastSeenAt', 'DESC']],
      limit: limit
    });

    // Kiểm tra isOnline thực tế từ socket connection
    const formattedData = recentUsers.map(user => {
      return {
        userId: user.id,
        username: user.name,
        email: user.email,
        avatar: user.avatar,
        lastOnline: user.lastSeenAt,
        isOnline: isUserOnline(user.id) // Kiểm tra real-time từ socket
      };
    });

    res.json({
      success: true,
      data: formattedData
    });
  });

  /**
   * Lấy top users tạo categories nhiều nhất
   */
  getTopCategoriesCreators = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const { NoteCategory } = await import('../../models/index.js');

    const topUsers = await NoteCategory.findAll({
      attributes: [
        'userId',
        [NoteCategory.sequelize.fn('COUNT', NoteCategory.sequelize.col('NoteCategory.id')), 'categoriesCount']
      ],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'avatar'],
        where: {
          isActive: true,
          role: 'user' // Chỉ thống kê user, không bao gồm admin
        }
      }],
      group: ['userId', 'user.id'],
      order: [[NoteCategory.sequelize.literal('categoriesCount'), 'DESC']],
      limit: limit,
      subQuery: false
    });

    const formattedData = topUsers.map(item => ({
      userId: item.userId,
      username: item.user?.name || 'Unknown',
      email: item.user?.email || '',
      avatar: item.user?.avatar || '',
      categoriesCount: parseInt(item.dataValues.categoriesCount)
    }));

    res.json({
      success: true,
      data: formattedData
    });
  });

  /**
   * Lấy danh sách users offline lâu nhất
   */
  getTopOfflineUsers = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const offlineUsers = await User.findAll({
      attributes: ['id', 'name', 'email', 'avatar', 'lastSeenAt'],
      where: {
        isActive: true,
        role: 'user', // Chỉ thống kê user, không bao gồm admin
        lastSeenAt: {
          [Op.ne]: null
        }
      },
      order: [['lastSeenAt', 'ASC']], // Sắp xếp tăng dần để lấy offline lâu nhất
      limit: limit
    });

    // Tính thời gian offline
    const now = new Date();
    const formattedData = offlineUsers.map(user => {
      const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt) : null;
      const offlineDuration = lastSeen ? now - lastSeen : 0;
      const offlineDays = Math.floor(offlineDuration / (1000 * 60 * 60 * 24));
      
      return {
        userId: user.id,
        username: user.name,
        email: user.email,
        avatar: user.avatar,
        lastSeenAt: user.lastSeenAt,
        offlineDays: offlineDays
      };
    });

    res.json({
      success: true,
      data: formattedData
    });
  });

  /**
   * Lấy thống kê tổng quan cho dashboard
   */
  getDashboardStats = asyncHandler(async (req, res) => {
    const [totalUsers, allActiveUsers, totalNotes, totalFolders, notesInFolders] = await Promise.all([
      User.count({
        where: { 
          isActive: true,
          role: 'user' // Chỉ đếm user, không bao gồm admin
        }
      }),
      User.findAll({
        attributes: ['id'],
        where: { 
          isActive: true,
          role: 'user' // Chỉ đếm user, không bao gồm admin
        }
      }),
      Note.count(),
      NoteFolder.count(),
      Note.count({
        where: {
          folderId: { [Op.ne]: null }
        }
      })
    ]);

    // Đếm users online thực tế từ socket
    const activeUsers = allActiveUsers.filter(user => isUserOnline(user.id)).length;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalNotes,
        totalFolders,
        notesInFolders
      }
    });
  });
}

export default AdminDashboardService;
