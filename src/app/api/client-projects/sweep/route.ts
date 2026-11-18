import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { requireProjectOwner } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';
import { sweepProject } from '@/lib/server/clientProjects/service';

/**
 * POST /api/client-projects/sweep   { projectId? }   (platform owner only)
 * Runs the lazy housekeeping now: client-delay records, client reminders and the overdue digest, for
 * one project or every active one. Idempotent. Owner reads already trigger it; this is the hook a
 * scheduler can call later.
 */
export async function POST(req: NextRequest) {
  const owner = await requireProjectOwner(req, 'write');
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`cp-owner-sweep:${owner.email}`, 60, 10 * 60_000)) return fail(429, 'Too many requests. Wait a few minutes.');
  const body = (await readJson(req, 1024)) ?? {};
  try {
    const store = getClientProjectStore();
    let ids: string[];
    if (body.projectId !== undefined) {
      if (!isCpId(body.projectId) || !(await store.getProject(body.projectId))) return fail(404, 'Project not found.');
      ids = [body.projectId];
    } else {
      ids = (await store.listProjects()).filter((p) => p.status === 'active').map((p) => p.id);
    }
    for (const id of ids) await sweepProject(id, { origin: req.nextUrl.origin });
    return json({ success: true, swept: ids.length });
  } catch (err) {
    return cpFail(err, 'sweep');
  }
}
