import { NextRequest, NextResponse } from 'next/server';
import { GRANTABLE, PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { displayNameFor, seatsUsed } from '@/lib/server/tenancy';
import { avatarSrcs } from '@/lib/server/avatars';
import { getServerSession, hasRank } from '@/lib/server/session';

/**
 * GET /api/tenant/members
 * Members of the signed-in user's current workspace (Supervisor+). The workspace comes from the
 * session only, so one client can never list another client's people.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!hasRank(session, 'Supervisor')) return NextResponse.json({ success: false, error: 'Not allowed.' }, { status: 403 });

  const store = getTenantStore();
  const tenant = session.identity.tenant;
  const members = await store.listMembers({ tenantCode: tenant.code });
  const visible = members.filter((m) => m.status !== 'removed');
  const avatars = await avatarSrcs(tenant.code, visible.map((m) => ({ email: m.email, name: displayNameFor(m.email, m.name) })));

  return NextResponse.json(
    {
      success: true,
      tenant: { code: tenant.code, name: tenant.name, seatLimit: tenant.code === PLATFORM_TENANT_CODE ? 0 : tenant.seatLimit },
      seatsUsed: seatsUsed(members),
      canManage: hasRank(session, 'Admin'),
      grantable: (GRANTABLE[session.role] ?? []).filter((r) => tenant.code === PLATFORM_TENANT_CODE || r !== 'Super Admin'),
      me: session.email,
      members: visible.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        role: m.role,
        status: m.status,
        invitedBy: m.invitedBy,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt,
        lastLoginAt: m.lastLoginAt,
        avatar: avatars[m.email.toLowerCase()] ?? null,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
