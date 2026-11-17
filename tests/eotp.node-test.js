import test from 'node:test';
import assert from 'node:assert/strict';
import { isEotpConfigured, sendPhoneOtp, verifyPhoneOtp, EotpError } from '../src/utils/eotp.js';

const API_KEY = 'eo_live_1234567890abcdef';
const API_SECRET = 'eo_sec_' + 'a'.repeat(32);
const REQUEST_ID = '0123456789abcdef0123456789abcdef';

test('requires approved-format server credentials (no mock SMS)', () => {
  const oldKey = process.env.EASYOTP_API_KEY;
  const oldSecret = process.env.EASYOTP_API_SECRET;
  try {
    delete process.env.EASYOTP_API_KEY;
    delete process.env.EASYOTP_API_SECRET;
    assert.equal(isEotpConfigured(), false);
  } finally {
    if (oldKey === undefined) delete process.env.EASYOTP_API_KEY;
    else process.env.EASYOTP_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.EASYOTP_API_SECRET;
    else process.env.EASYOTP_API_SECRET = oldSecret;
  }
});

test('send and verify provider-created SMS OTP using the documented API', async () => {
  const originalFetch = global.fetch;
  const oldKey = process.env.EASYOTP_API_KEY;
  const oldSecret = process.env.EASYOTP_API_SECRET;
  const calls = [];
  try {
    process.env.EASYOTP_API_KEY = API_KEY;
    process.env.EASYOTP_API_SECRET = API_SECRET;
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      const data = url.endsWith('/otp/send')
        ? { ok: true, status: 'queued', request_id: REQUEST_ID, expires_in: 300 }
        : { ok: true, verified: true };
      return { ok: true, status: 200, json: async () => data };
    };
    const sent = await sendPhoneOtp('+84912345678');
    assert.equal(sent.requestId, REQUEST_ID);
    assert.equal(sent.expiresIn, 300);
    await verifyPhoneOtp(REQUEST_ID, '123456');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://eotp.com.vn/api/v1/otp/send');
    assert.deepEqual(JSON.parse(calls[0].options.body), { phone: '+84912345678', channel: 'sms' });
    assert.equal(calls[0].options.headers['X-Api-Key'], API_KEY);
    assert.equal(calls[0].options.headers['X-Api-Secret'], API_SECRET);
    assert.equal(calls[1].url, 'https://eotp.com.vn/api/v1/otp/verify');
    assert.deepEqual(JSON.parse(calls[1].options.body), { request_id: REQUEST_ID, code: '123456' });
  } finally {
    global.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.EASYOTP_API_KEY;
    else process.env.EASYOTP_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.EASYOTP_API_SECRET;
    else process.env.EASYOTP_API_SECRET = oldSecret;
  }
});

test('rejects wrong OTP without treating it as verified', async () => {
  const originalFetch = global.fetch;
  const oldKey = process.env.EASYOTP_API_KEY;
  const oldSecret = process.env.EASYOTP_API_SECRET;
  try {
    process.env.EASYOTP_API_KEY = API_KEY;
    process.env.EASYOTP_API_SECRET = API_SECRET;
    global.fetch = async () => ({
      ok: false, status: 400,
      json: async () => ({ ok: false, error: 'wrong_code' }),
    });
    await assert.rejects(verifyPhoneOtp(REQUEST_ID, '000000'),
      (err) => err instanceof EotpError && err.code === 'wrong_code');
  } finally {
    global.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.EASYOTP_API_KEY;
    else process.env.EASYOTP_API_KEY = oldKey;
    if (oldSecret === undefined) delete process.env.EASYOTP_API_SECRET;
    else process.env.EASYOTP_API_SECRET = oldSecret;
  }
});
