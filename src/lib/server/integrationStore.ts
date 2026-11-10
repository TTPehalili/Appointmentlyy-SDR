/**
 * Server-only storage for client integrations: connected accounts (with encrypted secrets), the
 * event outbox, delivery attempts and external-id links. Same two backends as tenantStore:
 * Supabase (tables in supabase/migrations/20261111000000_integrations.sql) or a JSON file
 * (TENANCY_DATA_DIR/integrations.json) for local work.
 *
 * Secrets: `secret` values are sealed with lib/server/secretBox (bound to tenant+provider+member)
 * before they are stored and are never returned to the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import { open, seal } from '@/lib/server/secretBox';

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
  | (string & {});

export interface IntegrationEvent {
  id: string;
  tenantCode: string;
  type: EventType;
  /** Unique per tenant: the same event is never processed twice. */
  idempotencyKey: string;
  payload: Record<string, unknown>;
  actorEmail: string;
  createdAt: string;
}

export type DeliveryStatus = 'pending' | 'succeeded' | 'failed' | 'dead' | 'skipped';

export interface Delivery {
  id: string;
  eventId: string;
  tenantCode: string;
  connectionId: string;
  provider: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  responseCode: number | null;
  /** Short human-readable result, e.g. "Created HubSpot contact 123". */
  summary: string | null;
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

export interface IntegrationStore {
  readonly backend: 'supabase' | 'file';
  listConnections(filter: { tenantCode: string; provider?: string; memberEmail?: string }): Promise<Connection[]>;
  getConnection(id: string): Promise<Connection | null>;
  upsertConnection(c: Omit<Connection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Connection>;
  deleteConnection(id: string): Promise<void>;
  /** Returns null if an event with the same (tenant, idempotencyKey) already exists. */
  insertEvent(e: Omit<IntegrationEvent, 'id' | 'createdAt'>): Promise<IntegrationEvent | null>;
  getEvent(id: string): Promise<IntegrationEvent | null>;
  insertDelivery(d: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>): Promise<Delivery>;
  updateDelivery(id: string, patch: Partial<Omit<Delivery, 'id' | 'eventId' | 'tenantCode'>>): Promise<Delivery | null>;
  /** Deliveries due now (pending/failed with nextAttemptAt <= now), oldest first. */
  dueDeliveries(limit: number): Promise<Delivery[]>;
  listDeliveries(filter: { tenantCode: string; connectionId?: string; limit?: number }): Promise<Delivery[]>;
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

// ------------------------------------------------------------------ file backend

interface FileShape {
  connections: Connection[];
  events: IntegrationEvent[];
  deliveries: Delivery[];
  links: ExternalLink[];
}

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
      return { connections: p.connections ?? [], events: p.events ?? [], deliveries: p.deliveries ?? [], links: p.links ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { connections: [], events: [], deliveries: [], links: [] };
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
  async listConnections(f: { tenantCode: string; provider?: string; memberEmail?: string }) {
    return this.read().connections.filter(
      (c) => c.tenantCode === f.tenantCode && (!f.provider || c.provider === f.provider) && (f.memberEmail === undefined || c.memberEmail === f.memberEmail),
    );
  }
  async getConnection(id: string) {
    return this.read().connections.find((c) => c.id === id) ?? null;
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
    });
  }
  insertEvent(e: Omit<IntegrationEvent, 'id' | 'createdAt'>) {
    return this.mutate((d) => {
      if (d.events.some((x) => x.tenantCode === e.tenantCode && x.idempotencyKey === e.idempotencyKey)) return null;
      const ev: IntegrationEvent = { ...e, id: newId(), createdAt: nowIso() };
      d.events.push(ev);
      if (d.events.length > 20000) d.events.splice(0, d.events.length - 20000);
      return ev;
    });
  }
  async getEvent(id: string) {
    return this.read().events.find((e) => e.id === id) ?? null;
  }
  insertDelivery(x: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.mutate((d) => {
      const now = nowIso();
      const del: Delivery = { ...x, id: newId(), createdAt: now, updatedAt: now };
      d.deliveries.push(del);
      if (d.deliveries.length > 50000) d.deliveries.splice(0, d.deliveries.length - 50000);
      return del;
    });
  }
  updateDelivery(id: string, patch: Partial<Delivery>) {
    return this.mutate((d) => {
      const i = d.deliveries.findIndex((x) => x.id === id);
      if (i < 0) return null;
      d.deliveries[i] = { ...d.deliveries[i], ...patch, id, updatedAt: nowIso() };
      return d.deliveries[i];
    });
  }
  async dueDeliveries(limit: number) {
    const now = nowIso();
    return this.read()
      .deliveries.filter((x) => (x.status === 'pending' || x.status === 'failed') && (!x.nextAttemptAt || x.nextAttemptAt <= now))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }
  async listDeliveries(f: { tenantCode: string; connectionId?: string; limit?: number }) {
    return this.read()
      .deliveries.filter((x) => x.tenantCode === f.tenantCode && (!f.connectionId || x.connectionId === f.connectionId))
      .slice(-(f.limit ?? 100))
      .reverse();
  }
  async getExternalId(tenantCode: string, provider: string, objectType: string, localId: string) {
    return (
      this.read().links.find((l) => l.tenantCode === tenantCode && l.provider === provider && l.objectType === objectType && l.localId === localId)
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

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
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
});
const evFromRow = (r: Row): IntegrationEvent => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  type: String(r.type),
  idempotencyKey: String(r.idempotency_key),
  payload: (r.payload as Record<string, unknown>) ?? {},
  actorEmail: String(r.actor_email ?? ''),
  createdAt: String(r.created_at),
});
const delFromRow = (r: Row): Delivery => ({
  id: String(r.id),
  eventId: String(r.event_id),
  tenantCode: String(r.tenant_code),
  connectionId: String(r.connection_id),
  provider: String(r.provider),
  status: r.status as DeliveryStatus,
  attempts: Number(r.attempts ?? 0),
  nextAttemptAt: (r.next_attempt_at as string) ?? null,
  lastError: (r.last_error as string) ?? null,
  responseCode: r.response_code == null ? null : Number(r.response_code),
  summary: (r.summary as string) ?? null,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const snake: Record<string, string> = {
  tenantCode: 'tenant_code', memberEmail: 'member_email', secretSealed: 'secret_sealed', lastCheckedAt: 'last_checked_at', lastError: 'last_error',
  createdBy: 'created_by', eventId: 'event_id', connectionId: 'connection_id', nextAttemptAt: 'next_attempt_at', responseCode: 'response_code',
  idempotencyKey: 'idempotency_key', actorEmail: 'actor_email',
};
const toRow = (o: Record<string, unknown>): Row => {
  const r: Row = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && k !== 'createdAt' && k !== 'updatedAt') r[snake[k] ?? k] = v;
  return r;
};

class SupabaseIntegrationStore implements IntegrationStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) throw new Error(`[integrationStore] ${res.error.message}`);
    return res.data;
  }
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
  async insertEvent(e: Omit<IntegrationEvent, 'id' | 'createdAt'>) {
    const res = await this.db.from('integration_events').insert(toRow(e as Record<string, unknown>)).select().single();
    if (res.error?.code === '23505') return null; // duplicate idempotency key
    return evFromRow(this.check(res) as Row);
  }
  async getEvent(id: string) {
    const r = this.check(await this.db.from('integration_events').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? evFromRow(r) : null;
  }
  async insertDelivery(d: Omit<Delivery, 'id' | 'createdAt' | 'updatedAt'>) {
    return delFromRow(this.check(await this.db.from('integration_deliveries').insert(toRow(d as Record<string, unknown>)).select().single()) as Row);
  }
  async updateDelivery(id: string, patch: Partial<Delivery>) {
    const r = this.check(
      await this.db.from('integration_deliveries').update({ ...toRow(patch as Record<string, unknown>), updated_at: nowIso() }).eq('id', id).select().maybeSingle(),
    ) as Row | null;
    return r ? delFromRow(r) : null;
  }
  async dueDeliveries(limit: number) {
    const rows = this.check(
      await this.db
        .from('integration_deliveries')
        .select('*')
        .in('status', ['pending', 'failed'])
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso()}`)
        .order('created_at')
        .limit(limit),
    ) as Row[];
    return rows.map(delFromRow);
  }
  async listDeliveries(f: { tenantCode: string; connectionId?: string; limit?: number }) {
    let q = this.db.from('integration_deliveries').select('*').eq('tenant_code', f.tenantCode);
    if (f.connectionId) q = q.eq('connection_id', f.connectionId);
    return (this.check(await q.order('created_at', { ascending: false }).limit(f.limit ?? 100)) as Row[]).map(delFromRow);
  }
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

let store: IntegrationStore | null = null;
export function getIntegrationStore(): IntegrationStore {
  if (store) return store;
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
  return store;
}
