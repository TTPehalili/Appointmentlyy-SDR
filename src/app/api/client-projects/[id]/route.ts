import { after, NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { isLocalTestServer, mailStatus } from '@/lib/server/agreements/mail';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { delayRows, toOwnerProject, toOwnerTask } from '@/lib/server/clientProjects/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { deleteProjectForever, ensureOwnerSeed, patchProject, sweepProject } from '@/lib/server/clientProjects/service';
import { aiMode, aiProvider } from '@/lib/server/clientProjects/ai';
import { intakeOn, ownerChips } from '@/lib/server/clientProjects/intake';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/client-projects/:id -> the project, its cards (with comment and attachment counts), the
 * documents and attachments (metadata), and the Client Delay log (owner only).
 *
 * Round trips beyond the session check: 2 (the project; then tasks, comment counts, delay events and
 * files in parallel), 3 only the first time a pre-v2 project is opened (its owner is seeded as a person).
 * The activity log, comments and the automation log are NOT here: each tab loads its own, in pages
 * (/events, /automations), and the drawer loads its card's comments. The lazy sweep (delay records,
 * reminders, digests) runs AFTER the response, at most once a minute per project, and is never awaited.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    const store = getClientProjectStore();
    const origin = req.nextUrl.origin;
    // Test servers only (isLocalTestServer): the regression suite asks for the v1 behaviour (sweep, then
    // read) with a header, so it can assert sweep results right away. Production never waits for it.
    if (o.project.status === 'active') {
      if (isLocalTestServer() && req.headers.get('x-cp-test-sweep') === 'sync') await sweepProject(id, { origin });
      else after(() => sweepProject(id, { origin, minGapMs: 60_000 }));
    }
    const [tasks0, commentCounts, delayEvents, allFiles] = await Promise.all([store.listTasks(id), store.commentCounts(id), store.findEvents(id, { type: 'client_delay', limit: 1000 }), store.listFiles(id, 'all')]);
    const project = await ensureOwnerSeed(o.project, o.ctx);
    // Client Intake: the status chip per card (its sync may move cards, so they are read again when it is on).
    const chips = await ownerChips(project, tasks0);
    const tasks = intakeOn(project) ? await store.listTasks(id) : tasks0;
    const files = allFiles.filter((f) => !f.taskId);
    const attachments = allFiles.filter((f) => f.taskId);
    return json({
      success: true,
      project: toOwnerProject(project, tasks),
      tasks: tasks.map((t) => ({ ...toOwnerTask(project, t, [], undefined, { tasks, attachments }), commentCount: commentCounts[t.id] ?? 0, intake: chips.get(t.id) ?? null })),
      attachments,
      delays: delayRows(project, tasks, delayEvents),
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

/**
 * DELETE /api/client-projects/:id?confirm=<the client name, exactly>   (owner only, any status)
 * Permanent: the cards, comments, events, documents, attachments, AI runs and people go, and the share
 * link with them. A content-free tombstone (key, client name, who, when, card count) is kept in
 * cp_deletions. At most 10 deletes an hour per owner. The reply lists what was removed.
 * (Round trips: project 1, counts 2, tombstone 3, delete 4: the tombstone must be written first.)
 */
export async function DELETE(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id);
  if (o instanceof NextResponse) return o;
  if (!rateLimit(`cp-owner-delete:${o.owner.email}`, 10, 60 * 60_000)) return fail(429, 'Too many deletions in a short time. Wait a while and try again.');
  try {
    const removed = await deleteProjectForever(o.project, req.nextUrl.searchParams.get('confirm'), o.ctx);
    return json({ success: true, removed });
  } catch (err) {
    return cpFail(err, 'delete');
  }
}
