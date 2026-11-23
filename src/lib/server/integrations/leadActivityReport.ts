/**
 * Lead activity report: turns stored 'lead.activity' events (activity checklist ticks) into
 * "who did what on which lead, by day". Pure: no storage, no session. The route decides whose
 * rows may be read and passes only one workspace's events in.
 *
 * - A tick and its later untick are two events; an unticked tick is not counted and not shown.
 * - Labels come from the checklist, never from what was stored or sent.
 * - A lead's phone and email are never returned: name, company, title and LinkedIn link only.
 */
import { LEAD_ACTIVITY_LIMITS, type LeadActivityRep, type LeadActivityReport } from '@/lib/integrations';
import { LEAD_ACTIVITY_CHECKLIST } from '@/lib/leadActivityChecklist';
import type { IntegrationEvent } from '@/lib/server/integrationStore';
import { leadActivityLabel } from '@/lib/server/integrations/eventInput';

const DAY_MS = 24 * 3600 * 1000;
/** The browser outbox keeps an unsent event for up to 7 days, so a tick can arrive that much later than it happened. */
export const LEAD_ACTIVITY_LATE_ARRIVAL_MS = 8 * DAY_MS;
/** A tick can be stamped slightly ahead of the server clock. */
export const LEAD_ACTIVITY_CLOCK_SKEW_MS = 10 * 60 * 1000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

const MIN_INSTANT = Date.UTC(2020, 0, 1);

export const LEAD_ACTIVITY_OPTIONS: LeadActivityReport['activities'] = LEAD_ACTIVITY_CHECKLIST.flatMap((g) => g.items.map((i) => ({ key: i.key, label: i.label, group: g.label })));

export type LeadActivityQuery = { ok: true; from: string; to: string; tzOffsetMin: number; member: string } | { ok: false; error: string; field: string };

