import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { toOwnerTask } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { createTask } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/client-projects/:id/tasks -> a new card: task, milestone, client item or defect (owner only). */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 32 * 1024);
  if (!body) return fail(400, 'Send the card as JSON.');
  try {
    const task = await createTask(o.project, body, o.ctx);
    return json({ success: true, task: toOwnerTask(o.project, task, []) });
  } catch (err) {
    return cpFail(err, 'task create');
  }
}
