/**
 * SSRF-safe webhook POST (server only).
 *
 * - https on port 443 to a public DNS name only (checkWebhookUrlShape).
 * - The host is resolved here, EVERY answer must be public, and the TCP connection is pinned to the
 *   checked address through a custom `lookup` (TLS still verifies the certificate for the hostname
 *   via SNI/servername). A DNS answer can't change between the check and the connect (no rebinding).
 * - No redirects (a 3xx is reported as a failure), 10 s total deadline, at most 4 KB of the response
 *   is read, fresh socket per attempt (no shared keep-alive pool).
 * - Messages are short and user-safe: no stack traces, addresses or secrets.
 */
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import {
  INTEGRATION_LIMITS,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  type DeliveryAttemptResult,
} from '@/lib/integrations';
import { signatureHeader } from '@/lib/server/integrations/signature';
import { checkWebhookUrlShape, resolvePublicHost, systemResolver, type ResolvedAddress, type Resolver } from '@/lib/server/integrations/webhookUrl';

export const USER_AGENT = 'Appointmentlyy-Webhooks/1';
export const MAX_RESPONSE_BYTES = 4096;
const EXCERPT_CHARS = 1000;

export interface WebhookSendInput {
  url: string;
  /** Plain signing secret (opened from the sealed store value just before sending). */
  secret: string;
  eventId: string;
  eventType: string;
  /** Exact JSON text to send; the signature covers these bytes. */
  body: string;
  timeoutMs?: number;
  resolve?: Resolver;
}

export interface WebhookSendResult extends DeliveryAttemptResult {
  /** First part of the receiver's reply (for support), already truncated. */
  responseExcerpt: string;
}

const fail = (started: number, message: string, httpStatus = 0, responseExcerpt = ''): WebhookSendResult => ({
  ok: false,
  httpStatus,
  durationMs: Date.now() - started,
  message,
  responseExcerpt,
});

function pinnedLookup(addr: ResolvedAddress): LookupFunction {
  return ((_hostname: string, options: { all?: boolean } | number | undefined, callback: (...args: unknown[]) => void) => {
    const cb = typeof options === 'function' ? (options as unknown as (...args: unknown[]) => void) : callback;
    const all = typeof options === 'object' && options !== null && options.all;
    if (all) cb(null, [{ address: addr.address, family: addr.family }]);
    else cb(null, addr.address, addr.family);
  }) as unknown as LookupFunction;
}

function errorMessage(err: NodeJS.ErrnoException, timeoutMs: number, timedOut: boolean): string {
  if (timedOut) return `Timed out after ${Math.round(timeoutMs / 1000)}s`;
  const code = String(err?.code || '');
  if (code === 'ECONNREFUSED') return 'The receiver refused the connection';
  if (code === 'ECONNRESET' || code === 'EPIPE') return 'The receiver closed the connection';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EADDRNOTAVAIL') return "Couldn't reach the receiver";
  if (/CERT|SELF_SIGNED|TLS|SSL|UNABLE_TO_VERIFY|ERR_SSL/i.test(code)) return "The receiver's TLS certificate is not valid";
  return "Couldn't connect to the receiver";
}

const cleanExcerpt = (buf: Buffer) =>
  buf.toString('utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, EXCERPT_CHARS);

export async function sendWebhook(input: WebhookSendInput): Promise<WebhookSendResult> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? INTEGRATION_LIMITS.receiverTimeoutMs;
  const shape = checkWebhookUrlShape(input.url);
  if (!shape.ok) return fail(started, shape.error);

  let pinned: ResolvedAddress | null = null;
  if (!shape.testReceiver) {
    const r = await resolvePublicHost(shape.hostname, input.resolve ?? systemResolver);
    if (!r.ok) return fail(started, r.error);
    // Every answer is public; prefer IPv4 (not every host has IPv6 egress).
    pinned = r.addresses.find((a) => a.family === 4) ?? r.addresses[0];
  }

  const bodyBuf = Buffer.from(input.body, 'utf8');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': String(bodyBuf.length),
    'User-Agent': USER_AGENT,
    Accept: '*/*',
    [WEBHOOK_SIGNATURE_HEADER]: signatureHeader(input.secret, input.body),
    [WEBHOOK_EVENT_ID_HEADER]: input.eventId,
    [WEBHOOK_EVENT_TYPE_HEADER]: input.eventType,
  };
  const url = shape.url;

  return new Promise<WebhookSendResult>((resolve) => {
    let settled = false;
    let timedOut = false;

    const common = { method: 'POST', path: `${url.pathname}${url.search}`, headers, agent: false as const };
    const req = shape.testReceiver
      ? http.request({ ...common, host: url.hostname, port: Number(url.port) })
      : https.request({
          ...common,
          host: shape.hostname,
          port: 443,
          servername: shape.hostname,
          lookup: pinnedLookup(pinned!),
          // Node's default checks (certificate chain + hostname) stay on.
          rejectUnauthorized: true,
        });

    const timer = setTimeout(() => {
      timedOut = true;
      req.destroy(new Error('timeout'));
    }, timeoutMs);
    const done = (r: WebhookSendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    req.on('error', (err: NodeJS.ErrnoException) => done(fail(started, errorMessage(err, timeoutMs, timedOut))));
    req.on('response', (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      let size = 0;
      const finish = () => {
        const excerpt = cleanExcerpt(Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BYTES));
        const durationMs = Date.now() - started;
        if (status >= 200 && status < 300) done({ ok: true, httpStatus: status, durationMs, message: `Delivered (HTTP ${status})`, responseExcerpt: excerpt });
        else if (status >= 300 && status < 400) done(fail(started, `Receiver redirected (HTTP ${status}). Redirects are not followed; use the final URL.`, status, excerpt));
        else done(fail(started, `Receiver returned HTTP ${status}`, status, excerpt));
      };
      res.on('data', (c: Buffer) => {
        if (size >= MAX_RESPONSE_BYTES) return;
        chunks.push(c);
        size += c.length;
        if (size >= MAX_RESPONSE_BYTES) {
          finish();
          res.destroy();
        }
      });
      res.on('end', finish);
      res.on('error', finish);
      res.on('close', finish);
    });
    req.end(bodyBuf);
  });
}
