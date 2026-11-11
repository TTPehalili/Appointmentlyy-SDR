/**
 * Server-only storage for Meeting Action Plans and the workspace Company profile. Same two backends
 * as tenantStore and emailTemplateStore: Supabase (tables in
 * supabase/migrations/20261113000000_meeting_plans.sql) or JSON files
 * (TENANCY_DATA_DIR/meeting_plans.json and company_profiles.json) for local work.
 *
 * Every method takes the tenant code and scopes by it: a plan id from another workspace is simply
 * "not found". Callers decide who in the workspace may see a plan (meetingPlanApi.canSeePlan).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import { meetingContactKey } from '@/lib/meetingPlan';
import type {
  ActionPlan,
  CallContext,
  CompanyProfile,
  CompanyProfileInput,
  LeadSnapshot,
  MeetingPlan,
  MeetingPlanStatus,
  OnePagerCopy,
  ResearchSummary,
} from '@/lib/meetingPlan';

/** A plan as stored: the public shape plus server-only bookkeeping (never sent to the browser). */
export interface StoredMeetingPlan extends MeetingPlan {
  seedKey: string | null;
  /** Last time AI generation was started for this plan. */
  generatedAt: string | null;
  /** Recent generation start times (newest last, trimmed), for the daily cap. */
  generationTimes: string[];
}

export interface NewMeetingPlan {
  contactKey: string;
  lead: LeadSnapshot;
  call: CallContext;
  bookedBy: string;
  bookedByName: string;
  assignedAe: string;
  assignedAeName: string;
}

export type MeetingPlanPatch = Partial<{
  lead: LeadSnapshot;
  call: CallContext;
  assignedAe: string;
  assignedAeName: string;
  status: MeetingPlanStatus;
  research: ResearchSummary | null;
  plan: ActionPlan | null;
  onePager: OnePagerCopy | null;
  error: string | null;
  sentAt: string | null;
}>;

export interface UpdateOptions {
  /** Count this update as a new AI generation (regenerate). */
  generation?: boolean;
  /** Only apply when the plan currently has this status (e.g. the stale-'preparing' sweep). */
  onlyIfStatus?: MeetingPlanStatus;
}

export interface MeetingPlanSeed {
  seedKey: string;
  lead: LeadSnapshot;
  call: CallContext;
  research: ResearchSummary | null;
  plan: ActionPlan | null;
  onePager: OnePagerCopy | null;
  status: 'ready' | 'sent';
  daysAgo: number;
  bookedBy: string;
  bookedByName: string;
  assignedAe: string;
  assignedAeName: string;
}

export interface MeetingPlanStore {
  readonly backend: 'supabase' | 'file';
  /** Newest first. visibleTo = an email: only plans that person booked or is assigned to. */
  list(tenantCode: string, filter?: { contactKey?: string; visibleTo?: string }): Promise<StoredMeetingPlan[]>;
  get(tenantCode: string, id: string): Promise<StoredMeetingPlan | null>;
  /** Creates with status 'preparing' and counts one generation. */
  create(tenantCode: string, input: NewMeetingPlan): Promise<StoredMeetingPlan>;
  update(tenantCode: string, id: string, patch: MeetingPlanPatch, opts?: UpdateOptions): Promise<StoredMeetingPlan | null>;
  /** AI generations started in this workspace since the given time (creates and regenerations). */
  countGeneratedSince(tenantCode: string, sinceIso: string): Promise<number>;
  /** Insert sample plans keyed by seedKey (deterministic ids); existing ones are left alone. */
  ensureSeeds(tenantCode: string, seeds: MeetingPlanSeed[]): Promise<void>;
}

export interface CompanyProfileStore {
  readonly backend: 'supabase' | 'file';
  get(tenantCode: string): Promise<CompanyProfile | null>;
  put(tenantCode: string, profile: CompanyProfileInput, by: string): Promise<CompanyProfile>;
}

/** Most plans listed at once (newest first). */
export const MAX_LISTED_PLANS = 500;
/** Generation times kept per plan; more than any daily cap needs. */
const MAX_GENERATION_TIMES = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUIDs in both backends; reject anything else before it reaches a query. */
export const isMeetingPlanId = (id: string) => UUID_RE.test(id);

