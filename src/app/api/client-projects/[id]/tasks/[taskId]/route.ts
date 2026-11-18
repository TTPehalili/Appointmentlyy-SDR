import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { toOwnerTask } from '@/lib/server/clientProjects/core';
import { cpFail, ownerTask, type OwnerCtx } from '@/lib/server/clientProjects/http';
import { addComment, deleteTask, patchTask } from '@/lib/server/clientProjects/service';
import type { Task } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string; taskId: string }> };

async function load(req: NextRequest, c: Ctx): Promise<(OwnerCtx & { task: Task }) | NextResponse> {
  const { id, taskId } = await c.params;
  return ownerTask(req, id, taskId);
}

/** PATCH /api/client-projects/:id/tasks/:taskId -> edit a card or set its status (owner only). */
export async function PATCH(req: NextRequest, c: Ctx) {
  const o = await load(req, c);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 32 * 1024);
  if (!body) return fail(400, 'Send the changes as JSON.');
  try {
    // Round trips: project + card (1), the board snapshot (2), the write with its events (3); the done
    // automations of v1 still run inline here (they are asserted by the regression suite).
    const store = getClientProjectStore();
    const [tasks, attachments] = await Promise.all([store.listTasks(o.project.id), store.listFiles(o.project.id, 'attachment')]);
    const task = await patchTask(o.project, o.task, body, o.ctx, tasks);
    const all = tasks.map((t) => (t.id === task.id ? task : t));
    return json({ success: true, task: toOwnerTask(o.project, task, [], undefined, { tasks: all, attachments }) });
  } catch (err) {
    return cpFail(err, 'task patch');
  }
}

/** POST /api/client-projects/:id/tasks/:taskId -> { comment, clientVisible? } adds a comment (internal unless clientVisible). */
export async function POST(req: NextRequest, c: Ctx) {
  const o = await load(req, c);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 16 * 1024);
  if (!body) return fail(400, 'Send the comment as JSON.');
  try {
    const comment = await addComment(o.project, o.task, body.comment, body.clientVisible === true, o.ctx);
    return json({ success: true, comment });
  } catch (err) {
    return cpFail(err, 'comment');
  }
}

/**
 * DELETE /api/client-projects/:id/tasks/:taskId   (owner only)
 * Only cards added by hand or by an approved AI plan, and only if the client has not acted on them.
 * SOP cards and client-touched cards are refused (409): hide them from the client board instead.
 */
export async function DELETE(req: NextRequest, c: Ctx) {
  const o = await load(req, c);
  if (o instanceof NextResponse) return o;
  try {
    await deleteTask(o.project, o.task, o.ctx);
    return json({ success: true });
  } catch (err) {
    return cpFail(err, 'task delete');
  }
}
