import BaseRepository from './base.repository.js';
import { GroupInvite } from '../models/index.js';

/**
 * GroupInviteRepository
 * Repository cho model GroupInvite. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của GroupInvite.
 */
class GroupInviteRepository extends BaseRepository {
  constructor() {
    super(GroupInvite);
  }

  /** Tìm lời mời vào nhóm đang chờ xử lý. */
  findPendingInvite(id, groupId, inviteeId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, groupId, inviteeId, status: 'pending' } });
  }

}

export default new GroupInviteRepository();
