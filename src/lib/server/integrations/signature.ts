/**
 * Webhook signing (see WEBHOOK_SIGNATURE_HEADER in lib/integrations.ts):
 *   X-Appointmentlyy-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 */
import crypto from 'node:crypto';

export const SIGNING_SECRET_PREFIX = 'whsec_';

/** "whsec_" + 32 random bytes (base64url). Shown to the admin once; stored sealed. */
export function newSigningSecret(): string {
  return SIGNING_SECRET_PREFIX + crypto.randomBytes(32).toString('base64url');
}

export const secretHint = (secret: string) => secret.slice(-4);

export function signatureHeader(secret: string, rawBody: string, timestampSec = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex');
  return `t=${timestampSec},v1=${v1}`;
}

/**
 * Receiver-side check (also used by our tests and docs): constant-time compare, timestamp within
 * `toleranceSec` of now. Accepts several v1 values (sent during secret rotation by some providers).
 */
export function verifySignature(secret: string, rawBody: string, header: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const parts = String(header || '').split(',').map((p) => p.trim());
  const t = Number(parts.find((p) => p.startsWith('t='))?.slice(2));
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!Number.isInteger(t) || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'), 'utf8');
  return sigs.some((s) => {
    const got = Buffer.from(s, 'utf8');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}
