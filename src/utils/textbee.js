/**
 * textbee SMS gateway for PlantHub password recovery.
 * Docs: https://textbee.dev/docs/sending-sms/sending-sms
 *
 * Only the backend holds the API key. The free plan uses the account's
 * default registered Android phone, so no phone identifier is needed here.
 */
const SEND_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';
const REQUEST_TIMEOUT_MS = 15000;

export class TextbeeError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'TextbeeError';
    this.code = code;
    this.status = status;
  }
}

export function isTextbeeConfigured() {
  const key = process.env.TEXTBEE_API_KEY?.trim();
  return Boolean(key && !/^(your[_ -]?api[_ -]?key|replace[_ -]?me|\.\.\.)$/i.test(key));
}

/**
 * Queue a genuine SMS. 200 indicates accepted/queued, not delivered.
 * The OTP is generated and verified by PlantHub; textbee only transports it.
 */
export async function sendTextbeeOtp({ phone, otp }) {
  if (!isTextbeeConfigured()) throw new TextbeeError('not_configured');

  if (!/^\+\d{10,15}$/.test(String(phone)) || !/^\d{6}$/.test(String(otp))) {
    throw new TextbeeError('invalid_input', 400);
  }

  const body = {
    recipients: [phone],
    message: `PlantHub: Ma OTP dat lai mat khau cua ban la ${otp}. Hieu luc 10 phut. Khong chia se ma nay.`,
  };

  let response;
  try {
    response = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.TEXTBEE_API_KEY.trim(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TextbeeError('network_unavailable');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new TextbeeError('invalid_response');
  }

  if (!response.ok) {
    const code = response.status === 429 ? 'quota_exceeded'
      : response.status === 401 || response.status === 403 ? 'unauthorized'
      : response.status === 400 ? 'not_ready' : 'unavailable';
    throw new TextbeeError(code, response.status);
  }

  const result = payload?.data;
  if (result?.success !== true
    || typeof result.smsBatchId !== 'string'
    || !/^[a-z0-9_-]{8,100}$/i.test(result.smsBatchId)
    || result.recipientCount !== 1) {
    throw new TextbeeError('invalid_response');
  }

  return { batchId: result.smsBatchId, queued: true };
}
