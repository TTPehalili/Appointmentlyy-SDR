/**
 * Server-only encryption for secrets clients connect (API keys, OAuth tokens, passwords, webhook
 * signing secrets).
 *
 * AES-256-GCM with a small keyring:
 * - INTEGRATIONS_ENCRYPTION_KEY (32 random bytes, base64 or base64url) is the preferred, dedicated
 *   key. New secrets are sealed with it as "v2.<keyId>.<iv>.<tag>.<body>"; keyId is a fingerprint
 *   of the key (not secret), so the right key is picked when opening.
 * - INTEGRATIONS_ENCRYPTION_KEYS_PREVIOUS (comma-separated, same format) keeps older dedicated keys
 *   able to OPEN what they sealed after a rotation. They are never used to seal.
 * - The legacy key (ENCRYPTION_KEY, or derived from AUTH_SECRET with HKDF) still opens every "v1."
 *   blob written before the keyring. When no dedicated key is set it keeps sealing in exactly the
 *   old "v1.<iv>.<tag>.<body>" format, so nothing changes (and a rollback stays safe) until one is.
 *
 * `context` (e.g. "webhook_endpoint|<id>") is bound in as AAD, so a sealed value can't be moved to
 * another record. Fails closed: no fallback key, no "store it unencrypted", no "return the raw input".
 */
import crypto from 'node:crypto';

const V1 = 'v1';
const V2 = 'v2';
const LEGACY_ID = 'legacy';

function legacyKey(): Buffer {
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

/** A dedicated key must be exactly 32 bytes once decoded. Anything else is a configuration error. */
function parseDedicatedKey(value: string, name: string): Buffer {
  const v = value.trim();
  const raw = /^[A-Za-z0-9+/=_-]+$/.test(v) ? Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64') : Buffer.alloc(0);
  if (raw.length !== 32) throw new Error(`${name} must be 32 random bytes, base64-encoded (e.g. \`openssl rand -base64 32\`).`);
  return raw;
}

/** Public, stable identifier of a key: lets `open` pick the right key without revealing it. */
export function keyIdOf(key: Buffer): string {
  return `k${crypto.createHash('sha256').update('appointmentlyy-key-id|').update(key).digest('hex').slice(0, 10)}`;
}

interface Keyring {
  /** Key id new secrets are sealed with. */
  current: string;
  keys: Map<string, Buffer>;
}

let cached: { sig: string; ring: Keyring } | null = null;

function keyring(): Keyring {
  const dedicated = (process.env.INTEGRATIONS_ENCRYPTION_KEY || '').trim();
  const previous = (process.env.INTEGRATIONS_ENCRYPTION_KEYS_PREVIOUS || '').trim();
  const sig = crypto
    .createHash('sha256')
    .update([dedicated, previous, process.env.ENCRYPTION_KEY || '', process.env.AUTH_SECRET || ''].join('\u0000'))
    .digest('hex');
  if (cached?.sig === sig) return cached.ring;

  const keys = new Map<string, Buffer>();
  let current = LEGACY_ID;
  if (dedicated) {
    const k = parseDedicatedKey(dedicated, 'INTEGRATIONS_ENCRYPTION_KEY');
    current = keyIdOf(k);
    keys.set(current, k);
  }
  for (const p of previous.split(',').map((s) => s.trim()).filter(Boolean)) {
    const k = parseDedicatedKey(p, 'INTEGRATIONS_ENCRYPTION_KEYS_PREVIOUS');
    keys.set(keyIdOf(k), k);
  }
  // The legacy key is optional once a dedicated key exists (it only opens old blobs).
  try {
    keys.set(LEGACY_ID, legacyKey());
  } catch (err) {
    if (!dedicated) throw err;
  }
  const ring = { current, keys };
  cached = { sig, ring };
  return ring;
}

const b64 = (b: Buffer) => b.toString('base64url');

function gcmOpen(key: Buffer, ivB64: string, tagB64: string, bodyB64: string, context: string): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  if (context) decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Encrypt text. `context` (e.g. "TENANT|provider") is bound in, so a secret can't be moved to another record. */
export function seal(plainText: string, context = ''): string {
  const ring = keyring();
  const key = ring.keys.get(ring.current);
  if (!key) throw new Error('No encryption key is configured.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (context) cipher.setAAD(Buffer.from(context, 'utf8'));
  const body = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  // No dedicated key: keep writing the original v1 format, so a rollback to older code still opens it.
  if (ring.current === LEGACY_ID) return [V1, b64(iv), b64(cipher.getAuthTag()), b64(body)].join('.');
  return [V2, ring.current, b64(iv), b64(cipher.getAuthTag()), b64(body)].join('.');
}

/** Decrypt text sealed with the same context. Throws if it was tampered with or the key is unknown. */
export function open(sealed: string, context = ''): string {
  const parts = String(sealed || '').split('.');
  if (parts[0] === V1 && parts.length === 4) {
    const [, iv, tag, body] = parts;
    if (!iv || !tag) throw new Error('Unrecognised secret format.');
    return gcmOpen(legacyKey(), iv, tag, body, context);
  }
  if (parts[0] === V2 && parts.length === 5) {
    const [, kid, iv, tag, body] = parts;
    if (!kid || !iv || !tag) throw new Error('Unrecognised secret format.');
    const key = keyring().keys.get(kid);
    if (!key) throw new Error('This secret was sealed with an encryption key that is no longer configured.');
    return gcmOpen(key, iv, tag, body, context);
  }
  throw new Error('Unrecognised secret format.');
}

/** Which key sealed a blob ('legacy' for v1 blobs), e.g. to find secrets worth re-sealing after a rotation. */
export function sealedKeyId(sealed: string): string | null {
  const parts = String(sealed || '').split('.');
  if (parts[0] === V1 && parts.length === 4) return LEGACY_ID;
  if (parts[0] === V2 && parts.length === 5) return parts[1] || null;
  return null;
}

/** "••••••••3f9a": safe to show in the UI. */
export function maskSecret(secret: string, visible = 4): string {
  const s = String(secret || '');
  if (s.length <= visible) return '••••';
  return `••••••••${s.slice(-visible)}`;
}
