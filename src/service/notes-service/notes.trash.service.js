import { Op } from 'sequelize';
import {
  sequelize, Note, NoteTrash, NoteTagMapping, NoteTag, NoteCategory, NoteFolder,
  SharedNote, GroupSharedNote, Group, GroupMember, Message, GroupMessage, User,
} from '../../models/index.js';
import { emitToUser, emitToAllAdmins } from '../../socket/socketHandler.js';
import { deleteMultipleFiles } from '../../utils/fileHelper.js';

export const TRASH_RETENTION_DAYS = 30;
const TTL_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const validIds = (items) => {
  if (!Array.isArray(items) || items.length > 200 || !items.length ||
      items.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    const error = new Error('Chọn từ 1 đến 200 ghi chú hợp lệ');
    error.status = 400;
    throw error;
  }
  return [...new Set(items.map(Number))];
};

export const moveNoteToTrash = async (note, deletedById) => {
  if (!note) {
    const error = new Error('Không tìm thấy ghi chú');
    error.status = 404;
    throw error;
  }

  const userId = note.userId;
  const id = note.id;
  const folderId = note.folderId;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  const recipients = new Set([userId, deletedById]);
  const shareEvents = [];

  const trash = await sequelize.transaction(async transaction => {
    const tags = await NoteTagMapping.findAll({ where: { noteId: id }, attributes: ['tagId'], transaction });
    const individualShares = await SharedNote.findAll({ where: { noteId: id }, transaction });
    const groupShares = await GroupSharedNote.findAll({ where: { noteId: id }, transaction });
    for (const share of individualShares) {
      recipients.add(share.sharedWithUserId);
      shareEvents.push({ userId: share.sharedWithUserId, event: 'shared_note_removed', payload: { id: share.id, noteId: id, messageId: share.messageId } });
    }
    for (const share of groupShares) {
      const members = await GroupMember.findAll({ where: { groupId: share.groupId }, attributes: ['userId'], transaction });
      for (const member of members) {
        recipients.add(member.userId);
        shareEvents.push({ userId: member.userId, event: 'group_note_removed', payload: { id: share.id, noteId: id } });
      }
    }

    const snapshot = { note: note.get({ plain: true }), tagIds: tags.map(row => row.tagId) };
    const entry = await NoteTrash.create({
      originalNoteId: id,
      userId,
      deletedById,
      title: note.title,
      snapshot: JSON.stringify(snapshot),
      deletedAt: now,
      expiresAt,
    }, { transaction });

    // Remove dependencies before removing the original note. Shared messages are
    // removed, but uploaded media remain intact until permanent deletion/expiry.
    const messageIds = individualShares.map(s => s.messageId).filter(Boolean);
    const groupMessageIds = groupShares.map(s => s.groupMessageId).filter(Boolean);
    await NoteTagMapping.destroy({ where: { noteId: id }, transaction });
    await SharedNote.destroy({ where: { noteId: id }, transaction });
    await GroupSharedNote.destroy({ where: { noteId: id }, transaction });
    if (messageIds.length) await Message.destroy({ where: { id: { [Op.in]: messageIds } }, transaction });
    if (groupMessageIds.length) await GroupMessage.destroy({ where: { id: { [Op.in]: groupMessageIds } }, transaction });
    await Note.destroy({ where: { id }, transaction });
    return entry;
  });

  for (const targetUserId of recipients) {
    if (targetUserId) emitToUser(targetUserId, 'note_deleted', { id, folderId });
  }
  for (const e of shareEvents) emitToUser(e.userId, e.event, e.payload);
  emitToAllAdmins('user_note_deleted', { id, userId, folderId, trashed: true });
  return trash;
};

