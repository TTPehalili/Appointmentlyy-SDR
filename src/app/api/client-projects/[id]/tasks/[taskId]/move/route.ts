import { after, NextRequest, NextResponse } from 'next/server';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { toOwnerTask } from '@/lib/server/clientProjects/core';
import { cpFail, ownerTask } from '@/lib/server/clientProjects/http';
import { moveTask } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string; taskId: string }> };

/**
 * POST /api/client-projects/:id/tasks/:taskId/move   (owner only; drag and drop and the "Move to" menu)
 *   { status?, beforeId? }   kanban: change column and/or reorder (beforeId = the card to land before; null = the end)
 *   { phase, redate? }       roadmap: change phase; the due date is kept unless redate is true
 *   { override: true }       mark Done although a card it waits on is open (recorded on the event)
 * A refused Done is a 409 with code "blockers_open" and the open blockers' keys.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id, taskId } = await c.params;
  const o = await ownerTask(req, id, taskId);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 2 * 1024);
  if (!body) return fail(400, 'Send the move as JSON.');
  try {
    // Round trips: project + card (1), the board snapshot (2), the card + neighbours + event (3). The
    // automations a Done triggers run after the response.
    const tasks = await getClientProjectStore().listTasks(o.project.id);
    const { task, suggestRedate } = await moveTask(o.project, o.task, body, { ...o.ctx, defer: (fn) => after(fn) }, tasks);
    return json({ success: true, task: toOwnerTask(o.project, task, []), suggestRedate });
  } catch (err) {
    return cpFail(err, 'task move');
  }
}
