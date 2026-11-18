/**
 * Slow API request log (Node server only): times every /api/ request from the moment the server
 * receives it to the moment the response has finished, through Node's built-in HTTP diagnostics
 * channels, so no route handler needs wrapping. Logs only method, route pattern and duration
 * (see slowLog.ts). Long-lived streams are skipped. Installed once from instrumentation.ts.
 */
import diagnosticsChannel from 'node:diagnostics_channel';
import type { IncomingMessage } from 'node:http';
import { warnIfSlow } from '@/lib/server/slowLog';

/** Server-sent event streams stay open on purpose. */
const STREAMS = ['/api/chat/stream', '/api/mcp/sse'];

export function installSlowRequestLog() {
  const g = globalThis as unknown as { __appySlowRequestLog?: boolean };
  if (g.__appySlowRequestLog) return;
  g.__appySlowRequestLog = true;

  const started = new WeakMap<IncomingMessage, number>();
  const pathOf = (req: IncomingMessage) => (req.url || '').split('?')[0];
  diagnosticsChannel.subscribe('http.server.request.start', (msg) => {
    const req = (msg as { request?: IncomingMessage }).request;
    if (!req) return;
    const path = pathOf(req);
    if (path.startsWith('/api/') && !STREAMS.some((s) => path === s || path.startsWith(`${s}/`))) started.set(req, performance.now());
  });
  diagnosticsChannel.subscribe('http.server.response.finish', (msg) => {
    const req = (msg as { request?: IncomingMessage }).request;
    if (!req) return;
    const t = started.get(req);
    if (t === undefined) return;
    started.delete(req);
    warnIfSlow('api', req.method || '', pathOf(req), t);
  });
}
