import { NextRequest, NextResponse, after } from 'next/server';
import { getMeetingPlanStore, isMeetingPlanId } from '@/lib/server/meetingPlanStore';
import { isMeetingPlanRunning, runMeetingPlanJob } from '@/lib/server/meetingPlan/job';
import {
  auditPlan,
  checkDailyCap,
  fail,
  json,
  loadVisiblePlan,
  forViewer,
  planNotFound,
  requireSession,
  toPublic,
} from '@/lib/server/meetingPlanApi';

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 300;

/**
 * POST /api/meeting-plans/:id/regenerate
 * Research and write the plan again (counts toward the workspace's daily cap). The current plan and
 * one-pager stay in place until the new ones replace them.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isMeetingPlanId(id)) return planNotFound();
  try {
    const current = await loadVisiblePlan(session, id);
    if (!current) return planNotFound();
    if (current.status === 'preparing' || isMeetingPlanRunning(session.tenantCode, id)) {
      return fail(409, 'This plan is already being prepared.');
    }
    const capped = await checkDailyCap(session);
    if (capped) return capped;

    const updated = await getMeetingPlanStore().update(session.tenantCode, id, { status: 'preparing', error: null }, { generation: true });
    if (!updated) return planNotFound();
    await auditPlan(session, 'regenerate', updated);
    const { tenantCode } = updated;
    after(() => runMeetingPlanJob(tenantCode, id));
    return json({ success: true, plan: toPublic(forViewer(session, updated)) });
  } catch (err) {
    console.error('[meeting-plans/:id/regenerate POST]', err);
    return fail(500, 'Could not start preparing the plan again.');
  }
}
