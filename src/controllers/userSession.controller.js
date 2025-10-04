import UserSessionManagementChild from '../service/userSession-service/userSession.management.service.js';
import UserSessionDeletionChild from '../service/userSession-service/userSession.deletion.service.js';

class UserSessionController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.managementChild = new UserSessionManagementChild(this);
    this.deletionChild = new UserSessionDeletionChild(this);
  }

  // Delegate methods to child services
  getUserSessions = (...args) => this.managementChild.getUserSessions(...args);
  updateSessionActivity = (...args) => this.managementChild.updateSessionActivity(...args);
  deleteSession = (...args) => this.deletionChild.deleteSession(...args);
  deleteAllOtherSessions = (...args) => this.deletionChild.deleteAllOtherSessions(...args);
}

const userSessionController = new UserSessionController();

export default userSessionController;

// Export individual methods for routes
export const getUserSessions = userSessionController.getUserSessions;
export const deleteSession = userSessionController.deleteSession;
export const deleteAllOtherSessions = userSessionController.deleteAllOtherSessions;
export const updateSessionActivity = userSessionController.updateSessionActivity;
