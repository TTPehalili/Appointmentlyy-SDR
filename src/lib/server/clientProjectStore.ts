/**
 * Server-only storage for Client Projects (the platform owner's onboarding board). Same two backends
 * as agreementStore: Supabase (tables in supabase/migrations/20261121000000_client_projects.sql plus the
 * additive 20261125000000_client_projects_v2.sql) or
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
export const CP_MIGRATION_V2 = 'supabase/migrations/20261125000000_client_projects_v2.sql';

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
  /** Any of these types (v2: the notifications inbox). */
  types?: CpEventType[];
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
export type FileKind = 'doc' | 'attachment' | 'all';
const ofKind = (f: Pick<CpFileMeta, 'taskId'>, kind: FileKind) => kind === 'all' || (kind === 'doc' ? !f.taskId : Boolean(f.taskId));

// Rows written before v2 (file store) or read from a database (nulls) get the v2 defaults here, in one place.
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export function normProject(p: Project): Project {
  return { ...p, automations: p.automations ?? {}, people: arr(p.people), labels: arr(p.labels), settings: p.settings && typeof p.settings === 'object' ? p.settings : {}, notifSeenAt: p.notifSeenAt ?? null };
}
export function normTask(t: Task): Task {
  const blockers = arr<string>(t.blockers).filter((x) => typeof x === 'string');
  // v1 rows carry only blockedBy; v2 keeps blockedBy = the first blocker.
  const all = blockers.length ? blockers : t.blockedBy ? [t.blockedBy] : [];
  return {
    ...t,
    blockers: all,
    blockedBy: all[0] ?? null,
    assigneeId: t.assigneeId ?? null,
    watchers: arr(t.watchers),
    priority: t.priority ?? null,
    labelIds: arr(t.labelIds),
    startDate: t.startDate ?? null,
    checklist: arr(t.checklist),
    estimateHours: t.estimateHours ?? null,
  };
}
export const normFile = (f: CpFileMeta): CpFileMeta => ({ ...f, taskId: f.taskId ?? null, clientVisible: f.clientVisible === true, mime: f.mime || 'application/pdf' });
export const normRun = (r: AiRun): AiRun => ({ ...r, progress: r.progress ?? null });

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
  /**
   * 'doc' (the default, v1 behaviour): the planner documents only. 'attachment': card attachments only.
   * 'all': both. Never the bytes.
   */
  listFiles(projectId: string, kind?: FileKind): Promise<CpFileMeta[]>;
  /** One file's metadata (document or attachment), or null. */
  getFile(id: string): Promise<CpFileMeta | null>;
  /** Attachments: change who may download it. */
  updateFile(id: string, patch: { clientVisible: boolean }): Promise<CpFileMeta | null>;
  getFileBytes(id: string): Promise<Buffer | null>;
  deleteFile(id: string): Promise<boolean>;
  createRun(run: AiRun): Promise<AiRun>;
  /** Patch a run; with `ifStatus`, only while it is still in one of those states (else null). */
  updateRun(id: string, patch: Partial<AiRun>, ifStatus?: AiRunStatus[]): Promise<AiRun | null>;
  latestRun(projectId: string): Promise<AiRun | null>;
  getRun(id: string): Promise<AiRun | null>;

  // ---------------------------------------------------------------- v2 (one round trip each)
  /** The AI progress poll: the latest run's id, status, error, progress and timestamps. One query; no proposal. */
  latestRunProgress(projectId: string): Promise<Pick<AiRun, 'id' | 'status' | 'error' | 'progress' | 'createdAt' | 'updatedAt'> | null>;
  /** "Changed since": the newest event of a project (every change writes one). One query. */
  latestEvent(projectId: string): Promise<{ id: string; at: string } | null>;
  /** Automation firings per rule, grouped in the database (one query; the file store counts in memory). */
  countByRule(projectId: string): Promise<Record<string, number>>;
  /** Comments per card (one query that reads task ids only). */
  commentCounts(projectId: string): Promise<Record<string, number>>;
  /** What a permanent delete would remove (the confirm dialog's inventory). One round trip (parallel counts). */
  countAll(projectId: string): Promise<DeleteCounts>;
  /** A content-free audit row written BEFORE a project is deleted. */
  addDeletion(row: Omit<CpDeletion, 'id' | 'deletedAt'>): Promise<CpDeletion>;
  listDeletions(limit?: number): Promise<CpDeletion[]>;
  /** Is the v2 migration applied? ('v2', or 'v1' when its columns are missing). Cached for a minute. */
  schemaStatus(): Promise<'v2' | 'v1'>;
}

