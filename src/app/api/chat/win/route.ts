import { NextRequest, NextResponse } from 'next/server';
import { cleanName, winBody } from '@/lib/chat';
import { getChatStore } from '@/lib/server/chatStore';
import {
  ensureSharedChannels,
  fail,
  floorChannelId,
  json,
  postMessage,
  rateLimited,
  readJsonObject,
  requireChat,
  tooFast,
} from '@/lib/server/chatApi';

/** The same rep booking the same company again within this window is a double click, not a new win. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * POST /api/chat/win { leadName?, company? }
 * Win bell: "🔔 {rep} booked a meeting with {company}" in #floor. The Dialer calls this when a
 * meeting is booked.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const input = (await readJsonObject(req)) ?? {};
    const leadName = cleanName(input.leadName);
    const company = cleanName(input.company);
    await ensureSharedChannels(ctx.tenantCode);
    const store = getChatStore();
    const channel = await store.getChannel(ctx.tenantCode, floorChannelId(ctx.tenantCode));
    if (!channel) return fail(500, 'Could not reach #floor.');

    const recent = await store.listMessages(ctx.tenantCode, channel.id, { limit: 30 });
    const dup = recent.find(
      (m) =>
        m.kind === 'win' &&
        !m.deletedAt &&
        m.senderEmail === ctx.me.email &&
        (m.meta.win?.company ?? '') === company &&
        (m.meta.win?.leadName ?? '') === leadName &&
        Date.now() - Date.parse(m.createdAt) < DUPLICATE_WINDOW_MS,
    );
    if (dup) return json({ success: true, message: dup, duplicate: true });

    const wait = rateLimited(ctx);
    if (wait) return tooFast(wait);
    const win = { ...(leadName ? { leadName } : {}), ...(company ? { company } : {}) };
    const message = await postMessage(ctx, channel, { kind: 'win', body: winBody(ctx.me.name, win), meta: { win } });
    return json({ success: true, message });
  } catch (err) {
    console.error('[chat/win POST]', err);
    return fail(500, 'Could not ring the win bell.');
  }
}
