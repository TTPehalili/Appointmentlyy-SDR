import { NextRequest, NextResponse } from 'next/server';
import { CHAT_PAGE_SIZE, cleanBody, findMentions } from '@/lib/chat';
import { nowIso } from '@/lib/server/tenantStore';
import { getChatStore } from '@/lib/server/chatStore';
import {
  audienceOf,
  channelForRequest,
  directoryFor,
  fail,
  json,
  postMessage,
  rateLimited,
  readJsonObject,
  requireChat,
  tombstone,
  tooFast,
  visibleChannels,
} from '@/lib/server/chatApi';

const validTime = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : null);

/**
 * GET /api/chat/messages?channelId=…[&before=ISO]   newest 50 (older than `before`), oldest first
 * GET /api/chat/messages?since=ISO[&channelId=…]     everything created or changed after `since`
 *     in that channel or in every channel the person can read (the polling fallback)
 */
export async function GET(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  const q = req.nextUrl.searchParams;
  const channelId = q.get('channelId');
  try {
    const store = getChatStore();
    const serverTime = nowIso();
    if (q.has('since')) {
      const since = validTime(q.get('since'));
      if (!since) return fail(400, 'since must be a date and time.');
      let ids: string[];
      if (channelId) {
        const channel = await channelForRequest(ctx, channelId);
        if (channel instanceof NextResponse) return channel;
        ids = [channel.id];
      } else {
        ids = (await visibleChannels(ctx)).map((c) => c.id);
      }
      const messages = (await store.listChangedSince(ctx.tenantCode, ids, since, 500)).map(tombstone);
      return json({ success: true, messages, serverTime });
    }
    const channel = await channelForRequest(ctx, channelId);
    if (channel instanceof NextResponse) return channel;
    const before = q.has('before') ? validTime(q.get('before')) : undefined;
    if (before === null) return fail(400, 'before must be a date and time.');
    const limit = Math.min(Math.max(Number(q.get('limit')) || CHAT_PAGE_SIZE, 1), 100);
    const rows = await store.listMessages(ctx.tenantCode, channel.id, { before, limit: limit + 1 });
    const hasMore = rows.length > limit;
    const messages = (hasMore ? rows.slice(1) : rows).map(tombstone);
    return json({ success: true, messages, hasMore, serverTime });
  } catch (err) {
    console.error('[chat/messages GET]', err);
    return fail(500, 'Could not load messages.');
  }
}

/**
 * POST /api/chat/messages { channelId, body }
 * Plain text, up to 2000 characters, about one per second. @Name mentions are resolved against the
 * people who can read the channel.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const input = await readJsonObject(req);
    if (!input) return fail(400, 'Send the message as JSON.');
    const channel = await channelForRequest(ctx, input.channelId);
    if (channel instanceof NextResponse) return channel;
    const cleaned = cleanBody(input.body);
    if (!cleaned.ok) return fail(400, cleaned.error);
    const wait = rateLimited(ctx);
    if (wait) return tooFast(wait);
    const audience = audienceOf(channel, await directoryFor(ctx));
    const mentions = findMentions(cleaned.body, audience).filter((e) => e !== ctx.me.email);
    const message = await postMessage(ctx, channel, { kind: 'text', body: cleaned.body, meta: mentions.length ? { mentions } : {} });
    return json({ success: true, message });
  } catch (err) {
    console.error('[chat/messages POST]', err);
    return fail(500, 'Could not send the message.');
  }
}
