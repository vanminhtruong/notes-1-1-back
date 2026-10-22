import BaseRepository from './base.repository.js';
import { ChatPreference } from '../models/index.js';

/**
 * ChatPreferenceRepository
 * Repository cho model ChatPreference. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của ChatPreference.
 */
class ChatPreferenceRepository extends BaseRepository {
  constructor() {
    super(ChatPreference);
  }

  /** Tìm tuỳ chọn trò chuyện giữa hai người dùng. */
  findBetween(userId, otherUserId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, otherUserId } });
  }

}

export default new ChatPreferenceRepository();