export const restoreTrashedNote = async (entry) => {
  if (!entry) {
    const error = new Error('Ghi chú không còn trong thùng rác');
    error.status = 404;
    throw error;
  }
  if (new Date(entry.expiresAt).getTime() <= Date.now()) {
    const error = new Error('Ghi chú đã hết hạn khôi phục');
    error.status = 410;
    throw error;
  }

  const result = await sequelize.transaction(async transaction => {
    const { note: original, tagIds = [] } = JSON.parse(entry.snapshot);
    const owner = await User.findByPk(entry.userId, { transaction });
    if (!owner) {
      const error = new Error('Tài khoản chủ sở hữu không còn tồn tại');
      error.status = 404;
      throw error;
    }
    const categoryId = original.categoryId && await NoteCategory.findOne({ where: { id: original.categoryId, userId: entry.userId }, transaction })
      ? original.categoryId : null;
    const folderId = original.folderId && await NoteFolder.findOne({ where: { id: original.folderId, userId: entry.userId }, transaction })
      ? original.folderId : null;
    const fields = { ...original, userId: entry.userId, categoryId, folderId };
    // If an ID was subsequently reused, let SQLite allocate a fresh one.
    if (await Note.findByPk(entry.originalNoteId, { transaction })) delete fields.id;
    const restored = await Note.create(fields, { transaction });
    const availableTags = await NoteTag.findAll({ where: { id: { [Op.in]: tagIds }, userId: entry.userId }, attributes: ['id'], transaction });
    if (availableTags.length) {
      await NoteTagMapping.bulkCreate(availableTags.map(t => ({ noteId: restored.id, tagId: t.id })), { transaction });
    }
    await entry.destroy({ transaction });
    return restored;
  });

  emitToUser(result.userId, 'note_created', result.toJSON());
  emitToAllAdmins('user_note_created', result.toJSON());
  return result;
};

export const permanentlyDeleteTrash = async (entries) => {
  const deleted = [];
  for (const entry of entries) {
    const snapshot = JSON.parse(entry.snapshot);
    // Only delete uploaded files after the database transaction commits.
    const count = await NoteTrash.destroy({ where: { id: entry.id } });
    if (!count) continue;
    const note = snapshot.note || {};
    deleteMultipleFiles([note.imageUrl, note.videoUrl].filter(Boolean));
    deleted.push(entry.id);
  }
  return deleted;
};

export const purgeExpiredTrash = async () => {
  let total = 0;
  for (;;) {
    const expired = await NoteTrash.findAll({ where: { expiresAt: { [Op.lte]: new Date() } }, order: [['expiresAt', 'ASC']], limit: 100 });
    if (!expired.length) break;
    const ids = await permanentlyDeleteTrash(expired);
    total += ids.length;
    if (!ids.length) break;
  }
  return total;
};

const serialize = row => {
  const data = row.toJSON();
  // Snapshot stays server-side (can contain private content).
  delete data.snapshot;
  return data;
};

const list = async (req, res, admin = false) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const userId = admin && req.query.userId ? Number(req.query.userId) : req.user.id;
  if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ message: 'userId không hợp lệ' });
  const where = admin && !req.query.userId ? {} : { userId };
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (search) where.title = { [Op.like]: '%' + search + '%' };
  const { count, rows } = await NoteTrash.findAndCountAll({ where, limit, offset: (page - 1) * limit, order: [['deletedAt', 'DESC']] });
  res.json({ notes: rows.map(serialize), pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) }, retentionDays: TRASH_RETENTION_DAYS });
};

const handle = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    console.error('[NoteTrash]', error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Không thể xử lý thùng rác ghi chú' });
  }
};

const findEntry = async (req, admin) => NoteTrash.findOne({ where: admin ? { id: req.params.id } : { id: req.params.id, userId: req.user.id } });

