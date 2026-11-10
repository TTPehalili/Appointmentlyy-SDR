/**
 * Copilot team / personal reports.
 *
 * Every number in a report is computed here, deterministically, from data the workspace really has:
 * - client workspaces: the activity log the Reports page reads (activityStore), same classification rules;
 * - the demo workspace (APPOINTMENTLYY): the Reports page's sample rep performance, flagged as sample.
 * The AI only writes words around these figures (see /api/assistant/query), and its text is checked so it
 * can't introduce numbers that aren't here.
 *
 * Plain module (no 'use client', no browser APIs): the panel and the route both import it.
 */
import type { CadenceActivityRecord } from '@/lib/activityStore';

// ------------------------------------------------------------------ periods

export type ReportPeriod = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'last_7_days';
const PERIODS: ReportPeriod[] = ['today', 'yesterday', 'this_week', 'last_week', 'last_7_days'];

/** "today", "yesterday", "this week", "last week", "last 7 days"; anything else is this week. */
export function parseReportPeriod(question: string): ReportPeriod {
  const q = question.toLowerCase();
  if (/\b(last|past|previous)\s*(7|seven)\s*days?\b/.test(q)) return 'last_7_days';
  if (/\b(last|previous|past)\s+week\b/.test(q)) return 'last_week';
  if (/\byesterday\b/.test(q)) return 'yesterday';
  if (/\b(today|tonight|this morning|this afternoon|so far today|eod|end of (the )?day|daily)\b/.test(q)) return 'today';
  return 'this_week';
}

export interface PeriodRange {
  period: ReportPeriod;
  /** "This week" */
  label: string;
  /** "Mon, Nov 9 – Tue, Nov 10, 2026" */
  rangeLabel: string;
  start: number;
  end: number;
  prevStart: number;
  prevEnd: number;
  /** "same point last week" */
  previousLabel: string;
}

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** Weeks start on Monday. */
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

function fmtDay(d: Date, withYear: boolean) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}
function fmtRange(start: Date, lastDay: Date) {
  if (start.toDateString() === lastDay.toDateString()) return fmtDay(start, true);
  return `${fmtDay(start, false)} – ${fmtDay(lastDay, true)}`;
}

export function periodRange(period: ReportPeriod, now = new Date()): PeriodRange {
  const today = startOfDay(now);
  // "Now"-based ranges end a minute ahead so an activity logged this second still counts.
  const soon = now.getTime() + 60_000;
  const mk = (label: string, start: Date, end: number, lastDay: Date, prevStart: Date, prevEnd: number, previousLabel: string): PeriodRange => ({
    period,
    label,
    rangeLabel: fmtRange(start, lastDay),
    start: start.getTime(),
    end,
    prevStart: prevStart.getTime(),
    prevEnd,
    previousLabel,
  });
  switch (period) {
    case 'today':
      return mk('Today', today, soon, today, addDays(today, -1), now.getTime() - 86_400_000, 'same time yesterday');
    case 'yesterday': {
      const y = addDays(today, -1);
      return mk('Yesterday', y, today.getTime(), y, addDays(y, -1), y.getTime(), 'the day before');
    }
    case 'last_week': {
      const w = startOfWeek(now);
      const lw = addDays(w, -7);
      return mk('Last week', lw, w.getTime(), addDays(w, -1), addDays(lw, -7), lw.getTime(), 'the week before');
    }
    case 'last_7_days': {
      const s = addDays(today, -6);
      return mk('Last 7 days', s, soon, today, addDays(s, -7), s.getTime(), 'the 7 days before');
    }
    default: {
      const w = startOfWeek(now);
      return mk('This week', w, soon, today, addDays(w, -7), now.getTime() - 7 * 86_400_000, 'same point last week');
    }
  }
}

// ------------------------------------------------------------------ intents

export type CopilotIntent =
  | 'report'
  | 'coaching'
  | 'objection_stats'
  | 'personal'
  | 'objection_help'
  | 'email'
  | 'linkedin'
  | 'chat';

