/**
 * Server-only storage for each workspace's Do Not Contact list (rules in src/lib/suppression.ts).
 * Same two backends as leadHandoffStore: Supabase (table in supabase/migrations/20261202000000_contact_suppressions.sql)
 * or a JSON file (TENANCY_DATA_DIR/contact_suppressions.json) for local work and tests.
 *
 * Every method takes the tenant code from the caller's session and scopes by it: another workspace's entries are never
 * read, matched or changed. Removing an entry keeps it (removed_at, who, and the reason given) as the audit trail; only
 * entries without removed_at are active.
 *
 * Until the migration has run, the Supabase backend throws SuppressionUnavailableError: callers say so plainly
 * (nothing is "saved"), and sends are not blocked by a list that cannot hold anything yet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import type { SuppressionEntry, SuppressionKind, SuppressionReason, SuppressionSource } from '@/lib/suppression';

export interface NewSuppression {
  kind: SuppressionKind;
  value: string;
  matchKey: string;
  reason: SuppressionReason;
  note: string;
  source: SuppressionSource;
  createdByEmail: string;
  createdByName: string;
}

export interface SuppressionStore {
  readonly backend: 'supabase' | 'file';
  /** Add entries; one already active for the same kind + key is returned in `already` (nothing is duplicated). */
  add(tenantCode: string, items: NewSuppression[]): Promise<{ added: SuppressionEntry[]; already: SuppressionEntry[] }>;
  /** Active entries, newest first. */
  listActive(tenantCode: string, limit: number): Promise<SuppressionEntry[]>;
  /** Active entries matching any of these phone keys / emails. */
  findActive(tenantCode: string, keys: { phones: string[]; emails: string[] }): Promise<SuppressionEntry[]>;
  /** Mark one active entry removed (kept for the audit trail). */
  remove(tenantCode: string, id: string, by: { email: string; name: string }, note: string): Promise<SuppressionEntry | null>;
}

/** The table does not exist yet (migration not run) or the store is otherwise not set up. */
export class SuppressionUnavailableError extends Error {}
/** The workspace holds the most active entries allowed. */
export class SuppressionLimitError extends Error {}

/** Active entries allowed per workspace, so a runaway script can't fill the store. */
export const MAX_ACTIVE_PER_WORKSPACE = 50_000;

// ------------------------------------------------------------------ file backend

class FileSuppressionStore implements SuppressionStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'contact_suppressions.json');
  }
  private read(): SuppressionEntry[] {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { suppressions?: SuppressionEntry[] };
      return p.suppressions ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private write(rows: SuppressionEntry[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ suppressions: rows }), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: SuppressionEntry[]) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  add(tenantCode: string, items: NewSuppression[]) {
    return this.mutate((d) => {
      const added: SuppressionEntry[] = [];
      const already: SuppressionEntry[] = [];
      const active = d.filter((x) => x.tenantCode === tenantCode && !x.removedAt);
      for (const it of items) {
        const hit = active.find((x) => x.kind === it.kind && x.matchKey === it.matchKey);
        if (hit) {
          already.push(hit);
          continue;
        }
        if (active.length >= MAX_ACTIVE_PER_WORKSPACE) throw new SuppressionLimitError('The Do Not Contact list is full.');
        const e: SuppressionEntry = {
          id: newId(),
          tenantCode,
          ...it,
          createdByEmail: it.createdByEmail.trim().toLowerCase(),
          createdAt: nowIso(),
          removedAt: null,
          removedByEmail: null,
          removedByName: null,
          removalNote: null,
        };
        d.push(e);
        active.push(e);
        added.push(e);
      }
      return { added, already };
    });
  }
  async listActive(tenantCode: string, limit: number) {
    // Wait for queued writes so a list right after an add includes it.
    await this.queue;
    return this.read()
      .filter((x) => x.tenantCode === tenantCode && !x.removedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async findActive(tenantCode: string, keys: { phones: string[]; emails: string[] }) {
    await this.queue;
    return this.read().filter(
      (x) =>
        x.tenantCode === tenantCode &&
        !x.removedAt &&
        ((x.kind === 'phone' && keys.phones.includes(x.matchKey)) || (x.kind === 'email' && keys.emails.includes(x.matchKey))),
    );
  }
  remove(tenantCode: string, id: string, by: { email: string; name: string }, note: string) {
    return this.mutate((d) => {
      const e = d.find((x) => x.tenantCode === tenantCode && x.id === id && !x.removedAt);
      if (!e) return null;
      e.removedAt = nowIso();
      e.removedByEmail = by.email.trim().toLowerCase();
      e.removedByName = by.name;
      e.removalNote = note;
      return { ...e };
    });
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const TABLE = 'contact_suppressions';
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);
const UNIQUE_VIOLATION = '23505';

const fromRow = (r: Row): SuppressionEntry => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  kind: String(r.kind) === 'email' ? 'email' : 'phone',
  value: String(r.value ?? ''),
  matchKey: String(r.match_key ?? ''),
  reason: String(r.reason ?? 'other') as SuppressionReason,
  note: String(r.note ?? ''),
  source: String(r.source ?? 'manual') as SuppressionSource,
  createdByEmail: String(r.created_by_email ?? ''),
  createdByName: String(r.created_by_name ?? ''),
  createdAt: String(r.created_at),
  removedAt: r.removed_at ? String(r.removed_at) : null,
  removedByEmail: r.removed_by_email ? String(r.removed_by_email) : null,
  removedByName: r.removed_by_name ? String(r.removed_by_name) : null,
  removalNote: r.removal_note ? String(r.removal_note) : null,
});

