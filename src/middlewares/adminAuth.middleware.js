import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Token không được cung cấp' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.id || decoded.userId; // support both shapes
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(401).json({ message: 'Token không hợp lệ' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền truy cập admin' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

// Middleware kiểm tra quyền cụ thể
const requirePermission = (permission) => {
  return (req, res, next) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ message: 'Chưa xác thực' });
    }

    // Super admin có tất cả quyền
    if (user.adminLevel === 'super_admin') {
      return next();
    }

    // Kiểm tra quyền cụ thể cho sub_admin
    const permissions = user.adminPermissions || [];
    
    // Kiểm tra exact match trước
    if (permissions.includes(permission)) {
      return next();
    }
    
    // Kiểm tra parent permission: nếu có parent permission thì có quyền child
    // Ví dụ: yêu cầu 'manage_users.chat_settings.edit', user có 'manage_users.chat_settings' -> OK
    const hasParentPermission = permissions.some(userPerm => {
      // Check if userPerm is a parent of permission
      // e.g., 'manage_users.chat_settings' is parent of 'manage_users.chat_settings.edit'
      return permission.startsWith(userPerm + '.');
    });
    
    if (hasParentPermission) {
      return next();
    }
    
    // Kiểm tra nested permissions: nếu có child permission thì có quyền parent
    // Ví dụ: yêu cầu 'manage_users', user có 'manage_users.view' -> OK
    const hasChildPermission = permissions.some(userPerm => 
      userPerm.startsWith(permission + '.')
    );
    
    if (hasChildPermission) {
      return next();
    }

    return res.status(403).json({ 
      message: 'Không có quyền thực hiện hành động này',
      requiredPermission: permission,
      userPermissions: permissions
    });
  };
};

// Middleware chỉ cho phép super admin
const superAdminOnly = (req, res, next) => {
  const user = req.user;
  
  if (!user || user.adminLevel !== 'super_admin') {
    return res.status(403).json({ message: 'Chỉ Super Admin mới có quyền thực hiện hành động này' });
  }

  next();
};

export { adminAuth, requirePermission, superAdminOnly };
