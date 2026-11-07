import assert from 'node:assert/strict';
import { sequelize, User, Note, NoteTrash, NoteTag, NoteTagMapping } from '../src/models/index.js';
import { moveNoteToTrash, restoreTrashedNote, permanentlyDeleteTrash, purgeExpiredTrash } from '../src/service/notes-service/notes.trash.service.js';

assert.equal(process.env.NODE_ENV, 'test', 'This test must run only against the in-memory database');
try {
  await sequelize.sync({ force: true });
  const user = await User.create({ name: 'Trash Test', email: 'note-trash-test@example.org', password: 'sampleStrongPassword22' });
  const note = await Note.create({ title: 'Restore this note', content: '<p>Keep everything</p>', userId: user.id, priority: 'high' });
  const tag = await NoteTag.create({ name: 'Test', userId: user.id });
  await NoteTagMapping.create({ noteId: note.id, tagId: tag.id });
  const trash = await moveNoteToTrash(note, user.id);
  assert.equal(await Note.count(), 0);
  assert.equal(await NoteTrash.count(), 1);
  assert.equal(JSON.parse(trash.snapshot).note.content, '<p>Keep everything</p>');
  const restored = await restoreTrashedNote(trash);
  assert.equal(restored.title, 'Restore this note');
  assert.equal(restored.content, '<p>Keep everything</p>');
  assert.equal(await NoteTagMapping.count({ where: { noteId: restored.id } }), 1);
  assert.equal(await NoteTrash.count(), 0);
  const trashAgain = await moveNoteToTrash(restored, user.id);
  const deleted = await permanentlyDeleteTrash([trashAgain]);
  assert.equal(deleted.length, 1);
  assert.equal(await NoteTrash.count(), 0);
  const third = await Note.create({ title: 'Expired note', userId: user.id });
  const expired = await moveNoteToTrash(third, user.id);
  await expired.update({ expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await purgeExpiredTrash(), 1);
  assert.equal(await NoteTrash.count(), 0);
  console.log('PASS: soft delete, restore content/tags, permanent delete, 30-day expiry cleanup');
} finally { await sequelize.close(); }