/** What the person is asking for. Order matters: the specific asks win over the general ones. */
export function detectCopilotIntent(question: string): CopilotIntent {
  const q = question.toLowerCase().replace(/[’']/g, "'");
  if (/linked\s?in/.test(q) && /\b(post|article|message|note|connection|dm|comment|caption)\b/.test(q)) return 'linkedin';
  if (
    /\b(e-?mails?|follow[- ]?up|reply|inmail)\b/.test(q) &&
    /\b(write|draft|compose|rewrite|shorten|shorter|create|make|send|reply|follow[- ]?up)\b/.test(q) &&
    !/\b(report|subject lines?)\b/.test(q)
  )
    return 'email';
  const reportAsk =
    /\b(generate|create|write|draft|make|build|prepare|give me|send|need|want)\b.*\breport\b/.test(q) ||
    /\b(daily|weekly|team|floor|activity|performance|eod|end of day|manager|status)\s+report\b/.test(q) ||
    /\breport (for|on)\b/.test(q) ||
    /\bwrite (it|this|that) up\b/.test(q) ||
    /\b(recap|wrap[- ]?up)\b/.test(q);
  if (reportAsk) return 'report';
  if (/\b(top|most common|biggest|main|frequent|common|which|what)\b.*\bobjections?\b/.test(q) && !/\b(handle|handling|respond|answer|overcome|rebut)\b/.test(q))
    return 'objection_stats';
  if (/\bcoach(ing|ed)?\b|\bneeds? (help|support)\b|\bstruggling\b|\bunderperform|\bwho('s| is) (behind|lagging|struggling)\b/.test(q)) return 'coaching';
  if (/\bmy (activity|numbers|stats|week|day|performance|calls|results)\b|\bhow am i doing\b|\bhow did i do\b/.test(q)) return 'personal';
  if (
    /\b(objections?|rebuttals?|push ?back|brush[- ]?off|handle|handling|overcome|respond to|what do i say|what should i say)\b/.test(q) ||
    /\b(no budget|not interested|already have|send me an email|too expensive|how much|bad time|not a good time)\b/.test(q)
  )
    return 'objection_help';
  return 'chat';
}

// ------------------------------------------------------------------ classification (matches the Reports page)

const isBooked = (d: string) => /book|meeting|appointment/i.test(d);
const isDnc = (d: string) => /dnc|do not call|do-not-call/i.test(d);
const isNotInterested = (d: string) => /not interested/i.test(d);
const isCallback = (d: string) => /callback|call back|scheduled/i.test(d);
const isNoConnect = (d: string) => /no answer|voicemail|busy|wrong number|disconnected/i.test(d);
/** A connect that reached a real conversation (not a gatekeeper block or hang-up). */
const isNotConversation = (d: string) => /gatekeeper|no transfer|wrong person|hung up|hang up/i.test(d);

export const OBJECTION_RULES: { label: string; presetId?: string; re: RegExp; onlyIfNone?: boolean }[] = [
  { label: 'No budget', presetId: 'OBJ_NO_BUDGET', re: /no budget|\bbudget\b|fiscal year|can'?t afford|cannot afford/i },
  { label: 'Price / cost', presetId: 'OBJ_PRICING', re: /\bprice\b|\bpricing\b|too expensive|\bcosts?\b|how much|rates? (is|are) too high/i },
  {
    label: 'Already have a vendor or team',
    presetId: 'OBJ_HAVE_TEAM',
    re: /competitor|agency|vendor|incumbent|already (have|use|work)|in-house|internal team|our own team|existing provider|under contract|locked in/i,
  },
  { label: 'Send me an email / busy', presetId: 'OBJ_SEND_EMAIL', re: /send (me )?(an |some )?(e-?mail|info)|\bbusy\b|bad time|not a good time|in a meeting/i },
  { label: 'Timing / not now', re: /not now|next quarter|next year|maybe later|bad timing|revisit|circle back/i },
  { label: 'Not the decision-maker', re: /decision[- ]maker|not my (call|decision|department)|wrong person|talk to (my|the) (boss|manager)/i },
  { label: 'How did you get my number?', presetId: 'OBJ_HOW_DID_YOU_GET_NUMBER', re: /how did you get (my|this) (number|details)|where did you get/i },
  { label: 'Not interested', presetId: 'OBJ_NOT_INTERESTED', re: /not interested/i, onlyIfNone: true },
];

/** The text an objection can be read from: the outcome, plus the rep's own notes (not the log template). */
function objectionText(a: CadenceActivityRecord): string {
  const notes = a.notesSnippet || '';
  let own = notes;
  if (notes.includes('===')) {
    const i = notes.indexOf('REP NOTES:');
    own = i >= 0 ? notes.slice(i + 'REP NOTES:'.length) : '';
  }
  return `${a.disposition || ''}\n${own}`;
}

function objectionsOf(a: CadenceActivityRecord): string[] {
  const text = objectionText(a);
  const hits = OBJECTION_RULES.filter((r) => !r.onlyIfNone && r.re.test(text)).map((r) => r.label);
  if (hits.length === 0) {
    const fallback = OBJECTION_RULES.filter((r) => r.onlyIfNone && r.re.test(text)).map((r) => r.label);
    return fallback;
  }
  return hits;
}

// ------------------------------------------------------------------ report data

export interface ReportTotals {
  activities: number;
  dials: number;
  connects: number;
  /** null when the source doesn't record it (demo sample). */
  conversations: number | null;
  connectRate: number | null;
  meetings: number;
  callbacks: number;
  notInterested: number;
  dnc: number;
  emails: number;
  linkedin: number;
  /** Demo sample only: booked-meeting target. */
  meetingTarget: number | null;
}

export interface ReportRepRow {
  name: string;
  activities: number;
  dials: number;
  connects: number;
  connectRate: number | null;
  conversations: number | null;
  meetings: number;
  callbacks: number;
  notInterested: number;
  emails: number;
  linkedin: number;
  meetingTarget: number | null;
}

export interface ReportCount {
  label: string;
  count: number;
}

export interface ReportData {
  version: 1;
  source: 'activity_log' | 'demo_sample';
  scope: 'team' | 'rep';
  repName?: string;
  period: ReportPeriod;
  periodLabel: string;
  rangeLabel: string;
  previousLabel: string;
  totals: ReportTotals;
  /** Same metrics for the comparison window; null when there's nothing to compare with. */
  previous: ReportTotals | null;
  reps: ReportRepRow[];
  repCount: number;
  outcomes: ReportCount[];
  objections: ReportCount[];
  /** Activity logged in the workspace at any time (helps say "nothing this week, last call was …"). */
  allTimeActivities: number;
  lastActivityAt: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const rate = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);

function emptyTotals(): ReportTotals {
  return {
    activities: 0,
    dials: 0,
    connects: 0,
    conversations: 0,
    connectRate: null,
    meetings: 0,
    callbacks: 0,
    notInterested: 0,
    dnc: 0,
    emails: 0,
    linkedin: 0,
    meetingTarget: null,
  };
}

function tally(list: CadenceActivityRecord[]): ReportTotals {
  const t = emptyTotals();
  for (const a of list) {
    const d = a.disposition || '';
    t.activities++;
    if (a.channel === 'Phone') {
      t.dials++;
      if (!isNoConnect(d)) {
        t.connects++;
        if (!isNotConversation(d)) t.conversations = (t.conversations ?? 0) + 1;
      }
    } else if (a.channel === 'Email') t.emails++;
    else if (a.channel === 'LinkedIn') t.linkedin++;
    if (isBooked(d)) t.meetings++;
    if (isDnc(d)) t.dnc++;
    if (isNotInterested(d)) t.notInterested++;
    if (isCallback(d)) t.callbacks++;
  }
  t.connectRate = rate(t.connects, t.dials);
  return t;
}

function topCounts(values: string[], limit: number): ReportCount[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const sortReps = (rows: ReportRepRow[]) =>
  rows.sort((a, b) => b.meetings - a.meetings || b.dials - a.dials || b.activities - a.activities || a.name.localeCompare(b.name));

const MAX_REPS = 25;

/** Real workspaces: the report computed from the activity log (team, or one rep when repName is given). */
export function computeActivityReport(
  all: CadenceActivityRecord[],
  period: ReportPeriod,
  opts: { repName?: string; now?: Date } = {},
): ReportData {
  const range = periodRange(period, opts.now);
  const mine = opts.repName ? opts.repName.trim().toLowerCase() : '';
  const scoped = mine ? all.filter((a) => (a.repName || '').trim().toLowerCase() === mine) : all;
  const at = (a: CadenceActivityRecord) => Date.parse(a.isoDate);
  const inRange = scoped.filter((a) => {
    const t = at(a);
    return !isNaN(t) && t >= range.start && t < range.end;
  });
  const inPrev = scoped.filter((a) => {
    const t = at(a);
    return !isNaN(t) && t >= range.prevStart && t < range.prevEnd;
  });

  const byRep = new Map<string, CadenceActivityRecord[]>();
  for (const a of inRange) {
    const name = (a.repName || '').trim() || 'Unassigned';
    byRep.set(name, [...(byRep.get(name) || []), a]);
  }
  const reps = sortReps(
    [...byRep.entries()].map(([name, list]) => {
      const t = tally(list);
      return {
        name,
        activities: t.activities,
        dials: t.dials,
        connects: t.connects,
        connectRate: t.connectRate,
        conversations: t.conversations,
        meetings: t.meetings,
        callbacks: t.callbacks,
        notInterested: t.notInterested,
        emails: t.emails,
        linkedin: t.linkedin,
        meetingTarget: null,
      };
    }),
  );

  const latest = scoped.reduce((max, a) => {
    const t = at(a);
    return !isNaN(t) && t > max ? t : max;
  }, 0);
  const prev = tally(inPrev);

  return {
    version: 1,
    source: 'activity_log',
    scope: mine ? 'rep' : 'team',
    ...(mine ? { repName: opts.repName!.trim() } : {}),
    period: range.period,
    periodLabel: range.label,
    rangeLabel: range.rangeLabel,
    previousLabel: range.previousLabel,
    totals: tally(inRange),
    previous: prev.activities > 0 ? prev : null,
    reps: reps.slice(0, MAX_REPS),
    repCount: reps.length,
    outcomes: topCounts(inRange.map((a) => (a.disposition || '').trim()), 8),
    objections: topCounts(inRange.flatMap(objectionsOf), 6),
    allTimeActivities: scoped.length,
    lastActivityAt: latest ? new Date(latest).toISOString() : null,
  };
}

/** Shape of the Reports page's sample rep rows (demo workspace only). */
export interface DemoRepMetric {
  name: string;
  tenant: string;
  callsMade: number;
  connectRate: number;
  emailsSent: number;
  linkedInTouches: number;
  appointmentsBooked: number;
  quotaTarget: number;
  dncFlagged: number;
  notInterested: number;
  callbacksScheduled: number;
}

/**
 * Sample objection tallies that go with the Reports page's sample week / day (demo workspace only).
 * They are part of the demo dataset sent to the route, so the report can still only cite them.
 */
const DEMO_SAMPLE_OBJECTIONS: Record<'day' | 'week', ReportCount[]> = {
  week: [
    { label: 'Price / cost', count: 61 },
    { label: 'Already have a vendor or team', count: 48 },
    { label: 'Send me an email / busy', count: 39 },
    { label: 'No budget', count: 27 },
    { label: 'Not the decision-maker', count: 18 },
  ],
  day: [
    { label: 'Price / cost', count: 12 },
    { label: 'Already have a vendor or team', count: 10 },
    { label: 'Send me an email / busy', count: 8 },
    { label: 'No budget', count: 6 },
    { label: 'Not the decision-maker', count: 4 },
  ],
};

/** Demo workspace: the report built from the same sample rows the Reports page shows. */
export function demoReport(
  rowsForPeriod: DemoRepMetric[],
  period: ReportPeriod,
  opts: { tenantName: string; repName?: string; now?: Date },
): ReportData {
  const range = periodRange(period, opts.now);
  // Same tenant scoping as the Reports page: matching rows, else every sample row.
  const matched = rowsForPeriod.filter((r) => r.tenant.toLowerCase() === opts.tenantName.toLowerCase());
  let rows = matched.length ? matched : rowsForPeriod;
  if (opts.repName) {
    const me = rows.find((r) => r.name.toLowerCase() === opts.repName!.trim().toLowerCase());
    // The Reports page shows the first sample rep as "you" when the name isn't in the sample.
    rows = me ? [me] : rows.slice(0, 1);
  }
  const reps = sortReps(
    rows.map((r) => {
      const connects = Math.round((r.callsMade * r.connectRate) / 100);
      return {
        name: r.name,
        activities: r.callsMade + r.emailsSent + r.linkedInTouches,
        dials: r.callsMade,
        connects,
        connectRate: r.connectRate,
        conversations: null,
        meetings: r.appointmentsBooked,
        callbacks: r.callbacksScheduled,
        notInterested: r.notInterested,
        emails: r.emailsSent,
        linkedin: r.linkedInTouches,
        meetingTarget: r.quotaTarget,
      };
    }),
  );
  const sum = (k: keyof DemoRepMetric) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const dials = sum('callsMade');
  const connects = reps.reduce((s, r) => s + r.connects, 0);
  const totals: ReportTotals = {
    activities: dials + sum('emailsSent') + sum('linkedInTouches'),
    dials,
    connects,
    conversations: null,
    connectRate: rate(connects, dials),
    meetings: sum('appointmentsBooked'),
    callbacks: sum('callbacksScheduled'),
    notInterested: sum('notInterested'),
    dnc: sum('dncFlagged'),
    emails: sum('emailsSent'),
    linkedin: sum('linkedInTouches'),
    meetingTarget: sum('quotaTarget'),
  };
  const isDay = period === 'today' || period === 'yesterday';
  return {
    version: 1,
    source: 'demo_sample',
    scope: opts.repName ? 'rep' : 'team',
    ...(opts.repName ? { repName: reps[0]?.name || opts.repName } : {}),
    period: range.period,
    periodLabel: range.label,
    rangeLabel: range.rangeLabel,
    previousLabel: range.previousLabel,
    totals,
    previous: null,
    reps: reps.slice(0, MAX_REPS),
    repCount: reps.length,
    outcomes: [
      { label: 'Meeting booked', count: totals.meetings },
      { label: 'Callback scheduled', count: totals.callbacks },
      { label: 'Not interested', count: totals.notInterested },
      { label: 'Do not call', count: totals.dnc },
    ].filter((o) => o.count > 0),
    objections: opts.repName ? [] : DEMO_SAMPLE_OBJECTIONS[isDay ? 'day' : 'week'],
    allTimeActivities: totals.activities,
    lastActivityAt: null,
  };
}

// ------------------------------------------------------------------ sanitising what the browser sends

const num = (v: unknown, max = 10_000_000): number | null => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
};
const int = (v: unknown) => {
  const n = num(v);
  return n === null ? 0 : Math.round(n);
};
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');

function cleanTotals(v: unknown): ReportTotals | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const t: ReportTotals = {
    activities: int(o.activities),
    dials: int(o.dials),
    connects: int(o.connects),
    conversations: o.conversations === null ? null : int(o.conversations),
    connectRate: num(o.connectRate, 100),
    meetings: int(o.meetings),
    callbacks: int(o.callbacks),
    notInterested: int(o.notInterested),
    dnc: int(o.dnc),
    emails: int(o.emails),
    linkedin: int(o.linkedin),
    meetingTarget: o.meetingTarget === null || o.meetingTarget === undefined ? null : int(o.meetingTarget),
  };
  if (t.connects > t.dials) t.connects = t.dials;
  // Recompute the rate so it always agrees with the counts it is built from.
  t.connectRate = t.dials > 0 ? rate(t.connects, t.dials) : null;
  return t;
}

/** Validate a report the browser computed: types, ranges and sizes. Unknown shapes are dropped. */
export function sanitizeReportData(v: unknown): ReportData | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return null;
  const source = o.source === 'demo_sample' ? 'demo_sample' : o.source === 'activity_log' ? 'activity_log' : null;
  const totals = cleanTotals(o.totals);
  if (!source || !totals) return null;
  const period = PERIODS.includes(o.period as ReportPeriod) ? (o.period as ReportPeriod) : 'this_week';
  const counts = (x: unknown, limit: number): ReportCount[] =>
    (Array.isArray(x) ? x : [])
      .slice(0, limit)
      .map((c) => ({ label: str((c as ReportCount)?.label, 80), count: int((c as ReportCount)?.count) }))
      .filter((c) => c.label && c.count > 0);
  const reps: ReportRepRow[] = (Array.isArray(o.reps) ? o.reps : []).slice(0, MAX_REPS).flatMap((r) => {
    const t = cleanTotals(r);
    const name = str((r as ReportRepRow)?.name, 80);
    if (!t || !name) return [];
    return [
      {
        name,
        activities: t.activities,
        dials: t.dials,
        connects: t.connects,
        connectRate: t.connectRate,
        conversations: t.conversations,
        meetings: t.meetings,
        callbacks: t.callbacks,
        notInterested: t.notInterested,
        emails: t.emails,
        linkedin: t.linkedin,
        meetingTarget: t.meetingTarget,
      },
    ];
  });
  const scope = o.scope === 'rep' ? 'rep' : 'team';
  return {
    version: 1,
    source,
    scope,
    ...(scope === 'rep' && str(o.repName, 80) ? { repName: str(o.repName, 80) } : {}),
    period,
    periodLabel: str(o.periodLabel, 40) || 'This week',
    rangeLabel: str(o.rangeLabel, 60),
    previousLabel: str(o.previousLabel, 40) || 'the previous period',
    totals,
    previous: cleanTotals(o.previous),
    reps,
    repCount: Math.max(int(o.repCount), reps.length),
    outcomes: counts(o.outcomes, 8),
    objections: counts(o.objections, 6),
    allTimeActivities: Math.max(int(o.allTimeActivities), totals.activities),
    lastActivityAt: typeof o.lastActivityAt === 'string' && !isNaN(Date.parse(o.lastActivityAt)) ? new Date(o.lastActivityAt).toISOString() : null,
  };
}

// ------------------------------------------------------------------ the email report

export interface ReportEmail {
  kind: 'report_email';
  subject: string;
  greeting: string;
  /** Two short lines. */
  summary: string[];
  metrics: { label: string; value: string }[];
  leaderboard: { columns: string[]; rows: string[][] } | null;
  wins: string[];
  risks: string[];
  nextSteps: string[];
  signoff: string;
  periodLabel: string;
  rangeLabel: string;
  /** Demo workspace sample data. */
  sample: boolean;
  /** Shown in the panel, never in the email. */
  note?: string;
  /** How the words were written: the AI around computed numbers, or the deterministic draft. */
  writer: 'ai' | 'rules';
}

export type DataQuality = 'none' | 'thin' | 'ok';

export function dataQuality(d: ReportData): DataQuality {
  if (d.totals.activities === 0) return 'none';
  if (d.totals.activities < 10 && d.totals.dials < 10) return 'thin';
  return 'ok';
}

export const fmtInt = (n: number) => n.toLocaleString('en-US');
const fmtPct = (n: number | null) => (n === null ? 'n/a' : `${n}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

function delta(cur: number, prev: number | undefined | null, prevLabel: string): string {
  if (prev === undefined || prev === null) return '';
  const d = cur - prev;
  if (d === 0) return ` (same as ${prevLabel})`;
  return ` (${d > 0 ? '+' : '−'}${fmtInt(Math.abs(d))} vs ${prevLabel})`;
}

/** The "Key numbers" rows; every value is a count or ratio from the data. */
export function reportMetrics(d: ReportData, extra: { activeMembers?: number } = {}): { label: string; value: string }[] {
  const t = d.totals;
  const p = d.previous;
  const pl = shortPrev(d.previousLabel);
  const rows: { label: string; value: string }[] = [
    { label: 'Dials', value: fmtInt(t.dials) + delta(t.dials, p?.dials, pl) },
    { label: 'Connects', value: fmtInt(t.connects) + delta(t.connects, p?.connects, pl) },
    { label: 'Connect rate', value: fmtPct(t.connectRate) + (p && p.connectRate !== null && t.connectRate !== null ? ` (${pl}: ${p.connectRate}%)` : '') },
  ];
  if (t.conversations !== null) rows.push({ label: 'Conversations', value: fmtInt(t.conversations) + delta(t.conversations, p?.conversations ?? null, pl) });
  rows.push({ label: 'Meetings booked', value: fmtInt(t.meetings) + delta(t.meetings, p?.meetings, pl) });
  if (t.meetingTarget) rows.push({ label: 'Meetings vs target', value: `${fmtInt(t.meetings)} of ${fmtInt(t.meetingTarget)} (${Math.round((t.meetings / t.meetingTarget) * 100)}%)` });
  rows.push({ label: 'Callbacks scheduled', value: fmtInt(t.callbacks) + delta(t.callbacks, p?.callbacks, pl) });
  rows.push({ label: 'Not interested', value: fmtInt(t.notInterested) });
  if (t.dnc > 0) rows.push({ label: 'Do-not-call requests', value: fmtInt(t.dnc) });
  if (t.emails > 0 || (p?.emails ?? 0) > 0) rows.push({ label: 'Emails sent', value: fmtInt(t.emails) + delta(t.emails, p?.emails, pl) });
  if (t.linkedin > 0 || (p?.linkedin ?? 0) > 0) rows.push({ label: 'LinkedIn touches', value: fmtInt(t.linkedin) + delta(t.linkedin, p?.linkedin, pl) });
  if (d.scope === 'team') rows.push({ label: 'Reps with activity', value: fmtInt(d.repCount) + (extra.activeMembers ? ` of ${plural(extra.activeMembers, 'active member')}` : '') });
  return rows;
}

function shortPrev(label: string) {
  return label.replace(/^same point /, '').replace(/^same time /, '');
}

function leaderboard(d: ReportData): ReportEmail['leaderboard'] {
  if (d.scope !== 'team' || d.reps.length === 0) return null;
  return {
    columns: ['Rep', 'Dials', 'Connect rate', 'Meetings', 'Callbacks'],
    rows: d.reps.slice(0, 10).map((r) => [r.name, fmtInt(r.dials), fmtPct(r.connectRate), fmtInt(r.meetings), fmtInt(r.callbacks)]),
  };
}

const meetingRate = (r: ReportRepRow) => (r.dials > 0 ? r.meetings / r.dials : 0);

/** Who to coach and why, from the per-rep rows (needs a few dials before judging anyone). */
export function coachingCandidates(d: ReportData): { rep: ReportRepRow; reason: string; focus: string }[] {
  const reps = d.reps.filter((r) => r.dials >= 5);
  if (reps.length < 2) return [];
  const teamRate = d.totals.connectRate ?? 0;
  const teamMeetingRate = d.totals.dials > 0 ? d.totals.meetings / d.totals.dials : 0;
  const out: { rep: ReportRepRow; reason: string; focus: string }[] = [];
  const topObjection = d.objections[0]?.label;
  for (const r of [...reps].sort((a, b) => meetingRate(a) - meetingRate(b))) {
    if (out.length >= 3) break;
    const lowMeetings = meetingRate(r) < teamMeetingRate * 0.75;
    const lowConnect = r.connectRate !== null && r.connectRate < teamRate - 4;
    if (!lowMeetings && !lowConnect) continue;
    const reason = `${plural(r.meetings, 'meeting')} from ${plural(r.dials, 'dial')} (${fmtPct(r.connectRate)} connect rate)`;
    const focus = lowConnect
      ? 'openers and call timing to lift connects'
      : topObjection
      ? `moving connects to meetings, starting with "${topObjection}"`
      : 'moving connects to booked meetings';
    out.push({ rep: r, reason, focus });
  }
  return out;
}

/**
 * The deterministic report: always correct, used as-is when the AI is unavailable and as the
 * fallback for any AI line that fails the number check.
 */
export function composeReportEmail(
  d: ReportData,
  ctx: { tenantName: string; senderName: string; activeMembers?: number },
): ReportEmail {
  const q = dataQuality(d);
  const t = d.totals;
  const p = d.previous;
  const who = d.scope === 'rep' ? 'I' : 'The team';
  const periodLower = d.periodLabel.toLowerCase();
  const sample = d.source === 'demo_sample';
  const base = {
    kind: 'report_email' as const,
    greeting: 'Hi all,',
    metrics: reportMetrics(d, { activeMembers: ctx.activeMembers }),
    leaderboard: leaderboard(d),
    signoff: `Best,\n${ctx.senderName}`,
    periodLabel: d.periodLabel,
    rangeLabel: d.rangeLabel,
    sample,
    writer: 'rules' as const,
  };
  const subjectScope = d.scope === 'rep' ? 'My activity' : `${ctx.tenantName} team report`;

  if (q === 'none') {
    const before =
      d.allTimeActivities > 0
        ? `There are ${plural(d.allTimeActivities, 'activity', 'activities')} in the log from earlier periods${d.lastActivityAt ? `; the most recent was on ${new Date(d.lastActivityAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}.`
        : 'Nothing has been logged in the activity log yet.';
    return {
      ...base,
      subject: `${subjectScope} | ${d.periodLabel} (${d.rangeLabel}) | not enough data yet`,
      summary: [`No calls, emails or LinkedIn touches were logged for ${periodLower} (${d.rangeLabel}), so there are no results to report yet.`, before],
      wins: [],
      risks: ['Without logged activity there is no way to measure performance or spot who needs coaching.'],
      nextSteps: [
        'Log the outcome of every call in the Dialer so it counts in Reports and in this email.',
        'Make sure each rep has leads assigned in Contacts before the next call block.',
        'Ask Copilot for this report again once calls have been logged.',
      ],
      note: 'Not enough data yet: this report only uses activity logged in this workspace.',
    };
  }

  const top = [...d.reps].sort((a, b) => b.meetings - a.meetings || b.dials - a.dials)[0];
  const bestConnect = d.reps.filter((r) => r.dials >= 10 && r.connectRate !== null).sort((a, b) => (b.connectRate ?? 0) - (a.connectRate ?? 0))[0];
  const coach = coachingCandidates(d);
  const topObj = d.objections[0];
  const prevPhrase = d.previousLabel.startsWith('the ') ? d.previousLabel : `the ${d.previousLabel}`;

  const line1 = `${who} logged ${plural(t.dials, 'dial')} and booked ${plural(t.meetings, 'meeting')} ${periodLower}${t.connectRate !== null ? `, with a ${t.connectRate}% connect rate` : ''}.`;
  let line2: string;
  if (q === 'thin') line2 = `Only ${plural(t.activities, 'activity', 'activities')} were logged, so treat these numbers as early signals rather than trends.`;
  else if (p && p.meetings !== t.meetings) line2 = `Meetings are ${t.meetings > p.meetings ? 'up' : 'down'} from ${fmtInt(p.meetings)} at ${prevPhrase}${d.scope === 'team' && top && top.meetings > 0 ? `, and ${top.name} led with ${plural(top.meetings, 'meeting')}` : ''}.`;
  else if (d.scope === 'team' && top && top.meetings > 0) line2 = `${top.name} led the team with ${plural(top.meetings, 'meeting')} from ${plural(top.dials, 'dial')}.`;
  else line2 = `${plural(t.callbacks, 'callback')} ${t.callbacks === 1 ? 'is' : 'are'} scheduled to work next.`;

  const wins: string[] = [];
  if (d.scope === 'team') {
    if (top && top.meetings > 0) wins.push(`${top.name} booked the most meetings: ${plural(top.meetings, 'meeting')} from ${plural(top.dials, 'dial')}.`);
    if (bestConnect && bestConnect.name !== top?.name) wins.push(`${bestConnect.name} had the best connect rate at ${bestConnect.connectRate}% over ${plural(bestConnect.dials, 'dial')}.`);
  } else if (t.meetings > 0) wins.push(`${plural(t.meetings, 'meeting')} booked from ${plural(t.dials, 'dial')}.`);
  if (p && t.meetings > p.meetings) wins.push(`Meetings rose from ${fmtInt(p.meetings)} to ${fmtInt(t.meetings)} compared with ${prevPhrase}.`);
  if (t.meetingTarget && t.meetings >= t.meetingTarget) wins.push(`The meeting target of ${fmtInt(t.meetingTarget)} was reached.`);
  if (t.callbacks > 0) wins.push(`${plural(t.callbacks, 'callback')} scheduled, so there is warm pipeline to work next.`);

  const risks: string[] = [];
  for (const c of coach) risks.push(`${c.rep.name}: ${c.reason}. Coaching focus: ${c.focus}.`);
  if (topObj) risks.push(`"${topObj.label}" was the most common objection (${plural(topObj.count, 'time')}).`);
  if (p && t.meetings < p.meetings) risks.push(`Meetings fell from ${fmtInt(p.meetings)} to ${fmtInt(t.meetings)} compared with ${prevPhrase}.`);
  if (t.meetingTarget && t.meetings < t.meetingTarget) risks.push(`${fmtInt(t.meetingTarget - t.meetings)} meetings short of the target of ${fmtInt(t.meetingTarget)}.`);
  if (t.dnc > 0) risks.push(`${plural(t.dnc, 'do-not-call request')}: check list quality and opener tone.`);
  if (q === 'thin') risks.push('Too little activity to judge individual reps fairly yet.');
  if (risks.length === 0) risks.push('No clear risks in this period’s numbers.');

  const nextSteps: string[] = [];
  nextSteps.push(
    topObj
      ? `Run a short drill on "${topObj.label}" in Practice › Mock dialer before the next call block.`
      : 'Note the objections you hear in the Dialer call notes so the next report can show what blocks meetings.',
  );
  if (coach[0] && top && top.name !== coach[0].rep.name) nextSteps.push(`Pair ${coach[0].rep.name} with ${top.name} for a call review this week.`);
  else if (q === 'thin') nextSteps.push('Log every call outcome in the Dialer so next week’s report has a fuller picture.');
  else nextSteps.push('Review two recorded calls at stand-up and share the best opener with the team.');
  nextSteps.push(t.callbacks > 0 ? `Work the ${plural(t.callbacks, 'scheduled callback')} before starting new dials.` : 'Agree a daily dial target per rep and check it at stand-up.');

  return {
    ...base,
    subject: `${subjectScope} | ${d.periodLabel} (${d.rangeLabel}) | ${plural(t.meetings, 'meeting')} booked`,
    summary: [line1, line2],
    wins: wins.slice(0, 4),
    risks: risks.slice(0, 4),
    nextSteps: nextSteps.slice(0, 3),
    ...(sample
      ? { note: 'Sample data: the demo workspace uses the same sample numbers as Reports.' }
      : q === 'thin'
      ? { note: `Based on ${plural(t.activities, 'logged activity', 'logged activities')}. Log call outcomes in the Dialer for a fuller report.` }
      : { note: 'Numbers come from the activity log behind Reports.' }),
  };
}

// ------------------------------------------------------------------ number guard for AI text

const normNum = (s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : s;
};

/** Every number that appears anywhere in the given values (data, deterministic text). */
export function knownNumbers(...sources: unknown[]): Set<string> {
  const set = new Set<string>();
  const text = sources.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join(' ');
  for (const m of text.match(/\d[\d,]*(?:\.\d+)?/g) || []) set.add(normNum(m));
  return set;
}

/** True when every number in the text is one the data contains (durations like "15-minute" are fine). */
export function usesOnlyKnownNumbers(text: string, known: Set<string>): boolean {
  const re = /(?<![A-Za-z])(\d[\d,]*(?:\.\d+)?)(\s*-?\s*(minutes?|mins?|seconds?|secs?)\b)?/g;
  const body = text.replace(/^\s*\d+[.)]\s+/gm, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[2]) continue;
    if (!known.has(normNum(m[1]))) return false;
  }
  return true;
}
