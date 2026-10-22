import BaseRepository from './base.repository.js';
import { Notification } from '../models/index.js';

/**
 * NotificationRepository
 * Repository cho model Notification. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của Notification.
 */
class NotificationRepository extends BaseRepository {
  constructor() {
    super(Notification);
  }

  /** Tìm thông báo theo id trong phạm vi một người dùng. */
  findByIdForUser(id, userId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, userId } });
  }

}

export default new NotificationRepository();
