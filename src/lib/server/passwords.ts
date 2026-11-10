/**
 * Server-only password hashing and reset links. Passwords are optional: people can always sign in
 * with an emailed link instead. Only scrypt hashes are stored (lib/server/tenantStore).
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { getAppBaseUrl, signAuthToken } from '@/lib/authToken';
import { sendAuthEmail } from '@/lib/authMailer';
import type { Credential } from '@/lib/server/tenantStore';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export const RESET_TTL_SECONDS = 30 * 60;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Spend the same time as a real check so response timing doesn't reveal who has a password.
    await scrypt(password, crypto.randomBytes(16), KEYLEN, PARAMS);
    return false;
  }
  const [scheme, n, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, { ...PARAMS, N: Number(n) || PARAMS.N });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Simple, explainable rules: 10+ characters, not all one kind, not the email. */
export function passwordProblem(password: string, email: string): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[^A-Za-z]/.test(password)) return 'Mix letters with numbers or symbols.';
  if (password.toLowerCase().includes(email.split('@')[0].toLowerCase())) return 'Don’t use your email name in your password.';
  return null;
}

/**
 * Fingerprint of the current password state. Put in reset links so a link stops working as soon as
 * the password changes (i.e. each link works once).
 */
export function credentialFingerprint(cred: Credential | null): string {
  return crypto.createHash('sha256').update(cred ? `${cred.passwordHash}|${cred.updatedAt}` : 'none').digest('base64url').slice(0, 22);
}

export async function sendPasswordReset(opts: {
  email: string;
  name: string;
  cred: Credential | null;
  tenantCode: string;
  tenantName: string;
  requestOrigin: string;
}): Promise<{ delivered: boolean; resetUrl: string; error?: string }> {
  const token = signAuthToken(
    {
      typ: 'reset',
      email: opts.email,
      role: 'Rep', // not used for resets; the role comes from the member record at sign-in
      tenantName: opts.tenantName,
      tenantCode: opts.tenantCode,
      repName: opts.name,
      nonce: credentialFingerprint(opts.cred),
    },
    RESET_TTL_SECONDS,
  );
  const resetUrl = `${getAppBaseUrl(opts.requestOrigin)}/login/reset?token=${encodeURIComponent(token)}`;
  const sent = await sendAuthEmail(opts.email, {
    kind: 'reset',
    recipientName: (opts.name || opts.email).split(/[ @]/)[0] || 'there',
    workspaceName: opts.tenantName,
    role: '',
    loginUrl: resetUrl,
    expiresText: '30 minutes',
    logoUrl: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://app.appointmentlyy.com').replace(/\/$/, '')}/appointmentlyy-logo.png`,
  });
  return { delivered: sent.ok, resetUrl, error: sent.ok ? undefined : sent.error };
}
