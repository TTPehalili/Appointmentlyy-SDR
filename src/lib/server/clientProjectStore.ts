/**
 * Server-only storage for Client Projects (the platform owner's onboarding board). Same two backends
 * as agreementStore: Supabase (tables in supabase/migrations/20261121000000_client_projects.sql) or
 * JSON files under TENANCY_DATA_DIR for local work (client_projects.json plus
 * client_projects_files/<fileId>.bin).
 *
 * Uploaded PDFs go in a bytea table, never a public bucket, and no route serves them to the client board.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newId, nowIso } from '@/lib/server/tenantStore';
import type { AiRun, AiRunStatus, CpComment, CpEvent, CpEventType, CpFileMeta, Project, Task } from '@/lib/clientProjects/types';

/** The database tables aren't there yet (migration not run). */
export class ClientProjectStorageError extends Error {}
export const CP_MIGRATION = 'supabase/migrations/20261121000000_client_projects.sql';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCpId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);
export const sha256Hex = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest('hex');

export type NewEvent = Omit<CpEvent, 'id' | 'at'> & { at?: string };

/**
 * A page cursor: the position of the last row of the previous page, as "<at>~<id>". Rows are ordered by
 * (at, id) newest first, so rows that share a timestamp are never skipped or repeated between pages.
 */
export const cursorOf = (row: { at: string; id: string }): string => `${row.at}~${row.id}`;
export function parseCursor(v: string | null | undefined): { at: string; id: string } | null {
  if (!v) return null;
  const [at, id, extra] = v.split('~');
  if (extra !== undefined || !id || !UUID_RE.test(id) || at.length > 40 || Number.isNaN(Date.parse(at))) return null;
  return { at: new Date(at).toISOString(), id };
}
/** True when (at, id) comes strictly after the cursor in newest-first order (i.e. is older). */
const olderThan = (row: { at: string; id: string }, c: { at: string; id: string } | null) => !c || row.at < c.at || (row.at === c.at && row.id < c.id);
const newestFirst = (a: { at: string; id: string }, b: { at: string; id: string }) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id);

/** Filters applied IN the store. `before` is a page cursor (cursorOf the last row of the previous page). */
export interface EventQuery {
  type?: CpEventType;
  taskId?: string;
  /** e.g. 'client:' for everything a client did. */
  actorPrefix?: string;
  /** Automation events: detail.rule. */
  rule?: string;
  since?: string;
  before?: string;
  /** Default 200, at most 1000. */
  limit?: number;
}
export interface CommentQuery {
  taskId?: string;
  before?: string;
  limit?: number;
}
const pageSize = (n: number | undefined, dflt: number, max: number) => Math.max(1, Math.min(max, Math.trunc(n ?? dflt) || dflt));

