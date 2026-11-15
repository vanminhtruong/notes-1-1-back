import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import fs from 'node:fs';
import { sequelize, User, Note } from '../src/models/index.js';
import { privateMediaPath } from '../src/controllers/notes.encrypted-media.controller.js';
import app from '../src/app.js';

assert.equal(process.env.NODE_ENV, 'test', 'Only in-memory test DB is allowed');
process.env.JWT_SECRET = 'encrypted-media-test';
await sequelize.sync({ force: true });
let mediaFile = null;
try {
  const owner = await User.create({ name: 'Owner Test', email: 'owner-media@example.test', password: 'strong-pass-123' });
  const other = await User.create({ name: 'Other Test', email: 'other-media@example.test', password: 'strong-pass-123' });
  const authorization = u => 'Bearer ' + jwt.sign({ id: u.id }, process.env.JWT_SECRET);
  const note = await Note.create({ title: 'Image note', content: 'Private content', userId: owner.id, imageUrl: '/uploads/old-image.png' });
  const ciphertext = Buffer.alloc(1024, 7);
  let response = await request(app).post('/api/v1/notes/' + note.id + '/encrypted-media/image')
    .set('Authorization', authorization(other)).set('Content-Type', 'application/octet-stream').send(ciphertext);
  assert.equal(response.status, 404);
  response = await request(app).post('/api/v1/notes/' + note.id + '/encrypted-media/image')
    .set('Authorization', authorization(owner)).set('Content-Type', 'application/octet-stream').send(ciphertext);
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const assetId = response.body.id;
  mediaFile = privateMediaPath(note.id, assetId);
  assert.equal(fs.existsSync(mediaFile), true);
  assert.deepEqual(fs.readFileSync(mediaFile), ciphertext);
  const version = note.updatedAt.toISOString();
  const b64 = size => Buffer.alloc(size, 1).toString('base64');
  const envelope = 'E2EE1.' + b64(16) + '.' + b64(12) + '.' + b64(45);
  response = await request(app).patch('/api/v1/notes/' + note.id + '/encryption')
    .set('Authorization', authorization(owner)).send({ action: 'encrypt', ciphertext: envelope, expectedUpdatedAt: version, mediaRefs: { image: 'e2ee:' + assetId } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.note.imageUrl, 'e2ee:' + assetId);
  assert.equal(response.body.note.videoUrl, null);
  response = await request(app).get('/api/v1/notes/' + note.id + '/encrypted-media/image/' + assetId);
  assert.equal(response.status, 401);
  response = await request(app).get('/api/v1/notes/' + note.id + '/encrypted-media/image/' + assetId)
    .set('Authorization', authorization(other));
  assert.equal(response.status, 404);
  response = await request(app).get('/api/v1/notes/' + note.id + '/encrypted-media/image/' + assetId)
    .set('Authorization', authorization(owner));
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, ciphertext);
  assert.equal(response.headers['cache-control'], 'no-store');
  console.log('PASS: private media upload, ciphertext storage, commit, owner-only download, no-store');
} finally {
  if (mediaFile) await fs.promises.rm(mediaFile, { force: true });
  await sequelize.close();
}
