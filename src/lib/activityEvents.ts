/**
 * Browser outbox for activity events (contract: src/lib/integrations.ts).
 *
 * Sales data still lives in this browser, so the Dialer, Pipeline and Contacts report what happened
 * here. Each event gets a UUID (the server's idempotency key), is queued in localStorage (so it
 * survives reloads and being offline) and is sent in batches of up to 20 to POST /api/activity/events.
 * The server stores each id once and fans it out to the workspace's webhooks / CRM connections.
 *
 * - Never throws into the caller and never blocks the UI (all sending is async, errors are logged).
 * - One queue per person+workspace ("email|TENANT"), so an event is only ever sent while that same
 *   person+workspace is signed in. The queue key is deliberately not in tenantStorage's DATA_KEYS:
 *   it already names its owner, so it is neither archived nor cleared on a workspace switch.
 * - Retries with backoff (5s doubling to 5 min) on network errors, 401/403/404/429/5xx.
 *   Accepted and duplicate ids are removed. A batch the server rejects as invalid (400/413/422) is
 *   retried one event at a time and only the bad event is dropped.
 * - Events older than 7 days are dropped with a console warning.
 * - Flushes on `online`, when the tab becomes visible again, and (with `keepalive`) when it is hidden.
 * - Demo builds (browser-only login, no server session) send nothing.
 */
import { ACTIVITY_EVENT_TYPES, INTEGRATION_LIMITS, type ActivityEventInput, type EventContact } from './integrations';
import { DEMO_LOGIN } from './demoMode';
import { STORAGE_OWNER_KEY } from './tenantStorage';

export type ActivityEventDraft = Omit<ActivityEventInput, 'clientEventId' | 'occurredAt'> & { occurredAt?: string };

export const ACTIVITY_EVENTS_ENDPOINT = '/api/activity/events';
const KEY_PREFIX = 'appy_activity_outbox_v1::';
const BATCH_SIZE = INTEGRATION_LIMITS.eventsPerRequest;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Hard cap on queued events per person+workspace (oldest dropped first). */
const MAX_QUEUE = 2000;
/** Bulk imports report at most this many contact.created events per import. */
export const MAX_CONTACT_EVENTS_PER_IMPORT = 500;
/** 2xx answers that neither accepted nor flagged an id before it is given up. */
const MAX_UNCONFIRMED = 5;
/** Browsers cap keepalive bodies at 64 KB in total. */
const KEEPALIVE_MAX_BYTES = 60_000;
const DEBOUNCE_MS = 800;
const STARTUP_DELAY_MS = 4_000;
const OWNER_MISMATCH_RETRY_MS = 30_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
const MAX_TEXT = 500;
/** Field limits the server enforces (a longer value would get the whole event rejected). */
const CONTACT_LIMITS = { id: 100, name: 200, email: 320, phone: 50, company: 200, title: 200, website: INTEGRATION_LIMITS.urlLength, linkedinUrl: INTEGRATION_LIMITS.urlLength } as const;
/** Same check as the server (src/lib/server/integrations/eventInput.ts). */
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

interface QueuedEvent {
  e: ActivityEventInput;
  /** Queued at (ms). */
  q: number;
  /** Unconfirmed 2xx answers so far. */
  u?: number;
}

type SendResult =
  | { kind: 'ok'; accepted: string[]; duplicates: string[] }
  | { kind: 'invalid'; status: number; error: string }
  | { kind: 'retry'; status: number; retryAfterMs?: number };

/* ------------------------------------------------------------------ helpers */

const hasWindow = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const clip = (v: unknown, max = MAX_TEXT): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

/** The prospect snapshot sent with every event (empty fields left out). */
export function eventContact(c: {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
}): EventContact {
  const out: EventContact = { name: clip(c.name, CONTACT_LIMITS.name) || clip(c.email, CONTACT_LIMITS.name) || 'Unknown contact' };
  const keys = ['id', 'email', 'phone', 'company', 'title', 'website', 'linkedinUrl'] as const;
  for (const k of keys) {
    const v = clip(c[k], CONTACT_LIMITS[k]);
    // A malformed email (e.g. "n/a" from a CSV) is left out rather than getting the event rejected.
    if (v && (k !== 'email' || EMAIL_RE.test(v))) out[k] = v;
  }
  return out;
}

