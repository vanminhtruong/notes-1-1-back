import BaseRepository from './base.repository.js';
import { NoteCategory } from '../models/index.js';

/**
 * NoteCategoryRepository
 * Repository cho model NoteCategory. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của NoteCategory.
 */
class NoteCategoryRepository extends BaseRepository {
  constructor() {
    super(NoteCategory);
  }

  /** Tìm danh mục ghi chú thuộc về một người dùng. */
  findByIdForUser(id, userId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, userId } });
  }

  /** Tìm danh mục theo tên trong phạm vi một người dùng. */
  findByNameForUser(userId, name, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, name } });
  }

}

export default new NoteCategoryRepository();
