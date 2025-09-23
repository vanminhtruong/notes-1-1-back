const { User } = require('../../models');
const asyncHandler = require('../../middlewares/asyncHandler');
const { isUserOnline, emitToAllAdmins, emitToUser } = require('../../socket/socketHandler');

class AdminUsersChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Get all users list for admin
  getAllUsers = asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20, 
      search,
      role,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};

    if (search) {
      whereClause[require('sequelize').Op.or] = [
        { name: { [require('sequelize').Op.like]: `%${search}%` } },
        { email: { [require('sequelize').Op.like]: `%${search}%` } }
      ];
    }
    if (role) whereClause.role = role;
    if (isActive !== undefined) {
      const wantActive = isActive === 'true';
      whereClause.isActive = wantActive;
      try {
        const me = req.user;
        const isSuper = me && me.adminLevel === 'super_admin';
        const perms = Array.isArray(me?.adminPermissions) ? me.adminPermissions : [];
        if (wantActive && !isSuper) {
          const hasSpecific = perms.includes('manage_users.view_active_accounts');
          const hasParent = perms.includes('manage_users');
          if (!hasSpecific && !hasParent) {
            return res.status(403).json({
              success: false,
              message: 'Không có quyền xem danh sách tài khoản hoạt động',
              requiredPermission: 'manage_users.view_active_accounts',
            });
          }
        }
      } catch {}
    }

    const users = await User.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'name', 'email', 'role', 'isActive', 'avatar', 'lastSeenAt', 'createdAt'],
      offset,
      limit: limitNum,
      order: [[sortBy, sortOrder]]
    });

    const usersWithOnlineStatus = users.rows.map(user => {
      const userObj = user.toJSON();
      userObj.isOnline = isUserOnline(user.id);
      return userObj;
    });

    res.json({
      success: true,
      users: usersWithOnlineStatus,
      totalUsers: users.count,
      totalPages: Math.ceil(users.count / limitNum),
      currentPage: pageNum
    });
  });

  // Toggle user active status (activate/deactivate)
  toggleUserStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể thay đổi trạng thái tài khoản admin' });
    }

    const newStatus = !user.isActive;
    await user.update({ isActive: newStatus });

    emitToAllAdmins('user_status_changed', {
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: newStatus,
      action: newStatus ? 'activated' : 'deactivated',
      timestamp: new Date().toISOString()
    });

    if (!newStatus) {
      emitToUser(user.id, 'account_deactivated', {
        message: 'Tài khoản của bạn đã bị vô hiệu hóa bởi quản trị viên',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Tài khoản ${newStatus ? 'đã được kích hoạt' : 'đã bị vô hiệu hóa'}`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isActive: newStatus
      }
    });
  });

  // Permanently delete user account
  deleteUserPermanently = asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể xóa tài khoản admin' });
    }

    const userData = { id: user.id, name: user.name, email: user.email };

    await user.destroy();

    emitToAllAdmins('user_deleted_permanently', userData);

    res.json({ message: 'Xóa tài khoản vĩnh viễn thành công', deletedUser: userData });
  });
}

module.exports = AdminUsersChild;
