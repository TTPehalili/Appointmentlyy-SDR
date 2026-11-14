import { NextRequest, NextResponse } from 'next/server';
import { CHAT_REACTIONS_MAX, reactionsOf } from '@/lib/chat';
import { normalizeEmoji } from '@/lib/emoji';
import { getChatStore, isChatId } from '@/lib/server/chatStore';
import { channelForRequest, fail, json, publishUpdate, rateLimited, readJsonObject, requireChat, tooFast } from '@/lib/server/chatApi';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'Message not found.');
const gone = () => fail(410, 'This message was deleted.');

/**
 * POST /api/chat/messages/:id/reactions { emoji, on }
 * Add (on: true) or remove (on: false) your emoji reaction; without `on` it toggles. The emoji must
 * be one from the chat picker. Same visibility as reading the message: another workspace's or
 * someone else's DM is a 404, #managers below Supervisor a 403. Not on deleted or system messages.
 * Changes bump updatedAt and are pushed on the live stream, so polling with ?since= sees them too.
 */
export async function POST(req: NextRequest, route: Ctx) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await route.params;
  if (!isChatId(id)) return notFound();
  try {
    const input = await readJsonObject(req);
    if (!input) return fail(400, 'Send the reaction as JSON.');
    const emoji = normalizeEmoji(input.emoji);
    if (!emoji) return fail(400, 'Pick an emoji from the list.');
    if (input.on !== undefined && typeof input.on !== 'boolean') return fail(400, 'on must be true or false.');
    const on = input.on as boolean | undefined;

    const store = getChatStore();
    const msg = await store.getMessage(ctx.tenantCode, id);
    if (!msg) return notFound();
    const channel = await channelForRequest(ctx, msg.channelId);
    if (channel instanceof NextResponse) return channel.status === 403 ? channel : notFound();
    if (msg.deletedAt) return gone();
    if (msg.kind === 'system') return fail(400, 'System messages do not take reactions.');

    const wait = rateLimited(ctx, 'reaction');
    if (wait) return tooFast(wait, 'reacting');

    const result = await store.react(ctx.tenantCode, id, ctx.me.email, emoji, on);
    if (!result) return notFound();
    if (result === 'deleted') return gone();
    if (result === 'limit') return fail(409, `This message already has ${CHAT_REACTIONS_MAX} different reactions.`);
    if (result.changed) publishUpdate(ctx.tenantCode, channel, result.message);
    const mine = (reactionsOf(result.message)[emoji] ?? []).includes(ctx.me.email);
    return json({ success: true, message: result.message, emoji, on: mine });
  } catch (err) {
    console.error('[chat/messages/:id/reactions POST]', err);
    return fail(500, 'Could not save the reaction.');
  }
}
