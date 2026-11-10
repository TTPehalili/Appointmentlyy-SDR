import { NextRequest, NextResponse } from 'next/server';
import { parseRole } from '@/lib/roles';
import { getTenantStore } from '@/lib/server/tenantStore';
import { TenancyError, changeMemberRole, inviteMember, removeMember } from '@/lib/server/tenancy';
import { getServerSession } from '@/lib/server/session';
import { sendInvite } from '@/lib/server/authLinks';

type Ctx = { params: Promise<{ id: string }> };

const err = (e: unknown, fallback: string) => {
  if (e instanceof TenancyError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
  console.error('[tenant/members/:id]', e);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
};

/** Members are only reachable inside the caller's current workspace (404 otherwise, not 403). */
async function loadScoped(req: NextRequest, id: string) {
  const session = await getServerSession(req);
  if (!session) return { error: NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 }) };
  const member = await getTenantStore().getMember(id);
  if (!member || member.tenantCode !== session.tenantCode) {
    return { error: NextResponse.json({ success: false, error: 'Not found.' }, { status: 404 }) };
  }
  return { session, member };
}

/** PATCH { role } changes a role; PATCH { resend: true } re-sends a pending invite. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const scoped = await loadScoped(req, id);
  if (scoped.error) return scoped.error;
  const { session, member } = scoped;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.resend) {
      if (member.status !== 'invited') throw new TenancyError('Only pending invites can be re-sent.');
      const { member: m, nonce } = await inviteMember(session, member.tenantCode, { email: member.email, name: member.name, role: member.role });
      const sent = await sendInvite({ member: m, tenant: session.identity.tenant, nonce, inviterName: session.name, requestOrigin: req.nextUrl.origin });
      return NextResponse.json({
        success: true,
        emailDelivered: sent.delivered,
        ...(sent.delivered ? {} : { inviteUrl: sent.inviteUrl, deliveryError: sent.error }),
      });
    }
    const role = parseRole(body?.role);
    if (!role) throw new TenancyError('Pick a role.');
    const updated = await changeMemberRole(session, id, role);
    return NextResponse.json({ success: true, member: { id: updated.id, role: updated.role } });
  } catch (e) {
    return err(e, 'Could not update this member.');
  }
}

/** DELETE removes the member (or withdraws a pending invite). Their sessions stop working at once. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const scoped = await loadScoped(req, id);
  if (scoped.error) return scoped.error;
  try {
    await removeMember(scoped.session, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return err(e, 'Could not remove this member.');
  }
}
