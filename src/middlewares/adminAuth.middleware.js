const jwt = require('jsonwebtoken');
const { User } = require('../models');

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

module.exports = { adminAuth };
