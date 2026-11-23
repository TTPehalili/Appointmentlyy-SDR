import { NextRequest, NextResponse } from 'next/server';
import { GRANTABLE, PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { displayNameFor, seatsUsed } from '@/lib/server/tenancy';
import { avatarSrcs } from '@/lib/server/avatars';
import { getServerSession, hasRank } from '@/lib/server/session';
import { readDelegates } from '@/lib/server/emailDelegation';
import { serverSender } from '@/lib/server/sendingPolicy';

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

  // Email delegates: only the platform owner, in the platform workspace, sees or manages them.
  const ownerView = session.isPlatformAdmin && tenant.code === PLATFORM_TENANT_CODE;
  const delegates = ownerView ? readDelegates(tenant.branding) : [];
  const ownerNames = new Map(members.map((m) => [m.email.toLowerCase(), displayNameFor(m.email, m.name)]));
  const delegationOf = (m: { email: string; role: string }) => {
    const d = delegates.find((x) => x.delegateEmail === m.email.toLowerCase());
    return {
      // Who this member sends as (null = nobody), and whether that is the signed-in owner.
      sendsAs: d ? { name: serverSender({ email: d.ownerEmail, name: d.ownerEmail === session.email.toLowerCase() ? session.name : ownerNames.get(d.ownerEmail) ?? displayNameFor(d.ownerEmail) }).name, mine: d.ownerEmail === session.email.toLowerCase() } : null,
      canSendAsMe: m.email.toLowerCase() !== session.email.toLowerCase() && m.role !== 'Super Admin',
    };
  };

  return NextResponse.json(
    {
      success: true,
      ...(ownerView ? { emailDelegation: { ownerName: serverSender(session).name } } : {}),
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
        ...(ownerView ? delegationOf(m) : {}),
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