export interface ClientProjectStore {
  readonly backend: 'supabase' | 'file';
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  findByTokenHash(hash: string): Promise<Project | null>;
  createProject(p: Project): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  /** Reserve `count` issue numbers; returns the first one. Atomic. */
  nextTaskNums(projectId: string, count: number): Promise<number>;
  listTasks(projectId: string): Promise<Task[]>;
  listTasksFor(projectIds: string[]): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  insertTasks(tasks: Task[]): Promise<void>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task | null>;
  /** Remove a card and its comments; cards that waited on it stop waiting. Events are kept. */
  deleteTask(id: string): Promise<boolean>;
  /**
   * Append an event. With `dedupeKey`, at most one event per project ever carries that key: a second
   * attempt returns null (this is what makes delay records, reminders and digests fire once).
   */
  addEvent(ev: NewEvent, dedupeKey?: string): Promise<CpEvent | null>;
  /**
   * Events NEWEST FIRST, one page at a time, filtered in the store. There is deliberately no "load
   * every event" call: callers ask for what they need (a type, a task, a rule, a page).
   */
  findEvents(projectId: string, q?: EventQuery): Promise<CpEvent[]>;
  countEvents(projectId: string, q?: Pick<EventQuery, 'actorPrefix' | 'since' | 'type'>): Promise<number>;
  /**
   * Record the outcome on an event that was inserted first as a claim (see addEvent's dedupeKey): merges
   * `detail`, and with `newDedupeKey` moves the claim to another key (e.g. a per-day "not sent" key so
   * the real key is free for a retry). False when that key is already taken; nothing is changed then.
   */
  settleEvent(id: string, detail: Record<string, unknown>, newDedupeKey?: string): Promise<boolean>;
  /** Drop a claim that turned out not to be needed (never used for real history). */
  removeEvent(id: string): Promise<boolean>;
  addComment(c: Omit<CpComment, 'id' | 'at'>): Promise<CpComment>;
  /** The NEWEST `limit` comments of a project (default 2000), returned oldest first for display. */
  listComments(projectId: string, limit?: number): Promise<CpComment[]>;
  /** Comments newest first, one page at a time. */
  findComments(projectId: string, q?: CommentQuery): Promise<CpComment[]>;
  putFile(meta: Omit<CpFileMeta, 'id' | 'createdAt' | 'size' | 'sha256'>, bytes: Uint8Array): Promise<CpFileMeta>;
  listFiles(projectId: string): Promise<CpFileMeta[]>;
  getFileBytes(id: string): Promise<Buffer | null>;
  deleteFile(id: string): Promise<boolean>;
  createRun(run: AiRun): Promise<AiRun>;
  /** Patch a run; with `ifStatus`, only while it is still in one of those states (else null). */
  updateRun(id: string, patch: Partial<AiRun>, ifStatus?: AiRunStatus[]): Promise<AiRun | null>;
  latestRun(projectId: string): Promise<AiRun | null>;
  getRun(id: string): Promise<AiRun | null>;
}

// ------------------------------------------------------------------ file backend

interface FileData {
  projects: Project[];
  tasks: Task[];
  events: (CpEvent & { dedupeKey?: string })[];
  comments: CpComment[];
  files: CpFileMeta[];
  runs: AiRun[];
}
const EMPTY = (): FileData => ({ projects: [], tasks: [], events: [], comments: [], files: [], runs: [] });

