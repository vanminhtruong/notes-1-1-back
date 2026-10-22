import BaseRepository from './base.repository.js';
import { MessageReaction } from '../models/index.js';

/**
 * MessageReactionRepository
 * Repository cho model MessageReaction. Kế thừa toàn bộ CRUD từ BaseRepository
 * và bổ sung các truy vấn đặc thù của MessageReaction.
 */
class MessageReactionRepository extends BaseRepository {
  constructor() {
    super(MessageReaction);
  }

  /** Tìm cảm xúc của người dùng trên một tin nhắn 1-1. */
  findReaction(userId, messageId, type, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, messageId, type } });
  }

  /** Tìm cảm xúc của người dùng trên một tin nhắn nhóm. */
  findGroupReaction(userId, groupMessageId, type, options = {}) {
    return this.findOne({ ...options, where: { ...(options.where || {}), userId, groupMessageId, type } });
  }

}

export default new MessageReactionRepository();
