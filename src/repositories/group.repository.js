import BaseRepository from './base.repository.js';
import { Group } from '../models/index.js';

/**
 * GroupRepository
 * Repository cho model Group. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của Group.
 */
class GroupRepository extends BaseRepository {
  constructor() {
    super(Group);
  }
}

export default new GroupRepository();
