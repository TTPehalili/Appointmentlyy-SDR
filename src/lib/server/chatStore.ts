/**
 * Server-only storage for team chat. Same two backends as tenantStore and emailTemplateStore:
 * Supabase (tables in supabase/migrations/20261117000000_team_chat.sql) or a JSON file
 * (TENANCY_DATA_DIR/chat.json) for local work on a single server.
 *
 * Every method takes the tenant code and scopes by it: an id from another workspace is simply
 * "not found". The file backend keeps presence in memory only (it changes every 30 s per person).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { nowIso } from '@/lib/server/tenantStore';
import {
  withReaction,
  type ChatChannel,
  type ChatChannelKind,
  type ChatMessage,
  type ChatMessageKind,
  type ChatMessageMeta,
  type ChatPresenceStatus,
} from '@/lib/chat';

export type NewChatMessage = Pick<ChatMessage, 'channelId' | 'senderEmail' | 'senderName' | 'senderRole' | 'kind' | 'body' | 'meta'>;

export interface PresenceRow {
  email: string;
  status: ChatPresenceStatus;
  updatedAt: string;
}

/** Result of a reaction change: the message (changed or not), or why it could not be applied. */
export type ReactResult = { message: ChatMessage; changed: boolean } | 'deleted' | 'limit' | null;

export interface UnreadCount {
  unread: number;
  mentions: number;
}

export interface ChatStore {
  readonly backend: 'supabase' | 'file';
  /** Insert the channel if its (deterministic) id is new; returns the stored channel. */
  ensureChannel(c: ChatChannel): Promise<ChatChannel>;
  /** #floor, #managers and the DMs this person is in. Callers still filter #managers by role. */
  listChannels(tenantCode: string, email: string): Promise<ChatChannel[]>;
  getChannel(tenantCode: string, id: string): Promise<ChatChannel | null>;
  setPinned(tenantCode: string, channelId: string, messageId: string | null): Promise<boolean>;
  insertMessage(tenantCode: string, m: NewChatMessage): Promise<ChatMessage>;
  getMessage(tenantCode: string, id: string): Promise<ChatMessage | null>;
  /** Newest `limit` messages (older than `before` when given), returned oldest first. */
  listMessages(tenantCode: string, channelId: string, opts: { before?: string; limit: number }): Promise<ChatMessage[]>;
  /** Messages created or changed after `since` in these channels, oldest change first. */
  listChangedSince(tenantCode: string, channelIds: string[], since: string, limit: number): Promise<ChatMessage[]>;
  /** Soft delete or claim: patch the message and bump updatedAt. */
  updateMessage(tenantCode: string, id: string, patch: { meta?: ChatMessageMeta; body?: string; deletedAt?: string | null }): Promise<ChatMessage | null>;
  /** Claim an open help request. 'taken' if someone else got there first. */
  claimHelp(tenantCode: string, id: string, by: { email: string; name: string }): Promise<ChatMessage | 'taken' | null>;
  /**
   * Add or remove one person's emoji reaction (meta.reactions) and bump updatedAt. Every other meta
   * field is kept. 'deleted' for a deleted message, 'limit' past the distinct-emoji cap.
   */
  react(tenantCode: string, id: string, email: string, emoji: string, on: boolean | undefined): Promise<ReactResult>;
  lastMessages(tenantCode: string, channelIds: string[]): Promise<Map<string, ChatMessage>>;
  /** Unread (and @mention) counts after each channel's read marker, not counting the reader's own messages. */
  unreadCounts(tenantCode: string, email: string, channels: { id: string; after: string | null }[]): Promise<Map<string, UnreadCount>>;
  getReads(tenantCode: string, email: string): Promise<Map<string, string>>;
  markRead(tenantCode: string, channelId: string, email: string, at: string): Promise<void>;
  heartbeat(tenantCode: string, email: string, status: ChatPresenceStatus): Promise<PresenceRow>;
  listPresence(tenantCode: string): Promise<PresenceRow[]>;
}

