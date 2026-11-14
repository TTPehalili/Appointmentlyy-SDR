'use client';

/**
 * Browser side of team chat: one shared store for the top-bar badge, the chat drawer and the
 * /chat page, plus the small helpers the Dialer uses (presence, "Need help", win bell).
 *
 * Live delivery: an EventSource on /api/chat/stream. If the stream drops, the store polls
 * /api/chat/messages?since= every 5 s until the stream is back, and after every (re)connect it
 * catches up from its cursor, so nothing is missed. The workspace always comes from the session
 * cookie on the server. Nothing here sends chat content to an AI model.
 */
import * as React from 'react';
import {
  CHAT_PAGE_SIZE,
  CHAT_POLL_MS,
  PRESENCE_AWAY_AFTER_MS,
  PRESENCE_HEARTBEAT_MS,
  type ChatChannelRef,
  type ChatChannelSummary,
  type ChatMe,
  type ChatMessage,
  type ChatPresence,
  type ChatPresenceStatus,
} from '@/lib/chat';

export type ChatTransport = 'off' | 'connecting' | 'live' | 'polling';
export type ChatStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable' | 'signed-out';

export interface ChannelMessages {
  items: ChatMessage[];
  hasMore: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export interface ChatState {
  status: ChatStatus;
  error: string | null;
  me: ChatMe | null;
  channels: ChatChannelSummary[];
  people: ChatPresence[];
  messages: Record<string, ChannelMessages>;
  transport: ChatTransport;
  /** What this person's presence currently is (Dialer on_call wins). */
  myStatus: ChatPresenceStatus;
  manualAway: boolean;
  soundOn: boolean;
  notificationsAllowed: boolean;
}

type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; status: number };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { success?: boolean; error?: string }) | null;
    if (!res.ok || !data || data.success === false) return { ok: false, status: res.status, error: data?.error || `Request failed (${res.status}).` };
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection.' };
  }
}

const post = <T>(url: string, body: unknown) => call<T>(url, { method: 'POST', body: JSON.stringify(body) });

// ------------------------------------------------------------------ store

const SOUND_KEY = 'appy_chat_sound';
const AWAY_KEY = 'appy_chat_away';

const INITIAL: ChatState = {
  status: 'idle',
  error: null,
  me: null,
  channels: [],
  people: [],
  messages: {},
  transport: 'off',
  myStatus: 'available',
  manualAway: false,
  soundOn: true,
  notificationsAllowed: false,
};

let state: ChatState = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useChatState(): ChatState {
  return React.useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

/** Unread total for the top-bar badge (mentions counted separately for the highlight). */
export function useChatUnread(): { total: number; mentions: number; available: boolean } {
  const s = useChatState();
  return React.useMemo(
    () => ({
      total: s.channels.reduce((n, c) => n + c.unread, 0),
      mentions: s.channels.reduce((n, c) => n + c.mentions, 0),
      available: s.status === 'ready',
    }),
    [s.channels, s.status],
  );
}

// ------------------------------------------------------------------ time, cursor, counting

/** Server clock minus browser clock, so Away and timestamps use the server's time. */
let skew = 0;
const serverNow = () => Date.now() + skew;
const noteServerTime = (iso: unknown) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (Number.isFinite(t)) skew = t - Date.now();
};

/** Newest change seen (server time). Catch-up asks for everything after it, minus an overlap. */
let cursor = 0;
const CATCH_UP_OVERLAP_MS = 5000;
/** Messages created after this were not in the last unread counts from the server. */
let countsAsOf = 0;
const counted = new Set<string>();

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const byCreated = (a: ChatMessage, b: ChatMessage) => ms(a.createdAt) - ms(b.createdAt) || a.id.localeCompare(b.id);

// ------------------------------------------------------------------ viewing (for read markers)

const viewing = new Map<string, number>();
const isViewing = (channelId: string) => (viewing.get(channelId) ?? 0) > 0 && typeof document !== 'undefined' && document.visibilityState === 'visible';

