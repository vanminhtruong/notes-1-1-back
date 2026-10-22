import BaseRepository from './base.repository.js';
import { PinnedChat } from '../models/index.js';

/**
 * PinnedChatRepository
 * Repository cho model PinnedChat. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của PinnedChat.
 */
class PinnedChatRepository extends BaseRepository {
  constructor() {
    super(PinnedChat);
  }

  /** Tìm chat ghim với một người dùng. */
  findPinnedUser(userId, pinnedUserId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, pinnedUserId } });
  }

  /** Tìm chat ghim với một nhóm. */
  findPinnedGroup(userId, pinnedGroupId, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, pinnedGroupId } });
  }

}

export default new PinnedChatRepository();
