import { NextRequest, NextResponse } from 'next/server';
import { parsePresenceStatus, PRESENCE_AWAY_AFTER_MS, type ChatPresence } from '@/lib/chat';
import { publishChat } from '@/lib/server/chatBus';
import { getChatStore } from '@/lib/server/chatStore';
import { nowIso } from '@/lib/server/tenantStore';
import { directoryFor, fail, json, presenceChanged, readJsonObject, requireChat } from '@/lib/server/chatApi';

/**
 * GET /api/chat/presence
 * Everyone active in the workspace with Available / On a call / Away. No heartbeat for about two
 * minutes counts as Away.
 */
async function peopleFor(ctx: Exclude<Awaited<ReturnType<typeof requireChat>>, NextResponse>): Promise<ChatPresence[]> {
  const [members, rows] = await Promise.all([directoryFor(ctx), getChatStore().listPresence(ctx.tenantCode)]);
  const byEmail = new Map(rows.map((r) => [r.email, r]));
  const now = Date.now();
  return members.map((m) => {
    const r = byEmail.get(m.email);
    const fresh = r && now - Date.parse(r.updatedAt) < PRESENCE_AWAY_AFTER_MS;
    return { ...m, status: fresh ? r.status : 'away', lastSeenAt: r?.updatedAt ?? null };
  });
}

export async function GET(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return json({ success: true, people: await peopleFor(ctx), serverTime: nowIso() });
  } catch (err) {
    console.error('[chat/presence GET]', err);
    return fail(500, 'Could not load who is online.');
  }
}

/**
 * POST /api/chat/presence { status: "available" | "on_call" | "away", people?: true }
 * Heartbeat, about every 30 seconds while the app is open, and right away when the status changes
 * (the Dialer sends on_call during a call). With people: true the reply also carries what
 * GET returns, so the periodic heartbeat is one request instead of two.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const input = await readJsonObject(req);
    const status = parsePresenceStatus(input?.status);
    if (!status) return fail(400, 'status must be available, on_call or away.');
    const row = await getChatStore().heartbeat(ctx.tenantCode, ctx.me.email, status);
    if (presenceChanged(ctx.tenantCode, ctx.me.email, status)) {
      publishChat(ctx.tenantCode, { type: 'presence', email: ctx.me.email, status, at: row.updatedAt });
    }
    if (input?.people === true) return json({ success: true, status, at: row.updatedAt, people: await peopleFor(ctx), serverTime: nowIso() });
    return json({ success: true, status, at: row.updatedAt });
  } catch (err) {
    console.error('[chat/presence POST]', err);
    return fail(500, 'Could not update your status.');
  }
}
