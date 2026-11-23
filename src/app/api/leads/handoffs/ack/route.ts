import { NextRequest, NextResponse } from 'next/server';
import { getLeadHandoffStore, isHandoffId } from '@/lib/server/leadHandoffStore';
import { fail, json, readJsonObject, requireSession } from '@/lib/server/leadHandoffApi';
import { limitPerUser } from '@/lib/server/userRateLimit';

/**
 * POST /api/leads/handoffs/ack { id }
 * The recipient confirms a batch is in their Contacts. Only a batch addressed to the signed-in
 * person in their current workspace matches; anyone else's id is "not found". Safe to repeat.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const limited = limitPerUser('lead-handoffs-ack', session, { maxRequests: 60 });
  if (limited) return limited;
  const body = await readJsonObject(req);
  if (!body || !isHandoffId(body.id)) return fail(400, 'Unknown assignment.');
  try {
    const result = await getLeadHandoffStore().markDelivered(session.tenantCode, session.email, body.id);
    if (result === 'not_found') return fail(404, 'Unknown assignment.');
    return json({ success: true, delivered: true, already: result === 'already' });
  } catch (err) {
    console.error('[lead-handoffs ack]', err);
    return fail(503, 'Could not confirm the assignment. It will be retried.');
  }
}
