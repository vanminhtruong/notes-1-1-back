import { UserSession } from '../../models/index.js';
import { Op } from 'sequelize';

class UserSessionManagementChild {
  constructor(parent) {
    this.parent = parent;
  }

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

export default UserSessionManagementChild;
