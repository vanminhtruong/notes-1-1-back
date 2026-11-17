import test from 'node:test';
import assert from 'node:assert/strict';
import { isTextbeeConfigured, sendTextbeeOtp, TextbeeError } from '../src/utils/textbee.js';

async function withMockApi(response, fn) {
  const oldKey = process.env.TEXTBEE_API_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.TEXTBEE_API_KEY = 'test-only-key';
    let sent;
    globalThis.fetch = async (url, options) => {
      sent = { url, options };
      return response;
    };
    await fn(() => sent);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.TEXTBEE_API_KEY;
    else process.env.TEXTBEE_API_KEY = oldKey;
  }
}

test('not configured without a real API key', () => {
  const old = process.env.TEXTBEE_API_KEY;
  try {
    delete process.env.TEXTBEE_API_KEY;
    assert.equal(isTextbeeConfigured(), false);
    process.env.TEXTBEE_API_KEY = 'YOUR_API_KEY';
    assert.equal(isTextbeeConfigured(), false);
  } finally {
    if (old === undefined) delete process.env.TEXTBEE_API_KEY;
    else process.env.TEXTBEE_API_KEY = old;
  }
});

test('textbee queues SMS using only backend API key and one recipient', async () => {
  const batchId = '66b1f2c3a4d5e6f7a8b9c0d2';
  await withMockApi({
    ok: true, status: 200,
    json: async () => ({
      data: {
        success: true,
        message: 'SMS added to queue for processing',
        smsBatchId: batchId,
        recipientCount: 1,
      },
    }),
  }, async (getCall) => {
    const result = await sendTextbeeOtp({ phone: '+84912345678', otp: '123456' });
    assert.deepEqual(result, { batchId, queued: true });
    const sent = getCall();
    assert.equal(sent.url, 'https://api.textbee.dev/api/v1/gateway/send-sms');
    assert.equal(sent.options.headers['x-api-key'], 'test-only-key');
    const body = JSON.parse(sent.options.body);
    assert.deepEqual(body.recipients, ['+84912345678']);
    assert.match(body.message, /123456/);
    assert.equal(Object.hasOwn(body, 'deviceId'), false);
  });
});

test('provider rejects queueing and API refuses it', async () => {
  await withMockApi({
    ok: false, status: 429,
    json: async () => ({ message: 'Limit reached' }),
  }, async () => {
    await assert.rejects(
      sendTextbeeOtp({ phone: '+84912345678', otp: '123456' }),
      err => err instanceof TextbeeError && err.code === 'quota_exceeded'
    );
  });
});

test('success response must confirm one recipient and a batch ID', async () => {
  await withMockApi({
    ok: true, status: 200,
    json: async () => ({ data: { success: false, recipientCount: 0 } }),
  }, async () => {
    await assert.rejects(sendTextbeeOtp({ phone: '+84912345678', otp: '123456' }),
      err => err instanceof TextbeeError && err.code === 'invalid_response');
  });
});
