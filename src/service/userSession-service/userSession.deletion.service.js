import { UserSession } from '../../models/index.js';
import { Op } from 'sequelize';

class UserSessionDeletionChild {
  constructor(parent) {
    this.parent = parent;
  }

  /**
   * Delete a specific session (logout from that device)
   */
  deleteSession = async (req, res) => {
    try {
      const userId = req.user.id;
      const sessionId = req.params.sessionId;
      const currentToken = req.token;

      // Find the session
      const session = await UserSession.findOne({
        where: {
          id: sessionId,
          userId,
        }
      });

      if (!session) {
        return res.status(404).json({ message: 'Session không tồn tại' });
      }

      // Check if this is the current session
      const isCurrentSession = session.token === currentToken;

      // Delete the session
      await session.destroy();

      // Emit socket event to notify the user's devices
      try {
        if (global.io) {
          // Emit to all user's devices (they are in user_${userId} room)
          global.io.to(`user_${userId}`).emit('session_revoked', {
            message: 'Phiên đăng nhập của bạn đã bị thu hồi từ thiết bị khác.',
            sessionId,
          });
        }
      } catch (emitErr) {
        console.error('Error emitting session_revoked:', emitErr);
      }

      res.json({ 
        message: 'Đã xóa phiên đăng nhập thành công',
        sessionId,
        isCurrentSession, // Flag to tell frontend to logout
      });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ message: error.message });
    }
  };

  /**
   * Delete all sessions except current one
   */
  deleteAllOtherSessions = async (req, res) => {
    try {
      const userId = req.user.id;
      const currentToken = req.token;

      // Delete all sessions except current
      const deletedCount = await UserSession.destroy({
        where: {
          userId,
          token: { [Op.ne]: currentToken },
        }
      });

      // Emit socket event to force logout all other sessions
      try {
        if (global.io) {
          global.io.to(`user_${userId}`).emit('all_sessions_revoked', {
            message: 'Tất cả phiên đăng nhập khác đã bị thu hồi.',
            exceptToken: currentToken,
          });
        }
      } catch (emitErr) {
        console.error('Error emitting all_sessions_revoked:', emitErr);
      }

      res.json({ 
        message: `Đã xóa ${deletedCount} phiên đăng nhập khác`,
        deletedCount,
      });
    } catch (error) {
      console.error('Error deleting all other sessions:', error);
      res.status(500).json({ message: error.message });
    }
  };
}

export default UserSessionDeletionChild;
