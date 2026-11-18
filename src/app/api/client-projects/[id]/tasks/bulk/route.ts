import { after, NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { bulkUpdate } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/client-projects/:id/tasks/bulk   (owner only; the List view's bulk bar)
 * { ids: [...up to 100], status? | assigneeId? | priority? | addLabelId? | removeLabelId? }
 * Every card goes through the same rules as a single edit; cards that cannot take it are skipped and listed.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 8 * 1024);
  if (!body) return fail(400, 'Send the change as JSON.');
  try {
    // Round trips: project (1), the board snapshot (2), every card's write and events in parallel (3); the
    // bulk_update summary event and the automations run after the response.
    return json({ success: true, ...(await bulkUpdate(o.project, body, { ...o.ctx, defer: (fn) => after(fn) })) });
  } catch (err) {
    return cpFail(err, 'bulk');
  }
}
