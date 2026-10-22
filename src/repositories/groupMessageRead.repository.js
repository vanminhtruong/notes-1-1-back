import BaseRepository from './base.repository.js';
import { GroupMessageRead } from '../models/index.js';

/**
 * GroupMessageReadRepository
 * Repository cho model GroupMessageRead. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của GroupMessageRead.
 */
class GroupMessageReadRepository extends BaseRepository {
  constructor() {
    super(GroupMessageRead);
  }
}

export default new GroupMessageReadRepository();
