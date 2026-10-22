import BaseRepository from './base.repository.js';
import { Friendship } from '../models/index.js';

/**
 * FriendshipRepository
 * Repository cho model Friendship. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của Friendship.
 */
class FriendshipRepository extends BaseRepository {
  constructor() {
    super(Friendship);
  }

  /** Tìm lời mời kết bạn đang chờ mà người nhận có thể xử lý. */
  findPendingRequest(id, addresseeId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, addresseeId, status: 'pending' } });
  }

}

export default new FriendshipRepository();
