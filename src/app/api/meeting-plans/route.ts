import { NextRequest, NextResponse, after } from 'next/server';
import { isDemoSession } from '@/lib/demoMode';
import { meetingContactKey } from '@/lib/meetingPlan';
import { getMeetingPlanStore } from '@/lib/server/meetingPlanStore';
import { runMeetingPlanJob } from '@/lib/server/meetingPlan/job';
import {
  auditPlan,
  canSeePlan,
  checkDailyCap,
  ensureDemoPlans,
  forViewer,
  fail,
  json,
  readJsonObject,
  requireSession,
  resolveAssignee,
  seesAllPlans,
  sweepStale,
  toPublic,
  toSummary,
  validateCreateInput,
} from '@/lib/server/meetingPlanApi';

/** Generation (research + writing) runs after the response, inside this route's time budget. */
export const maxDuration = 300;

/**
 * GET /api/meeting-plans[?contactKey=...]
 * Plans in the session's workspace: Supervisor+ see all; everyone else sees plans they booked or are
 * assigned to. The demo workspace gets its sample plans on first list.
 */
export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    try {
      await ensureDemoPlans(session);
    } catch (err) {
      console.error('[meeting-plans seed]', err);
    }
    const rawKey = req.nextUrl.searchParams.get('contactKey');
    const contactKey = rawKey === null ? undefined : rawKey.trim().toLowerCase().slice(0, 254);
    const all = seesAllPlans(session) || isDemoSession(session);
    const rows = await getMeetingPlanStore().list(session.tenantCode, { contactKey, visibleTo: all ? undefined : session.email });
    const visible = rows.filter((p) => canSeePlan(session, p));
    const swept = await Promise.all(visible.map(sweepStale));
    return json({ success: true, plans: swept.map((p) => toSummary(toPublic(forViewer(session, p)))) });
  } catch (err) {
    console.error('[meeting-plans GET]', err);
    return fail(500, 'Could not load meeting plans.');
  }
}

/**
 * POST /api/meeting-plans  CreateMeetingPlanInput
 * Saves the plan as 'preparing' and answers 201 at once; research and writing run after the response.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  try {
    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the meeting details as JSON.');
    const v = validateCreateInput(body);
    if (!v.ok) return fail(400, v.error, v.field);
    const ae = await resolveAssignee(session, v.value.assignedAe);
    if (ae instanceof NextResponse) return ae;
    const capped = await checkDailyCap(session);
    if (capped) return capped;

    const created = await getMeetingPlanStore().create(session.tenantCode, {
      contactKey: meetingContactKey(v.value.lead),
      lead: v.value.lead,
      call: v.value.call,
      bookedBy: session.email,
      bookedByName: session.name,
      assignedAe: ae.email,
      assignedAeName: ae.name,
    });
    await auditPlan(session, 'create', created, { assignedAe: created.assignedAe });
    const { tenantCode, id } = created;
    after(() => runMeetingPlanJob(tenantCode, id));
    return json({ success: true, plan: toPublic(created) }, 201);
  } catch (err) {
    console.error('[meeting-plans POST]', err);
    return fail(500, 'Could not save the meeting plan.');
  }
}
