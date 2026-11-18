/**
 * Server only. Building blocks for Client Projects: the owner guard, board-link tokens, input
 * cleaning, and the two projections (owner view, and the ONE public projection for the client board).
 */
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit, getAppBaseUrl } from '@/lib/authToken';
import { seal, open } from '@/lib/server/secretBox';
import type { ServerSession } from '@/lib/server/session';
import { TOKEN_RE, fail, requireOwner, tokenHashOf } from '@/lib/server/agreements/core';
import { ClientProjectStorageError, CP_MIGRATION, sha256Hex } from '@/lib/server/clientProjectStore';
import { SOP_GO_LIVE_OFFSET, SOP_TEMPLATE, SOP_UAT_START_OFFSET } from '@/lib/clientProjects/sopTemplate';
import {
  CP_LIMITS,
  DELIVERABLE_RE,
  PHASES,
  PHASE_LABEL,
  SEVERITY_FIX_BD,
  addBusinessDays,
  businessDaysBetween,
  defectStatusLabel,
  isOverdue,
  progressOf,
  todayManila,
  typeFor,
  type CpComment,
  type CpEvent,
  type DelayRow,
  type OwnerProjectView,
  type OwnerTaskView,
  type Project,
  type PublicComment,
  type PublicDefect,
  type PublicProject,
  type PublicTask,
  type Severity,
  type Task,
} from '@/lib/clientProjects/types';
import { newId, nowIso } from '@/lib/server/tenantStore';

// ------------------------------------------------------------------ guard

/**
 * Platform owner only (requireOwner from Agreements: platform staff signed in to the Appointmentlyy
 * workspace), plus a per-owner rate limit. `bucket` separates expensive actions (uploads, AI).
 */
export async function requireProjectOwner(req: NextRequest, bucket: 'read' | 'write' | 'upload' | 'ai' = 'write'): Promise<ServerSession | NextResponse> {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) {
    return owner.status === 403 ? fail(403, 'Client Projects are only for the platform owner, in the Appointmentlyy workspace.') : owner;
  }
  const [max, windowMs] = { read: [600, 5 * 60_000], write: [300, 5 * 60_000], upload: [40, 10 * 60_000], ai: [30, 10 * 60_000] }[bucket];
  if (!rateLimit(`cp-owner-${bucket}:${owner.email}`, max, windowMs)) return fail(429, 'Too many requests. Wait a few minutes and try again.');
  return owner;
}

export function storageFail(err: unknown, what: string): NextResponse {
  if (err instanceof ClientProjectStorageError) return fail(503, `The Client Projects tables are not in the database yet. Run ${CP_MIGRATION}.`);
  console.error(`[client-projects ${what}]`, err instanceof Error ? err.message : err);
  return fail(500, 'Something went wrong. Try again.');
}

// ------------------------------------------------------------------ board link tokens

/** A new board link token: 32 random bytes. Only its hash and a sealed copy are stored. */
export function newBoardToken(projectId: string): { token: string; hash: string; sealed: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token), sealed: seal(token, `cp_board_token|${projectId}`) };
}

export function unsealBoardToken(p: Pick<Project, 'id' | 'tokenSealed'>): string | null {
  if (!p.tokenSealed) return null;
  try {
    return open(p.tokenSealed, `cp_board_token|${p.id}`);
  } catch {
    return null;
  }
}

export const boardUrl = (token: string, origin?: string) => `${getAppBaseUrl(origin)}/b/${token}`;
export const consoleUrl = (projectId: string, origin?: string) => `${getAppBaseUrl(origin)}/platform/client-projects/${projectId}`;
export { TOKEN_RE, tokenHashOf };

/** The live board link for a project, or null when it is not shared. */
export function liveBoardUrl(p: Project, origin?: string): string | null {
  if (!p.shareEnabled || !p.tokenHash) return null;
  const token = unsealBoardToken(p);
  return token ? boardUrl(token, origin) : null;
}

// ------------------------------------------------------------------ input cleaning

/** How our side is named on the client board. A client can never use it as their own name. */
export const OWNER_LABEL = 'Appointmentlyy';

