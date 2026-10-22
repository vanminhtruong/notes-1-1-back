import BaseRepository from './base.repository.js';
import { NoteFolder } from '../models/index.js';

/**
 * NoteFolderRepository
 * Repository cho model NoteFolder. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của NoteFolder.
 */
class NoteFolderRepository extends BaseRepository {
  constructor() {
    super(NoteFolder);
  }

  /** Tìm thư mục ghi chú thuộc về một người dùng. */
  findByIdForUser(id, userId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, userId } });
  }

}

export default new NoteFolderRepository();
