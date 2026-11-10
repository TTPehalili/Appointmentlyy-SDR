/**
 * Server-side session: the signed httpOnly `appy_auth` cookie, re-checked against storage on
 * every request so removing a member, suspending a workspace or changing a password takes effect
 * immediately. Role and workspace always come from here, never from the request body, query or
 * headers.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, signAuthToken, verifyAuthToken } from '@/lib/authToken';
import { ROLE_RANK, type Role } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { resolveIdentity, type Actor, type ResolvedIdentity } from '@/lib/server/tenancy';
import { credentialFingerprint } from '@/lib/server/passwords';

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export interface ServerSession extends Actor {
  identity: ResolvedIdentity;
}

type CookieSource = { cookies: { get(name: string): { value: string } | undefined } };

export async function getServerSession(req: NextRequest | CookieSource): Promise<ServerSession | null> {
  const payload = verifyAuthToken(req.cookies.get(AUTH_COOKIE_NAME)?.value, ['session']);
  if (!payload) return null;
  const identity = await resolveIdentity(payload.email, payload.tenantCode, payload.repName);
  if (!identity) return null;

  const member = identity.member;
  if (!identity.isPlatformAdmin && member) {
    // Only accepted members hold sessions. A removed person who was re-invited can't reuse an old
    // cookie: it predates their latest acceptance.
    if (member.status !== 'active') return null;
    if (member.joinedAt && payload.iat * 1000 < Date.parse(member.joinedAt) - 5000) return null;
  }
  // A password change or reset signs out every other session.
  const cred = await getTenantStore().getCredential(payload.email);
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
    branding: t.branding,
    modules: t.modules,
  };
}
