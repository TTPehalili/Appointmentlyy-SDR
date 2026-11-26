/**
 * Support step 2 (AI triage, auto answers, SLA, release-linked resolution replies): the shared, pure part. Used by the
 * server (src/lib/server/supportAutomation.ts, supportAi.ts), the owner queue and the client desk. No server or
 * browser APIs here.
 *
 * Owner decisions (fixed): SLA Critical 1 hour, High 4 hours, Normal 1 business day (Mon-Fri, Manila calendar).
 */

export type TriageType = 'bug' | 'how_to' | 'feature_request' | 'billing' | 'account' | 'other';
export type Severity = 'critical' | 'high' | 'normal';
/** none = filed before step 2 (never triaged); pending = waiting for the AI; done / failed / skipped = finished. */
export type TriageState = 'none' | 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type FixState = 'none' | 'fix_ready' | 'sending' | 'sent';

export const TRIAGE_TYPES: TriageType[] = ['bug', 'how_to', 'feature_request', 'billing', 'account', 'other'];
export const SEVERITIES: Severity[] = ['critical', 'high', 'normal'];

export const TRIAGE_TYPE_LABEL: Record<TriageType, string> = {
  bug: 'Bug',
  how_to: 'How-to question',
  feature_request: 'Feature request',
  billing: 'Billing',
  account: 'Account',
  other: 'Other',
};
export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', normal: 'Normal' };
/** The SLA window in words, as the reporter reads it. */
export const SLA_WORDS: Record<Severity, string> = { critical: '1 hour', high: '4 hours', normal: '1 business day' };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Business days follow the Manila calendar (UTC+8, no daylight saving). */
const MANILA_OFFSET_MS = 8 * HOUR;
const isWeekendManila = (ms: number) => {
  const d = new Date(ms + MANILA_OFFSET_MS).getUTCDay();
  return d === 0 || d === 6;
};

/** When a ticket of this severity filed at `fromIso` is due (resolution target). */
export function slaDueAt(fromIso: string, severity: Severity): string {
  const from = Date.parse(fromIso);
  const start = Number.isFinite(from) ? from : Date.now();
  if (severity === 'critical') return new Date(start + HOUR).toISOString();
  if (severity === 'high') return new Date(start + 4 * HOUR).toISOString();
  // 1 business day: the next weekday (Manila) at the same clock time.
  let t = start + DAY;
  while (isWeekendManila(t)) t += DAY;
  return new Date(t).toISOString();
}

/** The reporter's own choice decides the floor: "Blocking my work" is always Critical. */
export function severityFromPriority(priority: string): Severity {
  if (priority === 'urgent') return 'critical';
  if (priority === 'high') return 'high';
  return 'normal';
}
const RANK: Record<Severity, number> = { normal: 0, high: 1, critical: 2 };
export const maxSeverity = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
/** The ticket priority a severity implies (normal keeps whatever the ticket had). */
export function priorityForSeverity(s: Severity, current: string): 'urgent' | 'high' | 'medium' | 'low' {
  if (s === 'critical') return 'urgent';
  if (s === 'high') return 'high';
  return current === 'low' ? 'low' : 'medium';
}

/** A due time in words for the reporter, in their own time zone when we know a valid one. */
export function dueInWords(dueIso: string, timeZone?: string | null): string {
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d);
  if (timeZone) {
    try {
      return fmt(timeZone);
    } catch {
      /* unknown zone: fall through */
    }
  }
  return fmt('Asia/Manila');
}

// ------------------------------------------------------------------ what a ticket carries (staff view)

export interface EngineeringBrief {
  summary: string;
  reproSteps: string[];
  suspectedArea: string;
  suspectedFiles: string[];
  checks: string[];
}

/** What the AI decided (checked field by field against this shape before it is stored). */
export interface AiTriage {
  type: TriageType;
  severity: Severity;
  area: string;
  /** 0..1, the model's confidence in the classification. */
  confidence: number;
  /** One line for the queue (internal). */
  summary: string;
  /** A plain-English reply the owner can send as is or edit (customer-safe: no links, no internal detail). */
  replyDraft: string;
  /** For how-to questions: an answer grounded ONLY in Help center articles, with their ids. */
  howTo: { answer: string; citations: string[]; confidence: number } | null;
  /** For bugs (staff only). */
  brief: EngineeringBrief | null;
}

export interface TicketTriage {
  /** null when the AI did not decide (turned off, no key, daily cap reached, no answer, or an answer that failed the checks). */
  ai: AiTriage | null;
  /** An open ticket that looks like the same problem (found by text similarity, never by the AI). Staff only. */
  duplicateOf: { id: string; subject: string; tenantName: string; score: number } | null;
  model: string;
  at: string;
  /** Why the AI did not decide, or why an answer was not sent automatically, in plain words. */
  reason: string;
}

export interface TicketAutomation {
  triageState: TriageState;
  triageAttempts: number;
  triageClaimedAt: string | null;
  triage: TicketTriage | null;
  severity: Severity | null;
  slaDueAt: string | null;
  /** Set once, when the "needs more time" update went out (the SLA passed unresolved). */
  slaBreachAt: string | null;
  workingEmailAt: string | null;
  autoAnswerAt: string | null;
  fix: {
    state: FixState;
    sha: string | null;
    reply: string;
    markedBy: string;
    markedAt: string | null;
    /** When a server claimed the send (state "sending"). */
    claimedAt: string | null;
    sentAt: string | null;
  };
}

/** What a client (Supervisor / Admin / the reporter) may see of the automation: never the brief, drafts or links. */
export interface TicketSupportSummary {
  type: TriageType | null;
  severity: Severity | null;
  slaDueAt: string | null;
}

export const RELEASE_SHA_RE = /^[0-9a-f]{7,40}$/;
export const normalizeSha = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return RELEASE_SHA_RE.test(s) ? s : null;
};
/** A linked sha (7-40 chars) matches the deployed commit when one is a prefix of the other (both at least 7). */
export function shaMatches(linked: string | null | undefined, deployed: string | null | undefined): boolean {
  const a = normalizeSha(linked);
  const b = normalizeSha(deployed);
  if (!a || !b) return false;
  return a.length <= b.length ? b.startsWith(a) : a.startsWith(b);
}

/** True when the SLA has passed and the ticket is still being worked on (waiting on the customer pauses it). */
export function slaPassed(a: Pick<TicketAutomation, 'slaDueAt'>, status: string, now = Date.now()): boolean {
  if (!a.slaDueAt) return false;
  if (status !== 'open' && status !== 'in_progress') return false;
  return Date.parse(a.slaDueAt) < now;
}
