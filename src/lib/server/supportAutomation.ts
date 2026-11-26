/**
 * Server only. Support step 2: what happens to a ticket on its own after it is filed.
 *
 *   1. Triage (runTriage): every new ticket goes to the support AI (supportAi.ts) right after the response, never
 *      blocking or failing the submit. Result, severity and SLA target are stored on the ticket.
 *   2. How-to questions: answered from the Help center and resolved automatically, ONLY when the AI is confident,
 *      cites Help articles, and nothing in the report looks aimed at the AI. Otherwise the draft waits for a person.
 *   3. Bugs: the reporter gets "we're working on it" with the SLA target (Critical 1 hour, High 4 hours, Normal 1
 *      business day).
 *   4. Fix ready + release: the owner (or the PM, through /api/tickets/releases) links a ticket to a release commit
 *      with a resolution reply. Once THIS server runs that commit (RAILWAY_GIT_COMMIT_SHA, set by Railway on GitHub
 *      deploys) and has been healthy for a while, the reply goes out and the ticket is Resolved. Nothing here deploys
 *      anything, and nothing is sent for a commit that is not the one running.
 *   5. SLA watcher: a ticket past its SLA, unresolved, gets ONE "needs more time" update.
 *
 * Every step is a single conditional update in the store (supportTickets.ts › automate): a step happens only if its
 * condition still holds, so two servers, a restart or a double click can never send the same email twice. Every
 * email and AI action leaves a note on the ticket (internal notes for staff, plain updates for the reporter).
 *
 * Kill switches: SUPPORT_AI_TRIAGE=off and SUPPORT_AUTO_EMAILS=off (server), and the same two switches plus the daily
 * AI cap in Platform › Support (support_settings). Either "off" wins. No key, a failed call, a reply that fails the
 * checks or the cap: the ticket is kept, support@ is still alerted (step 1), and a person handles it.
 */
import {
  getSupportTicketStore,
  SupportStorageError,
  type NewMessageInput,
  type SupportSettings,
} from '@/lib/server/supportTickets';
import { askResolutionDraft, askTriage, contextFileHints, looksLikeSteering, resolutionTemplate } from '@/lib/server/supportAi';
import { aiProvider } from '@/lib/server/clientProjects/ai';
import { sendCustomerAutoAnswer, sendCustomerNeedsMoreTime, sendCustomerResolution, sendCustomerWorkingOnIt, type MailResult } from '@/lib/ticketEmailer';
import { helpArticleTitle } from '@/lib/helpContent';
import { areaLabel } from '@/lib/supportReport';
import {
  SEVERITY_LABEL,
  SLA_WORDS,
  TRIAGE_TYPE_LABEL,
  dueInWords,
  maxSeverity,
  normalizeSha,
  priorityForSeverity,
  severityFromPriority,
  shaMatches,
  slaDueAt,
  type AiTriage,
  type Severity,
  type TicketTriage,
} from '@/lib/supportAutomation';
import type { TroubleTicket } from '@/lib/ticketTypes';

// ------------------------------------------------------------------ switches

const iso = () => new Date().toISOString();
const isOff = (v: string | undefined) => /^(0|off|false|no|disabled?)$/i.test((v || '').trim());
export const DEFAULT_AI_DAILY_CAP = 150;
/** How-to answers go out on their own only at or above this confidence (both the type and the answer). */
export const AUTO_ANSWER_MIN_CONFIDENCE = 0.8;
const MAX_TRIAGE_ATTEMPTS = 2;
const TRIAGE_STALE_MS = 10 * 60_000;
/** A ticket the after() call did not pick up is retried by the sweep after this long. */
const TRIAGE_RETRY_AFTER_MS = 2 * 60_000;

export function envSwitches() {
  const n = Number((process.env.SUPPORT_AI_DAILY_CAP || '').trim());
  return {
    aiTriage: !isOff(process.env.SUPPORT_AI_TRIAGE),
    autoEmails: !isOff(process.env.SUPPORT_AUTO_EMAILS),
    cap: (process.env.SUPPORT_AI_DAILY_CAP || '').trim() && Number.isInteger(n) && n >= 0 ? n : DEFAULT_AI_DAILY_CAP,
  };
}

