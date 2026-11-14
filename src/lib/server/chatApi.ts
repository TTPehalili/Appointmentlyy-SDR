/**
 * Shared helpers for the /api/chat route handlers (route files may only export handlers).
 *
 * Workspace and role always come from the live session, never from the request. Platform staff
 * (Super Admin of the APPOINTMENTLYY workspace) can open any workspace for support, but team chat
 * stays private: they only get the chat of a workspace they are a real, active member of.
 * No chat content is ever sent to an AI model.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { PLATFORM_TENANT_CODE, ROLE_RANK, parseRole } from '@/lib/roles';
import { getAdminEmails } from '@/lib/authToken';
import { getServerSession, type ServerSession } from '@/lib/server/session';
import { getTenantStore, nowIso } from '@/lib/server/tenantStore';
import { displayNameFor } from '@/lib/server/tenancy';
import { chatChannelId, dmKey, getChatStore, isChatId } from '@/lib/server/chatStore';
import { publishChat } from '@/lib/server/chatBus';
import {
  canSeeChannel,
  type ChatChannel,
  type ChatChannelRef,
  type ChatChannelSummary,
  type ChatMe,
  type ChatMember,
  type ChatMessage,
  type ChatMessageKind,
  type ChatMessageMeta,
} from '@/lib/chat';

export const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const fail = (status: number, error: string, headers: Record<string, string> = {}) =>
  json({ success: false, error }, status, headers);

export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export interface ChatCtx {
  session: ServerSession;
  tenantCode: string;
  me: ChatMe;
}

export const PRIVATE_CHAT_MESSAGE =
  'Team chat is private to each workspace. Switch back to your own workspace to chat with your team.';

/** The signed-in person as a chat participant in their current workspace, or the 401 / 403 to send. */
export async function requireChat(req: NextRequest | { cookies: NextRequest['cookies'] }): Promise<ChatCtx | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  const email = session.email.toLowerCase();
  let role: string = session.role;
  if (session.isPlatformAdmin && session.tenantCode !== PLATFORM_TENANT_CODE) {
    const own = (await getTenantStore().listMembers({ tenantCode: session.tenantCode, email })).find((m) => m.status === 'active');
    if (!own) return fail(403, PRIVATE_CHAT_MESSAGE);
    role = own.role;
  }
  const rank = ROLE_RANK[parseRole(role) ?? 'Rep'];
  return {
    session,
    tenantCode: session.tenantCode,
    me: { email, name: session.name || displayNameFor(email), role, canManage: rank >= ROLE_RANK.Supervisor },
  };
}

// ------------------------------------------------------------------ who is in the workspace

const g = globalThis as typeof globalThis & {
  __appyChatDirectory?: Map<string, { at: number; members: ChatMember[] }>;
  __appyChatSeeded?: Set<string>;
  __appyChatRate?: Map<string, { tokens: number; at: number }>;
  __appyChatPresence?: Map<string, string>;
};
const directoryCache = (g.__appyChatDirectory ??= new Map());
const DIRECTORY_TTL_MS = 20_000;

