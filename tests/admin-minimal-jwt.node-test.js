import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production';
process.env.PHONE_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
const { default: app } = await import('../src/app.js');
const { sequelize } = await import('../src/db/index.js');
const { User } = await import('../src/models/index.js');
const request = supertest(app);

test('admin JWT contains identity only, authorization remains server-side', async () => {
  await sequelize.sync({ force: true });
  try {
    const admin = await User.create({ name: 'Test Admin', email: 'admin-jwt-test@example.com', password: 'StrongPassword123', role: 'admin', adminLevel: 'super_admin' });
    const response = await request.post('/api/v1/admin/login').send({ email: admin.email, password: 'StrongPassword123' });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const claims = jwt.decode(response.body.token);
    assert.equal(claims.id, admin.id);
    for (const field of ['email', 'phone', 'name', 'role', 'adminLevel', 'adminPermissions']) {
      assert.equal(Object.hasOwn(claims, field), false, field);
    }
    const adminApi = await request.get('/api/v1/admin/me').set('Authorization', 'Bearer ' + response.body.token);
    assert.notEqual(adminApi.status, 401, JSON.stringify(adminApi.body));
  } finally {
    await sequelize.close();
  }
});
