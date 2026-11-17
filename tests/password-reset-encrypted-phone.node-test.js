import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.PHONE_ENCRYPTION_KEY = '0123456789abcdef'.repeat(4);
process.env.TEXTBEE_API_KEY = 'mock-test-api-key';

const { sequelize } = await import('../src/db/index.js');
const { User } = await import('../src/models/index.js');
const { default: AuthPasswordResetChild } = await import('../src/service/auth-service/auth.password-reset.service.js');

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('encrypted phone: request SMS OTP, verify and reset password', async () => {
  await sequelize.sync({ force: true });
  const user = await User.create({
    email: 'otp-encrypted-phone@example.test',
    name: 'OTP Test',
    password: 'OldPassword123',
    phone: '0912 345 678',
  });
  let otpValue;
  let destination;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    destination = body.recipients[0];
    otpValue = body.message.match(/\b\d{6}\b/)?.[0];
    return {
      ok: true,
      json: async () => ({ data: { success: true, smsBatchId: 'mock-batch-12345', recipientCount: 1 } }),
    };
  };

  try {
    const service = new AuthPasswordResetChild(null);
    const requestRes = mockResponse();
    await service.forgotPasswordRequest({ body: { phone: '+84912345678' } }, requestRes);
    assert.equal(requestRes.statusCode, 200);
    assert.equal(requestRes.body.channel, 'sms');
    assert.equal(requestRes.body.status, 'queued');
    assert.equal(destination, '+84912345678');
    assert.match(otpValue, /^\d{6}$/);

    const verifyRes = mockResponse();
    await service.verifyOtp({ body: { phone: '0912 345 678', otp: otpValue } }, verifyRes);
    assert.equal(verifyRes.statusCode, 200);
    assert.match(verifyRes.body.resetToken, /^[0-9a-f]{64}$/);

    const resetRes = mockResponse();
    await service.resetPassword({
      body: { phone: '0912345678', resetToken: verifyRes.body.resetToken, newPassword: 'NewPassword456' },
    }, resetRes);
    assert.equal(resetRes.statusCode, 200);
    assert.equal(resetRes.body.message, 'Đặt lại mật khẩu thành công');
    const updated = await User.findByPk(user.id);
    assert.equal(await updated.validatePassword('NewPassword456'), true);
    assert.equal(await updated.validatePassword('OldPassword123'), false);

    const reused = mockResponse();
    await service.resetPassword({
      body: { phone: '0912345678', resetToken: verifyRes.body.resetToken, newPassword: 'AnotherPassword789' },
    }, reused);
    assert.equal(reused.statusCode, 400);
  } finally {
    globalThis.fetch = originalFetch;
    await sequelize.close();
  }
});
