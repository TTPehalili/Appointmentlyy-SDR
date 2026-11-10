import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { EMAIL_RE, PLATFORM_TENANT_CODE, parseRole } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { TenancyError, inviteMember } from '@/lib/server/tenancy';
import { getServerSession, hasRank } from '@/lib/server/session';
import { sendInvite } from '@/lib/server/authLinks';

/**
 * POST /api/auth/invite  { email, name?, role, tenantCode? }
 * Invites someone into the signed-in user's workspace (Supervisor+). Only platform staff may pass
 * a different tenantCode. Seat limits and role-granting rules are enforced in lib/server/tenancy.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    if (!hasRank(session, 'Supervisor')) {
      return NextResponse.json({ success: false, error: 'Your role cannot invite people.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const name = String(body?.name || '').trim().slice(0, 80);
    const role = parseRole(body?.role ?? 'Rep');
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ success: false, error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!role) return NextResponse.json({ success: false, error: 'Pick a role.' }, { status: 400 });

    const requested = typeof body?.tenantCode === 'string' ? body.tenantCode.trim().toUpperCase() : '';
    const tenantCode = session.isPlatformAdmin && requested ? requested : session.tenantCode;
    if (!session.isPlatformAdmin && tenantCode === PLATFORM_TENANT_CODE) {
      return NextResponse.json({ success: false, error: 'Not allowed.' }, { status: 403 });
    }

    if (!rateLimit(`invite:${session.email}`, 60, 60 * 60_000)) {
      return NextResponse.json({ success: false, error: 'Invite limit reached. Try again in an hour.' }, { status: 429 });
    }

    const { member, nonce, reinvited } = await inviteMember(session, tenantCode, { email, name, role });
    const tenant = (await getTenantStore().getTenant(tenantCode))!;
    const sent = await sendInvite({ member, tenant, nonce, inviterName: session.name, requestOrigin: req.nextUrl.origin });

    return NextResponse.json({
      success: true,
      member: { id: member.id, email: member.email, name: member.name, role: member.role, status: member.status },
      reinvited,
      emailDelivered: sent.delivered,
      // Only when the email failed, so the admin can pass the link on another way.
      ...(sent.delivered ? {} : { inviteUrl: sent.inviteUrl, deliveryError: sent.error }),
    });
  } catch (err) {
    if (err instanceof TenancyError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    console.error('[Auth invite]', err);
    return NextResponse.json({ success: false, error: 'Could not send the invite.' }, { status: 500 });
  }
}
