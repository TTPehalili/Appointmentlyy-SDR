import { NextRequest, NextResponse, connection } from 'next/server';
import type { ChatEvent } from '@/lib/chat';
import { subscribeChat } from '@/lib/server/chatBus';
import { nowIso } from '@/lib/server/tenantStore';
import { requireChat, tombstone } from '@/lib/server/chatApi';

/** Comment line so proxies and browsers keep the connection open. */
const KEEP_ALIVE_MS = 20_000;
/** Re-check the session this often: a removed member or changed role is cut off within minutes. */
const RECHECK_MS = 2 * 60_000;
/** Close after this long; the browser reconnects on its own (and catches up with ?since=). */
const MAX_LIFETIME_MS = 30 * 60_000;

/**
 * GET /api/chat/stream   Server-Sent Events for the signed-in person's workspace.
 *   event: ready     { serverTime }   on connect; the browser catches up from its last cursor
 *   event: message   { message, channel }   new or changed message in a channel they can read
 *   event: channel   { channel, pinned }    #floor pin changed
 *   event: presence  { email, status, at }
 *   event: member    { email, avatar, at }    someone's profile photo changed
 * Every request runs at request time (session cookie, connection()): nothing here is cached.
 */
export async function GET(req: NextRequest) {
  await connection();
  const ctx = await requireChat(req);
  if (ctx instanceof NextResponse) return ctx;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const unsubscribe = subscribeChat(ctx.tenantCode, {
        email: ctx.me.email,
        canManage: ctx.me.canManage,
        send: (e: ChatEvent) => {
          if (e.type === 'message') send('message', { message: tombstone(e.message), channel: e.channel });
          else if (e.type === 'channel') send('channel', { channel: e.channel, pinned: e.pinned ?? null });
          else if (e.type === 'member') send('member', { email: e.email, avatar: e.avatar, at: e.at });
          else send('presence', { email: e.email, status: e.status, at: e.at });
        },
      });

      const keepAlive = setInterval(() => write(`: ping ${Date.now()}\n\n`), KEEP_ALIVE_MS);
      const recheck = setInterval(async () => {
        const live = await requireChat(req).catch(() => null);
        if (!live || live instanceof NextResponse || live.tenantCode !== ctx.tenantCode || live.me.canManage !== ctx.me.canManage) cleanup();
      }, RECHECK_MS);
      const lifetime = setTimeout(() => cleanup(), MAX_LIFETIME_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(keepAlive);
        clearInterval(recheck);
        clearTimeout(lifetime);
        req.signal.removeEventListener('abort', cleanup);
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener('abort', cleanup);

      write('retry: 3000\n\n');
      send('ready', { serverTime: nowIso() });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps compression from buffering the stream.
      'Cache-Control': 'no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
