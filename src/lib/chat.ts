/**
 * Team chat: types and pure helpers shared by the server (route handlers, store) and the browser.
 * No 'use client' and no server-only imports. Chat content never goes to an AI model.
 */

export type ChatChannelKind = 'floor' | 'managers' | 'dm';
export type ChatMessageKind = 'text' | 'help' | 'win' | 'system';
export type ChatPresenceStatus = 'available' | 'on_call' | 'away';

export const CHAT_BODY_MAX = 2000;
/** Lead / company names inside help and win messages. */
export const CHAT_NAME_MAX = 120;
/** Messages per page when opening a channel or loading older ones. */
export const CHAT_PAGE_SIZE = 50;
/** No heartbeat for this long = Away. */
export const PRESENCE_AWAY_AFTER_MS = 2 * 60 * 1000;
export const PRESENCE_HEARTBEAT_MS = 30 * 1000;
export const CHAT_POLL_MS = 5000;

export interface ChatHelpMeta {
  requestedBy: string;
  requestedByName: string;
  leadName?: string;
  company?: string;
  note?: string;
  claimedBy?: { email: string; name: string; at: string };
}

export interface ChatWinMeta {
  leadName?: string;
  company?: string;
}

export interface ChatMessageMeta {
  /** Emails of people @mentioned (only people who can see the channel). */
  mentions?: string[];
  help?: ChatHelpMeta;
  win?: ChatWinMeta;
  /** System line linked to another message, e.g. "Sam is on it" for a help request. */
  replyTo?: string;
  /** Emoji reactions: emoji (from the picker set) -> emails of the people who reacted, oldest first. */
  reactions?: ChatReactions;
}

export type ChatReactions = Record<string, string[]>;

/** Distinct emojis one message can carry. */
export const CHAT_REACTIONS_MAX = 20;
/** Safety cap on people per emoji (a workspace is far smaller). */
export const CHAT_REACTORS_MAX = 500;

/** The reactions on a message, cleaned of anything malformed (stored JSON is never trusted blindly). */
export function reactionsOf(m: Pick<ChatMessage, 'meta'> | null | undefined): ChatReactions {
  const raw = m?.meta?.reactions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ChatReactions = {};
  for (const [emoji, who] of Object.entries(raw)) {
    if (!Array.isArray(who)) continue;
    const emails = who.filter((e): e is string => typeof e === 'string' && e.length > 0);
    if (emails.length) out[emoji] = emails;
  }
  return out;
}

/**
 * Add or remove one person's reaction. Pure: returns the new meta (every other field kept as is),
 * 'unchanged' when there is nothing to do, or 'limit' when a new emoji would pass the cap.
 * `on` undefined toggles.
 */
export function withReaction(
  meta: ChatMessageMeta,
  email: string,
  emoji: string,
  on?: boolean,
): { meta: ChatMessageMeta; on: boolean } | 'unchanged' | 'limit' {
  const who = email.toLowerCase();
  const reactions = reactionsOf({ meta });
  const cur = reactions[emoji] ?? [];
  const has = cur.includes(who);
  const want = on ?? !has;
  if (want === has) return 'unchanged';
  if (want) {
    if (!cur.length && Object.keys(reactions).length >= CHAT_REACTIONS_MAX) return 'limit';
    if (cur.length >= CHAT_REACTORS_MAX) return 'limit';
    reactions[emoji] = [...cur, who];
  } else {
    const next = cur.filter((e) => e !== who);
    if (next.length) reactions[emoji] = next;
    else delete reactions[emoji];
  }
  const next: ChatMessageMeta = { ...meta };
  delete next.reactions;
  if (Object.keys(reactions).length) next.reactions = reactions;
  return { meta: next, on: want };
}

export interface ChatMessage {
  id: string;
  tenantCode: string;
  channelId: string;
  senderEmail: string;
  senderName: string;
  senderRole: string;
  kind: ChatMessageKind;
  body: string;
  meta: ChatMessageMeta;
  createdAt: string;
  /** Bumped on delete, claim or reaction, so polling with ?since= picks up changes too. */
  updatedAt: string;
  deletedAt: string | null;
}

export interface ChatChannel {
  id: string;
  tenantCode: string;
  kind: ChatChannelKind;
  name: string;
  /** DM only: the two members (lowercase). Empty for #floor / #managers. */
  memberEmails: string[];
  pinnedMessageId: string | null;
  createdAt: string;
}

export interface ChatMember {
  email: string;
  name: string;
  role: string;
}

export interface ChatPresence extends ChatMember {
  status: ChatPresenceStatus;
  /** Last heartbeat, or null if none yet. */
  lastSeenAt: string | null;
}

/** One row in the channel list, as GET /api/chat/channels returns it. */
export interface ChatChannelSummary {
  id: string;
  kind: ChatChannelKind;
  name: string;
  /** DM only: the other person. */
  dmWith?: ChatMember;
  unread: number;
  mentions: number;
  lastReadAt: string | null;
  lastMessage: ChatMessage | null;
  /** #floor only: the pinned announcement. */
  pinned: ChatMessage | null;
}

export interface ChatMe extends ChatMember {
  canManage: boolean;
}

/** Events on the live stream (GET /api/chat/stream) and the in-process bus. */
export type ChatEvent =
  | { type: 'message'; message: ChatMessage; channel: ChatChannelRef }
  | { type: 'channel'; channel: ChatChannelRef; pinned?: ChatMessage | null }
  | { type: 'presence'; email: string; status: ChatPresenceStatus; at: string };

/** Just enough about a channel for the bus to decide who may receive an event. */
export interface ChatChannelRef {
  id: string;
  kind: ChatChannelKind;
  memberEmails: string[];
}

