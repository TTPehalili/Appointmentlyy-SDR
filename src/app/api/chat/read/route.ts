import { NextRequest, NextResponse } from 'next/server';
import { getChatStore } from '@/lib/server/chatStore';
import { nowIso } from '@/lib/server/tenantStore';
import { channelForRequest, fail, json, readJsonObject, requireChat } from '@/lib/server/chatApi';

/**
 * POST /api/chat/read { channelId }
 * Mark everything in the channel as read for the signed-in person (clears its unread badge).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const input = await readJsonObject(req);
    const channel = await channelForRequest(ctx, input?.channelId);
    if (channel instanceof NextResponse) return channel;
    const channelId = channel.id;
    const store = getChatStore();
    // Never earlier than the newest message, in case the database clock runs ahead of this server.
    const last = (await store.lastMessages(ctx.tenantCode, [channelId])).get(channelId);
    const now = nowIso();
    const at = last && Date.parse(last.createdAt) > Date.parse(now) ? last.createdAt : now;
    await store.markRead(ctx.tenantCode, channelId, ctx.me.email, at);
    return json({ success: true, lastReadAt: at });
  } catch (err) {
    console.error('[chat/read POST]', err);
    return fail(500, 'Could not update the read marker.');
  }
}
