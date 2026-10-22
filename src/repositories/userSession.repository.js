import BaseRepository from './base.repository.js';
import { UserSession } from '../models/index.js';

/**
 * UserSessionRepository
 * Repository cho model UserSession. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của UserSession.
 */
class UserSessionRepository extends BaseRepository {
  constructor() {
    super(UserSession);
  }

  /** Tìm phiên đăng nhập theo id trong phạm vi một người dùng. */
  findByIdForUser(id, userId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, userId } });
  }

}

export default new UserSessionRepository();
