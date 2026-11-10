import { NextRequest, NextResponse } from 'next/server';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getServerSession, hasRank } from '@/lib/server/session';

/** GET /api/tenant/audit: sign-ins, invites and access changes in the current workspace (Admin+). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!hasRank(session, 'Admin')) return NextResponse.json({ success: false, error: 'Not allowed.' }, { status: 403 });
  const entries = await getTenantStore().listAudit({ tenantCode: session.tenantCode, limit: 200 });
  return NextResponse.json({ success: true, entries }, { headers: { 'Cache-Control': 'no-store' } });
}
