import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Note } from '../models/index.js';

const PRIVATE_ROOT = path.resolve(process.cwd(), 'data', 'encrypted-notes');
const MAX_BYTES = 105 * 1024 * 1024;
const KIND = new Set(['image', 'video', 'background']);
const FILE_ID = /^[a-f0-9]{32}$/;

export function privateMediaPath(noteId, id) {
  return path.join(PRIVATE_ROOT, String(noteId), id + '.bin');
}
export function privateMediaReference(id) {
  return 'e2ee:' + id;
}
export function isPrivateMediaReference(ref) {
  return typeof ref === 'string' && /^e2ee:[a-f0-9]{32}$/.test(ref);
}
const dbField = kind => kind === 'image' ? 'imageUrl' : kind === 'video' ? 'videoUrl' : 'backgroundImage';
const ownerNote = (req) => Note.findOne({ where: { id: req.params.id, userId: req.user.id } });

/**
 * Stores ciphertext bytes exactly as supplied. It never accepts or handles
 * plaintext media or a key. File is outside public/ and routes are owner-only.
 * Uploaded but uncommitted assets can later be garbage-collected.
 */
export async function uploadEncryptedMedia(req, res) {
  const note = await ownerNote(req);
  if (!note) return res.status(404).json({ message: 'Không tìm thấy ghi chú.' });
  if (!KIND.has(req.params.kind)) return res.status(400).json({ message: 'Loại media không hợp lệ.' });
  const id = crypto.randomBytes(16).toString('hex');
  const folder = path.join(PRIVATE_ROOT, String(note.id));
  await fs.promises.mkdir(folder, { recursive: true });
  const destination = privateMediaPath(note.id, id);
  try {
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BYTES) req.destroy();
    });
    await pipeline(req, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    if (size < 16 || size > MAX_BYTES) throw new Error('Invalid ciphertext length');
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({ id });
  } catch {
    await fs.promises.rm(destination, { force: true }).catch(() => {});
    if (!res.headersSent) return res.status(400).json({ message: 'Không thể lưu tệp mã hóa (tối đa 100 MB).' });
  }
}

export async function downloadEncryptedMedia(req, res) {
  const note = await ownerNote(req);
  if (!note) return res.status(404).json({ message: 'Không tìm thấy ghi chú.' });
  if (!note.isEncrypted || !KIND.has(req.params.kind) || !FILE_ID.test(req.params.assetId)) {
    return res.status(404).json({ message: 'Không tìm thấy tệp.' });
  }
  if (note[dbField(req.params.kind)] !== privateMediaReference(req.params.assetId)) {
    return res.status(404).json({ message: 'Không tìm thấy tệp.' });
  }
  const filePath = privateMediaPath(note.id, req.params.assetId);
  res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  return res.sendFile(filePath, error => {
    if (error && !res.headersSent) res.status(404).json({ message: 'Tệp không tồn tại.' });
  });
}

export async function assertUploadedPrivateAssets(note, refs) {
  for (const kind of KIND) {
    const ref = refs[kind];
    if (ref == null) continue;
    if (!isPrivateMediaReference(ref)) throw new Error('Mã tham chiếu tệp không hợp lệ.');
    const destination = privateMediaPath(note.id, ref.slice(5));
    const stats = await fs.promises.stat(destination).catch(() => null);
    if (!stats?.isFile() || stats.size < 16 || stats.size > MAX_BYTES) throw new Error('Chưa tải lên tệp đã mã hóa.');
  }
}
