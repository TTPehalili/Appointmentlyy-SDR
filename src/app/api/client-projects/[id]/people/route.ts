import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { toOwnerProject } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { addPerson, patchPerson, removePerson, type ProjectAndTasks } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

/** Every call: the owner check + project (1), the tasks (2), the writes and the event in parallel (3). */
const reply = ({ project, tasks }: ProjectAndTasks) => json({ success: true, project: toOwnerProject(project, tasks) });

/** POST /api/client-projects/:id/people   { name, side: 'us'|'client', email?, role? }   (owner only) */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 2 * 1024);
  if (!body) return fail(400, 'Send the person as JSON.');
  try {
    return reply(await addPerson(o.project, body, o.ctx));
  } catch (err) {
    return cpFail(err, 'person add');
  }
}

/** PATCH /api/client-projects/:id/people?personId=...   { name?, side?, email?, role? } */
export async function PATCH(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 2 * 1024);
  if (!body) return fail(400, 'Send the changes as JSON.');
  try {
    return reply(await patchPerson(o.project, req.nextUrl.searchParams.get('personId') || '', body, o.ctx));
  } catch (err) {
    return cpFail(err, 'person patch');
  }
}

/** DELETE /api/client-projects/:id/people?personId=...   their cards become unassigned */
export async function DELETE(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  try {
    return reply(await removePerson(o.project, req.nextUrl.searchParams.get('personId') || '', o.ctx));
  } catch (err) {
    return cpFail(err, 'person remove');
  }
}
