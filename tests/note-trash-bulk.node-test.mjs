import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { sequelize, User, Note, NoteTrash, NoteTag, NoteTagMapping } from '../src/models/index.js';
import app from '../src/app.js';

assert.equal(process.env.NODE_ENV, 'test', 'This test may only use an in-memory database');
process.env.JWT_SECRET = 'trash-bulk-test-secret';
await sequelize.sync({ force: true });

try {
  const owner = await User.create({ name: 'Bulk Owner', email: 'bulk-owner@test.example', password: 'password123' });
  const other = await User.create({ name: 'Other User', email: 'bulk-other@test.example', password: 'password123' });
  const bearer = user => 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  const tag = await NoteTag.create({ userId: owner.id, name: 'Important' });
  const notes = await Note.bulkCreate(Array.from({ length: 25 }, (_, i) => ({
    userId: owner.id,
    title: 'Bulk note ' + (i + 1),
    content: 'Preserve this content ' + i,
    priority: i % 2 ? 'high' : 'medium',
  })));
  await NoteTagMapping.create({ noteId: notes[0].id, tagId: tag.id });
  const ids = notes.map(note => note.id);
  const foreign = await Note.create({ userId: other.id, title: 'Foreign note' });

  // Reject cross-account batches completely, without partially deleting the owner's notes.
  const forbidden = await request(app).post('/api/v1/notes/trash/move-selected')
    .set('Authorization', bearer(owner)).send({ ids: [ids[0], foreign.id] });
  assert.equal(forbidden.status, 404, JSON.stringify(forbidden.body));
  assert.equal(await Note.count({ where: { userId: owner.id } }), 25);
  assert.equal(await NoteTrash.count(), 0);

  const response = await request(app).post('/api/v1/notes/trash/move-selected')
    .set('Authorization', bearer(owner)).send({ ids });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.deletedCount, ids.length);
  assert.deepEqual(response.body.deletedIds, ids);
  assert.equal(await Note.count({ where: { userId: owner.id } }), 0);
  assert.equal(await NoteTrash.count({ where: { userId: owner.id } }), 25);
  assert.equal(await Note.count({ where: { userId: other.id } }), 1);

  const bin = await NoteTrash.findOne({ where: { originalNoteId: notes[0].id } });
  assert.equal(JSON.parse(bin.snapshot).tagIds[0], tag.id);
  const restored = await request(app).post('/api/v1/notes/trash/' + bin.id + '/restore')
    .set('Authorization', bearer(owner));
  assert.equal(restored.status, 200);
  assert.equal((await Note.findByPk(notes[0].id)).content, 'Preserve this content 0');
  assert.equal(await NoteTagMapping.count({ where: { noteId: notes[0].id } }), 1);
  console.log('PASS: 25-note batch, no SQLite locks, ownership guard, restored metadata');
} finally {
  await sequelize.close();
}
