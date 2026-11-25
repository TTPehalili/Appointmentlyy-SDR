/**
 * Server-only storage for support tickets ("Report a problem", Admin › Support, Platform › Support). Replaces the old
 * .tickets.json in the app folder, which Railway wiped on every deploy.
 *
 * Two backends, like leadHandoffStore.ts: Supabase (tables in supabase/migrations/20261130000000_support_tickets.sql),
 * or JSON files in TENANCY_DATA_DIR (support_tickets.json + support_ticket_attachments.json) used ONLY when Supabase
 * is not configured (local test servers).
 *
 * Who may see what is decided in ticketScope.ts; every list here takes that scope and always filters by it in the
 * query itself, so a filter can only narrow the result, never widen it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  TicketAttachmentMeta,
  TicketCategory,
  TicketMessage,
  TicketPriority,
  TicketSource,
  TicketStatus,
  TicketUrgency,
  TroubleTicket,
} from '@/lib/ticketTypes';
import type { SupportContext } from '@/lib/supportReport';

export interface NewTicketInput {
  tenantCode: string;
  tenantName: string;
  requesterEmail: string;
  requesterName: string;
  requesterRole: string;
  filedByEmail: string | null;
  subject: string;
  description: string;
  tried: string;
  area: string;
  urgency: TicketUrgency | null;
  category: TicketCategory;
  priority: TicketPriority;
  source: TicketSource;
  context: SupportContext | null;
  assignedTo: string;
}

export interface NewMessageInput {
  /** Optional UUID chosen by the caller, so it can pick out exactly this message afterwards (never "the last one"). */
  id?: string;
  senderName: string;
  senderEmail: string;
  senderRole: 'customer' | 'admin' | 'system';
  isInternalNote: boolean;
  content: string;
}

export interface TicketPatch {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
}

export interface NewAttachmentInput {
  mime: TicketAttachmentMeta['mime'];
  size: number;
  width: number;
  height: number;
  sha256: string;
  /** base64 of the checked, rebuilt bytes. */
  data: string;
  uploadedBy: string;
}

export interface StoredAttachment extends TicketAttachmentMeta {
  ticketId: string;
  sha256: string;
  data: string;
  uploadedBy: string;
}

export type TicketScope = { kind: 'all' } | { kind: 'workspace'; tenantCode: string } | { kind: 'own'; tenantCode: string; email: string };

export interface TicketListFilter {
  tenantCode?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  requesterEmail?: string;
  limit: number;
}

/** The tables aren't there yet (migration not run). */
export class SupportStorageError extends Error {}

/**
 * Durable screenshot caps, counted from the stored rows themselves (so they hold across restarts, deploys and server
 * instances). The workspace is the ticket's own tenant_code, read from the database, never from the request.
 */
export interface AttachmentQuota {
  /** Screenshots on one report. */
  perTicket: number;
  /** Screenshots one person may add in their workspace in any 24 hours. */
  userPerDay: number;
  /** Screenshots, and their stored bytes, one workspace may add in any 30 days. */
  workspaceShots: number;
  workspaceBytes: number;
}
/** What a workspace (and the uploader in it) has stored: the last 30 days, and the uploader's last 24 hours. */
export interface ShotUsage {
  workspaceShots: number;
  workspaceBytes: number;
  userShotsToday: number;
}
export type QuotaRefusal = 'ticket_full' | 'user_daily' | 'workspace_shots' | 'workspace_bytes';
export type AddAttachmentResult =
  | { ok: true; attachment: TicketAttachmentMeta; tenantCode: string; usage: ShotUsage }
  | { ok: false; reason: 'not_found' | QuotaRefusal };

export const DAY_MS = 86_400_000;
export const QUOTA_WINDOW_MS = 30 * DAY_MS;

/**
 * Which cap `usage` breaks once `adding` more screenshots/bytes are stored, or null. Before the insert pass what is
 * about to be stored; after it (the row is already counted) pass zeros, so a racing upload that went over is caught.
 */
export function quotaBreach(usage: ShotUsage, q: AttachmentQuota, adding: { shots: number; bytes: number }): QuotaRefusal | null {
  if (usage.userShotsToday + adding.shots > q.userPerDay) return 'user_daily';
  if (usage.workspaceShots + adding.shots > q.workspaceShots) return 'workspace_shots';
  if (usage.workspaceBytes + adding.bytes > q.workspaceBytes) return 'workspace_bytes';
  return null;
}

