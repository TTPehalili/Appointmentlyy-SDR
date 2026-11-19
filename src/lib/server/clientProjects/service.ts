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
import { getClientProjectStore, INTAKE_SOURCE, isCpId } from '@/lib/server/clientProjectStore';
import { isLocalTestServer } from '@/lib/server/agreements/mail';
import { draftStatus, noLinks } from '@/lib/server/clientProjects/ai';
import { buildClientReminder, buildReadinessNotice } from '@/lib/server/clientProjects/statusText';
import { pdfPageCount } from '@/lib/server/clientProjects/pdfText';
import { eventText } from '@/components/clientProjects/eventText';
import {
  attachmentName,
  blankTask,
  clientCanTick,
  consoleUrl,
  detectAttachment,
  openBlockers,
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
  LABEL_COLORS,
  PHASES,
  PHASE_END_OFFSET,
  PHASE_LABEL,
  PRIORITIES,
  mentionedPeople,
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
  type ChecklistItem,
  type CpEvent,
  type CpEventType,
  type CpFileMeta,
  type CpNotification,
  type Label,
  type LabelColor,
  type Person,
  type Phase,
  type Priority,
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
    /** Extra fields for the JSON error body (e.g. `code` and the open blockers). */
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Ctx {
  /** 'owner:<email>', 'client:<name>' or 'system'. */
  actor: string;
  origin?: string;
  /** The signed-in owner's display name (seeds the project's people). */
  ownerName?: string;
  /**
   * Fast endpoints (kanban move, bulk) pass next/server `after` here: automations and notifications then
   * run after the response, so the request stays within its round-trip budget. Without it they run inline.
   */
  defer?: (fn: () => Promise<void>) => void;
}

/** Automations and notifications: inline by default, after the response when the route asks. Never throws. */
function later(ctx: Ctx, what: string, fn: () => Promise<void>): Promise<void> {
  if (ctx.defer) {
    ctx.defer(() => safely(what, fn));
    return Promise.resolve();
  }
  return safely(what, fn);
}

const store = () => getClientProjectStore();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function log(p: Pick<Project, 'id'>, taskId: string | null, actor: string, type: CpEventType, detail: Record<string, unknown> = {}, dedupeKey?: string) {
  return store().addEvent({ projectId: p.id, taskId, actor: actor.slice(0, 200), type, detail }, dedupeKey);
}

// ------------------------------------------------------------------ mail (the Agreements sender; dev outbox on test servers)

export type MailOutcome = { emailed: boolean; note: string };

/**
 * Send one plain notification. Never throws: the outcome is recorded on the automation event.
 * `budget`: hourly allowance per project. Defect reports have their own, so a burst of ticks or comments
 * can never starve "a client reported a defect".
 */
export async function sendMail(p: Project, kind: 'cp-owner' | 'cp-client' | 'cp-person', to: string, subject: string, lines: string[], cta?: { label: string; url: string }, budget: 'general' | 'defect' | 'assign' | 'mention' = 'general', who?: string): Promise<MailOutcome> {
  try {
    if (!to || !EMAIL_RE.test(to)) return { emailed: false, note: 'email not sent: no address' };
    if (!mailStatus().configured) return { emailed: false, note: 'email not sent: mail not configured' };
    // Assignment and mention emails reach third parties: each has its own, smaller allowance, so a burst of
    // mentions from the shared board can never use up the owner's assignment emails (or the reverse).
    if (!rateLimit(`cp-mail-${budget}:${p.id}`, budget === 'defect' ? 30 : budget === 'assign' || budget === 'mention' ? 20 : 40, 60 * 60_000)) return { emailed: false, note: 'email not sent: hourly limit reached' };
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
    return res.ok ? { emailed: true, note: `emailed ${who ?? (kind === 'cp-owner' ? 'the owner' : 'the client contact')}` } : { emailed: false, note: `email not sent: ${res.error}`.slice(0, 300) };
  } catch (err) {
    console.error('[client-projects mail]', err instanceof Error ? err.message : err);
    return { emailed: false, note: 'email not sent: mail error' };
  }
}

export async function mailOwner(p: Project, ctx: Ctx, subject: string, lines: string[], budget: 'general' | 'defect' = 'general'): Promise<MailOutcome> {
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
export async function claim(p: Project, rule: AutomationRule, taskId: string | null, detail: Record<string, unknown>, dedupeKey: string): Promise<CpEvent | null> {
  return log(p, taskId, 'system', 'automation', { rule, ...detail, pending: true }, dedupeKey.slice(0, 200));
}

export async function settle(ev: CpEvent, detail: Record<string, unknown>): Promise<void> {
  await store().settleEvent(ev.id, { ...detail, pending: false });
}

const shortHash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);

/** Automations must never break the request that triggered them. */
export async function safely(what: string, fn: () => Promise<void>): Promise<void> {
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
    people: [ownerPerson(ctx)].filter((x): x is Person => Boolean(x)),
    labels: [],
    // Client Intake: on when the owner asks for it (the create dialog's default); off for API callers that do not.
    settings: { peopleSeeded: true, ...(raw.intake === true ? { intake: { enabled: true } } : {}) } as Project['settings'],
    notifSeenAt: now,
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
  // ATOMIC: a project row never outlives a failed seed. If the cards (or the first event) cannot be
  // written, the project row is removed again (its cards and events go with it) and the error is reported.
  try {
    if (fromSop) count = await seedSop(created, clientName);
    await log(created, null, ctx.actor, 'project_created', { key, fromSop, cards: count, kickoffDate: p.kickoffDate });
  } catch (err) {
    console.error('[client-projects create] seeding failed; removing the project row:', err instanceof Error ? err.message : err);
    let removed = false;
    try {
      removed = await s.deleteProject(created.id);
    } catch (e2) {
      console.error('[client-projects create] ROLLBACK FAILED, an empty project may remain:', created.id, e2 instanceof Error ? e2.message : e2);
    }
    throw new CpError(500, removed ? 'The project could not be created (its cards could not be saved). Nothing was kept. Try again.' : 'The project could not be created, and the empty project could not be removed. Open it and use “Load SOP cards”, or delete the draft.');
  }
  return (await s.getProject(created.id)) ?? created;
}

/** The signed-in owner as a project person (our side), from the request context. */
function ownerPerson(ctx: Ctx): Person | null {
  if (!ctx.actor.startsWith('owner:')) return null;
  const email = ctx.actor.slice(6).toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return { id: newId(), name: line(ctx.ownerName, CP_LIMITS.personName) || email.split('@')[0], email, side: 'us', role: 'Project owner', createdAt: nowIso() };
}

/**
 * Write the whole SOP board for a project that has no cards. Returns how many were written. A local
 * test server can force a failure (client name marker) so the rollback can be tested; never in production.
 */
async function seedSop(p: Project, marker = ''): Promise<number> {
  const s = store();
  const cards = sopTasks(p, 1);
  const first = await s.nextTaskNums(p.id, cards.length);
  cards.forEach((c, i) => (c.num = first + i));
  if (marker.includes('CP_TEST_SEED_FAIL') && process.env.CP_AI_STUB === '1' && isLocalTestServer()) throw new Error('test: forced seed failure');
  await s.insertTasks(cards);
  return cards.length;
}

/** "Load SOP cards": only for a project with no cards at all (an empty shell, or one created without the SOP). */
export async function loadSop(p: Project, ctx: Ctx): Promise<number> {
  const s = store();
  const cards = sopTasks(p, 1);
  // One round trip for the check and the number reservation. If the project is not empty after all, the
  // reserved numbers are simply not used (a gap in the keys; nothing else changes).
  const [existing, first] = await Promise.all([s.listTasks(p.id), s.nextTaskNums(p.id, cards.length)]);
  if (existing.length > 0) throw new CpError(409, 'This project already has cards. The SOP can only be loaded into an empty project.');
  cards.forEach((c, i) => (c.num = first + i));
  await Promise.all([s.insertTasks(cards), log(p, null, ctx.actor, 'sop_loaded', { cards: cards.length })]);
  return cards.length;
}

/** Projects from before v2 have no people: seed the signed-in owner once (never again after they edit the list). */
export async function ensureOwnerSeed(p: Project, ctx: Ctx): Promise<Project> {
  const settings = (p.settings ?? {}) as Project['settings'] & { peopleSeeded?: boolean };
  if (settings.peopleSeeded || (p.people ?? []).length) return p;
  const me = ownerPerson(ctx);
  if (!me) return p;
  return (await store().updateProject(p.id, { people: [me], settings: { ...settings, peopleSeeded: true } as Project['settings'] })) ?? p;
}

// ------------------------------------------------------------------ people and labels (owner)

const isSide = (v: unknown): v is 'us' | 'client' => v === 'us' || v === 'client';
const personOf = (p: Pick<Project, 'people'>, id: unknown): Person | null => (typeof id === 'string' ? ((p.people ?? []).find((x) => x.id === id) ?? null) : null);

/** Our own people may carry the company name; personName() refuses it (that rule is for the client side). */
function ownName(v: unknown): string {
  return line(v, CP_LIMITS.personName).replace(/[<>"`\\{}[\]|:;=]/g, '').trim();
}

/** A person from owner input: every field cleaned and capped; `base` supplies the fields not sent (a patch). */
function cleanPerson(raw: Record<string, unknown>, base?: Person): Omit<Person, 'id' | 'createdAt'> {
  const side = 'side' in raw || !base ? raw.side : base.side;
  if (!isSide(side)) throw new CpError(400, 'A person is on our side (Us) or the client’s side.');
  const name = 'name' in raw || !base ? (side === 'us' ? ownName(raw.name) : personName(raw.name)) : side === 'client' ? personName(base.name) : base.name;
  if (name.length < 2) throw new CpError(400, side === 'client' ? 'Enter the person’s name (a client contact cannot be named after us).' : 'Enter the person’s name.');
  const email = 'email' in raw || !base ? line(raw.email, 254).toLowerCase() : base.email;
  if (email && !EMAIL_RE.test(email)) throw new CpError(400, 'Enter a valid email address, or leave it empty.');
  const role = 'role' in raw || !base ? line(raw.role, CP_LIMITS.roleLabel) : base.role;
  return { name, side, email, role };
}

export interface ProjectAndTasks {
  project: Project;
  tasks: Task[];
}

export async function addPerson(p: Project, raw: Record<string, unknown>, ctx: Ctx): Promise<ProjectAndTasks> {
  const people = p.people ?? [];
  if (people.length >= CP_LIMITS.people) throw new CpError(409, `A project holds at most ${CP_LIMITS.people} people.`);
  const clean = cleanPerson(raw);
  if (people.some((x) => x.name.toLowerCase() === clean.name.toLowerCase())) throw new CpError(409, 'A person with that name is already on this project.');
  const person: Person = { id: newId(), createdAt: nowIso(), ...clean };
  const s = store();
  const [updated, tasks] = await Promise.all([
    s.updateProject(p.id, { people: [...people, person], settings: { ...(p.settings ?? {}), peopleSeeded: true } as Project['settings'] }),
    s.listTasks(p.id),
    log(p, null, ctx.actor, 'person_added', { personId: person.id, name: person.name, side: person.side, hasEmail: Boolean(person.email) }),
  ]);
  if (!updated) throw new CpError(404, 'Project not found.');
  return { project: updated, tasks };
}

export async function patchPerson(p: Project, personId: string, raw: Record<string, unknown>, ctx: Ctx): Promise<ProjectAndTasks> {
  const people = p.people ?? [];
  const cur = people.find((x) => x.id === personId);
  if (!cur) throw new CpError(404, 'Person not found.');
  const c = cleanPerson(raw, cur);
  if (people.some((x) => x.id !== cur.id && x.name.toLowerCase() === c.name.toLowerCase())) throw new CpError(409, 'Another person on this project has that name.');
  const next: Person = { ...cur, ...c };
  const s = store();
  const tasks = await s.listTasks(p.id);
  // The card's Us/Client side follows its assignee: when a person changes side, so do their cards.
  const writes: Promise<unknown>[] = [];
  const after = tasks.map((t) => {
    if (next.side === cur.side || t.assigneeId !== cur.id || t.type === 'defect' || t.ownerSide === next.side) return t;
    const gate = t.type === 'milestone';
    const patch: Partial<Task> = { ownerSide: next.side, type: typeFor(next.side, gate), ...(!gate || next.side !== 'us' ? { autoComplete: false } : {}), ...(gate || next.side !== 'client' ? { clientMayTick: false } : {}) };
    writes.push(s.updateTask(t.id, patch));
    return { ...t, ...patch };
  });
  const [updated] = await Promise.all([
    s.updateProject(p.id, { people: people.map((x) => (x.id === cur.id ? next : x)) }),
    ...writes,
    log(p, null, ctx.actor, 'person_updated', { personId: cur.id, name: next.name, side: next.side, changed: (['name', 'side', 'email', 'role'] as const).filter((k) => cur[k] !== next[k]), cardsMoved: writes.length }),
  ]);
  if (!updated) throw new CpError(404, 'Project not found.');
  return { project: updated as Project, tasks: after };
}

/** Remove a person: their cards become unassigned and they stop watching. The cards themselves are untouched. */
export async function removePerson(p: Project, personId: string, ctx: Ctx): Promise<ProjectAndTasks> {
  const people = p.people ?? [];
  const cur = people.find((x) => x.id === personId);
  if (!cur) throw new CpError(404, 'Person not found.');
  const s = store();
  const tasks = await s.listTasks(p.id);
  const writes: Promise<unknown>[] = [];
  let unassigned = 0;
  const after = tasks.map((t) => {
    const patch: Partial<Task> = {};
    if (t.assigneeId === cur.id) patch.assigneeId = null;
    if ((t.watchers ?? []).includes(cur.id)) patch.watchers = t.watchers.filter((w) => w !== cur.id);
    if (!Object.keys(patch).length) return t;
    if ('assigneeId' in patch) unassigned++;
    writes.push(s.updateTask(t.id, patch));
    return { ...t, ...patch };
  });
  const [updated] = await Promise.all([
    s.updateProject(p.id, { people: people.filter((x) => x.id !== cur.id), settings: { ...(p.settings ?? {}), peopleSeeded: true } as Project['settings'] }),
    ...writes,
    log(p, null, ctx.actor, 'person_removed', { personId: cur.id, name: cur.name, side: cur.side, unassigned }),
  ]);
  if (!updated) throw new CpError(404, 'Project not found.');
  return { project: updated as Project, tasks: after };
}

const isLabelColor = (v: unknown): v is LabelColor => (LABEL_COLORS as readonly unknown[]).includes(v);

/** Replace the project's label list: [{ id?, name, color }]. Ids that disappear are taken off every card. */
export async function setLabels(p: Project, rawList: unknown, ctx: Ctx): Promise<ProjectAndTasks> {
  if (!Array.isArray(rawList)) throw new CpError(400, 'Send the labels as a list.');
  if (rawList.length > CP_LIMITS.labels) throw new CpError(400, `A project holds at most ${CP_LIMITS.labels} labels.`);
  const have = new Map((p.labels ?? []).map((l) => [l.id, l]));
  const next: Label[] = [];
  for (const x of rawList) {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const name = line(r.name, CP_LIMITS.labelName);
    if (!name) throw new CpError(400, 'Every label needs a name.');
    if (!isLabelColor(r.color)) throw new CpError(400, 'Pick one of the label colours.');
    if (next.some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new CpError(400, `There are two labels called “${name}”.`);
    const id = typeof r.id === 'string' && have.has(r.id) && !next.some((l) => l.id === r.id) ? r.id : newId();
    next.push({ id, name, color: r.color });
  }
  const s = store();
  const keep = new Set(next.map((l) => l.id));
  const tasks = await s.listTasks(p.id);
  const writes: Promise<unknown>[] = [];
  const after = tasks.map((t) => {
    const ids = (t.labelIds ?? []).filter((id) => keep.has(id));
    if (ids.length === (t.labelIds ?? []).length) return t;
    writes.push(s.updateTask(t.id, { labelIds: ids }));
    return { ...t, labelIds: ids };
  });
  const [updated] = await Promise.all([s.updateProject(p.id, { labels: next }), ...writes, log(p, null, ctx.actor, 'project_updated', { changed: ['labels'], labels: next.length })]);
  if (!updated) throw new CpError(404, 'Project not found.');
  return { project: updated as Project, tasks: after };
}

/**
 * Delete a project for good (owner, any status). The owner must type the client name. A content-free
 * tombstone (key, client name, who, when, card count) is written FIRST; only then is the project row
 * removed, which removes its cards, comments, events, documents, attachments, AI runs and people (and
 * with the row, the share link's token: the board link is a 404 at once).
 */
export async function deleteProjectForever(p: Project, confirmName: unknown, ctx: Ctx) {
  const typed = typeof confirmName === 'string' ? confirmName.trim() : '';
  if (typed !== p.clientName.trim()) throw new CpError(409, `Type the client name (${p.clientName}) to delete this project for good.`, { code: 'confirm_name' });
  const s = store();
  const counts = await s.countAll(p.id);
  // No tombstone, no delete.
  await s.addDeletion({ projectId: p.id, key: p.key, clientName: p.clientName, deletedBy: ctx.actor.replace(/^owner:/, ''), cardCount: counts.cards });
  if (!(await s.deleteProject(p.id))) throw new CpError(404, 'Project not found.');
  return { ...counts, people: (p.people ?? []).length };
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
  let archivedLinkOff = false;
  if ('status' in raw) {
    if (!(PROJECT_STATUSES as readonly unknown[]).includes(raw.status)) throw new CpError(400, 'Unknown project status.');
    patch.status = raw.status as ProjectStatus;
    // Archiving turns the share link off for good (the token is thrown away). Restoring does not turn it
    // back on: the owner shares again, with a new link.
    if (patch.status === 'archived' && (p.shareEnabled || p.tokenHash)) {
      patch.tokenHash = null;
      patch.tokenSealed = null;
      patch.shareEnabled = false;
      archivedLinkOff = true;
    }
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
  if ('wip' in raw) {
    const w = raw.wip && typeof raw.wip === 'object' ? (raw.wip as Record<string, unknown>) : {};
    const wip: Record<string, number> = {};
    for (const st of TASK_STATUSES) {
      const v = w[st];
      if (v === undefined || v === null || v === 0) continue;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > CP_LIMITS.wipMax) throw new CpError(400, `A column limit is a whole number from 0 to ${CP_LIMITS.wipMax} (0 = no limit).`);
      wip[st] = v;
    }
    // An explicit object, even empty, replaces the defaults (empty = no limits).
    patch.settings = { ...(p.settings ?? {}), wip } as Project['settings'];
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
  for (const k of Object.keys(patch)) if (!['kickoffDate', 'clientUpdate', 'clientUpdateAt', 'tokenHash', 'tokenSealed', 'shareEnabled'].includes(k)) changed.push(k);
  const updated = await s.updateProject(p.id, patch);
  if (!updated) throw new CpError(404, 'Project not found.');
  if ('publishClientUpdate' in raw) await log(p, null, ctx.actor, 'client_update_published', { length: (patch.clientUpdate ?? '').length, cleared: !patch.clientUpdate });
  if (changed.length) await log(p, null, ctx.actor, 'project_updated', { changed });
  if (archivedLinkOff) await log(p, null, ctx.actor, 'share_disabled', { because: 'archived' });
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

const isPriority = (v: unknown): v is Priority => (PRIORITIES as readonly unknown[]).includes(v);

/** Validators for the v2 card fields (owner input). Each returns the clean value or throws a 400. */
function cleanIdList(v: unknown, allowed: Set<string>, max: number, what: string): string[] {
  if (!Array.isArray(v)) throw new CpError(400, `Send the ${what} as a list.`);
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !allowed.has(x)) throw new CpError(400, `Pick ${what} from this project.`);
    if (!out.includes(x)) out.push(x);
  }
  if (out.length > max) throw new CpError(400, `At most ${max} ${what} per card.`);
  return out;
}

function cleanChecklist(v: unknown, prev: ChecklistItem[]): ChecklistItem[] {
  if (!Array.isArray(v)) throw new CpError(400, 'Send the checklist as a list.');
  if (v.length > CP_LIMITS.checklistItems) throw new CpError(400, `A checklist holds at most ${CP_LIMITS.checklistItems} items.`);
  const known = new Set(prev.map((i) => i.id));
  const used = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const x of v) {
    const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const t = line(r.text, CP_LIMITS.checklistText);
    if (!t) continue;
    // Ids are ours: an unknown or repeated id from the browser gets a fresh one.
    const id = typeof r.id === 'string' && known.has(r.id) && !used.has(r.id) ? r.id : newId();
    used.add(id);
    out.push({ id, text: t, done: r.done === true });
  }
  return out;
}

function cleanEstimate(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > CP_LIMITS.estimateMax) throw new CpError(400, `The estimate is hours, from 0 to ${CP_LIMITS.estimateMax}.`);
  return Math.round(v * 100) / 100;
}

/** Would making `t` wait on `ids` create a loop (A waits on B waits on A)? */
function wouldLoop(t: Task, ids: string[], all: Task[]): boolean {
  const byId = new Map(all.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === t.id) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.blockers ?? []));
  }
  return false;
}

