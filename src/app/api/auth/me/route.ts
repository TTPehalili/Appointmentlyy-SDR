import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, publicIdentity, clearSessionCookie } from '@/lib/server/session';
import { listWorkspacesFor } from '@/lib/server/tenancy';
import { getTenantStore } from '@/lib/server/tenantStore';
import { tenantLogoMeta } from '@/lib/server/tenantLogos';
import { logoSrc } from '@/lib/tenantLogo';
import { sendsAsFor } from '@/lib/server/sendingPolicy';

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
  // The reads are independent: one round trip instead of several in a row. (The logo read is cached and never fails.)
  const [tenants, cred, logo] = await Promise.all([listWorkspacesFor(session.email), getTenantStore().getCredential(session.email), tenantLogoMeta(session.tenantCode)]);
  const workspaces = tenants.map((t) => ({
    code: t.code,
    name: t.name,
    displayName: t.branding.displayName || t.name,
    logoInitials: t.branding.logoInitials || '',
    status: t.status,
  }));
  // Everyone must create a password on first sign-in; the app sends them to /login/set-password until they do.
  const hasPassword = Boolean(cred);
  // An owner's email delegate: whose name and address their email goes out under (null for everyone else).
  const sendsAs = await sendsAsFor(session).catch(() => null);
  return NextResponse.json(
    // logoUrl: the current workspace's logo for the shell's workspace tile (null = its initials).
    { success: true, identity: { ...publicIdentity(session.identity), logoUrl: logo ? logoSrc(logo.version) : null, sendsAs }, workspaces, hasPassword, sendsAs },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
