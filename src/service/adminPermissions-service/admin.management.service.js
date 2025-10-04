import { User } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { Op } from 'sequelize';
import { emitToAllAdmins, emitToUser } from '../../socket/socketHandler.js';
import { AdminPermissionsController } from '../../controllers/adminPermissions.controller.js';

class AdminManagementChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Lấy danh sách tất cả admin
  getAllAdmins = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, adminLevel } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const offset = (pageNum - 1) * limitNum;

    const whereClause = { role: 'admin' };

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    if (adminLevel) {
      whereClause.adminLevel = adminLevel;
    }

    const { count, rows: admins } = await User.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'name', 'email', 'role', 'adminLevel', 'adminPermissions', 'isActive', 'avatar', 'lastSeenAt', 'createdAt'],
      offset,
      limit: limitNum,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      admins,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
      availablePermissions: AdminPermissionsController.AVAILABLE_PERMISSIONS
    });
  });

  // Tạo admin mới (chỉ super admin)
  createSubAdmin = asyncHandler(async (req, res) => {
    const { email, password, name, permissions = [], adminLevel } = req.body;

    // Kiểm tra email đã tồn tại
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    // Validate và filter permissions
    const validPermissions = AdminPermissionsController.validateNestedPermissions(permissions);
    const allowedLevels = ['sub_admin', 'dev', 'mod'];
    const targetLevel = allowedLevels.includes(adminLevel) ? adminLevel : 'sub_admin';
    const filteredPermissions = AdminPermissionsController.filterPermissionsByLevel(validPermissions, targetLevel);

    const newAdmin = await User.create({
      email,
      password,
      name,
      role: 'admin',
      adminLevel: targetLevel,
      adminPermissions: filteredPermissions,
      isActive: true
    });

    const adminData = {
      id: newAdmin.id,
      name: newAdmin.name,
      email: newAdmin.email,
      role: newAdmin.role,
      adminLevel: newAdmin.adminLevel,
      adminPermissions: newAdmin.adminPermissions,
      isActive: newAdmin.isActive,
      createdAt: newAdmin.createdAt
    };

    // Emit real-time event to all admins
    emitToAllAdmins('admin_created', {
      admin: adminData,
      createdBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      message: 'Tạo phó admin thành công',
      admin: adminData
    });
  });

  // Xóa admin (chỉ super admin)
  deleteAdmin = asyncHandler(async (req, res) => {
    const { adminId } = req.params;

    const targetAdmin = await User.findOne({
      where: { id: adminId, role: 'admin' }
    });

    if (!targetAdmin) {
      return res.status(404).json({ message: 'Không tìm thấy admin' });
    }

    // Không cho phép tự xóa
    if (parseInt(adminId) === req.user.id) {
      return res.status(403).json({ message: 'Không thể tự xóa chính mình' });
    }

    // Không cho phép xóa super admin khác
    if (targetAdmin.adminLevel === 'super_admin') {
      return res.status(403).json({ message: 'Không thể xóa Super Admin' });
    }

    const adminData = {
      id: targetAdmin.id,
      name: targetAdmin.name,
      email: targetAdmin.email
    };

    // Chuyển về user thường thay vì xóa hoàn toàn
    await targetAdmin.update({
      role: 'user',
      adminLevel: null,
      adminPermissions: null
    });

    // Emit real-time events
    emitToAllAdmins('admin_removed', {
      admin: adminData,
      removedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    emitToUser(targetAdmin.id, 'admin_access_revoked', {
      message: 'Quyền truy cập admin của bạn đã bị thu hồi',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Xóa admin thành công',
      admin: adminData
    });
  });

  // Lấy thông tin quyền của admin hiện tại
  getMyPermissions = asyncHandler(async (req, res) => {
    const user = req.user;
    
    res.json({
      success: true,
      admin: {
        id: user.id,
        name: user.name,
        email: user.email,
        adminLevel: user.adminLevel,
        permissions: user.adminPermissions || [],
        isSuperAdmin: user.adminLevel === 'super_admin'
      },
      availablePermissions: AdminPermissionsController.AVAILABLE_PERMISSIONS
    });
  });
}

export default AdminManagementChild;