/**
 * The Done rule for the owner (kanban move, drawer, bulk): every card it waits on must be Done. It is a
 * warning the owner may override; the override is written on the status event. Client ticks and the
 * client-gated rules are separate and unchanged (clientTick / clientClaim).
 */
async function assertBlockersDone(p: Project, t: Task, override: boolean, all?: Task[]): Promise<string[]> {
  if (!(t.blockers ?? []).length) return [];
  const open = openBlockers(t, all ?? (await store().listTasks(p.id)));
  if (!open.length) return [];
  const keys = open.map((b) => taskKey(p, b));
  if (!override) throw new CpError(409, `${taskKey(p, t)} is waiting on ${keys.join(', ')}, which ${keys.length === 1 ? 'is' : 'are'} not done. Finish ${keys.length === 1 ? 'it' : 'them'} first, or confirm to mark it Done anyway.`, { code: 'blockers_open', blockers: keys });
  return keys;
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
  const assignee = 'assigneeId' in raw && raw.assigneeId !== null && raw.assigneeId !== '' ? personOf(p, raw.assigneeId) : null;
  if ('assigneeId' in raw && raw.assigneeId !== null && raw.assigneeId !== '' && !assignee) throw new CpError(400, 'Pick an assignee from this project’s people.');
  if (assignee && !isDefect && over.ownerSide !== assignee.side) {
    // The card's side follows its assignee.
    over.ownerSide = assignee.side;
    over.type = typeFor(assignee.side, over.type === 'milestone');
  }
  const v2: Partial<Task> = {
    assigneeId: assignee?.id ?? null,
    priority: isPriority(raw.priority) ? raw.priority : null,
    startDate: isDate(raw.startDate) ? raw.startDate : null,
    estimateHours: 'estimateHours' in raw ? cleanEstimate(raw.estimateHours) : null,
    labelIds: 'labelIds' in raw ? cleanIdList(raw.labelIds, new Set((p.labels ?? []).map((l) => l.id)), CP_LIMITS.labelsPerTask, 'labels') : [],
    checklist: 'checklist' in raw ? cleanChecklist(raw.checklist, []) : [],
  };
  const num = await nextNum(p);
  const t = blankTask(p, num, {
    ...v2,
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
  if (t.ownerSide !== 'client' || t.type !== 'client_item') t.clientMayTick = false;
  await s.insertTasks([t]);
  await log(p, t.id, ctx.actor, 'task_created', { key: taskKey(p, t), type: t.type, title: t.title, ...(t.severity ? { severity: t.severity, fixDue: t.dueDate } : {}) });
  if (assignee) await onAssigned(p, t, null, assignee, ctx);
  return t;
}

/** The fields that change with a status (done stamps; leaving Done clears them, and any client claim). */
function statusPatch(t: Task, status: TaskStatus, ctx: Ctx): Partial<Task> {
  const patch: Partial<Task> = { status };
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
  return patch;
}

const statusEventType = (ctx: Ctx, status: TaskStatus): CpEventType => (ctx.actor.startsWith('client:') ? (status === 'done' ? 'client_tick' : 'client_untick') : 'status_changed');

/** What follows a card reaching Done: the late-finish record and the automations. */
const afterDone = (p: Project, updated: Task, ctx: Ctx) =>
  later(ctx, 'on-done', async () => {
    await recordLateFinish(p, updated);
    await onTaskDone(p, updated, ctx);
  });

/** The one place a card's status changes, for the owner, the client and automations alike. One write, with its event. */
export async function setStatus(p: Project, t: Task, status: TaskStatus, ctx: Ctx, extra: Partial<Task> = {}, detail: Record<string, unknown> = {}): Promise<Task> {
  const changed = status !== t.status;
  const [updated] = await Promise.all([
    store().updateTask(t.id, { ...extra, ...statusPatch(t, status, ctx) }),
    changed ? log(p, t.id, ctx.actor, statusEventType(ctx, status), { key: taskKey(p, t), from: t.status, to: status, title: t.title, ...detail }) : null,
  ]);
  if (!updated) throw new CpError(404, 'Card not found.');
  if (changed && status === 'done') await afterDone(p, updated, ctx);
  return updated;
}

/** Owner: edit a card. Only the fields sent are changed. */
export async function patchTask(p: Project, t: Task, raw: Record<string, unknown>, ctx: Ctx, all?: Task[]): Promise<Task> {
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
  // Dependencies: `blockers` (v2, many) or `blockedBy` (v1, one). Both must be other cards of this project.
  if ('blockers' in raw || 'blockedBy' in raw) {
    const want = 'blockers' in raw ? raw.blockers : raw.blockedBy === null || raw.blockedBy === '' ? [] : [raw.blockedBy];
    if (!Array.isArray(want)) throw new CpError(400, 'Send the cards to wait on as a list.');
    if (want.length > CP_LIMITS.blockers) throw new CpError(400, `A card can wait on at most ${CP_LIMITS.blockers} cards.`);
    const cards = want.length ? (all ?? (await store().listTasks(p.id))) : [];
    const ids: string[] = [];
    for (const id of want) {
      const other = isCpId(id) && id !== t.id ? cards.find((x) => x.id === id) : null;
      if (!other) throw new CpError(400, 'Pick a card from this project to wait on.');
      if (!ids.includes(other.id)) ids.push(other.id);
    }
    if (ids.length && wouldLoop(t, ids, cards)) throw new CpError(400, 'Those cards already wait on this one: that would be a loop.');
    patch.blockers = ids;
    patch.blockedBy = ids[0] ?? null;
  }
  if ('priority' in raw) {
    if (raw.priority !== null && raw.priority !== '' && !isPriority(raw.priority)) throw new CpError(400, 'Priority must be Low, Medium, High or Urgent.');
    patch.priority = isPriority(raw.priority) ? raw.priority : null;
  }
  if ('startDate' in raw) {
    if (raw.startDate !== null && raw.startDate !== '' && !isDate(raw.startDate)) throw new CpError(400, 'Enter a valid start date.');
    patch.startDate = isDate(raw.startDate) ? raw.startDate : null;
  }
  if ('estimateHours' in raw) patch.estimateHours = cleanEstimate(raw.estimateHours);
  if ('labelIds' in raw) patch.labelIds = cleanIdList(raw.labelIds, new Set((p.labels ?? []).map((l) => l.id)), CP_LIMITS.labelsPerTask, 'labels');
  if ('watchers' in raw) patch.watchers = cleanIdList(raw.watchers, new Set((p.people ?? []).map((x) => x.id)), CP_LIMITS.watchers, 'watchers');
  if ('checklist' in raw) patch.checklist = cleanChecklist(raw.checklist, t.checklist ?? []);
  let newAssignee: Person | null | undefined;
  if ('assigneeId' in raw) {
    if (raw.assigneeId === null || raw.assigneeId === '') newAssignee = null;
    else {
      newAssignee = personOf(p, raw.assigneeId);
      if (!newAssignee) throw new CpError(400, 'Pick an assignee from this project’s people.');
    }
    patch.assigneeId = newAssignee?.id ?? null;
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
    // The card's side follows its assignee. Without a new assignee, an explicit side wins, and an
    // assignee from the other side is then taken off the card.
    const side = newAssignee ? newAssignee.side : 'ownerSide' in raw ? raw.ownerSide : t.ownerSide;
    if (side !== 'us' && side !== 'client') throw new CpError(400, 'The owner must be Us or Client.');
    if (newAssignee === undefined && 'ownerSide' in raw && t.assigneeId && personOf(p, t.assigneeId) && personOf(p, t.assigneeId)?.side !== side) patch.assigneeId = null;
    const gate = 'isGate' in raw ? raw.isGate === true : 'type' in raw ? raw.type === 'milestone' : t.type === 'milestone';
    if ('ownerSide' in raw || 'isGate' in raw || 'type' in raw || (newAssignee && side !== t.ownerSide)) {
      patch.ownerSide = side;
      patch.type = typeFor(side, gate);
      if (!gate || side !== 'us') patch.autoComplete = false;
      // Only an ordinary client item can ever be client-tickable.
      if (gate || side !== 'client') patch.clientMayTick = false;
    }
  }
  if ('status' in raw && !isStatus(raw.status)) throw new CpError(400, 'Unknown status.');
  const toStatus = isStatus(raw.status) && raw.status !== t.status ? raw.status : null;
  // Checked BEFORE anything is written, so a refused Done changes nothing.
  let overridden: string[] = [];
  if (toStatus === 'done') overridden = await assertBlockersDone(p, { ...t, ...('blockers' in patch ? { blockers: patch.blockers as string[] } : {}) }, raw.override === true, all);
  const keys = Object.keys(patch);
  if (!keys.length && !toStatus) return t;
  const assignChanged = 'assigneeId' in patch && (patch.assigneeId ?? null) !== (t.assigneeId ?? null);
  const to = assignChanged ? personOf(p, patch.assigneeId) : null;
  // ONE write for the fields and the status, and its events beside it (one round trip).
  const full: Partial<Task> = toStatus ? { ...patch, ...statusPatch(t, toStatus, ctx) } : patch;
  const events: Promise<unknown>[] = [];
  if (patch.severity) events.push(log(p, t.id, ctx.actor, 'severity_changed', { key: taskKey(p, t), from: t.severity, to: patch.severity, fixDue: full.dueDate ?? t.dueDate }));
  const other = keys.filter((k) => k !== 'severity');
  if (other.length) events.push(log(p, t.id, ctx.actor, 'task_updated', { key: taskKey(p, t), changed: other, ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}) }));
  if (assignChanged) events.push(assignedEvent(p, t, personOf(p, t.assigneeId), to, ctx));
  if (toStatus) events.push(log(p, t.id, ctx.actor, statusEventType(ctx, toStatus), { key: taskKey(p, t), from: t.status, to: toStatus, title: t.title, ...(overridden.length ? { override: true, openBlockers: overridden } : {}) }));
  const [updated] = await Promise.all([store().updateTask(t.id, full), ...events]);
  if (!updated) throw new CpError(404, 'Card not found.');
  if (to) await later(ctx, 'assign-notify', () => notifyAssignee(p, updated as Task, to, ctx));
  if (toStatus === 'done') await afterDone(p, updated as Task, ctx);
  return updated as Task;
}