/** One line of plain text: control characters and line breaks removed, trimmed, cut to `max`. */
export function line(v: unknown, max: number): string {
  return typeof v === 'string' || typeof v === 'number'
    ? String(v)
        .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

/** Multi-line plain text: control characters removed (new lines kept), trimmed, cut to `max`. */
export function text(v: unknown, max: number): string {
  return typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
        .slice(0, max)
    : '';
}

/** A person's display name from the client board: letters, digits and simple punctuation only. */
export function personName(v: unknown): string {
  const name = line(v, CP_LIMITS.personName).replace(/[<>"`\\{}[\]|:;=]/g, '').trim();
  // Nobody on the client board may present themselves as us (the owner side is shown as "Appointmentlyy").
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(OWNER_LABEL.toLowerCase()) ? '' : name;
}

/**
 * May the client tick this card Done themselves on the shared board? Only an ordinary dependency item the
 * owner allowed. Never a milestone, a defect, or anything that stands for a signature, payment or acceptance.
 */
export const clientCanTick = (t: Pick<Task, 'ownerSide' | 'type' | 'clientMayTick'>): boolean => t.ownerSide === 'client' && t.type === 'client_item' && t.clientMayTick === true;

export function evidenceLinks(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v.slice(0, CP_LIMITS.evidenceLinks)) {
    const s = line(x, CP_LIMITS.evidenceLink);
    if (!s) continue;
    // Links only, and only http(s): nothing that could run in the owner's browser.
    if (!/^https?:\/\/[^\s<>"']+$/i.test(s)) return null;
    out.push(s);
  }
  return out;
}

export const deliverableRef = (v: unknown): string => (typeof v === 'string' && DELIVERABLE_RE.test(v) ? v : '');
export const today = () => todayManila();

// ------------------------------------------------------------------ building cards

export function blankTask(p: Pick<Project, 'id'>, num: number, over: Partial<Task>): Task {
  const now = nowIso();
  return {
    id: newId(),
    projectId: p.id,
    num,
    type: 'task',
    phase: 'week_1',
    title: '',
    descriptionClient: '',
    notesInternal: '',
    ownerSide: 'us',
    status: 'todo',
    dueDate: null,
    dueOffsetBd: null,
    deliverableRef: '',
    clientVisible: true,
    evidence: [],
    sort: num * 10,
    source: 'manual',
    sourceRef: '',
    sopKey: null,
    blockedBy: null,
    autoComplete: false,
    clientMayTick: false,
    clientClaimedAt: null,
    clientClaimedBy: '',
    severity: null,
    reportedBy: '',
    reportedByClient: false,
    reportedAt: null,
    steps: '',
    retestConfirmed: false,
    doneAt: null,
    doneBy: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** The whole SOP board for a project: one card per template row, due dates from kickoff. `firstNum` = first issue number. */
export function sopTasks(p: Pick<Project, 'id' | 'kickoffDate'>, firstNum: number): Task[] {
  return SOP_TEMPLATE.map((c, i) =>
    blankTask(p, firstNum + i, {
      type: typeFor(c.side, Boolean(c.gate)),
      phase: c.phase,
      title: c.title,
      descriptionClient: c.client,
      notesInternal: c.notes ?? '',
      ownerSide: c.side,
      dueOffsetBd: c.offset,
      dueDate: addBusinessDays(p.kickoffDate, c.offset),
      deliverableRef: c.ref ?? '',
      clientVisible: !c.internal,
      sort: (i + 1) * 10,
      source: 'sop',
      sopKey: c.key,
      autoComplete: Boolean(c.gate && c.auto && c.side === 'us'),
      clientMayTick: Boolean(c.tick && c.side === 'client' && !c.gate),
    }),
  );
}

export const defaultGoLive = (kickoffDate: string) => addBusinessDays(kickoffDate, SOP_GO_LIVE_OFFSET);

/** Fix-due date for a defect: the report date plus the severity's Business Days (Annex A targets). */
export function defectFixDue(reportedAt: string, severity: Severity): string {
  return addBusinessDays(todayManila(new Date(reportedAt)), SEVERITY_FIX_BD[severity]);
}

/**
 * Whether the client can report UAT defects. Automatic: an active project from the Readiness day
 * (kickoff + 10 Business Days) on. The owner can force it open or closed.
 */
export function uatOpen(p: Pick<Project, 'status' | 'kickoffDate' | 'uatOverride'>, now = today()): boolean {
  if (p.status === 'archived' || p.status === 'done') return false;
  if (p.uatOverride !== null && p.uatOverride !== undefined) return p.uatOverride;
  return p.status === 'active' && now >= addBusinessDays(p.kickoffDate, SOP_UAT_START_OFFSET);
}

// ------------------------------------------------------------------ owner projection

export const taskKey = (p: Pick<Project, 'key'>, t: Pick<Task, 'num'>) => `${p.key}-${t.num}`;

export function toOwnerTask(p: Project, t: Task, comments: CpComment[], now = today()): OwnerTaskView {
  const overdue = isOverdue(t, now);
  return {
    ...t,
    key: taskKey(p, t),
    isGate: t.type === 'milestone',
    overdue,
    daysLate: overdue && t.dueDate ? businessDaysBetween(t.dueDate, now) : 0,
    commentCount: comments.filter((c) => c.taskId === t.id).length,
  };
}

export function toOwnerProject(p: Project, tasks: Task[], now = today()): OwnerProjectView {
  const { tokenHash, tokenSealed, ...rest } = p;
  void tokenSealed;
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => isOverdue(t, now));
  const next = open
    .filter((t) => t.dueDate && t.type !== 'defect')
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string) || a.sort - b.sort)[0];
  return {
    ...rest,
    automations: rest.automations ?? {},
    hasLink: Boolean(p.shareEnabled && tokenHash),
    progress: progressOf(tasks),
    overdueCount: overdue.length,
    clientOverdueCount: overdue.filter((t) => t.ownerSide === 'client').length,
    openDefects: open.filter((t) => t.type === 'defect').length,
    nextDue: next ? { key: taskKey(p, next), title: next.title, dueDate: next.dueDate as string, ownerSide: next.ownerSide } : null,
    uatOpen: uatOpen(p, now),
  };
}

/**
 * The Client Delay log, derived (never typed): client-owned cards that are open past their due date,
 * or were finished late. Day counts are Business Days. `events` supplies when each was first recorded.
 */
export function delayRows(p: Project, tasks: Task[], events: CpEvent[], now = today()): DelayRow[] {
  const rows: DelayRow[] = [];
  for (const t of tasks) {
    if (t.ownerSide !== 'client' || !t.dueDate || t.type === 'defect') continue;
    const first = events.find((e) => e.type === 'client_delay' && e.taskId === t.id)?.at ?? null;
    if (t.status !== 'done') {
      if (t.dueDate < now) rows.push({ taskId: t.id, key: taskKey(p, t), title: t.title, dueDate: t.dueDate, state: 'open', days: businessDaysBetween(t.dueDate, now), doneAt: null, firstLoggedAt: first });
    } else if (t.doneAt) {
      const doneDay = todayManila(new Date(t.doneAt));
      if (doneDay > t.dueDate) rows.push({ taskId: t.id, key: taskKey(p, t), title: t.title, dueDate: t.dueDate, state: 'done_late', days: businessDaysBetween(t.dueDate, doneDay), doneAt: t.doneAt, firstLoggedAt: first });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ------------------------------------------------------------------ the public projection

function publicComments(taskId: string, comments: CpComment[]): PublicComment[] {
  return comments
    .filter((c) => c.taskId === taskId && c.clientVisible === true)
    .map((c) => {
      const fromClient = c.author.startsWith('client:');
      // Owner emails never leave the server: the owner side is always shown as the company.
      return { id: c.id, author: fromClient ? c.author.slice(7) : OWNER_LABEL, fromClient, body: c.body, at: c.at };
    });
}

/**
 * THE ONLY way project data reaches the client board (GET /api/board/:token).
 *
 * It builds a new object field by field, so nothing is ever copied through by accident: internal
 * notes, the internal briefing, plan metadata, status drafts, evidence links, source references,
 * files, AI runs, events, the owner's email, hidden cards and internal comments are simply not
 * read here. Add a field to the client board by adding it here, on purpose.
 */
export function toPublicProject(p: Project, tasks: Task[], comments: CpComment[], now = today()): PublicProject {
  const visible = tasks.filter((t) => t.clientVisible === true);
  const road = visible.filter((t) => t.type !== 'defect');
  const pubTask = (t: Task): PublicTask => ({
    id: t.id,
    key: taskKey(p, t),
    phase: t.phase,
    title: t.title,
    description: t.descriptionClient,
    ownerSide: t.ownerSide,
    status: t.status,
    dueDate: t.dueDate,
    isGate: t.type === 'milestone',
    overdue: isOverdue(t, now),
    doneAt: t.doneAt,
    canTick: clientCanTick(t) && (t.status !== 'done' || (t.doneBy ?? '').startsWith('client:')),
    canClaim: t.ownerSide === 'client' && !clientCanTick(t) && t.status !== 'done' && !t.clientClaimedAt,
    awaitingConfirmation: Boolean(t.clientClaimedAt) && t.status !== 'done',
    comments: publicComments(t.id, comments),
  });
  const pubDefect = (t: Task): PublicDefect => ({
    id: t.id,
    key: taskKey(p, t),
    title: t.title,
    steps: t.steps,
    severity: t.severity,
    status: t.status,
    statusLabel: defectStatusLabel(t),
    fixDue: t.dueDate,
    overdue: isOverdue(t, now),
    reportedByClient: t.reportedByClient === true,
    retestConfirmed: t.retestConfirmed === true,
    comments: publicComments(t.id, comments),
  });
  const bySchedule = (a: Task, b: Task) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.sort - b.sort;
  return {
    clientName: p.clientName,
    title: p.title,
    status: p.status,
    kickoffDate: p.kickoffDate,
    targetGoLive: p.targetGoLive,
    summary: p.summaryClient,
    update: p.clientUpdate && p.clientUpdateAt ? { text: p.clientUpdate, at: p.clientUpdateAt } : null,
    progress: progressOf(road),
    phases: PHASES.map((phase) => ({ phase, label: PHASE_LABEL[phase], tasks: road.filter((t) => t.phase === phase).sort(bySchedule).map(pubTask) })),
    uatOpen: uatOpen(p, now),
    defects: visible
      .filter((t) => t.type === 'defect')
      .sort((a, b) => (a.reportedAt ?? a.createdAt).localeCompare(b.reportedAt ?? b.createdAt))
      .map(pubDefect),
    readOnly: p.status === 'archived',
  };
}
