import { userSessionRepository } from '../../repositories/index.js';
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
      await userSessionRepository.destroy({
        where: {
          userId,
          expiresAt: { [Op.lt]: new Date() }
        }
      });

      // Get all active sessions
      const sessions = await userSessionRepository.findAll({
        where: {
          userId,
          isActive: true,
        },
        order: [['lastActivityAt', 'DESC']],
        attributes: [
          'token', // Used only for isCurrent; never sent back to the client
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
        // Never expose stored JWTs through the sessions endpoint.
        const { token: storedToken, ...publicSession } = sessionData;
        return {
          ...publicSession,
          isCurrent: storedToken === currentToken,
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

      await userSessionRepository.update(
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