// ------------------------------------------------------------------ assignment (event + optional email)

const assignedEvent = (p: Project, t: Task, from: Person | null, to: Person | null, ctx: Ctx) =>
  log(p, t.id, ctx.actor, 'assigned', { key: taskKey(p, t), title: t.title, from: from?.name ?? null, to: to?.name ?? null, toId: to?.id ?? null, toSide: to?.side ?? null });

/** Every (re)assignment writes an `assigned` event; the email is the `assign_notify` rule, claimed first. */
async function onAssigned(p: Project, t: Task, from: Person | null, to: Person | null, ctx: Ctx): Promise<void> {
  await assignedEvent(p, t, from, to, ctx);
  if (to) await later(ctx, 'assign-notify', () => notifyAssignee(p, t, to, ctx));
}

async function notifyAssignee(p: Project, t: Task, person: Person, ctx: Ctx): Promise<void> {
  if (!ruleOn(p, 'assign_notify')) return;
  // Nobody is emailed about a card they assigned to themselves.
  if (person.email && ctx.actor === `owner:${person.email}`) return;
  // CLAIM FIRST: at most one email per card per person per day, however often the card is passed around.
  const ev = await claim(p, 'assign_notify', t.id, { key: taskKey(p, t), to: person.name, toId: person.id, side: person.side }, `assign|${t.id}|${person.id}|${today()}`);
  if (!ev) return;
  const due = t.dueDate ? ` It is due ${fmtDateLong(t.dueDate)}.` : '';
  let out: MailOutcome;
  if (!person.email) out = { emailed: false, note: 'email not sent: no address' };
  else if (person.side === 'client') {
    // A person on the client side only ever hears about a card they can see, and only gets the board link.
    const url = liveBoardUrl(p, ctx.origin);
    if (!t.clientVisible) out = { emailed: false, note: 'email not sent: the card is hidden from the client board' };
    else if (!url) out = { emailed: false, note: 'email not sent: the board is not shared' };
    else out = await sendMail(p, 'cp-person', person.email, `${p.clientName} onboarding: “${t.title}” is assigned to you`, [`Hello ${person.name},`, `“${t.title}” (${taskKey(p, t)}) is assigned to you on the onboarding board.${due}`, 'Open the board to see the details and to tell us when it is done.'], { label: 'Open your project board', url }, 'assign', person.name);
  } else {
    out = await sendMail(p, 'cp-person', person.email, `${p.clientName}: ${taskKey(p, t)} is assigned to you`, [`“${t.title}” (${taskKey(p, t)}) is assigned to you.${due}`], { label: 'Open the project', url: consoleUrl(p.id, ctx.origin) }, 'assign', person.name);
  }
  await settle(ev, out);
}

