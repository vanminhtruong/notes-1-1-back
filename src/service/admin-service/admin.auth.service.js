import jwt from 'jsonwebtoken';
import { User } from '../../models/index.js';
import asyncHandler from '../../middlewares/asyncHandler.js';

class AdminAuthChild {
  constructor(parent) {
    this.parent = parent;
  }

  // Admin login
  adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Email không tồn tại', code: 'EMAIL_NOT_FOUND' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Không có quyền truy cập admin', code: 'NOT_ADMIN' });
    }

    if (!user.isActive) {
      return res.status(400).json({ message: 'Tài khoản đã bị vô hiệu hóa', code: 'ACCOUNT_DEACTIVATED' });
    }

    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mật khẩu không đúng', code: 'INVALID_PASSWORD' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Đăng nhập admin thành công',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
      }
    });
  });

  // API để refresh token với permissions mới (cho real-time updates)
  refreshToken = asyncHandler(async (req, res) => {
    const user = req.user; // từ adminAuth middleware

    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Làm mới token thành công',
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminLevel: user.adminLevel,
        adminPermissions: user.adminPermissions || []
      }
    });
  });
}

export default AdminAuthChild;
