import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { resolveIdentity } from '@/lib/server/tenancy';
import { getServerSession, publicIdentity, setSessionCookie } from '@/lib/server/session';

/**
 * POST /api/auth/switch  { tenantCode }
 * Moves the session to another workspace the user belongs to. Platform staff can open any
 * workspace ("view as"); that is written to the audit log.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tenantCode = String(body?.tenantCode || '').trim().toUpperCase();
  const identity = tenantCode ? await resolveIdentity(session.email, tenantCode, session.name) : null;
  if (!identity || identity.tenant.code !== tenantCode) {
    return NextResponse.json({ success: false, error: 'You don’t have access to that workspace.' }, { status: 403 });
  }

  if (identity.isPlatformAdmin && tenantCode !== PLATFORM_TENANT_CODE) {
    await getTenantStore().addAudit({
      actorEmail: session.email,
      tenantCode,
      action: 'platform.view_as',
      target: tenantCode,
      detail: { from: session.tenantCode },
    });
  }

  const res = NextResponse.json({ success: true, identity: publicIdentity(identity) });
  await setSessionCookie(res, identity);
  return res;
}