// ------------------------------------------------------------------ kanban and roadmap moves

const SORT_GAP = 1024;
const columnOrder = (a: Task, b: Task) => a.sort - b.sort || a.num - b.num;

/**
 * Where a card lands in its kanban column: before `beforeId`, or at the end when that is null. Returns the
 * new sort for the card, plus re-spaced sorts for the column when no whole number fits between its
 * neighbours (only the cards whose sort changes).
 */
function placeInColumn(column: Task[], card: Task, beforeId: string | null): { sort: number; respace: { id: string; sort: number }[] } {
  const list = column.filter((x) => x.id !== card.id).sort(columnOrder);
  const idx = beforeId === null ? list.length : list.findIndex((x) => x.id === beforeId);
  if (idx < 0) throw new CpError(400, 'That card is not in the column any more. Reload and try again.');
  const prev = list[idx - 1];
  const next = list[idx];
  if (!prev && !next) return { sort: card.sort, respace: [] };
  if (!prev) return { sort: next.sort - SORT_GAP, respace: [] };
  if (!next) return { sort: prev.sort + SORT_GAP, respace: [] };
  if (next.sort - prev.sort >= 2) return { sort: prev.sort + Math.floor((next.sort - prev.sort) / 2), respace: [] };
  // No room: re-space the whole column around the card (keeps every other card's relative order).
  const order = [...list.slice(0, idx), card, ...list.slice(idx)];
  const base = Math.min(...order.map((x) => x.sort), 0);
  const respace: { id: string; sort: number }[] = [];
  let mine = card.sort;
  order.forEach((x, i) => {
    const v = base + (i + 1) * SORT_GAP;
    if (x.id === card.id) mine = v;
    else if (x.sort !== v) respace.push({ id: x.id, sort: v });
  });
  return { sort: mine, respace };
}

