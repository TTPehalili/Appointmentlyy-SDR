import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { toOwnerTask } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject, type OwnerCtx } from '@/lib/server/clientProjects/http';
import { addComment, deleteTask, patchTask } from '@/lib/server/clientProjects/service';
import type { Task } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string; taskId: string }> };

async function load(req: NextRequest, c: Ctx): Promise<(OwnerCtx & { task: Task }) | NextResponse> {
  const { id, taskId } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  if (!isCpId(taskId)) return fail(404, 'Card not found.');
  try {
    const task = await getClientProjectStore().getTask(taskId);
    // A card id from another project is simply not found.
    if (!task || task.projectId !== o.project.id) return fail(404, 'Card not found.');
    return { ...o, task };
  } catch (err) {
    return cpFail(err, 'task load');
  }
}

/** PATCH /api/client-projects/:id/tasks/:taskId -> edit a card or set its status (owner only). */
export async function PATCH(req: NextRequest, c: Ctx) {
  const o = await load(req, c);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 32 * 1024);
  if (!body) return fail(400, 'Send the changes as JSON.');
  try {
    const task = await patchTask(o.project, o.task, body, o.ctx);
    return json({ success: true, task: toOwnerTask(o.project, task, []) });
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
