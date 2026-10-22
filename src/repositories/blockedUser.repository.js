import BaseRepository from './base.repository.js';
import { BlockedUser } from '../models/index.js';

/**
 * BlockedUserRepository
 * Repository cho model BlockedUser. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của BlockedUser.
 */
class BlockedUserRepository extends BaseRepository {
  constructor() {
    super(BlockedUser);
  }

  /** Tìm bản ghi chặn theo cặp người chặn / người bị chặn. */
  findBlock(userId, blockedUserId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, blockedUserId } });
  }

}

export default new BlockedUserRepository();
