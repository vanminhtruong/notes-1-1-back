import BaseRepository from './base.repository.js';
import { Message } from '../models/index.js';

/**
 * MessageRepository
 * Repository cho model Message. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của Message.
 */
class MessageRepository extends BaseRepository {
  constructor() {
    super(Message);
  }
}

export default new MessageRepository();