export interface MoveResult {
  task: Task;
  /** A phase move keeps the due date; this is the date the owner may confirm instead. */
  suggestRedate: { dueDate: string; dueOffsetBd: number } | null;
}

/**
 * Owner drag and drop (and the keyboard "Move to" menu), one call per drop:
 *   { status?, beforeId? }   kanban: change column and/or reorder inside it (beforeId null = the end)
 *   { phase, redate? }       roadmap: change phase; the due date is kept unless redate is true
 *   { override? }            mark Done although a card it waits on is open (recorded on the event)
 * Every move writes an event with from, to and who.
 */
export async function moveTask(p: Project, t: Task, raw: Record<string, unknown>, ctx: Ctx, all?: Task[]): Promise<MoveResult> {
  const s = store();
  const toStatus = 'status' in raw ? raw.status : t.status;
  if (!isStatus(toStatus)) throw new CpError(400, 'Unknown status.');
  const toPhase = 'phase' in raw ? raw.phase : t.phase;
  if (!isPhase(toPhase)) throw new CpError(400, 'Unknown phase.');
  if (toPhase !== t.phase && t.type === 'defect') throw new CpError(400, 'Defects are not on the roadmap: they stay with UAT.');
  const reorder = 'beforeId' in raw;
  if (reorder && raw.beforeId !== null && !isCpId(raw.beforeId)) throw new CpError(400, 'That card is not in the column any more. Reload and try again.');
  if (!reorder && toStatus === t.status && toPhase === t.phase && raw.redate !== true) return { task: t, suggestRedate: null };
  const statusChange = toStatus !== t.status;
  const tasks = all ?? (reorder || (toStatus === 'done' && (t.blockers ?? []).length) ? await s.listTasks(p.id) : []);

  let overridden: string[] = [];
  if (toStatus === 'done' && statusChange) overridden = await assertBlockersDone(p, t, raw.override === true, tasks);

  const patch: Partial<Task> = {};
  const writes: Promise<unknown>[] = [];
  const events: Promise<unknown>[] = [];
  if (reorder) {
    const placed = placeInColumn(tasks.filter((x) => x.status === toStatus), t, raw.beforeId as string | null);
    for (const r of placed.respace) writes.push(s.updateTask(r.id, { sort: r.sort }));
    if (placed.sort !== t.sort) patch.sort = placed.sort;
  }
  if (statusChange) {
    Object.assign(patch, statusPatch(t, toStatus, ctx));
    events.push(log(p, t.id, ctx.actor, 'status_changed', { key: taskKey(p, t), from: t.status, to: toStatus, title: t.title, via: 'board', ...(overridden.length ? { override: true, openBlockers: overridden } : {}) }));
  } else if (reorder && 'sort' in patch) {
    events.push(log(p, t.id, ctx.actor, 'task_moved', { key: taskKey(p, t), kind: 'reorder', column: toStatus, title: t.title }));
  }
  let suggestRedate: MoveResult['suggestRedate'] = null;
  const offset = PHASE_END_OFFSET[toPhase];
  const date = addBusinessDays(p.kickoffDate, offset);
  const stillOpen = (statusChange ? toStatus : t.status) !== 'done';
  if (toPhase !== t.phase) {
    const redate = raw.redate === true && stillOpen;
    Object.assign(patch, { phase: toPhase }, redate ? { dueOffsetBd: offset, dueDate: date } : {});
    events.push(log(p, t.id, ctx.actor, 'task_moved', { key: taskKey(p, t), kind: 'phase', from: t.phase, to: toPhase, title: t.title, redated: redate, ...(redate ? { dueDate: date } : {}) }));
    if (!redate && stillOpen && t.dueDate !== date) suggestRedate = { dueDate: date, dueOffsetBd: offset };
  } else if (raw.redate === true && stillOpen && t.type !== 'defect' && t.dueDate !== date) {
    // The owner confirmed the re-date after a phase move (a second call).
    Object.assign(patch, { dueOffsetBd: offset, dueDate: date });
    events.push(log(p, t.id, ctx.actor, 'task_updated', { key: taskKey(p, t), changed: ['dueDate'], dueDate: date, because: `moved to ${PHASE_LABEL[toPhase]}` }));
  }
  // One round trip: the card, any re-spaced neighbours and the events, together.
  const [updated] = await Promise.all([Object.keys(patch).length ? s.updateTask(t.id, patch) : Promise.resolve(t), ...writes, ...events]);
  if (!updated) throw new CpError(404, 'Card not found.');
  if (statusChange && toStatus === 'done') await afterDone(p, updated as Task, ctx);
  return { task: updated as Task, suggestRedate };
}

/**
 * List view bulk actions: set status, assignee or priority, add or remove a label, on up to 100 cards.
 * Each card goes through patchTask, so every rule (the Done rule, sides, validation) applies per card;
 * cards that cannot take the change are skipped and reported, the rest are changed.
 */
