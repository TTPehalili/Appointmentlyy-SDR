import { NextRequest, NextResponse } from 'next/server';
import { fail, json } from '@/lib/server/agreements/core';
import { cursorOf, getClientProjectStore, isCpId, parseCursor } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import type { CpEventType } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id/events?before=<cursor>&limit=<1-500>&type=<event type>&taskId=<card>&kind=comments
 * (owner only). The activity log, or with kind=comments the comments, NEWEST FIRST and one page at a time.
 * `before` is the `nextBefore` of the previous page; `nextBefore` is null on the last page. Nothing is ever
 * cut off silently: keep paging to reach the oldest entry.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  const q = req.nextUrl.searchParams;
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(q.get('limit') || 100)) || 100));
  const before = q.get('before') || '';
  const taskId = q.get('taskId') || '';
  const type = q.get('type') || '';
  if (before && !parseCursor(before)) return fail(400, 'Bad cursor.');
  if (taskId && !isCpId(taskId)) return fail(404, 'Card not found.');
  if (type && !/^[a-z_]{1,40}$/.test(type)) return fail(400, 'Bad event type.');
  try {
    const store = getClientProjectStore();
    if (q.get('kind') === 'comments') {
      const comments = await store.findComments(id, { taskId: taskId || undefined, before: before || undefined, limit });
      return json({ success: true, comments, nextBefore: comments.length === limit ? cursorOf(comments[comments.length - 1]) : null });
    }
    const events = await store.findEvents(id, { taskId: taskId || undefined, before: before || undefined, type: (type || undefined) as CpEventType | undefined, limit });
    return json({ success: true, events, nextBefore: events.length === limit ? cursorOf(events[events.length - 1]) : null });
  } catch (err) {
    return cpFail(err, 'events');
  }
}
