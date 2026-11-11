/**
 * Strict validation of activity events sent by the browser (POST /api/activity/events), and the
 * stored payload / delivery-log summary built from them. Only whitelisted fields are kept; unknown
 * fields and sections that don't belong to the event type are dropped. Tenant and actor never come
 * from the body.
 */
import {
  ACTIVITY_EVENT_LABEL,
  ACTIVITY_EVENT_TYPES,
  type ActivityEventInput,
  type ActivityEventType,
  type EventContact,
  type WebhookPayload,
} from '@/lib/integrations';
import { INTEGRATION_LIMITS } from '@/lib/integrations';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Events may be queued offline in the browser for a while, but not for months or in the future. */
export const MAX_EVENT_AGE_MS = 30 * 24 * 3600 * 1000;
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

export type Invalid = { ok: false; error: string; field: string };
type Result<T> = { ok: true; value: T } | Invalid;

class Bad extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function optStr(o: Record<string, unknown>, key: string, field: string, max: number): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new Bad(`${field}.${key}`, `${key} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new Bad(`${field}.${key}`, `${key} is too long (max ${max} characters).`);
  return t || undefined;
}

function reqStr(o: Record<string, unknown>, key: string, field: string, max: number): string {
  const v = optStr(o, key, field, max);
  if (!v) throw new Bad(`${field}.${key}`, `${key} is required.`);
  return v;
}

function optEmail(o: Record<string, unknown>, key: string, field: string): string | undefined {
  const v = optStr(o, key, field, 320);
  if (v === undefined) return undefined;
  if (!EMAIL_RE.test(v)) throw new Bad(`${field}.${key}`, `${key} is not a valid email address.`);
  return v.toLowerCase();
}

function isoTime(v: unknown, field: string, opts: { required: boolean; bounded: boolean }, now: number): string | undefined {
  if (v === undefined || v === null || v === '') {
    if (opts.required) throw new Bad(field, `${field.split('.').pop()} is required.`);
    return undefined;
  }
  if (typeof v !== 'string' || v.length > 40 || !ISO_RE.test(v)) throw new Bad(field, `${field.split('.').pop()} must be an ISO date-time, e.g. 2026-11-11T14:05:00Z.`);
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new Bad(field, `${field.split('.').pop()} is not a real date.`);
  if (opts.bounded && (t > now + MAX_CLOCK_SKEW_MS || t < now - MAX_EVENT_AGE_MS)) {
    throw new Bad(field, `${field.split('.').pop()} must be within the last 30 days.`);
  }
  return new Date(t).toISOString();
}

function contactOf(v: unknown, field: string): EventContact {
  if (!isObj(v)) throw new Bad(field, 'contact is required.');
  const c: EventContact = {
    id: optStr(v, 'id', field, 100),
    name: optStr(v, 'name', field, 200) ?? '',
    email: optEmail(v, 'email', field),
    phone: optStr(v, 'phone', field, 50),
    company: optStr(v, 'company', field, 200),
    title: optStr(v, 'title', field, 200),
    website: optStr(v, 'website', field, INTEGRATION_LIMITS.urlLength),
    linkedinUrl: optStr(v, 'linkedinUrl', field, INTEGRATION_LIMITS.urlLength),
  };
  if (!c.name && !c.email && !c.phone && !c.company) throw new Bad(`${field}.name`, 'The contact needs a name, email, phone or company.');
  return dropUndefined(c);
}

function dropUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function section(v: unknown, field: string, required: boolean): Record<string, unknown> | null {
  if (v === undefined || v === null) {
    if (required) throw new Bad(field, `${field.split('.').pop()} is required for this event type.`);
    return null;
  }
  if (!isObj(v)) throw new Bad(field, `${field.split('.').pop()} must be an object.`);
  return v;
}

function oneEvent(raw: unknown, field: string, now: number): ActivityEventInput {
  if (!isObj(raw)) throw new Bad(field, 'Each event must be an object.');
  const id = raw.clientEventId;
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Bad(`${field}.clientEventId`, 'clientEventId must be a UUID.');
  const type = raw.type;
  if (typeof type !== 'string' || !(ACTIVITY_EVENT_TYPES as readonly string[]).includes(type)) {
    throw new Bad(`${field}.type`, `type must be one of: ${ACTIVITY_EVENT_TYPES.join(', ')}.`);
  }
  const t = type as ActivityEventType;
  const out: ActivityEventInput = {
    clientEventId: id.toLowerCase(),
    type: t,
    occurredAt: isoTime(raw.occurredAt, `${field}.occurredAt`, { required: true, bounded: true }, now)!,
    contact: contactOf(raw.contact, `${field}.contact`),
  };

  if (t === 'call.logged') {
    const f = `${field}.call`;
    const c = section(raw.call, f, true)!;
    const durationSec = c.durationSec;
    if (durationSec !== undefined && durationSec !== null && (typeof durationSec !== 'number' || !Number.isInteger(durationSec) || durationSec < 0 || durationSec > 86400)) {
      throw new Bad(`${f}.durationSec`, 'durationSec must be a whole number of seconds (0-86400).');
    }
    const direction = c.direction;
    if (direction !== undefined && direction !== null && direction !== 'outbound' && direction !== 'inbound') {
      throw new Bad(`${f}.direction`, "direction must be 'outbound' or 'inbound'.");
    }
    out.call = dropUndefined({
      outcome: reqStr(c, 'outcome', f, 100),
      summary: optStr(c, 'summary', f, INTEGRATION_LIMITS.summaryLength),
      durationSec: typeof durationSec === 'number' ? durationSec : undefined,
      direction: (direction as 'outbound' | 'inbound' | null | undefined) ?? undefined,
    });
  } else if (t === 'meeting.booked') {
    const f = `${field}.meeting`;
    const m = section(raw.meeting, f, false);
    if (m) {
      const planId = optStr(m, 'meetingPlanId', f, 36);
      if (planId && !UUID_RE.test(planId)) throw new Bad(`${f}.meetingPlanId`, 'meetingPlanId must be a UUID.');
      out.meeting = dropUndefined({
        at: isoTime(m.at, `${f}.at`, { required: false, bounded: false }, now),
        aeEmail: optEmail(m, 'aeEmail', f),
        aeName: optStr(m, 'aeName', f, 200),
        meetingPlanId: planId?.toLowerCase(),
      });
    }
  } else if (t === 'callback.scheduled') {
    const f = `${field}.callback`;
    const c = section(raw.callback, f, true)!;
    out.callback = dropUndefined({ at: isoTime(c.at, `${f}.at`, { required: true, bounded: false }, now)!, note: optStr(c, 'note', f, 1000) });
  } else if (t === 'pipeline.stage_changed') {
    const f = `${field}.stage`;
    const s = section(raw.stage, f, true)!;
    out.stage = dropUndefined({ from: optStr(s, 'from', f, 100), to: reqStr(s, 'to', f, 100) });
  } else if (t === 'email.sent') {
    const f = `${field}.email`;
    const e = section(raw.email, f, true)!;
    const to = optEmail(e, 'to', f);
    if (!to) throw new Bad(`${f}.to`, 'to is required.');
    out.email = { subject: optStr(e, 'subject', f, 300) ?? '', to };
  }
  return out;
}

/** Validate a whole batch: any invalid event rejects the batch (400) with the field path, e.g. "events[2].contact.email". */
export function validateEventBatch(body: unknown, now = Date.now()): Result<ActivityEventInput[]> {
  if (!isObj(body) || !Array.isArray(body.events)) return { ok: false, error: 'Send { events: [...] }.', field: 'events' };
  const list = body.events;
  if (list.length === 0) return { ok: false, error: 'Send at least one event.', field: 'events' };
  try {
    return { ok: true, value: list.map((e, i) => oneEvent(e, `events[${i}]`, now)) };
  } catch (err) {
    if (err instanceof Bad) return { ok: false, error: err.message, field: err.field };
    throw err;
  }
}

/** Who the event is about, for later cross-event lookups: email, else phone digits, else browser id. */
export function subjectKeyOf(c: EventContact): string | null {
  if (c.email) return `email:${c.email.toLowerCase()}`;
  const digits = (c.phone || '').replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length >= 6) return `phone:${digits}`;
  if (c.id) return `id:${c.id}`;
  return null;
}

/** "Call logged · Dana Reyes (Northwind)" for the delivery log. */
export function eventSummary(type: ActivityEventType | 'test.ping', c: EventContact): string {
  const label = type === 'test.ping' ? 'Test ping' : ACTIVITY_EVENT_LABEL[type].replace(/ \(.*\)$/, '');
  const who = c.name || c.email || c.phone || c.company || 'Unknown contact';
  const company = c.company && c.company !== who ? ` (${c.company})` : '';
  return `${label} · ${who}${company}`.slice(0, 300);
}

export interface Workspace {
  code: string;
  name: string;
}
export interface ActorInfo {
  email: string;
  name: string;
}

/** The stored payload: the WebhookPayload minus its id (the id is the stored event's id). */
export function payloadOf(e: ActivityEventInput, workspace: Workspace, actor: ActorInfo): Omit<WebhookPayload, 'id'> {
  const { clientEventId: _id, type, occurredAt, ...data } = e;
  void _id;
  return { type, occurredAt, workspace, actor, data, version: 1 };
}

/** The exact JSON body sent to receivers. `id` first so it's easy to spot in logs. */
export function webhookBody(eventId: string, payload: Record<string, unknown>): string {
  const { id: _ignored, ...rest } = payload;
  void _ignored;
  return JSON.stringify({ id: eventId, ...rest });
}
