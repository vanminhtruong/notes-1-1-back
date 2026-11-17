import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SWAGGER_ENABLED = 'true';
process.env.PHONE_ENCRYPTION_KEY ||= '0123456789abcdef'.repeat(4);

const { default: app } = await import('../src/app.js');
const { openApiSpec } = await import('../src/docs/openapi.js');
const request = supertest(app);

test('Swagger serves an interactive UI and the OpenAPI spec', async () => {
  const ui = await request.get('/api-docs/');
  assert.equal(ui.status, 200);
  assert.match(ui.text, /swagger-ui/i);

  const spec = await request.get('/api-docs/openapi.json');
  assert.equal(spec.status, 200);
  assert.equal(spec.body.openapi, '3.0.3');
  assert.ok(Object.keys(spec.body.paths).length >= 190);
  assert.ok(Object.values(spec.body.paths).reduce((n, group) => n + Object.keys(group).length, 0) >= 245);
  assert.ok(spec.body.paths['/api/v1/auth/login'].post);
  assert.deepEqual(spec.body.paths['/api/v1/auth/login'].post.security, []);
  assert.ok(spec.body.paths['/api/v1/auth/profile'].get.security[0].bearerAuth);
  assert.ok(spec.body.paths['/api/v1/admin/users'].get.security[0].bearerAuth);
});

test('documented paths use true Express endpoint methods and include path parameters', async () => {
  const operation = openApiSpec.paths['/api/v1/notes/{id}'].get;
  assert.ok(operation.parameters.find((p) => p.name === 'id' && p.required));
  const health = await request.get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  const protectedProfile = await request.get('/api/v1/auth/profile');
  assert.equal(protectedProfile.status, 401);
});
