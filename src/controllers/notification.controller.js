import NotificationCoreChild from '../service/notification-service/notification.core.service.js';
import NotificationBellChild from '../service/notification-service/notification.bell.service.js';

class NotificationController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.coreChild = new NotificationCoreChild(this);
    this.bellChild = new NotificationBellChild(this);
  }

  listMyNotifications = (...args) => this.coreChild.listMyNotifications(...args);
  markAllRead = (...args) => this.coreChild.markAllRead(...args);
  bellFeed = (...args) => this.bellChild.bellFeed(...args);
  deleteBellItem = (...args) => this.bellChild.deleteBellItem(...args);
  bellBadge = (...args) => this.bellChild.bellBadge(...args);
}

const notificationController = new NotificationController();

export { NotificationController };

export default notificationController;

// Export individual methods for routes
export const listMyNotifications = notificationController.listMyNotifications;
export const markAllRead = notificationController.markAllRead;
export const bellFeed = notificationController.bellFeed;
export const deleteBellItem = notificationController.deleteBellItem;
export const bellBadge = notificationController.bellBadge;
