import { NextRequest, NextResponse } from 'next/server';
import { getTenantStore, type TenantBranding } from '@/lib/server/tenantStore';
import { getServerSession, hasRank } from '@/lib/server/session';
import { cleanSelection } from '@/lib/selectionColour';

/**
 * GET /api/tenant/appearance: the signed-in workspace's selection colours (any member).
 * `selection` holds only what the workspace overrides; a missing theme = platform default.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  const t = session.identity.tenant;
  return NextResponse.json(
    {
      success: true,
      tenantCode: t.code,
      selection: t.branding.selection ?? {},
      brandColor: t.branding.brandColor ?? null,
      canEdit: hasRank(session, 'Admin'),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * PUT /api/tenant/appearance  { light?: "#RRGGBB" | null, dark?: "#RRGGBB" | null }
 * Admins (and platform staff) replace their own workspace's selection colours. Empty, null or the
 * platform default resets that theme. Colours that fail the contrast rules are refused (400).
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!hasRank(session, 'Admin')) return NextResponse.json({ success: false, error: 'Only admins can change the appearance.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ success: false, error: 'Send { light, dark } as JSON.' }, { status: 400 });
  const src = 'selection' in body && body.selection && typeof body.selection === 'object' ? body.selection : body;
  const cleaned = cleanSelection(src);
  if (!cleaned.ok) return NextResponse.json({ success: false, error: cleaned.error, theme: cleaned.theme }, { status: 400 });

  try {
    const store = getTenantStore();
    const tenant = session.identity.tenant;
    const branding: TenantBranding = { ...tenant.branding };
    if (cleaned.value.light || cleaned.value.dark) branding.selection = cleaned.value;
    else delete branding.selection;
    const updated = await store.updateTenant(tenant.code, { branding });
    await store.addAudit({
      actorEmail: session.email,
      tenantCode: tenant.code,
      action: 'tenant.appearance',
      target: tenant.code,
      detail: { light: cleaned.value.light ?? 'default', dark: cleaned.value.dark ?? 'default' },
    });
    return NextResponse.json({ success: true, selection: updated?.branding.selection ?? cleaned.value });
  } catch (e) {
    console.error('[tenant/appearance]', e);
    return NextResponse.json({ success: false, error: 'Could not save the appearance.' }, { status: 500 });
  }
}
