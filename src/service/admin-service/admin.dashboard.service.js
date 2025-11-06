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
   * Lấy top users chat nhiều nhất (tính cả tin nhắn 1-1 và nhóm)
   */
  getTopChatUsers = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const { Message, GroupMessage } = await import('../../models/index.js');

    // Đếm tin nhắn 1-1
    const dmCounts = await Message.findAll({
      attributes: [
        'senderId',
        [Message.sequelize.fn('COUNT', Message.sequelize.col('Message.id')), 'messageCount']
      ],
      include: [{
        model: User,
        as: 'sender',
        attributes: ['id', 'name', 'email', 'avatar'],
        where: {
          isActive: true,
          role: 'user'
        }
      }],
      group: ['senderId', 'sender.id'],
      raw: true,
      nest: true
    });

    // Đếm tin nhắn nhóm
    const groupCounts = await GroupMessage.findAll({
      attributes: [
        'senderId',
        [GroupMessage.sequelize.fn('COUNT', GroupMessage.sequelize.col('GroupMessage.id')), 'messageCount']
      ],
      include: [{
        model: User,
        as: 'sender',
        attributes: ['id', 'name', 'email', 'avatar'],
        where: {
          isActive: true,
          role: 'user'
        }
      }],
      group: ['senderId', 'sender.id'],
      raw: true,
      nest: true
    });

    // Gộp và tính tổng
    const userMessageMap = new Map();
    
    dmCounts.forEach(item => {
      const userId = item.senderId;
      const count = parseInt(item.messageCount) || 0;
      if (!userMessageMap.has(userId)) {
        userMessageMap.set(userId, {
          userId,
          username: item.sender?.name || 'Unknown',
          email: item.sender?.email || '',
          avatar: item.sender?.avatar || '',
          messagesCount: 0
        });
      }
      userMessageMap.get(userId).messagesCount += count;
    });

    groupCounts.forEach(item => {
      const userId = item.senderId;
      const count = parseInt(item.messageCount) || 0;
      if (!userMessageMap.has(userId)) {
        userMessageMap.set(userId, {
          userId,
          username: item.sender?.name || 'Unknown',
          email: item.sender?.email || '',
          avatar: item.sender?.avatar || '',
          messagesCount: 0
        });
      }
      userMessageMap.get(userId).messagesCount += count;
    });

    // Sắp xếp và lấy top
    const topUsers = Array.from(userMessageMap.values())
      .sort((a, b) => b.messagesCount - a.messagesCount)
      .slice(0, limit);

    res.json({
      success: true,
      data: topUsers
    });
  });

  /**
   * Lấy top users chia sẻ ghi chú nhiều nhất
   */
  getTopNoteSharers = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;

    const { SharedNote } = await import('../../models/index.js');

    const topUsers = await SharedNote.findAll({
      attributes: [
        'sharedByUserId',
        [SharedNote.sequelize.fn('COUNT', SharedNote.sequelize.col('SharedNote.id')), 'sharedCount']
      ],
      include: [{
        model: User,
        as: 'sharedByUser', // Chỉ định alias đúng
        attributes: ['id', 'name', 'email', 'avatar'],
        where: {
          isActive: true,
          role: 'user' // Chỉ thống kê user, không bao gồm admin
        }
      }],
      group: ['sharedByUserId', 'sharedByUser.id'],
      order: [[SharedNote.sequelize.literal('sharedCount'), 'DESC']],
      limit: limit,
      subQuery: false
    });

    const formattedData = topUsers.map(item => ({
      userId: item.sharedByUserId,
      username: item.sharedByUser?.name || 'Unknown',
      email: item.sharedByUser?.email || '',
      avatar: item.sharedByUser?.avatar || '',
      sharedCount: parseInt(item.dataValues.sharedCount)
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