export const PRESENCE_LABEL: Record<ChatPresenceStatus, string> = {
  available: 'Available',
  on_call: 'On a call',
  away: 'Away',
};

export const parsePresenceStatus = (raw: unknown): ChatPresenceStatus | null =>
  raw === 'available' || raw === 'on_call' || raw === 'away' ? raw : null;

/** Supervisor, Manager, Admin and Super Admin read #managers and run the floor. */
export const MANAGER_ROLES = ['Supervisor', 'Manager', 'Admin', 'Super Admin'];

export function canSeeChannel(ch: ChatChannelRef, viewer: { email: string; canManage: boolean }): boolean {
  if (ch.kind === 'floor') return true;
  if (ch.kind === 'managers') return viewer.canManage;
  return ch.memberEmails.includes(viewer.email.toLowerCase());
}

/**
 * Clean a typed message: plain text only. Normalises line breaks, drops control characters
 * (except newline and tab) and trims. Returns the error to show when it can't be sent.
 */
export function cleanBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Type a message first.' };
  const body = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!body) return { ok: false, error: 'Type a message first.' };
  if (body.length > CHAT_BODY_MAX) return { ok: false, error: `Messages can be up to ${CHAT_BODY_MAX} characters (this one is ${body.length}).` };
  return { ok: true, body };
}

/** Single-line name for help / win messages (lead, company, note). */
export function cleanName(raw: unknown, max = CHAT_NAME_MAX): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Who a message @mentions, from the people who can see the channel. Matches "@Full Name"
 * (longest names first, so "@Sam Lee" beats "@Sam") and "@emaillocalpart", case-insensitive.
 */
export function findMentions(body: string, audience: ChatMember[]): string[] {
  if (!body.includes('@')) return [];
  // Matched spans are blanked out, so "@Sam Lee" doesn't also mention "@Sam".
  let lower = body.toLowerCase();
  const found = new Set<string>();
  const candidates = audience
    .flatMap((m) => [
      { email: m.email, key: m.name.trim().toLowerCase() },
      { email: m.email, key: m.email.split('@')[0].toLowerCase() },
    ])
    .filter((c) => c.key.length >= 2)
    .sort((a, b) => b.key.length - a.key.length);
  for (const c of candidates) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(`@${c.key}`, from);
      if (i < 0) break;
      const before = i === 0 ? '' : lower[i - 1];
      const after = lower[i + 1 + c.key.length] ?? '';
      if ((!before || !/[a-z0-9._-]/.test(before)) && (!after || !/[a-z0-9_]/.test(after))) {
        found.add(c.email.toLowerCase());
        lower = lower.slice(0, i) + ' '.repeat(c.key.length + 1) + lower.slice(i + c.key.length + 1);
      }
      from = i + 1;
    }
  }
  return [...found];
}

export type ChatToken = { type: 'text'; text: string } | { type: 'link'; text: string; href: string } | { type: 'mention'; text: string; me: boolean };

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/** A safe http(s) link, or null. Trailing punctuation stays outside the link. */
function safeHref(raw: string): { href: string; trail: string } | null {
  let s = raw;
  let trail = '';
  while (/[.,;:!?)\]}'"]$/.test(s)) {
    // Keep a closing parenthesis that belongs to the URL, e.g. wiki links.
    if (s.endsWith(')') && (s.match(/\(/g)?.length ?? 0) >= (s.match(/\)/g)?.length ?? 0)) break;
    trail = s.slice(-1) + trail;
    s = s.slice(0, -1);
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return { href: u.toString(), trail };
  } catch {
    return null;
  }
}

/**
 * Split plain text into text / link / @mention tokens for rendering as React text nodes (never
 * HTML), so everything a person types is escaped and only http(s) URLs become links.
 */
export function tokenizeBody(body: string, mentionNames: { name: string; me: boolean }[] = []): ChatToken[] {
  const out: ChatToken[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    if (!mentionNames.length || !text.includes('@')) {
      out.push({ type: 'text', text });
      return;
    }
    const names = [...mentionNames].filter((m) => m.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
    let rest = text;
    while (rest) {
      const lower = rest.toLowerCase();
      let best: { i: number; len: number; me: boolean } | null = null;
      for (const n of names) {
        const i = lower.indexOf(`@${n.name.toLowerCase()}`);
        if (i >= 0 && (!best || i < best.i)) best = { i, len: n.name.length + 1, me: n.me };
      }
      if (!best) {
        out.push({ type: 'text', text: rest });
        break;
      }
      if (best.i > 0) out.push({ type: 'text', text: rest.slice(0, best.i) });
      out.push({ type: 'mention', text: rest.slice(best.i, best.i + best.len), me: best.me });
      rest = rest.slice(best.i + best.len);
    }
  };
  let last = 0;
  for (const m of body.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const link = safeHref(m[0]);
    if (!link) continue;
    pushText(body.slice(last, start));
    const text = m[0].slice(0, m[0].length - link.trail.length);
    out.push({ type: 'link', text, href: link.href });
    last = start + text.length;
  }
  pushText(body.slice(last));
  return out;
}

export function winBody(repName: string, win: ChatWinMeta): string {
  const who = win.company || win.leadName || 'a prospect';
  const lead = win.company && win.leadName ? ` (${win.leadName})` : '';
  return `🔔 ${repName} booked a meeting with ${who}${lead}`;
}

export function helpBody(repName: string, help: Pick<ChatHelpMeta, 'leadName' | 'company' | 'note'>): string {
  const on = help.leadName && help.company ? ` with ${help.leadName} (${help.company})` : help.leadName || help.company ? ` with ${help.leadName || help.company}` : '';
  return `${repName} needs help on a call${on}${help.note ? `: ${help.note}` : ''}`;
}
