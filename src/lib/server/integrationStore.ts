/**
 * Server-only storage for client integrations: connected accounts (with encrypted secrets),
 * customer webhook endpoints, the event outbox, deliveries (with a claim/lease for the worker) and
 * external-id links. Same two backends as tenantStore: Supabase (tables in
 * supabase/migrations/20261111000000_integrations.sql + 20261115000000_integrations_v2.sql) or a
 * JSON file (TENANCY_DATA_DIR/integrations.json) for local work. Both backends behave the same.
 *
 * Destinations: a delivery goes to exactly one destination, a connection (destinationKind
 * 'connection', connectionId) or a webhook endpoint ('webhook', endpointId). `destination` is the
 * fan-out key ('webhook:<id>'); (eventId, destination) is unique, so fan-out is idempotent.
 *
 * Secrets: connection secrets are sealed with lib/server/secretBox bound to tenant+provider+member;
 * webhook signing secrets are sealed bound to the endpoint's immutable id. Neither is ever returned
 * to the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import { open, seal } from '@/lib/server/secretBox';
import { backoffAfter, BACKOFF_SECONDS, AUTO_DISABLE_REASON } from '@/lib/server/integrations/policy';
import { INTEGRATION_LIMITS } from '@/lib/integrations';

export type ConnectionStatus = 'connected' | 'needs_attention' | 'disconnected' | 'pending';

export interface Connection {
  id: string;
  tenantCode: string;
  /** e.g. 'hubspot', 'salesforce', 'zoho', 'activecampaign', 'instantly', 'google_workspace', 'resend', 'vicidial', 'dialer', 'webhook_out' */
  provider: string;
  /** '' for workspace-wide connections; a member's email for per-person ones (e.g. a rep's Gmail). */
  memberEmail: string;
  label: string;
  status: ConnectionStatus;
  /** Non-secret settings shown in the UI (domain, region, field mappings, chosen pipeline…). */
  config: Record<string, unknown>;
  /** Sealed secret blob (JSON of keys/tokens). Never sent to the browser. */
  secretSealed: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** OAuth-ready (v2). 'api_key' | 'oauth2' | 'basic' | 'none'. */
  authType?: string;
  tokenExpiresAt?: string | null;
  scopes?: string[];
  /** The CRM account/portal id the connection belongs to (HubSpot portal, Salesforce org…). */
  externalAccountId?: string | null;
  /** Instance URL for providers with per-account hosts (Salesforce, Zoho regions). */
  apiBaseUrl?: string | null;
  /** Single-flight guard for OAuth token refresh. */
  refreshLockedUntil?: string | null;
}

export type EventType =
  | 'contact.created'
  | 'contact.updated'
  | 'call.logged'
  | 'meeting.booked'
  | 'callback.scheduled'
  | 'email.sent'
  | 'email.replied'
  | 'pipeline.stage_changed'
  | 'test.ping'
  | (string & {});

export interface IntegrationEvent {
  id: string;
  tenantCode: string;
  type: EventType;
  /** Unique per tenant: the same event is never processed twice. */
  idempotencyKey: string;
  /** Activity events: the WebhookPayload without its id (the id is this row's id). */
  payload: Record<string, unknown>;
  actorEmail: string;
  /** Payload schema version (WebhookPayload.version). */
  schemaVersion: number;
  /** 'browser' (activity API), 'test' (Test button), later 'server', 'inbound:<provider>'. */
  source: string;
  /** Who the event is about, e.g. 'email:dana@northwind.com' / 'phone:+15551234567' (cross-event lookups). */
  subjectKey: string | null;
  createdAt: string;
}

export type DeliveryStatus = 'pending' | 'succeeded' | 'failed' | 'dead' | 'skipped';
export type DestinationKind = 'connection' | 'webhook';

