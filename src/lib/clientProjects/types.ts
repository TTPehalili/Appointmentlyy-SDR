/**
 * Client Projects (owner-only onboarding board with a shared client board): shared types, labels,
 * limits and the pure date/progress helpers. Safe for the browser: no secrets, no server imports.
 */

export const PHASES = ['before_kickoff', 'week_1', 'week_2', 'week_3', 'after_go_live'] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = {
  before_kickoff: 'Before kickoff',
  week_1: 'Week 1',
  week_2: 'Week 2',
  week_3: 'Week 3',
  after_go_live: 'After go-live',
};

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };
export const STATUS_TONE: Record<TaskStatus, 'neutral' | 'brand' | 'warning' | 'success'> = {
  todo: 'neutral',
  in_progress: 'brand',
  blocked: 'warning',
  done: 'success',
};

export const PROJECT_STATUSES = ['draft', 'active', 'done', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { draft: 'Draft', active: 'Active', done: 'Done', archived: 'Archived' };

export type OwnerSide = 'us' | 'client';

/** Issue types (Jira-style, owner side). `milestone` is a gate; `client_item` is a client-owned task. */
export const TASK_TYPES = ['task', 'milestone', 'client_item', 'defect'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TYPE_LABEL: Record<TaskType, string> = { task: 'Task', milestone: 'Milestone', client_item: 'Client item', defect: 'Defect' };

/** UAT defect severities (Annex A) and the fix target in Business Days from the report date. */
export const SEVERITIES = ['S1', 'S2', 'S3', 'S4'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABEL: Record<Severity, string> = { S1: 'S1 Critical', S2: 'S2 Major', S3: 'S3 Minor', S4: 'S4 Cosmetic' };
export const SEVERITY_FIX_BD: Record<Severity, number> = { S1: 2, S2: 5, S3: 15, S4: 15 };
export const SEVERITY_TONE: Record<Severity, 'danger' | 'warning' | 'neutral'> = { S1: 'danger', S2: 'warning', S3: 'neutral', S4: 'neutral' };

/** Contract deliverables 01-11 (the "epics" cards are grouped by). */
export const DELIVERABLES: Record<string, string> = {
  '01': 'Discovery',
  '02': 'Branded workspace',
  '03': 'Playbook',
  '04': 'AI practice',
  '05': 'Lead Finder',
  '06': 'Campaign kit',
  '07': 'Provider keys',
  '08': 'Floor and reporting',
  '09': 'Training and go-live',
  '10': 'Reseller workspaces',
  '11': 'Founder-led enablement',
};
export const DELIVERABLE_RE = /^(0[1-9]|1[01])$/;

export type TaskSource = 'sop' | 'ai' | 'manual' | 'client';

export const CP_LIMITS = {
  clientName: 120,
  title: 200,
  taskTitle: 200,
  description: 2000,
  notes: 4000,
  summary: 2000,
  briefing: 6000,
  comment: 2000,
  personName: 80,
  steps: 3000,
  evidenceLinks: 10,
  evidenceLink: 500,
  sourceRef: 400,
  tasksPerProject: 400,
  offsetMin: -30,
  offsetMax: 260,
  // Under the proxy's 10 MB request-body limit (Next.js proxyClientMaxBodySize default), which we keep.
  fileBytes: 9 * 1024 * 1024,
  filesPerProject: 12,
  aiPages: 60,
  aiCharsPerFile: 120_000,
  aiCharsTotal: 200_000,
  aiTasks: 80,
} as const;

export interface PlanMeta {
  keyDates: { label: string; date: string | null; offsetBd: number | null; note: string }[];
  fees: { label: string; amount: string; due: string }[];
  risks: string[];
}

export interface StatusDraft {
  clientUpdate: string;
  deliveryReport: string;
  /** Drafted when the Readiness milestone is marked Done (automation). Never auto-sent. */
  readinessNotice?: string;
  ai: boolean;
  at: string;
}

export interface Project {
  id: string;
  /** Short issue-key prefix, e.g. "STK" (cards are STK-1, STK-2 ...). */
  key: string;
  /** Last issue number handed out. */
  taskSeq: number;
  clientName: string;
  title: string;
  status: ProjectStatus;
  kickoffDate: string;
  targetGoLive: string | null;
  summaryClient: string;
  briefingInternal: string;
  planMeta: PlanMeta | null;
  /** The owner-approved progress note shown on the client board. */
  clientUpdate: string;
  clientUpdateAt: string | null;
  /** The latest AI/auto-drafted status texts (owner only, never public). */
  statusDraft: StatusDraft | null;
  /** UAT defect form on the client board: null = automatic (from the schedule), true/false = owner override. */
  uatOverride: boolean | null;
  /** Where the fixed-template client reminders go (automation rule, off by default). */
  clientContactEmail: string;
  /** Per-project on/off for the built-in automation rules (missing = the rule's default). */
  automations: Partial<Record<AutomationRule, boolean>>;
  tokenHash: string | null;
  tokenSealed: string | null;
  shareEnabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  /** Issue number within the project (key = `${project.key}-${num}`). */
  num: number;
  type: TaskType;
  phase: Phase;
  title: string;
  descriptionClient: string;
  notesInternal: string;
  ownerSide: OwnerSide;
  status: TaskStatus;
  dueDate: string | null;
  dueOffsetBd: number | null;
  deliverableRef: string;
  clientVisible: boolean;
  evidence: string[];
  sort: number;
  source: TaskSource;
  sourceRef: string;
  sopKey: string | null;
  /** Optional: the card this one waits on (same project). */
  blockedBy: string | null;
  /**
   * Milestones only: may the "Phase finished" rule mark it Done by itself? False (the default) for anything
   * that stands for an external or legal act (a notice sent, a signature, a payment, go-live): those are
   * only ever completed by the owner, by hand.
   */
  autoComplete: boolean;
  /**
   * Client-owned cards: may the client tick it Done themselves on the shared board? True only for ordinary
   * dependency items. For a signature, a payment or an acceptance it is false: the client can only say
   * "I've done this" (clientClaimedAt / clientClaimedBy), and the card is Done only when the owner says so.
   */
  clientMayTick: boolean;
  clientClaimedAt: string | null;
  clientClaimedBy: string;
  // Defects only
  severity: Severity | null;
  reportedBy: string;
  reportedByClient: boolean;
  reportedAt: string | null;
  steps: string;
  retestConfirmed: boolean;
  doneAt: string | null;
  doneBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CpEventType =
  | 'project_created'
  | 'project_updated'
  | 'task_created'
  | 'task_updated'
  | 'task_deleted'
  | 'status_changed'
  | 'severity_changed'
  | 'client_tick'
  | 'client_untick'
  | 'client_claims_done'
  | 'client_defect'
  | 'retest_confirmed'
  | 'comment'
  | 'client_delay'
  | 'share_enabled'
  | 'share_disabled'
  | 'share_reissued'
  | 'file_added'
  | 'file_removed'
  | 'ai_run_started'
  | 'ai_draft_ready'
  | 'ai_failed'
  | 'ai_discarded'
  | 'plan_approved'
  | 'status_drafted'
  | 'client_update_published'
  | 'automation';

// ------------------------------------------------------------------ automations (a small fixed set, no rules engine)

export const AUTOMATION_RULES = ['client_done', 'phase_milestone', 'defect_notify', 'client_reminders', 'us_overdue_digest', 'readiness_draft'] as const;
export type AutomationRule = (typeof AUTOMATION_RULES)[number];
export const AUTOMATION_INFO: Record<AutomationRule, { title: string; description: string; defaultOn: boolean }> = {
  client_done: { title: 'Client completes an item', description: 'When the client ticks an item or says “I’ve done this”: email the owner (once per card per day) and move any card blocked by that item from Blocked to To do. Client comments are batched into at most one email every 15 minutes.', defaultOn: true },
  phase_milestone: { title: 'Phase finished', description: 'When every other card in a phase is Done, email the owner. Internal checkpoints marked “complete automatically” are ticked. Milestones that stand for an external or legal act (a notice sent, a signature, a payment, go-live) are never ticked: you are told they are ready and mark them Done yourself.', defaultOn: true },
  defect_notify: { title: 'Client reports a defect', description: 'Email the owner immediately. The fix-due date is set from the severity.', defaultOn: true },
  client_reminders: { title: 'Reminders to the client', description: 'Email the client contact 2 business days before a client item is due, and on the first overdue day. Fixed wording with the board link, once per card. Needs a client contact email and a shared board. If an email cannot be sent it is retried on later checks.', defaultOn: false },
  us_overdue_digest: { title: 'Daily digest of our overdue items', description: 'Email the owner a list of overdue “Us” cards, at most once a day.', defaultOn: true },
  readiness_draft: { title: 'Ready for UAT', description: 'When the work before the Readiness milestone is complete, or when you mark it Done, draft the Readiness Notice and a status update for you to review. Nothing is sent, and the milestone stays open until you mark it Done.', defaultOn: true },
};
export const ruleOn = (p: { automations?: Partial<Record<AutomationRule, boolean>> | null }, rule: AutomationRule): boolean =>
  p.automations?.[rule] ?? AUTOMATION_INFO[rule].defaultOn;

export interface CpEvent {
  id: string;
  projectId: string;
  taskId: string | null;
  /** 'owner:<email>', 'client:<name>' or 'system'. */
  actor: string;
  type: CpEventType;
  detail: Record<string, unknown>;
  at: string;
}

export interface CpComment {
  id: string;
  projectId: string;
  taskId: string;
  author: string;
  body: string;
  at: string;
  clientVisible: boolean;
}

export interface CpFileMeta {
  id: string;
  projectId: string;
  name: string;
  size: number;
  sha256: string;
  pages: number;
  source: string;
  createdAt: string;
}

export type AiRunStatus = 'running' | 'draft' | 'approved' | 'discarded' | 'failed';

export type ProposalKind = 'sop' | 'changed' | 'new';
export const PROPOSAL_KIND_LABEL: Record<ProposalKind, string> = { sop: 'From SOP', changed: 'Changed by contract', new: 'New from contract' };

export interface ProposalTask {
  phase: Phase;
  title: string;
  descriptionClient: string;
  ownerSide: OwnerSide;
  dueOffsetBd: number;
  deliverableRef: string;
  isGate: boolean;
  sourcePage: number | null;
  sourceQuote: string;
  /** A SOP card key, or 'new'. */
  matchesSopCard: string;
  kind: ProposalKind;
}

export interface Proposal {
  summaryClient: string;
  briefingInternal: string;
  keyDates: PlanMeta['keyDates'];
  fees: PlanMeta['fees'];
  risks: string[];
  tasks: ProposalTask[];
}

export interface AiRun {
  id: string;
  projectId: string;
  status: AiRunStatus;
  model: string;
  proposal: Proposal | null;
  error: string | null;
  fileIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------------ dates (YYYY-MM-DD, Business Days = Mon-Fri)

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

const toUtc = (d: string) => new Date(`${d}T00:00:00Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** `date` plus `n` Business Days (n may be negative). Offset 0 on a weekend rolls to the next Monday. */
export function addBusinessDays(date: string, n: number): string {
  const d = toUtc(date);
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(Math.trunc(n));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (!isWeekend(d)) left--;
  }
  return fromUtc(d);
}

/** Business Days from `from` (exclusive) to `to` (inclusive); 0 when `to` is not after `from`. */
export function businessDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  const d = toUtc(from);
  const end = toUtc(to);
  let n = 0;
  while (d < end && n < 5000) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) n++;
  }
  return n;
}

/** Today's date in Manila (the owner's working time zone). */
export function todayManila(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d || !isDate(d)) return 'No date';
  return toUtc(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function fmtDateLong(d: string | null | undefined): string {
  if (!d || !isDate(d)) return '-';
  return toUtc(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function fmtAt(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
}

export function phaseForOffset(offset: number): Phase {
  if (offset <= 0) return 'before_kickoff';
  if (offset <= 5) return 'week_1';
  if (offset <= 10) return 'week_2';
  if (offset <= 15) return 'week_3';
  return 'after_go_live';
}

/** Suggest a 2-4 letter project key from the client name ("STACKph Inc" -> "STA", "Blue Sky BPO" -> "BSB"). */
export function suggestKey(clientName: string): string {
  const words = clientName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let k = words.length >= 2 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] ?? '').slice(0, 3);
  k = k.replace(/[^A-Z]/g, '');
  if (k.length < 2) k = (k + 'CP').slice(0, 2);
  return k;
}
export const PROJECT_KEY_RE = /^[A-Z]{2,5}$/;

// ------------------------------------------------------------------ views

export const isOpen = (t: Pick<Task, 'status'>) => t.status !== 'done';
export const isOverdue = (t: Pick<Task, 'status' | 'dueDate'>, today: string) => isOpen(t) && Boolean(t.dueDate) && (t.dueDate as string) < today;
export const typeFor = (ownerSide: OwnerSide, isGate: boolean): TaskType => (isGate ? 'milestone' : ownerSide === 'client' ? 'client_item' : 'task');

export interface ProgressView {
  total: number;
  done: number;
  /** 0..1 */
  value: number;
  /** Milestones as markers on the progress bar: `at` is 0..1 along the bar. */
  markers: { id: string; title: string; at: number; done: boolean }[];
}

interface ProgressTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  title: string;
  dueDate: string | null;
  sort: number;
}

/** Progress over the roadmap cards (defects are tracked separately and do not count). */
export function progressOf(tasks: ProgressTask[]): ProgressView {
  const road = tasks.filter((t) => t.type !== 'defect').sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.sort - b.sort);
  const total = road.length;
  const done = road.filter((t) => t.status === 'done').length;
  const markers = road
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.type === 'milestone')
    .map(({ t, i }) => ({ id: t.id, title: t.title, at: total ? (i + 1) / total : 0, done: t.status === 'done' }));
  return { total, done, value: total ? done / total : 0, markers };
}

export interface OwnerTaskView extends Task {
  key: string;
  isGate: boolean;
  overdue: boolean;
  daysLate: number;
  commentCount: number;
}

export interface DelayRow {
  taskId: string;
  key: string;
  title: string;
  dueDate: string;
  state: 'open' | 'done_late';
  days: number;
  doneAt: string | null;
  firstLoggedAt: string | null;
}

export interface OwnerProjectView extends Omit<Project, 'tokenHash' | 'tokenSealed'> {
  hasLink: boolean;
  progress: ProgressView;
  overdueCount: number;
  clientOverdueCount: number;
  openDefects: number;
  nextDue: { key: string; title: string; dueDate: string; ownerSide: OwnerSide } | null;
  uatOpen: boolean;
}

// The client board: only what toPublicProject() puts here ever leaves the server.
export interface PublicComment {
  id: string;
  author: string;
  fromClient: boolean;
  body: string;
  at: string;
}
export interface PublicTask {
  id: string;
  key: string;
  phase: Phase;
  title: string;
  description: string;
  ownerSide: OwnerSide;
  status: TaskStatus;
  dueDate: string | null;
  isGate: boolean;
  overdue: boolean;
  doneAt: string | null;
  /** The client may tick or untick this card themselves. */
  canTick: boolean;
  /** The client may say "I've done this"; only Appointmentlyy marks it Done. */
  canClaim: boolean;
  /** The client said it is done and Appointmentlyy has not confirmed yet. */
  awaitingConfirmation: boolean;
  comments: PublicComment[];
}
export interface PublicDefect {
  id: string;
  key: string;
  title: string;
  steps: string;
  severity: Severity | null;
  status: TaskStatus;
  statusLabel: string;
  fixDue: string | null;
  overdue: boolean;
  reportedByClient: boolean;
  retestConfirmed: boolean;
  comments: PublicComment[];
}
export interface PublicProject {
  clientName: string;
  title: string;
  status: ProjectStatus;
  kickoffDate: string;
  targetGoLive: string | null;
  summary: string;
  update: { text: string; at: string } | null;
  progress: ProgressView;
  phases: { phase: Phase; label: string; tasks: PublicTask[] }[];
  uatOpen: boolean;
  defects: PublicDefect[];
  readOnly: boolean;
}

export const defectStatusLabel = (t: Pick<Task, 'status' | 'retestConfirmed'>) =>
  t.status === 'done' ? (t.retestConfirmed ? 'Fixed and retested' : 'Fixed, awaiting retest') : STATUS_LABEL[t.status];

/** Deliverables in contract order, 01 to 11 (object key order would put "10" and "11" first). */
export const DELIVERABLE_LIST: [string, string][] = Object.entries(DELIVERABLES).sort(([a], [b]) => a.localeCompare(b));
