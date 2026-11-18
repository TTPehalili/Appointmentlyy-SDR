import { after, NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { requireProjectOwner, toOwnerProject } from '@/lib/server/clientProjects/core';
import { cpFail } from '@/lib/server/clientProjects/http';
import { createProject, sweepProject } from '@/lib/server/clientProjects/service';
import { projectRow, projectStats } from '@/lib/server/clientProjects/stats';
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
    // Round trips: the projects and the schema check (1), their cards (2). Sweeps run after the response.
    const [projects, schema] = await Promise.all([store.listProjects(), store.schemaStatus()]);
    const tasks = await store.listTasksFor(projects.map((p) => p.id));
    // Lazy housekeeping (delay records, reminders, digests) after the response; at most every 5 minutes per project.
    const origin = req.nextUrl.origin;
    after(async () => {
      for (const p of projects) if (p.status === 'active') await sweepProject(p.id, { origin, minGapMs: 5 * 60_000 });
    });
    return json({
      success: true,
      projects: projects.map((p) => toOwnerProject(p, tasks.filter((t) => t.projectId === p.id))),
      // The cross-project home: one row of facts per project, with the rule-based health chip.
      rows: projects.map((p) => projectRow(projectStats(p, tasks.filter((t) => t.projectId === p.id)))),
      sop: { version: SOP_VERSION, cards: SOP_TEMPLATE.length },
      ai: aiMode(),
      aiProvider: aiProvider(),
      storage: store.backend,
      // 'v1' = the v2 migration has not been run on this database: the console says so.
      schema,
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
    const project = await createProject(body, { actor: `owner:${owner.email}`, origin: req.nextUrl.origin, ownerName: owner.name });
    const tasks = await getClientProjectStore().listTasks(project.id);
    return json({ success: true, project: toOwnerProject(project, tasks) });
  } catch (err) {
    return cpFail(err, 'create');
  }
}
