import BaseRepository from './base.repository.js';
import { GroupMessage } from '../models/index.js';

/**
 * GroupMessageRepository
 * Repository cho model GroupMessage. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của GroupMessage.
 */
class GroupMessageRepository extends BaseRepository {
  constructor() {
    super(GroupMessage);
  }

  /** Tìm tin nhắn nhóm theo id trong phạm vi một nhóm. */
  findByIdInGroup(id, groupId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, groupId } });
  }

}

export default new GroupMessageRepository();