export async function bulkUpdate(p: Project, raw: Record<string, unknown>, ctx: Ctx): Promise<{ updated: string[]; skipped: { key: string; reason: string }[] }> {
  if (!Array.isArray(raw.ids) || !raw.ids.length) throw new CpError(400, 'Select at least one card.');
  if (raw.ids.length > CP_LIMITS.bulkIds) throw new CpError(400, `Select at most ${CP_LIMITS.bulkIds} cards at a time.`);
  const all = await store().listTasks(p.id);
  const picked: Task[] = [];
  for (const id of raw.ids) {
    const t = isCpId(id) ? all.find((x) => x.id === id) : undefined;
    // An id from another project is refused outright, like everywhere else.
    if (!t) throw new CpError(404, 'Card not found.');
    if (!picked.includes(t)) picked.push(t);
  }
  const base: Record<string, unknown> = {};
  if ('status' in raw) {
    if (!isStatus(raw.status)) throw new CpError(400, 'Unknown status.');
    base.status = raw.status;
  }
  if ('assigneeId' in raw) {
    if (raw.assigneeId !== null && !personOf(p, raw.assigneeId)) throw new CpError(400, 'Pick an assignee from this project’s people.');
    base.assigneeId = raw.assigneeId;
  }
  if ('priority' in raw) {
    if (raw.priority !== null && !isPriority(raw.priority)) throw new CpError(400, 'Priority must be Low, Medium, High or Urgent.');
    base.priority = raw.priority;
  }
  const labels = new Set((p.labels ?? []).map((l) => l.id));
  for (const k of ['addLabelId', 'removeLabelId'] as const) if (k in raw && (typeof raw[k] !== 'string' || !labels.has(raw[k] as string))) throw new CpError(400, 'Pick a label from this project.');
  if (!Object.keys(base).length && !('addLabelId' in raw) && !('removeLabelId' in raw)) throw new CpError(400, 'Choose what to change.');
  const updated: string[] = [];
  const skipped: { key: string; reason: string }[] = [];
  const jobs: Promise<void>[] = [];
  for (const t of picked) {
    const body: Record<string, unknown> = { ...base };
    if ('addLabelId' in raw || 'removeLabelId' in raw) {
      let ids = [...(t.labelIds ?? [])].filter((id) => labels.has(id));
      if (raw.removeLabelId) ids = ids.filter((id) => id !== raw.removeLabelId);
      if (raw.addLabelId && !ids.includes(raw.addLabelId as string)) ids.push(raw.addLabelId as string);
      body.labelIds = ids;
    }
    // A defect keeps our side: assigning it to a client person is skipped, not forced.
    if (t.type === 'defect' && body.assigneeId && personOf(p, body.assigneeId)?.side === 'client') {
      skipped.push({ key: taskKey(p, t), reason: 'A defect is fixed by us: it cannot be assigned to a client person.' });
      continue;
    }
    jobs.push(
      patchTask(p, t, body, ctx, all).then(
        () => void updated.push(taskKey(p, t)),
        (err) => {
          if (!(err instanceof CpError)) throw err;
          skipped.push({ key: taskKey(p, t), reason: err.message });
        },
      ),
    );
  }
  // Every card in parallel (one round trip), against the same snapshot of the board.
  await Promise.all(jobs);
  await later(ctx, 'bulk-summary', async () => void (await log(p, null, ctx.actor, 'bulk_update', { cards: updated.length, skipped: skipped.length, changed: [...Object.keys(base), ...('addLabelId' in raw ? ['label added'] : []), ...('removeLabelId' in raw ? ['label removed'] : [])] })));
  return { updated, skipped };
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
  // A comment can only be visible to the client on a card the client can see (CPV2-M1).
  const visible = clientVisible === true && t.clientVisible === true;
  const c = await store().addComment({ projectId: p.id, taskId: t.id, author: ctx.actor, body: clean, clientVisible: visible });
  await log(p, t.id, ctx.actor, 'comment', { key: taskKey(p, t), clientVisible: visible, length: clean.length });
  await safely('mentions', () => recordMentions(p, t, clean, visible, ctx));
  return c;
}

// ------------------------------------------------------------------ @mentions

/**
 * "@Name" in a comment that matches a project person: one `mention` event (it feeds the owner's inbox),
 * then the batched email rule. The comment text is plain data here: it is matched against the people
 * list and nothing else. A client on the shared board can only mention people a client may see: the
 * client-side people, and our side as a whole ("@Appointmentlyy" is not a person, so it matches nobody).
 */
async function recordMentions(p: Project, t: Task, body: string, clientVisible: boolean, ctx: Ctx): Promise<void> {
  const fromClient = ctx.actor.startsWith('client:');
  const pool = (p.people ?? []).filter((x) => !fromClient || x.side === 'client');
  const author = fromClient ? ctx.actor.slice(7).toLowerCase() : ctx.actor.slice(6).toLowerCase();
  const hit = mentionedPeople(body, pool)
    .filter((x) => (fromClient ? x.name.toLowerCase() !== author : x.email !== author))
    .slice(0, CP_LIMITS.mentionsPerComment);
  if (!hit.length) return;
  // Client-authored text is never stored for emailing (CPV2-L3): the email says who mentioned whom, on which
  // card, and links to the board. Our own people's excerpts are kept, without links.
  await log(p, t.id, ctx.actor, 'mention', { key: taskKey(p, t), title: t.title, clientVisible, fromClient, people: hit.map((x) => ({ id: x.id, name: x.name, side: x.side })), excerpt: fromClient ? '' : noLinks(body).slice(0, 240) });
  await notifyMentions(p, ctx);
}

/**
 * Rule `mention_notify`, batched and claimed first: at most one email per person per 15 minutes, carrying
 * every mention of them since their last email. A person on the client side is only told about comments
 * that are visible to the client, and only gets the board link. Runs on a mention and on every sweep.
 */
async function notifyMentions(p: Project, ctx: Ctx): Promise<void> {
  if (!ruleOn(p, 'mention_notify')) return;
  const s = store();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const mentions = await s.findEvents(p.id, { type: 'mention', since, limit: 200 });
  if (!mentions.length) return;
  const sent = (await s.findEvents(p.id, { type: 'automation', rule: 'mention_notify', since, limit: 200 })).filter((e) => e.detail.emailed === true);
  // The batching window: 15 minutes. A local test server may shorten it (CP_TEST_MENTION_WINDOW_MS) so the
  // regression suite can test a card hidden inside the window; ignored anywhere else.
  const testWindow = isLocalTestServer() ? Number(process.env.CP_TEST_MENTION_WINDOW_MS || 0) : 0;
  const quarter = Math.floor(Date.now() / (Number.isInteger(testWindow) && testWindow > 0 ? testWindow : 15 * 60_000));
  // CPV2-M1: what a client person may hear about is decided NOW, at send time (a card hidden after the comment,
  // inside the 15-minute window, is dropped): only client-visible comments on cards that are client-visible now.
  let visibleNow: Set<string> | null = null;
  const cardVisible = async (taskId: string | null) => {
    visibleNow ??= new Set((await s.listTasks(p.id)).filter((t) => t.clientVisible === true).map((t) => t.id));
    return Boolean(taskId && visibleNow.has(taskId));
  };
  for (const person of p.people ?? []) {
    if (!person.email) continue;
    const last = sent.find((e) => e.detail.personId === person.id)?.at ?? '';
    let mine = mentions.filter((e) => e.at > last && Array.isArray(e.detail.people) && (e.detail.people as { id?: string }[]).some((x) => x.id === person.id) && (person.side !== 'client' || e.detail.clientVisible === true));
    if (person.side === 'client') {
      const keep: CpEvent[] = [];
      for (const e of mine) if (await cardVisible(e.taskId)) keep.push(e);
      mine = keep;
    }
    if (!mine.length) continue;
    // CPV2-L4: at most 10 mention emails a day to one person that were triggered from the shared board.
    const fromBoard = mine.every((e) => e.actor.startsWith('client:'));
    if (fromBoard && sent.filter((e) => e.detail.personId === person.id && e.detail.fromBoard === true).length >= 10) continue;
    const ev = await claim(p, 'mention_notify', null, { personId: person.id, to: person.name, side: person.side, count: mine.length, fromBoard }, `mention|${person.id}|${quarter}`);
    if (!ev) continue;
    const url = person.side === 'client' ? liveBoardUrl(p, ctx.origin) : consoleUrl(p.id, ctx.origin);
    const who = (actor: string) => (actor.startsWith('client:') ? actor.slice(7) : person.side === 'client' ? 'Appointmentlyy' : actor.slice(6));
    const out: MailOutcome = !url
      ? { emailed: false, note: 'email not sent: the board is not shared' }
      : await sendMail(
          p,
          'cp-person',
          person.email,
          `${p.clientName}: you were mentioned on ${mine.length} card${mine.length === 1 ? '' : 's'}`,
          [
            `Hello ${person.name},`,
            ...mine.slice(0, 5).map((e) => {
              const where = `${String(e.detail.key ?? 'a card')} “${String(e.detail.title ?? '')}”`;
              // No free text from a client author, ever (CPV2-L3); ours without links.
              const said = e.actor.startsWith('client:') || !e.detail.excerpt ? '' : `: ${noLinks(String(e.detail.excerpt)).slice(0, 240)}`;
              return `${who(e.actor)}${e.actor.startsWith('client:') ? ' (self-identified on the shared board)' : ''} mentioned you on ${where}${said}`;
            }),
            ...(mine.length > 5 ? [`and ${mine.length - 5} more.`] : []),
            ...(mine.some((e) => e.actor.startsWith('client:')) ? ['Open the board to read the comment.'] : []),
          ],
          { label: person.side === 'client' ? 'Open your project board' : 'Open the project', url },
          'mention',
          person.name,
        );
    await settle(ev, out);
  }
}

