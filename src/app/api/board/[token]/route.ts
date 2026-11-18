import { after, NextRequest, NextResponse } from 'next/server';
import { json } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { toPublicProject } from '@/lib/server/clientProjects/core';
import { cpFail, projectByToken } from '@/lib/server/clientProjects/http';
import { sweepProject } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/board/:token   (public; the link token is the credential)
 * The shared client board. Everything in the reply comes from toPublicProject(): client-visible
 * cards and client-safe fields only.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { token } = await c.params;
  const found = await projectByToken(req, token);
  if (found instanceof NextResponse) return found;
  try {
    const store = getClientProjectStore();
    const { project } = found;
    const [tasks, comments, attachments] = await Promise.all([store.listTasks(project.id), store.listComments(project.id), store.listFiles(project.id, 'attachment')]);
    // Lazy housekeeping after the response (no cron): never slows or fails the client's page.
    const origin = req.nextUrl.origin;
    after(() => sweepProject(project.id, { origin, minGapMs: 60_000 }));
    return json({ success: true, board: toPublicProject(project, tasks, comments, undefined, attachments) });
  } catch (err) {
    return cpFail(err, 'board');
  }
}
