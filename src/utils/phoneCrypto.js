import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';
let cachedKey;
let cachedDigestKey;
let cachedSource;

export function requirePhoneEncryptionKey() {
  const configured = process.env.PHONE_ENCRYPTION_KEY;
  if (!configured || !/^[a-fA-F0-9]{64}$/.test(configured)) {
    throw new Error('PHONE_ENCRYPTION_KEY must be a 32-byte (64-character) hex key. Set it on the backend before starting.');
  }
  if (configured !== cachedSource) {
    cachedKey = Buffer.from(configured, 'hex');
    cachedDigestKey = Buffer.from(hkdfSync('sha256', cachedKey, Buffer.alloc(0), 'planthub-phone-lookup-v1', 32));
    cachedSource = configured;
  }
  return cachedKey;
}

// Canonicalize Vietnamese local/international dialing forms, preserving other countries.
export function normalizePhone(phone) {
  const compact = String(phone ?? '').trim().replace(/[\s\-().]/g, '');
  if (/^0\d{9,10}$/.test(compact)) return '+84' + compact.slice(1);
  if (/^84\d{9,10}$/.test(compact)) return '+' + compact;
  return compact;
}

export function phoneLookupHash(phone) {
  if (!phone || !String(phone).trim()) return null;
  requirePhoneEncryptionKey();
  return createHmac('sha256', cachedDigestKey).update(normalizePhone(phone), 'utf8').digest('hex');
}

export function isEncryptedPhone(phone) {
  return typeof phone === 'string' && phone.startsWith(PREFIX);
}

export function encryptPhone(phone) {
  if (phone === null || phone === undefined || !String(phone).trim()) return null;
  const key = requirePhoneEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(phone).trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, data]).toString('base64');
}

export function decryptPhone(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!isEncryptedPhone(value)) return value; // Existing plaintext only until one-time migration completes.
  const key = requirePhoneEncryptionKey();
  const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
  if (payload.length < 29) throw new Error('Encrypted phone data is invalid');
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
