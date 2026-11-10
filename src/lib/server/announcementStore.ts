/**
 * Server-only storage for platform announcements. Same two backends as tenantStore and
 * integrationStore: Supabase (table in supabase/migrations/20261111010000_announcements.sql) or a
 * JSON file (TENANCY_DATA_DIR/announcements.json) for local work.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import type { Announcement, AnnouncementInput } from '@/lib/announcements';

export interface AnnouncementStore {
  readonly backend: 'supabase' | 'file';
  /** Every announcement, newest publish date first. */
  list(): Promise<Announcement[]>;
  /** Announcements live at `at` (publishAt <= at < unpublishAt), newest first. */
  listLive(at: string): Promise<Announcement[]>;
  get(id: string): Promise<Announcement | null>;
  create(input: AnnouncementInput, createdBy: string): Promise<Announcement>;
  update(id: string, input: AnnouncementInput): Promise<Announcement | null>;
  remove(id: string): Promise<boolean>;
}

const newestFirst = (a: Announcement, b: Announcement) => b.publishAt.localeCompare(a.publishAt) || b.createdAt.localeCompare(a.createdAt);

// ------------------------------------------------------------------ file backend

class FileAnnouncementStore implements AnnouncementStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'announcements.json');
  }
  private read(): Announcement[] {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { announcements?: Announcement[] };
      return p.announcements ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private write(announcements: Announcement[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ announcements }, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: Announcement[]) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async list() {
    return this.read().sort(newestFirst);
  }
  async listLive(at: string) {
    const t = Date.parse(at);
    return this.read()
      .filter((a) => Date.parse(a.publishAt) <= t && t < Date.parse(a.unpublishAt))
      .sort(newestFirst);
  }
  async get(id: string) {
    return this.read().find((a) => a.id === id) ?? null;
  }
  create(input: AnnouncementInput, createdBy: string) {
    return this.mutate((d) => {
      const now = nowIso();
      const a: Announcement = { ...input, id: newId(), createdBy, createdAt: now, updatedAt: now };
      d.push(a);
      if (d.length > 2000) d.splice(0, d.length - 2000);
      return a;
    });
  }
  update(id: string, input: AnnouncementInput) {
    return this.mutate((d) => {
      const i = d.findIndex((a) => a.id === id);
      if (i < 0) return null;
      d[i] = { ...d[i], ...input, id, updatedAt: nowIso() };
      return d[i];
    });
  }
  remove(id: string) {
    return this.mutate((d) => {
      const i = d.findIndex((a) => a.id === id);
      if (i < 0) return false;
      d.splice(i, 1);
      return true;
    });
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const TABLE = 'platform_announcements';

const fromRow = (r: Row): Announcement => ({
  id: String(r.id),
  title: String(r.title ?? ''),
  message: String(r.message ?? ''),
  linkUrl: (r.link_url as string) || null,
  linkLabel: (r.link_label as string) || null,
  kind: (r.kind as Announcement['kind']) ?? 'update',
  audience: (r.audience as Announcement['audience']) ?? 'admins',
  workspaceCodes: Array.isArray(r.workspace_codes) ? (r.workspace_codes as unknown[]).map(String) : [],
  publishAt: new Date(String(r.publish_at)).toISOString(),
  unpublishAt: new Date(String(r.unpublish_at)).toISOString(),
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

const toRow = (a: AnnouncementInput): Row => ({
  title: a.title,
  message: a.message,
  link_url: a.linkUrl,
  link_label: a.linkLabel,
  kind: a.kind,
  audience: a.audience,
  workspace_codes: a.workspaceCodes,
  publish_at: a.publishAt,
  unpublish_at: a.unpublishAt,
});

class SupabaseAnnouncementStore implements AnnouncementStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`[announcementStore] ${res.error.message}`);
    return res.data;
  }
  async list() {
    const rows = this.check(await this.db.from(TABLE).select('*').order('publish_at', { ascending: false }).limit(500)) as Row[];
    return rows.map(fromRow);
  }
  async listLive(at: string) {
    const rows = this.check(
      await this.db.from(TABLE).select('*').lte('publish_at', at).gt('unpublish_at', at).order('publish_at', { ascending: false }).limit(50),
    ) as Row[];
    return rows.map(fromRow);
  }
  async get(id: string) {
    const r = this.check(await this.db.from(TABLE).select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? fromRow(r) : null;
  }
  async create(input: AnnouncementInput, createdBy: string) {
    const r = this.check(await this.db.from(TABLE).insert({ ...toRow(input), created_by: createdBy }).select().single()) as Row;
    return fromRow(r);
  }
  async update(id: string, input: AnnouncementInput) {
    const r = this.check(
      await this.db.from(TABLE).update({ ...toRow(input), updated_at: nowIso() }).eq('id', id).select().maybeSingle(),
    ) as Row | null;
    return r ? fromRow(r) : null;
  }
  async remove(id: string) {
    const rows = this.check(await this.db.from(TABLE).delete().eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUIDs in both backends; reject anything else before it reaches a query. */
export const isAnnouncementId = (id: string) => UUID_RE.test(id);

let store: AnnouncementStore | null = null;
export function getAnnouncementStore(): AnnouncementStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseAnnouncementStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[announcementStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileAnnouncementStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
