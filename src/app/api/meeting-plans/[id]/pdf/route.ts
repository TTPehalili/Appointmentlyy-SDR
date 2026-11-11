import { NextRequest, NextResponse } from 'next/server';
import { onePagerFileName } from '@/lib/onePagerRender';
import { isMeetingPlanId } from '@/lib/server/meetingPlanStore';
import { brandFor, fail, loadVisiblePlan, planNotFound, renderPlanPdf, requireSession } from '@/lib/server/meetingPlanApi';

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** GET /api/meeting-plans/:id/pdf -> the saved one-pager as a PDF download. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!isMeetingPlanId(id)) return planNotFound();
  try {
    const plan = await loadVisiblePlan(session, id);
    if (!plan) return planNotFound();
    if (!plan.onePager) return fail(409, 'There is no one-pager for this plan yet.');
    const pdf = await renderPlanPdf(plan, await brandFor(session));
    const name = onePagerFileName(plan.lead.company);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[meeting-plans/:id/pdf GET]', err);
    return fail(500, 'Could not create the PDF.');
  }
}