class SupabaseSuppressionStore implements SuppressionStore {
  readonly backend = 'supabase' as const;
  /**
   * Set once any query has worked in this process: from then on the table exists, so a later "missing table" answer
   * (a stale PostgREST schema cache, a renamed column) is an error that blocks sends and dials, never "not set up"
   * (which lets them go ahead). SUPPRESSION_REQUIRED=1 makes that true from the start (set it once the migration ran).
   */
  private seen = process.env.SUPPRESSION_REQUIRED === '1';
  constructor(private db: SupabaseClient) {}
  /** Database errors never reach the caller as text: a missing table is "not set up", anything else a plain error. */
  private fail(error: { code?: string; message: string }): never {
    if (error.code && MISSING_TABLE.has(error.code) && !this.seen) throw new SuppressionUnavailableError('suppression table missing');
    throw new Error(`[suppressionStore] ${error.code || 'error'}`);
  }
  private okd<T>(v: T): T {
    this.seen = true;
    return v;
  }
  private async activeMatch(tenantCode: string, kind: SuppressionKind, matchKey: string): Promise<SuppressionEntry | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('tenant_code', tenantCode)
      .eq('kind', kind)
      .eq('match_key', matchKey)
      .is('removed_at', null)
      .limit(1)
      .maybeSingle();
    if (error) this.fail(error);
    return this.okd(data ? fromRow(data as Row) : null);
  }
  async add(tenantCode: string, items: NewSuppression[]) {
    const added: SuppressionEntry[] = [];
    const already: SuppressionEntry[] = [];
    for (const it of items) {
      const hit = await this.activeMatch(tenantCode, it.kind, it.matchKey);
      if (hit) {
        already.push(hit);
        continue;
      }
      const { count, error: cErr } = await this.db
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_code', tenantCode)
        .is('removed_at', null);
      if (cErr) this.fail(cErr);
      if ((count ?? 0) >= MAX_ACTIVE_PER_WORKSPACE) throw new SuppressionLimitError('The Do Not Contact list is full.');
      const { data, error } = await this.db
        .from(TABLE)
        .insert({
          tenant_code: tenantCode,
          kind: it.kind,
          value: it.value,
          match_key: it.matchKey,
          reason: it.reason,
          note: it.note,
          source: it.source,
          created_by_email: it.createdByEmail.trim().toLowerCase(),
          created_by_name: it.createdByName,
        })
        .select()
        .single();
      if (error) {
        // Someone else added the same entry a moment ago (the partial unique index): it is on the list.
        if (error.code === UNIQUE_VIOLATION) {
          const again = await this.activeMatch(tenantCode, it.kind, it.matchKey);
          if (again) {
            already.push(again);
            continue;
          }
        }
        this.fail(error);
      }
      added.push(fromRow(data as Row));
    }
    return { added, already };
  }
  async listActive(tenantCode: string, limit: number) {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('tenant_code', tenantCode)
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) this.fail(error);
    return this.okd(((data ?? []) as Row[]).map(fromRow));
  }
  async findActive(tenantCode: string, keys: { phones: string[]; emails: string[] }) {
    const out: SuppressionEntry[] = [];
    for (const [kind, all] of [['phone', [...new Set(keys.phones)]], ['email', [...new Set(keys.emails)]]] as const) {
      // In chunks of 50 keys (URL length): every key is looked up, none is dropped.
      for (let i = 0; i < all.length; i += 50) {
        const { data, error } = await this.db
          .from(TABLE)
          .select('*')
          .eq('tenant_code', tenantCode)
          .eq('kind', kind)
          .in('match_key', all.slice(i, i + 50))
          .is('removed_at', null);
        if (error) this.fail(error);
        out.push(...((data ?? []) as Row[]).map(fromRow));
        this.seen = true;
      }
    }
    return out;
  }
  async remove(tenantCode: string, id: string, by: { email: string; name: string }, note: string) {
    const { data, error } = await this.db
      .from(TABLE)
      .update({ removed_at: nowIso(), removed_by_email: by.email.trim().toLowerCase(), removed_by_name: by.name, removal_note: note })
      .eq('tenant_code', tenantCode)
      .eq('id', id)
      .is('removed_at', null)
      .select();
    if (error) this.fail(error);
    const rows = (data ?? []) as Row[];
    return this.okd(rows.length ? fromRow(rows[0]) : null);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUIDs in both backends; reject anything else before it reaches a query. */
export const isSuppressionId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);

let store: SuppressionStore | null = null;
export function getSuppressionStore(): SuppressionStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseSuppressionStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new SuppressionUnavailableError('[suppressionStore] No database configured.');
    }
    store = new FileSuppressionStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
