import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { sequelize, User, Note } from '../src/models/index.js';
import app from '../src/app.js';

assert.equal(process.env.NODE_ENV, 'test', 'Only run against in-memory test database');
process.env.JWT_SECRET = 'note-encryption-test-only';
await sequelize.sync({ force: true });
try {
  const owner = await User.create({ name: 'Owner Test', email: 'owner-e2ee@example.test', password: 'strong-pass-123' });
  const other = await User.create({ name: 'Other Test', email: 'other-e2ee@example.test', password: 'strong-pass-123' });
  const admin = await User.create({ name: 'Admin Test', email: 'admin-e2ee@example.test', password: 'strong-pass-123', role: 'admin', adminLevel: 'super_admin' });
  const bearer = u => 'Bearer ' + jwt.sign({ id: u.id }, process.env.JWT_SECRET);
  const plaintext = 'Private note secret to hide';
  const note = await Note.create({ title: 'Secret title', content: plaintext, userId: owner.id });
  const version = note.updatedAt.toISOString();
  const b64 = bytes => Buffer.from(bytes).toString('base64');
  const encrypted = 'E2EE1.' + b64(Buffer.alloc(16, 1)) + '.' + b64(Buffer.alloc(12, 2)) + '.' + b64(Buffer.alloc(40, 3));
  let res = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', bearer(other)).send({ action: 'encrypt', ciphertext: encrypted, expectedUpdatedAt: version });
  assert.equal(res.status, 404, 'Other users cannot encrypt someone else note');
  res = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', bearer(owner)).send({ action: 'encrypt', ciphertext: 'malformed', expectedUpdatedAt: version });
  assert.equal(res.status, 400, 'Must refuse malformed envelope');
  res = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', bearer(owner)).send({ action: 'encrypt', ciphertext: encrypted, expectedUpdatedAt: version });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = await Note.findByPk(note.id);
  assert.equal(saved.isEncrypted, true);
  assert.equal(saved.content, encrypted);
  assert.notEqual(saved.title, 'Secret title');
  assert.equal(JSON.stringify(saved.toJSON()).includes(plaintext), false);
  res = await request(app).get('/api/v1/notes/' + note.id).set('Authorization', bearer(owner));
  assert.equal(res.body.note.isEncrypted, true);
  assert.equal(JSON.stringify(res.body.note).includes(plaintext), false);
  res = await request(app).put('/api/v1/notes/' + note.id)
    .set('Authorization', bearer(owner)).send({ title: 'Plaintext corruption' });
  assert.equal(res.status, 409, 'Normal edit must not overwrite ciphertext');
  res = await request(app).post('/api/v1/notes/' + note.id + '/share')
    .set('Authorization', bearer(owner)).send({ userId: other.id });
  assert.equal(res.status, 409, 'Encrypted note must not be shared without key exchange');
  res = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', bearer(other)).send({ action: 'decrypt', title: 'Attack', content: 'Attack', expectedUpdatedAt: saved.updatedAt.toISOString() });
  assert.equal(res.status, 404);
  res = await request(app).put('/api/v1/admin/notes/' + note.id)
    .set('Authorization', bearer(admin)).send({ title: 'Admin attempted override' });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  // A protected edit keeps its content encrypted while updating normal note metadata.
  res = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', bearer(owner)).send({
      action: 'save', ciphertext: encrypted, expectedUpdatedAt: saved.updatedAt.toISOString(),
      mediaRefs: { image: null, video: null, background: null },
      metadata: { priority: 'high', categoryId: null, reminderAt: '2027-01-02T09:00:00.000Z' }
    });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const edited = await Note.findByPk(note.id);
  assert.equal(edited.isEncrypted, true);
  assert.equal(edited.priority, 'high');
  assert.equal(edited.content, encrypted);
  assert.equal(JSON.stringify(edited.toJSON()).includes(plaintext), false);

  res = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', bearer(owner)).send({ action: 'decrypt', title: 'Secret title', content: plaintext, expectedUpdatedAt: edited.updatedAt.toISOString() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await Note.findByPk(note.id)).isEncrypted, false);
  console.log('PASS: encryption, owner-only controls, admin protection, no plaintext in encrypted response, share rejected, unlock');
} finally {
  await sequelize.close();
}
