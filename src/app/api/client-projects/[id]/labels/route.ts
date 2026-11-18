import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { toOwnerProject } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { setLabels } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/client-projects/:id/labels   { labels: [{ id?, name, color }] }   the whole list (max 12; owner only) */
export async function PUT(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 4 * 1024);
  if (!body) return fail(400, 'Send the labels as JSON.');
  try {
    const { project, tasks } = await setLabels(o.project, body.labels, o.ctx);
    return json({ success: true, project: toOwnerProject(project, tasks) });
  } catch (err) {
    return cpFail(err, 'labels');
  }
}
