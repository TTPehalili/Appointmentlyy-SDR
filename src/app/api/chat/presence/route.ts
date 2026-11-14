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
export async function GET(req: NextRequest) {
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const [members, rows] = await Promise.all([directoryFor(ctx), getChatStore().listPresence(ctx.tenantCode)]);
    const byEmail = new Map(rows.map((r) => [r.email, r]));
    const now = Date.now();
    const people: ChatPresence[] = members.map((m) => {
      const r = byEmail.get(m.email);
      const fresh = r && now - Date.parse(r.updatedAt) < PRESENCE_AWAY_AFTER_MS;
      return { ...m, status: fresh ? r.status : 'away', lastSeenAt: r?.updatedAt ?? null };
    });
    return json({ success: true, people, serverTime: nowIso() });
  } catch (err) {
    console.error('[chat/presence GET]', err);
    return fail(500, 'Could not load who is online.');
  }
}

/**
 * POST /api/chat/presence { status: "available" | "on_call" | "away" }
 * Heartbeat, about every 30 seconds while the app is open, and right away when the status changes
 * (the Dialer sends on_call during a call).
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
    return json({ success: true, status, at: row.updatedAt });
  } catch (err) {
    console.error('[chat/presence POST]', err);
    return fail(500, 'Could not update your status.');
  }
}
