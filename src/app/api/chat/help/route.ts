import { NextRequest, NextResponse } from 'next/server';
import { cleanName, helpBody } from '@/lib/chat';
import { ensureSharedChannels, fail, json, managersChannelId, postMessage, rateLimited, readJsonObject, requireChat, tooFast } from '@/lib/server/chatApi';
import { getChatStore } from '@/lib/server/chatStore';

const g = globalThis as typeof globalThis & { __appyChatHelpAt?: Map<string, number> };
const lastHelp = (g.__appyChatHelpAt ??= new Map<string, number>());
const HELP_COOLDOWN_MS = 15_000;

/**
 * POST /api/chat/help { leadName?, company?, note? }
 * "Need help": posts a help request to #managers with the rep's name and the lead they are on.
 * Anyone in the workspace may ask; supervisors and above see it highlighted and can claim it.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const input = (await readJsonObject(req)) ?? {};
    const leadName = cleanName(input.leadName);
    const company = cleanName(input.company);
    const note = cleanName(input.note, 300);
    const key = `${ctx.tenantCode}|${ctx.me.email}`;
    const since = Date.now() - (lastHelp.get(key) ?? 0);
    if (since < HELP_COOLDOWN_MS) return tooFast(Math.ceil((HELP_COOLDOWN_MS - since) / 1000));
    const wait = rateLimited(ctx);
    if (wait) return tooFast(wait);
    await ensureSharedChannels(ctx.tenantCode);
    const channel = await getChatStore().getChannel(ctx.tenantCode, managersChannelId(ctx.tenantCode));
    if (!channel) return fail(500, 'Could not reach #managers.');
    lastHelp.set(key, Date.now());
    const help = {
      requestedBy: ctx.me.email,
      requestedByName: ctx.me.name,
      ...(leadName ? { leadName } : {}),
      ...(company ? { company } : {}),
      ...(note ? { note } : {}),
    };
    const message = await postMessage(ctx, channel, { kind: 'help', body: helpBody(ctx.me.name, help), meta: { help } });
    return json({ success: true, message });
  } catch (err) {
    console.error('[chat/help POST]', err);
    return fail(500, 'Could not send the help request.');
  }
}
