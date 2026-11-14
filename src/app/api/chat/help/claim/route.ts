import { NextRequest, NextResponse } from 'next/server';
import { getChatStore, isChatId } from '@/lib/server/chatStore';
import {
  directoryFor,
  ensureDm,
  fail,
  json,
  managersChannelId,
  postMessage,
  publishUpdate,
  readJsonObject,
  requireChat,
  visibleChannel,
} from '@/lib/server/chatApi';

/**
 * POST /api/chat/help/claim { messageId }
 * "I'm on it": a supervisor (or above) claims an open help request. The request shows who took it,
 * #managers gets a reply line, and the rep gets a direct message so they know help is coming.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.me.canManage) return fail(403, 'Only supervisors, managers and admins can take help requests.');
  try {
    const input = await readJsonObject(req);
    const id = input?.messageId;
    if (!isChatId(id)) return fail(404, 'Help request not found.');
    const channel = await visibleChannel(ctx, managersChannelId(ctx.tenantCode));
    if (!channel) return fail(404, 'Help request not found.');
    const store = getChatStore();
    const current = await store.getMessage(ctx.tenantCode, id);
    if (!current || current.channelId !== channel.id || current.kind !== 'help') return fail(404, 'Help request not found.');

    const claimed = await store.claimHelp(ctx.tenantCode, id, { email: ctx.me.email, name: ctx.me.name });
    if (!claimed) return fail(404, 'Help request not found.');
    if (claimed === 'taken') {
      const now = await store.getMessage(ctx.tenantCode, id);
      return json({ success: false, error: `${now?.meta.help?.claimedBy?.name ?? 'Someone'} is already on it.`, message: now }, 409);
    }
    publishUpdate(ctx.tenantCode, channel, claimed);

    const help = claimed.meta.help!;
    const lead = help.leadName || help.company;
    await postMessage(ctx, channel, {
      kind: 'system',
      body: `${ctx.me.name} is on it, helping ${help.requestedByName}${lead ? ` with ${lead}` : ''}.`,
      meta: { replyTo: claimed.id },
    });
    if (help.requestedBy !== ctx.me.email && (await directoryFor(ctx)).some((m) => m.email === help.requestedBy)) {
      const dm = await ensureDm(ctx.tenantCode, ctx.me.email, help.requestedBy);
      await postMessage(ctx, dm, { kind: 'text', body: `I'm on it: coming to help you${lead ? ` with ${lead}` : ''}.`, meta: { replyTo: claimed.id } });
    }
    return json({ success: true, message: claimed });
  } catch (err) {
    console.error('[chat/help/claim POST]', err);
    return fail(500, 'Could not claim the help request.');
  }
}
