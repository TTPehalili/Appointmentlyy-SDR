/**
 * Server-only encryption for secrets clients connect (API keys, OAuth tokens, passwords).
 *
 * AES-256-GCM. The key comes from ENCRYPTION_KEY if set, otherwise it is derived from AUTH_SECRET
 * with HKDF (so no extra setting is needed). Ciphertexts are versioned ("v1.") so the key can be
 * rotated later. Fails closed: no fallback key, no "store it unencrypted", no "return the raw input".
 */
import crypto from 'node:crypto';

const VERSION = 'v1';

function masterKey(): Buffer {
  const explicit = (process.env.ENCRYPTION_KEY || '').trim();
  if (explicit) {
    const raw = /^[A-Za-z0-9+/=_-]{43,}$/.test(explicit) ? Buffer.from(explicit, 'base64') : Buffer.from(explicit, 'utf8');
    if (raw.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 bytes.');
    return crypto.createHash('sha256').update(raw).digest();
  }
  const secret = process.env.AUTH_SECRET || '';
  if (secret.length < 32) throw new Error('Set ENCRYPTION_KEY or AUTH_SECRET (32+ characters) before storing secrets.');
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'appointmentlyy', 'tenant-secrets-v1', 32));
}

const b64 = (b: Buffer) => b.toString('base64url');

/** Encrypt text. `context` (e.g. "TENANT|provider") is bound in, so a secret can't be moved to another record. */
export function seal(plainText: string, context = ''): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join('.');
}

/** Decrypt text sealed with the same context. Throws if it was tampered with or the key is wrong. */
export function open(sealed: string, context = ''): string {
  const [version, ivB64, tagB64, bodyB64] = String(sealed || '').split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || bodyB64 === undefined) throw new Error('Unrecognised secret format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64url'));
  if (context) decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** "••••••••3f9a": safe to show in the UI. */
export function maskSecret(secret: string, visible = 4): string {
  const s = String(secret || '');
  if (s.length <= visible) return '••••';
  return `••••••••${s.slice(-visible)}`;
}
