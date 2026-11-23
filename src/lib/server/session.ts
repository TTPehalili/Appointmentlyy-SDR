/**
 * Server-side session: the signed httpOnly `appy_auth` cookie, re-checked against storage on
 * every request so removing a member, suspending a workspace or changing a password takes effect
 * immediately. Role and workspace always come from here, never from the request body, query or
 * headers.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, signAuthToken, verifyAuthToken } from '@/lib/authToken';
import { ROLE_RANK, type Role } from '@/lib/roles';
import { getTenantStore, publicBranding } from '@/lib/server/tenantStore';
import { resolveIdentity, type Actor, type ResolvedIdentity } from '@/lib/server/tenancy';
import { credentialFingerprint } from '@/lib/server/passwords';
import { forgetSession, memoSession } from '@/lib/server/sessionMemo';

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface ServerSession extends Actor {
  identity: ResolvedIdentity;
}

type CookieSource = { cookies: { get(name: string): { value: string } | undefined } };

export async function getServerSession(req: NextRequest | CookieSource): Promise<ServerSession | null> {
  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  // Signature and expiry are verified on every call; only the storage check behind them is shared.
  const payload = verifyAuthToken(cookie, ['session']);
  if (!payload || !cookie) return null;
  // The proxy gate, the route handler and a page's parallel API calls all ask the same question
  // within moments: they share one storage check for up to 3 seconds (trade-off in sessionMemo.ts).
  return memoSession(cookie, () => checkSession(payload));
}

/** Stop reusing the storage check for this request's session cookie (logout, workspace switch). */
export function forgetSessionOf(req: NextRequest | CookieSource) {
  forgetSession(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

/** The live check against storage. Everything the session depends on is read in one round trip. */
async function checkSession(payload: NonNullable<ReturnType<typeof verifyAuthToken>>): Promise<ServerSession | null> {
  const [identity, cred] = await Promise.all([
    resolveIdentity(payload.email, payload.tenantCode, payload.repName),
    getTenantStore().getCredential(payload.email),
  ]);
  if (!identity) return null;

  const member = identity.member;
  if (!identity.isPlatformAdmin && member) {
    // Only accepted members hold sessions. A removed person who was re-invited can't reuse an old
    // cookie: it predates their latest acceptance.
    if (member.status !== 'active') return null;
    if (member.joinedAt && payload.iat * 1000 < Date.parse(member.joinedAt) - 5000) return null;
  }
  // A password change or reset signs out every other session.
  if (payload.nonce !== credentialFingerprint(cred)) return null;

  return {
    email: identity.email,
    name: identity.name,
    role: identity.role,
    tenantCode: identity.tenant.code,
    isPlatformAdmin: identity.isPlatformAdmin,
    identity,
  };
}

export function hasRank(session: ServerSession, min: Role): boolean {
  return session.isPlatformAdmin || ROLE_RANK[session.role] >= ROLE_RANK[min];
}

/** Issue (or replace) the session cookie for an identity. */
export async function setSessionCookie(res: NextResponse, identity: ResolvedIdentity) {
  const cred = await getTenantStore().getCredential(identity.email);
  const token = signAuthToken(
    {
      typ: 'session',
      email: identity.email,
      role: identity.role,
      tenantName: identity.tenant.name,
      tenantCode: identity.tenant.code,
      repName: identity.name,
      nonce: credentialFingerprint(cred),
    },
    SESSION_TTL_SECONDS,
  );
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(AUTH_COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** What the browser is allowed to know about the signed-in user and their workspace. */
export function publicIdentity(identity: ResolvedIdentity) {
  const t = identity.tenant;
  return {
    email: identity.email,
    repName: identity.name,
    role: identity.role,
    tenantCode: t.code,
    tenantName: t.name,
    isPlatformAdmin: identity.isPlatformAdmin,
    branding: publicBranding(t.branding),
    modules: t.modules,
  };
}
