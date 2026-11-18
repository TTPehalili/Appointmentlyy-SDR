import { NextRequest, NextResponse } from 'next/server';
import { fail, json } from '@/lib/server/agreements/core';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { requireProjectOwner } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id/ai/progress?since=<rev>   (owner only)
 * The planner's live progress (design SPEC section 10): the latest run's stage and real counters, in ONE
 * query (one run row, without the proposal). `rev` is the run's updatedAt; when it has not moved the
 * reply is { changed: false } and the client keeps what it has. Polled every 1.5 s while running.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const owner = await requireProjectOwner(req, 'read');
  if (owner instanceof NextResponse) return owner;
  if (!isCpId(id)) return fail(404, 'Project not found.');
  try {
    const run = await getClientProjectStore().latestRunProgress(id);
    const rev = run ? run.updatedAt : null;
    if (rev && req.nextUrl.searchParams.get('since') === rev) return json({ success: true, changed: false, rev });
    return json({ success: true, changed: true, rev, run });
  } catch (err) {
    return cpFail(err, 'ai progress');
  }
}
