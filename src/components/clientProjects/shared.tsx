'use client';

/**
 * Shared bits for Client Projects (owner console and the client board): guard, progress bar, chips and
 * the card. Visuals follow the design SPEC (media/client_projects_ui/SPEC.md): cp-* classes in cp.css,
 * state in data attributes.
 */
import * as React from 'react';
import Link from 'next/link';
import { Check, Clock, Diamond, Link2, Lock, MessageSquare, Paperclip, User } from 'lucide-react';
import { Badge, EmptyState, Meter, Skeleton } from '@/components/ui';
import { useServerAuth } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import '@/components/clientProjects/cp.css';
import {
  HEALTH_LABEL,
  PRIORITY_LABEL,
  checklistProgress,
  initialsOf,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  defectStatusLabel,
  fmtDate,
  todayManila,
  type AiRun,
  type CpFileMeta,
  type DelayRow,
  type Health,
  type Label,
  type OwnerProjectView,
  type OwnerSide,
  type OwnerTaskView,
  type Person,
  type Priority,
  type ProgressView,
  type Severity,
  type StatusDraft,
  type TaskStatus,
} from '@/lib/clientProjects/types';

export { initialsOf };

export type AiMode = 'live' | 'stub' | 'off';

export interface MailStatus {
  configured: boolean;
  outbox: boolean;
  problem: string | null;
}

/**
 * GET /api/client-projects/:id. The activity log, the comments and the automation log are not in it:
 * each tab and the card drawer load their own, in pages.
 */
export interface ProjectResponse {
  project: OwnerProjectView;
  tasks: OwnerTaskView[];
  delays: DelayRow[];
  files: CpFileMeta[];
  /** v2: card attachments (metadata only). */
  attachments: CpFileMeta[];
  ai: AiMode;
  aiProvider?: 'claude' | 'gemini' | 'off';
  mail: MailStatus;
}

export interface AiResponse {
  ai: AiMode;
  message: string | null;
  run: AiRun | null;
  statusDraft: StatusDraft | null;
}

