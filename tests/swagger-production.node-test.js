import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';

process.env.NODE_ENV = 'production';
process.env.SWAGGER_ENABLED = 'true';
process.env.SWAGGER_USERNAME = 'api-docs';
process.env.SWAGGER_PASSWORD = 'test-password-for-swagger-docs';
process.env.PHONE_ENCRYPTION_KEY ||= '0123456789abcdef'.repeat(4);

const { default: app } = await import('../src/app.js');
const request = supertest(app);

test('production Swagger requires HTTP Basic and serves docs for valid credentials', async () => {
  const unauthorized = await request.get('/api-docs/');
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers['www-authenticate'], /Basic/);
  const bad = await request.get('/api-docs/openapi.json').auth('api-docs', 'wrong-password');
  assert.equal(bad.status, 401);
  const ok = await request.get('/api-docs/openapi.json').auth('api-docs', 'test-password-for-swagger-docs');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.openapi, '3.0.3');
});
