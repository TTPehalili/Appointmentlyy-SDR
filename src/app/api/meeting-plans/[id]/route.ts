import { NextRequest, NextResponse } from 'next/server';
import { normalizeActionPlan, normalizeOnePager } from '@/lib/server/meetingPlan/plan';
import { getMeetingPlanStore, isMeetingPlanId, type MeetingPlanPatch } from '@/lib/server/meetingPlanStore';
import {
  auditPlan,
  brandFor,
  fail,
  json,
  loadVisiblePlan,
  forViewer,
  planNotFound,
  readJsonObject,
  requireSession,
  resolveAssignee,
  seesAllPlans,
  toPublic,
} from '@/lib/server/meetingPlanApi';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/meeting-plans/:id -> { plan, brand } (brand for the one-pager preview). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isMeetingPlanId(id)) return planNotFound();
  try {
    const plan = await loadVisiblePlan(session, id);
    if (!plan) return planNotFound();
    return json({ success: true, plan: toPublic(plan), brand: await brandFor(session) });
  } catch (err) {
    console.error('[meeting-plans/:id GET]', err);
    return fail(500, 'Could not load the meeting plan.');
  }
}

/**
 * PATCH /api/meeting-plans/:id  { plan?, onePager?, assignedAe?, status?: 'sent' }
 * Anyone who can see the plan may edit its plan and one-pager or mark it sent; changing the assigned
 * AE is Supervisor+ and must name an active member of this workspace.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isMeetingPlanId(id)) return planNotFound();
  try {
    const current = await loadVisiblePlan(session, id);
    if (!current) return planNotFound();
    const body = await readJsonObject(req);
    if (!body) return fail(400, 'Send the changes as JSON.');
    if (!['plan', 'onePager', 'assignedAe', 'status'].some((k) => k in body)) return fail(400, 'Nothing to change.');

    const patch: MeetingPlanPatch = {};
    if ('plan' in body || 'onePager' in body) {
      if (current.status === 'preparing') return fail(409, 'This plan is still being prepared. Edit it once it is ready.');
    }
    if ('plan' in body) {
      const plan = normalizeActionPlan(body.plan);
      if (!plan) return fail(400, 'The plan is missing required parts.', 'plan');
      patch.plan = plan;
    }
    if ('onePager' in body) {
      const onePager = normalizeOnePager(body.onePager);
      if (!onePager) return fail(400, 'The one-pager is missing required parts.', 'onePager');
      patch.onePager = onePager;
    }
    if ('assignedAe' in body) {
      if (!seesAllPlans(session)) return fail(403, 'Only supervisors, managers and admins can change who runs the meeting.');
      if (typeof body.assignedAe !== 'string' || !body.assignedAe.trim()) return fail(400, 'Pick who will run the meeting.', 'assignedAe');
      const ae = await resolveAssignee(session, body.assignedAe);
      if (ae instanceof NextResponse) return ae;
      patch.assignedAe = ae.email;
      patch.assignedAeName = ae.name;
    }
    if ('status' in body) {
      if (body.status !== 'sent') return fail(400, "Status can only be set to 'sent'.", 'status');
      if (!(patch.onePager ?? current.onePager)) return fail(409, 'There is no one-pager to send yet.');
      patch.status = 'sent';
      patch.sentAt = new Date().toISOString();
    }

    const updated = await getMeetingPlanStore().update(session.tenantCode, id, patch);
    if (!updated) return planNotFound();
    if (patch.assignedAe !== undefined && patch.assignedAe !== current.assignedAe) {
      await auditPlan(session, 'assign', updated, { from: current.assignedAe, to: updated.assignedAe });
    }
    if (patch.status === 'sent') await auditPlan(session, 'send', updated, { to: updated.lead.email });
    return json({ success: true, plan: toPublic(forViewer(session, updated)) });
  } catch (err) {
    console.error('[meeting-plans/:id PATCH]', err);
    return fail(500, 'Could not update the meeting plan.');
  }
}