/** from / to (ISO instants, to exclusive, at most 31 days apart), tz (minutes ahead of UTC), member (an email, optional). */
export function parseLeadActivityQuery(params: URLSearchParams): LeadActivityQuery {
  const instant = (name: string): number | null => {
    const v = params.get(name) || '';
    if (v.length > 40 || !ISO_RE.test(v)) return null;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  };
  const from = instant('from');
  if (from === null) return { ok: false, error: 'from must be a date and time, e.g. 2026-11-23T00:00:00Z.', field: 'from' };
  const to = instant('to');
  if (to === null) return { ok: false, error: 'to must be a date and time, e.g. 2026-11-24T00:00:00Z.', field: 'to' };
  // Real dates only: an absurd year would otherwise reach the store and come back as "not available".
  if (from < MIN_INSTANT || to > Date.now() + 366 * DAY_MS) return { ok: false, error: 'Pick dates between 2020 and now.', field: from < MIN_INSTANT ? 'from' : 'to' };
  if (to <= from) return { ok: false, error: 'The end date must be after the start date.', field: 'to' };
  // One hour of slack so a 31-day range across a clock change is still accepted.
  if (to - from > LEAD_ACTIVITY_LIMITS.maxRangeDays * DAY_MS + 3600 * 1000) {
    return { ok: false, error: `Pick a range of ${LEAD_ACTIVITY_LIMITS.maxRangeDays} days or less.`, field: 'to' };
  }
  const tzRaw = params.get('tz');
  let tzOffsetMin = 0;
  if (tzRaw !== null && tzRaw !== '') {
    if (!/^-?\d{1,3}$/.test(tzRaw) || Math.abs(Number(tzRaw)) > 14 * 60) return { ok: false, error: 'tz must be minutes ahead of UTC (-840 to 840).', field: 'tz' };
    tzOffsetMin = Number(tzRaw);
  }
  const member = (params.get('member') || '').trim().toLowerCase();
  if (member.length > 320) return { ok: false, error: 'member is not a valid email address.', field: 'member' };
  return { ok: true, from: new Date(from).toISOString(), to: new Date(to).toISOString(), tzOffsetMin, member };
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** The LinkedIn link shown beside a lead: http(s) on linkedin.com only, so the report can't carry a link to anywhere else. */
const httpLink = (v: unknown): string => {
  const s = text(v, 500);
  if (!/^https?:\/\/[^\s<>"'\\]+$/i.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.username || u.password) return '';
    const host = u.hostname.toLowerCase();
    return host === 'linkedin.com' || host.endsWith('.linkedin.com') ? u.href : '';
  } catch {
    return '';
  }
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

interface Tick {
  actor: string;
  actorName: string;
  key: string;
  at: number;
  leadKey: string;
  name: string;
  company: string;
  title: string;
  linkedinUrl: string;
}

/**
 * `events`: one workspace's 'lead.activity' events. `only`: lower-cased email to keep (the viewer
 * for anyone below Supervisor, or the picked person), or '' for everyone. `nameOf`: display name
 * from the member list.
 */
export function buildLeadActivityRows(
  events: readonly IntegrationEvent[],
  opts: { from: string; to: string; tzOffsetMin: number; only: string; nameOf: (email: string) => string | undefined },
): LeadActivityRep[] {
  const from = Date.parse(opts.from);
  const to = Date.parse(opts.to);
  const unticked = new Set<string>();
  const ticks = new Map<string, Tick>();
  for (const e of events) {
    const actor = (e.actorEmail || '').trim().toLowerCase();
    if (!actor || (opts.only && actor !== opts.only)) continue;
    const payload = obj(e.payload);
    const data = obj(payload.data);
    const activity = obj(data.activity);
    const key = text(activity.key, 80);
    const footprintId = text(activity.footprintId, 80);
    if (!leadActivityLabel(key) || !footprintId) continue;
    const id = `${actor}\n${footprintId}`;
    if (activity.action === 'unticked') {
      unticked.add(id);
      continue;
    }
    if (activity.action !== 'ticked') continue;
    const at = Date.parse(text(payload.occurredAt, 40));
    if (!Number.isFinite(at) || at < from || at >= to) continue;
    const c = obj(data.contact);
    const name = text(c.name, 200);
    const company = text(c.company, 200);
    // The same lead is the same row: the browser's contact id, else its email, else name + company.
    const leadKey = text(c.id, 100) || text(c.email, 320).toLowerCase() || `${name.toLowerCase()}|${company.toLowerCase()}`;
    if (!ticks.has(id)) {
      ticks.set(id, { actor, actorName: text(obj(payload.actor).name, 120), key, at, leadKey, name: name || company || 'Unnamed lead', company, title: text(c.title, 200), linkedinUrl: httpLink(c.linkedinUrl) });
    }
  }

  const reps = new Map<string, { rep: LeadActivityRep; days: Map<string, Map<string, LeadActivityRep['days'][number]['leads'][number] & { last: number }>> }>();
  const kept = [...ticks.entries()].filter(([id]) => !unticked.has(id)).map(([, t]) => t).sort((a, b) => a.at - b.at);
  for (const t of kept) {
    let r = reps.get(t.actor);
    if (!r) {
      r = { rep: { email: t.actor, name: opts.nameOf(t.actor) || t.actorName || t.actor, total: 0, totals: {}, days: [] }, days: new Map() };
      reps.set(t.actor, r);
    }
    r.rep.total += 1;
    r.rep.totals[t.key] = (r.rep.totals[t.key] || 0) + 1;
    const day = new Date(t.at + opts.tzOffsetMin * 60_000).toISOString().slice(0, 10);
    let leads = r.days.get(day);
    if (!leads) r.days.set(day, (leads = new Map()));
    let lead = leads.get(t.leadKey);
    if (!lead) leads.set(t.leadKey, (lead = { name: t.name, company: t.company, title: t.title, linkedinUrl: t.linkedinUrl, activities: [], last: 0 }));
    lead.activities.push({ key: t.key, label: leadActivityLabel(t.key) as string, at: new Date(t.at).toISOString() });
    lead.last = t.at;
  }
  return [...reps.values()]
    .map(({ rep, days }) => ({
      ...rep,
      days: [...days.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, leads]) => ({ day, leads: [...leads.values()].sort((a, b) => b.last - a.last).map(({ last: _last, ...lead }) => (void _last, lead)) })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
