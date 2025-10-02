import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid token or user deactivated.' });
    }

    req.user = user;
    req.token = token; // Save token for session management
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

export default authMiddleware;
