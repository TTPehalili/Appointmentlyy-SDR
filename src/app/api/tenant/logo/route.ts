import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { getTenantStore } from '@/lib/server/tenantStore';
import { readCapped } from '@/lib/server/clientProjects/http';
import { LogoRefused, LogoStorageError, clearTenantLogo, saveTenantLogo, tenantLogoMeta } from '@/lib/server/tenantLogos';
import { LOGO_MAX_BYTES, logoSrc } from '@/lib/tenantLogo';

const NO_STORE = { 'Cache-Control': 'no-store' };
const out = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const MIGRATION = 'Workspace logos are not set up in the database yet. Run supabase/migrations/20261128000000_tenant_logo.sql.';

/**
 * The signed-in workspace only. `?t=<code>` may name it explicitly; naming any other workspace is refused (403), so an
 * Admin of one workspace can never touch another workspace's logo.
 */
function ownWorkspace(req: NextRequest, session: ServerSession): NextResponse | null {
  const t = (req.nextUrl.searchParams.get('t') || '').trim().toUpperCase();
  if (t && t !== session.tenantCode) return out({ success: false, error: 'You can only change your own workspace’s logo.' }, 403);
  return null;
}

async function editor(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return out({ success: false, error: 'Please sign in again.' }, 401);
  const other = ownWorkspace(req, session);
  if (other) return other;
  if (!hasRank(session, 'Admin')) return out({ success: false, error: 'Only admins can change the workspace logo.' }, 403);
  if (session.tenantCode === PLATFORM_TENANT_CODE) return out({ success: false, error: 'The Appointmentlyy workspace always shows the Appointmentlyy mark.' }, 400);
  if (!rateLimit(`tenant-logo:${session.email}`, 20, 10 * 60_000)) return out({ success: false, error: 'Too many changes. Wait a few minutes and try again.' }, 429);
  return session;
}

const view = (m: Awaited<ReturnType<typeof tenantLogoMeta>>) => (m ? { url: logoSrc(m.version), mime: m.mime, size: m.size, version: m.version, updatedAt: m.updatedAt } : null);

/** GET /api/tenant/logo: the signed-in workspace's logo (any member), and whether this person may change it. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return out({ success: false, error: 'Please sign in again.' }, 401);
  const other = ownWorkspace(req, session);
  if (other) return other;
  const platform = session.tenantCode === PLATFORM_TENANT_CODE;
  return out({ success: true, tenantCode: session.tenantCode, platform, logo: view(await tenantLogoMeta(session.tenantCode)), canEdit: hasRank(session, 'Admin') && !platform, maxBytes: LOGO_MAX_BYTES });
}

/**
 * POST /api/tenant/logo   body: the image bytes (PNG, JPG, WebP or SVG, at most 512 KB)
 * Workspace Admins (and platform staff signed in to that workspace) set their own workspace's logo. The bytes decide the
 * type; SVG is stored only as the sanitised rebuild.
 */
export async function POST(req: NextRequest) {
  const session = await editor(req);
  if (session instanceof NextResponse) return session;
  const bytes = await readCapped(req, LOGO_MAX_BYTES);
  if (!bytes) return out({ success: false, error: `That logo is too large. Use one under ${LOGO_MAX_BYTES / 1024} KB.` }, 413);
  try {
    const { meta, changed } = await saveTenantLogo(session.tenantCode, bytes, session.email);
    if (changed) await getTenantStore().addAudit({ actorEmail: session.email, tenantCode: session.tenantCode, action: 'tenant.logo', target: session.tenantCode, detail: { mime: meta.mime, size: meta.size, version: meta.version } });
    return out({ success: true, changed, logo: view(meta) });
  } catch (err) {
    if (err instanceof LogoRefused) return out({ success: false, error: err.message }, 400);
    if (err instanceof LogoStorageError) return out({ success: false, error: MIGRATION }, 503);
    console.error('[tenant/logo POST]', err instanceof Error ? err.message : err);
    return out({ success: false, error: 'Could not save the logo.' }, 500);
  }
}

/** DELETE /api/tenant/logo: remove the workspace's logo (its initials show again). Admins only. */
export async function DELETE(req: NextRequest) {
  const session = await editor(req);
  if (session instanceof NextResponse) return session;
  try {
    const removed = await clearTenantLogo(session.tenantCode);
    if (removed) await getTenantStore().addAudit({ actorEmail: session.email, tenantCode: session.tenantCode, action: 'tenant.logo', target: session.tenantCode, detail: { removed: true } });
    return out({ success: true, removed, logo: null });
  } catch (err) {
    if (err instanceof LogoStorageError) return out({ success: false, error: MIGRATION }, 503);
    console.error('[tenant/logo DELETE]', err instanceof Error ? err.message : err);
    return out({ success: false, error: 'Could not remove the logo.' }, 500);
  }
}
