import BaseRepository from './base.repository.js';
import { PasswordReset } from '../models/index.js';

/**
 * PasswordResetRepository
 * Repository cho model PasswordReset. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của PasswordReset.
 */
class PasswordResetRepository extends BaseRepository {
  constructor() {
    super(PasswordReset);
  }
}

export default new PasswordResetRepository();
