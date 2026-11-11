/**
 * Signed, expiring auth tokens (HMAC-SHA256) for email login links, invites and server sessions.
 * Server-only. Requires AUTH_SECRET (>= 32 chars). Never import this from client components.
 */
import crypto from 'node:crypto';
import type { UserRole } from '@/lib/session';
import type { Role } from '@/lib/roles';

export type AuthTokenType = 'login' | 'invite' | 'session' | 'reset';

export interface AuthTokenPayload {
  typ: AuthTokenType;
  email: string;
  /** Informational only: the server re-reads the member's role on every request. */
  role: UserRole | Role;
  tenantName: string;
  tenantCode: string;
  repName: string;
  invitedBy?: string;
  /** Invite tokens: must match the member's current invite nonce (newest invite wins). */
  nonce?: string;
  iat: number;
  exp: number;
}

export const AUTH_COOKIE_NAME = 'appy_auth';

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_SECRET is not configured (needs at least 32 characters).');
  }
  return s;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64url');

function hmac(body: string): string {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
}

export function signAuthToken(
  payload: Omit<AuthTokenPayload, 'iat' | 'exp'>,
  ttlSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: AuthTokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const body = b64url(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

export function verifyAuthToken(
  token: string | undefined | null,
  allowedTypes: AuthTokenType[]
): AuthTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  let expected: string;
  try {
    expected = hmac(body);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as AuthTokenPayload;
    if (!allowedTypes.includes(payload.typ)) return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Base URL used in emailed links. In production this is fixed (never derived from request headers). */
export function getAppBaseUrl(requestOrigin?: string): string {
  if (process.env.NODE_ENV !== 'production' && requestOrigin) return requestOrigin;
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://app.appointmentlyy.com').replace(/\/$/, '');
}

export function getAdminEmails(): string[] {
  return (process.env.AUTH_ADMIN_EMAILS || 'emil@appointmentlyy.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Simple in-memory limiter (per server instance) to stop the endpoint being used to spam inboxes. */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