/** An ISO date-time (normalised to UTC), or undefined for anything else (labels like "Thu 2:00 PM"). */
function isoOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v.trim())) return undefined;
  const t = Date.parse(v.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * A Dialer slot label such as "Thu 2:00 PM" as the next such time in the rep's time zone (ISO),
 * or undefined when it isn't in that form. ISO input is passed through.
 */
export function meetingSlotToIso(label: string | null | undefined, now = new Date()): string | undefined {
  if (!label) return undefined;
  const m = /^\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i.exec(label);
  if (!m) return isoOrUndefined(label);
  let hour = Number(m[2]) % 12;
  if (m[4].toLowerCase() === 'pm') hour += 12;
  const minute = Number(m[3] || 0);
  if (Number(m[2]) > 12 || minute > 59) return undefined;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  let add = (DAYS.indexOf(m[1].toLowerCase()) - now.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d.toISOString();
}

function normalize(draft: ActivityEventDraft): ActivityEventInput | null {
  if (!draft || !(ACTIVITY_EVENT_TYPES as readonly string[]).includes(draft.type) || !draft.contact) return null;
  const occurred = isoOrUndefined(draft.occurredAt) ?? new Date().toISOString();
  const ev: ActivityEventInput = {
    clientEventId: uuid(),
    type: draft.type,
    occurredAt: occurred,
    contact: eventContact(draft.contact),
  };
  // Each type needs its own section (the server rejects the event otherwise): no section, no event.
  if (draft.type === 'call.logged') {
    if (!draft.call) return null;
    ev.call = { outcome: clip(draft.call.outcome, 100) || 'Unknown' };
    const summary = clip(draft.call.summary, INTEGRATION_LIMITS.summaryLength);
    if (summary) ev.call.summary = summary;
    if (typeof draft.call.durationSec === 'number' && Number.isFinite(draft.call.durationSec)) ev.call.durationSec = Math.min(86_400, Math.max(0, Math.round(draft.call.durationSec)));
    if (draft.call.direction === 'outbound' || draft.call.direction === 'inbound') ev.call.direction = draft.call.direction;
  } else if (draft.type === 'meeting.booked') {
    const src = draft.meeting || {};
    const m: NonNullable<ActivityEventInput['meeting']> = {};
    const at = isoOrUndefined(src.at);
    if (at) m.at = at;
    const aeEmail = clip(src.aeEmail, 320);
    if (aeEmail && EMAIL_RE.test(aeEmail)) m.aeEmail = aeEmail;
    const aeName = clip(src.aeName, 200);
    if (aeName) m.aeName = aeName;
    const planId = clip(src.meetingPlanId, 36);
    if (planId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(planId)) m.meetingPlanId = planId;
    ev.meeting = m;
  } else if (draft.type === 'callback.scheduled') {
    const at = isoOrUndefined(draft.callback?.at);
    if (!at) return null;
    const note = clip(draft.callback?.note, 1000);
    ev.callback = note ? { at, note } : { at };
  } else if (draft.type === 'pipeline.stage_changed') {
    const to = clip(draft.stage?.to, 100);
    if (!to) return null;
    const from = clip(draft.stage?.from, 100);
    ev.stage = from ? { from, to } : { to };
  } else if (draft.type === 'email.sent') {
    const to = clip(draft.email?.to, 320);
    if (!to || !EMAIL_RE.test(to)) return null;
    ev.email = { subject: clip(draft.email?.subject, 300) || '(no subject)', to };
  }
  return ev;
}

/* ------------------------------------------------------------------ queue storage */

function ownerOfSession(): string | null {
  const email = (localStorage.getItem('sdr_user_email') || '').trim().toLowerCase();
  const tenant = localStorage.getItem('sdr_tenant_code') || '';
  return email && tenant ? `${email}|${tenant}` : null;
}

/** Whose data is live in this browser ("email|TENANT"), or null when nobody is signed in. */
function currentOwner(): string | null {
  try {
    return localStorage.getItem(STORAGE_OWNER_KEY) || ownerOfSession();
  } catch {
    return null;
  }
}

function queueKey(owner = currentOwner()): string | null {
  return owner ? KEY_PREFIX + owner : null;
}

function read(key: string): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is QueuedEvent => !!x && typeof x === 'object' && !!(x as QueuedEvent).e?.clientEventId) : [];
  } catch {
    return [];
  }
}

function write(key: string, queue: QueuedEvent[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(queue));
  } catch (err) {
    // Storage full: keep the newest half rather than nothing.
    try {
      localStorage.setItem(key, JSON.stringify(queue.slice(Math.floor(queue.length / 2))));
      console.warn('[activityEvents] storage is full; dropped the oldest half of the unsent activity events.');
    } catch {
      console.warn('[activityEvents] could not save unsent activity events:', err);
    }
  }
}

/** Drops expired events (with a warning). Returns the live queue and writes it back when it changed. */
function prune(key: string, now = Date.now()): QueuedEvent[] {
  const queue = read(key);
  const live = queue.filter((x) => now - (x.q || 0) <= MAX_AGE_MS);
  if (live.length !== queue.length) {
    console.warn(`[activityEvents] dropped ${queue.length - live.length} activity event(s) that could not be sent within 7 days.`);
    write(key, live);
  }
  return live;
}

