/**
 * Server only. Everything that changes a Client Project: creating one from the SOP, card edits,
 * client actions from the shared board, the share link, plan approval, the built-in automations and
 * the lazy sweep (client-delay records, reminders, digests). Every change writes a cp_events row.
 */
import crypto from 'node:crypto';
import { EMAIL_RE } from '@/lib/roles';
import { rateLimit } from '@/lib/authToken';
import { loadSettings } from '@/lib/server/agreements/core';
import { mailStatus, sendAgreementMail, type AgreementMail } from '@/lib/server/agreements/mail';
import { getClientProjectStore, isCpId } from '@/lib/server/clientProjectStore';
import { isLocalTestServer } from '@/lib/server/agreements/mail';
import { draftStatus } from '@/lib/server/clientProjects/ai';
import { buildClientReminder, buildReadinessNotice } from '@/lib/server/clientProjects/statusText';
import {
  blankTask,
  clientCanTick,
  consoleUrl,
  defaultGoLive,
  defectFixDue,
  deliverableRef,
  evidenceLinks,
  line,
  liveBoardUrl,
  newBoardToken,
  personName,
  sopTasks,
  taskKey,
  text,
  today,
  uatOpen,
} from '@/lib/server/clientProjects/core';
import { newId, nowIso } from '@/lib/server/tenantStore';
import {
  AUTOMATION_RULES,
  CP_LIMITS,
  PHASES,
  PHASE_LABEL,
  PROJECT_KEY_RE,
  PROJECT_STATUSES,
  SEVERITIES,
  SEVERITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  addBusinessDays,
  businessDaysBetween,
  fmtDateLong,
  isDate,
  isOverdue,
  phaseForOffset,
  ruleOn,
  suggestKey,
  todayManila,
  typeFor,
  type AiRun,
  type AutomationRule,
  type CpEvent,
  type CpEventType,
  type Phase,
  type Project,
  type ProjectStatus,
  type Proposal,
  type ProposalTask,
  type Severity,
  type Task,
  type TaskStatus,
} from '@/lib/clientProjects/types';

export class CpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Ctx {
  /** 'owner:<email>', 'client:<name>' or 'system'. */
  actor: string;
  origin?: string;
}

const store = () => getClientProjectStore();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function log(p: Pick<Project, 'id'>, taskId: string | null, actor: string, type: CpEventType, detail: Record<string, unknown> = {}, dedupeKey?: string) {
  return store().addEvent({ projectId: p.id, taskId, actor: actor.slice(0, 200), type, detail }, dedupeKey);
}

// ------------------------------------------------------------------ mail (the Agreements sender; dev outbox on test servers)

type MailOutcome = { emailed: boolean; note: string };

/**
 * Send one plain notification. Never throws: the outcome is recorded on the automation event.
 * `budget`: hourly allowance per project. Defect reports have their own, so a burst of ticks or comments
 * can never starve "a client reported a defect".
 */
async function sendMail(p: Project, kind: 'cp-owner' | 'cp-client', to: string, subject: string, lines: string[], cta?: { label: string; url: string }, budget: 'general' | 'defect' = 'general'): Promise<MailOutcome> {
  try {
    if (!to || !EMAIL_RE.test(to)) return { emailed: false, note: 'email not sent: no address' };
    if (!mailStatus().configured) return { emailed: false, note: 'email not sent: mail not configured' };
    if (!rateLimit(`cp-mail-${budget}:${p.id}`, budget === 'defect' ? 30 : 40, 60 * 60_000)) return { emailed: false, note: 'email not sent: hourly limit reached' };
    const { settings } = await loadSettings();
    const body = lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#1f2937">${esc(l)}</p>`).join('');
    const button = cta ? `<p style="margin:18px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px">${esc(cta.label)}</a></p>` : '';
    const mail: AgreementMail = {
      kind,
      envelopeId: p.id,
      to,
      subject,
      html: `<!doctype html><html><body style="margin:0;background:#f5f5f4;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;padding:28px"><h1 style="margin:0 0 16px;font-size:19px;color:#111827">${esc(subject)}</h1>${body}${button}<p style="margin:20px 0 0;font-size:12px;color:#6b7280">Sent by Appointmentlyy Client Projects.</p></div></body></html>`,
      text: `${lines.join('\n')}\n${cta ? `\n${cta.url}\n` : ''}`,
    };
    const res = await sendAgreementMail(mail, settings);
    return res.ok ? { emailed: true, note: `emailed ${kind === 'cp-owner' ? 'the owner' : 'the client contact'}` } : { emailed: false, note: `email not sent: ${res.error}`.slice(0, 300) };
  } catch (err) {
    console.error('[client-projects mail]', err instanceof Error ? err.message : err);
    return { emailed: false, note: 'email not sent: mail error' };
  }
}

async function mailOwner(p: Project, ctx: Ctx, subject: string, lines: string[], budget: 'general' | 'defect' = 'general'): Promise<MailOutcome> {
  const { settings } = await loadSettings().catch(() => ({ settings: null }));
  return sendMail(p, 'cp-owner', settings?.ownerEmail ?? '', subject, lines, { label: 'Open the project', url: consoleUrl(p.id, ctx.origin) }, budget);
}

/** Record that an automation rule fired (actor "system", type "automation"). */
async function fired(p: Project, rule: AutomationRule, taskId: string | null, detail: Record<string, unknown>) {
  return log(p, taskId, 'system', 'automation', { rule, ...detail });
}

/**
 * CLAIM FIRST. Anything that must happen at most once (an email per card per day, a digest per day, a
 * reminder per card) starts by inserting its event under a dedupe key. The unique index picks one winner,
 * across requests and across server instances; only the winner goes on to send, and then writes the outcome
 * onto its own event with settle(). A loser gets null and does nothing.
 */
async function claim(p: Project, rule: AutomationRule, taskId: string | null, detail: Record<string, unknown>, dedupeKey: string): Promise<CpEvent | null> {
  return log(p, taskId, 'system', 'automation', { rule, ...detail, pending: true }, dedupeKey.slice(0, 200));
}

async function settle(ev: CpEvent, detail: Record<string, unknown>): Promise<void> {
  await store().settleEvent(ev.id, { ...detail, pending: false });
}

const shortHash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);

