import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { MEETING_PLAN_LIMITS } from '@/lib/meetingPlan';
import { normalizeOnePager } from '@/lib/server/meetingPlan/plan';
import { polishOnePager } from '@/lib/server/meetingPlan/polish';
import { getCompanyProfileStore, isMeetingPlanId } from '@/lib/server/meetingPlanStore';
import {
  fail,
  friendlyError,
  json,
  loadVisiblePlan,
  planNotFound,
  readJsonObject,
  requireSession,
  tenantDisplayName,
} from '@/lib/server/meetingPlanApi';

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * POST /api/meeting-plans/:id/polish  { onePager, instruction }
 * Rewrites the one-pager copy with AI and returns it (not saved: the UI shows it, then PATCHes).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isMeetingPlanId(id)) return planNotFound();
  try {
    const plan = await loadVisiblePlan(session, id);
    if (!plan) return planNotFound();
    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the one-pager and an instruction as JSON.');
    const onePager = normalizeOnePager(body.onePager);
    if (!onePager) return fail(400, 'The one-pager is missing required parts.', 'onePager');
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
    if (!instruction) return fail(400, 'Say how to change it, e.g. "shorter".', 'instruction');
    if (instruction.length > MEETING_PLAN_LIMITS.instruction) {
      return fail(400, `Keep the instruction under ${MEETING_PLAN_LIMITS.instruction} characters.`, 'instruction');
    }
    if (!rateLimit(`meeting-polish:${session.tenantCode}:${session.email}`, 30, 10 * 60_000)) {
      return fail(429, 'That is a lot of rewrites in a short time. Please wait a few minutes and try again.');
    }
    const profile = await getCompanyProfileStore().get(session.tenantCode).catch(() => null);
    const polished = await polishOnePager({
      onePager,
      instruction,
      lead: plan.lead,
      profile,
      tenantName: tenantDisplayName(session.identity.tenant),
    });
    return json({ success: true, onePager: polished });
  } catch (err) {
    console.error('[meeting-plans/:id/polish POST]', err);
    return fail(500, friendlyError(err, 'Could not rewrite the one-pager right now. Please try again.'));
  }
}
