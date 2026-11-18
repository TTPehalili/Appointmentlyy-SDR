import { after, NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { requireProjectOwner, toOwnerProject } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';
import { createProject, sweepProject } from '@/lib/server/clientProjects/service';
import { aiMode, aiProvider } from '@/lib/server/clientProjects/ai';
import { SOP_TEMPLATE, SOP_VERSION } from '@/lib/clientProjects/sopTemplate';

/**
 * Client Projects (platform owner only).
 * GET  /api/client-projects   every project with its progress, next due item and overdue counts
 * POST /api/client-projects   { clientName, kickoffDate, key?, title?, fromSop?, status? } -> a new project
 */
export async function GET(req: NextRequest) {
  const owner = await requireProjectOwner(req, 'read');
  if (owner instanceof NextResponse) return owner;
  try {
    const store = getClientProjectStore();
    const projects = await store.listProjects();
    const tasks = await store.listTasksFor(projects.map((p) => p.id));
    // Lazy housekeeping (delay records, reminders, digests) after the response; at most every 5 minutes per project.
    const origin = req.nextUrl.origin;
    after(async () => {
      for (const p of projects) if (p.status === 'active') await sweepProject(p.id, { origin, minGapMs: 5 * 60_000 });
    });
    return json({
      success: true,
      projects: projects.map((p) => toOwnerProject(p, tasks.filter((t) => t.projectId === p.id))),
      sop: { version: SOP_VERSION, cards: SOP_TEMPLATE.length },
      ai: aiMode(),
      aiProvider: aiProvider(),
      storage: store.backend,
    });
  } catch (err) {
    return cpFail(err, 'list');
  }
}

export async function POST(req: NextRequest) {
  const owner = await requireProjectOwner(req, 'write');
  if (owner instanceof NextResponse) return owner;
  if (!rateLimit(`cp-owner-create:${owner.email}`, 30, 10 * 60_000)) return fail(429, 'Too many projects in a short time. Wait a few minutes.');
  const body = await readJson(req, 16 * 1024);
  if (!body) return fail(400, 'Send the project details as JSON.');
  try {
    const project = await createProject(body, { actor: `owner:${owner.email}`, origin: req.nextUrl.origin });
    const tasks = await getClientProjectStore().listTasks(project.id);
    return json({ success: true, project: toOwnerProject(project, tasks) });
  } catch (err) {
    return cpFail(err, 'create');
  }
}