/** Automations must never break the request that triggered them. */
async function safely(what: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[client-projects automation ${what}]`, err instanceof Error ? err.message : err);
  }
}

/**
 * A ceiling on what link holders can write to one project in a day (ticks, claims, comments, defect
 * reports, retests): 500 client events. Counted in the store, so it holds across restarts and instances.
 * (CP_CLIENT_EVENTS_PER_DAY lowers it on a local test server only, for the regression suite.)
 */
export async function clientDailyCapReached(p: Pick<Project, 'id'>): Promise<boolean> {
  const test = isLocalTestServer() ? Number(process.env.CP_CLIENT_EVENTS_PER_DAY || 0) : 0;
  const cap = Number.isInteger(test) && test > 0 ? test : 500;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  return (await store().countEvents(p.id, { actorPrefix: 'client:', since })) >= cap;
}

// ------------------------------------------------------------------ projects

export async function createProject(raw: Record<string, unknown>, ctx: Ctx): Promise<Project> {
  const clientName = line(raw.clientName, CP_LIMITS.clientName);
  if (!clientName) throw new CpError(400, 'Enter the client name.');
  if (!isDate(raw.kickoffDate)) throw new CpError(400, 'Pick the kickoff date.');
  const key = raw.key === undefined || raw.key === '' ? suggestKey(clientName) : String(raw.key).trim().toUpperCase();
  if (!PROJECT_KEY_RE.test(key)) throw new CpError(400, 'The project key must be 2 to 5 letters, for example STK.');
  const status: ProjectStatus = raw.status === 'draft' ? 'draft' : 'active';
  const now = nowIso();
  const fromSop = raw.fromSop !== false;
  const p: Project = {
    id: newId(),
    key,
    taskSeq: 0,
    clientName,
    title: line(raw.title, CP_LIMITS.title) || `${clientName} onboarding`,
    status,
    kickoffDate: raw.kickoffDate,
    targetGoLive: defaultGoLive(raw.kickoffDate),
    summaryClient: '',
    briefingInternal: '',
    planMeta: null,
    clientUpdate: '',
    clientUpdateAt: null,
    statusDraft: null,
    uatOverride: null,
    clientContactEmail: '',
    automations: {},
    tokenHash: null,
    tokenSealed: null,
    shareEnabled: false,
    createdBy: ctx.actor.replace(/^owner:/, ''),
    createdAt: now,
    updatedAt: now,
  };
  const s = store();
  const created = await s.createProject(p);
  let count = 0;
  if (fromSop) {
    const cards = sopTasks(created, 1);
    const first = await s.nextTaskNums(created.id, cards.length);
    cards.forEach((c, i) => (c.num = first + i));
    await s.insertTasks(cards);
    count = cards.length;
  }
  await log(created, null, ctx.actor, 'project_created', { key, fromSop, cards: count, kickoffDate: p.kickoffDate });
  return (await s.getProject(created.id)) ?? created;
}

/** Owner edits to the project itself. Changing kickoff re-dates every open card that still follows its offset. */
export async function patchProject(p: Project, raw: Record<string, unknown>, ctx: Ctx): Promise<Project> {
  const patch: Partial<Project> = {};
  const changed: string[] = [];
  if ('clientName' in raw) {
    const v = line(raw.clientName, CP_LIMITS.clientName);
    if (!v) throw new CpError(400, 'Enter the client name.');
    patch.clientName = v;
  }
  if ('title' in raw) {
    const v = line(raw.title, CP_LIMITS.title);
    if (!v) throw new CpError(400, 'Enter a title.');
    patch.title = v;
  }
  if ('status' in raw) {
    if (!(PROJECT_STATUSES as readonly unknown[]).includes(raw.status)) throw new CpError(400, 'Unknown project status.');
    patch.status = raw.status as ProjectStatus;
  }
  if ('targetGoLive' in raw) {
    if (raw.targetGoLive !== null && !isDate(raw.targetGoLive)) throw new CpError(400, 'Enter a valid go-live date.');
    patch.targetGoLive = raw.targetGoLive as string | null;
  }
  if ('summaryClient' in raw) patch.summaryClient = text(raw.summaryClient, CP_LIMITS.summary);
  if ('briefingInternal' in raw) patch.briefingInternal = text(raw.briefingInternal, CP_LIMITS.briefing);
  if ('uatOverride' in raw) {
    if (raw.uatOverride !== null && typeof raw.uatOverride !== 'boolean') throw new CpError(400, 'UAT must be automatic, open or closed.');
    patch.uatOverride = raw.uatOverride as boolean | null;
  }
  if ('clientContactEmail' in raw) {
    const v = line(raw.clientContactEmail, 254).toLowerCase();
    if (v && !EMAIL_RE.test(v)) throw new CpError(400, 'Enter a valid client contact email.');
    patch.clientContactEmail = v;
  }
  if ('automations' in raw) {
    const a = raw.automations && typeof raw.automations === 'object' ? (raw.automations as Record<string, unknown>) : {};
    const next = { ...(p.automations ?? {}) };
    for (const rule of AUTOMATION_RULES) if (typeof a[rule] === 'boolean') next[rule] = a[rule] as boolean;
    if (next.client_reminders && !(patch.clientContactEmail ?? p.clientContactEmail)) throw new CpError(400, 'Add the client contact email before turning on reminders to the client.');
    patch.automations = next;
  }
  // The client-visible progress note: only ever set here, by the owner's own approve click.
  if ('publishClientUpdate' in raw) {
    const v = text(raw.publishClientUpdate, CP_LIMITS.summary);
    patch.clientUpdate = v;
    patch.clientUpdateAt = v ? nowIso() : null;
  }
  const s = store();
  if ('kickoffDate' in raw && raw.kickoffDate !== p.kickoffDate) {
    if (!isDate(raw.kickoffDate)) throw new CpError(400, 'Pick a valid kickoff date.');
    patch.kickoffDate = raw.kickoffDate;
    const oldGoLive = defaultGoLive(p.kickoffDate);
    if (!('targetGoLive' in raw) && (!p.targetGoLive || p.targetGoLive === oldGoLive)) patch.targetGoLive = defaultGoLive(raw.kickoffDate);
    let moved = 0;
    for (const t of await s.listTasks(p.id)) {
      if (t.status === 'done' || t.dueOffsetBd === null || t.type === 'defect') continue;
      // Only cards still on their computed date move; a date the owner set by hand is kept.
      if (t.dueDate !== addBusinessDays(p.kickoffDate, t.dueOffsetBd)) continue;
      await s.updateTask(t.id, { dueDate: addBusinessDays(raw.kickoffDate, t.dueOffsetBd) });
      moved++;
    }
    changed.push(`kickoff ${p.kickoffDate} -> ${raw.kickoffDate} (${moved} cards re-dated)`);
  }
  for (const k of Object.keys(patch)) if (k !== 'kickoffDate' && k !== 'clientUpdate' && k !== 'clientUpdateAt') changed.push(k);
  const updated = await s.updateProject(p.id, patch);
  if (!updated) throw new CpError(404, 'Project not found.');
  if ('publishClientUpdate' in raw) await log(p, null, ctx.actor, 'client_update_published', { length: (patch.clientUpdate ?? '').length, cleared: !patch.clientUpdate });
  if (changed.length) await log(p, null, ctx.actor, 'project_updated', { changed });
  return updated;
}

// ------------------------------------------------------------------ share link

export async function shareAction(p: Project, action: string, ctx: Ctx): Promise<{ project: Project; url: string | null }> {
  const s = store();
  if (action === 'link') return { project: p, url: liveBoardUrl(p, ctx.origin) };
  if (action === 'enable') {
    if (p.shareEnabled && p.tokenHash) return { project: p, url: liveBoardUrl(p, ctx.origin) };
    const t = newBoardToken(p.id);
    const updated = await s.updateProject(p.id, { tokenHash: t.hash, tokenSealed: t.sealed, shareEnabled: true });
    if (!updated) throw new CpError(404, 'Project not found.');
    await log(p, null, ctx.actor, 'share_enabled');
    return { project: updated, url: liveBoardUrl(updated, ctx.origin) };
  }
  if (action === 'disable') {
    // The token is thrown away, so the old link can never come back to life.
    const updated = await s.updateProject(p.id, { tokenHash: null, tokenSealed: null, shareEnabled: false });
    if (!updated) throw new CpError(404, 'Project not found.');
    await log(p, null, ctx.actor, 'share_disabled');
    return { project: updated, url: null };
  }
  if (action === 'reissue') {
    const t = newBoardToken(p.id);
    const updated = await s.updateProject(p.id, { tokenHash: t.hash, tokenSealed: t.sealed, shareEnabled: true });
    if (!updated) throw new CpError(404, 'Project not found.');
    await log(p, null, ctx.actor, 'share_reissued');
    return { project: updated, url: liveBoardUrl(updated, ctx.origin) };
  }
  throw new CpError(400, 'Unknown share action.');
}

// ------------------------------------------------------------------ cards

const isStatus = (v: unknown): v is TaskStatus => (TASK_STATUSES as readonly unknown[]).includes(v);
const isPhase = (v: unknown): v is Phase => (PHASES as readonly unknown[]).includes(v);
const isSeverity = (v: unknown): v is Severity => (SEVERITIES as readonly unknown[]).includes(v);
const isOffset = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= CP_LIMITS.offsetMin && v <= CP_LIMITS.offsetMax;

async function nextNum(p: Project): Promise<number> {
  if ((p.taskSeq ?? 0) >= CP_LIMITS.tasksPerProject * 3) throw new CpError(409, 'This project has reached its card limit.');
  return store().nextTaskNums(p.id, 1);
}

/** Owner: create a task, milestone or defect. */
export async function createTask(p: Project, raw: Record<string, unknown>, ctx: Ctx): Promise<Task> {
  const title = line(raw.title, CP_LIMITS.taskTitle);
  if (!title) throw new CpError(400, 'Enter a title.');
  const s = store();
  if ((await s.listTasks(p.id)).length >= CP_LIMITS.tasksPerProject) throw new CpError(409, 'This project has reached its card limit.');
  const isDefect = raw.type === 'defect';
  const ownerSide = !isDefect && raw.ownerSide === 'client' ? 'client' : 'us';
  let over: Partial<Task>;
  if (isDefect) {
    const severity = isSeverity(raw.severity) ? raw.severity : 'S3';
    const reportedAt = nowIso();
    over = {
      type: 'defect',
      phase: 'week_3',
      ownerSide: 'us',
      severity,
      reportedAt,
      reportedBy: line(raw.reportedBy, CP_LIMITS.personName) || 'Appointmentlyy',
      steps: text(raw.steps, CP_LIMITS.steps),
      dueDate: defectFixDue(reportedAt, severity),
      source: 'manual',
    };
  } else {
    const offset = isOffset(raw.dueOffsetBd) ? raw.dueOffsetBd : null;
    const dueDate = isDate(raw.dueDate) ? raw.dueDate : offset !== null ? addBusinessDays(p.kickoffDate, offset) : null;
    over = {
      type: typeFor(ownerSide, raw.type === 'milestone' || raw.isGate === true),
      phase: isPhase(raw.phase) ? raw.phase : offset !== null ? phaseForOffset(offset) : 'week_1',
      ownerSide,
      dueOffsetBd: offset,
      dueDate,
    };
  }
  const num = await nextNum(p);
  const t = blankTask(p, num, {
    title,
    descriptionClient: text(raw.descriptionClient, CP_LIMITS.description),
    notesInternal: text(raw.notesInternal, CP_LIMITS.notes),
    deliverableRef: deliverableRef(raw.deliverableRef),
    // A defect the owner logs is internal until the owner chooses to show it; everything else is visible by default.
    clientVisible: isDefect ? raw.clientVisible === true : raw.clientVisible !== false,
    // Off unless the owner says so: by default a client can only say "I've done this" on a card added by hand.
    clientMayTick: !isDefect && ownerSide === 'client' && raw.type !== 'milestone' && raw.isGate !== true && raw.clientMayTick === true,
    sort: num * 10 + 100_000,
    ...over,
  });
  await s.insertTasks([t]);
  await log(p, t.id, ctx.actor, 'task_created', { key: taskKey(p, t), type: t.type, title: t.title, ...(t.severity ? { severity: t.severity, fixDue: t.dueDate } : {}) });
  return t;
}

/** The one place a card's status changes, for the owner, the client and automations alike. */
async function setStatus(p: Project, t: Task, status: TaskStatus, ctx: Ctx, extra: Partial<Task> = {}): Promise<Task> {
  const patch: Partial<Task> = { ...extra, status };
  if (status === 'done' && t.status !== 'done') {
    patch.doneAt = nowIso();
    patch.doneBy = ctx.actor;
  }
  if (status !== 'done' && t.status === 'done') {
    patch.doneAt = null;
    patch.doneBy = null;
    patch.retestConfirmed = false;
    patch.clientClaimedAt = null;
    patch.clientClaimedBy = '';
  }
  const updated = await store().updateTask(t.id, patch);
  if (!updated) throw new CpError(404, 'Card not found.');
  if (status !== t.status) {
    await log(p, t.id, ctx.actor, ctx.actor.startsWith('client:') ? (status === 'done' ? 'client_tick' : 'client_untick') : 'status_changed', { key: taskKey(p, t), from: t.status, to: status, title: t.title });
    if (status === 'done') {
      await recordLateFinish(p, updated);
      await safely('on-done', () => onTaskDone(p, updated, ctx));
    }
  }
  return updated;
}

/** Owner: edit a card. Only the fields sent are changed. */
export async function patchTask(p: Project, t: Task, raw: Record<string, unknown>, ctx: Ctx): Promise<Task> {
  const patch: Partial<Task> = {};
  if ('title' in raw) {
    const v = line(raw.title, CP_LIMITS.taskTitle);
    if (!v) throw new CpError(400, 'Enter a title.');
    patch.title = v;
  }
  if ('descriptionClient' in raw) patch.descriptionClient = text(raw.descriptionClient, CP_LIMITS.description);
  if ('notesInternal' in raw) patch.notesInternal = text(raw.notesInternal, CP_LIMITS.notes);
  if ('phase' in raw) {
    if (!isPhase(raw.phase)) throw new CpError(400, 'Unknown phase.');
    patch.phase = raw.phase;
  }
  if ('clientVisible' in raw) patch.clientVisible = raw.clientVisible === true;
  if ('autoComplete' in raw) patch.autoComplete = raw.autoComplete === true && t.type !== 'defect';
  if ('clientMayTick' in raw) patch.clientMayTick = raw.clientMayTick === true && t.type !== 'defect';
  if (raw.clearClaim === true && t.clientClaimedAt) {
    patch.clientClaimedAt = null;
    patch.clientClaimedBy = '';
  }
  if ('deliverableRef' in raw) patch.deliverableRef = deliverableRef(raw.deliverableRef);
  if ('evidence' in raw) {
    const links = evidenceLinks(raw.evidence);
    if (!links) throw new CpError(400, 'Evidence must be web links (https://...).');
    patch.evidence = links;
  }
  if ('dueDate' in raw) {
    if (raw.dueDate !== null && !isDate(raw.dueDate)) throw new CpError(400, 'Enter a valid due date.');
    patch.dueDate = raw.dueDate as string | null;
  }
  if ('blockedBy' in raw) {
    if (raw.blockedBy === null || raw.blockedBy === '') patch.blockedBy = null;
    else {
      const other = isCpId(raw.blockedBy) && raw.blockedBy !== t.id ? await store().getTask(raw.blockedBy) : null;
      if (!other || other.projectId !== p.id) throw new CpError(400, 'Pick a card from this project to wait on.');
      patch.blockedBy = other.id;
    }
  }
  if (t.type === 'defect') {
    if ('steps' in raw) patch.steps = text(raw.steps, CP_LIMITS.steps);
    if ('reportedBy' in raw) patch.reportedBy = line(raw.reportedBy, CP_LIMITS.personName);
    if ('retestConfirmed' in raw) patch.retestConfirmed = raw.retestConfirmed === true && (isStatus(raw.status) ? raw.status === 'done' : t.status === 'done');
    if ('severity' in raw && raw.severity !== t.severity) {
      if (!isSeverity(raw.severity)) throw new CpError(400, 'Severity must be S1, S2, S3 or S4.');
      patch.severity = raw.severity;
      // Re-classifying moves the fix target, always counted from the report date.
      if (!('dueDate' in raw)) patch.dueDate = defectFixDue(t.reportedAt ?? t.createdAt, raw.severity);
    }
  } else {
    if ('dueOffsetBd' in raw) {
      if (raw.dueOffsetBd !== null && !isOffset(raw.dueOffsetBd)) throw new CpError(400, 'The day offset is out of range.');
      patch.dueOffsetBd = raw.dueOffsetBd as number | null;
      if (!('dueDate' in raw) && raw.dueOffsetBd !== null) patch.dueDate = addBusinessDays(p.kickoffDate, raw.dueOffsetBd as number);
    }
    const side = 'ownerSide' in raw ? raw.ownerSide : t.ownerSide;
    if (side !== 'us' && side !== 'client') throw new CpError(400, 'The owner must be Us or Client.');
    const gate = 'isGate' in raw ? raw.isGate === true : 'type' in raw ? raw.type === 'milestone' : t.type === 'milestone';
    if ('ownerSide' in raw || 'isGate' in raw || 'type' in raw) {
      patch.ownerSide = side;
      patch.type = typeFor(side, gate);
      if (!gate || side !== 'us') patch.autoComplete = false;
      // Only an ordinary client item can ever be client-tickable.
      if (gate || side !== 'client') patch.clientMayTick = false;
    }
  }
  if ('status' in raw && !isStatus(raw.status)) throw new CpError(400, 'Unknown status.');
  const s = store();
  let updated = t;
  const keys = Object.keys(patch);
  if (keys.length) {
    updated = (await s.updateTask(t.id, patch)) ?? t;
    if (patch.severity) await log(p, t.id, ctx.actor, 'severity_changed', { key: taskKey(p, t), from: t.severity, to: patch.severity, fixDue: updated.dueDate });
    const other = keys.filter((k) => k !== 'severity');
    if (other.length) await log(p, t.id, ctx.actor, 'task_updated', { key: taskKey(p, t), changed: other, ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}) });
  }
  if (isStatus(raw.status) && raw.status !== updated.status) updated = await setStatus(p, updated, raw.status, ctx);
  return updated;
}

/**
 * Owner: delete a card. Only cards the owner or the approved AI plan added (source manual / ai), and only
 * while the client has not touched them (no client comment, tick or other client event). SOP cards and
 * anything the client acted on or reported are part of the record: hide them from the client board instead.
 */
export async function deleteTask(p: Project, t: Task, ctx: Ctx): Promise<void> {
  const hide = 'Turn off “Show on the client board” instead.';
  if (t.source !== 'manual' && t.source !== 'ai') throw new CpError(409, `${t.source === 'sop' ? 'SOP cards' : 'Cards the client reported'} cannot be deleted. ${hide}`);
  const s = store();
  // Asked of the store for THIS card only (no "load every event, then look").
  const [clientEvents, comments] = await Promise.all([s.findEvents(p.id, { taskId: t.id, actorPrefix: 'client:', limit: 1 }), s.findComments(p.id, { taskId: t.id, limit: 2000 })]);
  const touched = t.reportedByClient || Boolean(t.clientClaimedAt) || (t.doneBy ?? '').startsWith('client:') || clientEvents.length > 0 || comments.some((c) => c.author.startsWith('client:'));
  if (touched) throw new CpError(409, `The client has acted on this card, so it stays on the record. ${hide}`);
  if (!(await s.deleteTask(t.id))) throw new CpError(404, 'Card not found.');
  await log(p, t.id, ctx.actor, 'task_deleted', { key: taskKey(p, t), title: t.title, type: t.type, source: t.source, status: t.status });
}

export async function addComment(p: Project, t: Task, body: unknown, clientVisible: boolean, ctx: Ctx) {
  const clean = text(body, CP_LIMITS.comment);
  if (!clean) throw new CpError(400, 'Write a comment first.');
  const c = await store().addComment({ projectId: p.id, taskId: t.id, author: ctx.actor, body: clean, clientVisible });
  await log(p, t.id, ctx.actor, 'comment', { key: taskKey(p, t), clientVisible, length: clean.length });
  return c;
}

// ------------------------------------------------------------------ client actions (shared board)

function clientCtx(nameRaw: unknown, origin?: string): Ctx {
  const name = personName(nameRaw);
  if (name.length < 2) throw new CpError(400, 'Enter your own name first.');
  return { actor: `client:${name}`, origin };
}

async function clientTask(p: Project, taskId: unknown): Promise<Task> {
  if (p.status === 'archived') throw new CpError(409, 'This board is closed.');
  const t = isCpId(taskId) ? await store().getTask(taskId) : null;
  // Hidden cards and other projects' cards do not exist as far as the board is concerned.
  if (!t || t.projectId !== p.id || !t.clientVisible) throw new CpError(404, 'Item not found.');
  return t;
}

/**
 * Tick or untick. Only an ordinary dependency item the client owns and the owner allowed (clientCanTick).
 * Never a milestone, and never a signature, payment or acceptance: anyone holding the link could
 * otherwise mark "UAT signed" or "paid" Done. For those there is clientClaim ("I've done this").
 */
export async function clientTick(p: Project, taskId: unknown, done: boolean, name: unknown, origin?: string): Promise<Task> {
  const ctx = clientCtx(name, origin);
  const t = await clientTask(p, taskId);
  if (t.ownerSide !== 'client' || t.type === 'defect') throw new CpError(403, 'Only your own items can be ticked here.');
  if (!clientCanTick(t)) throw new CpError(403, 'This item is confirmed by Appointmentlyy. Use “I’ve done this” to tell us it is done.');
  if ((t.status === 'done') === done) return t;
  // What we confirmed, the board cannot undo.
  if (!done && !(t.doneBy ?? '').startsWith('client:')) throw new CpError(403, 'This item was confirmed by Appointmentlyy and cannot be unticked here.');
  return setStatus(p, t, done ? 'done' : 'todo', ctx);
}

/**
 * "I've done this" on a card the client may not tick (a signature, a payment, an acceptance, a milestone).
 * It records the claim and tells the owner. The card is NOT done: it shows "Awaiting confirmation" until
 * the owner marks it Done.
 */
export async function clientClaim(p: Project, taskId: unknown, name: unknown, origin?: string): Promise<Task> {
  const ctx = clientCtx(name, origin);
  const t = await clientTask(p, taskId);
  if (t.ownerSide !== 'client' || t.type === 'defect') throw new CpError(403, 'Only your own items can be reported done here.');
  if (clientCanTick(t)) throw new CpError(409, 'Tick this item instead.');
  if (t.status === 'done' || t.clientClaimedAt) return t;
  const updated = await store().updateTask(t.id, { clientClaimedAt: nowIso(), clientClaimedBy: ctx.actor.slice(7) });
  if (!updated) throw new CpError(404, 'Item not found.');
  await log(p, t.id, ctx.actor, 'client_claims_done', { key: taskKey(p, t), title: t.title });
  await safely('claim-notify', async () => {
    if (!ruleOn(p, 'client_done')) return;
    const ev = await claim(p, 'client_done', t.id, { trigger: 'claim', key: taskKey(p, t) }, `client-claim|${t.id}|${today()}`);
    if (!ev) return;
    await settle(
      ev,
      await mailOwner(p, ctx, `${p.clientName}: ${taskKey(p, t)} reported done by the client (needs your confirmation)`, [
        `${ctx.actor.slice(7)} says “${t.title}” is done.`,
        'It is NOT marked Done. Check it, then mark it Done yourself.',
      ]),
    );
  });
  return updated;
}

export async function clientComment(p: Project, taskId: unknown, body: unknown, name: unknown, origin?: string) {
  const ctx = clientCtx(name, origin);
  const t = await clientTask(p, taskId);
  const c = await addComment(p, t, body, true, ctx);
  await safely('comment-notify', () => notifyComments(p, ctx));
  return c;
}

/**
 * Client comments reach the owner in batches: at most one email per project per 15 minutes, saying how
 * many there are. Comments that arrive after the email of their quarter-hour go out with the next comment
 * or the next sweep.
 */
async function notifyComments(p: Project, ctx: Ctx): Promise<void> {
  if (!ruleOn(p, 'client_done')) return;
  const s = store();
  const earlier = (await s.findEvents(p.id, { type: 'automation', rule: 'client_done', limit: 50 })).find((e) => e.detail.trigger === 'comment');
  const fresh = (await s.findComments(p.id, { limit: 200 })).filter((c) => c.author.startsWith('client:') && (!earlier || c.at > earlier.at));
  if (!fresh.length) return;
  const ev = await claim(p, 'client_done', null, { trigger: 'comment' }, `comment-notify|${Math.floor(Date.now() / (15 * 60_000))}`);
  if (!ev) return;
  const tasks = await s.listTasks(p.id);
  const keyOf = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    return t ? taskKey(p, t) : 'a card';
  };
  const out = await mailOwner(p, ctx, `${p.clientName}: ${fresh.length} new client comment${fresh.length === 1 ? '' : 's'}`, [
    `${fresh.length} new comment${fresh.length === 1 ? '' : 's'} from the client board${fresh.length > 5 ? ' (the latest 5 are below)' : ''}:`,
    ...fresh.slice(0, 5).map((c) => `${c.author.slice(7)} on ${keyOf(c.taskId)}: ${c.body.slice(0, 300)}`),
  ]);
  await settle(ev, { count: fresh.length, ...out });
}

/** The client reports a UAT defect: lands as a defect in To do, "reported by client", severity as proposed. */
export async function clientDefect(p: Project, raw: Record<string, unknown>, origin?: string): Promise<Task> {
  const ctx = clientCtx(raw.name, origin);
  if (p.status === 'archived') throw new CpError(409, 'This board is closed.');
  if (!uatOpen(p)) throw new CpError(403, 'Issue reports open when acceptance testing starts.');
  const title = line(raw.title, CP_LIMITS.taskTitle);
  const steps = text(raw.steps, CP_LIMITS.steps);
  if (title.length < 4) throw new CpError(400, 'Give the issue a short title.');
  if (steps.length < 10) throw new CpError(400, 'Describe the steps to see the issue.');
  const severity = isSeverity(raw.severity) ? raw.severity : 'S3';
  const s = store();
  const open = (await s.listTasks(p.id)).filter((t) => t.type === 'defect');
  if (open.length >= 150) throw new CpError(429, 'Too many issues are open. Contact us directly.');
  const reportedAt = nowIso();
  const num = await nextNum(p);
  const t = blankTask(p, num, {
    type: 'defect',
    phase: 'week_3',
    title,
    steps,
    severity,
    ownerSide: 'us',
    reportedBy: ctx.actor.slice(7),
    reportedByClient: true,
    reportedAt,
    dueDate: defectFixDue(reportedAt, severity),
    source: 'client',
    clientVisible: true,
    sort: num * 10 + 100_000,
  });
  await s.insertTasks([t]);
  await log(p, t.id, ctx.actor, 'client_defect', { key: taskKey(p, t), title, severity, fixDue: t.dueDate });
  await safely('defect-notify', async () => {
    if (!ruleOn(p, 'defect_notify')) return;
    // Its own mail budget: ticks and comments can never use up the allowance for defect reports.
    const out = await mailOwner(
      p,
      ctx,
      `${p.clientName}: defect reported (${SEVERITY_LABEL[severity]} proposed)`,
      [`${t.reportedBy} reported ${taskKey(p, t)}: ${title}`, `Proposed severity: ${SEVERITY_LABEL[severity]}. Fix due ${fmtDateLong(t.dueDate)} unless you re-classify it.`, `Steps: ${steps.slice(0, 800)}`],
      'defect',
    );
    await fired(p, 'defect_notify', t.id, { key: taskKey(p, t), severity, fixDue: t.dueDate, ...out });
  });
  return t;
}

/** The client confirms (or withdraws) the retest of a fixed defect they reported. */
export async function clientRetest(p: Project, taskId: unknown, confirmed: boolean, name: unknown, origin?: string): Promise<Task> {
  const ctx = clientCtx(name, origin);
  const t = await clientTask(p, taskId);
  if (t.type !== 'defect' || !t.reportedByClient) throw new CpError(403, 'You can confirm the retest of issues you reported.');
  if (t.status !== 'done') throw new CpError(409, 'This issue is not marked fixed yet.');
  if (t.retestConfirmed === confirmed) return t;
  const updated = await store().updateTask(t.id, { retestConfirmed: confirmed });
  if (!updated) throw new CpError(404, 'Item not found.');
  await log(p, t.id, ctx.actor, 'retest_confirmed', { key: taskKey(p, t), confirmed });
  return updated;
}

// ------------------------------------------------------------------ automations: event-driven (inline)

const isReadiness = (t: Task) => t.type === 'milestone' && (t.sopKey === 'readiness' || /readiness|ready for uat/i.test(t.title));

async function onTaskDone(p: Project, t: Task, ctx: Ctx): Promise<void> {
  const s = store();
  // Rule 1: a client item is completed.
  if (t.ownerSide === 'client' && t.type !== 'defect' && ruleOn(p, 'client_done')) {
    const unblocked: string[] = [];
    for (const other of await s.listTasks(p.id)) {
      if (other.blockedBy !== t.id || other.status !== 'blocked') continue;
      await s.updateTask(other.id, { status: 'todo' });
      await log(p, other.id, 'system', 'status_changed', { key: taskKey(p, other), from: 'blocked', to: 'todo', title: other.title, because: `${taskKey(p, t)} is done` });
      unblocked.push(taskKey(p, other));
    }
    // At most one owner email per card per day, however often the card is ticked and unticked.
    const ev = await claim(p, 'client_done', t.id, { trigger: 'done', key: taskKey(p, t), unblocked }, `client-done|${t.id}|${today()}`);
    if (ev) {
      await settle(
        ev,
        await mailOwner(p, ctx, `${p.clientName}: ${taskKey(p, t)} completed by the client`, [
          `“${t.title}” was marked done by ${ctx.actor.startsWith('client:') ? ctx.actor.slice(7) : 'you, on the client’s behalf'}.`,
          ...(unblocked.length ? [`Unblocked: ${unblocked.join(', ')} (moved from Blocked to To do).`] : []),
        ]),
      );
    } else if (unblocked.length) {
      await fired(p, 'client_done', t.id, { trigger: 'done', key: taskKey(p, t), unblocked, emailed: false, note: 'already notified today' });
    }
  }
  // Rule 6: the Readiness milestone was marked Done by hand -> draft the notice and a status update (never sent).
  if (isReadiness(t)) await draftReadiness(p, t, 'marked_done');
  // Rule 2: every other card in the phase is done.
  if (t.type !== 'defect' && t.type !== 'milestone' && ruleOn(p, 'phase_milestone')) await onPhaseWorkDone(p, t.phase, ctx);
}

/**
 * Rule 6. Drafts only: the Readiness Notice text and a status update for the owner to review. At most once
 * per trigger for a milestone ('phase_complete' = the work before it is done; 'marked_done' = the owner
 * marked it Done), claimed first. It never sends anything and never changes the milestone.
 */
async function draftReadiness(p: Project, milestone: Task, trigger: 'phase_complete' | 'marked_done'): Promise<void> {
  if (!ruleOn(p, 'readiness_draft')) return;
  const ev = await claim(p, 'readiness_draft', milestone.id, { trigger, key: taskKey(p, milestone) }, `readiness|${milestone.id}|${trigger}`);
  if (!ev) return;
  const s = store();
  const [tasks, delays] = await Promise.all([s.listTasks(p.id), s.findEvents(p.id, { type: 'client_delay', limit: 1000 })]);
  const draft = await draftStatus(p, tasks, delays);
  await s.updateProject(p.id, { statusDraft: { ...draft, readinessNotice: buildReadinessNotice(p, tasks) } });
  await settle(ev, { drafted: ['readinessNotice', 'clientUpdate', 'deliveryReport'], ai: draft.ai, note: 'drafts only: nothing was sent' });
}

/**
 * Rule 2. When every non-milestone card of a phase is Done:
 *  - internal checkpoints flagged autoComplete (ours only) are marked Done by the system, but ONLY when
 *    the card that finished the phase was completed by the owner. A tick from the client board never
 *    completes one of our milestones;
 *  - every other open milestone stands for an external or legal act (a notice sent, a signature, a
 *    payment, go-live) and is NEVER completed here: the owner is told it is ready and marks it Done by hand.
 * The owner is notified once per outcome (claimed first).
 */
async function onPhaseWorkDone(p: Project, phase: Phase, ctx: Ctx): Promise<void> {
  const s = store();
  const inPhase = (await s.listTasks(p.id)).filter((x) => x.phase === phase && x.type !== 'defect');
  const work = inPhase.filter((x) => x.type !== 'milestone');
  const open = inPhase.filter((x) => x.type === 'milestone' && x.status !== 'done');
  if (!work.length || !work.every((x) => x.status === 'done') || !open.length) return;
  const byOwner = ctx.actor.startsWith('owner:');
  const auto = byOwner ? open.filter((x) => x.autoComplete === true && x.ownerSide === 'us') : [];
  const manual = open.filter((x) => !auto.includes(x));
  const marked: string[] = [];
  for (const gate of auto) {
    const done = await s.updateTask(gate.id, { status: 'done', doneAt: nowIso(), doneBy: 'system' });
    if (!done) continue;
    await log(p, gate.id, 'system', 'status_changed', { key: taskKey(p, gate), from: gate.status, to: 'done', title: gate.title, because: 'every card in the phase is done' });
    marked.push(taskKey(p, gate));
  }
  const ready = manual.map((x) => taskKey(p, x));
  // One notice per set of waiting milestones (so finishing the phase again says nothing new), and
  // otherwise one per set of checkpoints that were just completed.
  const detail = { phase, milestones: marked, ready };
  let ev = manual.length ? await claim(p, 'phase_milestone', null, detail, `phase|${phase}|ready|${shortHash(manual.map((x) => x.id).sort().join(','))}`) : null;
  if (!ev && marked.length) ev = await claim(p, 'phase_milestone', null, detail, `phase|${phase}|done|${shortHash(marked.join(','))}`);
  if (ev) {
    const label = PHASE_LABEL[phase];
    const out = await mailOwner(p, ctx, `${p.clientName}: ${label} work is complete`, [
      `${label} work is complete.`,
      ...(marked.length ? [`Internal checkpoints marked Done: ${marked.join(', ')}.`] : []),
      ...manual.map((x) => `${taskKey(p, x)} “${x.title}” is ready${x.ownerSide === 'client' ? ' for the client to complete' : ' for you to complete'}. It stays open until it is marked Done by hand.`),
    ]);
    await settle(ev, { ...out, ...(ready.length ? { note: `${out.note}; ready, not auto-completed: ${ready.join(', ')}` } : {}) });
  }
  // Rule 6 may draft now (a draft for the owner); the Readiness milestone itself stays open.
  for (const m of manual) if (isReadiness(m)) await draftReadiness(p, m, 'phase_complete');
}

// ------------------------------------------------------------------ client delays + time-based automations (lazy sweep)

/** A client card finished after its due date: one permanent record, with the Business Days late. */
async function recordLateFinish(p: Project, t: Task): Promise<void> {
  if (t.ownerSide !== 'client' || t.type === 'defect' || !t.dueDate || !t.doneAt) return;
  const doneDay = todayManila(new Date(t.doneAt));
  if (doneDay <= t.dueDate) return;
  await log(p, t.id, 'system', 'client_delay', { key: taskKey(p, t), title: t.title, state: 'done_late', dueDate: t.dueDate, doneDay, days: businessDaysBetween(t.dueDate, doneDay) }, `delay|${t.id}|done|${t.dueDate}|${t.doneAt}`);
}

const g = globalThis as typeof globalThis & { __cpSweeps?: Map<string, Promise<void>>; __cpSweptAt?: Map<string, number> };
const sweeping = (g.__cpSweeps ??= new Map());
const sweptAt = (g.__cpSweptAt ??= new Map());

/**
 * Lazy, idempotent housekeeping for one project (there is no cron): called on owner reads, on the
 * shared board read, and by POST /api/client-projects/sweep.
 *  - Client Delay records: a client card open past its due date gets one `client_delay` event.
 *  - Rule 4: fixed-template reminders to the client contact (due in 2 Business Days; first overdue day).
 *  - Rule 5: a daily digest of overdue "Us" cards to the owner.
 *  - Batched client-comment notices that are still waiting.
 * Every record is claimed first under a dedupe key, so running it again, or on two servers at once, does
 * nothing twice. It never throws. `minGapMs` skips the sweep when one ran recently (list pages).
 */
export function sweepProject(projectId: string, opts: { origin?: string; minGapMs?: number } = {}): Promise<void> {
  const running = sweeping.get(projectId);
  if (running) return running;
  if (opts.minGapMs && Date.now() - (sweptAt.get(projectId) ?? 0) < opts.minGapMs) return Promise.resolve();
  const run = (async () => {
    try {
      await doSweep(projectId, opts.origin);
      sweptAt.set(projectId, Date.now());
    } catch (err) {
      console.error('[client-projects sweep]', err instanceof Error ? err.message : err);
    } finally {
      sweeping.delete(projectId);
    }
  })();
  sweeping.set(projectId, run);
  return run;
}

async function doSweep(projectId: string, origin?: string): Promise<void> {
  const s = store();
  const p = await s.getProject(projectId);
  if (!p || p.status !== 'active') return;
  const now = today();
  const tasks = await s.listTasks(p.id);
  const clientOpen = tasks.filter((t) => t.ownerSide === 'client' && t.type !== 'defect' && t.status !== 'done' && t.dueDate);
  const overdueClient = clientOpen.filter((t) => isOverdue(t, now));
  const overdueUs = tasks.filter((t) => t.ownerSide === 'us' && isOverdue(t, now));

  // Client Delay records (always on: this is the dispute record, not an optional rule). Only this event
  // type is read, and the insert itself is deduplicated, so a missed read can never double-record.
  if (overdueClient.length) {
    const logged = new Set((await s.findEvents(p.id, { type: 'client_delay', limit: 1000 })).filter((e) => e.detail.state === 'overdue').map((e) => `${e.taskId}|${e.detail.dueDate}`));
    for (const t of overdueClient) {
      if (logged.has(`${t.id}|${t.dueDate}`)) continue;
      await log(p, t.id, 'system', 'client_delay', { key: taskKey(p, t), title: t.title, state: 'overdue', dueDate: t.dueDate, daysAtDetection: businessDaysBetween(t.dueDate as string, now) }, `delay|${t.id}|overdue|${t.dueDate}`);
    }
  }

  // Rule 4: reminders to the client (off by default; fixed template; once per card per kind).
  if (ruleOn(p, 'client_reminders')) {
    const visible = clientOpen.filter((t) => t.clientVisible);
    const want: { t: Task; kind: 'due_soon' | 'overdue' }[] = [
      ...visible.filter((t) => !isOverdue(t, now) && businessDaysBetween(now, t.dueDate as string) <= 2).map((t) => ({ t, kind: 'due_soon' as const })),
      ...visible.filter((t) => isOverdue(t, now)).map((t) => ({ t, kind: 'overdue' as const })),
    ];
    if (want.length) {
      // A cheap pre-filter (this rule's events only). The claim below is what actually guarantees "once".
      const prior = await s.findEvents(p.id, { type: 'automation', rule: 'client_reminders', limit: 1000 });
      const keyOf = (w: { t: Task; kind: string }) => `${w.t.id}|${w.kind}|${w.t.dueDate}`;
      const sent = new Set(prior.filter((e) => e.detail.emailed === true).map((e) => `${e.taskId}|${e.detail.kind}|${e.detail.dueDate}`));
      const failedToday = new Set(prior.filter((e) => e.detail.willRetry === true && e.detail.day === now).map((e) => `${e.taskId}|${e.detail.kind}|${e.detail.dueDate}`));
      const due = want.filter((w) => !sent.has(keyOf(w)));
      const url = liveBoardUrl(p, origin);
      const detailOf = (w: { t: Task; kind: string }) => ({ kind: w.kind, key: taskKey(p, w.t), title: w.t.title, dueDate: w.t.dueDate, to: p.clientContactEmail || null });
      const failedKey = (w: { t: Task; kind: string }) => `remind-failed|${w.t.id}|${w.kind}|${w.t.dueDate}|${now}`;
      // Known in advance that nothing can be sent: say so (at most once a day per card) and keep every
      // reminder's turn. Nothing is claimed, so the next sweep simply tries again.
      const blocked = !p.clientContactEmail ? 'email not sent: no client contact email' : !url ? 'email not sent: the board is not shared' : !mailStatus().configured ? 'email not sent: mail not configured' : null;
      if (blocked) {
        for (const w of due) {
          if (failedToday.has(keyOf(w))) continue;
          await log(p, w.t.id, 'system', 'automation', { rule: 'client_reminders', ...detailOf(w), emailed: false, note: blocked, willRetry: true, day: now }, failedKey(w));
        }
      } else if (due.length && url) {
        // Claim first, then send to exactly the claimed cards, then record the outcome on each claim.
        const claimed: { t: Task; kind: 'due_soon' | 'overdue'; ev: CpEvent }[] = [];
        for (const w of due) {
          const ev = await claim(p, 'client_reminders', w.t.id, detailOf(w), `remind|${keyOf(w)}`);
          if (ev) claimed.push({ ...w, ev });
        }
        if (claimed.length) {
          const m = buildClientReminder(p, claimed.filter((c) => c.kind === 'due_soon').map((c) => c.t), claimed.filter((c) => c.kind === 'overdue').map((c) => c.t), url);
          const out = await sendMail(p, 'cp-client', p.clientContactEmail, m.subject, m.lines.filter((l) => l !== url), { label: 'Open your project board', url });
          for (const c of claimed) {
            if (out.emailed) await settle(c.ev, out);
            else {
              // The send failed: the reminder keeps its turn. The claim moves to today's "not sent" key
              // (one such record a day per card), which frees the real key for the next sweep.
              const moved = await s.settleEvent(c.ev.id, { ...out, pending: false, willRetry: true, day: now }, failedKey(c));
              if (!moved) await s.removeEvent(c.ev.id);
            }
          }
        }
      }
    }
  }

  // Rule 5: daily digest of our own overdue cards (claimed first: one per project per day).
  if (overdueUs.length && ruleOn(p, 'us_overdue_digest')) {
    const ev = await claim(p, 'us_overdue_digest', null, { day: now, count: overdueUs.length, keys: overdueUs.slice(0, 40).map((t) => taskKey(p, t)) }, `digest|${now}`);
    if (ev) {
      await settle(
        ev,
        await mailOwner(p, { actor: 'system', origin }, `${p.clientName}: ${overdueUs.length} of our items overdue`, [
          'Overdue on our side:',
          ...overdueUs.slice(0, 40).map((t) => `- ${taskKey(p, t)} ${t.title} (due ${fmtDateLong(t.dueDate)}, ${businessDaysBetween(t.dueDate as string, now)} business day(s) late, ${STATUS_LABEL[t.status]})`),
        ]),
      );
    }
  }

  // Client comments that arrived after the last batched notice.
  await notifyComments(p, { actor: 'system', origin });
}

// ------------------------------------------------------------------ AI plan: approve / discard

export interface ApproveEdits {
  remove?: unknown;
  tasks?: unknown;
  summaryClient?: unknown;
  briefingInternal?: unknown;
}

/** Apply the owner's optional per-card edits to the stored draft (the draft itself never comes from the browser). */
function applyEdits(proposal: Proposal, edits: ApproveEdits): Proposal {
  const remove = new Set(Array.isArray(edits.remove) ? edits.remove.filter((n): n is number => Number.isInteger(n)) : []);
  const over = edits.tasks && typeof edits.tasks === 'object' && !Array.isArray(edits.tasks) ? (edits.tasks as Record<string, Record<string, unknown>>) : {};
  const tasks: ProposalTask[] = [];
  proposal.tasks.forEach((t, i) => {
    if (remove.has(i)) return;
    const e = over[String(i)];
    if (!e || typeof e !== 'object') return void tasks.push(t);
    const next = { ...t };
    if ('title' in e) next.title = line(e.title, CP_LIMITS.taskTitle) || t.title;
    if (e.ownerSide === 'us' || e.ownerSide === 'client') next.ownerSide = e.ownerSide;
    if (isOffset(e.dueOffsetBd)) next.dueOffsetBd = e.dueOffsetBd;
    if (isPhase(e.phase)) next.phase = e.phase;
    if (next.kind === 'sop' && (next.title !== t.title || next.ownerSide !== t.ownerSide || next.dueOffsetBd !== t.dueOffsetBd)) next.kind = 'changed';
    tasks.push(next);
  });
  return {
    ...proposal,
    tasks,
    summaryClient: typeof edits.summaryClient === 'string' ? text(edits.summaryClient, 1500) : proposal.summaryClient,
    briefingInternal: typeof edits.briefingInternal === 'string' ? text(edits.briefingInternal, 5000) : proposal.briefingInternal,
  };
}

/**
 * The owner's "Approve plan" click: the only moment AI output reaches the board. Cards that match an
 * SOP card update it; new ones are created; the client summary and the internal briefing are set.
 */
export async function approveRun(p: Project, run: AiRun, edits: ApproveEdits, ctx: Ctx): Promise<{ created: number; updated: number }> {
  if (run.status !== 'draft' || !run.proposal) throw new CpError(409, 'There is no draft to approve.');
  const proposal = applyEdits(run.proposal, edits);
  const s = store();
  if (!proposal.tasks.length) throw new CpError(400, 'Keep at least one card, or discard the draft.');
  const existing = await s.listTasks(p.id);
  const bySop = new Map(existing.filter((t) => t.sopKey).map((t) => [t.sopKey as string, t]));
  const fresh = proposal.tasks.filter((t) => t.kind === 'new' || !bySop.has(t.matchesSopCard));
  if (existing.length + fresh.length > CP_LIMITS.tasksPerProject) throw new CpError(409, 'This plan would exceed the project’s card limit.');
  // Claim the run first, so a double click cannot apply it twice.
  const claimed = await s.updateRun(run.id, { status: 'approved', proposal }, ['draft']);
  if (!claimed) throw new CpError(409, 'This draft was already approved or replaced. Reload.');
  const ref = (t: ProposalTask) => line(`${t.sourcePage ? `p.${t.sourcePage}` : ''}${t.sourceQuote ? `${t.sourcePage ? ': ' : ''}“${t.sourceQuote}”` : ''}`, CP_LIMITS.sourceRef);
  let updated = 0;
  for (const t of proposal.tasks) {
    const card = t.kind === 'new' ? undefined : bySop.get(t.matchesSopCard);
    if (!card) continue;
    const patch: Partial<Task> = { sourceRef: ref(t) };
    if (t.kind === 'changed') {
      Object.assign(patch, {
        title: t.title,
        phase: t.phase,
        ownerSide: t.ownerSide,
        type: typeFor(t.ownerSide, t.isGate),
        dueOffsetBd: t.dueOffsetBd,
        ...(card.status !== 'done' ? { dueDate: addBusinessDays(p.kickoffDate, t.dueOffsetBd) } : {}),
        ...(t.descriptionClient ? { descriptionClient: t.descriptionClient } : {}),
        ...(t.deliverableRef ? { deliverableRef: t.deliverableRef } : {}),
      });
    }
    await s.updateTask(card.id, patch);
    if (t.kind === 'changed') updated++;
  }
  let created = 0;
  if (fresh.length) {
    const first = await s.nextTaskNums(p.id, fresh.length);
    const cards = fresh.map((t, i) =>
      blankTask(p, first + i, {
        type: typeFor(t.ownerSide, t.isGate),
        phase: t.phase,
        title: t.title,
        descriptionClient: t.descriptionClient,
        ownerSide: t.ownerSide,
        dueOffsetBd: t.dueOffsetBd,
        dueDate: addBusinessDays(p.kickoffDate, t.dueOffsetBd),
        deliverableRef: t.deliverableRef,
        clientVisible: true,
        sort: Math.max(t.dueOffsetBd, -30) * 100 + 5000 + i,
        source: 'ai',
        sourceRef: ref(t),
        sopKey: t.kind === 'new' ? null : t.matchesSopCard,
      }),
    );
    await s.insertTasks(cards);
    created = cards.length;
  }
  const goLive = (await s.listTasks(p.id)).find((t) => t.sopKey === 'go-live')?.dueDate;
  await s.updateProject(p.id, {
    summaryClient: proposal.summaryClient,
    briefingInternal: proposal.briefingInternal,
    planMeta: { keyDates: proposal.keyDates, fees: proposal.fees, risks: proposal.risks },
    ...(goLive ? { targetGoLive: goLive } : {}),
  });
  await log(p, null, ctx.actor, 'plan_approved', { runId: run.id, created, updated, cards: proposal.tasks.length });
  return { created, updated };
}

export async function discardRun(p: Project, run: AiRun, ctx: Ctx): Promise<void> {
  const done = await store().updateRun(run.id, { status: 'discarded' }, ['draft', 'failed']);
  if (!done) throw new CpError(409, 'There is no draft to discard.');
  await log(p, null, ctx.actor, 'ai_discarded', { runId: run.id });
}

/** The "AI status update" action: draft the client note and the Delivery Report text. A draft only. */
export async function draftStatusUpdate(p: Project, ctx: Ctx) {
  const s = store();
  const [tasks, events] = await Promise.all([s.listTasks(p.id), s.findEvents(p.id, { type: 'client_delay', limit: 1000 })]);
  const draft = await draftStatus(p, tasks, events);
  const statusDraft = { ...draft, ...(p.statusDraft?.readinessNotice ? { readinessNotice: p.statusDraft.readinessNotice } : {}) };
  await s.updateProject(p.id, { statusDraft });
  await log(p, null, ctx.actor, 'status_drafted', { ai: draft.ai });
  return statusDraft;
}
