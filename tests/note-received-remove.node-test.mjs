import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { sequelize, User, Note, SharedNote } from '../src/models/index.js';
import app from '../src/app.js';

assert.equal(process.env.NODE_ENV, 'test', 'Only use the isolated in-memory test DB.');
process.env.JWT_SECRET = 'received-note-removal-test';
await sequelize.sync({ force: true });
try {
  const owner = await User.create({ name: 'Shared note owner', email: 'shared-owner@example.test', password: 'strong-pass-123' });
  const recipient = await User.create({ name: 'View only recipient', email: 'shared-recipient@example.test', password: 'strong-pass-123' });
  const stranger = await User.create({ name: 'Unrelated user', email: 'shared-stranger@example.test', password: 'strong-pass-123' });
  const token = user => 'Bearer ' + jwt.sign({ id: user.id }, process.env.JWT_SECRET);
  const note = await Note.create({ title: 'Original note to preserve', content: 'Only sender owns this.', userId: owner.id });
  const share = await SharedNote.create({
    noteId: note.id, sharedWithUserId: recipient.id, sharedByUserId: owner.id,
    canEdit: false, canDelete: false, canCreate: false, isActive: true
  });
  const url = '/api/v1/notes/shared/received/' + share.id;

  let res = await request(app).get('/api/v1/notes/shared/with-me').set('Authorization', token(recipient));
  assert.equal(res.status, 200);
  assert.equal(res.body.sharedNotes.some(item => item.id === share.id), true, 'View-only share initially visible');

  res = await request(app).delete(url);
  assert.equal(res.status, 401, 'Unauthenticated users may not delete received shares');
  res = await request(app).delete(url).set('Authorization', token(stranger));
  assert.equal(res.status, 404, 'A stranger may not remove the share');
  res = await request(app).delete(url).set('Authorization', token(owner));
  assert.equal(res.status, 404, 'Sender cannot masquerade as recipient through receiver-only endpoint');
  assert.ok(await SharedNote.findByPk(share.id));

  res = await request(app).delete(url).set('Authorization', token(recipient));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await SharedNote.findByPk(share.id), null, 'The share relationship is deleted');
  const stillOwned = await Note.findByPk(note.id);
  assert.equal(stillOwned?.title, 'Original note to preserve', 'Sender original note is not deleted');
  assert.equal(stillOwned?.userId, owner.id);

  res = await request(app).get('/api/v1/notes/shared/with-me').set('Authorization', token(recipient));
  assert.equal(res.status, 200);
  assert.equal(res.body.sharedNotes.some(item => item.id === share.id), false, 'Removed share disappears from received tab');

  res = await request(app).get('/api/v1/notes/shared/by-me').set('Authorization', token(owner));
  assert.equal(res.status, 200);
  assert.equal(res.body.sharedNotes.some(item => item.id === share.id), false, 'Sender list is synchronized');

  res = await request(app).delete(url).set('Authorization', token(recipient));
  assert.equal(res.status, 404, 'Repeat removal is safely rejected');
  console.log('PASS: view-only recipient removes received share; nonrecipients rejected; original sender note preserved');
} finally {
  await sequelize.close();
}
