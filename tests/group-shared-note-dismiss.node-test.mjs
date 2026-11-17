import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  sequelize, User, Note, Group, GroupMember,
  GroupSharedNote, GroupSharedNoteDismissal,
} from '../src/models/index.js';
import app from '../src/app.js';

assert.equal(process.env.NODE_ENV, 'test', 'Tests must use an isolated in-memory database.');
process.env.JWT_SECRET = 'group-note-dismiss-test-only';
await sequelize.sync({ force: true });
try {
  const owner = await User.create({ name: 'Group owner', email: 'group-owner@example.test', password: 'test-password' });
  const reader = await User.create({ name: 'Group reader', email: 'group-reader@example.test', password: 'test-password' });
  const otherMember = await User.create({ name: 'Other group member', email: 'group-other@example.test', password: 'test-password' });
  const stranger = await User.create({ name: 'No group access', email: 'group-stranger@example.test', password: 'test-password' });
  const token = u => 'Bearer ' + jwt.sign({ id: u.id }, process.env.JWT_SECRET);
  const group = await Group.create({ name: 'Test shared group', ownerId: owner.id });
  for (const u of [owner, reader, otherMember]) {
    await GroupMember.create({ groupId: group.id, userId: u.id });
  }
  const note = await Note.create({ userId: owner.id, title: 'Keep the original', content: 'Text unchanged' });
  const share = await GroupSharedNote.create({
    groupId: group.id, noteId: note.id, sharedByUserId: owner.id,
    isActive: true, canEdit: false, canDelete: false, canCreate: false,
  });
  const list = '/api/v1/notes/shared/groups';
  const endpoint = list + '/' + share.id + '/dismiss';

  let res = await request(app).get(list).set('Authorization', token(reader));
  assert.equal(res.status, 200);
  assert.equal(res.body.groupSharedNotes.some(x => x.id === share.id), true);
  assert.equal(res.body.pagination.total, 1);

  res = await request(app).delete(endpoint);
  assert.equal(res.status, 401);
  res = await request(app).delete(endpoint).set('Authorization', token(stranger));
  assert.equal(res.status, 404, 'Nonmembers cannot dismiss other groups');
  res = await request(app).delete(endpoint).set('Authorization', token(owner));
  assert.equal(res.status, 403, 'The sender must use group-wide removal instead');
  res = await request(app).delete(endpoint).set('Authorization', token(reader));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await GroupSharedNoteDismissal.count({ where: { groupSharedNoteId: share.id, userId: reader.id } }), 1);

  res = await request(app).get(list).set('Authorization', token(reader));
  assert.equal(res.body.pagination.total, 0, 'Counts are updated after dismissal');
  assert.equal(res.body.groupSharedNotes.length, 0, 'Dismissed share stays hidden after reload');

  res = await request(app).get(list).set('Authorization', token(otherMember));
  assert.equal(res.body.pagination.total, 1, 'Other members still receive the share');
  res = await request(app).get(list).set('Authorization', token(owner));
  assert.equal(res.body.pagination.total, 1, 'Sender still sees the group share');
  assert.equal((await GroupSharedNote.findByPk(share.id))?.isActive, true);
  assert.equal((await Note.findByPk(note.id))?.title, 'Keep the original');

  res = await request(app).delete(endpoint).set('Authorization', token(reader));
  assert.equal(res.status, 200, 'A repeat click is idempotent');
  assert.equal(await GroupSharedNoteDismissal.count({ where: { groupSharedNoteId: share.id, userId: reader.id } }), 1);

  console.log('PASS: view-only member dismissal, sender/member isolation, persisted filtering and counts');
} finally {
  await sequelize.close();
}
