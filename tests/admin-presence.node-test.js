import { test } from 'node:test';
import assert from 'node:assert/strict';
// Load the controller entry point first, matching the application's existing
// controller/service import cycle.
import '../src/controllers/adminPermissions.controller.js';
import SocketUtilsChild from '../src/socket/socket-child/socket.utils.child.js';
import SocketConnectionChild from '../src/socket/socket-child/socket.connection.child.js';
import AdminManagementChild from '../src/service/adminPermissions-service/admin.management.service.js';
import { userRepository } from '../src/repositories/index.js';
import { User } from '../src/models/index.js';

test('admin list distinguishes enabled accounts from live connections', async () => {
  const originalIo = global.io;
  const originalFind = userRepository.findAndCountAll;
  const records = [
    { id: 6, isActive: true },
    { id: 7, isActive: false },
    { id: 16, isActive: true },
  ];
  try {
    global.io = { sockets: { adapter: { rooms: new Map([
      ['user_16', new Set(['current-tab'])],
      ['user_7', new Set(['deactivated-tab'])],
    ]) } } };
    userRepository.findAndCountAll = async () => ({
      count: records.length,
      rows: records.map(record => ({ ...record, toJSON: () => ({ ...record }) })),
    });
    let response;
    await new AdminManagementChild({}).getAllAdmins({ query: {} }, {
      json: data => { response = data; },
    }, error => { throw error; });
    assert.deepEqual(response.admins.map(({ id, isActive, isOnline }) => ({ id, isActive, isOnline })), [
      { id: 6, isActive: true, isOnline: false },
      { id: 7, isActive: false, isOnline: false },
      { id: 16, isActive: true, isOnline: true },
    ]);
  } finally {
    global.io = originalIo;
    userRepository.findAndCountAll = originalFind;
  }
});

test('presence uses current rooms, accepts string IDs and handles multiple tabs', () => {
  const originalIo = global.io;
  try {
    const tabs = new Set(['tab-one', 'tab-two']);
    global.io = { sockets: { adapter: { rooms: new Map([['user_16', tabs]]) } } };
    const utils = new SocketUtilsChild({ connectedUsers: new Map([[6, {}]]) });
    assert.equal(utils.isUserOnline(6), false, 'stale map entry must not appear online');
    assert.equal(utils.isUserOnline('16'), true);
    tabs.delete('tab-one');
    assert.equal(utils.isUserOnline(16), true);
    tabs.delete('tab-two');
    assert.equal(utils.isUserOnline(16), false);
  } finally {
    global.io = originalIo;
  }
});

test('only the last tab disconnect marks the user offline and updates last seen', async () => {
  const originalIo = global.io;
  const originalUpdate = User.update;
  try {
    const rooms = new Map([['user_16', new Set(['remaining-tab'])]]);
    global.io = { sockets: { adapter: { rooms } } };
    const parent = { connectedUsers: new Map([[16, {}]]) };
    const connection = new SocketConnectionChild(parent);
    let updates = 0;
    let notifications = 0;
    User.update = async () => { updates++; };
    connection._notifyFriendsOffline = async () => { notifications++; };
    connection._notifyAdminsOffline = async () => { notifications++; };
    const socket = { user: { name: 'test-admin' } };
    await connection.handleDisconnection(socket, 16);
    assert.equal(parent.connectedUsers.has(16), true);
    assert.equal(updates, 0);
    assert.equal(notifications, 0);
    rooms.delete('user_16');
    await connection.handleDisconnection(socket, 16);
    assert.equal(parent.connectedUsers.has(16), false);
    assert.equal(updates, 1);
    assert.equal(notifications, 2);
  } finally {
    global.io = originalIo;
    User.update = originalUpdate;
  }
});