/** Active members of the workspace (plus platform staff in the platform workspace), cached briefly. */
export async function workspaceDirectory(tenantCode: string): Promise<ChatMember[]> {
  const hit = directoryCache.get(tenantCode);
  if (hit && Date.now() - hit.at < DIRECTORY_TTL_MS) return hit.members;
  const rows = await getTenantStore().listMembers({ tenantCode });
  const byEmail = new Map<string, ChatMember>();
  for (const m of rows) {
    if (m.status !== 'active') continue;
    const email = m.email.toLowerCase();
    byEmail.set(email, { email, name: displayNameFor(email, m.name), role: m.role });
  }
  if (tenantCode === PLATFORM_TENANT_CODE) {
    for (const email of getAdminEmails()) {
      const cur = byEmail.get(email);
      byEmail.set(email, { email, name: cur?.name ?? displayNameFor(email), role: 'Super Admin' });
    }
  }
  const members = [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
  directoryCache.set(tenantCode, { at: Date.now(), members });
  return members;
}

/** The directory with the signed-in person in it (platform staff may not have a member row). */
export async function directoryFor(ctx: ChatCtx): Promise<ChatMember[]> {
  const members = await workspaceDirectory(ctx.tenantCode);
  if (members.some((m) => m.email === ctx.me.email)) return members;
  return [...members, { email: ctx.me.email, name: ctx.me.name, role: ctx.me.role }];
}

/** People who can read a channel (for @mentions). */
export function audienceOf(channel: ChatChannel, members: ChatMember[]): ChatMember[] {
  if (channel.kind === 'floor') return members;
  if (channel.kind === 'managers') return members.filter((m) => ROLE_RANK[parseRole(m.role) ?? 'Rep'] >= ROLE_RANK.Supervisor);
  return members.filter((m) => channel.memberEmails.includes(m.email));
}

// ------------------------------------------------------------------ channels

const seeded = (g.__appyChatSeeded ??= new Set<string>());

/** #floor and #managers exist in every workspace from the first time anyone opens chat. */
export async function ensureSharedChannels(tenantCode: string): Promise<void> {
  if (seeded.has(tenantCode)) return;
  const store = getChatStore();
  const createdAt = nowIso();
  await Promise.all(
    (['floor', 'managers'] as const).map((kind) =>
      store.ensureChannel({ id: chatChannelId(tenantCode, kind), tenantCode, kind, name: kind, memberEmails: [], pinnedMessageId: null, createdAt }),
    ),
  );
  seeded.add(tenantCode);
}

export const floorChannelId = (tenantCode: string) => chatChannelId(tenantCode, 'floor');
export const managersChannelId = (tenantCode: string) => chatChannelId(tenantCode, 'managers');

export async function ensureDm(tenantCode: string, a: string, b: string): Promise<ChatChannel> {
  const members = [a.toLowerCase(), b.toLowerCase()].sort();
  return getChatStore().ensureChannel({
    id: chatChannelId(tenantCode, dmKey(a, b)),
    tenantCode,
    kind: 'dm',
    name: '',
    memberEmails: members,
    pinnedMessageId: null,
    createdAt: nowIso(),
  });
}

export const refOf = (c: ChatChannel): ChatChannelRef => ({ id: c.id, kind: c.kind, memberEmails: c.memberEmails });

/** Channels this person may read, #floor first, then #managers, then DMs. */
export async function visibleChannels(ctx: ChatCtx): Promise<ChatChannel[]> {
  await ensureSharedChannels(ctx.tenantCode);
  const all = await getChatStore().listChannels(ctx.tenantCode, ctx.me.email);
  const order = { floor: 0, managers: 1, dm: 2 } as const;
  return all.filter((c) => canSeeChannel(c, ctx.me)).sort((a, b) => order[a.kind] - order[b.kind]);
}

/** A channel by id, or null when it doesn't exist here or this person may not read it. */
export async function visibleChannel(ctx: ChatCtx, id: string): Promise<ChatChannel | null> {
  await ensureSharedChannels(ctx.tenantCode);
  const c = await getChatStore().getChannel(ctx.tenantCode, id);
  return c && canSeeChannel(c, ctx.me) ? c : null;
}

/**
 * The channel a request names, or the error to send: 404 when it isn't in this workspace or is
 * someone else's DM, 403 for #managers below Supervisor.
 */
export async function channelForRequest(ctx: ChatCtx, id: unknown): Promise<ChatChannel | NextResponse> {
  const notFound = () => fail(404, 'Channel not found.');
  if (!isChatId(id)) return notFound();
  await ensureSharedChannels(ctx.tenantCode);
  const c = await getChatStore().getChannel(ctx.tenantCode, id);
  if (!c) return notFound();
  if (c.kind === 'managers' && !ctx.me.canManage) return fail(403, '#managers is only for supervisors, managers and admins.');
  return canSeeChannel(c, ctx.me) ? c : notFound();
}

/** Channel list rows: unread and @mention counts, last message, the #floor pin, the DM partner. */
export async function summarize(ctx: ChatCtx, channels: ChatChannel[]): Promise<ChatChannelSummary[]> {
  const store = getChatStore();
  const ids = channels.map((c) => c.id);
  const [reads, last, members] = await Promise.all([store.getReads(ctx.tenantCode, ctx.me.email), store.lastMessages(ctx.tenantCode, ids), directoryFor(ctx)]);
  // Only count where something arrived after the read marker.
  const toCount = channels
    .filter((c) => {
      const l = last.get(c.id);
      const r = reads.get(c.id);
      return l && (!r || Date.parse(l.createdAt) > Date.parse(r));
    })
    .map((c) => ({ id: c.id, after: reads.get(c.id) ?? null }));
  const counts = toCount.length ? await store.unreadCounts(ctx.tenantCode, ctx.me.email, toCount) : new Map();
  const pinnedIds = channels.filter((c) => c.kind === 'floor' && c.pinnedMessageId).map((c) => [c.id, c.pinnedMessageId!] as const);
  const pinned = new Map<string, ChatMessage | null>();
  for (const [cid, mid] of pinnedIds) {
    const m = await store.getMessage(ctx.tenantCode, mid);
    pinned.set(cid, m && !m.deletedAt ? m : null);
  }
  const byEmail = new Map(members.map((m) => [m.email, m]));
  return channels.map((c) => {
    const other = c.kind === 'dm' ? c.memberEmails.find((e) => e !== ctx.me.email) ?? ctx.me.email : null;
    const dmWith = other ? byEmail.get(other) ?? { email: other, name: displayNameFor(other), role: '' } : undefined;
    const n = counts.get(c.id);
    return {
      id: c.id,
      kind: c.kind,
      name: c.kind === 'dm' ? dmWith!.name : c.kind,
      ...(dmWith ? { dmWith } : {}),
      unread: n?.unread ?? 0,
      mentions: n?.mentions ?? 0,
      lastReadAt: reads.get(c.id) ?? null,
      lastMessage: last.get(c.id) ?? null,
      pinned: c.kind === 'floor' ? pinned.get(c.id) ?? null : null,
    };
  });
}

// ------------------------------------------------------------------ sending

const rate = (g.__appyChatRate ??= new Map());
const RATE_BURST = 3;
const RATE_PER_SECOND = 1;

/** ~1 message per second per person, with a small burst. Returns seconds to wait, or 0 to go ahead. */
export function rateLimited(ctx: ChatCtx): number {
  const key = `${ctx.tenantCode}|${ctx.me.email}`;
  const now = Date.now();
  const cur = rate.get(key) ?? { tokens: RATE_BURST, at: now };
  const tokens = Math.min(RATE_BURST, cur.tokens + ((now - cur.at) / 1000) * RATE_PER_SECOND);
  if (tokens < 1) {
    rate.set(key, { tokens, at: now });
    return Math.max(1, Math.ceil((1 - tokens) / RATE_PER_SECOND));
  }
  rate.set(key, { tokens: tokens - 1, at: now });
  if (rate.size > 5000) for (const [k, v] of rate) if (now - v.at > 60_000) rate.delete(k);
  return 0;
}

export const tooFast = (wait: number) => fail(429, 'You are sending messages too quickly. Wait a moment.', { 'Retry-After': String(wait) });

/** Store a message and push it to everyone in the workspace who can see the channel. */
export async function postMessage(
  ctx: ChatCtx,
  channel: ChatChannel,
  m: { kind: ChatMessageKind; body: string; meta?: ChatMessageMeta; sender?: { email: string; name: string; role: string } },
): Promise<ChatMessage> {
  const sender = m.sender ?? ctx.me;
  const message = await getChatStore().insertMessage(ctx.tenantCode, {
    channelId: channel.id,
    senderEmail: sender.email,
    senderName: sender.name,
    senderRole: sender.role,
    kind: m.kind,
    body: m.body,
    meta: m.meta ?? {},
  });
  publishChat(ctx.tenantCode, { type: 'message', message, channel: refOf(channel) });
  return message;
}

/** Push a changed message (deleted, claimed) to the people who can see it. */
export function publishUpdate(tenantCode: string, channel: ChatChannel, message: ChatMessage) {
  publishChat(tenantCode, { type: 'message', message, channel: refOf(channel) });
}

/** What a deleted message looks like to everyone: no body, no meta. */
export const tombstone = (m: ChatMessage): ChatMessage => (m.deletedAt ? { ...m, body: '', meta: {} } : m);

// ------------------------------------------------------------------ presence

const lastStatus = (g.__appyChatPresence ??= new Map<string, string>());

/** Remember the last status pushed for someone; true when it changed (so the stream should tell others). */
export function presenceChanged(tenantCode: string, email: string, status: string): boolean {
  const key = `${tenantCode}|${email}`;
  if (lastStatus.get(key) === status) return false;
  lastStatus.set(key, status);
  return true;
}
