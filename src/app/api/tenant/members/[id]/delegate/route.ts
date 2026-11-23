import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { TenancyError } from '@/lib/server/tenancy';
import { requireOwner } from '@/lib/server/agreements/core';
import { grantEmailDelegate, revokeEmailDelegate } from '@/lib/server/emailDelegation';
import type { ServerSession } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Platform owner only, signed in to the Appointmentlyy workspace (requireOwner). Nobody else can
 * grant or end an email delegation: not a workspace Admin, not the delegate, not an owner who has
 * switched into a client workspace.
 */
async function owner(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await requireOwner(req);
  if (session instanceof NextResponse) {
    return session.status === 401
      ? session
      : json({ success: false, error: 'Only the platform owner can do this, in the Appointmentlyy workspace.' }, 403);
  }
  if (!rateLimit(`email-delegate:${session.email}`, 30, 60 * 60_000)) {
    return json({ success: false, error: 'Too many changes. Try again in an hour.' }, 429);
  }
  return session;
}

const failed = (e: unknown) => {
  if (e instanceof TenancyError) return json({ success: false, error: e.message }, e.status);
  console.error('[tenant/members/:id/delegate]', e);
  return json({ success: false, error: 'Could not save this. Nothing changed.' }, 500);
};

/**
 * POST /api/tenant/members/:id/delegate  (no body is read)
 * Let this member of the Appointmentlyy workspace send and reply to email as the caller, and see
 * the replies. The owner recorded is always the caller.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await owner(req);
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await ctx.params;
    const d = await grantEmailDelegate(session, id);
    return json({ success: true, delegate: { delegateEmail: d.delegateEmail, ownerEmail: d.ownerEmail, setAt: d.setAt } });
  } catch (e) {
    return failed(e);
  }
}

/** DELETE /api/tenant/members/:id/delegate: stop this member sending as the caller. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await owner(req);
  if (session instanceof NextResponse) return session;
  try {
    const { id } = await ctx.params;
    const revoked = await revokeEmailDelegate(session, id);
    return json({ success: true, revoked });
  } catch (e) {
    return failed(e);
  }
}