/** A mounted message view registers its channel, so new messages there are marked read, not counted. */
export function useChatViewing(channelId: string | null) {
  React.useEffect(() => {
    if (!channelId) return;
    viewing.set(channelId, (viewing.get(channelId) ?? 0) + 1);
    markRead(channelId);
    return () => {
      const n = (viewing.get(channelId) ?? 1) - 1;
      if (n <= 0) viewing.delete(channelId);
      else viewing.set(channelId, n);
    };
  }, [channelId]);
}

const readTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function markRead(channelId: string) {
  const ch = state.channels.find((c) => c.id === channelId);
  if (ch && (ch.unread || ch.mentions)) {
    setState((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? { ...c, unread: 0, mentions: 0 } : c)) }));
  }
  if (readTimers.has(channelId)) return;
  readTimers.set(
    channelId,
    setTimeout(() => {
      readTimers.delete(channelId);
      void post<{ lastReadAt: string }>('/api/chat/read', { channelId }).then((r) => {
        if (r.ok) setState((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? { ...c, lastReadAt: r.lastReadAt } : c)) }));
      });
    }, 400),
  );
}

// ------------------------------------------------------------------ presence (Dialer + heartbeat)

const presenceClaims = new Map<number, ChatPresenceStatus>();
let claimSeq = 0;

function effectiveStatus(): ChatPresenceStatus {
  const claims = [...presenceClaims.values()];
  if (claims.includes('on_call')) return 'on_call';
  if (state.manualAway || claims.includes('away')) return 'away';
  return 'available';
}

function refreshMyStatus() {
  const next = effectiveStatus();
  if (next === state.myStatus) return;
  setState({ myStatus: next });
  if (state.me) setState((s) => ({ people: s.people.map((p) => (p.email === s.me?.email ? { ...p, status: next, lastSeenAt: new Date(serverNow()).toISOString() } : p)) }));
  void heartbeat();
}

/**
 * Dialer hook: report this person's status while the component is mounted, e.g.
 * `useChatPresence(inCall ? 'on_call' : 'available')`. 'on_call' turns on do-not-disturb (no chat
 * sounds or desktop notifications; badges still update). Unmounting drops the claim.
 */
export function useChatPresence(status: ChatPresenceStatus) {
  const id = React.useRef<number | null>(null);
  React.useEffect(() => {
    const key = (id.current ??= ++claimSeq);
    presenceClaims.set(key, status);
    refreshMyStatus();
    return () => {
      presenceClaims.delete(key);
      refreshMyStatus();
    };
  }, [status]);
}

export function setManualAway(away: boolean) {
  try {
    localStorage.setItem(AWAY_KEY, away ? '1' : '0');
  } catch {}
  setState({ manualAway: away });
  refreshMyStatus();
}

async function heartbeat() {
  if (state.status !== 'ready') return;
  const r = await post<{ status: ChatPresenceStatus }>('/api/chat/presence', { status: effectiveStatus() });
  if (!r.ok) handleAuthFailure(r.status, r.error);
}

async function loadPresence() {
  const r = await call<{ people: ChatPresence[]; serverTime: string }>('/api/chat/presence');
  if (!r.ok) return handleAuthFailure(r.status, r.error);
  noteServerTime(r.serverTime);
  setState({ people: r.people });
}

/** Status to show for someone right now (Away once their heartbeat is ~2 minutes old). */
export function presenceOf(p: ChatPresence | undefined): ChatPresenceStatus {
  if (!p || !p.lastSeenAt) return 'away';
  if (serverNow() - ms(p.lastSeenAt) > PRESENCE_AWAY_AFTER_MS) return 'away';
  return p.status;
}

// ------------------------------------------------------------------ Dialer helpers (no connection needed)

/** "Need help" from the Dialer: posts to #managers with the rep's name and the current lead. */
export async function requestFloorHelp(input: { leadName?: string; company?: string; note?: string } = {}) {
  const r = await post<{ message: ChatMessage }>('/api/chat/help', input);
  return r.ok ? { ok: true as const, messageId: r.message.id } : { ok: false as const, error: r.error };
}

