/**
 * Server-side eOTP adapter.
 * The service generates SMS OTP codes; never produce or expose them in the app.
 * Source: https://eotp.com.vn/docs/
 */
const EOTP_BASE = 'https://eotp.com.vn/api/v1';
const TIMEOUT_MS = 40000;

export const isEotpConfigured = () => {
  const apiKey = process.env.EASYOTP_API_KEY?.trim();
  const secret = process.env.EASYOTP_API_SECRET?.trim();
  return Boolean(apiKey?.startsWith('eo_live_') && secret?.startsWith('eo_sec_'));
};

export class EotpError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'EotpError';
    this.code = code;
    this.status = status;
  }
}

async function eotpPost(endpoint, payload) {
  if (!isEotpConfigured()) throw new EotpError('not_configured', 503);
  let response;
  try {
    response = await fetch(EOTP_BASE + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.EASYOTP_API_KEY.trim(),
        'X-Api-Secret': process.env.EASYOTP_API_SECRET.trim(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new EotpError('unavailable', 503);
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new EotpError('unavailable', 503);
  }
  if (!response.ok || result?.ok !== true) {
    // Avoid surfacing provider messages, user data or authentication secrets.
    throw new EotpError(
      typeof result?.error === 'string' ? result.error : 'unavailable',
      response.status || 503
    );
  }
  return result;
}

export async function sendPhoneOtp(phone) {
  const result = await eotpPost('/otp/send', { phone, channel: 'sms' });
  if (!/^[a-f0-9]{32}$/i.test(result.request_id || '')) {
    throw new EotpError('invalid_response', 503);
  }
  if (result.status === 'failed') throw new EotpError('send_failed', 503);
  const ttlSeconds = Number(result.expires_in);
  return {
    requestId: result.request_id,
    expiresIn: Number.isFinite(ttlSeconds) && ttlSeconds >= 60 && ttlSeconds <= 900
      ? ttlSeconds
      : 300,
  };
}

export async function verifyPhoneOtp(requestId, code) {
  const result = await eotpPost('/otp/verify', { request_id: requestId, code });
  if (result.verified !== true) throw new EotpError('wrong_code', 400);
  return true;
}