export interface SupportTicketStore {
  readonly backend: 'supabase' | 'file';
  create(input: NewTicketInput, first: NewMessageInput): Promise<TroubleTicket>;
  list(scope: TicketScope, filter: TicketListFilter): Promise<TroubleTicket[]>;
  get(id: string): Promise<TroubleTicket | null>;
  update(id: string, patch: TicketPatch, audit: NewMessageInput | null): Promise<TroubleTicket | null>;
  addMessage(id: string, msg: NewMessageInput, status: TicketStatus | null): Promise<TroubleTicket | null>;
  /** Stores a screenshot unless the ticket is full or a durable quota (AttachmentQuota) would be passed. */
  addAttachment(ticketId: string, att: NewAttachmentInput, quota: AttachmentQuota): Promise<AddAttachmentResult>;
  getAttachment(ticketId: string, attachmentId: string): Promise<StoredAttachment | null>;
  /**
   * Retention: deletes at most `limit` screenshot rows created before `beforeIso` (nothing else is ever deleted), then
   * leaves `note(ticketId)` once on each report that lost screenshots. Returns how many screenshots were deleted.
   */
  pruneScreenshots(beforeIso: string, limit: number, note: (ticketId: string) => NewMessageInput & { id: string }): Promise<number>;
  /**
   * Durable once-only system note: adds `note` (with its fixed id) to the ticket unless that id already exists, or the
   * workspace already has a system note starting with `prefix` created since `sinceIso`. True only for the call that
   * added it, so racing callers and other servers cannot both act on it.
   */
  claimWorkspaceNote(tenantCode: string, ticketId: string, note: NewMessageInput & { id: string }, prefix: string, sinceIso: string): Promise<boolean>;
}

// ------------------------------------------------------------------ ids

const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
/** "TKT-2611-4F7Q": year and month, then random letters/digits without 0/O/1/I. */
export function newTicketId(now = new Date(), len = 4): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  let s = '';
  for (let i = 0; i < len; i++) s += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
  return `TKT-${yy}${mm}-${s}`;
}
/** New ids, and the older "TKT-2026-1042" shape. Anything else is rejected before it reaches a query. */
export const TICKET_ID_RE = /^TKT-\d{4}-[0-9A-Z]{4,8}$/;
export const normalizeTicketId = (id: unknown): string | null => {
  const s = typeof id === 'string' ? id.trim().toUpperCase() : '';
  return TICKET_ID_RE.test(s) ? s : null;
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAttachmentId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);
/** Four random characters first; longer ids if a month ever gets crowded. */
const idLengthFor = (attempt: number) => (attempt < 5 ? 4 : 6);
const MAX_ID_ATTEMPTS = 8;

const lower = (s: string) => s.trim().toLowerCase();
const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ file backend (local tests only)

interface FileTicket extends Omit<TroubleTicket, 'messages' | 'attachments' | 'attachmentCount'> {
  filedByEmail: string | null;
}
interface FileData {
  tickets: FileTicket[];
  messages: TicketMessage[];
  attachments: Omit<StoredAttachment, 'data'>[];
}

