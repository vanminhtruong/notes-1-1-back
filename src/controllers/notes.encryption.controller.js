import { Note, SharedNote, GroupSharedNote, User, NoteCategory, NoteTag } from '../models/index.js';
import { emitToUser, emitToAllAdmins } from '../socket/socketHandler.js';
import { assertUploadedPrivateAssets } from './notes.encrypted-media.controller.js';

const PUBLIC_TITLE = '🔒 Ghi chú riêng tư';
// Strict, versioned ciphertext envelope. A structural check is not a cryptographic proof;
// encryption/decryption always takes place in the browser.
const CIPHER_PATTERN = /^E2EE1\.([A-Za-z0-9+/]+={0,2})\.([A-Za-z0-9+/]+={0,2})\.([A-Za-z0-9+/]+={0,2})$/;
function validCiphertext(value) {
  if (typeof value !== 'string' || value.length > 7_500_000) return false;
  const parts = CIPHER_PATTERN.exec(value);
  if (!parts) return false;
  try {
    return Buffer.from(parts[1], 'base64').length === 16 &&
      Buffer.from(parts[2], 'base64').length === 12 &&
      Buffer.from(parts[3], 'base64').length >= 16;
  } catch {
    return false;
  }
}
const includes = [
  { model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar'] },
  { model: NoteCategory, as: 'category', attributes: ['id', 'name', 'color', 'icon'] },
  { model: NoteTag, as: 'tags', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
];

/** Only the owner can enable/rotate/disable E2EE. The server never sees a key. */
export async function changeNoteEncryption(req, res) {
  try {
    const { id } = req.params;
    const { action, ciphertext, title, content, expectedUpdatedAt, mediaRefs, publicMedia, metadata } = req.body || {};
    if (!['encrypt', 'save', 'decrypt'].includes(action)) {
      return res.status(400).json({ message: 'Thao tác mã hóa không hợp lệ.' });
    }
    const note = await Note.findOne({ where: { id, userId: req.user.id } });
    if (!note) return res.status(404).json({ message: 'Không tìm thấy ghi chú thuộc sở hữu của bạn.' });

    if (typeof expectedUpdatedAt !== 'string' || expectedUpdatedAt !== note.updatedAt.toISOString()) {
      return res.status(409).json({ message: 'Ghi chú đã thay đổi. Hãy tải lại trước khi thao tác.' });
    }
    if (action === 'encrypt') {
      if (note.isEncrypted) return res.status(409).json({ message: 'Ghi chú đã được mã hóa.' });
      const [individualCount, groupCount] = await Promise.all([
        SharedNote.count({ where: { noteId: note.id } }),
        GroupSharedNote.count({ where: { noteId: note.id } }),
      ]);
      if (individualCount || groupCount) {
        return res.status(409).json({ message: 'Hãy hủy chia sẻ trước khi bật mã hóa đầu cuối.' });
      }
    } else if (!note.isEncrypted) {
      return res.status(409).json({ message: 'Ghi chú không ở trạng thái mã hóa.' });
    }
    if (action === 'encrypt' || action === 'save') {
      if (!validCiphertext(ciphertext)) return res.status(400).json({ message: 'Bản mã không đúng định dạng E2EE v1.' });
      const refs = mediaRefs && typeof mediaRefs === 'object' && !Array.isArray(mediaRefs) ? mediaRefs : {};
      if (action === 'encrypt') {
        await assertUploadedPrivateAssets(note, refs);
        for (const [kind, current] of [['image', note.imageUrl], ['video', note.videoUrl], ['background', note.backgroundImage]]) {
          if (current && !refs[kind]) return res.status(400).json({ message: 'Thiếu bản mã của media đính kèm: ' + kind });
        }
        await note.update({
          title: PUBLIC_TITLE, content: ciphertext, isEncrypted: true,
          imageUrl: refs.image ?? null, videoUrl: refs.video ?? null,
          backgroundImage: refs.background ?? null, youtubeUrl: null,
        });
      } else {
        const fields = { title: PUBLIC_TITLE, content: ciphertext, isEncrypted: true };
        if (mediaRefs !== undefined) {
          if (!mediaRefs || typeof mediaRefs !== 'object' || Array.isArray(mediaRefs))
            return res.status(400).json({ message: 'Invalid private media references.' });
          if (Object.keys(mediaRefs).some(kind => !['image', 'video', 'background'].includes(kind)))
            return res.status(400).json({ message: 'Unknown private media type.' });
          await assertUploadedPrivateAssets(note, mediaRefs);
          fields.imageUrl = mediaRefs.image ?? null;
          fields.videoUrl = mediaRefs.video ?? null;
          fields.backgroundImage = mediaRefs.background ?? null;
        }
        if (metadata !== undefined) {
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
              Object.keys(metadata).some(key => !['categoryId', 'priority', 'reminderAt'].includes(key))) {
            return res.status(400).json({ message: 'Invalid note metadata.' });
          }
          if (metadata.priority !== undefined) {
            if (!['low', 'medium', 'high'].includes(metadata.priority)) return res.status(400).json({ message: 'Invalid priority.' });
            fields.priority = metadata.priority;
          }
          if (metadata.categoryId !== undefined) {
            if (metadata.categoryId !== null) {
              if (!Number.isInteger(metadata.categoryId)) return res.status(400).json({ message: 'Invalid category.' });
              const category = await NoteCategory.findOne({ where: { id: metadata.categoryId, userId: note.userId } });
              if (!category) return res.status(400).json({ message: 'Category not found.' });
            }
            fields.categoryId = metadata.categoryId;
          }
          if (metadata.reminderAt !== undefined) {
            const nextReminder = metadata.reminderAt == null ? null : new Date(metadata.reminderAt);
            if (nextReminder && Number.isNaN(nextReminder.getTime()))
              return res.status(400).json({ message: 'Invalid reminder date.' });
            const before = note.reminderAt ? new Date(note.reminderAt).getTime() : null;
            const after = nextReminder?.getTime() ?? null;
            if (before !== after) {
              fields.reminderSent = false;
              fields.reminderAcknowledged = false;
            }
            fields.reminderAt = nextReminder;
          }
        }
        await note.update(fields);
      }
    } else {
      if (typeof title !== 'string' || !title.trim() || title.length > 200 || typeof content !== 'string' || content.length > 5_000_000) {
        return res.status(400).json({ message: 'Nội dung giải mã không hợp lệ.' });
      }
      const publicRefs = publicMedia && typeof publicMedia === 'object' && !Array.isArray(publicMedia) ? publicMedia : {};
      // Plaintext media uploads are an explicit opt-out of E2EE.
      for (const kind of ['image', 'video', 'background']) {
        const value = publicRefs[kind];
        if (value != null && (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\//.test(value) && !value.startsWith('/uploads/'))) {
          return res.status(400).json({ message: 'Đường dẫn media không hợp lệ.' });
        }
      }
      await note.update({
        title: title.trim(), content, isEncrypted: false,
        imageUrl: publicRefs.image ?? null, videoUrl: publicRefs.video ?? null,
        backgroundImage: publicRefs.background ?? null,
        youtubeUrl: typeof publicRefs.youtube === 'string' ? publicRefs.youtube.slice(0, 2048) : null,
      });
    }
    const updatedNote = await Note.findByPk(note.id, { include: includes });
    emitToUser(note.userId, 'note_updated', updatedNote);
    emitToAllAdmins('user_note_updated', updatedNote);
    res.set('Cache-Control', 'no-store');
    return res.json({ message: 'Đã cập nhật trạng thái bảo mật ghi chú.', note: updatedNote });
  } catch (error) {
    return res.status(400).json({ message: 'Không thể cập nhật mã hóa ghi chú.' });
  }
}
