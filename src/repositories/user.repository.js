import BaseRepository from './base.repository.js';
import { User } from '../models/index.js';

/**
 * UserRepository
 * Repository cho model User. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của User.
 */
class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  /** Tìm người dùng theo email. */
  findByEmail(email, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), email } });
  }

  /** Tìm người dùng theo số điện thoại. */
  findByPhone(phone, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), phone } });
  }

  /** Tìm quản trị viên đang hoạt động theo id. */
  findAdminById(id, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), id, role: 'admin' } });
  }

  /** Lấy danh sách quản trị viên đang hoạt động. */
  findActiveAdmins(options = {}) {
    return this.findAll({ ...options, where: { ...(options.where || {}), role: 'admin', isActive: true } });
  }

}

export default new UserRepository();