/** Owner-only: platform staff in the Appointmentlyy workspace. Others see a short explanation. */
export function OwnerGate({ children }: { children: React.ReactNode }) {
  const { status, identity } = useServerAuth();
  if (status === 'unknown') {
    return (
      <div className="flex flex-col gap-3 px-4 py-6 md:px-8">
        <Skeleton className="h-8 w-1/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!identity?.isPlatformAdmin || identity.tenantCode !== 'APPOINTMENTLYY') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<Lock />}
          title="Client Projects are for the platform owner"
          description={identity?.isPlatformAdmin ? 'Switch back to the Appointmentlyy workspace to use Client Projects.' : 'This area is not available in your workspace.'}
          action={
            <Link href="/" className="focus-ring inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-body font-medium text-fg hover:bg-subtle">
              Go home
            </Link>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}

/** The progress bar on top of every board: done / total, with milestones as markers along it. */
export function ProgressBar({ progress, label, className }: { progress: ProgressView; label: string; className?: string }) {
  return (
    <div className={cn('relative py-1.5', className)} data-testid="cp-progress" data-value={Math.round(progress.value * 100)}>
      <Meter value={progress.value} label={label} className="h-2" />
      {progress.markers.map((m) => (
        <span
          key={m.id}
          title={`${m.title}${m.done ? ' (done)' : ''}`}
          data-testid="cp-marker"
          data-done={m.done ? '1' : '0'}
          style={{ left: `${Math.min(100, Math.max(0, m.at * 100))}%` }}
          className={cn(
            'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-[1.5px]',
            m.done ? 'border-action bg-action' : 'border-fg-tertiary bg-surface',
          )}
        />
      ))}
    </div>
  );
}

export function SideChip({ side, you }: { side: OwnerSide; you?: boolean }) {
  // Calm on purpose: red is kept for overdue. The client's own items are outlined, ours are quiet.
  return side === 'client' ? <Badge className="border border-line-strong bg-surface font-medium text-fg">{you ? 'You' : 'Client'}</Badge> : <Badge tone="neutral">Us</Badge>;
}

export function StatusChip({ status }: { status: TaskStatus }) {
  if (status === 'in_progress') return <Badge className="bg-selected-soft text-selected-soft-fg">{STATUS_LABEL[status]}</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function SeverityChip({ severity }: { severity: Severity | null }) {
  if (!severity) return <Badge tone="neutral">Unclassified</Badge>;
  return <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

export function DueText({ date, overdue, done }: { date: string | null; overdue: boolean; done?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption tabular-nums', overdue ? 'font-medium text-danger-fg' : 'text-fg-secondary', done && 'text-fg-tertiary')}>
      {overdue && <span aria-hidden className="size-1.5 rounded-full bg-danger-fg" />}
      {fmtDate(date)}
      {overdue && <span className="sr-only"> (overdue)</span>}
    </span>
  );
}

// ------------------------------------------------------------------ v2 pieces (design SPEC section 1)

/** The status glyphs used by columns, the drawer and the client board, so status reads the same everywhere. */
export function StatusGlyph({ status, className }: { status: TaskStatus; className?: string }) {
  const c = cn('cp-col-glyph', className);
  if (status === 'done')
    return (
      <svg viewBox="0 0 14 14" className={c} aria-hidden data-glyph="done">
        <circle cx="7" cy="7" r="6.5" fill="var(--success-fg)" />
        <path d="M4.2 7.2 6.1 9l3.7-3.9" fill="none" stroke="var(--bg-surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (status === 'blocked')
    return (
      <svg viewBox="0 0 14 14" className={c} aria-hidden data-glyph="blocked">
        <circle cx="7" cy="7" r="5.75" fill="none" stroke="var(--warning-fg)" strokeWidth="1.5" />
        <path d="M4.5 7h5" stroke="var(--warning-fg)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (status === 'in_progress')
    return (
      <svg viewBox="0 0 14 14" className={c} aria-hidden data-glyph="in_progress">
        <circle cx="7" cy="7" r="5.75" fill="none" stroke="var(--text-primary)" strokeWidth="1.5" />
        <path d="M7 3.25a3.75 3.75 0 0 1 0 7.5z" fill="var(--text-primary)" />
      </svg>
    );
  return (
    <svg viewBox="0 0 14 14" className={c} aria-hidden data-glyph="todo">
      <circle cx="7" cy="7" r="5.75" fill="none" stroke="var(--ink-400)" strokeWidth="1.5" strokeDasharray="2.4 2" />
    </svg>
  );
}

export function LabelChip({ label, className }: { label: Label; className?: string }) {
  return (
    <span className={cn('cp-label', className)} data-c={label.color}>
      {label.name}
    </span>
  );
}

/** Four ascending bars; Urgent lights all four in brand red (the only red on a healthy card). */
export function PriorityMark({ priority, className }: { priority: Priority | null; className?: string }) {
  if (!priority) return null;
  return (
    <span className={cn('cp-prio', className)} data-p={priority} role="img" aria-label={`Priority: ${PRIORITY_LABEL[priority].toLowerCase()}`} title={`Priority: ${PRIORITY_LABEL[priority]}`}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** Initials in a circle: our side filled, the client's side outlined, nobody dashed. */
export function AssigneeBadge({ person, size = 'sm' }: { person: Pick<Person, 'name' | 'side'> | null; size?: 'sm' | 'md' }) {
  if (!person)
    return (
      <span className={cn('cp-av', size === 'md' && 'is-md')} data-side="none" title="Unassigned">
        <User className="size-3" aria-hidden />
        <span className="sr-only">Unassigned</span>
      </span>
    );
  return (
    <span className={cn('cp-av', size === 'md' && 'is-md')} data-side={person.side} data-testid="cp-assignee" title={`${person.name}${person.side === 'client' ? ' (client)' : ''}`}>
      <span aria-hidden>{initialsOf(person.name)}</span>
      <span className="sr-only">Assigned to {person.name}</span>
    </span>
  );
}

export function HealthChip({ health, reasons }: { health: Health; reasons?: string[] }) {
  return (
    <span className="cp-chip" data-testid="cp-health" data-health={health} title={reasons?.join(' ')}>
      {HEALTH_LABEL[health]}
    </span>
  );
}

function ChecklistRing({ done, total }: { done: number; total: number }) {
  const c = 2 * Math.PI * 5;
  return (
    <svg viewBox="0 0 14 14" className="cp-ring" data-full={done === total ? '1' : '0'} aria-hidden>
      <circle className="t" cx="7" cy="7" r="5" />
      <circle className="f" cx="7" cy="7" r="5" strokeDasharray={c} strokeDashoffset={c * (1 - (total ? done / total : 0))} />
    </svg>
  );
}

/** The due line on a card: future, Today, an overdue pill with business days late, or Done <date>. */
export function CardDue({ task }: { task: OwnerTaskView }) {
  if (task.status === 'done')
    return (
      <span className="cp-due" data-s="done">
        Done {task.doneAt ? fmtDate(todayManila(new Date(task.doneAt))) : ''}
      </span>
    );
  if (!task.dueDate) return null;
  if (task.overdue)
    return (
      <span className="cp-due" data-s="late">
        {fmtDate(task.dueDate)} · {task.daysLate}d late<span className="sr-only"> (overdue)</span>
      </span>
    );
  if (task.dueDate === todayManila())
    return (
      <span className="cp-due" data-s="today">
        Today
      </span>
    );
  return (
    <span className="cp-due" data-s="future">
      {fmtDate(task.dueDate)}
    </span>
  );
}

/**
 * A card (SPEC "card anatomy"): the top row (key, milestone, severity, lock, priority or the done
 * mark), the title (2 lines), at most 2 labels, the blocker line, then the footer: assignee, checklist,
 * comments, attachments, due. Counts that are 0 are not shown. The title is the open button; `menu` is
 * the keyboard "Move to…" menu; the parent passes the drag handlers.
 */
export function TaskCard({
  task,
  onOpen,
  people = [],
  labels = [],
  showStatus = true,
  menu,
  dragging,
  ghost,
  className,
  ...rest
}: {
  task: OwnerTaskView;
  onOpen: (t: OwnerTaskView) => void;
  people?: Person[];
  labels?: Label[];
  showStatus?: boolean;
  menu?: React.ReactNode;
  dragging?: boolean;
  ghost?: boolean;
} & Omit<React.HTMLAttributes<HTMLElement>, 'onClick'>) {
  const done = task.status === 'done';
  const assignee = people.find((x) => x.id === task.assigneeId) ?? null;
  const cl = checklistProgress(task.checklist);
  const mine = labels.filter((l) => (task.labelIds ?? []).includes(l.id));
  const gated = task.ownerSide === 'client' && task.type !== 'defect' && !task.clientMayTick;
  // A client intake step the client has done is waiting on US, not on the client.
  const waitingClient = !done && task.ownerSide === 'client' && task.overdue && task.intake?.unified !== 'waiting_on_us';
  return (
    <article
      data-testid="cp-card"
      data-key={task.key}
      data-k={task.key}
      data-id={task.id}
      data-status={task.status}
      data-overdue={task.overdue ? '1' : '0'}
      className={cn('cp-card group', dragging && 'is-dragging', ghost && 'is-ghost', className)}
      onClick={(e) => {
        // A click anywhere on the card opens it (the title button is the keyboard path); not the menu.
        if (!(e.target as HTMLElement).closest('[data-no-drag], button, a')) onOpen(task);
      }}
      {...rest}
    >
      <div className="cp-card-top">
        <span className="cp-key">{task.key}</span>
        {task.isGate && <Diamond className="size-2.5 fill-current text-fg" aria-label="Milestone" />}
        {task.type === 'defect' && task.severity && (
          <span className="cp-sev" data-sev={task.severity} title={SEVERITY_LABEL[task.severity]}>
            {task.severity}
          </span>
        )}
        {gated && <Lock className="size-3 text-fg-tertiary" aria-label="The client cannot complete this" />}
        {!task.clientVisible && <span className="text-caption text-fg-tertiary">Internal</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {done ? (
            <span className="cp-donemark inline-flex size-4 items-center justify-center rounded-full bg-success-fg text-surface" aria-label="Done">
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <PriorityMark priority={task.priority} />
          )}
          {menu}
        </span>
      </div>
      <button type="button" onClick={() => onOpen(task)} className="focus-ring cp-card-title rounded-sm text-left after:absolute after:inset-0 after:content-['']" data-testid="cp-card-open">
        {task.title}
      </button>
      {mine.length > 0 && (
        <div className="cp-card-labels">
          {mine.slice(0, 2).map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
          {mine.length > 2 && <span className="cp-mono text-caption text-fg-tertiary">+{mine.length - 2}</span>}
        </div>
      )}
      {!done && (task.openBlockers ?? []).length > 0 ? (
        <div className="cp-card-block" data-testid="cp-card-blocker">
          <Link2 className="size-3" aria-hidden /> Blocked by <span className="cp-mono">{task.openBlockers.join(', ')}</span>
        </div>
      ) : waitingClient ? (
        <div className="cp-card-block">
          <Clock className="size-3" aria-hidden /> Waiting on client · {task.daysLate} business day{task.daysLate === 1 ? '' : 's'}
        </div>
      ) : task.clientClaimedAt && !done ? (
        <div className="cp-card-block">
          <Clock className="size-3" aria-hidden /> Client says done: confirm it
        </div>
      ) : null}
      {task.intake && (
        <div className="cp-intake-chip" data-testid="cp-card-intake" data-u={task.intake.unified} data-review={task.intake.review ? '1' : '0'}>
          {task.intake.unified === 'waiting_on_us' ? 'Waiting on us' : task.intake.label}
          {task.intake.review && <span className="cp-intake-dot" aria-label="Needs your review" />}
          {task.intake.kind === 'payment' && task.intake.unified !== 'complete' && (
            <button type="button" className="focus-ring relative z-10 ml-1 rounded-sm underline" onClick={() => onOpen(task)} data-testid="cp-card-pay">
              Record payment
            </button>
          )}
        </div>
      )}
      <div className="cp-card-foot">
        {task.type === 'defect' ? null : <AssigneeBadge person={assignee} />}
        {cl.total > 0 && (
          <span className="cp-meta" data-testid="cp-card-checklist" title={`Checklist ${cl.done} of ${cl.total}`}>
            <ChecklistRing done={cl.done} total={cl.total} />
            {cl.done}/{cl.total}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="cp-meta" title={`${task.commentCount} comments`}>
            <MessageSquare className="size-3" aria-hidden />
            {task.commentCount}
          </span>
        )}
        {(task.attachmentCount ?? 0) > 0 && (
          <span className="cp-meta" title={`${task.attachmentCount} attachments`}>
            <Paperclip className="size-3" aria-hidden />
            {task.attachmentCount}
          </span>
        )}
        {showStatus && !done && <span className="sr-only">{STATUS_LABEL[task.status]}</span>}
        {task.type === 'defect' && done ? (
          <Badge tone={task.retestConfirmed ? 'success' : 'warning'} className="ml-auto">
            {defectStatusLabel(task)}
          </Badge>
        ) : (
          <CardDue task={task} />
        )}
      </div>
      {showStatus && (
        <span className="mt-2 flex items-center gap-1.5 text-caption text-fg-secondary" data-testid="cp-card-status">
          <StatusGlyph status={task.status} />
          {STATUS_LABEL[task.status]}
        </span>
      )}
    </article>
  );
}

/** A quiet inline note (test-server, storage, mail status). */
export function Note({ tone = 'neutral', children }: { tone?: 'neutral' | 'warning'; children: React.ReactNode }) {
  return (
    <div role="note" className={cn('rounded-md border px-3 py-2 text-small', tone === 'warning' ? 'border-warning-400/40 bg-warning-bg text-warning-fg' : 'border-line bg-subtle text-fg-secondary')}>
      {children}
    </div>
  );
}

