import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/app.js');

test('health endpoint returns application metadata', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(typeof response.body.version, 'string');
});

test('Front and admin API families retain authentication', async () => {
  for (const url of ['/notes', '/friends', '/chat', '/groups', '/blocks', '/notifications', '/sessions', '/admin/me']) {
    const response = await request(app).get(`/api/v1${url}`);
    assert.equal(response.status, 401, url);
  }
});

test('unknown endpoint retains 404 behavior', async () => {
  const response = await request(app).get('/api/v1/unknown-endpoint');
  assert.equal(response.status, 404);
});