export interface Effective {
  aiTriage: boolean;
  autoEmails: boolean;
  cap: number;
  settings: SupportSettings;
  env: ReturnType<typeof envSwitches>;
}
export async function effective(): Promise<Effective> {
  const env = envSwitches();
  const settings = await getSupportTicketStore().getSettings();
  return { aiTriage: env.aiTriage && settings.aiTriage, autoEmails: env.autoEmails && settings.autoEmails, cap: settings.aiDailyCap ?? env.cap, settings, env };
}

const dayStartIso = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Reserve one support AI call, or the plain reason it may not happen. */
async function reserveAi(kind: string, ticketId: string | null, eff: Effective): Promise<string | null> {
  if (!eff.aiTriage) return eff.env.aiTriage ? 'support AI is turned off in Platform › Support' : 'support AI is turned off on this server (SUPPORT_AI_TRIAGE)';
  if (aiProvider() === 'off') return 'no platform AI key is configured on this server';
  const r = await getSupportTicketStore().reserveAiCall(kind, ticketId, eff.cap, dayStartIso());
  return r.ok ? null : `the daily limit of ${eff.cap} support AI calls is reached`;
}

// ------------------------------------------------------------------ timeline entries

const SYSTEM = { senderName: 'System', senderEmail: 'system@appointmentlyy.com', senderRole: 'system' as const };
/** Staff-only timeline entry. */
const note = (content: string): NewMessageInput => ({ ...SYSTEM, isInternalNote: true, content: `[Auto] ${content}`.slice(0, 4000) });
/** A short status line the reporter sees in My reports. */
const update = (content: string): NewMessageInput => ({ ...SYSTEM, isInternalNote: false, content: content.slice(0, 4000) });
/** A reply from support the reporter sees in My reports. */
const supportReply = (content: string, name = 'Appointmentlyy Support'): NewMessageInput => ({
  senderName: name,
  senderEmail: 'support@appointmentlyy.com',
  senderRole: 'admin',
  isInternalNote: false,
  content: content.slice(0, 4000),
});

