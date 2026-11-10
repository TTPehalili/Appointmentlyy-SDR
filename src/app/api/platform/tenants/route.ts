import { NextRequest, NextResponse } from 'next/server';
import { EMAIL_RE, PLATFORM_TENANT_CODE } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { TenancyError, createTenant, inviteMember, seatsUsed } from '@/lib/server/tenancy';
import { getServerSession } from '@/lib/server/session';
import { sendInvite } from '@/lib/server/authLinks';

const forbidden = () => NextResponse.json({ success: false, error: 'Platform staff only.' }, { status: 403 });

/** GET /api/platform/tenants: every workspace with seat usage (platform staff only). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!session.isPlatformAdmin) return forbidden();

  const store = getTenantStore();
  const tenants = await store.listTenants();
  const rows = await Promise.all(
    tenants.map(async (t) => {
      const members = await store.listMembers({ tenantCode: t.code });
      const admins = members.filter((m) => m.role === 'Admin' && m.status !== 'removed');
      return {
        ...t,
        seatsUsed: seatsUsed(members),
        activeMembers: members.filter((m) => m.status === 'active').length,
        pendingInvites: members.filter((m) => m.status === 'invited').length,
        admins: admins.map((m) => ({ email: m.email, name: m.name, status: m.status })),
      };
    }),
  );
  return NextResponse.json(
    { success: true, tenants: rows.filter((t) => t.code !== PLATFORM_TENANT_CODE), storage: store.backend },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * POST /api/platform/tenants
 * { name, code, plan?, seatLimit, modules?, branding?, admin: { name?, email } }
 * Creates the workspace and invites its first Admin in one step.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
  if (!session.isPlatformAdmin) return forbidden();

  try {
    const body = await req.json().catch(() => ({}));
    const adminEmail = String(body?.admin?.email || '').trim().toLowerCase();
    const adminName = String(body?.admin?.name || '').trim().slice(0, 80);
    if (!EMAIL_RE.test(adminEmail)) throw new TenancyError('Enter the client admin’s email.');

    // If an earlier attempt created the workspace but failed before inviting anyone, resume it
    // instead of reporting the code as taken.
    const store = getTenantStore();
    const code = String(body?.code || '').trim().toUpperCase();
    const leftover = code ? await store.getTenant(code) : null;
    const resumable = leftover && leftover.createdBy === session.email && (await store.listMembers({ tenantCode: code })).length === 0;
    const tenant = resumable
      ? leftover
      : await createTenant(
          { name: body?.name, code: body?.code, plan: body?.plan, seatLimit: body?.seatLimit, modules: body?.modules, branding: body?.branding },
          session.email,
        );
    const { member, nonce } = await inviteMember(session, tenant.code, { email: adminEmail, name: adminName, role: 'Admin' });
    const sent = await sendInvite({ member, tenant, nonce, inviterName: session.name, requestOrigin: req.nextUrl.origin });

    return NextResponse.json({
      success: true,
      tenant,
      admin: { email: member.email, name: member.name },
      emailDelivered: sent.delivered,
      ...(sent.delivered ? {} : { inviteUrl: sent.inviteUrl, deliveryError: sent.error }),
    });
  } catch (err) {
    if (err instanceof TenancyError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error('[platform/tenants POST]', err);
    return NextResponse.json({ success: false, error: 'Could not create the workspace.' }, { status: 500 });
  }
}
