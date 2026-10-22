import BaseRepository from './base.repository.js';
import { PinnedMessage } from '../models/index.js';

/**
 * PinnedMessageRepository
 * Repository cho model PinnedMessage. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của PinnedMessage.
 */
class PinnedMessageRepository extends BaseRepository {
  constructor() {
    super(PinnedMessage);
  }
}

export default new PinnedMessageRepository();
