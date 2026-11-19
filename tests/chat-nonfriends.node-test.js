import { test } from 'node:test';
import assert from 'node:assert/strict';
import ChatMessagesChild from '../src/service/chat-service/chat.messages.service.js';
import {
  userRepository, blockedUserRepository, messageRepository,
  notificationRepository
} from '../src/repositories/index.js';

async function send({ blocked = false, active = true, recipientAllowsStrangers = false } = {}) {
  const targets = [
    [userRepository, 'findByPk'],
    [blockedUserRepository, 'findOne'],
    [messageRepository, 'create'],
    [messageRepository, 'findByPk'],
    [notificationRepository, 'create'],
    [notificationRepository, 'destroy'],
  ];
  const originals = targets.map(([obj, method]) => obj[method]);
  let created = 0;
  let guardOptions;
  const emitted = [];
  try {
    userRepository.findByPk = async () => ({ id: 2, isActive: active, allowMessagesFromNonFriends: recipientAllowsStrangers });
    blockedUserRepository.findOne = async options => {
      guardOptions = options;
      return blocked ? { id: 1 } : null;
    };
    messageRepository.create = async data => { created++; return { id: 10, ...data }; };
    messageRepository.findByPk = async () => ({ id: 10, content: 'test', messageType: 'text', sender: { name: 'Sender' }, receiver: { name: 'Receiver' }, createdAt: new Date() });
    notificationRepository.create = async () => ({ type: 'message' });
    notificationRepository.destroy = async () => 0;
    const req = { user: { id: 1 }, body: { receiverId: 2, content: 'test' }, app: { get: () => null } };
    const res = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; emitted.push(data); return this; },
    };
    const handler = new ChatMessagesChild({});
    await handler.sendMessage(req, res, error => { throw error; });
    assert.equal(emitted.length, 1);
    return { status: res.statusCode, body: res.body, created, guardOptions };
  } finally {
    targets.forEach(([obj, method], index) => { obj[method] = originals[index]; });
  }
}

test('unfriended, unblocked users can send messages regardless of legacy stranger flag', async () => {
  for (const recipientAllowsStrangers of [false, true]) {
    const result = await send({ recipientAllowsStrangers });
    assert.equal(result.status, 201);
    assert.equal(result.body.success, true);
    assert.equal(result.created, 1);
  }
});

test('block guard protects both directions before any message creation', async () => {
  const result = await send({ blocked: true });
  assert.equal(result.status, 403);
  assert.equal(result.created, 0);
  const pair = result.guardOptions.where[Object.getOwnPropertySymbols(result.guardOptions.where)[0]];
  assert.deepEqual(pair, [
    { userId: 1, blockedUserId: 2 },
    { userId: 2, blockedUserId: 1 },
  ]);
});

test('inactive receiver cannot receive messages', async () => {
  const result = await send({ active: false });
  assert.equal(result.status, 403);
  assert.equal(result.created, 0);
});
