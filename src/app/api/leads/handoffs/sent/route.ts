import { NextRequest, NextResponse } from 'next/server';
import { summariseHandoff } from '@/lib/leadHandoffs';
import { getLeadHandoffStore } from '@/lib/server/leadHandoffStore';
import { canSendHandoffs, fail, json, requireSession } from '@/lib/server/leadHandoffApi';
import { limitPerUser } from '@/lib/server/userRateLimit';

/**
 * GET /api/leads/handoffs/sent
 * Batches the signed-in person sent in their current workspace, newest first, with whether each has
 * been collected. Never the leads, and never another sender's batches.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  if (!canSendHandoffs(session)) return fail(403, 'Only workspace admins can assign leads to a teammate.');
  const limited = limitPerUser('lead-handoffs-sent', session, { maxRequests: 30 });
  if (limited) return limited;
  try {
    const sent = await getLeadHandoffStore().listSent(session.tenantCode, session.email, 50);
    return json({ success: true, sent: sent.map(summariseHandoff) });
  } catch (err) {
    console.error('[lead-handoffs sent]', err);
    return json({ success: true, sent: [], unavailable: true });
  }
}