/** Win bell from the Dialer when a meeting is booked: "🔔 {rep} booked a meeting with {company}" in #floor. */
export async function postWinBell(input: { leadName?: string; company?: string }) {
  const r = await post<{ message: ChatMessage; duplicate?: boolean }>('/api/chat/win', input);
  if (r.ok) applyMessage(r.message, null);
  return r.ok ? { ok: true as const, messageId: r.message.id, duplicate: !!r.duplicate } : { ok: false as const, error: r.error };
}

// ------------------------------------------------------------------ sounds and notifications

let audio: AudioContext | null = null;
function playTone(kind: 'ping' | 'win') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
    const notes = kind === 'win' ? [880, 1175, 1568] : [660, 990];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const gain = audio!.createGain();
      const t = audio!.currentTime + i * 0.12;
      o.frequency.value = f;
      o.type = 'sine';
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(gain).connect(audio!.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    // Sound is a nice-to-have.
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {}
  setState({ soundOn: on });
}

export async function enableDesktopNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  setState({ notificationsAllowed: p === 'granted' });
  return p === 'granted';
}

function notify(m: ChatMessage, ch: ChatChannelSummary) {
  const me = state.me;
  if (!me || m.kind === 'system') return;
  const mentioned = (m.meta.mentions ?? []).includes(me.email);
  const important = ch.kind === 'dm' || mentioned || (m.kind === 'help' && me.canManage) || m.kind === 'win';
  if (!important) return;
  // Do not disturb while on a call: badges still update, but no sound or pop-up.
  if (effectiveStatus() === 'on_call') return;
  const hidden = document.visibilityState === 'hidden';
  if (!hidden && isViewing(ch.id)) return;
  if (state.soundOn) playTone(m.kind === 'win' ? 'win' : 'ping');
  if (hidden && m.kind !== 'win' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const where = ch.kind === 'dm' ? 'Direct message' : `#${ch.name}`;
      new Notification(m.kind === 'help' ? 'Help requested' : `${m.senderName} · ${where}`, { body: m.body.slice(0, 140), tag: m.id });
    } catch {}
  }
}

// ------------------------------------------------------------------ applying changes

let channelsTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleChannelsRefresh(delay = 600) {
  if (channelsTimer) return;
  channelsTimer = setTimeout(() => {
    channelsTimer = null;
    void loadChannels();
  }, delay);
}

/** Merge a new or changed message into the store (idempotent: the stream, polling and our own POSTs may all deliver it). */
function applyMessage(m: ChatMessage, ref: ChatChannelRef | null) {
  cursor = Math.max(cursor, ms(m.updatedAt));
  const me = state.me;
  const ch = state.channels.find((c) => c.id === m.channelId);
  if (!ch) {
    // A DM someone just started with us (or a channel we can now see).
    if (ref || state.status === 'ready') scheduleChannelsRefresh();
    return;
  }
  setState((s) => {
    const cur = s.messages[m.channelId];
    let messages = s.messages;
    if (cur?.loaded) {
      const i = cur.items.findIndex((x) => x.id === m.id);
      if (i >= 0 && ms(cur.items[i].updatedAt) > ms(m.updatedAt)) return {};
      const items = i >= 0 ? cur.items.map((x, j) => (j === i ? m : x)) : [...cur.items, m].sort(byCreated);
      messages = { ...s.messages, [m.channelId]: { ...cur, items } };
    }
    const channels = s.channels.map((c) => {
      if (c.id !== m.channelId) return c;
      const next = { ...c };
      if (!m.deletedAt && (!c.lastMessage || byCreated(c.lastMessage, m) <= 0)) next.lastMessage = m;
      if (m.deletedAt && c.lastMessage?.id === m.id) next.lastMessage = m;
      if (m.deletedAt && c.pinned?.id === m.id) next.pinned = null;
      return next;
    });
    return { messages, channels };
  });

  const isNew = !m.deletedAt && !counted.has(m.id) && ms(m.createdAt) > countsAsOf && m.senderEmail !== me?.email;
  if (!isNew) return;
  counted.add(m.id);
  if (counted.size > 2000) counted.delete(counted.values().next().value as string);
  if (isViewing(m.channelId)) markRead(m.channelId);
  else {
    const mentioned = !!me && (m.meta.mentions ?? []).includes(me.email);
    setState((s) => ({
      channels: s.channels.map((c) => (c.id === m.channelId ? { ...c, unread: c.unread + 1, mentions: c.mentions + (mentioned ? 1 : 0) } : c)),
    }));
  }
  notify(m, ch);
}