function enqueue(events: ActivityEventInput[]) {
  const key = queueKey();
  if (!key || events.length === 0) return;
  const now = Date.now();
  let queue = read(key).filter((x) => now - (x.q || 0) <= MAX_AGE_MS);
  queue.push(...events.map((e) => ({ e, q: now })));
  if (queue.length > MAX_QUEUE) {
    console.warn(`[activityEvents] more than ${MAX_QUEUE} activity events are waiting to be sent; dropped the ${queue.length - MAX_QUEUE} oldest.`);
    queue = queue.slice(queue.length - MAX_QUEUE);
  }
  write(key, queue);
}

/** Removes settled ids; ids the server neither accepted nor flagged count as unconfirmed. */
function settle(key: string, sent: ActivityEventInput[], done: Set<string>) {
  const sentIds = new Set(sent.map((e) => e.clientEventId));
  let gaveUp = 0;
  const next: QueuedEvent[] = [];
  for (const x of read(key)) {
    const id = x.e.clientEventId;
    if (done.has(id)) continue;
    if (sentIds.has(id)) {
      const u = (x.u || 0) + 1;
      if (u >= MAX_UNCONFIRMED) {
        gaveUp++;
        continue;
      }
      next.push({ ...x, u });
    } else next.push(x);
  }
  if (gaveUp) console.warn(`[activityEvents] gave up on ${gaveUp} activity event(s) the server did not confirm.`);
  write(key, next);
}

function dropOne(key: string, id: string, reason: string) {
  write(
    key,
    read(key).filter((x) => x.e.clientEventId !== id),
  );
  console.warn(`[activityEvents] dropped an activity event the server rejected: ${reason}`);
}

/* ------------------------------------------------------------------ sending */

async function post(events: ActivityEventInput[], keepalive = false): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(ACTIVITY_EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive,
    });
  } catch {
    return { kind: 'retry', status: 0 };
  }
  const data = (await res.json().catch(() => null)) as { accepted?: unknown; duplicates?: unknown; error?: unknown } | null;
  if (res.ok) {
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { kind: 'ok', accepted: ids(data?.accepted), duplicates: ids(data?.duplicates) };
  }
  if (res.status === 400 || res.status === 409 || res.status === 413 || res.status === 422) {
    return { kind: 'invalid', status: res.status, error: typeof data?.error === 'string' ? data.error : `HTTP ${res.status}` };
  }
  const ra = Number(res.headers?.get?.('Retry-After'));
  return { kind: 'retry', status: res.status, retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined };
}

let started = false;
let inFlight: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerDue = 0;
let failures = 0;

