import { NextRequest, NextResponse } from 'next/server';
import { getTenantStore } from '@/lib/server/tenantStore';
import { TenancyError, cleanBranding } from '@/lib/server/tenancy';
import { getServerSession, hasRank } from '@/lib/server/session';

/** GET /api/tenant/branding: the current workspace's brand (any signed-in member). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  const t = session.identity.tenant;
  return NextResponse.json({ success: true, tenantCode: t.code, tenantName: t.name, branding: t.branding, canEdit: hasRank(session, 'Admin') });
}

/**
 * PATCH /api/tenant/branding  { brandColor?, displayName?, logoInitials?, supportEmail? }
 * Admins edit their own workspace's brand; colours that fail contrast checks are refused.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!hasRank(session, 'Admin')) return NextResponse.json({ success: false, error: 'Only admins can change branding.' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const store = getTenantStore();
    const tenant = session.identity.tenant;
    const branding = cleanBranding(body, tenant.branding);
    const updated = await store.updateTenant(tenant.code, { branding });
    await store.addAudit({ actorEmail: session.email, tenantCode: tenant.code, action: 'tenant.branding', target: tenant.code, detail: { ...branding } });
    return NextResponse.json({ success: true, branding: updated?.branding ?? branding });
  } catch (e) {
    if (e instanceof TenancyError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    console.error('[tenant/branding]', e);
    return NextResponse.json({ success: false, error: 'Could not save branding.' }, { status: 500 });
  }
}
