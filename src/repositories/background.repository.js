import BaseRepository from './base.repository.js';
import { Background } from '../models/index.js';

/**
 * BackgroundRepository
 * Repository cho model Background. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của Background.
 */
class BackgroundRepository extends BaseRepository {
  constructor() {
    super(Background);
  }

  /** Tìm background theo uniqueId. */
  findByUniqueId(uniqueId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), uniqueId } });
  }

}

export default new BackgroundRepository();