function handleAuthFailure(status: number, error: string) {
  if (status === 401) {
    stopTransport();
    setState({ status: 'signed-out', error, transport: 'off' });
  } else if (status === 403) {
    stopTransport();
    setState({ status: 'unavailable', error, transport: 'off' });
  }
}

// ------------------------------------------------------------------ loading

/** Bumped when the signed-in person or workspace changes, so late answers for the old one are dropped. */
let generation = 0;

let loadingChannels: Promise<void> | null = null;
export function loadChannels(): Promise<void> {
  if (loadingChannels) return loadingChannels;
  const gen = generation;
  loadingChannels = (async () => {
    if (state.status === 'idle' || state.status === 'error') setState({ status: 'loading' });
    const r = await call<{ me: ChatMe; channels: ChatChannelSummary[]; serverTime: string }>('/api/chat/channels');
    if (gen !== generation) return;
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) handleAuthFailure(r.status, r.error);
      else if (state.status !== 'ready') setState({ status: 'error', error: r.error });
      return;
    }
    noteServerTime(r.serverTime);
    countsAsOf = ms(r.serverTime);
    cursor = Math.max(cursor, countsAsOf);
    setState((s) => ({
      status: 'ready',
      error: null,
      me: r.me,
      // Channels being viewed stay read.
      channels: r.channels.map((c) => (isViewing(c.id) ? { ...c, unread: 0, mentions: 0 } : c)),
      messages: s.messages,
    }));
    r.channels.filter((c) => isViewing(c.id) && c.unread).forEach((c) => markRead(c.id));
  })().finally(() => {
    loadingChannels = null;
  });
  return loadingChannels;
}

export async function openChannelMessages(channelId: string) {
  const cur = state.messages[channelId];
  if (cur?.loaded || cur?.loading) return;
  setState((s) => ({ messages: { ...s.messages, [channelId]: { items: [], hasMore: false, loaded: false, loading: true, error: null } } }));
  const r = await call<{ messages: ChatMessage[]; hasMore: boolean; serverTime: string }>(`/api/chat/messages?channelId=${encodeURIComponent(channelId)}&limit=${CHAT_PAGE_SIZE}`);
  setState((s) => {
    const prev = s.messages[channelId];
    if (!r.ok) return { messages: { ...s.messages, [channelId]: { items: [], hasMore: false, loaded: false, loading: false, error: r.error } } };
    // Keep anything that arrived live while the page was loading.
    const extra = (prev?.items ?? []).filter((x) => !r.messages.some((m) => m.id === x.id));
    return { messages: { ...s.messages, [channelId]: { items: [...r.messages, ...extra].sort(byCreated), hasMore: r.hasMore, loaded: true, loading: false, error: null } } };
  });
}