async function logMail(id: string, to: string, what: string, r: MailResult) {
  const msg = r.success ? `Email sent to ${to}: ${what}.` : `Email NOT sent to ${to}: ${what} (${String(r.error || 'unknown error').slice(0, 160)}).`;
  await getSupportTicketStore().addMessage(id, note(msg), null);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const slaLine = (sev: Severity, due: string | null) => `SLA ${SEVERITY_LABEL[sev]} ${SLA_WORDS[sev]}${due ? `, due ${dueInWords(due, 'Asia/Manila')}` : ''}`;

/** A step that fails because the step-2 columns are missing (migration not run) is skipped, said once per process. */
let warnedStorage = false;
function storageProblem(err: unknown, where: string): void {
  if (err instanceof SupportStorageError) {
    if (!warnedStorage) console.error(`[support-auto] ${where}: storage not ready (is supabase/migrations/20261201000000_support_automation.sql applied?):`, err.message);
    warnedStorage = true;
    return;
  }
  console.error(`[support-auto] ${where}:`, err instanceof Error ? err.message : err);
}

// ------------------------------------------------------------------ duplicates (text similarity, never the AI)

const STOP = new Set(
  'the and for with that this from have has had not but are was were can cant could would should when what which where while into onto our your you they them their there then than its it is to of in on at by an a i me my we us be been being do does did just get got also any all some very too will shall may might please hi hello thanks thank'.split(
    ' ',
  ),
);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

/**
 * The open ticket (any workspace; shown to staff only) that looks most like this one: word overlap of subject and
 * description, a little extra for the same area. None below the threshold.
 */
async function findDuplicate(t: TroubleTicket): Promise<TicketTriage['duplicateOf']> {
  const store = getSupportTicketStore();
  const mine = words(`${t.subject} ${t.description}`);
  if (mine.size < 3) return null;
  const since = Date.now() - 30 * 86_400_000;
  const open = (
    await Promise.all(
      (['open', 'in_progress', 'waiting_on_customer'] as const).map((status) => store.list({ kind: 'all' }, { status, limit: 150 })),
    )
  ).flat();
  let best: TicketTriage['duplicateOf'] = null;
  for (const o of open) {
    if (o.id === t.id || Date.parse(o.createdAt) < since || o.source === 'billing') continue;
    const theirs = words(`${o.subject} ${o.description}`);
    let shared = 0;
    for (const w of mine) if (theirs.has(w)) shared++;
    if (shared < 3) continue;
    const score = shared / (mine.size + theirs.size - shared) + (o.area && o.area === t.area ? 0.1 : 0);
    if (score >= 0.45 && (!best || score > best.score)) best = { id: o.id, subject: o.subject.slice(0, 160), tenantName: o.tenantName.slice(0, 120), score: Math.round(score * 100) / 100 };
  }
  return best;
}

// ------------------------------------------------------------------ 1. triage

/** Right after a ticket is filed (called from the create route inside after()). Never throws. */
export async function runTriage(id: string): Promise<void> {
  const store = getSupportTicketStore();
  try {
    const t0 = await store.get(id);
    if (!t0?.automation) return;
    const a = t0.automation;
    const now = iso();
    const stale = new Date(Date.now() - TRIAGE_STALE_MS).toISOString();
    const claimPatch = { triageState: 'running' as const, triageClaimedAt: now, triageAttempts: a.triageAttempts + 1 };
    let t: TroubleTicket | null = null;
    if (a.triageState === 'pending') {
      t = await store.automate(id, claimPatch, { triageState: 'pending', triageAttempts: a.triageAttempts }, []);
    } else if (a.triageState === 'running' && a.triageClaimedAt && a.triageClaimedAt < stale) {
      if (a.triageAttempts >= MAX_TRIAGE_ATTEMPTS) {
        // Gave up: a person handles it, with the SLA from the reporter's urgency.
        const sev = severityFromPriority(t0.priority);
        const due = t0.source === 'billing' ? null : slaDueAt(t0.createdAt, sev);
        await store.automate(
          id,
          { triageState: 'failed', severity: sev, slaDueAt: due, triage: { ai: null, duplicateOf: null, model: '', at: now, reason: 'AI triage did not finish' } },
          { triageState: 'running', triageAttempts: a.triageAttempts, triageClaimedBefore: stale },
          [note(`AI triage did not finish after ${a.triageAttempts} tries. A person will handle this ticket. ${slaLine(sev, due)}.`)],
        );
        return;
      }
      t = await store.automate(id, claimPatch, { triageState: 'running', triageAttempts: a.triageAttempts, triageClaimedBefore: stale }, [note('The earlier AI triage did not finish; trying again.')]);
    }
    if (!t) return; // someone else has it, or it is already done

    const baseline = severityFromPriority(t.priority);
    const eff = await effective();
    let ai: AiTriage | null = null;
    let reason = '';
    let model = '';
    let changed = false;
    if (t.source === 'billing') reason = 'a lead-quota top-up request created by the app (no AI needed)';
    else {
      const refused = await reserveAi('triage', id, eff);
      if (refused) reason = refused;
      else {
        const res = await askTriage(t);
        model = res.model;
        if (res.ok && res.value) {
          ai = res.value;
          changed = !!res.customerTextChanged;
        } else reason = res.reason || 'the AI did not answer';
      }
    }
    const duplicateOf = t.source === 'billing' ? null : await findDuplicate(t).catch(() => null);
    const severity = ai ? maxSeverity(ai.severity, baseline) : baseline;
    const priority = severity !== baseline ? priorityForSeverity(severity, t.priority) : undefined;
    // Feature requests are not "resolved" within an SLA (they go on the roadmap), so they get no target and no
    // "needs more time" email; neither do the app's own lead-quota top-up tickets.
    const due = t.source === 'billing' || ai?.type === 'feature_request' ? null : slaDueAt(t.createdAt, severity);
    if (ai?.brief) ai = { ...ai, brief: { ...ai.brief, suspectedFiles: [...new Set([...ai.brief.suspectedFiles, ...contextFileHints(t)])].slice(0, 8) } };
    const state = ai ? 'done' : t.source === 'billing' || !model ? 'skipped' : 'failed';
    const triage: TicketTriage = { ai, duplicateOf, model, at: iso(), reason };
    const notes: NewMessageInput[] = [];
    if (ai) {
      notes.push(
        note(
          `AI triage (${model}): ${TRIAGE_TYPE_LABEL[ai.type]}, severity ${SEVERITY_LABEL[severity]}${severity !== ai.severity ? ` (the reporter's urgency; AI said ${SEVERITY_LABEL[ai.severity]})` : ''}, area ${areaLabel(ai.area) || ai.area}, confidence ${pct(ai.confidence)}. ${slaLine(severity, due)}. ${ai.summary}`,
        ),
      );
    } else {
      notes.push(note(`AI triage ${state === 'skipped' ? 'skipped' : 'failed'}: ${reason}. A person will handle this ticket.${due ? ` ${slaLine(severity, due)} (from the reporter's urgency).` : ''}`));
    }
    if (duplicateOf) notes.push(note(`Looks like the same problem as ${duplicateOf.id} (${duplicateOf.tenantName}: "${duplicateOf.subject}"), similarity ${pct(Math.min(1, duplicateOf.score))}.`));
    const saved = await store.automate(id, { triageState: state, triage, severity, slaDueAt: due, ...(priority ? { priority } : {}) }, { triageState: 'running' }, notes);
    if (!saved || !ai) return;
    if (ai.type === 'how_to') await howTo(saved, ai, eff, changed);
    else if (ai.type === 'bug') await workingOnIt(saved, eff);
  } catch (err) {
    storageProblem(err, `triage ${id}`);
  }
}

// ------------------------------------------------------------------ 2. how-to answers

/** Why this how-to answer must wait for a person, or null when it may go out on its own. */
export function autoAnswerBlock(t: TroubleTicket, ai: AiTriage, eff: Pick<Effective, 'autoEmails'>, customerTextChanged: boolean): string | null {
  const h = ai.howTo;
  if (!h || !h.answer) return 'the Help center does not cover it';
  if (!h.citations.length) return 'the answer cites no Help center article';
  const conf = Math.min(ai.confidence, h.confidence);
  if (conf < AUTO_ANSWER_MIN_CONFIDENCE) return `confidence ${pct(conf)} is below ${pct(AUTO_ANSWER_MIN_CONFIDENCE)}`;
  if (customerTextChanged) return 'the AI answer contained a link or address (removed), so a person should check it';
  if (looksLikeSteering(t)) return 'the report contains text aimed at the AI';
  if (t.status !== 'open') return 'the ticket is no longer open';
  if (!eff.autoEmails) return 'automatic emails are turned off';
  return null;
}

async function howTo(t: TroubleTicket, ai: AiTriage, eff: Effective, changed: boolean) {
  const store = getSupportTicketStore();
  const why = autoAnswerBlock(t, ai, eff, changed);
  if (why) {
    await store.addMessage(t.id, note(`${ai.howTo?.answer ? 'How-to answer drafted' : 'How-to question'}; left for a person because ${why}. The draft is in the AI triage panel.`), null);
    return;
  }
  const h = ai.howTo!;
  const titles = h.citations.map(helpArticleTitle).filter(Boolean);
  const claimed = await store.automate(
    t.id,
    { autoAnswerAt: iso(), status: 'resolved' },
    { isNull: ['autoAnswerAt'], statusIn: ['open'] },
    [
      supportReply(`${h.answer}\n\nFrom the Help center: ${titles.join('; ')}.\n\nIf this does not answer your question, reply here and a person will pick it up.`, 'Appointmentlyy Support (automatic answer)'),
      note(`Answered automatically from the Help center (${h.citations.join(', ')}; confidence ${pct(Math.min(ai.confidence, h.confidence))}) and marked Resolved. A reply from the reporter reopens it.`),
    ],
  );
  if (!claimed) return;
  await logMail(t.id, claimed.requesterEmail, '"Answered" (the Help center answer)', await sendCustomerAutoAnswer(claimed, h.answer, titles));
}

// ------------------------------------------------------------------ 3. "we're working on it"

async function workingOnIt(t: TroubleTicket, eff: Effective) {
  const store = getSupportTicketStore();
  const sev = t.automation?.severity ?? 'normal';
  const due = t.automation?.slaDueAt ?? null;
  if (!eff.autoEmails) {
    await store.addMessage(t.id, note('"We\'re working on it" email not sent: automatic emails are turned off.'), null);
    return;
  }
  const dueWords = due ? dueInWords(due, t.context?.time?.timeZone) : '';
  const claimed = await store.automate(
    t.id,
    { workingEmailAt: iso(), ...(t.status === 'open' ? { status: 'in_progress' as const } : {}) },
    { isNull: ['workingEmailAt'], statusIn: ['open', 'in_progress'] },
    [update(`We're working on it. Our target is to fix this within ${SLA_WORDS[sev]}${dueWords ? ` (by ${dueWords})` : ''}.`)],
  );
  if (!claimed) return;
  await logMail(t.id, claimed.requesterEmail, `"We're working on it" (SLA ${SEVERITY_LABEL[sev]}, ${SLA_WORDS[sev]})`, await sendCustomerWorkingOnIt(claimed, SLA_WORDS[sev], dueWords));
}

// ------------------------------------------------------------------ 5. SLA watcher

/** One "needs more time" update per ticket per breach. Returns how many went out. */
export async function sweepSla(eff?: Effective): Promise<number> {
  const store = getSupportTicketStore();
  const e = eff ?? (await effective());
  // With automatic emails off nothing is claimed, so the update still goes out once they are back on. The owner queue
  // flags the ticket either way (it compares the SLA target with the clock).
  if (!e.autoEmails) return 0;
  const now = iso();
  let sent = 0;
  for (const t of await store.listForAutomation('sla_due', now, 100)) {
    const sev = t.automation?.severity ?? 'normal';
    const claimed = await store.automate(
      t.id,
      { slaBreachAt: now },
      { isNull: ['slaBreachAt'], statusIn: ['open', 'in_progress'], slaDueBefore: now },
      [
        update('Update: this is taking longer than we aimed for. It is still being worked on, and we will let you know as soon as it is fixed.'),
        note(`The SLA passed without a resolution (${slaLine(sev, t.automation?.slaDueAt ?? null)}).`),
      ],
    );
    if (!claimed) continue;
    await logMail(t.id, claimed.requesterEmail, '"We need a little more time" (SLA passed)', await sendCustomerNeedsMoreTime(claimed));
    sent++;
  }
  return sent;
}

// ------------------------------------------------------------------ reopen / priority (called by the routes)

/** The reporter replied to a Resolved / Closed ticket: open it again and restart its SLA. Never throws. */
export async function reopenOnReply(t: TroubleTicket, by: string): Promise<TroubleTicket | null> {
  const store = getSupportTicketStore();
  const sev = t.automation?.severity ?? severityFromPriority(t.priority);
  const restart = !!t.automation?.slaDueAt;
  const notes = [update('Reopened by your reply. A person from our support team will pick this up.'), note(`Reopened by ${by}'s reply.${restart ? ` SLA restarted: ${slaLine(sev, slaDueAt(iso(), sev))}.` : ''}`)];
  try {
    return await store.automate(t.id, { status: 'open', ...(restart ? { slaDueAt: slaDueAt(iso(), sev), slaBreachAt: null } : {}) }, { statusIn: ['resolved', 'closed'] }, notes);
  } catch (err) {
    if (!(err instanceof SupportStorageError)) {
      storageProblem(err, `reopen ${t.id}`);
      return null;
    }
    // Step-2 columns not there yet: reopen the step-1 way.
    return store.update(t.id, { status: 'open' }, notes[0]).catch(() => null);
  }
}

/** Staff changed the priority: the severity and SLA target follow it. */
export async function followPriority(t: TroubleTicket, by: string): Promise<void> {
  if (!t.automation?.slaDueAt) return;
  const sev = severityFromPriority(t.priority);
  if (sev === t.automation.severity) return;
  const due = slaDueAt(t.createdAt, sev);
  try {
    await getSupportTicketStore().automate(t.id, { severity: sev, slaDueAt: due }, {}, [note(`Severity set to ${SEVERITY_LABEL[sev]} by ${by} (priority change). ${slaLine(sev, due)}.`)]);
  } catch (err) {
    storageProblem(err, `priority ${t.id}`);
  }
}

// ------------------------------------------------------------------ 4. fix ready + release

/** The commit this server runs, as Railway reports it (GitHub-triggered deploys only). Never guessed. */
export function deployedSha(): string | null {
  return normalizeSha(process.env.RAILWAY_GIT_COMMIT_SHA);
}
/** How long a new deploy must run, and answer its own health check, before resolution replies go out. */
export function releaseHealthyMs(): number {
  const n = Number((process.env.SUPPORT_RELEASE_HEALTHY_MS || '').trim());
  return (process.env.SUPPORT_RELEASE_HEALTHY_MS || '').trim() && Number.isFinite(n) && n >= 0 ? Math.min(n, 3_600_000) : 180_000;
}
const uptimeMs = () => Math.round(process.uptime() * 1000);

async function selfHealthy(): Promise<boolean> {
  const port = Number(process.env.PORT) || 3000;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

export interface FixInput {
  sha: string | null;
  reply: string;
  by: string;
  /** Ask the AI for a draft when no reply is given (else the template). */
  draft: boolean;
  /** Optional plain notes for the AI draft ("what was fixed"). */
  notes?: string;
}
export type FixResult = { ok: true; ticket: TroubleTicket; drafted: 'ai' | 'template' | 'given' } | { ok: false; status: number; error: string };

/** A resolution reply draft (AI, or the template when AI is off / refused / failed). Records the AI call. */
export async function draftResolution(t: TroubleTicket, notesText = ''): Promise<{ reply: string; by: 'ai' | 'template'; reason?: string }> {
  const eff = await effective();
  const refused = await reserveAi('resolution', t.id, eff);
  if (refused) return { reply: resolutionTemplate(t), by: 'template', reason: refused };
  const r = await askResolutionDraft(t, notesText || t.automation?.triage?.ai?.summary || '');
  await getSupportTicketStore().addMessage(t.id, note(r ? `AI drafted a resolution reply (${r.model}); not sent.` : 'AI could not draft a resolution reply; the template was used.'), null);
  return r ? { reply: r.reply, by: 'ai' } : { reply: resolutionTemplate(t), by: 'template', reason: 'the AI did not answer' };
}

export async function markFixReady(id: string, input: FixInput): Promise<FixResult> {
  const store = getSupportTicketStore();
  const t = await store.get(id);
  if (!t?.automation) return { ok: false, status: 404, error: 'Ticket not found' };
  if (t.automation.fix.state === 'sending') return { ok: false, status: 409, error: 'The resolution reply for this ticket is being sent right now.' };
  let reply = input.reply.trim();
  let drafted: 'ai' | 'template' | 'given' = 'given';
  if (!reply) {
    const d = input.draft ? await draftResolution(t, input.notes) : { reply: resolutionTemplate(t), by: 'template' as const };
    reply = d.reply;
    drafted = d.by;
  }
  const saved = await store.automate(
    id,
    { fixState: 'fix_ready', fixSha: input.sha, fixReply: reply.slice(0, 4000), fixMarkedBy: input.by.slice(0, 254), fixMarkedAt: iso(), fixClaimedAt: null, fixSentAt: null },
    {},
    [
      note(
        `Marked Fix ready by ${input.by}${input.sha ? ` for release ${input.sha.slice(0, 12)}` : ' (no release linked: send it by hand)'}${drafted === 'ai' ? '; reply drafted by AI' : drafted === 'template' ? '; reply from the template' : ''}. The resolution reply goes out when that release is live.`,
      ),
    ],
  );
  return saved ? { ok: true, ticket: saved, drafted } : { ok: false, status: 404, error: 'Ticket not found' };
}

export async function cancelFix(id: string, by: string): Promise<TroubleTicket | null> {
  return getSupportTicketStore().automate(id, { fixState: 'none', fixSha: null, fixReply: '', fixMarkedAt: null, fixClaimedAt: null }, { fixState: 'fix_ready' }, [note(`Fix ready removed by ${by}.`)]);
}

/** In this process: (ticket, sha) pairs whose send got a definite "no" from the mail service; not retried on their own. */
const g = globalThis as typeof globalThis & { __appySupportWorker?: WorkerState };
interface WorkerState {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  running: Promise<CheckSummary> | null;
  lastRunAt: number;
  last: CheckSummary | null;
  refused: Set<string>;
}
function worker(): WorkerState {
  g.__appySupportWorker ??= { started: false, timer: null, running: null, lastRunAt: 0, last: null, refused: new Set() };
  return g.__appySupportWorker;
}

/** Claim, send, record. Returns 'sent', 'failed' or 'skipped' (someone else has it). */
async function deliverResolution(t: TroubleTicket, how: string, auto: boolean): Promise<'sent' | 'failed' | 'skipped'> {
  const store = getSupportTicketStore();
  const fix = t.automation!.fix;
  const claimed = await store.automate(t.id, { fixState: 'sending', fixClaimedAt: iso() }, { fixState: 'fix_ready', fixSha: fix.sha }, []);
  if (!claimed) return 'skipped';
  const reply = (claimed.automation?.fix.reply || '').trim() || resolutionTemplate(claimed);
  const r = await sendCustomerResolution(claimed, reply);
  const to = claimed.requesterEmail;
  if (r.success) {
    await store.automate(
      t.id,
      { fixState: 'sent', fixSentAt: iso(), status: 'resolved' },
      { fixState: 'sending' },
      [supportReply(`${reply}\n\nPlease refresh the page to load the new version.`), note(`${how}: resolution reply emailed to ${to}; ticket marked Resolved.`)],
    );
    return 'sent';
  }
  if (r.status) {
    // A definite "not sent": back to Fix ready (no duplicate possible). The deploy path does not retry it on its own.
    if (auto && fix.sha) worker().refused.add(`${t.id}:${fix.sha}`);
    await store.automate(t.id, { fixState: 'fix_ready', fixClaimedAt: null }, { fixState: 'sending' }, [
      note(`${how}: resolution email NOT sent to ${to} (mail service said: ${String(r.error || r.status).slice(0, 160)}). Still Fix ready; use "Send now" to try again.`),
    ]);
    return 'failed';
  }
  // No answer from the mail service: it may or may not have gone out, so it is NOT retried automatically.
  await store.addMessage(t.id, note(`${how}: no answer from the mail service; the resolution email to ${to} may not have gone out. Check, then mark Fix ready again to resend.`), null);
  return 'failed';
}

export interface ReleaseRun {
  deployedSha: string | null;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}

/** The deploy path: only for the commit this server runs, only after it has been healthy for a while. */
export async function sendForDeployedRelease(eff?: Effective): Promise<ReleaseRun> {
  const dep = deployedSha();
  const out: ReleaseRun = { deployedSha: dep, eligible: 0, sent: 0, failed: 0, skipped: 0 };
  if (!dep) return { ...out, reason: 'this server does not know its commit (RAILWAY_GIT_COMMIT_SHA is not set)' };
  const store = getSupportTicketStore();
  const s = worker();
  const ready = (await store.listForAutomation('fix_ready', iso(), 200)).filter((t) => shaMatches(t.automation?.fix.sha, dep) && !s.refused.has(`${t.id}:${t.automation?.fix.sha}`));
  out.eligible = ready.length;
  if (!ready.length) return out;
  const e = eff ?? (await effective());
  if (!e.autoEmails) return { ...out, reason: 'automatic emails are turned off' };
  const wait = releaseHealthyMs() - uptimeMs();
  if (wait > 0) return { ...out, reason: `waiting for the new deploy to run ${Math.ceil(wait / 1000)} s more` };
  if (!(await selfHealthy())) return { ...out, reason: 'this server did not answer its own health check' };
  for (const t of ready) out[await deliverResolution(t, `Release ${dep.slice(0, 7)} is live (this server runs it)`, true)]++;
  return out;
}

/** The owner's "Send now": every Fix ready ticket (or those given / linked to `sha`), whatever is deployed. */
export async function sendResolvedNow(opts: { ids?: string[]; sha?: string | null; by: string }): Promise<ReleaseRun> {
  const store = getSupportTicketStore();
  const ready = (await store.listForAutomation('fix_ready', iso(), 200)).filter(
    (t) => (!opts.ids || opts.ids.includes(t.id)) && (!opts.sha || shaMatches(t.automation?.fix.sha, opts.sha)),
  );
  const out: ReleaseRun = { deployedSha: deployedSha(), eligible: ready.length, sent: 0, failed: 0, skipped: 0 };
  for (const t of ready) out[await deliverResolution(t, `Sent by ${opts.by} with "Send resolved replies now"`, false)]++;
  return out;
}

// ------------------------------------------------------------------ the periodic checks

export interface CheckSummary {
  at: string;
  reason: string;
  triageRetried: number;
  slaUpdates: number;
  release: ReleaseRun | null;
  error?: string;
}

async function retryStuckTriage(): Promise<number> {
  const cutoff = new Date(Date.now() - TRIAGE_RETRY_AFTER_MS).toISOString();
  const stale = new Date(Date.now() - TRIAGE_STALE_MS).toISOString();
  const stuck = (await getSupportTicketStore().listForAutomation('triage_stuck', iso(), 20)).filter((t) =>
    t.automation?.triageState === 'pending' ? t.createdAt < cutoff : !!t.automation?.triageClaimedAt && t.automation.triageClaimedAt < stale,
  );
  for (const t of stuck.slice(0, 5)) await runTriage(t.id);
  return Math.min(stuck.length, 5);
}

/** All checks once (one run at a time per process; a second caller gets the running one). Never throws. */
export function runChecks(reason: string): Promise<CheckSummary> {
  const s = worker();
  if (s.running) return s.running;
  s.running = (async (): Promise<CheckSummary> => {
    const sum: CheckSummary = { at: iso(), reason, triageRetried: 0, slaUpdates: 0, release: null };
    try {
      const eff = await effective();
      sum.triageRetried = await retryStuckTriage();
      sum.slaUpdates = await sweepSla(eff);
      sum.release = await sendForDeployedRelease(eff);
    } catch (err) {
      storageProblem(err, 'checks');
      sum.error = err instanceof SupportStorageError ? 'storage not ready (migration not applied)' : 'the checks failed (see server log)';
    }
    s.last = sum;
    s.lastRunAt = Date.now();
    return sum;
  })().finally(() => {
    s.running = null;
  });
  return s.running;
}

/** After a request (e.g. the staff queue): run the checks if they have not run for `minGapMs`. */
export function kickChecks(minGapMs = 60_000): void {
  const s = worker();
  if (s.running || Date.now() - s.lastRunAt < minGapMs) return;
  void runChecks('after a queue read');
}

export const supportWorkerEnabled = () => process.env.RUN_SUPPORT_WORKER !== '0' && process.env.NEXT_PHASE !== 'phase-production-build';
export function sweepEveryMs(): number {
  const n = Number((process.env.SUPPORT_SWEEP_MS || '').trim());
  return Number.isFinite(n) && n >= 2000 ? Math.min(n, 3_600_000) : 60_000;
}

/** From src/instrumentation.ts: the checks every SUPPORT_SWEEP_MS (default 1 minute). Off with RUN_SUPPORT_WORKER=0. */
export function startSupportWorker(): void {
  const s = worker();
  if (s.started || !supportWorkerEnabled()) return;
  s.started = true;
  const every = sweepEveryMs();
  const first = setTimeout(() => void runChecks('start'), Math.min(10_000, every));
  first.unref?.();
  s.timer = setInterval(() => void runChecks('timer'), every);
  s.timer.unref?.();
  console.info(`[support-auto] checks every ${Math.round(every / 1000)} s; deployed commit ${deployedSha()?.slice(0, 7) || 'unknown'}; replies wait ${Math.round(releaseHealthyMs() / 1000)} s after start.`);
}

export async function automationStatus() {
  const eff = await effective();
  const store = getSupportTicketStore();
  const ready = await store.listForAutomation('fix_ready', iso(), 200);
  const dep = deployedSha();
  const s = worker();
  return {
    deployedSha: dep,
    uptimeMs: uptimeMs(),
    healthyAfterMs: releaseHealthyMs(),
    worker: { enabled: supportWorkerEnabled(), started: s.started, everyMs: sweepEveryMs(), last: s.last },
    ai: { provider: aiProvider(), on: eff.aiTriage, cap: eff.cap, usedToday: await store.aiCallsSince(dayStartIso()) },
    emails: { on: eff.autoEmails },
    env: eff.env,
    settings: eff.settings,
    fixReady: ready.map((t) => ({ id: t.id, subject: t.subject, tenantName: t.tenantName, sha: t.automation?.fix.sha ?? null, live: shaMatches(t.automation?.fix.sha, dep) })),
  };
}
