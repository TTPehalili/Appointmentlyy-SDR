/**
 * Shared bits of the /api/tickets routes: capped body readers, plain errors, the viewer from the session, and the
 * mail calls that must never fail a request (they run after the response, see `after`).
 */
import { NextResponse, after, type NextRequest } from 'next/server';
import type { ServerSession } from '@/lib/server/session';
import type { TicketViewer } from '@/lib/server/ticketScope';
import { SupportStorageError } from '@/lib/server/supportTickets';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status, headers: NO_STORE });

export const ok = (body: Record<string, unknown>, status = 200) => NextResponse.json({ success: true, ...body }, { status, headers: NO_STORE });

export const viewerOf = (s: ServerSession): TicketViewer => ({ isPlatformAdmin: s.isPlatformAdmin, tenantCode: s.tenantCode, email: s.email, role: s.role });

/** The request body, or null as soon as it passes `max` bytes (the rest is not read). */
export async function readCapped(req: NextRequest, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > max) return null;
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** A JSON object body under `max` bytes: the object, 'too_large', or null (not JSON, or not an object). */
export async function readJsonObject(req: NextRequest, max: number): Promise<Record<string, unknown> | 'too_large' | null> {
  const bytes = await readCapped(req, max);
  if (!bytes) return 'too_large';
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Storage errors in plain words; never the database message. */
export function storageFail(err: unknown, where: string) {
  if (err instanceof SupportStorageError) {
    console.error(`[tickets] ${where}: storage not ready (is supabase/migrations/20261130000000_support_tickets.sql applied?):`, err.message);
    return fail(503, 'Reports cannot be saved right now. Please try again in a few minutes, or email support@appointmentlyy.com.');
  }
  console.error(`[tickets] ${where}:`, err instanceof Error ? err.message : err);
  return fail(500, 'Something went wrong on our side. Please try again.');
}

/** Send mail once the response has gone out. A failure is logged, never returned to the person. */
export function sendLater(label: string, fn: () => Promise<{ success: boolean; error?: string }>) {
  after(async () => {
    try {
      const r = await fn();
      if (!r.success && r.error && !/not configured/.test(r.error)) console.warn(`[tickets] ${label} email not sent:`, String(r.error).slice(0, 200));
    } catch (err) {
      console.warn(`[tickets] ${label} email failed:`, err instanceof Error ? err.message : err);
    }
  });
}

/** Plain text from untrusted input: control characters out (newlines kept when asked), trimmed, capped. */
export function cleanText(v: unknown, max: number, multiline = true): string {
  if (typeof v !== 'string') return '';
  const s = multiline ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : v.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return s.trim().slice(0, max);
}
