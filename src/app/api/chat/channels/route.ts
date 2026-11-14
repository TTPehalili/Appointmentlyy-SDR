import { NextRequest, NextResponse } from 'next/server';
import { nowIso } from '@/lib/server/tenantStore';
import { directoryFor, ensureDm, fail, json, readJsonObject, requireChat, summarize, visibleChannels } from '@/lib/server/chatApi';

/**
 * GET /api/chat/channels
 * The channels the signed-in person can read in their current workspace (#floor, #managers for
 * Supervisor and above, their DMs) with unread and @mention counts, the last message and the
 * #floor pin. Workspace from the session only.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const serverTime = nowIso();
    const channels = await summarize(ctx, await visibleChannels(ctx));
    return json({ success: true, me: ctx.me, channels, serverTime });
  } catch (err) {
    console.error('[chat/channels GET]', err);
    return fail(500, 'Could not load team chat.');
  }
}

/**
 * POST /api/chat/channels { dmWith: "teammate@company.com" }
 * Open (or create) the direct message channel with someone in the same workspace.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await readJsonObject(req);
    const email = String(body?.dmWith ?? '').trim().toLowerCase();
    if (!email) return fail(400, 'Pick who to message.');
    if (email === ctx.me.email) return fail(400, 'Pick someone other than yourself.');
    const members = await directoryFor(ctx);
    if (!members.some((m) => m.email === email)) return fail(404, 'That person is not in this workspace.');
    const channel = await ensureDm(ctx.tenantCode, ctx.me.email, email);
    const [summary] = await summarize(ctx, [channel]);
    return json({ success: true, channel: summary });
  } catch (err) {
    console.error('[chat/channels POST]', err);
    return fail(500, 'Could not open the conversation.');
  }
}
