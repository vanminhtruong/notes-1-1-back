import BaseRepository from './base.repository.js';
import { GroupSharedNote } from '../models/index.js';

/**
 * GroupSharedNoteRepository
 * Repository cho model GroupSharedNote. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của GroupSharedNote.
 */
class GroupSharedNoteRepository extends BaseRepository {
  constructor() {
    super(GroupSharedNote);
  }
}

export default new GroupSharedNoteRepository();