export interface DeleteCounts {
  cards: number;
  comments: number;
  events: number;
  documents: number;
  attachments: number;
  runs: number;
}

export interface CpDeletion {
  id: string;
  projectId: string;
  key: string;
  clientName: string;
  deletedAt: string;
  deletedBy: string;
  cardCount: number;
}

// ------------------------------------------------------------------ file backend

interface FileData {
  projects: Project[];
  tasks: Task[];
  events: (CpEvent & { dedupeKey?: string })[];
  comments: CpComment[];
  files: CpFileMeta[];
  runs: AiRun[];
  deletions: CpDeletion[];
}
const EMPTY = (): FileData => ({ projects: [], tasks: [], events: [], comments: [], files: [], runs: [], deletions: [] });

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
      const d = { ...EMPTY(), ...(JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileData>) };
      d.projects = d.projects.map(normProject);
      d.tasks = d.tasks.map(normTask);
      d.files = d.files.map(normFile);
      d.runs = d.runs.map(normRun);
      return d;
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
      const row = normProject(p);
      d.projects.push(row);
      return row;
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
      // The same rule as the database's unique (project_id, num).
      for (const t of tasks) if (d.tasks.some((x) => x.projectId === t.projectId && x.num === t.num)) throw new Error('[clientProjectStore] duplicate issue number');
      d.tasks.push(...tasks.map(normTask));
    });
  }
  updateTask(id: string, patch: Partial<Task>) {
    return this.mutate((d) => {
      const i = d.tasks.findIndex((t) => t.id === id);
      if (i < 0) return null;
      const next = { ...d.tasks[i], ...patch, id, projectId: d.tasks[i].projectId, num: d.tasks[i].num, updatedAt: nowIso() };
      // blockedBy and blockers are one fact: whichever the caller set wins, and the other follows.
      if ('blockers' in patch) next.blockedBy = arr<string>(patch.blockers)[0] ?? null;
      else if ('blockedBy' in patch) next.blockers = patch.blockedBy ? [patch.blockedBy] : [];
      d.tasks[i] = next;
      return d.tasks[i];
    });
  }
  async deleteTask(id: string) {
    const fileIds: string[] = [];
    const ok = await this.mutate((d) => {
      const n = d.tasks.length;
      d.tasks = d.tasks.filter((t) => t.id !== id);
      if (d.tasks.length === n) return false;
      d.comments = d.comments.filter((c) => c.taskId !== id);
      for (const t of d.tasks) {
        if (!t.blockers.includes(id) && t.blockedBy !== id) continue;
        t.blockers = t.blockers.filter((b) => b !== id);
        t.blockedBy = t.blockers[0] ?? null;
      }
      // The card's attachments go with it.
      fileIds.push(...d.files.filter((f) => f.taskId === id).map((f) => f.id));
      d.files = d.files.filter((f) => f.taskId !== id);
      return true;
    });
    for (const f of fileIds) if (isCpId(f)) fs.rmSync(path.join(this.filesDir, `${f}.bin`), { force: true });
    return ok;
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
        (!q.types || q.types.includes(e.type)) &&
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
    const row: CpFileMeta = normFile({ ...meta, id: newId(), createdAt: nowIso(), size: bytes.length, sha256: sha256Hex(bytes) });
    fs.mkdirSync(this.filesDir, { recursive: true });
    const target = path.join(this.filesDir, `${row.id}.bin`);
    fs.writeFileSync(`${target}.tmp`, bytes);
    fs.renameSync(`${target}.tmp`, target);
    await this.mutate((d) => {
      d.files.push(row);
    });
    return row;
  }
  async listFiles(projectId: string, kind: FileKind = 'doc') {
    return this.read().files.filter((f) => f.projectId === projectId && ofKind(f, kind)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async getFile(id: string) {
    return this.read().files.find((f) => f.id === id) ?? null;
  }
  updateFile(id: string, patch: { clientVisible: boolean }) {
    return this.mutate((d) => {
      const f = d.files.find((x) => x.id === id);
      if (!f) return null;
      f.clientVisible = patch.clientVisible === true;
      return f;
    });
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
      const row = normRun(run);
      d.runs.push(row);
      return row;
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
  async latestRunProgress(projectId: string) {
    const r = await this.latestRun(projectId);
    return r ? { id: r.id, status: r.status, error: r.error, progress: r.progress, createdAt: r.createdAt, updatedAt: r.updatedAt } : null;
  }
  async latestEvent(projectId: string) {
    const e = this.read().events.filter((x) => x.projectId === projectId).sort(newestFirst)[0];
    return e ? { id: e.id, at: e.at } : null;
  }
  async countByRule(projectId: string) {
    const out: Record<string, number> = {};
    for (const e of this.read().events) if (e.projectId === projectId && e.type === 'automation' && typeof e.detail?.rule === 'string') out[e.detail.rule] = (out[e.detail.rule] ?? 0) + 1;
    return out;
  }
  async commentCounts(projectId: string) {
    const out: Record<string, number> = {};
    for (const c of this.read().comments) if (c.projectId === projectId) out[c.taskId] = (out[c.taskId] ?? 0) + 1;
    return out;
  }
  async countAll(projectId: string) {
    const d = this.read();
    const files = d.files.filter((f) => f.projectId === projectId);
    return {
      cards: d.tasks.filter((t) => t.projectId === projectId).length,
      comments: d.comments.filter((c) => c.projectId === projectId).length,
      events: d.events.filter((e) => e.projectId === projectId).length,
      documents: files.filter((f) => !f.taskId).length,
      attachments: files.filter((f) => f.taskId).length,
      runs: d.runs.filter((r) => r.projectId === projectId).length,
    };
  }
  addDeletion(row: Omit<CpDeletion, 'id' | 'deletedAt'>) {
    return this.mutate((d) => {
      const out: CpDeletion = { ...row, id: newId(), deletedAt: nowIso() };
      d.deletions.push(out);
      return out;
    });
  }
  async listDeletions(limit = 100) {
    return [...this.read().deletions].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).slice(0, limit);
  }
  async schemaStatus() {
    return 'v2' as const;
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
  ['people', 'people', 'j', []],
  ['labels', 'labels', 'j', []],
  ['settings', 'settings', 'j', {}],
  ['notifSeenAt', 'notif_seen_at', 't'],
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
  ['blockers', 'blockers', 'j', []],
  ['assigneeId', 'assignee_id', 'ns'],
  ['watchers', 'watchers', 'j', []],
  ['priority', 'priority', 'ns'],
  ['labelIds', 'label_ids', 'j', []],
  ['startDate', 'start_date', 'd'],
  ['checklist', 'checklist', 'j', []],
  ['estimateHours', 'estimate_hours', 'nn'],
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
  ['taskId', 'task_id', 'ns'],
  ['clientVisible', 'client_visible', 'b'],
  ['mime', 'mime', 's', 'application/pdf'],
];
const FILE_META = 'id, project_id, name, size, sha256, pages, source, created_at, task_id, client_visible, mime';
/** The v1 columns: used when the v2 migration has not been run yet, so the documents still list. Never the bytes. */
const FILE_META_V1 = 'id, project_id, name, size, sha256, pages, source, created_at';
/** Postgres "undefined column" and PostgREST "column not found in the schema cache". */
const MISSING_COLUMN = new Set(['42703', 'PGRST204']);
const RUN_COLS: ColMap<AiRun> = [
  ['id', 'id', 's'],
  ['projectId', 'project_id', 's'],
  ['status', 'status', 's'],
  ['model', 'model', 's'],
  ['proposal', 'proposal', 'j'],
  ['error', 'error', 'ns'],
  ['fileIds', 'file_ids', 'j', []],
  ['progress', 'progress', 'j'],
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
  /** null = not known yet; false = the v2 file columns are missing (the v2 migration has not been run). */
  private filesV2: boolean | null = null;
  private schemaAt = 0;
  private schema: 'v2' | 'v1' = 'v2';
  /**
   * File metadata reads: v2 columns, or (once the database says they do not exist) the v1 columns, so the
   * Documents list never goes blank because of a pending migration. Any OTHER error is thrown, never
   * swallowed. Writes of v2 fields still fail loudly (ClientProjectStorageError: run the v2 migration).
   */
  private async fileSelect<T>(run: (cols: string) => PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
    if (this.filesV2 !== false) {
      const res = await run(FILE_META);
      if (!res.error) {
        this.filesV2 = true;
        return res.data;
      }
      if (!(res.error.code && MISSING_COLUMN.has(res.error.code))) return this.check(res);
      this.filesV2 = false;
      console.error(`[clientProjectStore] cp_files has no v2 columns: run ${CP_MIGRATION_V2}. Listing documents with the v1 columns.`);
    }
    return this.check(await run(FILE_META_V1));
  }
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code && MISSING_TABLE.has(res.error.code)) throw new ClientProjectStorageError(res.error.message);
      throw new Error(`[clientProjectStore] ${res.error.message}`);
    }
    return res.data;
  }
  async listProjects() {
    const rows = this.check(await this.db.from('cp_projects').select('*').order('created_at', { ascending: false }).limit(500)) as Row[];
    return rows.map((r) => normProject(fromRow(PROJECT_COLS, r)));
  }
  async getProject(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_projects').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? normProject(fromRow(PROJECT_COLS, r)) : null;
  }
  async findByTokenHash(hash: string) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;
    const r = this.check(await this.db.from('cp_projects').select('*').eq('token_hash', hash).maybeSingle()) as Row | null;
    if (!r) return null;
    const p = normProject(fromRow(PROJECT_COLS, r));
    const a = Buffer.from(p.tokenHash || '', 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
  }
  async createProject(p: Project) {
    const r = this.check(await this.db.from('cp_projects').insert(toRow(PROJECT_COLS, normProject(p))).select().single()) as Row;
    return normProject(fromRow(PROJECT_COLS, r));
  }
  async updateProject(id: string, patch: Partial<Project>) {
    if (!isCpId(id)) return null;
    const row = toRow(PROJECT_COLS, patch);
    delete row.id;
    delete row.task_seq;
    const r = this.check(await this.db.from('cp_projects').update({ ...row, updated_at: nowIso() }).eq('id', id).select().maybeSingle()) as Row | null;
    return r ? normProject(fromRow(PROJECT_COLS, r)) : null;
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
    return rows.map((r) => normTask(fromRow(TASK_COLS, r)));
  }
  async listTasksFor(projectIds: string[]) {
    const ids = projectIds.filter(isCpId);
    if (!ids.length) return [];
    const rows = this.check(await this.db.from('cp_tasks').select('*').in('project_id', ids).limit(20000)) as Row[];
    return rows.map((r) => normTask(fromRow(TASK_COLS, r)));
  }
  async getTask(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_tasks').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? normTask(fromRow(TASK_COLS, r)) : null;
  }
  async insertTasks(tasks: Task[]) {
    if (!tasks.length) return;
    this.check(await this.db.from('cp_tasks').insert(tasks.map((t) => toRow(TASK_COLS, normTask(t)))));
  }
  async updateTask(id: string, patch: Partial<Task>) {
    if (!isCpId(id)) return null;
    const next = { ...patch };
    // blockedBy and blockers are one fact: whichever the caller set wins, and the other follows.
    if ('blockers' in next) next.blockedBy = arr<string>(next.blockers)[0] ?? null;
    else if ('blockedBy' in next) next.blockers = next.blockedBy ? [next.blockedBy] : [];
    const row = toRow(TASK_COLS, next);
    delete row.id;
    delete row.project_id;
    delete row.num;
    const r = this.check(await this.db.from('cp_tasks').update({ ...row, updated_at: nowIso() }).eq('id', id).select().maybeSingle()) as Row | null;
    return r ? normTask(fromRow(TASK_COLS, r)) : null;
  }
  async deleteTask(id: string) {
    if (!isCpId(id)) return false;
    const gone = this.check(await this.db.from('cp_tasks').select('id, project_id').eq('id', id).maybeSingle()) as Row | null;
    if (!gone) return false;
    // Comments and attachments cascade and blocked_by is set null by the foreign keys. The v2 `blockers`
    // list is JSON, so cards that waited on this one are cleaned here (read in the app: no JSON operators).
    const others = this.check(await this.db.from('cp_tasks').select('id, blockers').eq('project_id', String(gone.project_id)).limit(2000)) as Row[];
    for (const o of others) {
      const list = arr<string>(o.blockers);
      if (!list.includes(id)) continue;
      const left = list.filter((b) => b !== id);
      this.check(await this.db.from('cp_tasks').update({ blockers: left, blocked_by: left[0] ?? null }).eq('id', String(o.id)).select('id'));
    }
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
    if (q.types) x = x.in('type', q.types.length ? q.types : ['-']);
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
        .insert({
          project_id: meta.projectId,
          name: meta.name,
          pages: meta.pages,
          source: meta.source,
          bytes: toBytea(bytes),
          sha256: sha256Hex(bytes),
          size: bytes.length,
          task_id: meta.taskId ?? null,
          client_visible: meta.clientVisible === true,
          mime: meta.mime || 'application/pdf',
        })
        .select(FILE_META)
        .single(),
    ) as Row;
    return normFile(fromRow(FILE_COLS, r));
  }
  async listFiles(projectId: string, kind: FileKind = 'doc') {
    if (!isCpId(projectId)) return [];
    const rows = (await this.fileSelect((cols) => {
      let q = this.db.from('cp_files').select(cols).eq('project_id', projectId);
      // Without the v2 columns every row is a v1 planner document (attachments did not exist).
      if (cols === FILE_META && kind === 'doc') q = q.is('task_id', null);
      if (cols === FILE_META && kind === 'attachment') q = q.not('task_id', 'is', null);
      return q.order('created_at', { ascending: true }).limit(500);
    })) as unknown as Row[];
    if (this.filesV2 === false && kind === 'attachment') return [];
    return rows.map((r) => normFile(fromRow(FILE_COLS, r)));
  }
  async getFile(id: string) {
    if (!isCpId(id)) return null;
    const r = (await this.fileSelect((cols) => this.db.from('cp_files').select(cols).eq('id', id).maybeSingle())) as unknown as Row | null;
    return r ? normFile(fromRow(FILE_COLS, r)) : null;
  }
  async updateFile(id: string, patch: { clientVisible: boolean }) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_files').update({ client_visible: patch.clientVisible === true }).eq('id', id).select(FILE_META).maybeSingle()) as Row | null;
    return r ? normFile(fromRow(FILE_COLS, r)) : null;
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
    const r = this.check(await this.db.from('cp_ai_runs').insert(toRow(RUN_COLS, normRun(run))).select().single()) as Row;
    return normRun(fromRow(RUN_COLS, r));
  }
  async updateRun(id: string, patch: Partial<AiRun>, ifStatus?: AiRunStatus[]) {
    if (!isCpId(id)) return null;
    const row = toRow(RUN_COLS, patch);
    delete row.id;
    delete row.project_id;
    let q = this.db.from('cp_ai_runs').update({ ...row, updated_at: nowIso() }).eq('id', id);
    if (ifStatus) q = q.in('status', ifStatus);
    const r = this.check(await q.select().maybeSingle()) as Row | null;
    return r ? normRun(fromRow(RUN_COLS, r)) : null;
  }
  async latestRun(projectId: string) {
    if (!isCpId(projectId)) return null;
    const r = this.check(
      await this.db.from('cp_ai_runs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ) as Row | null;
    return r ? normRun(fromRow(RUN_COLS, r)) : null;
  }
  async getRun(id: string) {
    if (!isCpId(id)) return null;
    const r = this.check(await this.db.from('cp_ai_runs').select('*').eq('id', id).maybeSingle()) as Row | null;
    return r ? normRun(fromRow(RUN_COLS, r)) : null;
  }
  async latestRunProgress(projectId: string) {
    if (!isCpId(projectId)) return null;
    const r = this.check(
      await this.db.from('cp_ai_runs').select('id, status, error, progress, created_at, updated_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ) as Row | null;
    if (!r) return null;
    const run = normRun(fromRow(RUN_COLS, r));
    return { id: run.id, status: run.status, error: run.error, progress: run.progress, createdAt: run.createdAt, updatedAt: run.updatedAt };
  }
  async latestEvent(projectId: string) {
    if (!isCpId(projectId)) return null;
    const r = this.check(await this.db.from('cp_events').select('id, at').eq('project_id', projectId).order('at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()) as Row | null;
    return r ? { id: String(r.id), at: new Date(String(r.at)).toISOString() } : null;
  }
  async countByRule(projectId: string) {
    if (!isCpId(projectId)) return {};
    const res = await this.db.rpc('cp_automation_counts', { p_project: projectId });
    // Before the v2 migration the function does not exist: count from one capped read instead.
    if (res.error && res.error.code && ['PGRST202', '42883'].includes(res.error.code)) {
      const rows = this.check(await this.db.from('cp_events').select('detail').eq('project_id', projectId).eq('type', 'automation').limit(5000)) as Row[];
      const out: Record<string, number> = {};
      for (const r of rows) {
        const rule = (r.detail as Record<string, unknown> | null)?.rule;
        if (typeof rule === 'string') out[rule] = (out[rule] ?? 0) + 1;
      }
      return out;
    }
    const rows = this.check(res) as { rule: string | null; n: number | string }[] | null;
    return Object.fromEntries((rows ?? []).filter((r) => r.rule).map((r) => [r.rule as string, Number(r.n)]));
  }
  async commentCounts(projectId: string) {
    if (!isCpId(projectId)) return {};
    const rows = this.check(await this.db.from('cp_comments').select('task_id').eq('project_id', projectId).limit(20000)) as Row[];
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r.task_id)] = (out[String(r.task_id)] ?? 0) + 1;
    return out;
  }
  async countAll(projectId: string) {
    if (!isCpId(projectId)) return { cards: 0, comments: 0, events: 0, documents: 0, attachments: 0, runs: 0 };
    const head = (table: string) => this.db.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    const v2 = this.filesV2 !== false;
    const [cards, comments, events, docs, atts, runs] = await Promise.all([
      head('cp_tasks'),
      head('cp_comments'),
      head('cp_events'),
      v2 ? head('cp_files').is('task_id', null) : head('cp_files'),
      v2 ? head('cp_files').not('task_id', 'is', null) : Promise.resolve({ count: 0, error: null }),
      head('cp_ai_runs'),
    ]);
    const n = (r: { count: number | null; error: { message: string; code?: string } | null }) => {
      this.check({ data: null, error: r.error });
      return r.count ?? 0;
    };
    return { cards: n(cards), comments: n(comments), events: n(events), documents: n(docs), attachments: n(atts), runs: n(runs) };
  }
  async addDeletion(row: Omit<CpDeletion, 'id' | 'deletedAt'>) {
    const r = this.check(
      await this.db.from('cp_deletions').insert({ project_id: row.projectId, key: row.key, client_name: row.clientName, deleted_by: row.deletedBy, card_count: row.cardCount }).select().single(),
    ) as Row;
    return { id: String(r.id), projectId: String(r.project_id), key: String(r.key), clientName: String(r.client_name), deletedAt: new Date(String(r.deleted_at)).toISOString(), deletedBy: String(r.deleted_by), cardCount: Number(r.card_count) };
  }
  async listDeletions(limit = 100) {
    const rows = this.check(await this.db.from('cp_deletions').select('*').order('deleted_at', { ascending: false }).limit(limit)) as Row[];
    return rows.map((r) => ({ id: String(r.id), projectId: String(r.project_id), key: String(r.key), clientName: String(r.client_name), deletedAt: new Date(String(r.deleted_at)).toISOString(), deletedBy: String(r.deleted_by), cardCount: Number(r.card_count) }));
  }
  async schemaStatus() {
    if (Date.now() - this.schemaAt < 60_000) return this.schema;
    // One cheap probe of a v2 column on each table v2 writes to.
    const [a, b, c] = await Promise.all([
      this.db.from('cp_projects').select('people').limit(1),
      this.db.from('cp_tasks').select('blockers').limit(1),
      this.db.from('cp_files').select('task_id').limit(1),
    ]);
    const missing = [a, b, c].some((r) => r.error && r.error.code && MISSING_COLUMN.has(r.error.code));
    for (const r of [a, b, c]) if (r.error && !(r.error.code && MISSING_COLUMN.has(r.error.code))) this.check(r);
    this.schema = missing ? 'v1' : 'v2';
    if (missing) this.filesV2 = false;
    this.schemaAt = Date.now();
    return this.schema;
  }
}

/** For the store contract test (tools/cp_store_contract.cjs): the same classes the app uses, on a given directory or client. */
export const createFileClientProjectStore = (dir: string): ClientProjectStore => new FileClientProjectStore(dir);
export const createSupabaseClientProjectStore = (db: SupabaseClient): ClientProjectStore => new SupabaseClientProjectStore(db);

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
