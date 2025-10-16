import AdminManagementChild from '../service/adminPermissions-service/admin.management.service.js';
import AdminPermissionsChild from '../service/adminPermissions-service/admin.permissions.service.js';
import AdminStatusChild from '../service/adminPermissions-service/admin.status.service.js';

// Class con kế thừa để xử lý phân quyền admin
class AdminPermissionsController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.managementChild = new AdminManagementChild(this);
    this.permissionsChild = new AdminPermissionsChild(this);
    this.statusChild = new AdminStatusChild(this);
  }

  // Định nghĩa các quyền có thể cấp (bao gồm nested permissions)
  static AVAILABLE_PERMISSIONS = [
    'manage_users',           // Quản lý người dùng (parent)
    'manage_users.view',      // Xem thông tin người dùng
    'manage_users.view_detail', // Xem chi tiết người dùng (modal chi tiết)
    'manage_users.create',    // Tạo tài khoản người dùng mới
    'manage_users.edit',      // Chỉnh sửa thông tin người dùng
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
    'manage_users.activity.notifications.clear_all', // Xóa tất cả thông báo (chỉ super admin hoặc ai được cấp)
    'manage_users.activity.monitor',     // Xem tab giám sát real-time
    'manage_users.activity.monitor.message_status',        // Theo dõi trạng thái tin nhắn (parent)
    'manage_users.activity.monitor.message_status.sent',   // Theo dõi trạng thái đã gửi
    'manage_users.activity.monitor.message_status.delivered', // Theo dõi trạng thái đã nhận
    'manage_users.activity.monitor.message_status.read',   // Theo dõi trạng thái đã xem
    'manage_users.sessions',          // Quản lý sessions/thiết bị đăng nhập (parent)
    'manage_users.sessions.view',     // Xem danh sách thiết bị đăng nhập
    'manage_users.sessions.logout',   // Đăng xuất thiết bị cụ thể
    'manage_users.sessions.logout_all', // Đăng xuất tất cả thiết bị
    // Chat Settings sub-permissions (User-level chat settings: E2EE, Read Status, Privacy)
    'manage_users.chat_settings',           // Quản lý cài đặt chat của users (parent)
    'manage_users.chat_settings.view',      // Xem tất cả cài đặt chat (E2EE, Read Status, Privacy)
    'manage_users.chat_settings.edit',      // Chỉnh sửa cài đặt chat của users
    'manage_notes',           // Quản lý ghi chú (parent)
    'manage_notes.create',    // Tạo ghi chú
    'manage_notes.edit',      // Sửa ghi chú
    'manage_notes.delete',    // Xóa ghi chú
    'manage_notes.view',      // Xem ghi chú
    'manage_notes.view_detail', // Xem chi tiết ghi chú (modal chi tiết)
    'manage_notes.archive',   // Lưu trữ/bỏ lưu trữ ghi chú
    'manage_notes.shared',    // Quản lý ghi chú chia sẻ (parent)
    'manage_notes.shared.view', // Xem danh sách ghi chú chia sẻ
    'manage_notes.shared.edit', // Sửa ghi chú chia sẻ (quyền, tin nhắn)
    'manage_notes.shared.delete', // Xóa ghi chú chia sẻ
    'manage_notes.folders',    // Quản lý thư mục ghi chú (parent)
    'manage_notes.folders.view', // Xem danh sách thư mục
    'manage_notes.folders.view_detail', // Xem chi tiết thư mục và ghi chú bên trong
    'manage_notes.folders.create', // Tạo thư mục cho người dùng
    'manage_notes.folders.edit', // Sửa thư mục
    'manage_notes.folders.delete', // Xóa thư mục
    'manage_notes.folders.move',   // Di chuyển note vào folder
    'manage_notes.folders.notes',  // Quản lý notes trong folder (parent)
    'manage_notes.folders.notes.create', // Tạo note trong folder
    'manage_notes.folders.notes.edit',   // Sửa note trong folder
    'manage_notes.folders.notes.delete', // Xóa note trong folder
    'manage_notes.folders.notes.remove', // Di chuyển note ra khỏi folder
    'manage_notes.categories',    // Quản lý categories ghi chú (parent)
    'manage_notes.categories.view', // Xem danh sách categories của users
    'manage_notes.categories.create', // Tạo category cho user
    'manage_notes.categories.edit', // Sửa category
    'manage_notes.categories.delete', // Xóa category
    'manage_admins',          // Quản lý admin khác (chỉ super admin)
    'manage_admins.create',   // Tạo admin
    'manage_admins.edit',     // Sửa quyền admin
    'manage_admins.delete',   // Xóa admin
    'view_analytics',         // Xem thống kê hệ thống
    'delete_content',         // Xóa nội dung
    'system_settings',        // Cài đặt hệ thống
    // Quyền hồ sơ bản thân (cho phép sub admin xem/sửa trang Profile của chính mình)
    'profile.self.view',
    'profile.self.edit'
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

  // Delegate methods to child services
  getAllAdmins = (...args) => this.managementChild.getAllAdmins(...args);
  createSubAdmin = (...args) => this.managementChild.createSubAdmin(...args);
  deleteAdmin = (...args) => this.managementChild.deleteAdmin(...args);
  getMyPermissions = (...args) => this.managementChild.getMyPermissions(...args);
  updateAdminPermissions = (...args) => this.permissionsChild.updateAdminPermissions(...args);
  revokeAdminPermission = (...args) => this.permissionsChild.revokeAdminPermission(...args);
  toggleAdminStatus = (...args) => this.statusChild.toggleAdminStatus(...args);
}

const adminPermissionsController = new AdminPermissionsController();

export {
  AdminPermissionsController,
};

export const getAllAdmins = adminPermissionsController.getAllAdmins;
export const createSubAdmin = adminPermissionsController.createSubAdmin;
export const updateAdminPermissions = adminPermissionsController.updateAdminPermissions;
export const deleteAdmin = adminPermissionsController.deleteAdmin;
export const getMyPermissions = adminPermissionsController.getMyPermissions;
export const revokeAdminPermission = adminPermissionsController.revokeAdminPermission;
export const toggleAdminStatus = adminPermissionsController.toggleAdminStatus;