export const trashController = {
  // Dashboard bulk delete uses one request and serializes SQLite write transactions.
  // Validate the entire selection before moving any note to prevent deleting
  // records outside the signed-in user's account.
  userMoveSelected: handle(async (req, res) => {
    const ids = validIds(req.body?.ids);
    const notes = await Note.findAll({
      where: { id: { [Op.in]: ids }, userId: req.user.id },
    });
    if (notes.length !== ids.length) {
      return res.status(404).json({ message: 'Một số ghi chú không tồn tại hoặc không thuộc tài khoản' });
    }

    const byId = new Map(notes.map(note => [note.id, note]));
    const deletedIds = [];
    try {
      for (const id of ids) {
        await moveNoteToTrash(byId.get(id), req.user.id);
        deletedIds.push(id);
      }
    } catch (error) {
      // Do not claim the whole batch succeeded if SQLite (or other I/O) failed.
      // The client refreshes the list on error to reconcile completed notes.
      console.error('[NoteTrash] Batch interrupted:', error.message);
      return res.status(500).json({
        message: 'Không thể chuyển hết ghi chú vào thùng rác. Hãy tải lại danh sách.',
        deletedIds,
      });
    }

    return res.json({ message: 'Đã chuyển ghi chú vào thùng rác', deletedIds, deletedCount: deletedIds.length });
  }),
  userList: handle((req, res) => list(req, res)),
  adminList: handle((req, res) => list(req, res, true)),
  userRestore: handle(async (req, res) => {
    const restored = await restoreTrashedNote(await findEntry(req, false));
    res.json({ message: 'Khôi phục ghi chú thành công', note: restored });
  }),
  adminRestore: handle(async (req, res) => {
    const restored = await restoreTrashedNote(await findEntry(req, true));
    res.json({ message: 'Khôi phục ghi chú thành công', note: restored });
  }),
  userDelete: handle(async (req, res) => {
    const entry = await findEntry(req, false);
    if (!entry) return res.status(404).json({ message: 'Không tìm thấy ghi chú trong thùng rác' });
    const deleted = await permanentlyDeleteTrash([entry]);
    res.json({ message: 'Đã xóa vĩnh viễn', deletedCount: deleted.length });
  }),
  adminDelete: handle(async (req, res) => {
    const entry = await findEntry(req, true);
    if (!entry) return res.status(404).json({ message: 'Không tìm thấy ghi chú trong thùng rác' });
    const deleted = await permanentlyDeleteTrash([entry]);
    res.json({ message: 'Đã xóa vĩnh viễn', deletedCount: deleted.length });
  }),
  userBatch: handle(async (req, res) => {
    const ids = validIds(req.body.ids);
    const entries = await NoteTrash.findAll({ where: { id: { [Op.in]: ids }, userId: req.user.id } });
    if (entries.length !== ids.length) return res.status(404).json({ message: 'Một số ghi chú không tồn tại hoặc không thuộc tài khoản' });
    const deleted = await permanentlyDeleteTrash(entries);
    res.json({ deletedCount: deleted.length });
  }),
  adminBatch: handle(async (req, res) => {
    const ids = validIds(req.body.ids);
    const entries = await NoteTrash.findAll({ where: { id: { [Op.in]: ids } } });
    if (entries.length !== ids.length) return res.status(404).json({ message: 'Một số ghi chú không tồn tại' });
    const deleted = await permanentlyDeleteTrash(entries);
    res.json({ deletedCount: deleted.length });
  }),
  userClear: handle(async (req, res) => {
    let count = 0;
    for (;;) {
      const entries = await NoteTrash.findAll({ where: { userId: req.user.id }, limit: 100 });
      if (!entries.length) break;
      count += (await permanentlyDeleteTrash(entries)).length;
    }
    res.json({ deletedCount: count });
  }),
  adminClear: handle(async (req, res) => {
    const userId = req.body?.userId == null ? null : Number(req.body.userId);
    if (userId !== null && (!Number.isSafeInteger(userId) || userId <= 0)) return res.status(400).json({ message: 'userId không hợp lệ' });
    let count = 0;
    for (;;) {
      const entries = await NoteTrash.findAll({ where: userId ? { userId } : {}, limit: 100 });
      if (!entries.length) break;
      count += (await permanentlyDeleteTrash(entries)).length;
    }
    res.json({ deletedCount: count });
  }),
};
