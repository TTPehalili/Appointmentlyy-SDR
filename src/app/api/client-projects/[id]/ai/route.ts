import { after, NextRequest, NextResponse } from 'next/server';
import { fail, json, readJson } from '@/lib/server/agreements/core';
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { AI_OFF_MESSAGE, aiMode, aiProvider, latestRun, startAiRun } from '@/lib/server/clientProjects/ai';
import { approveRun, discardRun, draftStatusUpdate } from '@/lib/server/clientProjects/service';

type Ctx = { params: Promise<{ id: string }> };

// A draft is up to two model calls of up to 180 seconds each (PLANNER_TIMEOUT_MS), run after the response.
export const maxDuration = 420;

/** GET /api/client-projects/:id/ai -> the latest AI plan run (running, draft to review, approved, discarded or failed). */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  try {
    const mode = aiMode();
    return json({ success: true, ai: mode, aiProvider: aiProvider(), message: mode === 'off' ? AI_OFF_MESSAGE : null, run: await latestRun(id), statusDraft: o.project.statusDraft });
  } catch (err) {
    return cpFail(err, 'ai get');
  }
}

/**
 * POST /api/client-projects/:id/ai   (owner only)
 * { action: 'approve', edits? }   the ONE step that puts the drafted plan on the board
 * { action: 'discard' }           drop the draft
 * { action: 'retry' }             draft again from the documents already attached
 * { action: 'status-update' }     draft a client progress note and the Delivery Report text (a draft; nothing is sent)
 * Runs start by themselves when a document is uploaded or attached.
 */
export async function POST(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'ai');
  if (o instanceof NextResponse) return o;
  const body = await readJson(req, 256 * 1024);
  if (!body) return fail(400, 'Send the action as JSON.');
  try {
    const action = String(body.action || '');
    if (action === 'status-update') return json({ success: true, statusDraft: await draftStatusUpdate(o.project, o.ctx) });
    if (action === 'retry') {
      if (aiMode() === 'off') return fail(409, AI_OFF_MESSAGE);
      const started = await startAiRun(id, o.ctx.actor);
      if (!started) return fail(409, 'Attach a document first.');
      if (started.work) after(started.work);
      return json({ success: true, run: started.run });
    }
    const run = await latestRun(id);
    if (!run) return fail(404, 'There is no AI draft for this project.');
    if (action === 'approve') {
      const edits = body.edits && typeof body.edits === 'object' && !Array.isArray(body.edits) ? (body.edits as Record<string, unknown>) : {};
      const result = await approveRun(o.project, run, edits, o.ctx);
      return json({ success: true, ...result, run: await getClientProjectStore().getRun(run.id) });
    }
    if (action === 'discard') {
      await discardRun(o.project, run, o.ctx);
      return json({ success: true });
    }
    return fail(400, 'Unknown action.');
  } catch (err) {
    return cpFail(err, 'ai post');
  }
}
