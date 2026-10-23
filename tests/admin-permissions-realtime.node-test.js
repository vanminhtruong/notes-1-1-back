import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/controllers/adminPermissions.controller.js';
import AdminPermissionsChild from '../src/service/adminPermissions-service/admin.permissions.service.js';
import { userRepository } from '../src/repositories/index.js';
import { User } from '../src/models/index.js';

test('individual revocation sends the complete remaining permissions to the target admin', async () => {
  const originalIo = global.io;
  const originalFindAdmin = userRepository.findAdminById;
  const originalFindByPk = userRepository.findByPk;
  const originalFindAll = User.findAll;
  try {
    for (const scenario of [
      { initial: ['manage_notes.view'], revoked: 'manage_notes.view', remaining: [] },
      { initial: ['manage_users', 'manage_users.view', 'manage_notes.view'], revoked: 'manage_users', remaining: ['manage_notes.view'] },
    ]) {
      const events = [];
      const target = { id: 7, adminLevel: 'dev', adminPermissions: [...scenario.initial],
        async update(data) { Object.assign(this, data); } };
      userRepository.findAdminById = async () => target;
      userRepository.findByPk = async () => target;
      User.findAll = async () => [];
      global.io = { to: room => ({ emit: (event, data) => events.push({ room, event, data }) }) };
      let response;
      await new AdminPermissionsChild({}).revokeAdminPermission({
        params: { adminId: '7' }, body: { permission: scenario.revoked },
        user: { id: 16, adminLevel: 'super_admin' },
      }, { json: data => { response = data; } }, error => { throw error; });
      assert.equal(response.success, true);
      const notification = events.find(event => event.event === 'permission_revoked');
      assert.equal(notification.room, 'user_7');
      assert.equal(notification.data.permission, scenario.revoked);
      assert.equal(notification.data.adminLevel, 'dev');
      assert.deepEqual(notification.data.permissions, scenario.remaining);
    }
  } finally {
    global.io = originalIo;
    userRepository.findAdminById = originalFindAdmin;
    userRepository.findByPk = originalFindByPk;
    User.findAll = originalFindAll;
  }
});