export interface Delivery {
  id: string;
  eventId: string;
  tenantCode: string;
  destinationKind: DestinationKind;
  /** Fan-out key: 'connection:<id>' or 'webhook:<id>'. */
  destination: string;
  connectionId: string | null;
  endpointId: string | null;
  /** Connection provider, or 'webhook'. */
  provider: string;
  eventType: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  /** When the worker may next try. null = not scheduled (finished, or a one-off test ping). */
  nextAttemptAt: string | null;
  lockedUntil: string | null;
  lockedBy: string | null;
  /** Last failure message (null after a success). */
  lastError: string | null;
  /** Last attempt's user-safe message, success or not. */
  lastMessage: string | null;
  responseCode: number | null;
  durationMs: number | null;
  /** First part of the receiver's last reply (truncated). Never shown to other workspaces. */
  responseExcerpt: string | null;
  /** What the event was, e.g. "Call logged · Dana Reyes (Northwind)". */
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpoint {
  id: string;
  tenantCode: string;
  url: string;
  events: string[];
  description: string;
  /** Signing secret sealed with secretBox, bound to this endpoint's id. */
  secretSealed: string;
  secretHint: string;
  active: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  lastDeliveryAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalLink {
  tenantCode: string;
  provider: string;
  objectType: string;
  localId: string;
  externalId: string;
  updatedAt: string;
}

export interface AttemptOutcome {
  ok: boolean;
  httpStatus: number;
  durationMs: number;
  message: string;
  responseExcerpt?: string;
}

export interface AttemptPolicy {
  /** Only the worker holding the lease may record (null: not claimed, e.g. a test ping). */
  workerId: string | null;
  /** No retry after this attempt (test pings): a failure stays 'failed' with no next attempt. */
  final?: boolean;
  /** Count the result in the endpoint's failure streak (and auto-disable). Default true. */
  countForEndpoint?: boolean;
  schedule?: readonly number[];
  autoDisableAfter?: number;
}

export type NewEvent = Omit<IntegrationEvent, 'id' | 'createdAt' | 'schemaVersion' | 'source' | 'subjectKey'> &
  Partial<Pick<IntegrationEvent, 'schemaVersion' | 'source' | 'subjectKey'>>;

export type NewEndpoint = Pick<WebhookEndpoint, 'id' | 'tenantCode' | 'url' | 'events' | 'description' | 'secretSealed' | 'secretHint' | 'createdBy'> &
  Partial<Pick<WebhookEndpoint, 'active'>>;

export type EndpointPatch = Partial<Pick<WebhookEndpoint, 'url' | 'events' | 'description' | 'secretSealed' | 'secretHint' | 'active' | 'consecutiveFailures' | 'disabledReason'>>;

export interface DeliveryFilter {
  tenantCode: string;
  status?: DeliveryStatus;
  endpointId?: string;
  connectionId?: string;
  limit?: number;
}

export type RetryResult = { ok: true; delivery: Delivery } | { ok: false; reason: 'not_found' | 'not_retryable' };

export class EndpointLimitError extends Error {
  readonly code = 'ENDPOINT_LIMIT';
}
/** Use this, not instanceof: the store instance is shared across bundles, each with its own class. */
export const isEndpointLimitError = (err: unknown): err is EndpointLimitError =>
  !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'ENDPOINT_LIMIT';

export interface IntegrationStore {
  readonly backend: 'supabase' | 'file';
  // connections
  listConnections(filter: { tenantCode: string; provider?: string; memberEmail?: string }): Promise<Connection[]>;
  getConnection(id: string): Promise<Connection | null>;
  upsertConnection(c: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Connection>;
  deleteConnection(id: string): Promise<void>;
  // webhook endpoints (always tenant-scoped)
  listEndpoints(tenantCode: string): Promise<WebhookEndpoint[]>;
  getEndpoint(tenantCode: string, id: string): Promise<WebhookEndpoint | null>;
  /** Throws EndpointLimitError when the workspace already has `maxPerTenant` endpoints. */
  insertEndpoint(e: NewEndpoint, maxPerTenant: number): Promise<WebhookEndpoint>;
  updateEndpoint(tenantCode: string, id: string, patch: EndpointPatch): Promise<WebhookEndpoint | null>;
  deleteEndpoint(tenantCode: string, id: string): Promise<boolean>;
  // events
  /** Raw insert. Returns null if an event with the same (tenant, idempotencyKey) already exists. */
  insertEvent(e: NewEvent): Promise<IntegrationEvent | null>;
  /**
   * Store an event once and fan it out: one pending delivery per ACTIVE endpoint subscribed to its
   * type. A duplicate (same tenant + idempotency key) returns the stored event with duplicate=true
   * and re-runs the (idempotent) fan-out for endpoints that existed when it was first stored, so a
   * crash between insert and fan-out heals on the client's retry.
   */
  recordEvent(e: NewEvent, summary: string): Promise<{ event: IntegrationEvent; duplicate: boolean; deliveries: Delivery[] }>;
  getEvent(id: string): Promise<IntegrationEvent | null>;
  /** Event + one delivery to one endpoint, not scheduled for the worker (the caller sends it now). */
  createDirectDelivery(e: NewEvent, endpoint: WebhookEndpoint, summary: string): Promise<{ event: IntegrationEvent; delivery: Delivery }>;
  // deliveries
  insertDelivery(d: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>): Promise<Delivery>;
  updateDelivery(id: string, patch: Partial<Omit<Delivery, 'id' | 'eventId' | 'tenantCode'>>): Promise<Delivery | null>;
  /** Lease up to `limit` due deliveries (pending/failed, nextAttemptAt <= now, not leased) to `workerId`. */
  claimDueDeliveries(limit: number, workerId: string, leaseSeconds: number): Promise<Delivery[]>;
  /** Record one attempt: status, attempts, backoff, lease release, endpoint failure streak. */
  recordAttempt(id: string, outcome: AttemptOutcome, policy: AttemptPolicy): Promise<Delivery | null>;
  /** Not sent (destination gone or turned off). Releases the lease. */
  markSkipped(id: string, message: string, workerId: string | null): Promise<Delivery | null>;
  getDelivery(tenantCode: string, id: string): Promise<Delivery | null>;
  listDeliveries(filter: DeliveryFilter): Promise<Delivery[]>;
  /** failed / dead / skipped -> pending now. A dead delivery gets one more attempt. */
  retryDelivery(tenantCode: string, id: string): Promise<RetryResult>;
  // external ids
  getExternalId(tenantCode: string, provider: string, objectType: string, localId: string): Promise<string | null>;
  setExternalId(link: Omit<ExternalLink, 'updatedAt'>): Promise<void>;
}

// ------------------------------------------------------------------ secrets helpers

const ctx = (c: Pick<Connection, 'tenantCode' | 'provider' | 'memberEmail'>) => `${c.tenantCode}|${c.provider}|${c.memberEmail}`;

export function sealSecrets(c: Pick<Connection, 'tenantCode' | 'provider' | 'memberEmail'>, secrets: Record<string, string>): string {
  return seal(JSON.stringify(secrets), ctx(c));
}

export function openSecrets(c: Connection): Record<string, string> {
  if (!c.secretSealed) return {};
  return JSON.parse(open(c.secretSealed, ctx(c))) as Record<string, string>;
}

/** What the browser may see about a connection. */
export function publicConnection(c: Connection) {
  const { secretSealed, ...rest } = c;
  return { ...rest, hasSecret: Boolean(secretSealed) };
}

/** Webhook signing secrets are bound to the endpoint's immutable id (not the tenant code, which can be renamed). */
const endpointCtx = (id: string) => `webhook_endpoint|${id}`;
export const sealEndpointSecret = (endpointId: string, secret: string) => seal(secret, endpointCtx(endpointId));
export const openEndpointSecret = (e: Pick<WebhookEndpoint, 'id' | 'secretSealed'>) => open(e.secretSealed, endpointCtx(e.id));

// ------------------------------------------------------------------ shared rules (both backends)

export const webhookDestination = (endpointId: string) => `webhook:${endpointId}`;

const EXCERPT_MAX = 1000;
const isDue = (d: Delivery, now: string) =>
  (d.status === 'pending' || d.status === 'failed') && !!d.nextAttemptAt && d.nextAttemptAt <= now && (!d.lockedUntil || d.lockedUntil < now);

/** Next delivery state after one attempt. Pure; exported for tests. */
export function nextDeliveryState(d: Pick<Delivery, 'attempts' | 'maxAttempts'>, o: AttemptOutcome, p: Pick<AttemptPolicy, 'final' | 'schedule'>, now = Date.now()) {
  const attempts = d.attempts + 1;
  let status: DeliveryStatus;
  let nextAttemptAt: string | null = null;
  if (o.ok) status = 'succeeded';
  else if (p.final) status = 'failed';
  else if (attempts >= d.maxAttempts) status = 'dead';
  else {
    status = 'failed';
    nextAttemptAt = new Date(now + backoffAfter(attempts, p.schedule ?? BACKOFF_SECONDS) * 1000).toISOString();
  }
  return {
    attempts,
    status,
    nextAttemptAt,
    lockedUntil: null,
    lockedBy: null,
    lastMessage: o.message.slice(0, 500),
    lastError: o.ok ? null : o.message.slice(0, 500),
    responseCode: o.httpStatus || null,
    durationMs: Math.max(0, Math.round(o.durationMs)),
    responseExcerpt: o.responseExcerpt ? o.responseExcerpt.slice(0, EXCERPT_MAX) : null,
  } satisfies Partial<Delivery>;
}

/** Endpoint after one counted attempt. Pure; exported for tests. */
export function nextEndpointState(e: Pick<WebhookEndpoint, 'consecutiveFailures' | 'active' | 'disabledReason'>, ok: boolean, disableAfter: number) {
  const consecutiveFailures = ok ? 0 : e.consecutiveFailures + 1;
  const trip = !ok && consecutiveFailures >= disableAfter;
  return {
    consecutiveFailures,
    active: trip ? false : e.active,
    disabledReason: trip && e.active ? AUTO_DISABLE_REASON(disableAfter) : e.disabledReason,
    lastDeliveryAt: nowIso(),
  } satisfies Partial<WebhookEndpoint>;
}

const subscribes = (e: WebhookEndpoint, type: string) => e.active && e.events.includes(type);

function newWebhookDelivery(event: IntegrationEvent, endpoint: WebhookEndpoint, summary: string, scheduled: boolean): Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    eventId: event.id,
    tenantCode: event.tenantCode,
    destinationKind: 'webhook',
    destination: webhookDestination(endpoint.id),
    connectionId: null,
    endpointId: endpoint.id,
    provider: 'webhook',
    eventType: event.type,
    status: 'pending',
    attempts: 0,
    maxAttempts: INTEGRATION_LIMITS.maxAttempts,
    nextAttemptAt: scheduled ? nowIso() : null,
    lockedUntil: null,
    lockedBy: null,
    lastError: null,
    lastMessage: null,
    responseCode: null,
    durationMs: null,
    responseExcerpt: null,
    summary: summary.slice(0, 300),
  };
}

const eventDefaults = (e: NewEvent) => ({ schemaVersion: e.schemaVersion ?? 1, source: e.source ?? 'browser', subjectKey: e.subjectKey ?? null });

// ------------------------------------------------------------------ file backend

interface FileShape {
  connections: Connection[];
  endpoints: WebhookEndpoint[];
  events: IntegrationEvent[];
  deliveries: Delivery[];
  links: ExternalLink[];
}

/** Rows written before v2 lack the new fields. */
function normDelivery(x: Partial<Delivery> & { id: string }): Delivery {
  const kind: DestinationKind = x.destinationKind ?? (x.endpointId ? 'webhook' : 'connection');
  return {
    eventId: '',
    tenantCode: '',
    connectionId: null,
    endpointId: null,
    provider: kind === 'webhook' ? 'webhook' : '',
    eventType: '',
    status: 'pending',
    attempts: 0,
    maxAttempts: INTEGRATION_LIMITS.maxAttempts,
    nextAttemptAt: null,
    lockedUntil: null,
    lockedBy: null,
    lastError: null,
    lastMessage: null,
    responseCode: null,
    durationMs: null,
    responseExcerpt: null,
    summary: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...x,
    destinationKind: kind,
    destination: x.destination ?? (kind === 'webhook' ? `webhook:${x.endpointId}` : `connection:${x.connectionId}`),
  } as Delivery;
}

/** Rows written before v2 lack schemaVersion / source / subjectKey. */
const normEvent = (e: IntegrationEvent): IntegrationEvent => ({ ...e, schemaVersion: e.schemaVersion ?? 1, source: e.source ?? 'browser', subjectKey: e.subjectKey ?? null });

class FileIntegrationStore implements IntegrationStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'integrations.json');
  }
  private read(): FileShape {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      return {
        connections: p.connections ?? [],
        endpoints: p.endpoints ?? [],
        events: (p.events ?? []).map(normEvent),
        deliveries: (p.deliveries ?? []).map(normDelivery),
        links: p.links ?? [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { connections: [], endpoints: [], events: [], deliveries: [], links: [] };
      throw err;
    }
  }
  private write(d: FileShape) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: FileShape) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  /** Reads wait for queued writes, so a read right after a write sees it. */
  private async snapshot(): Promise<FileShape> {
    await this.queue;
    return this.read();
  }

  // -------------------------------------------------------------- connections
  async listConnections(f: { tenantCode: string; provider?: string; memberEmail?: string }) {
    return (await this.snapshot()).connections.filter(
      (c) => c.tenantCode === f.tenantCode && (!f.provider || c.provider === f.provider) && (f.memberEmail === undefined || c.memberEmail === f.memberEmail),
    );
  }
  async getConnection(id: string) {
    return (await this.snapshot()).connections.find((c) => c.id === id) ?? null;
  }
  upsertConnection(c: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    return this.mutate((d) => {
      const i = d.connections.findIndex(
        (x) => (c.id && x.id === c.id) || (x.tenantCode === c.tenantCode && x.provider === c.provider && x.memberEmail === c.memberEmail),
      );
      const now = nowIso();
      if (i >= 0) {
        d.connections[i] = { ...d.connections[i], ...c, id: d.connections[i].id, createdAt: d.connections[i].createdAt, updatedAt: now };
        return d.connections[i];
      }
      const created: Connection = { ...c, id: c.id ?? newId(), createdAt: now, updatedAt: now };
      d.connections.push(created);
      return created;
    });
  }
  async deleteConnection(id: string) {
    await this.mutate((d) => {
      d.connections = d.connections.filter((c) => c.id !== id);
      d.deliveries = d.deliveries.filter((x) => x.connectionId !== id);
    });
  }

  // -------------------------------------------------------------- endpoints
  async listEndpoints(tenantCode: string) {
    return (await this.snapshot()).endpoints.filter((e) => e.tenantCode === tenantCode).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getEndpoint(tenantCode: string, id: string) {
    return (await this.snapshot()).endpoints.find((e) => e.tenantCode === tenantCode && e.id === id) ?? null;
  }
  insertEndpoint(e: NewEndpoint, maxPerTenant: number) {
    return this.mutate((d) => {
      if (d.endpoints.filter((x) => x.tenantCode === e.tenantCode).length >= maxPerTenant) {
        throw new EndpointLimitError(`A workspace can have up to ${maxPerTenant} webhook endpoints.`);
      }
      const now = nowIso();
      const created: WebhookEndpoint = {
        ...e,
        active: e.active ?? true,
        consecutiveFailures: 0,
        disabledReason: null,
        lastDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      d.endpoints.push(created);
      return created;
    });
  }
  updateEndpoint(tenantCode: string, id: string, patch: EndpointPatch) {
    return this.mutate((d) => {
      const i = d.endpoints.findIndex((e) => e.tenantCode === tenantCode && e.id === id);
      if (i < 0) return null;
      d.endpoints[i] = { ...d.endpoints[i], ...stripUndefined(patch), id, tenantCode, updatedAt: nowIso() };
      return d.endpoints[i];
    });
  }
  deleteEndpoint(tenantCode: string, id: string) {
    return this.mutate((d) => {
      const before = d.endpoints.length;
      d.endpoints = d.endpoints.filter((e) => !(e.tenantCode === tenantCode && e.id === id));
      if (d.endpoints.length === before) return false;
      d.deliveries = d.deliveries.filter((x) => x.endpointId !== id); // matches ON DELETE CASCADE
      return true;
    });
  }

  // -------------------------------------------------------------- events
  insertEvent(e: NewEvent) {
    return this.mutate((d) => this.insertEventIn(d, e));
  }
  private insertEventIn(d: FileShape, e: NewEvent): IntegrationEvent | null {
    if (d.events.some((x) => x.tenantCode === e.tenantCode && x.idempotencyKey === e.idempotencyKey)) return null;
    const ev: IntegrationEvent = { ...e, ...eventDefaults(e), id: newId(), createdAt: nowIso() };
    d.events.push(ev);
    if (d.events.length > 20000) d.events.splice(0, d.events.length - 20000);
    return ev;
  }
  private insertDeliveryIn(d: FileShape, x: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>): Delivery | null {
    if (d.deliveries.some((y) => y.eventId === x.eventId && y.destination === x.destination)) return null;
    const now = nowIso();
    const del: Delivery = { ...x, id: newId(), createdAt: now, updatedAt: now };
    d.deliveries.push(del);
    if (d.deliveries.length > 50000) d.deliveries.splice(0, d.deliveries.length - 50000);
    return del;
  }
  recordEvent(e: NewEvent, summary: string) {
    return this.mutate((d) => {
      let event = this.insertEventIn(d, e);
      const duplicate = !event;
      if (!event) event = d.events.find((x) => x.tenantCode === e.tenantCode && x.idempotencyKey === e.idempotencyKey)!;
      const deliveries: Delivery[] = [];
      for (const ep of d.endpoints) {
        if (ep.tenantCode !== event.tenantCode || !subscribes(ep, event.type) || ep.createdAt > event.createdAt) continue;
        const del = this.insertDeliveryIn(d, newWebhookDelivery(event, ep, summary, true));
        if (del) deliveries.push(del);
      }
      return { event, duplicate, deliveries };
    });
  }
  async getEvent(id: string) {
    return (await this.snapshot()).events.find((e) => e.id === id) ?? null;
  }
  createDirectDelivery(e: NewEvent, endpoint: WebhookEndpoint, summary: string) {
    return this.mutate((d) => {
      const event = this.insertEventIn(d, e);
      if (!event) throw new Error('[integrationStore] duplicate direct event');
      const delivery = this.insertDeliveryIn(d, newWebhookDelivery(event, endpoint, summary, false))!;
      return { event, delivery };
    });
  }

  // -------------------------------------------------------------- deliveries
  insertDelivery(x: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.mutate((d) => {
      const del = this.insertDeliveryIn(d, x);
      if (!del) return d.deliveries.find((y) => y.eventId === x.eventId && y.destination === x.destination)!;
      return del;
    });
  }
  updateDelivery(id: string, patch: Partial<Delivery>) {
    return this.mutate((d) => {
      const i = d.deliveries.findIndex((x) => x.id === id);
      if (i < 0) return null;
      d.deliveries[i] = { ...d.deliveries[i], ...stripUndefined(patch), id, updatedAt: nowIso() };
      return d.deliveries[i];
    });
  }
  claimDueDeliveries(limit: number, workerId: string, leaseSeconds: number) {
    return this.mutate((d) => {
      const now = nowIso();
      const until = new Date(Date.now() + leaseSeconds * 1000).toISOString();
      const due = d.deliveries
        .filter((x) => isDue(x, now))
        .sort((a, b) => (a.nextAttemptAt! < b.nextAttemptAt! ? -1 : a.nextAttemptAt! > b.nextAttemptAt! ? 1 : 0))
        .slice(0, Math.max(1, Math.min(limit, 100)));
      for (const x of due) {
        x.lockedUntil = until;
        x.lockedBy = workerId;
      }
      return due.map((x) => ({ ...x }));
    });
  }
  recordAttempt(id: string, o: AttemptOutcome, p: AttemptPolicy) {
    return this.mutate((d) => {
      const i = d.deliveries.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const cur = d.deliveries[i];
      if (p.workerId !== null && cur.lockedBy !== p.workerId) return null; // lease lost to another worker
      d.deliveries[i] = { ...cur, ...nextDeliveryState(cur, o, p), updatedAt: nowIso() };
      if (cur.endpointId) {
        const j = d.endpoints.findIndex((e) => e.id === cur.endpointId);
        if (j >= 0) {
          const ep = d.endpoints[j];
          const next =
            p.countForEndpoint === false
              ? { lastDeliveryAt: nowIso() }
              : nextEndpointState(ep, o.ok, p.autoDisableAfter ?? INTEGRATION_LIMITS.autoDisableAfter);
          d.endpoints[j] = { ...ep, ...next, updatedAt: nowIso() };
        }
      }
      return d.deliveries[i];
    });
  }
  markSkipped(id: string, message: string, workerId: string | null) {
    return this.mutate((d) => {
      const i = d.deliveries.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const cur = d.deliveries[i];
      if (workerId !== null && cur.lockedBy !== workerId) return null;
      d.deliveries[i] = { ...cur, status: 'skipped', nextAttemptAt: null, lockedUntil: null, lockedBy: null, lastMessage: message, lastError: message, updatedAt: nowIso() };
      return d.deliveries[i];
    });
  }
  async getDelivery(tenantCode: string, id: string) {
    return (await this.snapshot()).deliveries.find((x) => x.tenantCode === tenantCode && x.id === id) ?? null;
  }
  async listDeliveries(f: DeliveryFilter) {
    const limit = Math.max(1, Math.min(f.limit ?? 100, 500));
    return (await this.snapshot()).deliveries
      .filter(
        (x) =>
          x.tenantCode === f.tenantCode &&
          (!f.status || x.status === f.status) &&
          (!f.endpointId || x.endpointId === f.endpointId) &&
          (!f.connectionId || x.connectionId === f.connectionId),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, limit);
  }
  retryDelivery(tenantCode: string, id: string) {
    return this.mutate((d): RetryResult => {
      const i = d.deliveries.findIndex((x) => x.tenantCode === tenantCode && x.id === id);
      if (i < 0) return { ok: false, reason: 'not_found' };
      const cur = d.deliveries[i];
      if (!retryable(cur)) return { ok: false, reason: 'not_retryable' };
      d.deliveries[i] = { ...cur, ...retryPatch(cur), updatedAt: nowIso() };
      return { ok: true, delivery: d.deliveries[i] };
    });
  }

  // -------------------------------------------------------------- external ids
  async getExternalId(tenantCode: string, provider: string, objectType: string, localId: string) {
    return (
      (await this.snapshot()).links.find((l) => l.tenantCode === tenantCode && l.provider === provider && l.objectType === objectType && l.localId === localId)
        ?.externalId ?? null
    );
  }
  async setExternalId(link: Omit<ExternalLink, 'updatedAt'>) {
    await this.mutate((d) => {
      d.links = d.links.filter(
        (l) => !(l.tenantCode === link.tenantCode && l.provider === link.provider && l.objectType === link.objectType && l.localId === link.localId),
      );
      d.links.push({ ...link, updatedAt: nowIso() });
    });
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** A failed delivery can be pulled forward; a finished one (dead / skipped / one-off failed) re-opened. */
const retryable = (d: Delivery) => d.status === 'failed' || d.status === 'dead' || d.status === 'skipped';

function retryPatch(d: Delivery): Partial<Delivery> {
  return {
    status: 'pending',
    nextAttemptAt: nowIso(),
    lockedUntil: null,
    lockedBy: null,
    // Out of attempts (dead, or a test ping): allow exactly one more. Otherwise keep the remaining budget.
    maxAttempts: Math.max(d.maxAttempts, d.attempts + 1),
  };
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));
const connFromRow = (r: Row): Connection => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  provider: String(r.provider),
  memberEmail: String(r.member_email ?? ''),
  label: String(r.label ?? ''),
  status: (r.status as ConnectionStatus) ?? 'pending',
  config: (r.config as Record<string, unknown>) ?? {},
  secretSealed: (r.secret_sealed as string) ?? null,
  lastCheckedAt: (r.last_checked_at as string) ?? null,
  lastError: (r.last_error as string) ?? null,
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  authType: String(r.auth_type ?? 'api_key'),
  tokenExpiresAt: str(r.token_expires_at),
  scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
  externalAccountId: str(r.external_account_id),
  apiBaseUrl: str(r.api_base_url),
  refreshLockedUntil: str(r.refresh_locked_until),
});
const evFromRow = (r: Row): IntegrationEvent => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  type: String(r.type),
  idempotencyKey: String(r.idempotency_key),
  payload: (r.payload as Record<string, unknown>) ?? {},
  actorEmail: String(r.actor_email ?? ''),
  schemaVersion: Number(r.schema_version ?? 1),
  source: String(r.source ?? 'browser'),
  subjectKey: str(r.subject_key),
  createdAt: String(r.created_at),
});
const num = (v: unknown) => (v == null ? null : Number(v));
const delFromRow = (r: Row): Delivery => ({
  id: String(r.id),
  eventId: String(r.event_id),
  tenantCode: String(r.tenant_code),
  destinationKind: (r.destination_kind as DestinationKind) ?? 'connection',
  destination: String(r.destination ?? ''),
  connectionId: str(r.connection_id),
  endpointId: str(r.endpoint_id),
  provider: String(r.provider ?? ''),
  eventType: String(r.event_type ?? ''),
  status: r.status as DeliveryStatus,
  attempts: Number(r.attempts ?? 0),
  maxAttempts: Number(r.max_attempts ?? INTEGRATION_LIMITS.maxAttempts),
  nextAttemptAt: str(r.next_attempt_at),
  lockedUntil: str(r.locked_until),
  lockedBy: str(r.locked_by),
  lastError: str(r.last_error),
  lastMessage: str(r.last_message),
  responseCode: num(r.response_code),
  durationMs: num(r.duration_ms),
  responseExcerpt: str(r.response_excerpt),
  summary: str(r.summary),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const epFromRow = (r: Row): WebhookEndpoint => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  url: String(r.url),
  events: Array.isArray(r.events) ? (r.events as string[]) : [],
  description: String(r.description ?? ''),
  secretSealed: String(r.secret_sealed ?? ''),
  secretHint: String(r.secret_hint ?? ''),
  active: Boolean(r.active),
  consecutiveFailures: Number(r.consecutive_failures ?? 0),
  disabledReason: str(r.disabled_reason),
  lastDeliveryAt: str(r.last_delivery_at),
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const snake: Record<string, string> = {
  tenantCode: 'tenant_code', memberEmail: 'member_email', secretSealed: 'secret_sealed', lastCheckedAt: 'last_checked_at', lastError: 'last_error',
  createdBy: 'created_by', eventId: 'event_id', connectionId: 'connection_id', nextAttemptAt: 'next_attempt_at', responseCode: 'response_code',
  idempotencyKey: 'idempotency_key', actorEmail: 'actor_email',
  authType: 'auth_type', tokenExpiresAt: 'token_expires_at', externalAccountId: 'external_account_id', apiBaseUrl: 'api_base_url',
  refreshLockedUntil: 'refresh_locked_until', schemaVersion: 'schema_version', subjectKey: 'subject_key',
  destinationKind: 'destination_kind', endpointId: 'endpoint_id', eventType: 'event_type', maxAttempts: 'max_attempts',
  lockedUntil: 'locked_until', lockedBy: 'locked_by', durationMs: 'duration_ms', responseExcerpt: 'response_excerpt', lastMessage: 'last_message',
  secretHint: 'secret_hint', consecutiveFailures: 'consecutive_failures', disabledReason: 'disabled_reason', lastDeliveryAt: 'last_delivery_at',
};
const toRow = (o: Record<string, unknown>): Row => {
  const r: Row = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== 'createdAt' && k !== 'updatedAt') r[snake[k] ?? k] = v;
  return r;
};

class SupabaseIntegrationStore implements IntegrationStore {
  readonly backend = 'supabase' as const;
  private db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) throw new Error(`[integrationStore] ${res.error.message}`);
    return res.data;
  }

  // -------------------------------------------------------------- connections
  async listConnections(f: { tenantCode: string; provider?: string; memberEmail?: string }) {
    let q = this.db.from('tenant_connections').select('*').eq('tenant_code', f.tenantCode);
    if (f.provider) q = q.eq('provider', f.provider);
    if (f.memberEmail !== undefined) q = q.eq('member_email', f.memberEmail);
    return (this.check(await q.order('created_at')) as Row[]).map(connFromRow);
  }
  async getConnection(id: string) {
    const r = this.check(await this.db.from('tenant_connections').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? connFromRow(r) : null;
  }
  async upsertConnection(c: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    const row = { ...toRow(c as Record<string, unknown>), updated_at: nowIso() };
    const r = this.check(
      await this.db.from('tenant_connections').upsert(row, { onConflict: 'tenant_code,provider,member_email' }).select().single(),
    ) as Row;
    return connFromRow(r);
  }
  async deleteConnection(id: string) {
    this.check(await this.db.from('tenant_connections').delete().eq('id', id));
  }

  // -------------------------------------------------------------- endpoints
  async listEndpoints(tenantCode: string) {
    return (this.check(await this.db.from('webhook_endpoints').select('*').eq('tenant_code', tenantCode).order('created_at')) as Row[]).map(epFromRow);
  }
  async getEndpoint(tenantCode: string, id: string) {
    const r = this.check(await this.db.from('webhook_endpoints').select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
    return r ? epFromRow(r) : null;
  }
  async insertEndpoint(e: NewEndpoint, maxPerTenant: number) {
    const res = await this.db.from('webhook_endpoints').select('id', { count: 'exact', head: true }).eq('tenant_code', e.tenantCode);
    this.check(res);
    if ((res.count ?? 0) >= maxPerTenant) throw new EndpointLimitError(`A workspace can have up to ${maxPerTenant} webhook endpoints.`);
    const row = { ...toRow({ ...e, active: e.active ?? true } as Record<string, unknown>) };
    return epFromRow(this.check(await this.db.from('webhook_endpoints').insert(row).select().single()) as Row);
  }
  async updateEndpoint(tenantCode: string, id: string, patch: EndpointPatch) {
    const r = this.check(
      await this.db
        .from('webhook_endpoints')
        .update({ ...toRow(patch as Record<string, unknown>), updated_at: nowIso() })
        .eq('tenant_code', tenantCode)
        .eq('id', id)
        .select()
        .maybeSingle(),
    ) as Row | null;
    return r ? epFromRow(r) : null;
  }
  async deleteEndpoint(tenantCode: string, id: string) {
    const rows = this.check(await this.db.from('webhook_endpoints').delete().eq('tenant_code', tenantCode).eq('id', id).select('id')) as Row[];
    return rows.length > 0;
  }

  // -------------------------------------------------------------- events
  async insertEvent(e: NewEvent) {
    const res = await this.db.from('integration_events').insert(toRow({ ...e, ...eventDefaults(e) } as Record<string, unknown>)).select().single();
    if (res.error?.code === '23505') return null; // duplicate idempotency key
    return evFromRow(this.check(res) as Row);
  }
  private async fanOut(event: IntegrationEvent, summary: string): Promise<Delivery[]> {
    const endpoints = (
      this.check(
        await this.db
          .from('webhook_endpoints')
          .select('*')
          .eq('tenant_code', event.tenantCode)
          .eq('active', true)
          .contains('events', [event.type])
          .lte('created_at', event.createdAt),
      ) as Row[]
    ).map(epFromRow);
    if (!endpoints.length) return [];
    const rows = endpoints.map((ep) => toRow(newWebhookDelivery(event, ep, summary, true) as unknown as Record<string, unknown>));
    const inserted = this.check(
      await this.db.from('integration_deliveries').upsert(rows, { onConflict: 'event_id,destination', ignoreDuplicates: true }).select(),
    ) as Row[] | null;
    return (inserted ?? []).map(delFromRow);
  }
  async recordEvent(e: NewEvent, summary: string) {
    let event = await this.insertEvent(e);
    const duplicate = !event;
    if (!event) {
      const r = this.check(
        await this.db.from('integration_events').select('*').eq('tenant_code', e.tenantCode).eq('idempotency_key', e.idempotencyKey).maybeSingle(),
      ) as Row | null;
      if (!r) throw new Error('[integrationStore] duplicate event vanished');
      event = evFromRow(r);
    }
    const deliveries = await this.fanOut(event, summary);
    return { event, duplicate, deliveries };
  }
  async getEvent(id: string) {
    const r = this.check(await this.db.from('integration_events').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? evFromRow(r) : null;
  }
  async createDirectDelivery(e: NewEvent, endpoint: WebhookEndpoint, summary: string) {
    const event = await this.insertEvent(e);
    if (!event) throw new Error('[integrationStore] duplicate direct event');
    const delivery = await this.insertDelivery(newWebhookDelivery(event, endpoint, summary, false));
    return { event, delivery };
  }

  // -------------------------------------------------------------- deliveries
  async insertDelivery(d: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>) {
    return delFromRow(this.check(await this.db.from('integration_deliveries').insert(toRow(d as unknown as Record<string, unknown>)).select().single()) as Row);
  }
  async updateDelivery(id: string, patch: Partial<Delivery>) {
    const r = this.check(
      await this.db.from('integration_deliveries').update({ ...toRow(patch as Record<string, unknown>), updated_at: nowIso() }).eq('id', id).select().maybeSingle(),
    ) as Row | null;
    return r ? delFromRow(r) : null;
  }
  async claimDueDeliveries(limit: number, workerId: string, leaseSeconds: number) {
    const rows = this.check(
      await this.db.rpc('claim_due_deliveries', { p_limit: limit, p_worker: workerId, p_lease_seconds: leaseSeconds }),
    ) as Row[] | null;
    return (rows ?? []).map(delFromRow);
  }
  async recordAttempt(id: string, o: AttemptOutcome, p: AttemptPolicy) {
    const cur = this.check(await this.db.from('integration_deliveries').select('*').eq('id', id).maybeSingle()) as Row | null;
    if (!cur) return null;
    const d = delFromRow(cur);
    if (p.workerId !== null && d.lockedBy !== p.workerId) return null;
    let q = this.db
      .from('integration_deliveries')
      .update({ ...toRow(nextDeliveryState(d, o, p) as Record<string, unknown>), updated_at: nowIso() })
      .eq('id', id)
      .eq('attempts', d.attempts); // optimistic: nobody recorded an attempt in between
    if (p.workerId !== null) q = q.eq('locked_by', p.workerId);
    const r = this.check(await q.select().maybeSingle()) as Row | null;
    if (!r) return null;
    if (d.endpointId) {
      if (p.countForEndpoint === false) {
        this.check(await this.db.from('webhook_endpoints').update({ last_delivery_at: nowIso(), updated_at: nowIso() }).eq('id', d.endpointId));
      } else {
        const n = p.autoDisableAfter ?? INTEGRATION_LIMITS.autoDisableAfter;
        this.check(
          await this.db.rpc('record_webhook_endpoint_result', { p_endpoint_id: d.endpointId, p_ok: o.ok, p_disable_after: n, p_reason: AUTO_DISABLE_REASON(n) }),
        );
      }
    }
    return delFromRow(r);
  }
  async markSkipped(id: string, message: string, workerId: string | null) {
    let q = this.db
      .from('integration_deliveries')
      .update({ status: 'skipped', next_attempt_at: null, locked_until: null, locked_by: null, last_message: message, last_error: message, updated_at: nowIso() })
      .eq('id', id);
    if (workerId !== null) q = q.eq('locked_by', workerId);
    const r = this.check(await q.select().maybeSingle()) as Row | null;
    return r ? delFromRow(r) : null;
  }
  async getDelivery(tenantCode: string, id: string) {
    const r = this.check(await this.db.from('integration_deliveries').select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
    return r ? delFromRow(r) : null;
  }
  async listDeliveries(f: DeliveryFilter) {
    let q = this.db.from('integration_deliveries').select('*').eq('tenant_code', f.tenantCode);
    if (f.status) q = q.eq('status', f.status);
    if (f.endpointId) q = q.eq('endpoint_id', f.endpointId);
    if (f.connectionId) q = q.eq('connection_id', f.connectionId);
    const limit = Math.max(1, Math.min(f.limit ?? 100, 500));
    return (this.check(await q.order('created_at', { ascending: false }).limit(limit)) as Row[]).map(delFromRow);
  }
  async retryDelivery(tenantCode: string, id: string): Promise<RetryResult> {
    const cur = await this.getDelivery(tenantCode, id);
    if (!cur) return { ok: false, reason: 'not_found' };
    if (!retryable(cur)) return { ok: false, reason: 'not_retryable' };
    const r = this.check(
      await this.db
        .from('integration_deliveries')
        .update({ ...toRow(retryPatch(cur) as Record<string, unknown>), updated_at: nowIso() })
        .eq('tenant_code', tenantCode)
        .eq('id', id)
        .eq('status', cur.status)
        .select()
        .maybeSingle(),
    ) as Row | null;
    return r ? { ok: true, delivery: delFromRow(r) } : { ok: false, reason: 'not_retryable' };
  }

  // -------------------------------------------------------------- external ids
  async getExternalId(tenantCode: string, provider: string, objectType: string, localId: string) {
    const r = this.check(
      await this.db
        .from('integration_external_ids')
        .select('external_id')
        .match({ tenant_code: tenantCode, provider, object_type: objectType, local_id: localId })
        .maybeSingle(),
    ) as Row | null;
    return r ? String(r.external_id) : null;
  }
  async setExternalId(link: Omit<ExternalLink, 'updatedAt'>) {
    this.check(
      await this.db.from('integration_external_ids').upsert(
        { tenant_code: link.tenantCode, provider: link.provider, object_type: link.objectType, local_id: link.localId, external_id: link.externalId, updated_at: nowIso() },
        { onConflict: 'tenant_code,provider,object_type,local_id' },
      ),
    );
  }
}

// One store per process, shared across bundles (instrumentation and route handlers can load this
// module separately), so the file backend's write queue and the worker see the same instance.
const g = globalThis as typeof globalThis & { __appyIntegrationStore?: IntegrationStore };
export function getIntegrationStore(): IntegrationStore {
  if (g.__appyIntegrationStore) return g.__appyIntegrationStore;
  let store: IntegrationStore;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseIntegrationStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[integrationStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileIntegrationStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  g.__appyIntegrationStore = store;
  return store;
}

/** Tests only: a file-backed store in `dir`, independent of the process-wide one. */
export function createFileIntegrationStore(dir: string): IntegrationStore {
  return new FileIntegrationStore(dir);
}
