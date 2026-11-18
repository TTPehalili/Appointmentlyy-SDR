import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/authToken';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { toPublicProject } from '@/lib/server/clientProjects/core';
import { cpFail, projectByToken } from '@/lib/server/clientProjects/http';
import { clientClaim, clientComment, clientDailyCapReached, clientDefect, clientRetest, clientTick } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ token: string; action: string }> };

/** Per link and per address, in 10 minutes. */
const LIMITS: Record<string, [number, number]> = { tick: [120, 60], untick: [120, 60], claim: [60, 30], comment: [30, 20], defect: [10, 6], retest: [60, 30] };

/**
 * POST /api/board/:token/:action   (public; the link token is the credential)
 *   tick | untick   { taskId, name }                 only ordinary items the client owns and may tick (403 otherwise)
 *   claim           { taskId, name }                 "I've done this" on a signature, payment or acceptance: recorded,
 *                                                    the owner is told, and the card stays open until the owner confirms
 *   comment         { taskId, name, body }           on any visible card
 *   defect          { name, title, steps, severity } a UAT issue report, while UAT is open
 *   retest          { taskId, name, confirmed }      on a fixed defect the client reported
 * Every action re-checks the link, is rate-limited and size-capped, and writes an event with the name the
 * client entered. A project also accepts at most 500 client events a day. The reply is the refreshed board.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { token, action } = await c.params;
  const found = await projectByToken(req, token);
  if (found instanceof NextResponse) return found;
  // Own keys only: "constructor", "toString" or "__proto__" are not actions.
  if (!Object.hasOwn(LIMITS, action)) return fail(404, 'Unknown action.');
  const limit = LIMITS[action];
  if (!rateLimit(`cp-pub-${action}:${found.tokenKey}`, limit[0], 10 * 60_000) || !rateLimit(`cp-pub-${action}-ip:${found.ip}`, limit[1], 10 * 60_000)) {
    return fail(429, 'Too many requests. Wait a few minutes and try again.');
  }
  const body = await readJson(req, 16 * 1024);
  if (!body) return fail(400, 'Send the details as JSON (at most 16 KB).');
  const { project } = found;
  const origin = req.nextUrl.origin;
  // "Who are you?": a visitor who picked a client-side person acts under that person's name. Only
  // client-side people can be picked (an id of one of our people, or of another project, is ignored).
  if (typeof body.personId === 'string') {
    const person = (project.people ?? []).find((x) => x.id === body.personId && x.side === 'client');
    if (person) body.name = person.name;
  }
  try {
    if (await clientDailyCapReached(project)) return fail(429, 'This board has had a lot of activity today. Please try again tomorrow, or contact us directly.');
    if (action === 'tick' || action === 'untick') await clientTick(project, body.taskId, action === 'tick', body.name, origin);
    else if (action === 'claim') await clientClaim(project, body.taskId, body.name, origin);
    else if (action === 'comment') await clientComment(project, body.taskId, body.body, body.name, origin);
    else if (action === 'defect') await clientDefect(project, body, origin);
    else if (action === 'retest') await clientRetest(project, body.taskId, body.confirmed === true, body.name, origin);
    else return fail(404, 'Unknown action.');
    const store = getClientProjectStore();
    const [fresh, tasks, comments, attachments] = await Promise.all([store.getProject(project.id), store.listTasks(project.id), store.listComments(project.id), store.listFiles(project.id, 'attachment')]);
    return json({ success: true, board: toPublicProject(fresh ?? project, tasks, comments, undefined, attachments) });
  } catch (err) {
    return cpFail(err, `board ${action}`);
  }
}
