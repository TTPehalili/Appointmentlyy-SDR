import { NextRequest, NextResponse } from 'next/server';
import { fail, json } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { burnUp, projectStats } from '@/lib/server/clientProjects/stats';
import { SUGGESTED_QUESTIONS } from '@/lib/server/clientProjects/copilot';
import { aiMode } from '@/lib/server/clientProjects/ai';
import { isDate } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id/stats?from=&to=   (owner only)
 * The Dashboard and the deterministic Copilot panel: every number computed on the server (stats.ts),
 * plus the burn-up series. from/to (YYYY-MM-DD, at most 366 days) adds a date-range block.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  const q = req.nextUrl.searchParams;
  const from = q.get('from');
  const to = q.get('to');
  if ((from || to) && !(isDate(from) && isDate(to) && from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86_400_000)) return fail(400, 'Give from and to as dates (at most a year apart).');
  try {
    const tasks = await getClientProjectStore().listTasks(id);
    const stats = projectStats(o.project, tasks, from && to ? { range: { from, to } } : {});
    return json({ success: true, stats, burnUp: burnUp(o.project, tasks, stats.asOf), suggested: SUGGESTED_QUESTIONS, ai: aiMode() });
  } catch (err) {
    return cpFail(err, 'stats');
  }
}