class FileClientProjectStore implements ClientProjectStore {
  readonly backend = 'file' as const;
  private file: string;
  private filesDir: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'client_projects.json');
    this.filesDir = path.join(dir, 'client_projects_files');
  }
  private read(): FileData {
    try {
      return { ...EMPTY(), ...(JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileData>) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY();
      throw err;
    }
  }
  private write(d: FileData) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d), 'utf8');
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (d: FileData) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.write(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async listProjects() {
    return this.read().projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getProject(id: string) {
    return this.read().projects.find((p) => p.id === id) ?? null;
  }
  async findByTokenHash(hash: string) {
    const want = Buffer.from(hash, 'hex');
    let hit: Project | null = null;
    for (const p of this.read().projects) {
      if (!p.tokenHash) continue;
      const have = Buffer.from(p.tokenHash, 'hex');
      if (have.length === want.length && crypto.timingSafeEqual(have, want)) hit = p;
    }
    return hit;
  }
  createProject(p: Project) {
    return this.mutate((d) => {
      d.projects.push(p);
      return p;
    });
  }
  updateProject(id: string, patch: Partial<Project>) {
    return this.mutate((d) => {
      const i = d.projects.findIndex((p) => p.id === id);
      if (i < 0) return null;
      d.projects[i] = { ...d.projects[i], ...patch, id, updatedAt: nowIso() };
      return d.projects[i];
    });
  }
  async deleteProject(id: string) {
    const fileIds: string[] = [];
    const ok = await this.mutate((d) => {
      const n = d.projects.length;
      d.projects = d.projects.filter((p) => p.id !== id);
      d.tasks = d.tasks.filter((t) => t.projectId !== id);
      d.events = d.events.filter((e) => e.projectId !== id);
      d.comments = d.comments.filter((c) => c.projectId !== id);
      d.runs = d.runs.filter((r) => r.projectId !== id);
      fileIds.push(...d.files.filter((f) => f.projectId === id).map((f) => f.id));
      d.files = d.files.filter((f) => f.projectId !== id);
      return d.projects.length < n;
    });
    for (const f of fileIds) if (isCpId(f)) fs.rmSync(path.join(this.filesDir, `${f}.bin`), { force: true });
    return ok;
  }
  nextTaskNums(projectId: string, count: number) {
    return this.mutate((d) => {
      const p = d.projects.find((x) => x.id === projectId);
      if (!p) throw new Error('[clientProjectStore] project not found');
      const first = (p.taskSeq ?? 0) + 1;
      p.taskSeq = (p.taskSeq ?? 0) + count;
      return first;
    });
  }
  async listTasks(projectId: string) {
    return this.read().tasks.filter((t) => t.projectId === projectId).sort((a, b) => a.sort - b.sort || a.num - b.num);
  }
  async listTasksFor(projectIds: string[]) {
    const set = new Set(projectIds);
    return this.read().tasks.filter((t) => set.has(t.projectId));
  }
  async getTask(id: string) {
    return this.read().tasks.find((t) => t.id === id) ?? null;
  }
  async insertTasks(tasks: Task[]) {
    if (!tasks.length) return;
    await this.mutate((d) => {
      d.tasks.push(...tasks);
    });
  }
  updateTask(id: string, patch: Partial<Task>) {
    return this.mutate((d) => {
      const i = d.tasks.findIndex((t) => t.id === id);
      if (i < 0) return null;
      d.tasks[i] = { ...d.tasks[i], ...patch, id, projectId: d.tasks[i].projectId, num: d.tasks[i].num, updatedAt: nowIso() };
      return d.tasks[i];
    });
  }
  deleteTask(id: string) {
    return this.mutate((d) => {
      const n = d.tasks.length;
      d.tasks = d.tasks.filter((t) => t.id !== id);
      if (d.tasks.length === n) return false;
      d.comments = d.comments.filter((c) => c.taskId !== id);
      for (const t of d.tasks) if (t.blockedBy === id) t.blockedBy = null;
      return true;
    });
  }
  addEvent(ev: NewEvent, dedupeKey?: string) {
    return this.mutate((d) => {
      if (dedupeKey && d.events.some((e) => e.projectId === ev.projectId && e.dedupeKey === dedupeKey)) return null;
      const row = { ...ev, id: newId(), at: ev.at ?? nowIso(), ...(dedupeKey ? { dedupeKey } : {}) };
      d.events.push(row);
      const { dedupeKey: _k, ...out } = row;
      void _k;
      return out as CpEvent;
    });
  }
  private matchEvents(projectId: string, q: EventQuery) {
    return this.read().events.filter(
      (e) =>
        e.projectId === projectId &&
        (!q.type || e.type === q.type) &&
        (!q.taskId || e.taskId === q.taskId) &&
        (!q.actorPrefix || e.actor.startsWith(q.actorPrefix)) &&
        (!q.rule || e.detail?.rule === q.rule) &&
        (!q.since || e.at >= q.since) &&
        olderThan(e, parseCursor(q.before)),
    );
  }
  async findEvents(projectId: string, q: EventQuery = {}) {
    return this.matchEvents(projectId, q)
      .sort(newestFirst)
      .slice(0, pageSize(q.limit, 200, 1000))
      .map(({ dedupeKey: _k, ...e }) => (void _k, e as CpEvent));
  }
  async countEvents(projectId: string, q: Pick<EventQuery, 'actorPrefix' | 'since' | 'type'> = {}) {
    return this.matchEvents(projectId, q).length;
  }
  settleEvent(id: string, detail: Record<string, unknown>, newDedupeKey?: string) {
    return this.mutate((d) => {
      const e = d.events.find((x) => x.id === id);
      if (!e) return false;
      if (newDedupeKey && d.events.some((x) => x.id !== id && x.projectId === e.projectId && x.dedupeKey === newDedupeKey)) return false;
      e.detail = { ...e.detail, ...detail };
      if (newDedupeKey) e.dedupeKey = newDedupeKey;
      return true;
    });
  }
  removeEvent(id: string) {
    return this.mutate((d) => {
      const n = d.events.length;
      d.events = d.events.filter((x) => x.id !== id);
      return d.events.length < n;
    });
  }
  addComment(c: Omit<CpComment, 'id' | 'at'>) {
    return this.mutate((d) => {
      const row: CpComment = { ...c, id: newId(), at: nowIso() };
      d.comments.push(row);
      return row;
    });
  }
  async findComments(projectId: string, q: CommentQuery = {}) {
    return this.read()
      .comments.filter((c) => c.projectId === projectId && (!q.taskId || c.taskId === q.taskId) && olderThan(c, parseCursor(q.before)))
      .sort(newestFirst)
      .slice(0, pageSize(q.limit, 200, 2000));
  }
  async listComments(projectId: string, limit = 2000) {
    return (await this.findComments(projectId, { limit })).reverse();
  }
  async putFile(meta: Omit<CpFileMeta, 'id' | 'createdAt' | 'size' | 'sha256'>, bytes: Uint8Array) {
    const row: CpFileMeta = { ...meta, id: newId(), createdAt: nowIso(), size: bytes.length, sha256: sha256Hex(bytes) };
    fs.mkdirSync(this.filesDir, { recursive: true });
    const target = path.join(this.filesDir, `${row.id}.bin`);
    fs.writeFileSync(`${target}.tmp`, bytes);
    fs.renameSync(`${target}.tmp`, target);
    await this.mutate((d) => {
      d.files.push(row);
    });
    return row;
  }
  async listFiles(projectId: string) {
    return this.read().files.filter((f) => f.projectId === projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getFileBytes(id: string) {
    if (!isCpId(id)) return null;
    try {
      return fs.readFileSync(path.join(this.filesDir, `${id}.bin`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
  async deleteFile(id: string) {
    if (!isCpId(id)) return false;
    const ok = await this.mutate((d) => {
      const n = d.files.length;
      d.files = d.files.filter((f) => f.id !== id);
      return d.files.length < n;
    });
    if (ok) fs.rmSync(path.join(this.filesDir, `${id}.bin`), { force: true });
    return ok;
  }
  createRun(run: AiRun) {
    return this.mutate((d) => {
      d.runs.push(run);
      return run;
    });
  }
  updateRun(id: string, patch: Partial<AiRun>, ifStatus?: AiRunStatus[]) {
    return this.mutate((d) => {
      const i = d.runs.findIndex((r) => r.id === id);
      if (i < 0) return null;
      if (ifStatus && !ifStatus.includes(d.runs[i].status)) return null;
      d.runs[i] = { ...d.runs[i], ...patch, id, updatedAt: nowIso() };
      return d.runs[i];
    });
  }
  async latestRun(projectId: string) {
    const rows = this.read().runs.filter((r) => r.projectId === projectId);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows[0] ?? null;
  }
  async getRun(id: string) {
    return this.read().runs.find((r) => r.id === id) ?? null;
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', '42703', 'PGRST202', '42883']);

/** How a field travels: s = text (never null), ns = nullable text, n = number, nn = nullable number, b = boolean, nb = nullable boolean, t = timestamp (nullable), d = date (nullable), j = json. */
type Kind = 's' | 'ns' | 'n' | 'nn' | 'b' | 'nb' | 't' | 'd' | 'j';
type ColMap<T> = [keyof T & string, string, Kind, unknown?][];

function fromRow<T>(map: ColMap<T>, r: Row): T {
  const out: Record<string, unknown> = {};
  for (const [k, col, kind, dflt] of map) {
    const v = r[col];
    const nil = v === null || v === undefined;
    switch (kind) {
      case 's':
        out[k] = nil ? (dflt ?? '') : String(v);
        break;
      case 'ns':
        out[k] = nil ? null : String(v);
        break;
      case 'n':
        out[k] = nil ? (dflt ?? 0) : Number(v);
        break;
      case 'nn':
        out[k] = nil ? null : Number(v);
        break;
      case 'b':
        out[k] = nil ? Boolean(dflt) : v === true;
        break;
      case 'nb':
        out[k] = nil ? null : v === true;
        break;
      case 't':
        out[k] = nil ? null : new Date(String(v)).toISOString();
        break;
      case 'd':
        out[k] = nil ? null : String(v).slice(0, 10);
        break;
      case 'j':
        out[k] = nil ? (dflt ?? null) : v;
        break;
    }
  }
  return out as T;
}

/** Only the columns for the keys present in `p` (so concurrent writers don't overwrite each other). */
function toRow<T>(map: ColMap<T>, p: Partial<T>): Row {
  const r: Row = {};
  for (const [k, col] of map) if (k in p) r[col] = (p as Record<string, unknown>)[k] ?? null;
  return r;
}

const PROJECT_COLS: ColMap<Project> = [
  ['id', 'id', 's'],
  ['key', 'key', 's'],
  ['taskSeq', 'task_seq', 'n'],
  ['clientName', 'client_name', 's'],
  ['title', 'title', 's'],
  ['status', 'status', 's', 'draft'],
  ['kickoffDate', 'kickoff_date', 'd'],
  ['targetGoLive', 'target_go_live', 'd'],
  ['summaryClient', 'summary_client', 's'],
  ['briefingInternal', 'briefing_internal', 's'],
  ['planMeta', 'plan_meta', 'j'],
  ['clientUpdate', 'client_update', 's'],
  ['clientUpdateAt', 'client_update_at', 't'],
  ['statusDraft', 'status_draft', 'j'],
  ['uatOverride', 'uat_override', 'nb'],
  ['clientContactEmail', 'client_contact_email', 's'],
  ['automations', 'automations', 'j', {}],
  ['tokenHash', 'token_hash', 'ns'],
  ['tokenSealed', 'token_sealed', 'ns'],
  ['shareEnabled', 'share_enabled', 'b'],
  ['createdBy', 'created_by', 's'],
  ['createdAt', 'created_at', 't'],
  ['updatedAt', 'updated_at', 't'],
];
const TASK_COLS: ColMap<Task> = [
  ['id', 'id', 's'],
  ['projectId', 'project_id', 's'],
  ['num', 'num', 'n'],
  ['type', 'type', 's', 'task'],
  ['phase', 'phase', 's'],
  ['title', 'title', 's'],
  ['descriptionClient', 'description_client', 's'],
  ['notesInternal', 'notes_internal', 's'],
  ['ownerSide', 'owner_side', 's', 'us'],
  ['status', 'status', 's', 'todo'],
  ['dueDate', 'due_date', 'd'],
  ['dueOffsetBd', 'due_offset_bd', 'nn'],
  ['deliverableRef', 'deliverable_ref', 's'],
  ['clientVisible', 'client_visible', 'b'],
  ['evidence', 'evidence', 'j', []],
  ['sort', 'sort', 'n'],
  ['source', 'source', 's', 'manual'],
  ['sourceRef', 'source_ref', 's'],
  ['sopKey', 'sop_key', 'ns'],
  ['blockedBy', 'blocked_by', 'ns'],
  ['autoComplete', 'auto_complete', 'b'],
  ['clientMayTick', 'client_may_tick', 'b'],
  ['clientClaimedAt', 'client_claimed_at', 't'],
  ['clientClaimedBy', 'client_claimed_by', 's'],
  ['severity', 'severity', 'ns'],
  ['reportedBy', 'reported_by', 's'],
  ['reportedByClient', 'reported_by_client', 'b'],
  ['reportedAt', 'reported_at', 't'],
  ['steps', 'steps', 's'],
  ['retestConfirmed', 'retest_confirmed', 'b'],
  ['doneAt', 'done_at', 't'],
  ['doneBy', 'done_by', 'ns'],
  ['createdAt', 'created_at', 't'],
  ['updatedAt', 'updated_at', 't'],
];
const EVENT_COLS: ColMap<CpEvent> = [
  ['id', 'id', 's'],
  ['projectId', 'project_id', 's'],
  ['taskId', 'task_id', 'ns'],
  ['actor', 'actor', 's'],
  ['type', 'type', 's'],
  ['detail', 'detail', 'j', {}],
  ['at', 'at', 't'],
];
const COMMENT_COLS: ColMap<CpComment> = [
  ['id', 'id', 's'],
  ['projectId', 'project_id', 's'],
  ['taskId', 'task_id', 's'],
  ['author', 'author', 's'],
  ['body', 'body', 's'],
  ['at', 'at', 't'],
  ['clientVisible', 'client_visible', 'b'],
];
const FILE_COLS: ColMap<CpFileMeta> = [
  ['id', 'id', 's'],
  ['projectId', 'project_id', 's'],
  ['name', 'name', 's'],
  ['size', 'size', 'n'],
  ['sha256', 'sha256', 's'],
  ['pages', 'pages', 'n'],
  ['source', 'source', 's', 'upload'],
  ['createdAt', 'created_at', 't'],
];
const FILE_META = 'id, project_id, name, size, sha256, pages, source, created_at';
const RUN_COLS: ColMap<AiRun> = [
  ['id', 'id', 's'],
  ['projectId', 'project_id', 's'],
  ['status', 'status', 's'],
  ['model', 'model', 's'],
  ['proposal', 'proposal', 'j'],
  ['error', 'error', 'ns'],
  ['fileIds', 'file_ids', 'j', []],
  ['createdAt', 'created_at', 't'],
  ['updatedAt', 'updated_at', 't'],
];

/** bytea over PostgREST: written and read as "\x<hex>". */
const toBytea = (b: Uint8Array) => `\\x${Buffer.from(b).toString('hex')}`;
function fromBytea(v: unknown): Buffer {
  const s = String(v ?? '');
  return s.startsWith('\\x') ? Buffer.from(s.slice(2), 'hex') : Buffer.from(s, 'base64');
}

class SupabaseClientProjectStore implements ClientProjectStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code && MISSING_TABLE.has(res.error.code)) throw new ClientProjectStorageError(res.error.message);
      throw new Error(`[clientProjectStore] ${res.error.message}`);
    }
    return res.data;
  }
  async listProjects() {
    const rows = this.check(await this.db.from('cp_projects').select('*').order('created_at', { ascending: false }).limit(500)) as Row[];
    return rows.map((r) => fromRow(PROJECT_COLS, r));
  }
  async getProject(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_projects').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? fromRow(PROJECT_COLS, r) : null;
  }
  async findByTokenHash(hash: string) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;
    const r = this.check(await this.db.from('cp_projects').select('*').eq('token_hash', hash).maybeSingle()) as Row | null;
    if (!r) return null;
    const p = fromRow(PROJECT_COLS, r);
    const a = Buffer.from(p.tokenHash || '', 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
  }
  async createProject(p: Project) {
    const r = this.check(await this.db.from('cp_projects').insert(toRow(PROJECT_COLS, p)).select().single()) as Row;
    return fromRow(PROJECT_COLS, r);
  }
  async updateProject(id: string, patch: Partial<Project>) {
    if (!isCpId(id)) return null;
    const row = toRow(PROJECT_COLS, patch);
    delete row.id;
    delete row.task_seq;
    const r = this.check(await this.db.from('cp_projects').update({ ...row, updated_at: nowIso() }).eq('id', id).select().maybeSingle()) as Row | null;
    return r ? fromRow(PROJECT_COLS, r) : null;
  }
  async deleteProject(id: string) {
    if (!isCpId(id)) return false;
    const rows = this.check(await this.db.from('cp_projects').delete().eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async nextTaskNums(projectId: string, count: number) {
    const last = this.check(await this.db.rpc('cp_next_task_num', { p_project: projectId, p_count: count })) as unknown;
    const n = Number(last);
    if (!Number.isInteger(n) || n < count) throw new Error('[clientProjectStore] could not reserve issue numbers');
    return n - count + 1;
  }
  async listTasks(projectId: string) {
    if (!isCpId(projectId)) return [];
    const rows = this.check(
      await this.db.from('cp_tasks').select('*').eq('project_id', projectId).order('sort', { ascending: true }).order('num', { ascending: true }).limit(2000),
    ) as Row[];
    return rows.map((r) => fromRow(TASK_COLS, r));
  }
  async listTasksFor(projectIds: string[]) {
    const ids = projectIds.filter(isCpId);
    if (!ids.length) return [];
    const rows = this.check(await this.db.from('cp_tasks').select('*').in('project_id', ids).limit(20000)) as Row[];
    return rows.map((r) => fromRow(TASK_COLS, r));
  }
  async getTask(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_tasks').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? fromRow(TASK_COLS, r) : null;
  }
  async insertTasks(tasks: Task[]) {
    if (!tasks.length) return;
    this.check(await this.db.from('cp_tasks').insert(tasks.map((t) => toRow(TASK_COLS, t))));
  }
  async updateTask(id: string, patch: Partial<Task>) {
    if (!isCpId(id)) return null;
    const row = toRow(TASK_COLS, patch);
    delete row.id;
    delete row.project_id;
    delete row.num;
    const r = this.check(await this.db.from('cp_tasks').update({ ...row, updated_at: nowIso() }).eq('id', id).select().maybeSingle()) as Row | null;
    return r ? fromRow(TASK_COLS, r) : null;
  }
  async deleteTask(id: string) {
    if (!isCpId(id)) return false;
    // Comments cascade and blocked_by is set null by the foreign keys.
    const rows = this.check(await this.db.from('cp_tasks').delete().eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async addEvent(ev: NewEvent, dedupeKey?: string) {
    const res = await this.db
      .from('cp_events')
      .insert({ project_id: ev.projectId, task_id: ev.taskId, actor: ev.actor.slice(0, 200), type: ev.type, detail: ev.detail ?? {}, at: ev.at ?? nowIso(), dedupe_key: dedupeKey ?? null })
      .select()
      .single();
    // Unique (project_id, dedupe_key): this event was already recorded.
    if (res.error?.code === '23505' && dedupeKey) return null;
    return fromRow(EVENT_COLS, this.check(res) as Row);
  }
  async findEvents(projectId: string, q: EventQuery = {}) {
    if (!isCpId(projectId) || (q.taskId && !isCpId(q.taskId))) return [];
    let x = this.db.from('cp_events').select('id, project_id, task_id, actor, type, detail, at').eq('project_id', projectId);
    if (q.type) x = x.eq('type', q.type);
    if (q.actorPrefix) x = x.like('actor', `${q.actorPrefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); // LIKE wildcards in the prefix are escaped
    if (q.since) x = x.gte('at', q.since);
    if (q.taskId) x = x.eq('task_id', q.taskId);
    if (q.rule) x = x.eq('detail->>rule', q.rule);
    const cur = parseCursor(q.before);
    if (cur) x = x.or(`at.lt."${cur.at}",and(at.eq."${cur.at}",id.lt."${cur.id}")`);
    const rows = this.check(await x.order('at', { ascending: false }).order('id', { ascending: false }).limit(pageSize(q.limit, 200, 1000))) as Row[];
    return rows.map((r) => fromRow(EVENT_COLS, r));
  }
  async countEvents(projectId: string, q: Pick<EventQuery, 'actorPrefix' | 'since' | 'type'> = {}) {
    if (!isCpId(projectId)) return 0;
    let x = this.db.from('cp_events').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if (q.type) x = x.eq('type', q.type);
    if (q.actorPrefix) x = x.like('actor', `${q.actorPrefix.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); // LIKE wildcards in the prefix are escaped
    if (q.since) x = x.gte('at', q.since);
    const res = await x;
    this.check(res);
    return res.count ?? 0;
  }
  async settleEvent(id: string, detail: Record<string, unknown>, newDedupeKey?: string) {
    if (!isCpId(id)) return false;
    const cur = this.check(await this.db.from('cp_events').select('detail').eq('id', id).maybeSingle()) as Row | null;
    if (!cur) return false;
    const res = await this.db
      .from('cp_events')
      .update({ detail: { ...((cur.detail as Record<string, unknown>) ?? {}), ...detail }, ...(newDedupeKey ? { dedupe_key: newDedupeKey } : {}) })
      .eq('id', id)
      .select('id');
    // Unique (project_id, dedupe_key): the key we wanted to move to is taken.
    if (res.error?.code === '23505' && newDedupeKey) return false;
    const rows = this.check(res) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async removeEvent(id: string) {
    if (!isCpId(id)) return false;
    const rows = this.check(await this.db.from('cp_events').delete().eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async addComment(c: Omit<CpComment, 'id' | 'at'>) {
    const r = this.check(
      await this.db
        .from('cp_comments')
        .insert({ project_id: c.projectId, task_id: c.taskId, author: c.author, body: c.body, client_visible: c.clientVisible })
        .select()
        .single(),
    ) as Row;
    return fromRow(COMMENT_COLS, r);
  }
  async findComments(projectId: string, q: CommentQuery = {}) {
    if (!isCpId(projectId) || (q.taskId && !isCpId(q.taskId))) return [];
    let query = this.db.from('cp_comments').select('*').eq('project_id', projectId);
    if (q.taskId) query = query.eq('task_id', q.taskId);
    const cur = parseCursor(q.before);
    if (cur) query = query.or(`at.lt."${cur.at}",and(at.eq."${cur.at}",id.lt."${cur.id}")`);
    const rows = this.check(await query.order('at', { ascending: false }).order('id', { ascending: false }).limit(pageSize(q.limit, 200, 2000))) as Row[];
    return rows.map((r) => fromRow(COMMENT_COLS, r));
  }
  async listComments(projectId: string, limit = 2000) {
    return (await this.findComments(projectId, { limit })).reverse();
  }
  async putFile(meta: Omit<CpFileMeta, 'id' | 'createdAt' | 'size' | 'sha256'>, bytes: Uint8Array) {
    const r = this.check(
      await this.db
        .from('cp_files')
        .insert({ project_id: meta.projectId, name: meta.name, pages: meta.pages, source: meta.source, bytes: toBytea(bytes), sha256: sha256Hex(bytes), size: bytes.length })
        .select(FILE_META)
        .single(),
    ) as Row;
    return fromRow(FILE_COLS, r);
  }
  async listFiles(projectId: string) {
    if (!isCpId(projectId)) return [];
    const rows = this.check(await this.db.from('cp_files').select(FILE_META).eq('project_id', projectId).order('created_at', { ascending: true }).limit(100)) as Row[];
    return rows.map((r) => fromRow(FILE_COLS, r));
  }
  async getFileBytes(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_files').select('bytes').eq('id', id).maybeSingle()) as Row | null;
    return r ? fromBytea(r.bytes) : null;
  }
  async deleteFile(id: string) {
    if (!isCpId(id)) return false;
    const rows = this.check(await this.db.from('cp_files').delete().eq('id', id).select('id')) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async createRun(run: AiRun) {
    const r = this.check(await this.db.from('cp_ai_runs').insert(toRow(RUN_COLS, run)).select().single()) as Row;
    return fromRow(RUN_COLS, r);
  }
  async updateRun(id: string, patch: Partial<AiRun>, ifStatus?: AiRunStatus[]) {
    if (!isCpId(id)) return null;
    const row = toRow(RUN_COLS, patch);
    delete row.id;
    delete row.project_id;
    let q = this.db.from('cp_ai_runs').update({ ...row, updated_at: nowIso() }).eq('id', id);
    if (ifStatus) q = q.in('status', ifStatus);
    const r = this.check(await q.select().maybeSingle()) as Row | null;
    return r ? fromRow(RUN_COLS, r) : null;
  }
  async latestRun(projectId: string) {
    if (!isCpId(projectId)) return null;
    const r = this.check(
      await this.db.from('cp_ai_runs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ) as Row | null;
    return r ? fromRow(RUN_COLS, r) : null;
  }
  async getRun(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_ai_runs').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? fromRow(RUN_COLS, r) : null;
  }
}

let store: ClientProjectStore | null = null;
export function getClientProjectStore(): ClientProjectStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseClientProjectStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[clientProjectStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileClientProjectStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
