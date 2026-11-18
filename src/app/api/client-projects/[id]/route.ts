import { NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { mailStatus } from '@/lib/server/agreements/mail';
import { cursorOf, getClientProjectStore } from '@/lib/server/clientProjectStore';
import { delayRows, toOwnerProject, toOwnerTask } from '@/lib/server/clientProjects/core';
import { atMost, cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { patchProject, sweepProject } from '@/lib/server/clientProjects/service';
import { aiMode, aiProvider } from '@/lib/server/clientProjects/ai';
import { AUTOMATION_RULES } from '@/lib/clientProjects/types';

type Ctx = { params: Promise<{ id: string }> };

const EVENTS_PAGE = 100;
const COMMENTS_MAX = 2000;

/**
 * GET /api/client-projects/:id -> the project, its cards, comments, and the first page of the activity log
 * (newest first; older pages from /events), the Client Delay log and the automation log (owner only).
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    // Delay records, reminders and digests are computed on read (no cron). Never holds the response for long.
    if (o.project.status === 'active') await atMost(sweepProject(id, { origin: req.nextUrl.origin }), 2500);
    const store = getClientProjectStore();
    const [project, tasks, comments, events, delayEvents, automationEvents, files] = await Promise.all([
      store.getProject(id),
      store.listTasks(id),
      store.listComments(id, COMMENTS_MAX),
      store.findEvents(id, { limit: EVENTS_PAGE }),
      store.findEvents(id, { type: 'client_delay', limit: 1000 }),
      store.findEvents(id, { type: 'automation', limit: 300 }),
      store.listFiles(id),
    ]);
    if (!project) return fail(404, 'Project not found.');
    const automationCounts = Object.fromEntries(await Promise.all(AUTOMATION_RULES.map(async (rule) => [rule, (await store.findEvents(id, { type: 'automation', rule, limit: 1000 })).length] as const)));
    return json({
      success: true,
      project: toOwnerProject(project, tasks),
      tasks: tasks.map((t) => toOwnerTask(project, t, comments)),
      // The newest comments (oldest first for display). `commentsTruncated` says older ones exist: the card
      // drawer always loads its own card's comments in pages, so none is ever hidden for good.
      comments,
      commentsTruncated: comments.length >= COMMENTS_MAX,
      // Newest first. `eventsBefore` is the cursor for the next (older) page, or null when this is all.
      events,
      eventsBefore: events.length === EVENTS_PAGE ? cursorOf(events[events.length - 1]) : null,
      delays: delayRows(project, tasks, delayEvents),
      automationEvents,
      automationCounts,
      files,
      ai: aiMode(),
      aiProvider: aiProvider(),
      mail: mailStatus(),
    });
  } catch (err) {
    return cpFail(err, 'get');
  }
}

/** PATCH /api/client-projects/:id -> edit the project (name, dates, status, automations, publish a client update). */
export async function PATCH(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 32 * 1024);
  if (!body) return fail(400, 'Send the changes as JSON.');
  try {
    const project = await patchProject(o.project, body, o.ctx);
    return json({ success: true, project: toOwnerProject(project, await getClientProjectStore().listTasks(id)) });
  } catch (err) {
    return cpFail(err, 'patch');
  }
}

/** DELETE /api/client-projects/:id -> drafts only (a started project is a record: archive it instead). */
export async function DELETE(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  if (o.project.status !== 'draft') return fail(409, 'Only drafts can be deleted. Archive a started project instead.');
  try {
    await getClientProjectStore().deleteProject(id);
    return json({ success: true });
  } catch (err) {
    return cpFail(err, 'delete');
  }
}