function backoff(n: number): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, n - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function scheduleFlush(delayMs: number) {
  if (!hasWindow()) return;
  const due = Date.now() + Math.max(0, delayMs);
  if (timer && timerDue <= due) return;
  if (timer) clearTimeout(timer);
  timerDue = due;
  timer = setTimeout(() => {
    timer = null;
    timerDue = 0;
    void flushActivityEvents();
  }, Math.max(0, delayMs));
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * The session mirror and the storage owner must agree before sending, so events queued by one
 * person/workspace are never sent while the browser is mid-switch to another.
 */
function ownerIsSettled(): boolean {
  try {
    const marked = localStorage.getItem(STORAGE_OWNER_KEY);
    const session = ownerOfSession();
    return !!session && (!marked || marked === session);
  } catch {
    return false;
  }
}

async function runFlush(): Promise<void> {
  let isolate = 0; // > 0: send one at a time (isolating an invalid event in a rejected batch)
  for (let guard = 0; guard < 500; guard++) {
    if (!isOnline()) return;
    if (!ownerIsSettled()) {
      scheduleFlush(OWNER_MISMATCH_RETRY_MS);
      return;
    }
    const key = queueKey();
    if (!key) return;
    const queue = prune(key);
    if (queue.length === 0) {
      failures = 0;
      return;
    }
    const batch = queue.slice(0, isolate > 0 ? 1 : BATCH_SIZE).map((x) => x.e);
    const result = await post(batch);
    if (result.kind === 'ok') {
      failures = 0;
      if (isolate > 0) isolate--;
      settle(key, batch, new Set([...result.accepted, ...result.duplicates]));
      continue;
    }
    if (result.kind === 'invalid') {
      if (batch.length > 1) {
        isolate = batch.length;
        continue;
      }
      if (isolate > 0) isolate--;
      dropOne(key, batch[0].clientEventId, result.error);
      continue;
    }
    failures++;
    scheduleFlush(Math.max(result.retryAfterMs ?? 0, backoff(failures)));
    return;
  }
  scheduleFlush(DEBOUNCE_MS);
}

/** Sends what is queued now. Resolves when this pass is done; never rejects. */
export function flushActivityEvents(): Promise<void> {
  if (!hasWindow() || DEMO_LOGIN) return Promise.resolve();
  if (inFlight) {
    again = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      do {
        again = false;
        await runFlush();
      } while (again);
    } catch (err) {
      console.warn('[activityEvents] flush failed:', err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Page is going away: one best-effort keepalive request (the server dedupes if it is sent again later). */
function sendOnHide() {
  try {
    if (!isOnline() || !ownerIsSettled()) return;
    const key = queueKey();
    if (!key) return;
    const queue = prune(key);
    if (queue.length === 0) return;
    let batch = queue.slice(0, BATCH_SIZE).map((x) => x.e);
    while (batch.length > 1 && JSON.stringify({ events: batch }).length > KEEPALIVE_MAX_BYTES) batch = batch.slice(0, Math.ceil(batch.length / 2));
    if (JSON.stringify({ events: batch }).length > KEEPALIVE_MAX_BYTES) return;
    void post(batch, true)
      .then((r) => {
        if (r.kind === 'ok') settle(key, batch, new Set([...r.accepted, ...r.duplicates]));
      })
      .catch(() => {});
  } catch {
    // best effort only
  }
}

function ensureStarted() {
  if (started || !hasWindow()) return;
  started = true;
  try {
    window.addEventListener('online', () => {
      failures = 0;
      scheduleFlush(500);
    });
    window.addEventListener('pagehide', sendOnHide);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') sendOnHide();
        else scheduleFlush(1_000);
      });
    }
  } catch {
    // no event targets (non-browser): flushing still works on demand
  }
}

/* ------------------------------------------------------------------ public API */

/**
 * Report something that happened (call logged, meeting booked...). Queues it and sends it soon.
 * Returns the event's client id, or null when nothing was queued. Never throws.
 */
export function emitActivityEvent(draft: ActivityEventDraft): string | null {
  try {
    if (!hasWindow() || DEMO_LOGIN) return null;
    const ev = normalize(draft);
    if (!ev) return null;
    ensureStarted();
    enqueue([ev]);
    scheduleFlush(DEBOUNCE_MS);
    return ev.clientEventId;
  } catch (err) {
    console.warn('[activityEvents] could not queue an activity event:', err);
    return null;
  }
}

/**
 * contact.created for each new contact (imports, Lead Finder pulls, the Dialer adding a lead).
 * Very large imports report the first MAX_CONTACT_EVENTS_PER_IMPORT contacts only: one event per
 * contact keeps webhooks simple, but thousands at once would flood the receiver (Zapier task
 * quotas, CRM rate limits) and this browser's storage. Never throws.
 */
export function emitContactsCreated(
  contacts: Parameters<typeof eventContact>[0][],
  opts?: { source?: string },
): { queued: number; skipped: number } {
  try {
    if (!hasWindow() || DEMO_LOGIN || !contacts?.length) return { queued: 0, skipped: 0 };
    const take = contacts.slice(0, MAX_CONTACT_EVENTS_PER_IMPORT);
    const events = take.map((c) => normalize({ type: 'contact.created', contact: eventContact(c) })).filter((e): e is ActivityEventInput => !!e);
    const skipped = contacts.length - take.length;
    if (skipped > 0) {
      console.warn(
        `[activityEvents] ${opts?.source ? `${opts.source}: ` : ''}sending contact.created for the first ${MAX_CONTACT_EVENTS_PER_IMPORT} of ${contacts.length} new contacts; ${skipped} were not sent to integrations.`,
      );
    }
    ensureStarted();
    enqueue(events);
    scheduleFlush(DEBOUNCE_MS);
    return { queued: events.length, skipped };
  } catch (err) {
    console.warn('[activityEvents] could not queue contact events:', err);
    return { queued: 0, skipped: contacts?.length ?? 0 };
  }
}

/** Call once from the app shell: sends anything left from an earlier visit (after the session settles). */
export function startActivityEventSync() {
  if (!hasWindow() || DEMO_LOGIN) return;
  ensureStarted();
  scheduleFlush(STARTUP_DELAY_MS);
}

/** Number of unsent events for the signed-in person+workspace (for diagnostics). */
export function pendingActivityEventCount(): number {
  if (!hasWindow()) return 0;
  const key = queueKey();
  return key ? read(key).length : 0;
}

/** Test hooks (not for app code). */
export const __activityEventsTesting = {
  queueKey: () => queueKey(),
  read: () => {
    const key = queueKey();
    return key ? read(key) : [];
  },
  reset() {
    if (timer) clearTimeout(timer);
    timer = null;
    timerDue = 0;
    failures = 0;
    inFlight = null;
    again = false;
  },
  failures: () => failures,
  hasTimer: () => timer !== null,
  MAX_AGE_MS,
  MAX_UNCONFIRMED,
};
