import { NextRequest, NextResponse } from 'next/server';
import { MAX_HANDOFF_BODY_CHARS, summariseHandoff, validateHandoffInput } from '@/lib/leadHandoffs';
import { displayNameFor } from '@/lib/server/tenancy';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getLeadHandoffStore, HandoffLimitError } from '@/lib/server/leadHandoffStore';
import { HANDOFF_UNAVAILABLE, canSendHandoffs, fail, json, requireSession } from '@/lib/server/leadHandoffApi';
import { limitPerUser } from '@/lib/server/userRateLimit';

/**
 * GET /api/leads/handoffs
 * The signed-in person's undelivered batches: addressed to their own email, in their current
 * workspace only (both from the session). Their browser adds the leads to Contacts and then calls
 * POST /api/leads/handoffs/ack. If the store cannot be read the answer is an empty list with
 * `unavailable: true`, so nothing else in the app is affected.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const limited = limitPerUser('lead-handoffs-mine', session, { maxRequests: 30 });
  if (limited) return limited;
  try {
    const batches = await getLeadHandoffStore().listUndelivered(session.tenantCode, session.email);
    return json({ success: true, batches });
  } catch (err) {
    console.error('[lead-handoffs GET]', err);
    return json({ success: true, batches: [], unavailable: true });
  }
}

/**
 * POST /api/leads/handoffs { toEmail, folderName, leads: Contact[] }
 * Send up to 500 leads to a teammate in the same workspace. Sender: Admin and above (platform staff
 * only in the platform's own workspace). The workspace and the sender always come from the session.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (!canSendHandoffs(session)) return fail(403, 'Only workspace admins can assign leads to a teammate.');
  const limited = limitPerUser('lead-handoffs-create', session, { maxRequests: 20 });
  if (limited) return limited;

  let body: Record<string, unknown> | null = null;
  try {
    const raw = await req.text();
    if (raw.length > MAX_HANDOFF_BODY_CHARS) return fail(413, 'That is too much to send at once. Send fewer leads at a time.');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) return fail(400, 'Send the leads as JSON.');
  const v = validateHandoffInput(body);
  if (!v.ok) return fail(v.status, v.error);
  if (v.toEmail === session.email.toLowerCase()) return fail(400, 'These leads are already yours. Choose a teammate.');

  try {
    // The recipient must be a current (active or invited) member of the sender's own workspace.
    const members = await getTenantStore().listMembers({ tenantCode: session.tenantCode });
    const recipient = members.find((m) => m.status !== 'removed' && m.email.toLowerCase() === v.toEmail);
    if (!recipient) return fail(400, 'That person is not a member of this workspace.');

    let created;
    try {
      created = await getLeadHandoffStore().create(session.tenantCode, {
        fromEmail: session.email,
        fromName: session.name,
        toEmail: v.toEmail,
        folderName: v.folderName,
        leads: v.leads,
      });
    } catch (err) {
      if (err instanceof HandoffLimitError) return fail(409, err.message);
      console.error('[lead-handoffs POST store]', err);
      return fail(503, HANDOFF_UNAVAILABLE);
    }
    try {
      await getTenantStore().addAudit({
        actorEmail: session.email,
        tenantCode: session.tenantCode,
        action: 'lead_handoff.create',
        target: created.id,
        detail: { toEmail: v.toEmail, leadCount: created.leadCount, folderName: created.folderName },
      });
    } catch (err) {
      console.error('[lead-handoffs audit]', err);
    }
    return json({
      success: true,
      handoff: summariseHandoff(created),
      recipientName: displayNameFor(recipient.email, recipient.name),
    });
  } catch (err) {
    console.error('[lead-handoffs POST]', err);
    return fail(500, 'Could not send the leads. Nothing was sent.');
  }
}
