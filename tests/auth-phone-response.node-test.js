import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production';
process.env.PHONE_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);

const { default: app } = await import('../src/app.js');
const { sequelize } = await import('../src/db/index.js');
const request = supertest(app);
const phone = '0912 345 678';

test('registration, login and general profile never expose phone or credentials; owner-only phone endpoint still works', async () => {
  await sequelize.sync({ force: true });
  try {
    const registration = await request.post('/api/v1/auth/register').send({
      email: 'privatephone@example.com',
      password: 'TestPassword123',
      name: 'Private User',
      phone,
    });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    assert.ok(registration.body.token);
    assert.equal(Object.hasOwn(registration.body.user, 'phone'), false);
    assert.equal(Object.hasOwn(registration.body.user, 'phoneHash'), false);
    assert.equal(Object.hasOwn(registration.body.user, 'password'), false);
    assert.doesNotMatch(JSON.stringify(registration.body), /0912 345 678/);

    const login = await request.post('/api/v1/auth/login').send({
      email: 'privatephone@example.com', password: 'TestPassword123',
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(Object.hasOwn(login.body.user, 'phone'), false);
    assert.equal(Object.hasOwn(login.body.user, 'phoneHash'), false);
    assert.doesNotMatch(JSON.stringify(login.body), /0912 345 678/);
    for (const forbidden of ['email', 'birthDate', 'gender', 'phone', 'password', 'e2eePinHash', 'adminPermissions']) {
      assert.equal(Object.hasOwn(login.body.user, forbidden), false, `Unexpected login field: ${forbidden}`);
    }
    const claims = jwt.decode(login.body.token);
    for (const forbidden of ['email', 'birthDate', 'gender', 'phone', 'password', 'role', 'adminPermissions']) {
      assert.equal(Object.hasOwn(claims, forbidden), false, `Sensitive claim in JWT: ${forbidden}`);
    }
    assert.equal(typeof claims.id, 'number');

    const headers = { Authorization: 'Bearer ' + login.body.token };
    const profile = await request.get('/api/v1/auth/profile').set(headers);
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    assert.equal(Object.hasOwn(profile.body.user, 'phone'), false);
    assert.equal(Object.hasOwn(profile.body.user, 'email'), false);
    const privateUnauthorized = await request.get('/api/v1/auth/profile/private');
    assert.equal(privateUnauthorized.status, 401);
    const privateProfile = await request.get('/api/v1/auth/profile/private').set(headers);
    assert.equal(privateProfile.status, 200);
    assert.equal(privateProfile.body.profile.email, 'privatephone@example.com');
    assert.equal(Object.hasOwn(privateProfile.body.profile, 'phone'), false);
    assert.match(privateProfile.headers['cache-control'], /no-store/);

    const unauthorized = await request.get('/api/v1/auth/profile/phone');
    assert.equal(unauthorized.status, 401);
    const authorized = await request.get('/api/v1/auth/profile/phone').set(headers);
    assert.equal(authorized.status, 200);
    assert.equal(authorized.body.phone, phone);
    assert.match(authorized.headers['cache-control'], /no-store/);

    const changed = await request.put('/api/v1/auth/profile').set(headers).send({ phone: '+84987654321' });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(Object.hasOwn(changed.body.user, 'phone'), false);
    const reloaded = await request.get('/api/v1/auth/profile/phone').set(headers);
    assert.equal(reloaded.body.phone, '+84987654321');
  } finally {
    await sequelize.close();
  }
});
