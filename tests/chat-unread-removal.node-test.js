import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production';
process.env.PHONE_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

const { default: app } = await import('../src/app.js');
const { sequelize } = await import('../src/db/index.js');
const { Friendship, Group, GroupMember, Message } = await import('../src/models/index.js');
const { openApiSpec } = await import('../src/docs/openapi.js');
const request = supertest(app);

test('chat and group lists omit unread counts, bell badge excludes chat, read receipts remain available', async () => {
  await sequelize.sync({ force: true });
  try {
    const first = await request.post('/api/v1/auth/register').send({
      email: 'chat-unread-a@example.com', name: 'Chat A', password: 'TestPassword123',
    });
    const second = await request.post('/api/v1/auth/register').send({
      email: 'chat-unread-b@example.com', name: 'Chat B', password: 'TestPassword123',
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(second.status, 201, JSON.stringify(second.body));
    const a = first.body.user.id;
    const b = second.body.user.id;
    const bearer = { Authorization: 'Bearer ' + first.body.token };
    await Friendship.create({ requesterId: a, addresseeId: b, status: 'accepted' });
    await Message.create({ senderId: b, receiverId: a, content: 'test message', messageType: 'text' });
    const chat = await request.get('/api/v1/chat').set(bearer);
    assert.equal(chat.status, 200, JSON.stringify(chat.body));
    assert.equal(chat.body.data.length, 1);
    assert.equal(Object.hasOwn(chat.body.data[0], 'unreadCount'), false);

    const group = await Group.create({ name: 'Test Group', ownerId: a });
    await GroupMember.create({ groupId: group.id, userId: a, role: 'owner' });
    const groups = await request.get('/api/v1/groups').set(bearer);
    assert.equal(groups.status, 200, JSON.stringify(groups.body));
    assert.equal(groups.body.data.some(g => g.id === group.id), true);
    assert.equal(Object.hasOwn(groups.body.data.find(g => g.id === group.id), 'unreadCount'), false);

    const badge = await request.get('/api/v1/notifications/bell/badge').set(bearer);
    assert.equal(badge.status, 200, JSON.stringify(badge.body));
    assert.equal(badge.body.data.dm, 0);
    assert.equal(badge.body.data.group, 0);
    assert.equal(badge.body.data.total, badge.body.data.fr + badge.body.data.inv);

    assert.equal(openApiSpec.paths['/api/v1/chat/unread-count'], undefined);
    assert.ok(openApiSpec.paths['/api/v1/chat/{senderId}/read']?.put);
  } finally {
    await sequelize.close();
  }
});
