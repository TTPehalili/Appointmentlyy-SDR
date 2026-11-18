import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, publicIdentity, clearSessionCookie } from '@/lib/server/session';
import { listWorkspacesFor } from '@/lib/server/tenancy';
import { getTenantStore } from '@/lib/server/tenantStore';

/**
 * GET /api/auth/me
 * The signed-in user as the server sees them (role, workspace, branding) plus the workspaces they
 * can switch to. 401 clears the cookie: the browser should go to /login.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    const res = NextResponse.json({ success: false, error: 'Not signed in.' }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }
  // Both reads are independent: one round trip instead of two in a row.
  const [tenants, cred] = await Promise.all([listWorkspacesFor(session.email), getTenantStore().getCredential(session.email)]);
  const workspaces = tenants.map((t) => ({
    code: t.code,
    name: t.name,
    displayName: t.branding.displayName || t.name,
    logoInitials: t.branding.logoInitials || '',
    status: t.status,
  }));
  // Everyone must create a password on first sign-in; the app sends them to /login/set-password until they do.
  const hasPassword = Boolean(cred);
  return NextResponse.json(
    { success: true, identity: publicIdentity(session.identity), workspaces, hasPassword },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
