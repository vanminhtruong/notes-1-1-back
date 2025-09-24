const { User } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const { Op } = require('sequelize');
const { emitToAllAdmins, emitToUser } = require('../socket/socketHandler');

// Class con kế thừa để xử lý phân quyền admin
class AdminPermissionsController {
  constructor() {}

  // Định nghĩa các quyền có thể cấp (bao gồm nested permissions)
  static AVAILABLE_PERMISSIONS = [
    'manage_users',           // Quản lý người dùng (parent)
    'manage_users.view',      // Xem thông tin người dùng
    'manage_users.view_detail', // Xem chi tiết người dùng (modal chi tiết)
    'manage_users.activate',  // Kích hoạt/vô hiệu hóa người dùng
    'manage_users.view_active_accounts', // Xem tài khoản hoạt động
    'manage_users.delete_permanently',   // Xóa tài khoản vĩnh viễn
    // User Activity sub-permissions (consolidated - covers messages, groups, etc.)
    'manage_users.activity',             // Xem user activity (parent)
    'manage_users.activity.messages',    // Xem tab tin nhắn & quản lý tin nhắn
    'manage_users.activity.messages.recall', // Thu hồi tin nhắn (DM)
    'manage_users.activity.messages.delete', // Xóa tin nhắn (DM)
    'manage_users.activity.groups',      // Xem tab nhóm & quản lý nhóm
    'manage_users.activity.groups.recall',   // Thu hồi tin nhắn nhóm
    'manage_users.activity.groups.delete',   // Xóa tin nhắn nhóm
    'manage_users.activity.friends',     // Xem tab bạn bè
    'manage_users.activity.notifications', // Xem tab thông báo
    'manage_users.activity.notifications.delete', // Xóa thông báo (real-time) trong Notifications Tab
    'manage_users.activity.monitor',     // Xem tab giám sát real-time
    'manage_users.activity.monitor.message_status',        // Theo dõi trạng thái tin nhắn (parent)
    'manage_users.activity.monitor.message_status.sent',   // Theo dõi trạng thái đã gửi
    'manage_users.activity.monitor.message_status.delivered', // Theo dõi trạng thái đã nhận
    'manage_users.activity.monitor.message_status.read',   // Theo dõi trạng thái đã xem
    'manage_notes',           // Quản lý ghi chú (parent)
    'manage_notes.create',    // Tạo ghi chú
    'manage_notes.edit',      // Sửa ghi chú
    'manage_notes.delete',    // Xóa ghi chú
    'manage_notes.view',      // Xem ghi chú
    'manage_admins',          // Quản lý admin khác (chỉ super admin)
    'manage_admins.create',   // Tạo admin
    'manage_admins.edit',     // Sửa quyền admin
    'manage_admins.delete',   // Xóa admin
    'view_analytics',         // Xem thống kê hệ thống
    'delete_content',         // Xóa nội dung
    'system_settings'         // Cài đặt hệ thống
  ];

  // Helper để validate nested permissions
  static validateNestedPermissions(permissions) {
    const validPermissions = [];
    
    permissions.forEach(perm => {
      if (AdminPermissionsController.AVAILABLE_PERMISSIONS.includes(perm)) {
        validPermissions.push(perm);
      }
    });
    
    return validPermissions;
  }

