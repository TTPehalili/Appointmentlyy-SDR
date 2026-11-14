import { NextRequest, NextResponse } from 'next/server';
import type { ChatMessage } from '@/lib/chat';
import { publishChat } from '@/lib/server/chatBus';
import { getChatStore, isChatId } from '@/lib/server/chatStore';
import { fail, floorChannelId, json, readJsonObject, refOf, requireChat, visibleChannel } from '@/lib/server/chatApi';

/**
 * POST /api/chat/pin { messageId }   pin a #floor message as the announcement (replaces the old one)
 * POST /api/chat/pin { messageId: null }   remove the pin
 * Supervisor and above only.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.me.canManage) return fail(403, 'Only supervisors, managers and admins can pin announcements.');
  try {
    const input = await readJsonObject(req);
    if (!input || !('messageId' in input)) return fail(400, 'Send { messageId } or { messageId: null }.');
    const channel = await visibleChannel(ctx, floorChannelId(ctx.tenantCode));
    if (!channel) return fail(404, 'Channel not found.');
    const store = getChatStore();
    let pinned: ChatMessage | null = null;
    if (input.messageId !== null) {
      if (!isChatId(input.messageId)) return fail(404, 'Message not found.');
      const msg = await store.getMessage(ctx.tenantCode, input.messageId);
      if (!msg || msg.channelId !== channel.id || msg.deletedAt) return fail(404, 'Message not found in #floor.');
      if (msg.kind !== 'text') return fail(400, 'Only regular messages can be pinned.');
      pinned = msg;
    }
    await store.setPinned(ctx.tenantCode, channel.id, pinned?.id ?? null);
    publishChat(ctx.tenantCode, { type: 'channel', channel: refOf(channel), pinned });
    return json({ success: true, pinned });
  } catch (err) {
    console.error('[chat/pin POST]', err);
    return fail(500, 'Could not update the pinned announcement.');
  }
}
