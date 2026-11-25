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

export interface SupportTicketStore {
  readonly backend: 'supabase' | 'file';
  create(input: NewTicketInput, first: NewMessageInput): Promise<TroubleTicket>;
  list(scope: TicketScope, filter: TicketListFilter): Promise<TroubleTicket[]>;
  get(id: string): Promise<TroubleTicket | null>;
  update(id: string, patch: TicketPatch, audit: NewMessageInput | null): Promise<TroubleTicket | null>;
  addMessage(id: string, msg: NewMessageInput, status: TicketStatus | null): Promise<TroubleTicket | null>;
  /** 'full' when the ticket already has `max` screenshots. */
  addAttachment(ticketId: string, att: NewAttachmentInput, max: number): Promise<TicketAttachmentMeta | 'full' | null>;
  getAttachment(ticketId: string, attachmentId: string): Promise<StoredAttachment | null>;
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
  private mutate<T>(fn: (d: FileData) => T): Promise<T> {
    const run = this.queue.then(() => {
      const d = this.read();
      const out = fn(d);
      this.writeJson(this.file, d);
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
  addAttachment(ticketId: string, att: NewAttachmentInput, max: number) {
    const run = this.queue.then(() => {
      const d = this.read();
      if (!d.tickets.some((t) => t.id === ticketId)) return null;
      if (d.attachments.filter((a) => a.ticketId === ticketId).length >= max) return 'full' as const;
      const { data, ...meta } = att;
      const row = { id: crypto.randomUUID(), ticketId, ...meta, createdAt: nowIso() };
      const blobs = this.readJson<Record<string, string>>(this.blobFile, {});
      blobs[row.id] = data;
      this.writeJson(this.blobFile, blobs);
      d.attachments.push(row);
      this.writeJson(this.file, d);
      return { id: row.id, mime: row.mime, size: row.size, width: row.width, height: row.height, createdAt: row.createdAt };
    });
    this.queue = run.catch(() => undefined);
    return run;
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
  async addAttachment(ticketId: string, att: NewAttachmentInput, max: number) {
    const exists = this.check(await this.db.from(T_TICKETS).select('id').eq('id', ticketId).maybeSingle()) as Row | null;
    if (!exists) return null;
    const { count, error } = await this.db.from(T_ATTACH).select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId);
    if (error) this.check({ data: null, error });
    if ((count ?? 0) >= max) return 'full' as const;
    const r = this.check(
      await this.db
        .from(T_ATTACH)
        .insert({ ticket_id: ticketId, mime: att.mime, size: att.size, width: att.width, height: att.height, sha256: att.sha256, data: att.data, uploaded_by: att.uploadedBy })
        .select(ATT_COLS)
        .single(),
    ) as Row;
    // The count above and the insert are two requests: uploads racing each other could pass the same count. Count
    // again; if this one went over the cap, take it back (racing uploads may all be refused; one retry fixes that).
    const after = await this.db.from(T_ATTACH).select('id', { count: 'exact', head: true }).eq('ticket_id', ticketId);
    if (after.error) this.check({ data: null, error: after.error });
    if ((after.count ?? 0) > max) {
      await this.db.from(T_ATTACH).delete().eq('id', String(r.id)).eq('ticket_id', ticketId);
      return 'full' as const;
    }
    return attFromRow(r);
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
