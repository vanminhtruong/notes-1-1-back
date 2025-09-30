const { UserSession } = require('../models');
const { Op } = require('sequelize');

class UserSessionController {
  /**
   * Get all active sessions for current user
   */
  getUserSessions = async (req, res) => {
    try {
      const userId = req.user.id;
      const currentToken = req.token; // From auth middleware

      // Clean up expired sessions first
      await UserSession.destroy({
        where: {
          userId,
          expiresAt: { [Op.lt]: new Date() }
        }
      });

      // Get all active sessions
      const sessions = await UserSession.findAll({
        where: {
          userId,
          isActive: true,
        },
        order: [['lastActivityAt', 'DESC']],
        attributes: [
          'id',
          'deviceType',
          'deviceName',
          'browser',
          'os',
          'ipAddress',
          'location',
          'lastActivityAt',
          'createdAt',
          'expiresAt',
        ]
      });

      // Mark current session
      const sessionsWithCurrent = sessions.map(session => {
        const sessionData = session.toJSON();
        // Check if this is the current session by comparing token
        return {
          ...sessionData,
          isCurrent: session.token === currentToken,
        };
      });

      res.json({
        sessions: sessionsWithCurrent,
        total: sessionsWithCurrent.length,
      });
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      res.status(500).json({ message: error.message });
    }
  };

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

      // Prevent deleting current session
      if (session.token === currentToken) {
        return res.status(400).json({ 
          message: 'Không thể xóa phiên đăng nhập hiện tại. Vui lòng sử dụng chức năng đăng xuất.' 
        });
      }

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

  /**
   * Update last activity time for current session
   */
  updateSessionActivity = async (req, res) => {
    try {
      const currentToken = req.token;

      await UserSession.update(
        { lastActivityAt: new Date() },
        {
          where: {
            token: currentToken,
            isActive: true,
          }
        }
      );

      res.json({ message: 'Activity updated' });
    } catch (error) {
      console.error('Error updating session activity:', error);
      res.status(500).json({ message: error.message });
    }
  };
}

module.exports = new UserSessionController();
