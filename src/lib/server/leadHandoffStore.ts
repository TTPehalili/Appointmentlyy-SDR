/**
 * Server-only storage for lead hand-off batches ("Assign leads to a teammate", src/lib/leadHandoffs.ts).
 * Same two backends as emailTemplateStore: Supabase (table in
 * supabase/migrations/20261129000000_lead_handoffs.sql) or a JSON file
 * (TENANCY_DATA_DIR/lead_handoffs.json) for local work.
 *
 * Every method takes the tenant code and the person's email and scopes by both: a batch from another
 * workspace, or addressed to someone else, is simply "not found".
 *
 * A batch only holds its leads until the recipient confirms: marking it delivered empties `leads`
 * (the count stays), so the server is a mailbox, not a second copy of anyone's contacts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import type { ContactRecord } from '@/lib/leadStore';
import type { LeadHandoffBatch } from '@/lib/leadHandoffs';

export interface NewLeadHandoff {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  folderName: string;
  leads: ContactRecord[];
}

export interface LeadHandoffStore {
  readonly backend: 'supabase' | 'file';
  create(tenantCode: string, input: NewLeadHandoff): Promise<LeadHandoffBatch>;
  /** Undelivered batches addressed to this person in this workspace, oldest first. */
  listUndelivered(tenantCode: string, toEmail: string): Promise<LeadHandoffBatch[]>;
  /** Batches this person sent in this workspace, newest first (leads are not read). */
  listSent(tenantCode: string, fromEmail: string, limit: number): Promise<LeadHandoffBatch[]>;
  /** Mark delivered. Only the recipient's own batch matches; anything else returns false. */
  markDelivered(tenantCode: string, toEmail: string, id: string): Promise<'delivered' | 'already' | 'not_found'>;
}

/** Undelivered batches allowed per workspace, so a runaway script can't fill the store. */
export const MAX_PENDING_HANDOFFS_PER_WORKSPACE = 100;
/** Most batches one person collects per request. */
const MAX_COLLECT = 20;

export class HandoffLimitError extends Error {}

const lower = (s: string) => s.trim().toLowerCase();

// ------------------------------------------------------------------ file backend

class FileLeadHandoffStore implements LeadHandoffStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'lead_handoffs.json');
  }
  private read(): LeadHandoffBatch[] {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { handoffs?: LeadHandoffBatch[] };
      return p.handoffs ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private write(handoffs: LeadHandoffBatch[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ handoffs }), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: LeadHandoffBatch[]) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  create(tenantCode: string, input: NewLeadHandoff) {
    return this.mutate((d) => {
      if (d.filter((b) => b.tenantCode === tenantCode && !b.deliveredAt).length >= MAX_PENDING_HANDOFFS_PER_WORKSPACE) {
        throw new HandoffLimitError('Too many assignments are still waiting to be collected. Try again once your teammates have opened the app.');
      }
      const b: LeadHandoffBatch = {
        id: newId(),
        tenantCode,
        fromEmail: lower(input.fromEmail),
        fromName: input.fromName,
        toEmail: lower(input.toEmail),
        folderName: input.folderName,
        leads: input.leads,
        leadCount: input.leads.length,
        createdAt: nowIso(),
        deliveredAt: null,
      };
      d.push(b);
      return b;
    });
  }
  async listUndelivered(tenantCode: string, toEmail: string) {
    const to = lower(toEmail);
    return this.read()
      .filter((b) => b.tenantCode === tenantCode && b.toEmail === to && !b.deliveredAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, MAX_COLLECT);
  }
  async listSent(tenantCode: string, fromEmail: string, limit: number) {
    const from = lower(fromEmail);
    return this.read()
      .filter((b) => b.tenantCode === tenantCode && b.fromEmail === from)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((b) => ({ ...b, leads: [] }));
  }
  markDelivered(tenantCode: string, toEmail: string, id: string) {
    const to = lower(toEmail);
    return this.mutate((d) => {
      const b = d.find((x) => x.tenantCode === tenantCode && x.toEmail === to && x.id === id);
      if (!b) return 'not_found' as const;
      if (b.deliveredAt) return 'already' as const;
      b.deliveredAt = nowIso();
      b.leads = [];
      return 'delivered' as const;
    });
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const TABLE = 'lead_handoffs';
const SUMMARY_COLUMNS = 'id, tenant_code, from_email, from_name, to_email, folder_name, lead_count, created_at, delivered_at';

const fromRow = (r: Row): LeadHandoffBatch => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  fromEmail: String(r.from_email ?? ''),
  fromName: String(r.from_name ?? ''),
  toEmail: String(r.to_email ?? ''),
  folderName: String(r.folder_name ?? ''),
  leads: Array.isArray(r.leads) ? (r.leads as ContactRecord[]) : [],
  leadCount: Number(r.lead_count ?? 0),
  createdAt: String(r.created_at),
  deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
});

class SupabaseLeadHandoffStore implements LeadHandoffStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`[leadHandoffStore] ${res.error.message}`);
    return res.data;
  }
  async create(tenantCode: string, input: NewLeadHandoff) {
    const { count, error } = await this.db
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_code', tenantCode)
      .is('delivered_at', null);
    if (error) throw new Error(`[leadHandoffStore] ${error.message}`);
    if ((count ?? 0) >= MAX_PENDING_HANDOFFS_PER_WORKSPACE) {
      throw new HandoffLimitError('Too many assignments are still waiting to be collected. Try again once your teammates have opened the app.');
    }
    const r = this.check(
      await this.db
        .from(TABLE)
        .insert({
          tenant_code: tenantCode,
          from_email: lower(input.fromEmail),
          from_name: input.fromName,
          to_email: lower(input.toEmail),
          folder_name: input.folderName,
          leads: input.leads,
          lead_count: input.leads.length,
        })
        .select()
        .single(),
    ) as Row;
    return fromRow(r);
  }
  async listUndelivered(tenantCode: string, toEmail: string) {
    const rows = this.check(
      await this.db
        .from(TABLE)
        .select('*')
        .eq('tenant_code', tenantCode)
        .eq('to_email', lower(toEmail))
        .is('delivered_at', null)
        .order('created_at', { ascending: true })
        .limit(MAX_COLLECT),
    ) as Row[];
    return rows.map(fromRow);
  }
  async listSent(tenantCode: string, fromEmail: string, limit: number) {
    const rows = this.check(
      await this.db
        .from(TABLE)
        .select(SUMMARY_COLUMNS)
        .eq('tenant_code', tenantCode)
        .eq('from_email', lower(fromEmail))
        .order('created_at', { ascending: false })
        .limit(limit),
    ) as Row[];
    return rows.map(fromRow);
  }
  async markDelivered(tenantCode: string, toEmail: string, id: string) {
    const to = lower(toEmail);
    const updated = this.check(
      await this.db
        .from(TABLE)
        .update({ delivered_at: nowIso(), leads: [] })
        .eq('tenant_code', tenantCode)
        .eq('to_email', to)
        .eq('id', id)
        .is('delivered_at', null)
        .select('id'),
    ) as Row[] | null;
    if (updated && updated.length) return 'delivered' as const;
    const existing = this.check(
      await this.db.from(TABLE).select('id').eq('tenant_code', tenantCode).eq('to_email', to).eq('id', id).maybeSingle(),
    ) as Row | null;
    return existing ? ('already' as const) : ('not_found' as const);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUIDs in both backends; reject anything else before it reaches a query. */
export const isHandoffId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);

let store: LeadHandoffStore | null = null;
export function getLeadHandoffStore(): LeadHandoffStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseLeadHandoffStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[leadHandoffStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileLeadHandoffStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
