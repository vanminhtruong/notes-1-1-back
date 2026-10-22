import BaseRepository from './base.repository.js';
import { NoteTagMapping } from '../models/index.js';

/**
 * NoteTagMappingRepository
 * Repository cho model NoteTagMapping. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của NoteTagMapping.
 */
class NoteTagMappingRepository extends BaseRepository {
  constructor() {
    super(NoteTagMapping);
  }
}

export default new NoteTagMappingRepository();
