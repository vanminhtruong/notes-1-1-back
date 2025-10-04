import { User } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { emitToAllAdmins, emitToUser } from '../../socket/socketHandler.js';
import { AdminPermissionsController } from '../../controllers/adminPermissions.controller.js';

class AdminPermissionsChild {
  constructor(parent) {
    this.parent = parent;
  }

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
}

export default AdminPermissionsChild;
