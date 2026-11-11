/**
 * Shared helpers for the /api/activity and /api/integrations route handlers (route files may only
 * export handlers). Workspace and actor always come from the live session.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  INTEGRATION_LIMITS,
  WEBHOOK_EVENT_TYPES,
  type ActivityEventType,
  type DeliveryStatusView,
  type DeliveryView,
  type WebhookEndpointView,
} from '@/lib/integrations';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { getTenantStore } from '@/lib/server/tenantStore';
import type { Delivery, WebhookEndpoint } from '@/lib/server/integrationStore';
import { UUID_RE } from '@/lib/server/integrations/eventInput';

export const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const fail = (status: number, error: string, field?: string, headers: Record<string, string> = {}) =>
  json({ success: false, error, ...(field ? { field } : {}) }, status, headers);

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Any signed-in member of the workspace, or the 401 to send. */
export async function requireMember(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  return session;
}

/** Workspace Admin and above (platform staff included). */
export async function requireIntegrationAdmin(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await requireMember(req);
  if (session instanceof NextResponse) return session;
  if (!hasRank(session, 'Admin')) return fail(403, 'Only workspace admins can manage integrations.');
  return session;
}

/** Read a JSON object body with a size cap. null = not JSON / not an object; 'too_large' = over the cap. */
export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<Record<string, unknown> | null | 'too_large'> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > maxBytes) return 'too_large';
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return 'too_large';
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function endpointView(e: WebhookEndpoint): WebhookEndpointView {
  return {
    id: e.id,
    url: e.url,
    events: e.events.filter((x): x is ActivityEventType => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(x)),
    description: e.description,
    active: e.active,
    disabledReason: e.disabledReason,
    secretHint: e.secretHint,
    consecutiveFailures: e.consecutiveFailures,
    lastDeliveryAt: e.lastDeliveryAt,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function deliveryView(d: Delivery, urlByEndpoint: Map<string, string>): DeliveryView {
  const attempted = d.attempts > 0 || d.status === 'skipped';
  return {
    id: d.id,
    eventId: d.eventId,
    eventType: d.eventType as DeliveryView['eventType'],
    summary: d.summary ?? '',
    destination: { kind: 'webhook', endpointId: d.endpointId ?? '', url: (d.endpointId && urlByEndpoint.get(d.endpointId)) || '' },
    status: d.status as DeliveryStatusView,
    attempts: d.attempts,
    nextAttemptAt: d.nextAttemptAt,
    lastResult: attempted
      ? {
          ok: d.status === 'succeeded',
          httpStatus: d.responseCode ?? 0,
          durationMs: d.durationMs ?? 0,
          message: d.lastMessage ?? d.lastError ?? '',
        }
      : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export type EndpointFields = { events?: ActivityEventType[]; description?: string };

/** events / description from a create or update body (url is checked separately: it needs DNS). */
export function endpointFields(body: Record<string, unknown>, partial: boolean): { ok: true; value: EndpointFields } | { ok: false; error: string; field: string } {
  const out: EndpointFields = {};
  if (!partial || body.events !== undefined) {
    const ev = body.events;
    if (!Array.isArray(ev) || ev.length === 0) return { ok: false, error: 'Pick at least one event to send.', field: 'events' };
    if (ev.length > WEBHOOK_EVENT_TYPES.length * 2) return { ok: false, error: 'Too many events.', field: 'events' };
    const bad = ev.find((x) => typeof x !== 'string' || !(WEBHOOK_EVENT_TYPES as readonly string[]).includes(x));
    if (bad !== undefined) return { ok: false, error: `Unknown event type: ${String(bad).slice(0, 40)}.`, field: 'events' };
    // Keep the contract's order, without duplicates.
    out.events = WEBHOOK_EVENT_TYPES.filter((t) => (ev as string[]).includes(t));
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') return { ok: false, error: 'Description must be text.', field: 'description' };
    const d = body.description.trim();
    if (d.length > INTEGRATION_LIMITS.descriptionLength) {
      return { ok: false, error: `Keep the description under ${INTEGRATION_LIMITS.descriptionLength} characters.`, field: 'description' };
    }
    out.description = d;
  } else if (!partial) {
    out.description = '';
  }
  return { ok: true, value: out };
}

/** Integration changes go to the workspace audit log. Never include secrets in `detail`. */
export async function auditIntegration(s: ServerSession, action: string, target: string, detail: Record<string, unknown> = {}) {
  try {
    await getTenantStore().addAudit({ actorEmail: s.email, tenantCode: s.tenantCode, action: `integration.${action}`, target, detail });
  } catch (err) {
    console.error('[integrations audit]', err);
  }
}

export const DELIVERY_STATUSES: readonly DeliveryStatusView[] = ['pending', 'succeeded', 'failed', 'dead', 'skipped'];
