const isConfigured = () => {
  return (
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM
  );
};

let twilioClient = null;
const getClient = () => {
  if (!isConfigured()) return null;
  if (!twilioClient) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

/**
 * Send SMS message.
 * In dev/no-config mode, logs to console and resolves to mimic success.
 * @param {object} params
 * @param {string} params.to - Destination phone number in E.164 (e.g., +84912345678)
 * @param {string} params.body - Message content
 */
async function sendSms({ to, body }) {
  const client = getClient();
  if (!client) {
    console.warn('[SMS] Twilio not configured. Printing SMS to console instead.');
    console.info(`[SMS -> ${to}] ${body}`);
    return { sid: 'mock-sid', to, body };
  }
  return client.messages.create({
    from: process.env.TWILIO_FROM,
    to,
    body,
  });
}

module.exports = { sendSms, isConfigured };
