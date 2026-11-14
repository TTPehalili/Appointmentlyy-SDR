import { NextRequest, NextResponse } from 'next/server';
import { publishChat } from '@/lib/server/chatBus';
import { getChatStore, isChatId } from '@/lib/server/chatStore';
import { nowIso } from '@/lib/server/tenantStore';
import { fail, json, publishUpdate, refOf, requireChat, tombstone, visibleChannel } from '@/lib/server/chatApi';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => fail(404, 'Message not found.');

/**
 * DELETE /api/chat/messages/:id
 * Your own messages; Supervisor and above may delete any message in a channel they can read in
 * their workspace. Soft delete: everyone sees "Message deleted".
 */
export async function DELETE(req: NextRequest, route: Ctx) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await route.params;
  if (!isChatId(id)) return notFound();
  try {
    const store = getChatStore();
    const msg = await store.getMessage(ctx.tenantCode, id);
    if (!msg) return notFound();
    const channel = await visibleChannel(ctx, msg.channelId);
    if (!channel) return notFound();
    if (msg.senderEmail !== ctx.me.email && !ctx.me.canManage) return fail(403, 'You can only delete your own messages.');
    if (msg.deletedAt) return json({ success: true, message: tombstone(msg) });
    const updated = await store.updateMessage(ctx.tenantCode, id, { deletedAt: nowIso(), body: '', meta: {} });
    if (!updated) return notFound();
    if (channel.pinnedMessageId === id) {
      await store.setPinned(ctx.tenantCode, channel.id, null);
      publishChat(ctx.tenantCode, { type: 'channel', channel: refOf(channel), pinned: null });
    }
    publishUpdate(ctx.tenantCode, channel, tombstone(updated));
    return json({ success: true, message: tombstone(updated) });
  } catch (err) {
    console.error('[chat/messages/:id DELETE]', err);
    return fail(500, 'Could not delete the message.');
  }
}