export async function loadOlder(channelId: string) {
  const cur = state.messages[channelId];
  if (!cur?.loaded || !cur.hasMore || cur.loading || !cur.items.length) return;
  setState((s) => ({ messages: { ...s.messages, [channelId]: { ...cur, loading: true } } }));
  const before = cur.items[0].createdAt;
  const r = await call<{ messages: ChatMessage[]; hasMore: boolean }>(
    `/api/chat/messages?channelId=${encodeURIComponent(channelId)}&before=${encodeURIComponent(before)}&limit=${CHAT_PAGE_SIZE}`,
  );
  setState((s) => {
    const now = s.messages[channelId] ?? cur;
    if (!r.ok) return { messages: { ...s.messages, [channelId]: { ...now, loading: false, error: r.error } } };
    const known = new Set(now.items.map((m) => m.id));
    const items = [...r.messages.filter((m) => !known.has(m.id)), ...now.items].sort(byCreated);
    return { messages: { ...s.messages, [channelId]: { ...now, items, hasMore: r.hasMore, loading: false, error: null } } };
  });
}

let catchingUp = false;
async function catchUp() {
  if (catchingUp || state.status !== 'ready') return;
  catchingUp = true;
  try {
    const since = new Date(Math.max(0, cursor - CATCH_UP_OVERLAP_MS)).toISOString();
    const gen = generation;
    const r = await call<{ messages: ChatMessage[]; serverTime: string }>(`/api/chat/messages?since=${encodeURIComponent(since)}`);
    if (gen !== generation) return;
    if (!r.ok) return handleAuthFailure(r.status, r.error);
    noteServerTime(r.serverTime);
    r.messages.forEach((m) => applyMessage(m, null));
  } finally {
    catchingUp = false;
  }
}

// ------------------------------------------------------------------ actions

export async function sendMessage(channelId: string, body: string) {
  const r = await post<{ message: ChatMessage }>('/api/chat/messages', { channelId, body });
  if (!r.ok) return { ok: false as const, error: r.error };
  applyMessage(r.message, null);
  return { ok: true as const };
}

