import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { toOwnerProject } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { shareAction } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/client-projects/:id/share   { action: 'enable' | 'disable' | 'reissue' | 'link' }   (owner only)
 * enable: turn the client board on (a new private link). disable: turn it off; the old link is gone
 * for good. reissue: a new link; the old one stops working at once. link: the current link, to copy.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 1024);
  if (!body) return fail(400, 'Send the action as JSON.');
  try {
    const out = await shareAction(o.project, String(body.action || ''), o.ctx);
    return json({ success: true, url: out.url, project: toOwnerProject(out.project, await getClientProjectStore().listTasks(id)) });
  } catch (err) {
    return cpFail(err, 'share');
  }
}
