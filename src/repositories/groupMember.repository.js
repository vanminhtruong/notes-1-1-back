import BaseRepository from './base.repository.js';
import { GroupMember } from '../models/index.js';

/**
 * GroupMemberRepository
 * Repository cho model GroupMember. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của GroupMember.
 */
class GroupMemberRepository extends BaseRepository {
  constructor() {
    super(GroupMember);
  }

  /** Tìm tư cách thành viên của một người dùng trong nhóm. */
  findMembership(groupId, userId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), groupId, userId } });
  }

  /** Lấy toàn bộ thành viên của một nhóm. */
  findByGroup(groupId, options = {}) {
    return this.findAll({ ...options, where: { ...(options.where || {}), groupId } });
  }

}

export default new GroupMemberRepository();