export async function deleteMessage(id: string) {
  const r = await call<{ message: ChatMessage }>(`/api/chat/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (r.ok) applyMessage(r.message, null);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function pinMessage(messageId: string | null) {
  const r = await post<{ pinned: ChatMessage | null }>('/api/chat/pin', { messageId });
  if (r.ok) setState((s) => ({ channels: s.channels.map((c) => (c.kind === 'floor' ? { ...c, pinned: r.pinned } : c)) }));
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

export async function claimHelp(messageId: string) {
  const r = await post<{ message: ChatMessage }>('/api/chat/help/claim', { messageId });
  if (r.ok) applyMessage(r.message, null);
  else void catchUp();
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
}

/** Open (or create) a DM; returns its channel id. */
export async function openDm(email: string) {
  const r = await post<{ channel: ChatChannelSummary }>('/api/chat/channels', { dmWith: email });
  if (!r.ok) return { ok: false as const, error: r.error };
  setState((s) => ({ channels: s.channels.some((c) => c.id === r.channel.id) ? s.channels : [...s.channels, r.channel] }));
  return { ok: true as const, channelId: r.channel.id };
}

// ------------------------------------------------------------------ transport

let es: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void catchUp();
  }, CHAT_POLL_MS);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function openStream() {
  if (es || typeof EventSource === 'undefined') {
    if (!es) {
      setState({ transport: 'polling' });
      startPolling();
    }
    return;
  }
  setState({ transport: state.transport === 'polling' ? 'polling' : 'connecting' });
  const source = new EventSource('/api/chat/stream');
  es = source;
  source.addEventListener('ready', (e) => {
    noteServerTime((JSON.parse((e as MessageEvent).data) as { serverTime?: string }).serverTime);
    stopPolling();
    setState({ transport: 'live' });
    void catchUp();
  });
  source.addEventListener('message', (e) => {
    try {
      const d = JSON.parse((e as MessageEvent).data) as { message: ChatMessage; channel: ChatChannelRef };
      if (d?.message) applyMessage(d.message, d.channel);
    } catch {}
  });
  source.addEventListener('channel', (e) => {
    try {
      const d = JSON.parse((e as MessageEvent).data) as { channel: ChatChannelRef; pinned: ChatMessage | null };
      if (d.channel.kind === 'floor') setState((s) => ({ channels: s.channels.map((c) => (c.id === d.channel.id ? { ...c, pinned: d.pinned } : c)) }));
      else scheduleChannelsRefresh();
    } catch {}
  });
  source.addEventListener('presence', (e) => {
    try {
      const d = JSON.parse((e as MessageEvent).data) as { email: string; status: ChatPresenceStatus; at: string };
      setState((s) => ({ people: s.people.map((p) => (p.email === d.email ? { ...p, status: d.status, lastSeenAt: d.at } : p)) }));
    } catch {}
  });
  source.onerror = () => {
    // The browser retries on its own while CONNECTING; poll meanwhile so messages keep arriving.
    setState({ transport: 'polling' });
    startPolling();
    if (source.readyState === EventSource.CLOSED) {
      if (es === source) es = null;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (state.status === 'ready') openStream();
        }, 15_000);
      }
    }
  };
}

function stopTransport() {
  es?.close();
  es = null;
  stopPolling();
  [reconnectTimer, channelsTimer].forEach((t) => t && clearTimeout(t));
  reconnectTimer = null;
  channelsTimer = null;
  [heartbeatTimer, refreshTimer].forEach((t) => t && clearInterval(t));
  heartbeatTimer = null;
  refreshTimer = null;
}

const onVisible = () => {
  if (document.visibilityState !== 'visible' || state.status !== 'ready') return;
  // Back on the tab: whatever the open view shows is now read.
  viewing.forEach((n, id) => n > 0 && markRead(id));
  void catchUp();
};

let started = false;
async function start() {
  if (started) return;
  started = true;
  try {
    const sound = localStorage.getItem(SOUND_KEY);
    setState({
      soundOn: sound !== '0',
      manualAway: localStorage.getItem(AWAY_KEY) === '1',
      notificationsAllowed: typeof Notification !== 'undefined' && Notification.permission === 'granted',
    });
    setState({ myStatus: effectiveStatus() });
  } catch {}
  document.addEventListener('visibilitychange', onVisible);
  const gen = generation;
  await loadChannels();
  if (gen === generation) afterLoad();
}

/** Once the channel list loaded: live stream, presence heartbeat and the periodic safety refresh. */
function afterLoad() {
  if (!started) return;
  if (state.status === 'error') {
    // Server hiccup: try again shortly.
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void loadChannels().then(afterLoad);
      }, 15_000);
    }
    return;
  }
  if (state.status !== 'ready' || heartbeatTimer) return;
  openStream();
  void heartbeat().then(loadPresence);
  heartbeatTimer = setInterval(() => {
    void heartbeat().then(loadPresence);
  }, PRESENCE_HEARTBEAT_MS);
  // Safety net: re-read unread counts now and then (and more often without the live stream).
  let tick = 0;
  refreshTimer = setInterval(() => {
    tick += 1;
    if (state.transport !== 'live' || tick % 4 === 0) void loadChannels();
  }, 30_000);
}

function stop() {
  started = false;
  generation += 1;
  stopTransport();
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  counted.clear();
  cursor = 0;
  countsAsOf = 0;
  state = { ...INITIAL, soundOn: state.soundOn, manualAway: state.manualAway, notificationsAllowed: state.notificationsAllowed };
  listeners.forEach((l) => l());
}

let holders = 0;
let holderKey: string | null = null;

/**
 * Keep the chat connection open while mounted (the app shell's chat button does this). `key`
 * identifies the signed-in person and workspace; when it changes the store starts over. Pass null
 * when signed out.
 */
export function useChatConnection(key: string | null) {
  React.useEffect(() => {
    if (!key) return;
    if (holderKey !== key) {
      if (holderKey !== null) stop();
      holderKey = key;
    }
    holders += 1;
    void start();
    return () => {
      holders -= 1;
      if (holders <= 0) {
        holders = 0;
        holderKey = null;
        stop();
      }
    };
  }, [key]);
}

/** Retry after a load error. */
export function retryChat() {
  setState({ status: 'loading', error: null });
  void loadChannels().then(afterLoad);
}
