import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSmtpConfig, sendEmail } from '../src/utils/email.js';

test('SMTP requires real configuration and secure transport', () => {
  assert.throws(() => getSmtpConfig({}), /SMTP/);
  const env = { SMTP_HOST: 'smtp.example.com', SMTP_USER: 'sender@example.com', SMTP_PASS: 'test-password', SMTP_FROM: 'PlantHub <sender@example.com>' };
  const config = getSmtpConfig(env);
  assert.equal(config.transport.port, 587);
  assert.equal(config.transport.requireTLS, true);
  assert.equal(config.from, 'PlantHub <sender@example.com>');
  assert.equal(getSmtpConfig({ ...env, SMTP_PORT: '465' }).transport.secure, true);
  assert.throws(() => getSmtpConfig({ ...env, SMTP_PORT: 'invalid' }), /SMTP/);
  assert.throws(() => getSmtpConfig({ ...env, SMTP_FROM: '' }), /SMTP_FROM/);
  assert.equal(getSmtpConfig({ ...env, SMTP_HOST: 'smtp-relay.brevo.com', SMTP_USER: 'technical@smtp-brevo.com' }).from, env.SMTP_FROM);
});

test('sendEmail only succeeds when SMTP accepts the message', async () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'sender@example.com', SMTP_PASS: 'test-password', SMTP_FROM: 'PlantHub <sender@example.com>' });
    const message = { to: 'recipient@example.com', subject: 'Test', text: 'test content' };
    let sent;
    const result = await sendEmail(message, () => ({ sendMail: async (payload) => {
      sent = payload;
      return { accepted: [payload.to], rejected: [] };
    } }));
    assert.equal(result.accepted[0], message.to);
    assert.deepEqual(sent, { from: process.env.SMTP_FROM, ...message, html: undefined });
    await assert.rejects(sendEmail(message, () => ({ sendMail: async () => ({ accepted: [], rejected: [message.to] }) })), /không chấp nhận/);
    await assert.rejects(sendEmail(message, () => ({ sendMail: async () => { throw new Error('SMTP offline'); } })), /SMTP offline/);
    delete process.env.SMTP_HOST;
    await assert.rejects(sendEmail(message), /SMTP/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
