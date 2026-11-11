'use client';

/**
 * Browser calls for Admin › Integrations (contract: src/lib/integrations.ts). The workspace always
 * comes from the session cookie on the server, never from here.
 */
import type {
  ActivityEventType,
  DeliveryAttemptResult,
  DeliveryStatusView,
  DeliveryView,
  WebhookEndpointInput,
  WebhookEndpointView,
} from '@/lib/integrations';
import type { Tone } from '@/components/ui';

export type ApiFailure = {
  ok: false;
  error: string;
  status: number;
  field?: string;
  /** 'forbidden': not an admin. 'unavailable': the integrations API isn't on this server (yet). */
  kind?: 'forbidden' | 'unavailable' | 'network';
};
export type ApiResult<T> = ({ ok: true } & T) | ApiFailure;

const FRIENDLY: Record<number, string> = {
  401: 'Your session has ended. Please sign in again.',
  403: 'Only workspace admins can manage integrations.',
  404: 'We couldn’t find that. It may have been removed.',
  409: 'That changed while you were editing. Refresh and try again.',
  413: 'That request is too large.',
  429: 'Too many requests right now. Please wait a moment and try again.',
};

export const UNAVAILABLE_MESSAGE = 'Integrations aren’t available on this server yet. Please try again in a few minutes.';

async function call<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: init?.signal,
    });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? ((await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string; message?: string; field?: string }) | null) : null;
    if (!res.ok || !data) {
      // A 404 without our JSON error body means the route itself doesn't exist (not deployed yet).
      if (res.status === 404 && !data?.error) return { ok: false, status: 404, error: UNAVAILABLE_MESSAGE, kind: 'unavailable' };
      return {
        ok: false,
        status: res.status,
        error: data?.error || data?.message || FRIENDLY[res.status] || `Something went wrong (${res.status}). Please try again.`,
        field: typeof data?.field === 'string' ? data.field : undefined,
        kind: res.status === 403 ? 'forbidden' : undefined,
      };
    }
    return { ok: true, ...(data as T) };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, status: 0, error: 'Cancelled.' };
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection and try again.', kind: 'network' };
  }
}

const hookUrl = (id: string) => `/api/integrations/webhooks/${encodeURIComponent(id)}`;

export type WebhookPatch = Partial<WebhookEndpointInput> & { active?: boolean; rotateSecret?: boolean };

export const integrationsApi = {
  listWebhooks: (signal?: AbortSignal) => call<{ endpoints: WebhookEndpointView[] }>('/api/integrations/webhooks', { signal }),
  createWebhook: (input: WebhookEndpointInput) =>
    call<{ endpoint: WebhookEndpointView; signingSecret: string }>('/api/integrations/webhooks', { body: input }),
  updateWebhook: (id: string, patch: WebhookPatch) =>
    call<{ endpoint: WebhookEndpointView; signingSecret?: string }>(hookUrl(id), { method: 'PATCH', body: patch }),
  deleteWebhook: (id: string) => call<{ success: true }>(hookUrl(id), { method: 'DELETE' }),
  testWebhook: (id: string) => call<{ result: DeliveryAttemptResult }>(`${hookUrl(id)}/test`, { body: {} }),
  listDeliveries: (q: { status?: DeliveryStatusView | ''; endpointId?: string; limit?: number }, signal?: AbortSignal) => {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.endpointId) p.set('endpointId', q.endpointId);
    p.set('limit', String(q.limit ?? 100));
    return call<{ deliveries: DeliveryView[] }>(`/api/integrations/deliveries?${p.toString()}`, { signal });
  },
  retryDelivery: (id: string) => call<{ delivery: DeliveryView }>(`/api/integrations/deliveries/${encodeURIComponent(id)}/retry`, { body: {} }),
};

export const DELIVERY_STATUS: Record<DeliveryStatusView, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'brand' },
  succeeded: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'warning' },
  dead: { label: 'Gave up', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

export const EVENT_TYPE_LABEL = (t: ActivityEventType | 'test.ping', labels: Record<ActivityEventType, string>) =>
  t === 'test.ping' ? 'Test ping' : labels[t] ?? t;

/** "3 min ago" / "in 5 min" (falls back to the date for anything older than a week). */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = t - now;
  const abs = Math.abs(diff);
  const fmt = (n: number, unit: string) => (diff >= 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`);
  if (abs < 45_000) return diff >= 0 ? 'in a few seconds' : 'just now';
  if (abs < 3_600_000) return fmt(Math.round(abs / 60_000), 'min');
  if (abs < 86_400_000) return fmt(Math.round(abs / 3_600_000), 'h');
  if (abs < 7 * 86_400_000) return fmt(Math.round(abs / 86_400_000), 'd');
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const absoluteTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString();
};

/** Host + path of a URL for compact display. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.host}${path}`;
  } catch {
    return url;
  }
}

/** Client-side check before saving (the server validates again: public host, port 443...). */
export function checkWebhookUrl(raw: string, maxLength: number): string | null {
  const url = raw.trim();
  if (!url) return 'Enter the URL that should receive events.';
  if (url.length > maxLength) return `Keep the URL under ${maxLength} characters.`;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'Enter a full URL, for example https://hooks.zapier.com/hooks/catch/…';
  }
  if (u.protocol !== 'https:') return 'The URL must start with https:// so events are encrypted in transit.';
  if (u.port && u.port !== '443') return 'Use the standard HTTPS port (443).';
  if (u.username || u.password) return 'Don’t put a username or password in the URL.';
  return null;
}
