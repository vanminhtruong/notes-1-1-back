import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import SocketConnectionChild from '../src/socket/socket-child/socket.connection.child.js';
import { Message, User } from '../src/models/index.js';
import jwt from 'jsonwebtoken';
import GroupMessagesChild from '../src/service/group-service/group.messages.service.js';
import { groupMemberRepository, groupMessageRepository, userRepository, groupMessageReadRepository } from '../src/repositories/index.js';
import { Sequelize } from 'sequelize';
import { up, down } from '../src/migrations/20261030-chat-delivery-indexes.js';

test('501 pending receipts use three bounded bulk writes without overwriting read status', async () => {
  const find = Message.findAll, update = Message.update, io = global.io;
  let writes = 0, receipts = 0;
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, senderId: 2, receiverId: 3 }));
  try {
    Message.findAll = async options => {
      assert.equal(options.limit, 200);
      assert.equal(options.where.status, 'sent');
      return rows.filter(m => m.id > options.where.id[Op.gt]).slice(0, options.limit);
    };
    Message.update = async (values, options) => {
      writes++;
      assert.equal(options.where.status, 'sent', 'a concurrent read receipt must never be downgraded');
      assert.ok(options.where.id[Op.in].length <= 200);
    };
    global.io = { to: () => ({ emit: () => { receipts++; } }) };
    const child = new SocketConnectionChild({ adminChild: { emitToAllAdmins: async () => {} } });
    await child._deliverBacklog(Message, { receiverId: 3 }, 'message_delivered', 'admin_message_delivered');
    assert.equal(writes, 3);
    assert.equal(receipts, 501);
  } finally { Message.findAll = find; Message.update = update; global.io = io; }
});

test('rejected inactive users cannot exhaust the handshake capacity', async () => {
  const find = User.findByPk, secret = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = 'only-for-chat-test';
    User.findByPk = async () => null;
    const token = jwt.sign({ id: 3 }, process.env.JWT_SECRET);
    const child = new SocketConnectionChild({});
    for (let i = 0; i < 40; i++) {
      let error;
      await child.authenticateSocket({ handshake: { auth: { token } } }, e => { error = e; });
      assert.equal(error.message, 'Authentication error');
    }
  } finally {
    User.findByPk = find;
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;
  }
});

test('group history batches user/member lookups and read-state writes', async () => {
  const mocks = [
    [groupMemberRepository, 'findMembership'], [groupMessageRepository, 'findAll'],
    [groupMessageRepository, 'update'], [userRepository, 'findByPk'],
    [userRepository, 'findAll'], [groupMessageReadRepository, 'findOrCreate'],
  ];
  const saved = mocks.map(([object, key]) => object[key]);
  try {
    let users = 0, senders = 0, members = 0, updates = 0;
    groupMemberRepository.findMembership = async () => ({});
    groupMessageRepository.findAll = async () => Array.from({ length: 50 }, (_, i) => ({ toJSON: () => ({ id: i + 1, senderId: 2 + i % 2, isRead: false }) }));
    groupMessageRepository.update = async () => { updates++; };
    userRepository.findByPk = async () => { users++; return { id: 1, name: 'reader', readStatusEnabled: true }; };
    userRepository.findAll = async () => { senders++; return [2, 3].map(id => ({ id, readStatusEnabled: true })); };
    groupMessageReadRepository.findOrCreate = async () => [{ readAt: new Date() }];
    const child = new GroupMessagesChild({ membersChild: { getGroupMemberIds: async () => { members++; return [1, 2, 3]; } } });
    let result;
    await child.getGroupMessages({ params: { groupId: 5 }, query: { limit: 50 }, user: { id: 1 }, app: { get: () => null } }, { json: data => { result = data; } }, assert.fail);
    assert.equal(result.data.length, 50);
    assert.equal(users, 1); assert.equal(senders, 1); assert.equal(members, 1); assert.equal(updates, 1);
  } finally { mocks.forEach(([object, key], i) => { object[key] = saved[i]; }); }
});

test('delivery indexes migrate up/down idempotently on an isolated in-memory DB', async () => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const qi = db.getQueryInterface();
  try {
    for (const name of ['Messages', 'GroupMessages']) await qi.createTable(name, {
      id: { type: Sequelize.INTEGER, primaryKey: true }, receiverId: Sequelize.INTEGER,
      groupId: Sequelize.INTEGER, status: Sequelize.STRING,
    });
    await up(qi); await up(qi);
    assert.ok((await qi.showIndex('Messages')).some(index => index.name === 'chat_dm_delivery_cursor'));
    assert.ok((await qi.showIndex('GroupMessages')).some(index => index.name === 'chat_group_delivery_cursor'));
    await down(qi); await down(qi);
    assert.equal((await qi.showIndex('Messages')).length, 0);
  } finally { await db.close(); }
});