  // Helper để loại bỏ permissions không phù hợp với admin level
  static filterPermissionsByLevel(permissions, adminLevel) {
    let filteredPermissions = [...permissions];
    
    // Sub admin không được có quyền manage_admins và các sub-permissions của nó
    if (adminLevel !== 'super_admin') {
      filteredPermissions = filteredPermissions.filter(p => 
        !p.startsWith('manage_admins')
      );
    }
    
    return filteredPermissions;
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

  // Cập nhật quyền admin
  updateAdminPermissions = asyncHandler(async (req, res) => {
    const { adminId } = req.params;
    const { permissions = [], adminLevel } = req.body;

    const targetAdmin = await User.findOne({
      where: { id: adminId, role: 'admin' }
    });

    if (!targetAdmin) {
      return res.status(404).json({ message: 'Không tìm thấy admin' });
    }

    // Không cho phép tự cập nhật quyền của chính mình
    if (parseInt(adminId) === req.user.id) {
      return res.status(403).json({ message: 'Không thể tự cập nhật quyền của chính mình' });
    }

    // Không cho phép cập nhật super admin khác
    if (targetAdmin.adminLevel === 'super_admin') {
      return res.status(403).json({ message: 'Không thể cập nhật quyền của Super Admin' });
    }

    // Validate và filter permissions theo level mục tiêu (nếu có thay đổi)
    const validPermissions = AdminPermissionsController.validateNestedPermissions(permissions);
    const nextLevel = (adminLevel && req.user.adminLevel === 'super_admin') ? adminLevel : targetAdmin.adminLevel;
    const filteredPermissions = AdminPermissionsController.filterPermissionsByLevel(validPermissions, nextLevel);

    const updateData = {
      adminPermissions: filteredPermissions
    };

    // Chỉ super admin mới có thể thay đổi adminLevel
    if (adminLevel && req.user.adminLevel === 'super_admin') {
      updateData.adminLevel = nextLevel;
    }

    await targetAdmin.update(updateData);

    const updatedAdmin = await User.findByPk(adminId, {
      attributes: ['id', 'name', 'email', 'role', 'adminLevel', 'adminPermissions', 'isActive']
    });

    // Emit real-time event to all admins
    emitToAllAdmins('admin_permissions_updated', {
      admin: updatedAdmin,
      updatedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    // Thông báo cho admin bị cập nhật quyền
    emitToUser(targetAdmin.id, 'permissions_changed', {
      permissions: filteredPermissions,
      adminLevel: targetAdmin.adminLevel,
      message: 'Quyền hạn của bạn đã được cập nhật',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Cập nhật quyền admin thành công',
      admin: updatedAdmin
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

  // Xóa quyền cụ thể của admin (chỉ super admin)
  revokeAdminPermission = asyncHandler(async (req, res) => {
    const { adminId } = req.params;
    const { permission } = req.body;

    const targetAdmin = await User.findOne({
      where: { id: adminId, role: 'admin' }
    });

    if (!targetAdmin) {
      return res.status(404).json({ message: 'Không tìm thấy admin' });
    }

    // Chỉ super admin mới có thể xóa quyền
    if (req.user.adminLevel !== 'super_admin') {
      return res.status(403).json({ message: 'Chỉ Super Admin mới có thể xóa quyền' });
    }

    // Không cho phép tự xóa quyền của chính mình
    if (parseInt(adminId) === req.user.id) {
      return res.status(403).json({ message: 'Không thể tự xóa quyền của chính mình' });
    }

    // Không cho phép xóa quyền của super admin khác
    if (targetAdmin.adminLevel === 'super_admin') {
      return res.status(403).json({ message: 'Không thể xóa quyền của Super Admin' });
    }

    // Xóa permission khỏi danh sách
    let currentPermissions = targetAdmin.adminPermissions || [];
    
    // Nếu xóa parent permission, xóa luôn tất cả sub-permissions
    if (permission && !permission.includes('.')) {
      currentPermissions = currentPermissions.filter(p => 
        p !== permission && !p.startsWith(permission + '.')
      );
    } else {
      // Xóa chỉ permission cụ thể
      currentPermissions = currentPermissions.filter(p => p !== permission);
    }

    await targetAdmin.update({
      adminPermissions: currentPermissions
    });

    const updatedAdmin = await User.findByPk(adminId, {
      attributes: ['id', 'name', 'email', 'role', 'adminLevel', 'adminPermissions', 'isActive']
    });

    // Emit real-time event
    emitToAllAdmins('admin_permission_revoked', {
      admin: updatedAdmin,
      revokedPermission: permission,
      revokedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    // Thông báo cho admin bị xóa quyền
    emitToUser(targetAdmin.id, 'permission_revoked', {
      permission,
      message: `Quyền "${permission}" của bạn đã bị thu hồi`,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Xóa quyền thành công',
      admin: updatedAdmin
    });
  });

  // Toggle admin status (kích hoạt/vô hiệu hóa)
  toggleAdminStatus = asyncHandler(async (req, res) => {
    const { adminId } = req.params;

    const targetAdmin = await User.findOne({
      where: { id: adminId, role: 'admin' }
    });

    if (!targetAdmin) {
      return res.status(404).json({ message: 'Không tìm thấy admin' });
    }

    // Không cho phép tự thay đổi trạng thái
    if (parseInt(adminId) === req.user.id) {
      return res.status(403).json({ message: 'Không thể tự thay đổi trạng thái của chính mình' });
    }

    // Không cho phép thay đổi trạng thái super admin khác
    if (targetAdmin.adminLevel === 'super_admin') {
      return res.status(403).json({ message: 'Không thể thay đổi trạng thái của Super Admin' });
    }

    const newStatus = !targetAdmin.isActive;
    await targetAdmin.update({ isActive: newStatus });

    // Emit real-time events
    emitToAllAdmins('admin_status_changed', {
      adminId: targetAdmin.id,
      name: targetAdmin.name,
      email: targetAdmin.email,
      isActive: newStatus,
      changedBy: req.user.id,
      timestamp: new Date().toISOString()
    });

    if (!newStatus) {
      emitToUser(targetAdmin.id, 'admin_account_deactivated', {
        message: 'Tài khoản admin của bạn đã bị vô hiệu hóa',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: `Admin ${newStatus ? 'đã được kích hoạt' : 'đã bị vô hiệu hóa'}`,
      admin: {
        id: targetAdmin.id,
        name: targetAdmin.name,
        email: targetAdmin.email,
        isActive: newStatus
      }
    });
  });
}

const adminPermissionsController = new AdminPermissionsController();

module.exports = {
  AdminPermissionsController,
  getAllAdmins: adminPermissionsController.getAllAdmins,
  createSubAdmin: adminPermissionsController.createSubAdmin,
  updateAdminPermissions: adminPermissionsController.updateAdminPermissions,
  deleteAdmin: adminPermissionsController.deleteAdmin,
  getMyPermissions: adminPermissionsController.getMyPermissions,
  revokeAdminPermission: adminPermissionsController.revokeAdminPermission,
  toggleAdminStatus: adminPermissionsController.toggleAdminStatus,
};