// ------------------------------------------------------------------ card attachments (owner uploads)

/**
 * Owner: attach a PDF, PNG or JPG to a card. The type comes from the file's own first bytes (the upload's
 * name and Content-Type are not trusted), the size is capped by the caller, and a new file is NEVER
 * client-visible: the owner turns that on per file.
 */
export async function addAttachment(p: Project, t: Task, nameRaw: unknown, bytes: Uint8Array, ctx: Ctx): Promise<CpFileMeta> {
  if (!bytes.length || bytes.length > CP_LIMITS.fileBytes) throw new CpError(413, `The file is larger than ${Math.floor(CP_LIMITS.fileBytes / 1024 / 1024)} MB.`);
  const kind = detectAttachment(bytes);
  if (!kind) throw new CpError(400, 'Attach a PDF, PNG or JPG file.');
  const s = store();
  const all = await s.listFiles(p.id, 'attachment');
  const mine = all.filter((f) => f.taskId === t.id);
  if (mine.length >= CP_LIMITS.attachmentsPerTask) throw new CpError(409, `A card holds at most ${CP_LIMITS.attachmentsPerTask} attachments. Remove one first.`);
  if (all.length >= CP_LIMITS.attachmentsPerProject) throw new CpError(409, `A project holds at most ${CP_LIMITS.attachmentsPerProject} attachments. Remove one first.`);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (mine.some((f) => f.sha256 === sha)) throw new CpError(409, 'This file is already attached to the card.');
  // CPV2-L5: a PDF must actually parse (at least one page), like the planner documents.
  const pages = kind.mime === 'application/pdf' ? ((await pdfPageCount(bytes)) ?? 0) : 0;
  if (kind.mime === 'application/pdf' && pages < 1) throw new CpError(400, 'This file could not be read as a PDF.');
  const name = attachmentName(nameRaw, kind.ext);
  const [file] = await Promise.all([
    s.putFile({ projectId: p.id, name, pages, source: 'attachment', taskId: t.id, clientVisible: false, mime: kind.mime }, bytes),
    log(p, t.id, ctx.actor, 'attachment_added', { key: taskKey(p, t), name, size: bytes.length, mime: kind.mime, sha256: sha }),
  ]);
  return file;
}

/** The attachment `fileId` of card `t`, or a 404 (an id from another card or project does not exist here). */
export async function attachmentOf(p: Project, t: Task, fileId: unknown): Promise<CpFileMeta> {
  const f = isCpId(fileId) ? await store().getFile(fileId) : null;
  // A client's intake upload is never a card attachment: it cannot be served, published or deleted through these
  // routes (security review M1). Its only route is the owner's intake download, always as an attachment.
  if (!f || f.projectId !== p.id || f.taskId !== t.id || f.source === INTAKE_SOURCE) throw new CpError(404, 'Attachment not found.');
  return f;
}

export async function setAttachmentVisible(p: Project, t: Task, f: CpFileMeta, visible: boolean, ctx: Ctx): Promise<CpFileMeta> {
  if (f.clientVisible === visible) return f;
  // The change and its event in one round trip.
  const [updated] = await Promise.all([store().updateFile(f.id, { clientVisible: visible }), log(p, t.id, ctx.actor, 'attachment_visibility', { key: taskKey(p, t), name: f.name, clientVisible: visible })]);
  if (!updated) throw new CpError(404, 'Attachment not found.');
  return updated;
}

export async function removeAttachment(p: Project, t: Task, f: CpFileMeta, ctx: Ctx): Promise<void> {
  const [gone] = await Promise.all([store().deleteFile(f.id), log(p, t.id, ctx.actor, 'attachment_removed', { key: taskKey(p, t), name: f.name, sha256: f.sha256 })]);
  if (!gone) throw new CpError(404, 'Attachment not found.');
}

/**
 * The client board's download: only a file the owner marked client-visible, on a card that is itself
 * client-visible, in this (shared) project. Anything else does not exist as far as the board is concerned.
 */
export async function publicAttachment(p: Project, fileId: unknown, allow?: (f: CpFileMeta) => boolean): Promise<{ file: CpFileMeta; bytes: Buffer }> {
  const s = store();
  const f = isCpId(fileId) ? await s.getFile(fileId) : null;
  if (!f || f.projectId !== p.id || !f.taskId || f.clientVisible !== true) throw new CpError(404, 'File not found.');
  const t = await s.getTask(f.taskId);
  if (!t || t.projectId !== p.id || t.clientVisible !== true) throw new CpError(404, 'File not found.');
  // The per-file limit counts only downloads the link is entitled to: a hidden or unknown file stays a 404 (it
  // never shows as rate-limited), and the bytes are not read past the limit.
  if (allow && !allow(f)) throw new CpError(429, 'Too many downloads of this file. Wait a few minutes and try again.');
  const bytes = await s.getFileBytes(f.id);
  if (!bytes) throw new CpError(404, 'File not found.');
  return { file: f, bytes };
}

// ------------------------------------------------------------------ the owner's notifications inbox

const INBOX_TYPES: CpEventType[] = ['client_tick', 'client_untick', 'client_claims_done', 'client_defect', 'retest_confirmed', 'comment', 'mention', 'assigned', 'intake'];
/** The Delivery Report's week: Client Intake events since then are listed in it. */
export const weekAgoIso = () => new Date(Date.now() - 7 * 86_400_000).toISOString();

/**
 * The owner's inbox, built from events (nothing extra is stored): what clients did on the shared boards,
 * defects they reported, @mentions of our people, and cards assigned to our people by someone else.
 * Newest first across every open project. `unread` = newer than the project's "seen" marker.
 */
export async function listNotifications(viewerEmail: string, limit = 60): Promise<{ items: CpNotification[]; unread: number }> {
  const s = store();
  const projects = (await s.listProjects()).filter((p) => p.status !== 'archived').slice(0, 60);
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const items: CpNotification[] = [];
  // One round trip for every project's events.
  const perProject = await Promise.all(projects.map((p) => s.findEvents(p.id, { types: INBOX_TYPES, since, limit: 60 })));
  for (const [i, p] of projects.entries()) {
    const events = perProject[i];
    for (const e of events) {
      const fromClient = e.actor.startsWith('client:');
      let kind: CpNotification['kind'] | null = null;
      let textOf = eventText(e);
      if (e.type === 'client_defect') kind = 'defect';
      else if (e.type === 'mention') {
        const ours = (Array.isArray(e.detail.people) ? (e.detail.people as { name?: string; side?: string }[]) : []).filter((x) => x.side === 'us');
        if (ours.length) {
          kind = 'mention';
          textOf = `${String(e.detail.key ?? '')} ${ours.map((x) => `@${x.name}`).join(', ')} mentioned: ${String(e.detail.excerpt ?? '').slice(0, 160)}`;
        }
      } else if (e.type === 'assigned') {
        const to = (p.people ?? []).find((x) => x.id === e.detail.toId);
        // Cards you assigned to yourself are not news.
        if (to && to.side === 'us' && e.actor !== `owner:${to.email}`) kind = 'assignment';
      } else if (fromClient) kind = 'client_action';
      if (!kind) continue;
      items.push({ id: e.id, projectId: p.id, projectKey: p.key, clientName: p.clientName, taskId: e.taskId, kind, text: textOf.slice(0, 300), actor: e.actor, at: e.at, unread: e.actor !== `owner:${viewerEmail}` && e.at > (p.notifSeenAt ?? '') });
    }
  }
  items.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  return { items: items.slice(0, Math.max(1, Math.min(200, limit))), unread: items.filter((i) => i.unread).length };
}

