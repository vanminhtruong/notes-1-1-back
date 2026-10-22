import BaseRepository from './base.repository.js';
import { MessageRead } from '../models/index.js';

/**
 * MessageReadRepository
 * Repository cho model MessageRead. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của MessageRead.
 */
class MessageReadRepository extends BaseRepository {
  constructor() {
    super(MessageRead);
  }
}

export default new MessageReadRepository();
