import BaseRepository from './base.repository.js';
import { NoteTag } from '../models/index.js';

/**
 * NoteTagRepository
 * Repository cho model NoteTag. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của NoteTag.
 */
class NoteTagRepository extends BaseRepository {
  constructor() {
    super(NoteTag);
  }
}

export default new NoteTagRepository();
