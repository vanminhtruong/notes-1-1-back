import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CapacityGate, installSocketBudget, registerChatEvent } from '../src/utils/chatCapacity.js';
import { chatCapacity } from '../src/middlewares/chatCapacity.js';
import asyncHandler from '../src/middlewares/asyncHandler.js';

test('capacity rejects excess work without queuing and release is idempotent', () => {
  const gate = new CapacityGate(16);
  const active = Array.from({ length: 16 }, () => gate.acquire());
  for (let i = 0; i < 100000; i++) assert.equal(gate.acquire(), null);
  active[0](); active[0]();
  assert.equal(gate.active, 15);
  assert.ok(gate.acquire());
  active.slice(1).forEach(release => release());
  assert.equal(gate.active, 1);
});

test('socket budget drops typing floods before DB handlers and refills', () => {
  let middleware, time = 0, passed = 0;
  const emitted = [];
  installSocketBudget({ use: fn => { middleware = fn; }, emit: (...args) => emitted.push(args) }, {
    now: () => time, rate: 2, burst: 4,
  });
  for (let i = 0; i < 20; i++) middleware(['typing_start', { receiverId: 2 }], () => passed++);
  assert.equal(passed, 1);
  assert.equal(emitted.length, 1, 'overload notice is itself throttled');
  time = 2000;
  middleware(['typing_start', { receiverId: 2 }], () => passed++);
  assert.equal(passed, 2);
  middleware(['group_typing', { groupId: -1 }], () => passed++);
  assert.equal(passed, 2);
});

test('socket DB concurrency is bounded and slots return after completion', async () => {
  let listener, finish, running = 0, peak = 0;
  const wait = new Promise(resolve => { finish = resolve; });
  registerChatEvent({ on: (event, fn) => { listener = fn; } }, 'join_chat', async () => {
    running++; peak = Math.max(peak, running); await wait; running--;
  });
  const tasks = Array.from({ length: 1000 }, () => listener({ receiverId: 2 }));
  assert.equal(peak, 4);
  finish(); await Promise.all(tasks);
  await listener({ receiverId: 2 });
  assert.equal(running, 0);
});

function response() {
  const res = new EventEmitter();
  res.set = () => res;
  res.status = status => { res.statusCode = status; return res; };
  res.json = body => { res.body = body; return res; };
  return res;
}

test('aborted requests retain capacity until SQL work settles, then release', async () => {
  const requests = [];
  const tasks = [];
  let complete;
  const work = new Promise(resolve => { complete = resolve; });
  for (let i = 0; i < 4; i++) {
    const req = { user: { id: 'abort-test' } }, res = response();
    chatCapacity(req, res, () => {});
    requests.push(req);
    tasks.push(asyncHandler(async () => { await work; })(req, res, assert.fail));
    res.emit('close');
  }
  const busy = response();
  chatCapacity({ user: { id: 'abort-test' } }, busy, () => assert.fail('must reject'));
  assert.equal(busy.statusCode, 503);
  complete(); await Promise.all(tasks);
  const next = { user: { id: 'abort-test' } }, res = response();
  let admitted = false;
  chatCapacity(next, res, () => { admitted = true; });
  assert.equal(admitted, true);
  res.emit('finish'); // Validation/early responses also release their slots.
  assert.equal(next.releaseChatCapacity, undefined);
});

test('handler errors release capacity and preserve error middleware behavior', async () => {
  const req = { user: { id: 'error-test' } }, res = response();
  chatCapacity(req, res, () => {});
  const error = new Error('SQL failed');
  let caught;
  await asyncHandler(() => { throw error; })(req, res, e => { caught = e; });
  assert.equal(caught, error);
  assert.equal(req.releaseChatCapacity, undefined);
});