/** Unread counts stop here; the UI shows "99+". */
export const UNREAD_CAP = 100;
/** File backend: keep the newest messages per workspace. */
const FILE_MAX_MESSAGES_PER_TENANT = 5000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUIDs in both backends; reject anything else before it reaches a query. */
export const isChatId = (id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id);

/** Stable UUID for a seeded channel or a DM pair, so two servers (or two tabs) create it once. */
export function chatChannelId(tenantCode: string, key: string): string {
  const h = crypto.createHash('sha256').update(`team-chat:${tenantCode}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const dmKey = (a: string, b: string) => `dm:${[a.toLowerCase(), b.toLowerCase()].sort().join('|')}`;

const iso = (v: unknown): string => {
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v ?? '');
};
const ms = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0);
const byCreated = (a: ChatMessage, b: ChatMessage) => ms(a.createdAt) - ms(b.createdAt) || a.id.localeCompare(b.id);
const mentionsOf = (m: Pick<ChatMessage, 'meta'>) => (Array.isArray(m.meta?.mentions) ? m.meta.mentions : []);

// ------------------------------------------------------------------ file backend

interface ReadRow {
  tenantCode: string;
  channelId: string;
  userEmail: string;
  lastReadAt: string;
}

interface FileShape {
  channels: ChatChannel[];
  messages: ChatMessage[];
  reads: ReadRow[];
}

class FileChatStore implements ChatStore {
  readonly backend = 'file' as const;
  private file: string;
  private queue: Promise<unknown> = Promise.resolve();
  /** Single server: the file is read once and written through. */
  private cache: FileShape | null = null;
  private presence = new Map<string, PresenceRow>();
  /** Strictly increasing timestamps, so ?since= never misses two messages in the same millisecond. */
  private lastStamp = 0;

  constructor(dir: string) {
    this.file = path.join(dir, 'chat.json');
  }
  private stamp(): string {
    const t = Math.max(Date.now(), this.lastStamp + 1);
    this.lastStamp = t;
    return new Date(t).toISOString();
  }
  private read(): FileShape {
    if (this.cache) return this.cache;
    try {
      const p = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<FileShape>;
      this.cache = { channels: p.channels ?? [], messages: p.messages ?? [], reads: p.reads ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.cache = { channels: [], messages: [], reads: [] };
    }
    return this.cache;
  }
  private write(d: FileShape) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(d), 'utf8');
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

  ensureChannel(c: ChatChannel) {
    return this.mutate((d) => {
      const cur = d.channels.find((x) => x.id === c.id);
      if (cur) return cur;
      d.channels.push(c);
      return c;
    });
  }
  async listChannels(tenantCode: string, email: string) {
    const e = email.toLowerCase();
    return this.read().channels.filter((c) => c.tenantCode === tenantCode && (c.kind !== 'dm' || c.memberEmails.includes(e)));
  }
  async getChannel(tenantCode: string, id: string) {
    return this.read().channels.find((c) => c.tenantCode === tenantCode && c.id === id) ?? null;
  }
  setPinned(tenantCode: string, channelId: string, messageId: string | null) {
    return this.mutate((d) => {
      const c = d.channels.find((x) => x.tenantCode === tenantCode && x.id === channelId);
      if (!c) return false;
      c.pinnedMessageId = messageId;
      return true;
    });
  }
  insertMessage(tenantCode: string, m: NewChatMessage) {
    return this.mutate((d) => {
      const at = this.stamp();
      const msg: ChatMessage = { ...m, id: crypto.randomUUID(), tenantCode, createdAt: at, updatedAt: at, deletedAt: null };
      d.messages.push(msg);
      const mine = d.messages.filter((x) => x.tenantCode === tenantCode);
      if (mine.length > FILE_MAX_MESSAGES_PER_TENANT) {
        const drop = new Set(mine.slice(0, mine.length - FILE_MAX_MESSAGES_PER_TENANT).map((x) => x.id));
        d.messages = d.messages.filter((x) => !drop.has(x.id));
      }
      return msg;
    });
  }
  async getMessage(tenantCode: string, id: string) {
    return this.read().messages.find((m) => m.tenantCode === tenantCode && m.id === id) ?? null;
  }
  async listMessages(tenantCode: string, channelId: string, opts: { before?: string; limit: number }) {
    const before = opts.before ? ms(opts.before) : Infinity;
    const list = this.read().messages.filter((m) => m.tenantCode === tenantCode && m.channelId === channelId && ms(m.createdAt) < before);
    return list.sort(byCreated).slice(-opts.limit);
  }
  async listChangedSince(tenantCode: string, channelIds: string[], since: string, limit: number) {
    const ids = new Set(channelIds);
    const after = ms(since);
    return this.read()
      .messages.filter((m) => m.tenantCode === tenantCode && ids.has(m.channelId) && ms(m.updatedAt) > after)
      .sort((a, b) => ms(a.updatedAt) - ms(b.updatedAt))
      .slice(0, limit);
  }
  updateMessage(tenantCode: string, id: string, patch: { meta?: ChatMessageMeta; body?: string; deletedAt?: string | null }) {
    return this.mutate((d) => {
      const m = d.messages.find((x) => x.tenantCode === tenantCode && x.id === id);
      if (!m) return null;
      if (patch.meta !== undefined) m.meta = patch.meta;
      if (patch.body !== undefined) m.body = patch.body;
      if (patch.deletedAt !== undefined) m.deletedAt = patch.deletedAt;
      m.updatedAt = this.stamp();
      return { ...m };
    });
  }
  claimHelp(tenantCode: string, id: string, by: { email: string; name: string }) {
    return this.mutate((d): ChatMessage | 'taken' | null => {
      const m = d.messages.find((x) => x.tenantCode === tenantCode && x.id === id);
      if (!m || m.kind !== 'help' || !m.meta.help || m.deletedAt) return null;
      if (m.meta.help.claimedBy) return 'taken';
      m.meta = { ...m.meta, help: { ...m.meta.help, claimedBy: { ...by, at: nowIso() } } };
      m.updatedAt = this.stamp();
      return { ...m };
    });
  }
  react(tenantCode: string, id: string, email: string, emoji: string, on: boolean | undefined) {
    return this.mutate((d): ReactResult => {
      const m = d.messages.find((x) => x.tenantCode === tenantCode && x.id === id);
      if (!m) return null;
      if (m.deletedAt) return 'deleted';
      const next = withReaction(m.meta ?? {}, email, emoji, on);
      if (next === 'limit') return 'limit';
      if (next === 'unchanged') return { message: { ...m }, changed: false };
      m.meta = next.meta;
      m.updatedAt = this.stamp();
      return { message: { ...m }, changed: true };
    });
  }
  async lastMessages(tenantCode: string, channelIds: string[]) {
    const ids = new Set(channelIds);
    const out = new Map<string, ChatMessage>();
    for (const m of this.read().messages) {
      if (m.tenantCode !== tenantCode || !ids.has(m.channelId) || m.deletedAt) continue;
      const cur = out.get(m.channelId);
      if (!cur || byCreated(cur, m) < 0) out.set(m.channelId, m);
    }
    return out;
  }
  async unreadCounts(tenantCode: string, email: string, channels: { id: string; after: string | null }[]) {
    const e = email.toLowerCase();
    const after = new Map(channels.map((c) => [c.id, ms(c.after)]));
    const out = new Map<string, UnreadCount>(channels.map((c) => [c.id, { unread: 0, mentions: 0 }]));
    for (const m of this.read().messages) {
      if (m.tenantCode !== tenantCode || !after.has(m.channelId) || m.deletedAt || m.senderEmail === e) continue;
      if (ms(m.createdAt) <= (after.get(m.channelId) ?? 0)) continue;
      const c = out.get(m.channelId)!;
      if (c.unread < UNREAD_CAP) c.unread += 1;
      if (mentionsOf(m).includes(e)) c.mentions += 1;
    }
    return out;
  }
  async getReads(tenantCode: string, email: string) {
    const e = email.toLowerCase();
    return new Map(this.read().reads.filter((r) => r.tenantCode === tenantCode && r.userEmail === e).map((r) => [r.channelId, r.lastReadAt]));
  }
  async markRead(tenantCode: string, channelId: string, email: string, at: string) {
    const e = email.toLowerCase();
    await this.mutate((d) => {
      const r = d.reads.find((x) => x.tenantCode === tenantCode && x.channelId === channelId && x.userEmail === e);
      if (r) {
        if (ms(at) > ms(r.lastReadAt)) r.lastReadAt = at;
      } else d.reads.push({ tenantCode, channelId, userEmail: e, lastReadAt: at });
    });
  }
  async heartbeat(tenantCode: string, email: string, status: ChatPresenceStatus) {
    const row = { email: email.toLowerCase(), status, updatedAt: nowIso() };
    this.presence.set(`${tenantCode}|${row.email}`, row);
    return row;
  }
  async listPresence(tenantCode: string) {
    return [...this.presence.entries()].filter(([k]) => k.startsWith(`${tenantCode}|`)).map(([, v]) => v);
  }
}

// ------------------------------------------------------------------ Supabase backend

type Row = Record<string, unknown>;
const CHANNELS = 'chat_channels';
const MESSAGES = 'chat_messages';
const READS = 'chat_reads';
const PRESENCE = 'chat_presence';

const channelFromRow = (r: Row): ChatChannel => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  kind: r.kind as ChatChannelKind,
  name: String(r.name ?? ''),
  memberEmails: Array.isArray(r.member_emails) ? (r.member_emails as unknown[]).map((e) => String(e).toLowerCase()) : [],
  pinnedMessageId: r.pinned_message_id ? String(r.pinned_message_id) : null,
  createdAt: iso(r.created_at),
});

const messageFromRow = (r: Row): ChatMessage => ({
  id: String(r.id),
  tenantCode: String(r.tenant_code),
  channelId: String(r.channel_id),
  senderEmail: String(r.sender_email ?? ''),
  senderName: String(r.sender_name ?? ''),
  senderRole: String(r.sender_role ?? ''),
  kind: (r.kind as ChatMessageKind) ?? 'text',
  body: String(r.body ?? ''),
  meta: r.meta && typeof r.meta === 'object' ? (r.meta as ChatMessageMeta) : {},
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at ?? r.created_at),
  deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
});

class SupabaseChatStore implements ChatStore {
  readonly backend = 'supabase' as const;
  constructor(private db: SupabaseClient) {}
  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(`[chatStore] ${res.error.message}`);
    return res.data;
  }

  async ensureChannel(c: ChatChannel) {
    this.check(
      await this.db.from(CHANNELS).upsert(
        { id: c.id, tenant_code: c.tenantCode, kind: c.kind, name: c.name, member_emails: c.memberEmails, created_at: c.createdAt },
        { onConflict: 'id', ignoreDuplicates: true },
      ),
    );
    return (await this.getChannel(c.tenantCode, c.id)) ?? c;
  }
  async listChannels(tenantCode: string, email: string) {
    const [shared, dms] = await Promise.all([
      this.db.from(CHANNELS).select('*').eq('tenant_code', tenantCode).in('kind', ['floor', 'managers']),
      this.db.from(CHANNELS).select('*').eq('tenant_code', tenantCode).eq('kind', 'dm').contains('member_emails', [email.toLowerCase()]).limit(500),
    ]);
    return [...(this.check(shared) as Row[]), ...(this.check(dms) as Row[])].map(channelFromRow);
  }
  async getChannel(tenantCode: string, id: string) {
    const r = this.check(await this.db.from(CHANNELS).select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
    return r ? channelFromRow(r) : null;
  }
  async setPinned(tenantCode: string, channelId: string, messageId: string | null) {
    const rows = this.check(
      await this.db.from(CHANNELS).update({ pinned_message_id: messageId }).eq('tenant_code', tenantCode).eq('id', channelId).select('id'),
    ) as Row[] | null;
    return Boolean(rows && rows.length);
  }
  async insertMessage(tenantCode: string, m: NewChatMessage) {
    const r = this.check(
      await this.db
        .from(MESSAGES)
        .insert({
          tenant_code: tenantCode,
          channel_id: m.channelId,
          sender_email: m.senderEmail,
          sender_name: m.senderName,
          sender_role: m.senderRole,
          kind: m.kind,
          body: m.body,
          meta: m.meta,
        })
        .select()
        .single(),
    ) as Row;
    return messageFromRow(r);
  }
  async getMessage(tenantCode: string, id: string) {
    const r = this.check(await this.db.from(MESSAGES).select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
    return r ? messageFromRow(r) : null;
  }
  async listMessages(tenantCode: string, channelId: string, opts: { before?: string; limit: number }) {
    let q = this.db.from(MESSAGES).select('*').eq('tenant_code', tenantCode).eq('channel_id', channelId);
    if (opts.before) q = q.lt('created_at', opts.before);
    const rows = this.check(await q.order('created_at', { ascending: false }).limit(opts.limit)) as Row[];
    return rows.map(messageFromRow).sort(byCreated);
  }
  async listChangedSince(tenantCode: string, channelIds: string[], since: string, limit: number) {
    if (!channelIds.length) return [];
    const rows = this.check(
      await this.db
        .from(MESSAGES)
        .select('*')
        .eq('tenant_code', tenantCode)
        .in('channel_id', channelIds)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(limit),
    ) as Row[];
    return rows.map(messageFromRow);
  }
  async updateMessage(tenantCode: string, id: string, patch: { meta?: ChatMessageMeta; body?: string; deletedAt?: string | null }) {
    const row: Row = { updated_at: nowIso() };
    if (patch.meta !== undefined) row.meta = patch.meta;
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.deletedAt !== undefined) row.deleted_at = patch.deletedAt;
    const r = this.check(await this.db.from(MESSAGES).update(row).eq('tenant_code', tenantCode).eq('id', id).select().maybeSingle()) as Row | null;
    return r ? messageFromRow(r) : null;
  }
  async claimHelp(tenantCode: string, id: string, by: { email: string; name: string }) {
    const cur = await this.getMessage(tenantCode, id);
    if (!cur || cur.kind !== 'help' || !cur.meta.help || cur.deletedAt) return null;
    if (cur.meta.help.claimedBy) return 'taken' as const;
    const meta: ChatMessageMeta = { ...cur.meta, help: { ...cur.meta.help, claimedBy: { ...by, at: nowIso() } } };
    // Only claim while unclaimed: a second supervisor clicking at the same moment updates no row.
    const r = this.check(
      await this.db
        .from(MESSAGES)
        .update({ meta, updated_at: nowIso() })
        .eq('tenant_code', tenantCode)
        .eq('id', id)
        .is('meta->help->claimedBy', null)
        .select()
        .maybeSingle(),
    ) as Row | null;
    return r ? messageFromRow(r) : ('taken' as const);
  }
  async react(tenantCode: string, id: string, email: string, emoji: string, on: boolean | undefined): Promise<ReactResult> {
    // Read-modify-write on meta (only meta.reactions changes; help, win, mentions are carried
    // over), guarded by updated_at: if anything else changed the row in between (another
    // reaction, a claim, a delete), no row matches, so we re-read and retry and the concurrent
    // change is kept. The last try is unguarded so a reaction always lands.
    const ATTEMPTS = 6;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const raw = this.check(await this.db.from(MESSAGES).select('*').eq('tenant_code', tenantCode).eq('id', id).maybeSingle()) as Row | null;
      if (!raw) return null;
      const cur = messageFromRow(raw);
      if (cur.deletedAt) return 'deleted';
      const next = withReaction(cur.meta, email, emoji, on);
      if (next === 'limit') return 'limit';
      if (next === 'unchanged') return { message: cur, changed: false };
      let q = this.db.from(MESSAGES).update({ meta: next.meta, updated_at: nowIso() }).eq('tenant_code', tenantCode).eq('id', id).is('deleted_at', null);
      if (attempt < ATTEMPTS) q = q.eq('updated_at', String(raw.updated_at));
      const r = this.check(await q.select().maybeSingle()) as Row | null;
      if (r) return { message: messageFromRow(r), changed: true };
      await new Promise((res) => setTimeout(res, 15 + Math.random() * 50));
    }
    // Deleted between the read and the write.
    return 'deleted';
  }
  async lastMessages(tenantCode: string, channelIds: string[]) {
    const out = new Map<string, ChatMessage>();
    await Promise.all(
      channelIds.map(async (id) => {
        const r = this.check(
          await this.db
            .from(MESSAGES)
            .select('*')
            .eq('tenant_code', tenantCode)
            .eq('channel_id', id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ) as Row | null;
        if (r) out.set(id, messageFromRow(r));
      }),
    );
    return out;
  }
  async unreadCounts(tenantCode: string, email: string, channels: { id: string; after: string | null }[]) {
    const e = email.toLowerCase();
    const out = new Map<string, UnreadCount>();
    await Promise.all(
      channels.map(async (c) => {
        let q = this.db
          .from(MESSAGES)
          .select('id, meta')
          .eq('tenant_code', tenantCode)
          .eq('channel_id', c.id)
          .is('deleted_at', null)
          .neq('sender_email', e);
        if (c.after) q = q.gt('created_at', c.after);
        const rows = this.check(await q.order('created_at', { ascending: false }).limit(UNREAD_CAP)) as Row[];
        out.set(c.id, {
          unread: rows.length,
          mentions: rows.filter((r) => mentionsOf({ meta: (r.meta as ChatMessageMeta) ?? {} }).includes(e)).length,
        });
      }),
    );
    return out;
  }
  async getReads(tenantCode: string, email: string) {
    const rows = this.check(await this.db.from(READS).select('channel_id, last_read_at').eq('tenant_code', tenantCode).eq('user_email', email.toLowerCase())) as Row[];
    return new Map(rows.map((r) => [String(r.channel_id), iso(r.last_read_at)]));
  }
  async markRead(tenantCode: string, channelId: string, email: string, at: string) {
    const e = email.toLowerCase();
    const cur = (await this.getReads(tenantCode, e)).get(channelId);
    if (cur && ms(cur) >= ms(at)) return;
    this.check(
      await this.db.from(READS).upsert({ tenant_code: tenantCode, channel_id: channelId, user_email: e, last_read_at: at }, { onConflict: 'tenant_code,channel_id,user_email' }),
    );
  }
  async heartbeat(tenantCode: string, email: string, status: ChatPresenceStatus) {
    const row = { email: email.toLowerCase(), status, updatedAt: nowIso() };
    this.check(
      await this.db
        .from(PRESENCE)
        .upsert({ tenant_code: tenantCode, user_email: row.email, status, updated_at: row.updatedAt }, { onConflict: 'tenant_code,user_email' }),
    );
    return row;
  }
  async listPresence(tenantCode: string) {
    const rows = this.check(await this.db.from(PRESENCE).select('*').eq('tenant_code', tenantCode)) as Row[];
    return rows.map((r) => ({ email: String(r.user_email), status: r.status as ChatPresenceStatus, updatedAt: iso(r.updated_at) }));
  }
}

/**
 * One store per server process, kept on globalThis: route handlers can be bundled separately, and
 * the file backend's cache, presence and the live stream must all see the same data.
 */
const g = globalThis as typeof globalThis & { __appyChatStore?: ChatStore };

export function getChatStore(): ChatStore {
  if (g.__appyChatStore) return g.__appyChatStore;
  let store: ChatStore;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    store = new SupabaseChatStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  } else {
    if (process.env.NODE_ENV === 'production' && !process.env.TENANCY_DATA_DIR) {
      throw new Error('[chatStore] No database configured. Set SUPABASE_SERVICE_ROLE_KEY or TENANCY_DATA_DIR.');
    }
    store = new FileChatStore(process.env.TENANCY_DATA_DIR || path.join(process.cwd(), '.data'));
  }
  g.__appyChatStore = store;
  return store;
}
