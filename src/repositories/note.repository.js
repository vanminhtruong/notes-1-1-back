import BaseRepository from './base.repository.js';
import { Note } from '../models/index.js';

/**
 * NoteRepository
 * Repository cho model Note. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của Note.
 */
class NoteRepository extends BaseRepository {
  constructor() {
    super(Note);
  }

  /** Tìm ghi chú thuộc về một người dùng. */
  findByIdForUser(id, userId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, userId } });
  }

}

export default new NoteRepository();
