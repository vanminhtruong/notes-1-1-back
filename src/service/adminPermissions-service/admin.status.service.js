import { User } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';
import { emitToAllAdmins, emitToUser } from '../../socket/socketHandler.js';

class AdminStatusChild {
  constructor(parent) {
    this.parent = parent;
  }

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

export default AdminStatusChild;
