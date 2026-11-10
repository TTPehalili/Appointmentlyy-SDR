/** Shared helpers for the /api/platform/announcements route handlers. */
import { NextRequest, NextResponse } from 'next/server';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { validateAnnouncement, type AnnouncementInput } from '@/lib/announcements';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getServerSession, type ServerSession } from '@/lib/server/session';

/** Platform staff only. Returns the session, or the error response to send. */
export async function requireStaff(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!session.isPlatformAdmin) return NextResponse.json({ success: false, error: 'Platform staff only.' }, { status: 403 });
  return session;
}

export const badRequest = (error: string, field?: string) => NextResponse.json({ success: false, error, field }, { status: 400 });

/** Full validation, including that every targeted workspace exists. */
export async function validateWithTenants(raw: Record<string, unknown>): Promise<{ value: AnnouncementInput } | { error: NextResponse }> {
  const v = validateAnnouncement(raw);
  if (!v.ok) return { error: badRequest(v.error, v.field) };
  if (v.value.audience === 'workspaces') {
    const known = new Set((await getTenantStore().listTenants()).map((t) => t.code));
    const unknown = v.value.workspaceCodes.filter((c) => !known.has(c));
    if (unknown.length) return { error: badRequest(`Unknown workspace: ${unknown.join(', ')}.`, 'workspaceCodes') };
  }
  return { value: v.value };
}

export async function auditAnnouncement(session: ServerSession, action: string, target: string, detail: Record<string, unknown> = {}) {
  try {
    await getTenantStore().addAudit({ actorEmail: session.email, tenantCode: PLATFORM_TENANT_CODE, action, target, detail });
  } catch (err) {
    console.error('[platform/announcements audit]', err);
  }
}