/** Stable UUID for a sample plan, so seeding twice (or from two servers at once) inserts it once. */
export function meetingPlanSeedId(tenantCode: string, seedKey: string): string {
  const h = crypto.createHash('sha256').update(`meeting-plan-seed:${tenantCode}:${seedKey}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const newestFirst = (a: StoredMeetingPlan, b: StoredMeetingPlan) => b.createdAt.localeCompare(a.createdAt);
const lc = (s: string) => (s || '').trim().toLowerCase();

const pushGeneration = (times: string[], at: string) => [...times, at].slice(-MAX_GENERATION_TIMES);

function seedRecord(tenantCode: string, s: MeetingPlanSeed, contactKey: string): StoredMeetingPlan {
  const at = new Date(Date.now() - Math.max(0, s.daysAgo) * 86_400_000).toISOString();
  return {
    id: meetingPlanSeedId(tenantCode, s.seedKey),
    tenantCode,
    contactKey,
    lead: s.lead,
    call: s.call,
    bookedBy: lc(s.bookedBy),
    bookedByName: s.bookedByName,
    assignedAe: lc(s.assignedAe),
    assignedAeName: s.assignedAeName,
    status: s.status,
    research: s.research,
    plan: s.plan,
    onePager: s.onePager,
    error: null,
    sentAt: s.status === 'sent' ? at : null,
    createdAt: at,
    updatedAt: at,
    seedKey: s.seedKey,
    generatedAt: null,
    generationTimes: [],
  };
}

// ------------------------------------------------------------------ file backends

class JsonFile<T> {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string, private key: string) {}
  read(): T[] {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Record<string, T[]>;
      return p[this.key] ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  private write(rows: T[]) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ [this.key]: rows }, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  mutate<R>(fn: (rows: T[]) => R): Promise<R> {
    const run = this.queue.then(() => {
      const rows = this.read();
      const out = fn(rows);
      this.write(rows);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

class FileMeetingPlanStore implements MeetingPlanStore {
  readonly backend = 'file' as const;
  private f: JsonFile<StoredMeetingPlan>;
  constructor(dir: string) {
    this.f = new JsonFile(path.join(dir, 'meeting_plans.json'), 'plans');
  }
  async list(tenantCode: string, filter: { contactKey?: string; visibleTo?: string } = {}) {
    const who = filter.visibleTo ? lc(filter.visibleTo) : '';
    return this.f
      .read()
      .filter(
        (p) =>
          p.tenantCode === tenantCode &&
          (filter.contactKey === undefined || p.contactKey === filter.contactKey) &&
          (!who || p.bookedBy === who || p.assignedAe === who),
      )
      .sort(newestFirst)
      .slice(0, MAX_LISTED_PLANS);
  }
  async get(tenantCode: string, id: string) {
    return this.f.read().find((p) => p.tenantCode === tenantCode && p.id === id) ?? null;
  }
  create(tenantCode: string, input: NewMeetingPlan) {
    return this.f.mutate((rows) => {
      const now = nowIso();
      const p: StoredMeetingPlan = {
        ...input,
        bookedBy: lc(input.bookedBy),
        assignedAe: lc(input.assignedAe),
        id: newId(),
        tenantCode,
        status: 'preparing',
        research: null,
        plan: null,
        onePager: null,
        error: null,
        sentAt: null,
        createdAt: now,
        updatedAt: now,
        seedKey: null,
        generatedAt: now,
        generationTimes: [now],
      };
      rows.push(p);
      return p;
    });
  }
  update(tenantCode: string, id: string, patch: MeetingPlanPatch, opts: UpdateOptions = {}) {
    return this.f.mutate((rows) => {
      const i = rows.findIndex((p) => p.tenantCode === tenantCode && p.id === id);
      if (i < 0) return null;
      const cur = rows[i];
      if (opts.onlyIfStatus && cur.status !== opts.onlyIfStatus) return null;
      const now = nowIso();
      const next: StoredMeetingPlan = { ...cur, ...patch, id, tenantCode, updatedAt: now };
      if (patch.assignedAe !== undefined) next.assignedAe = lc(patch.assignedAe);
      if (opts.generation) {
        next.generatedAt = now;
        next.generationTimes = pushGeneration(cur.generationTimes ?? [], now);
      }
      rows[i] = next;
      return next;
    });
  }
  async countGeneratedSince(tenantCode: string, sinceIso: string) {
    let n = 0;
    for (const p of this.f.read()) {
      if (p.tenantCode !== tenantCode) continue;
      for (const t of p.generationTimes ?? []) if (t >= sinceIso) n++;
    }
    return n;
  }
  async ensureSeeds(tenantCode: string, seeds: MeetingPlanSeed[]) {
    await this.f.mutate((rows) => {
      for (const s of seeds) {
        const rec = seedRecord(tenantCode, s, meetingContactKey(s.lead));
        if (rows.some((p) => p.id === rec.id || (p.tenantCode === tenantCode && p.seedKey === s.seedKey))) continue;
        rows.push(rec);
      }
    });
  }
}

interface ProfileRow {
  tenantCode: string;
  profile: CompanyProfileInput;
  updatedBy: string;
  updatedAt: string;
}

class FileCompanyProfileStore implements CompanyProfileStore {
  readonly backend = 'file' as const;
  private f: JsonFile<ProfileRow>;
  constructor(dir: string) {
    this.f = new JsonFile(path.join(dir, 'company_profiles.json'), 'profiles');
  }
  async get(tenantCode: string) {
    const r = this.f.read().find((p) => p.tenantCode === tenantCode);
    return r ? { ...r.profile, updatedAt: r.updatedAt, updatedBy: r.updatedBy } : null;
  }
  put(tenantCode: string, profile: CompanyProfileInput, by: string) {
    return this.f.mutate((rows) => {
      const row: ProfileRow = { tenantCode, profile, updatedBy: by, updatedAt: nowIso() };
      const i = rows.findIndex((p) => p.tenantCode === tenantCode);
      if (i < 0) rows.push(row);
      else rows[i] = row;
      return { ...profile, updatedAt: row.updatedAt, updatedBy: by };
    });
  }
}

// ------------------------------------------------------------------ Supabase backends

type Row = Record<string, unknown>;
const PLANS = 'meeting_plans';
const PROFILES = 'company_profiles';

const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const obj = <T>(v: unknown): T | null => (v && typeof v === 'object' ? (v as T) : null);

const fromRow = (r: Row): StoredMeetingPlan => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  contactKey: String(r.contact_key ?? ''),
  lead: (obj<LeadSnapshot>(r.lead_snapshot) ?? { name: '', email: '', company: '' }) as LeadSnapshot,
  call: (obj<CallContext>(r.call_context) ?? { outcome: '', notes: '' }) as CallContext,
  bookedBy: String(r.booked_by ?? ''),
  bookedByName: String(r.booked_by_name ?? ''),
  assignedAe: String(r.assigned_ae ?? ''),
  assignedAeName: String(r.assigned_ae_name ?? ''),
  status: (r.status as MeetingPlanStatus) ?? 'failed',
  research: obj<ResearchSummary>(r.research),
  plan: obj<ActionPlan>(r.plan),
  onePager: obj<OnePagerCopy>(r.one_pager),
  error: r.error === null || r.error === undefined ? null : String(r.error),
  sentAt: iso(r.sent_at),
  createdAt: iso(r.created_at) ?? nowIso(),
  updatedAt: iso(r.updated_at) ?? nowIso(),
  seedKey: r.seed_key === null || r.seed_key === undefined ? null : String(r.seed_key),
  generatedAt: iso(r.generated_at),
  generationTimes: Array.isArray(r.generation_times) ? (r.generation_times as unknown[]).map((t) => iso(t) ?? '').filter(Boolean) : [],
});

function patchToRow(patch: MeetingPlanPatch): Row {
  const row: Row = {};
  if (patch.lead !== undefined) row.lead_snapshot = patch.lead;
  if (patch.call !== undefined) row.call_context = patch.call;
  if (patch.assignedAe !== undefined) row.assigned_ae = lc(patch.assignedAe);
  if (patch.assignedAeName !== undefined) row.assigned_ae_name = patch.assignedAeName;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.research !== undefined) row.research = patch.research;
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.onePager !== undefined) row.one_pager = patch.onePager;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.sentAt !== undefined) row.sent_at = patch.sentAt;
  return row;
}

class SupabaseMeetingPlanStore implements MeetingPlanStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`[meetingPlanStore] ${res.error.message}`);
    return res.data;
  }
  private async query(tenantCode: string, contactKey: string | undefined, column?: 'booked_by' | 'assigned_ae', who?: string) {
    let q = this.db.from(PLANS).select('*').eq('tenant_code', tenantCode);
    if (contactKey !== undefined) q = q.eq('contact_key', contactKey);
    if (column && who) q = q.eq(column, who);
    return (this.check(await q.order('created_at', { ascending: false }).limit(MAX_LISTED_PLANS)) as Row[]).map(fromRow);
  }
  async list(tenantCode: string, filter: { contactKey?: string; visibleTo?: string } = {}) {
    if (!filter.visibleTo) return this.query(tenantCode, filter.contactKey);
    // Two equality queries instead of a PostgREST or() string, so an email is never parsed as filter syntax.
    const who = lc(filter.visibleTo);
    const [a, b] = await Promise.all([
      this.query(tenantCode, filter.contactKey, 'booked_by', who),
      this.query(tenantCode, filter.contactKey, 'assigned_ae', who),
    ]);
    const byId = new Map<string, StoredMeetingPlan>();
    for (const p of [...a, ...b]) byId.set(p.id, p);
    return [...byId.values()].sort(newestFirst).slice(0, MAX_LISTED_PLANS);
  }
  async get(tenantCode: string, id: string) {
    const r = this.check(await this.db.from(PLANS).select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
    return r ? fromRow(r) : null;
  }
  async create(tenantCode: string, input: NewMeetingPlan) {
    const now = nowIso();
    const r = this.check(
      await this.db
        .from(PLANS)
        .insert({
          tenant_code: tenantCode,
          contact_key: input.contactKey,
          lead_snapshot: input.lead,
          call_context: input.call,
          booked_by: lc(input.bookedBy),
          booked_by_name: input.bookedByName,
          assigned_ae: lc(input.assignedAe),
          assigned_ae_name: input.assignedAeName,
          status: 'preparing',
          generated_at: now,
          generation_times: [now],
        })
        .select()
        .single(),
    ) as Row;
    return fromRow(r);
  }
  async update(tenantCode: string, id: string, patch: MeetingPlanPatch, opts: UpdateOptions = {}) {
    const now = nowIso();
    const row: Row = { ...patchToRow(patch), updated_at: now };
    if (opts.generation) {
      const cur = await this.get(tenantCode, id);
      if (!cur) return null;
      row.generated_at = now;
      row.generation_times = pushGeneration(cur.generationTimes, now);
    }
    let q = this.db.from(PLANS).update(row).eq('tenant_code', tenantCode).eq('id', id);
    if (opts.onlyIfStatus) q = q.eq('status', opts.onlyIfStatus);
    const r = this.check(await q.select().maybeSingle()) as Row | null;
    return r ? fromRow(r) : null;
  }
  async countGeneratedSince(tenantCode: string, sinceIso: string) {
    const rows = this.check(
      await this.db.from(PLANS).select('generation_times').eq('tenant_code', tenantCode).gte('generated_at', sinceIso).limit(5000),
    ) as Row[];
    const since = Date.parse(sinceIso);
    let n = 0;
    for (const r of rows) {
      for (const t of Array.isArray(r.generation_times) ? r.generation_times : []) if (Date.parse(String(t)) >= since) n++;
    }
    return n;
  }
  async ensureSeeds(tenantCode: string, seeds: MeetingPlanSeed[]) {
    if (!seeds.length) return;
    const rows = seeds.map((s) => {
      const p = seedRecord(tenantCode, s, meetingContactKey(s.lead));
      return {
        id: p.id,
        tenant_code: tenantCode,
        contact_key: p.contactKey,
        lead_snapshot: p.lead,
        call_context: p.call,
        booked_by: p.bookedBy,
        booked_by_name: p.bookedByName,
        assigned_ae: p.assignedAe,
        assigned_ae_name: p.assignedAeName,
        status: p.status,
        research: p.research,
        plan: p.plan,
        one_pager: p.onePager,
        sent_at: p.sentAt,
        seed_key: p.seedKey,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      };
    });
    this.check(await this.db.from(PLANS).upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
  }
}

class SupabaseCompanyProfileStore implements CompanyProfileStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  async get(tenantCode: string) {
    const res = await this.db.from(PROFILES).select('*').eq('tenant_code', tenantCode).maybeSingle();
    if (res.error) throw new Error(`[companyProfileStore] ${res.error.message}`);
    const r = res.data as Row | null;
    const p = r ? obj<CompanyProfileInput>(r.profile) : null;
    return r && p ? { ...p, updatedAt: iso(r.updated_at) ?? nowIso(), updatedBy: String(r.updated_by ?? '') } : null;
  }
  async put(tenantCode: string, profile: CompanyProfileInput, by: string) {
    const updatedAt = nowIso();
    const res = await this.db
      .from(PROFILES)
      .upsert({ tenant_code: tenantCode, profile, updated_by: by, updated_at: updatedAt }, { onConflict: 'tenant_code' });
    if (res.error) throw new Error(`[companyProfileStore] ${res.error.message}`);
    return { ...profile, updatedAt, updatedBy: by };
  }
}

// ------------------------------------------------------------------ factories

function backend(): { db: SupabaseClient } | { dir: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) return { db: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
  if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
    throw new Error('[meetingPlanStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
  }
  return { dir: process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data') };
}

let planStore: MeetingPlanStore | null = null;
export function getMeetingPlanStore(): MeetingPlanStore {
  if (planStore) return planStore;
  const b = backend();
  planStore = 'db' in b ? new SupabaseMeetingPlanStore(b.db) : new FileMeetingPlanStore(b.dir);
  return planStore;
}

let profileStore: CompanyProfileStore | null = null;
export function getCompanyProfileStore(): CompanyProfileStore {
  if (profileStore) return profileStore;
  const b = backend();
  profileStore = 'db' in b ? new SupabaseCompanyProfileStore(b.db) : new FileCompanyProfileStore(b.dir);
  return profileStore;
}
