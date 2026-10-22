import BaseRepository from './base.repository.js';
import { SharedNote } from '../models/index.js';

/**
 * SharedNoteRepository
 * Repository cho model SharedNote. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của SharedNote.
 */
class SharedNoteRepository extends BaseRepository {
  constructor() {
    super(SharedNote);
  }

  /** Tìm bản ghi chia sẻ ghi chú đang hoạt động tới một người dùng. */
  findByNoteAndUser(noteId, sharedWithUserId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), noteId, sharedWithUserId, isActive: true } });
  }

}

export default new SharedNoteRepository();
