import { NextRequest, NextResponse } from 'next/server';
import { fail, json, listAssignees, requireSession } from '@/lib/server/meetingPlanApi';

/**
 * GET /api/meeting-plans/assignees
 * Who can run a booked meeting: active members of the session's workspace, Account Executives first.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    return json({ success: true, assignees: await listAssignees(session), me: session.email.toLowerCase() });
  } catch (err) {
    console.error('[meeting-plans/assignees GET]', err);
    return fail(500, 'Could not load the team.');
  }
}
