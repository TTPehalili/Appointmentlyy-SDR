/**
 * Signature checks for public webhooks (server-only, node:crypto, no SDKs).
 *
 * - Resend signs with Svix: `svix-id`, `svix-timestamp` and `svix-signature` headers; the signed
 *   content is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 keyed with the base64 part of the
 *   `whsec_...` secret, base64 digest; the header is a space-separated list of `v1,<sig>` entries.
 * - ElevenLabs signs post-call webhooks with `ElevenLabs-Signature: t=<unix>,v0=<hex>`, where the
 *   hex is HMAC-SHA256 over `${t}.${rawBody}` keyed with the webhook secret (their SDK accepts
 *   timestamps up to 30 minutes old).
 *
 * Always verify against the raw request body, never re-serialised JSON.
 */
import crypto from 'node:crypto';

/** Constant-time string comparison (hashing both sides first gives equal-length buffers). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

export type SignatureResult = { ok: true } | { ok: false; reason: string };

const SVIX_TOLERANCE_SECONDS = 5 * 60;
const ELEVENLABS_TOLERANCE_SECONDS = 30 * 60;

export function verifySvixSignature(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds?: number;
}): SignatureResult {
  const { secret, id, timestamp, signature, rawBody } = input;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing svix headers' };
  const ts = Number(timestamp);
  if (!/^\d{1,12}$/.test(timestamp) || !Number.isFinite(ts)) return { ok: false, reason: 'bad svix-timestamp' };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: 'svix-timestamp outside tolerance' };

  const keyPart = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(keyPart, 'base64');
  if (key.length === 0) return { ok: false, reason: 'webhook secret is not a valid whsec_ value' };
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');

  const candidates = signature
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const comma = s.indexOf(',');
      return comma > 0 ? { version: s.slice(0, comma), sig: s.slice(comma + 1) } : null;
    })
    .filter((x): x is { version: string; sig: string } => x !== null && x.version === 'v1');
  if (candidates.length === 0) return { ok: false, reason: 'no v1 signature' };
  let match = false;
  for (const c of candidates) if (safeEqual(c.sig, expected)) match = true;
  return match ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

export function verifyElevenLabsSignature(input: {
  secret: string;
  header: string | null;
  rawBody: string;
  nowSeconds?: number;
}): SignatureResult {
  const { secret, header, rawBody } = input;
  if (!header) return { ok: false, reason: 'missing ElevenLabs-Signature header' };
  let t: string | null = null;
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const p = part.trim();
    if (p.startsWith('t=')) t = p.slice(2);
    else if (p.startsWith('v0=')) sigs.push(p.slice(3));
  }
  if (!t || sigs.length === 0) return { ok: false, reason: 'malformed ElevenLabs-Signature header' };
  if (!/^\d{1,12}$/.test(t)) return { ok: false, reason: 'bad signature timestamp' };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(t)) > ELEVENLABS_TOLERANCE_SECONDS) return { ok: false, reason: 'signature timestamp outside tolerance' };
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  let match = false;
  for (const s of sigs) if (safeEqual(s.toLowerCase(), expected)) match = true;
  return match ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

/** The configured webhook secret (trimmed), or null when the env var is unset or blank. */
export function webhookSecret(envName: string): string | null {
  const v = (process.env[envName] || '').trim();
  return v || null;
}

const lastWarned = new Map<string, number>();

/** Log a webhook rejection at most once a minute per route (a flood of forged calls can't flood the logs). */
export function logRejection(route: string, message: string) {
  const now = Date.now();
  if (now - (lastWarned.get(route) ?? 0) < 60_000) return;
  lastWarned.set(route, now);
  console.error(`[${route}] ${message}`);
}

/**
 * For an unsigned call when no secret is configured: refuse in production (with a log line naming
 * the env var to set), allow in development so local testing keeps working.
 */
export function allowUnsignedWithoutSecret(route: string, envName: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  logRejection(route, `Refused an unsigned webhook call. Set ${envName} to this endpoint's signing secret to accept provider webhooks.`);
  return false;
}