class FileSupportTicketStore implements SupportTicketStore {
  readonly backend = 'file' as const;
  private file: string;
  private blobFile: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dir: string) {
    this.file = path.join(dir, 'support_tickets.json');
    this.blobFile = path.join(dir, 'support_ticket_attachments.json');
  }
  private readJson<T>(file: string, empty: T): T {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return empty;
      throw err;
    }
  }
  private writeJson(file: string, data: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, file);
  }
  private read(): FileData {
    const d = this.readJson<Partial<FileData>>(this.file, {});
    return { tickets: d.tickets ?? [], messages: d.messages ?? [], attachments: d.attachments ?? [] };
  }
  private mutate<T>(fn: (d: FileData) => T, changed: (out: T) => boolean = () => true): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      if (changed(out)) this.writeJson(this.file, d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  private assemble(d: FileData, t: FileTicket): TroubleTicket {
    const messages = d.messages.filter((m) => m.ticketId === t.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const attachments = d.attachments
      .filter((a) => a.ticketId === t.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a) => ({ id: a.id, mime: a.mime, size: a.size, width: a.width, height: a.height, createdAt: a.createdAt }));
    return { ...t, messages, attachments, attachmentCount: attachments.length };
  }
  create(input: NewTicketInput, first: NewMessageInput) {
    return this.mutate((d) => {
      let id = '';
      for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !id; attempt++) {
        const candidate = newTicketId(new Date(), idLengthFor(attempt));
        if (!d.tickets.some((t) => t.id === candidate)) id = candidate;
      }
      if (!id) throw new Error('[supportTickets] could not allocate a ticket id');
      const at = nowIso();
      const t: FileTicket = { id, ...input, requesterEmail: lower(input.requesterEmail), status: 'open', createdAt: at, updatedAt: at };
      d.tickets.push(t);
      d.messages.push({ ...first, id: first.id || crypto.randomUUID(), ticketId: id, createdAt: at });
      return this.assemble(d, t);
    });
  }
  async list(scope: TicketScope, f: TicketListFilter) {
    const d = this.read();
    return d.tickets
      .filter((t) => scope.kind === 'all' || t.tenantCode === scope.tenantCode)
      .filter((t) => scope.kind !== 'own' || t.requesterEmail === lower(scope.email))
      .filter((t) => !f.tenantCode || t.tenantCode === f.tenantCode)
      .filter((t) => !f.status || t.status === f.status)
      .filter((t) => !f.priority || t.priority === f.priority)
      .filter((t) => !f.requesterEmail || t.requesterEmail === lower(f.requesterEmail))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, f.limit)
      .map((t) => this.assemble(d, t));
  }
  async get(id: string) {
    const d = this.read();
    const t = d.tickets.find((x) => x.id === id);
    return t ? this.assemble(d, t) : null;
  }
  update(id: string, patch: TicketPatch, audit: NewMessageInput | null) {
    return this.mutate((d) => {
      const t = d.tickets.find((x) => x.id === id);
      if (!t) return null;
      const at = nowIso();
      if (patch.status) {
        t.resolvedAt = patch.status === 'resolved' ? t.resolvedAt || at : undefined;
        t.status = patch.status;
      }
      if (patch.priority) t.priority = patch.priority;
      if (patch.assignedTo !== undefined) t.assignedTo = patch.assignedTo;
      t.updatedAt = at;
      if (audit) d.messages.push({ ...audit, id: audit.id || crypto.randomUUID(), ticketId: id, createdAt: at });
      return this.assemble(d, t);
    });
  }
  addMessage(id: string, msg: NewMessageInput, status: TicketStatus | null) {
    return this.mutate((d) => {
      const t = d.tickets.find((x) => x.id === id);
      if (!t) return null;
      const at = nowIso();
      d.messages.push({ ...msg, id: msg.id || crypto.randomUUID(), ticketId: id, createdAt: at });
      if (status) t.status = status;
      t.updatedAt = at;
      return this.assemble(d, t);
    });
  }
  /** The same counts as the Supabase backend: the ticket's workspace over 30 days, the uploader's last 24 hours. */
  private usage(d: FileData, tenantCode: string, uploader: string, now: number): ShotUsage {
    const inTenant = new Set(d.tickets.filter((t) => t.tenantCode === tenantCode).map((t) => t.id));
    const me = lower(uploader);
    const u: ShotUsage = { workspaceShots: 0, workspaceBytes: 0, userShotsToday: 0 };
    for (const a of d.attachments) {
      const at = Date.parse(a.createdAt);
      if (!inTenant.has(a.ticketId) || !(at >= now - QUOTA_WINDOW_MS)) continue;
      u.workspaceShots++;
      u.workspaceBytes += Number(a.size) || 0;
      if (lower(a.uploadedBy || '') === me && at >= now - DAY_MS) u.userShotsToday++;
    }
    return u;
  }
  addAttachment(ticketId: string, att: NewAttachmentInput, quota: AttachmentQuota) {
    // One queue for every write: the checks and the insert cannot interleave with another upload in this process.
    const run = this.queue.then((): AddAttachmentResult => {
      const d = this.read();
      const t = d.tickets.find((x) => x.id === ticketId);
      if (!t) return { ok: false, reason: 'not_found' };
      if (d.attachments.filter((a) => a.ticketId === ticketId).length >= quota.perTicket) return { ok: false, reason: 'ticket_full' };
      const before = this.usage(d, t.tenantCode, att.uploadedBy, Date.now());
      const breach = quotaBreach(before, quota, { shots: 1, bytes: att.size });
      if (breach) return { ok: false, reason: breach };
      const { data, ...meta } = att;
      const row = { id: crypto.randomUUID(), ticketId, ...meta, createdAt: nowIso() };
      const blobs = this.readJson<Record<string, string>>(this.blobFile, {});
      blobs[row.id] = data;
      this.writeJson(this.blobFile, blobs);
      d.attachments.push(row);
      this.writeJson(this.file, d);
      return {
        ok: true,
        attachment: { id: row.id, mime: row.mime, size: row.size, width: row.width, height: row.height, createdAt: row.createdAt },
        tenantCode: t.tenantCode,
        usage: { workspaceShots: before.workspaceShots + 1, workspaceBytes: before.workspaceBytes + row.size, userShotsToday: before.userShotsToday + 1 },
      };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  pruneScreenshots(beforeIso: string, limit: number, note: (ticketId: string) => NewMessageInput & { id: string }) {
    const cutoff = Date.parse(beforeIso);
    return this.mutate((d) => {
      const old = d.attachments
        .filter((a) => Date.parse(a.createdAt) < cutoff)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, Math.max(0, limit));
      if (!old.length) return 0;
      const gone = new Set(old.map((a) => a.id));
      d.attachments = d.attachments.filter((a) => !gone.has(a.id));
      const blobs = this.readJson<Record<string, string>>(this.blobFile, {});
      for (const id of gone) delete blobs[id];
      this.writeJson(this.blobFile, blobs);
      const at = nowIso();
      for (const ticketId of new Set(old.map((a) => a.ticketId))) {
        const m = note(ticketId);
        if (!d.messages.some((x) => x.id === m.id)) d.messages.push({ ...m, ticketId, createdAt: at });
      }
      return gone.size;
    }, (n) => n > 0);
  }
  claimWorkspaceNote(tenantCode: string, ticketId: string, note: NewMessageInput & { id: string }, prefix: string, sinceIso: string) {
    const since = Date.parse(sinceIso);
    return this.mutate((d) => {
      if (!d.tickets.some((t) => t.id === ticketId && t.tenantCode === tenantCode)) return false;
      if (d.messages.some((m) => m.id === note.id)) return false;
      const inTenant = new Set(d.tickets.filter((t) => t.tenantCode === tenantCode).map((t) => t.id));
      const prior = d.messages.some(
        (m) => inTenant.has(m.ticketId) && m.senderRole === 'system' && m.isInternalNote && m.content.startsWith(prefix) && Date.parse(m.createdAt) >= since,
      );
      if (prior) return false;
      d.messages.push({ ...note, ticketId, createdAt: nowIso() });
      return true;
    }, (added) => added);
  }
  async getAttachment(ticketId: string, attachmentId: string) {
    const meta = this.read().attachments.find((a) => a.ticketId === ticketId && a.id === attachmentId);
    if (!meta) return null;
    const data = this.readJson<Record<string, string>>(this.blobFile, {})[attachmentId];
    return data ? { ...meta, data } : null;
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const T_TICKETS = 'support_tickets';
const T_MESSAGES = 'support_ticket_messages';
const T_ATTACH = 'support_ticket_attachments';
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST204', 'PGRST200', '42703']);
const MSG_COLS = 'id, ticket_id, sender_name, sender_email, sender_role, is_internal_note, content, created_at';
const ATT_COLS = 'id, ticket_id, mime, size, width, height, created_at';
const FULL_SELECT = `*, ${T_MESSAGES}(${MSG_COLS}), ${T_ATTACH}(${ATT_COLS})`;
/** Quota reads: 1000 rows a page (Supabase's default max-rows), at most 10 pages. Retention deletes in chunks of 50 ids. */
const USAGE_PAGE = 1000;
const USAGE_MAX_PAGES = 10;
const PRUNE_CHUNK = 50;

const msgFromRow = (r: Row): TicketMessage => ({
  id: String(r.id),
  ticketId: String(r.ticket_id),
  senderName: String(r.sender_name ?? ''),
  senderEmail: String(r.sender_email ?? ''),
  senderRole: (['customer', 'admin', 'system'].includes(String(r.sender_role)) ? r.sender_role : 'customer') as TicketMessage['senderRole'],
  isInternalNote: r.is_internal_note === true,
  content: String(r.content ?? ''),
  createdAt: String(r.created_at),
});
const attFromRow = (r: Row): TicketAttachmentMeta => ({
  id: String(r.id),
  mime: String(r.mime) as TicketAttachmentMeta['mime'],
  size: Number(r.size ?? 0),
  width: Number(r.width ?? 0),
  height: Number(r.height ?? 0),
  createdAt: String(r.created_at),
});
const ticketFromRow = (r: Row): TroubleTicket => {
  const messages = (Array.isArray(r[T_MESSAGES]) ? (r[T_MESSAGES] as Row[]) : []).map(msgFromRow).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const attachments = (Array.isArray(r[T_ATTACH]) ? (r[T_ATTACH] as Row[]) : []).map(attFromRow).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    id: String(r.id),
    tenantCode: String(r.tenant_code),
    tenantName: String(r.tenant_name ?? ''),
    requesterEmail: String(r.requester_email ?? ''),
    requesterName: String(r.requester_name ?? ''),
    requesterRole: String(r.requester_role ?? ''),
    filedByEmail: r.filed_by_email ? String(r.filed_by_email) : null,
    subject: String(r.subject ?? ''),
    description: String(r.description ?? ''),
    tried: String(r.tried ?? ''),
    area: String(r.area ?? ''),
    urgency: (r.urgency ? String(r.urgency) : null) as TicketUrgency | null,
    category: String(r.category ?? 'bug_general') as TicketCategory,
    priority: String(r.priority ?? 'medium') as TicketPriority,
    status: String(r.status ?? 'open') as TicketStatus,
    source: String(r.source ?? 'report') as TicketSource,
    context: r.context && typeof r.context === 'object' && Object.keys(r.context as object).length ? (r.context as SupportContext) : null,
    assignedTo: String(r.assigned_to ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : undefined,
    messages,
    attachments,
    attachmentCount: attachments.length,
  };
};
const msgRow = (ticketId: string, m: NewMessageInput) => ({
  ...(m.id ? { id: m.id } : {}),
  ticket_id: ticketId,
  sender_name: m.senderName,
  sender_email: m.senderEmail,
  sender_role: m.senderRole,
  is_internal_note: m.isInternalNote,
  content: m.content,
});

class SupabaseSupportTicketStore implements SupportTicketStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.code && MISSING_TABLE.has(res.error.code)) throw new SupportStorageError(res.error.message);
      throw new Error(`[supportTickets] ${res.error.message}`);
    }
    return res.data;
  }
  async create(input: NewTicketInput, first: NewMessageInput) {
    const row = {
      tenant_code: input.tenantCode,
      tenant_name: input.tenantName,
      requester_email: lower(input.requesterEmail),
      requester_name: input.requesterName,
      requester_role: input.requesterRole,
      filed_by_email: input.filedByEmail,
      subject: input.subject,
      description: input.description,
      tried: input.tried,
      area: input.area,
      urgency: input.urgency,
      category: input.category,
      priority: input.priority,
      status: 'open',
      source: input.source,
      assigned_to: input.assignedTo,
      context: input.context ?? {},
    };
    let id = '';
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !id; attempt++) {
      const candidate = newTicketId(new Date(), idLengthFor(attempt));
      const res = await this.db.from(T_TICKETS).insert({ id: candidate, ...row });
      if (!res.error) id = candidate;
      else if (res.error.code !== '23505') this.check(res); // throws; 23505 = that id is taken, try another
    }
    if (!id) throw new Error('[supportTickets] could not allocate a ticket id');
    const m = await this.db.from(T_MESSAGES).insert(msgRow(id, first));
    if (m.error) {
      await this.db.from(T_TICKETS).delete().eq('id', id);
      this.check(m);
    }
    const t = await this.get(id);
    if (!t) throw new Error('[supportTickets] ticket vanished after insert');
    return t;
  }
  async list(scope: TicketScope, f: TicketListFilter) {
    let q = this.db.from(T_TICKETS).select(FULL_SELECT);
    if (scope.kind !== 'all') q = q.eq('tenant_code', scope.tenantCode);
    if (scope.kind === 'own') q = q.eq('requester_email', lower(scope.email));
    if (f.tenantCode) q = q.eq('tenant_code', f.tenantCode);
    if (f.status) q = q.eq('status', f.status);
    if (f.priority) q = q.eq('priority', f.priority);
    if (f.requesterEmail) q = q.eq('requester_email', lower(f.requesterEmail));
    const rows = this.check(await q.order('created_at', { ascending: false }).limit(f.limit)) as Row[];
    return rows.map(ticketFromRow);
  }
  async get(id: string) {
    const r = this.check(await this.db.from(T_TICKETS).select(FULL_SELECT).eq('id', id).maybeSingle()) as Row | null;
    return r ? ticketFromRow(r) : null;
  }
  async update(id: string, patch: TicketPatch, audit: NewMessageInput | null) {
    const at = nowIso();
    const set: Row = { updated_at: at };
    if (patch.status) {
      set.status = patch.status;
      if (patch.status !== 'resolved') set.resolved_at = null;
    }
    if (patch.priority) set.priority = patch.priority;
    if (patch.assignedTo !== undefined) set.assigned_to = patch.assignedTo;
    const updated = this.check(await this.db.from(T_TICKETS).update(set).eq('id', id).select('id, resolved_at')) as Row[];
    if (!updated.length) return null;
    if (patch.status === 'resolved' && !updated[0].resolved_at) this.check(await this.db.from(T_TICKETS).update({ resolved_at: at }).eq('id', id));
    if (audit) this.check(await this.db.from(T_MESSAGES).insert(msgRow(id, audit)));
    return this.get(id);
  }
  async addMessage(id: string, msg: NewMessageInput, status: TicketStatus | null) {
    const exists = this.check(await this.db.from(T_TICKETS).select('id').eq('id', id).maybeSingle()) as Row | null;
    if (!exists) return null;
    this.check(await this.db.from(T_MESSAGES).insert(msgRow(id, msg)));
    this.check(await this.db.from(T_TICKETS).update({ updated_at: nowIso(), ...(status ? { status } : {}) }).eq('id', id));
    return this.get(id);
  }
  private async ticketShotCount(ticketId: string): Promise<number> {
    const { count, error } = await this.db.from(T_ATTACH).select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId);
    if (error) this.check({ data: null, error });
    return count ?? 0;
  }
  /**
   * The workspace's screenshots of the last 30 days (only id, size, uploader and time: never the image data), joined to
   * their tickets for the workspace, summed here. No new SQL: a PostgREST inner-join select, paged, with an exact
   * count so a lower max-rows setting cannot make it undercount. Too many rows to page through counts as full.
   */
  private async usage(tenantCode: string, uploader: string, now: number): Promise<ShotUsage> {
    const since = new Date(now - QUOTA_WINDOW_MS).toISOString();
    const me = lower(uploader);
    const u: ShotUsage = { workspaceShots: 0, workspaceBytes: 0, userShotsToday: 0 };
    let seen = 0;
    let total = 0;
    for (let page = 0; page < USAGE_MAX_PAGES; page++) {
      const res = await this.db
        .from(T_ATTACH)
        .select(`id, size, uploaded_by, created_at, ${T_TICKETS}!inner(tenant_code)`, { count: 'exact' })
        .eq(`${T_TICKETS}.tenant_code`, tenantCode)
        .gte('created_at', since)
        .order('id', { ascending: true })
        .range(seen, seen + USAGE_PAGE - 1);
      const rows = (this.check(res) as Row[] | null) ?? [];
      total = res.count ?? total;
      for (const r of rows) {
        u.workspaceBytes += Number(r.size) || 0;
        if (lower(String(r.uploaded_by ?? '')) === me && Date.parse(String(r.created_at)) >= now - DAY_MS) u.userShotsToday++;
      }
      seen += rows.length;
      if (!rows.length || seen >= total) {
        u.workspaceShots = Math.max(total, seen);
        return u;
      }
    }
    // More rows than we are willing to read for one upload: fail closed (the workspace cap is far below this).
    return { workspaceShots: Number.MAX_SAFE_INTEGER, workspaceBytes: Number.MAX_SAFE_INTEGER, userShotsToday: u.userShotsToday };
  }
  async addAttachment(ticketId: string, att: NewAttachmentInput, quota: AttachmentQuota): Promise<AddAttachmentResult> {
    const t = this.check(await this.db.from(T_TICKETS).select('id, tenant_code').eq('id', ticketId).maybeSingle()) as Row | null;
    if (!t) return { ok: false, reason: 'not_found' };
    const tenantCode = String(t.tenant_code);
    if ((await this.ticketShotCount(ticketId)) >= quota.perTicket) return { ok: false, reason: 'ticket_full' };
    const breach = quotaBreach(await this.usage(tenantCode, att.uploadedBy, Date.now()), quota, { shots: 1, bytes: att.size });
    if (breach) return { ok: false, reason: breach };
    const r = this.check(
      await this.db
        .from(T_ATTACH)
        .insert({ ticket_id: ticketId, mime: att.mime, size: att.size, width: att.width, height: att.height, sha256: att.sha256, data: att.data, uploaded_by: att.uploadedBy })
        .select(ATT_COLS)
        .single(),
    ) as Row;
    // The checks above and the insert are separate requests: uploads racing each other (on any server) could all pass
    // the same counts. Count again with this row included; if any cap is now passed, take this row back. Racing
    // uploads may then all be refused, but together they can never go over a cap.
    const takeBack = async (reason: QuotaRefusal): Promise<AddAttachmentResult> => {
      await this.db.from(T_ATTACH).delete().eq('id', String(r.id)).eq('ticket_id', ticketId);
      return { ok: false, reason };
    };
    if ((await this.ticketShotCount(ticketId)) > quota.perTicket) return takeBack('ticket_full');
    const usage = await this.usage(tenantCode, att.uploadedBy, Date.now());
    const over = quotaBreach(usage, quota, { shots: 0, bytes: 0 });
    if (over) return takeBack(over);
    return { ok: true, attachment: attFromRow(r), tenantCode, usage };
  }
  async pruneScreenshots(beforeIso: string, limit: number, note: (ticketId: string) => NewMessageInput & { id: string }) {
    const old = this.check(
      await this.db.from(T_ATTACH).select('id, ticket_id').lt('created_at', beforeIso).order('created_at', { ascending: true }).limit(Math.max(0, limit)),
    ) as Row[];
    if (!old.length) return 0;
    const ids = old.map((r) => String(r.id));
    const touched = new Set<string>();
    let removed = 0;
    for (let i = 0; i < ids.length; i += PRUNE_CHUNK) {
      // Only screenshot rows, only these ids, and only if still older than the cutoff.
      const gone = this.check(
        await this.db.from(T_ATTACH).delete().in('id', ids.slice(i, i + PRUNE_CHUNK)).lt('created_at', beforeIso).select('id, ticket_id'),
      ) as Row[];
      removed += gone.length;
      for (const g of gone) touched.add(String(g.ticket_id));
    }
    if (touched.size) {
      // One note per report (fixed id per ticket, so a second run adds nothing). A failure here is only cosmetic.
      const notes = [...touched].map((tid) => msgRow(tid, note(tid)));
      const res = await this.db.from(T_MESSAGES).upsert(notes, { onConflict: 'id', ignoreDuplicates: true });
      if (res.error) console.warn('[supportTickets] retention note not saved:', res.error.message);
    }
    return removed;
  }
  async claimWorkspaceNote(tenantCode: string, ticketId: string, note: NewMessageInput & { id: string }, prefix: string, sinceIso: string) {
    const prior = this.check(
      await this.db
        .from(T_MESSAGES)
        .select(`id, ${T_TICKETS}!inner(tenant_code)`)
        .eq(`${T_TICKETS}.tenant_code`, tenantCode)
        .eq('sender_role', 'system')
        .eq('is_internal_note', true)
        .like('content', `${prefix}%`)
        .gte('created_at', sinceIso)
        .limit(1),
    ) as Row[];
    if (prior.length) return false;
    const t = this.check(await this.db.from(T_TICKETS).select('id').eq('id', ticketId).eq('tenant_code', tenantCode).maybeSingle()) as Row | null;
    if (!t) return false;
    const ins = await this.db.from(T_MESSAGES).insert(msgRow(ticketId, note));
    if (ins.error?.code === '23505') return false; // another request or server added it first
    this.check(ins);
    return true;
  }
  async getAttachment(ticketId: string, attachmentId: string) {
    const r = this.check(await this.db.from(T_ATTACH).select('*').eq('ticket_id', ticketId).eq('id', attachmentId).maybeSingle()) as Row | null;
    if (!r) return null;
    return { ...attFromRow(r), ticketId: String(r.ticket_id), sha256: String(r.sha256 ?? ''), data: String(r.data ?? ''), uploadedBy: String(r.uploaded_by ?? '') };
  }
}

let store: SupportTicketStore | null = null;
export function getSupportTicketStore(): SupportTicketStore {
  if (store) return store;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseSupportTicketStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[supportTickets] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileSupportTicketStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  return store;
}