/** Mark the inbox read: one project, or every open one. */
export async function markNotificationsSeen(projectId?: string): Promise<number> {
  const s = store();
  const now = nowIso();
  const ids = projectId ? [projectId] : (await s.listProjects()).filter((p) => p.status !== 'archived').map((p) => p.id);
  const done = await Promise.all(ids.map((id) => s.updateProject(id, { notifSeenAt: now })));
  return done.filter(Boolean).length;
}

// ------------------------------------------------------------------ client actions (shared board)

export function clientCtx(nameRaw: unknown, origin?: string): Ctx {
  const name = personName(nameRaw);
  if (name.length < 2) throw new CpError(400, 'Enter your own name first.');
  return { actor: `client:${name}`, origin };
}

export async function clientTask(p: Project, taskId: unknown): Promise<Task> {
  if (p.status === 'archived') throw new CpError(409, 'This board is closed.');
  const t = isCpId(taskId) ? await store().getTask(taskId) : null;
  // Hidden cards and other projects' cards do not exist as far as the board is concerned.
  if (!t || t.projectId !== p.id || !t.clientVisible) throw new CpError(404, 'Item not found.');
  return t;
}

/** The card's Client Intake request, when intake is on for the project (then the legacy tick and claim give way). */
async function intakeRequestOf(p: Project, t: Task): Promise<boolean> {
  if (!(p.settings?.intake?.enabled === true)) return false;
  try {
    return (await store().listRequests(p.id)).some((r) => r.taskId === t.id);
  } catch {
    // Before the intake migration there are no requests: the legacy behaviour stays.
    return false;
  }
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
  if (await intakeRequestOf(p, t)) throw new CpError(409, 'This item is completed through its form or check on the board, not by ticking it.', { code: 'use_intake' });
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
  if (await intakeRequestOf(p, t)) throw new CpError(409, 'This item is completed through its form, check, signature or payment step on the board.', { code: 'use_intake' });
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
          `“${t.title}” was marked done by ${ctx.actor.startsWith('client:') ? ctx.actor.slice(7) : ctx.actor === 'system' ? 'the platform (Client Intake: the step was verified or completed)' : 'you, on the client’s behalf'}.`,
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
  const [tasks, delays, intake] = await Promise.all([s.listTasks(p.id), s.findEvents(p.id, { type: 'client_delay', limit: 1000 }), s.findEvents(p.id, { type: 'intake', since: weekAgoIso(), limit: 300 })]);
  const draft = await draftStatus(p, tasks, [...delays, ...intake]);
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
  // @mentions that arrived after a person's last batched email.
  await notifyMentions(p, { actor: 'system', origin });
}

// ------------------------------------------------------------------ AI plan: approve / discard

export interface ApproveEdits {
  /** Indexes of suggested people the owner does not want added. */
  removePeople?: unknown;
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
    if ('priority' in e) next.priority = isPriority(e.priority) ? e.priority : null;
    if (next.kind === 'sop' && (next.title !== t.title || next.ownerSide !== t.ownerSide || next.dueOffsetBd !== t.dueOffsetBd)) next.kind = 'changed';
    tasks.push(next);
  });
  const dropPeople = new Set(Array.isArray(edits.removePeople) ? edits.removePeople.filter((n): n is number => Number.isInteger(n)) : []);
  return {
    ...proposal,
    tasks,
    people: (proposal.people ?? []).filter((_, i) => !dropPeople.has(i)),
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
  // v2: the client-side people the planner found (and the owner kept) join the project's people, by name.
  let people = [...(p.people ?? [])];
  let peopleAdded = 0;
  // Our own people are never added as client people: the contract names our signatory too, and the planner cannot
  // tell the sides apart reliably. Matched on our people's names (full, or first + last word), the local part of our
  // emails, and the Agreements owner and sender names.
  const { settings: agr } = await loadSettings().catch(() => ({ settings: null }));
  const ours = ourNames(p, [agr?.ownerName, agr?.senderName, ctx.ownerName, ctx.actor.startsWith('owner:') ? ctx.actor.slice(6).split('@')[0] : '']);
  for (const sp of proposal.people ?? []) {
    if (people.length >= CP_LIMITS.people) break;
    const name = personName(sp.name);
    if (name.length < 2 || people.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    if (isOurs(name, ours)) continue;
    people = [...people, { id: newId(), name, email: '', side: 'client', role: line(sp.role, CP_LIMITS.roleLabel), createdAt: nowIso() }];
    peopleAdded++;
  }
  // A proposed assignee is only ever a client-side person, and only on a client-owned card.
  const assigneeFor = (t: ProposalTask) => (t.ownerSide === 'client' && t.assigneeName ? (people.find((x) => x.side === 'client' && x.name.toLowerCase() === (t.assigneeName as string).toLowerCase())?.id ?? null) : null);
  const checklistFor = (t: ProposalTask): ChecklistItem[] => (t.checklist ?? []).slice(0, CP_LIMITS.aiChecklist).map((x) => ({ id: newId(), text: line(x, CP_LIMITS.checklistText), done: false })).filter((i) => i.text);
  let updated = 0;
  for (const t of proposal.tasks) {
    const card = t.kind === 'new' ? undefined : bySop.get(t.matchesSopCard);
    if (!card) continue;
    const patch: Partial<Task> = { sourceRef: ref(t) };
    // Suggestions only fill what the owner has not set on the card already.
    if (t.priority && !card.priority) patch.priority = t.priority;
    if (!(card.checklist ?? []).length && checklistFor(t).length) patch.checklist = checklistFor(t);
    if (!card.assigneeId && assigneeFor(t) && (t.kind === 'changed' ? t.ownerSide : card.ownerSide) === 'client') patch.assigneeId = assigneeFor(t);
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
        priority: t.priority ?? null,
        checklist: checklistFor(t),
        assigneeId: assigneeFor(t),
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
    ...(peopleAdded ? { people } : {}),
  });
  await log(p, null, ctx.actor, 'plan_approved', { runId: run.id, created, updated, cards: proposal.tasks.length, peopleAdded });
  return { created, updated };
}

const normName = (v: string) => v.toLowerCase().replace(/[._-]+/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Normalised names of our side (people on our side, plus extra names such as the Agreements signatory). */
export function ourNames(p: Pick<Project, 'people'>, extra: (string | null | undefined)[] = []): string[] {
  return [...(p.people ?? []).filter((x) => x.side === 'us').flatMap((x) => [x.name, x.email.split('@')[0]]), ...extra]
    .filter((x): x is string => typeof x === 'string')
    .map(normName)
    .filter((x) => x.length >= 2);
}
/** Is this name one of ours? The same name, or the same first and last word ("Emil Halili" and "Emil J. Halili"). */
export function isOurs(name: string, ours: string[]): boolean {
  const n = normName(name);
  const fl = (v: string) => {
    const w = v.split(' ');
    return w.length >= 2 ? `${w[0]} ${w[w.length - 1]}` : '';
  };
  return ours.some((o) => o === n || (fl(o) !== '' && fl(o) === fl(n)));
}

export async function discardRun(p: Project, run: AiRun, ctx: Ctx): Promise<void> {
  const done = await store().updateRun(run.id, { status: 'discarded' }, ['draft', 'failed']);
  if (!done) throw new CpError(409, 'There is no draft to discard.');
  await log(p, null, ctx.actor, 'ai_discarded', { runId: run.id });
}

/** The "AI status update" action: draft the client note and the Delivery Report text. A draft only. */
export async function draftStatusUpdate(p: Project, ctx: Ctx) {
  const s = store();
  const [tasks, delays, intake] = await Promise.all([s.listTasks(p.id), s.findEvents(p.id, { type: 'client_delay', limit: 1000 }), s.findEvents(p.id, { type: 'intake', since: weekAgoIso(), limit: 300 })]);
  const draft = await draftStatus(p, tasks, [...delays, ...intake]);
  const statusDraft = { ...draft, ...(p.statusDraft?.readinessNotice ? { readinessNotice: p.statusDraft.readinessNotice } : {}) };
  await s.updateProject(p.id, { statusDraft });
  await log(p, null, ctx.actor, 'status_drafted', { ai: draft.ai });
  return statusDraft;
}
