'use client';

/** Shared bits for Client Projects (owner console and the client board): guard, progress bar, chips, the card. */
import * as React from 'react';
import Link from 'next/link';
import { Diamond, Lock, MessageSquare } from 'lucide-react';
import { Badge, EmptyState, Meter, Skeleton } from '@/components/ui';
import { useServerAuth } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import {
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  defectStatusLabel,
  fmtDate,
  type AiRun,
  type CpComment,
  type CpEvent,
  type CpFileMeta,
  type DelayRow,
  type OwnerProjectView,
  type OwnerSide,
  type OwnerTaskView,
  type ProgressView,
  type Severity,
  type StatusDraft,
  type TaskStatus,
} from '@/lib/clientProjects/types';

export type AiMode = 'live' | 'stub' | 'off';

export interface MailStatus {
  configured: boolean;
  outbox: boolean;
  problem: string | null;
}

export interface ProjectResponse {
  project: OwnerProjectView;
  tasks: OwnerTaskView[];
  comments: CpComment[];
  commentsTruncated: boolean;
  /** Newest first: the first page. Older pages come from /events with `eventsBefore` as the cursor. */
  events: CpEvent[];
  eventsBefore: string | null;
  /** Newest first. */
  automationEvents: CpEvent[];
  automationCounts: Record<string, number>;
  delays: DelayRow[];
  files: CpFileMeta[];
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

/** A card shows only: key, title, the Us/Client chip, the due date and the status chip. Everything else is in the drawer. */
export function TaskCard({ task, onOpen }: { task: OwnerTaskView; onOpen: (t: OwnerTaskView) => void }) {
  const done = task.status === 'done';
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      data-testid="cp-card"
      data-key={task.key}
      data-overdue={task.overdue ? '1' : '0'}
      className={cn(
        'focus-ring flex w-full flex-col gap-2 rounded-md border border-line bg-surface p-3 text-left shadow-xs transition-colors duration-150 hover:border-line-strong',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption text-fg-tertiary">{task.key}</span>
        <span className="flex items-center gap-1.5 text-fg-tertiary">
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-caption tabular-nums" title={`${task.commentCount} comments`}>
              <MessageSquare className="size-3" aria-hidden />
              {task.commentCount}
            </span>
          )}
          {!task.clientVisible && <Lock className="size-3" aria-label="Hidden from the client" />}
        </span>
      </span>
      <span className={cn('flex items-start gap-1.5 text-body', done ? 'text-fg-secondary' : 'text-fg')}>
        {task.isGate && <Diamond className="mt-1 size-3 shrink-0 text-fg-secondary" aria-label="Milestone" />}
        <span className="line-clamp-2">{task.title}</span>
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex items-center gap-2">
          {task.type === 'defect' ? <SeverityChip severity={task.severity} /> : <SideChip side={task.ownerSide} />}
          <DueText date={task.dueDate} overdue={task.overdue} done={done} />
        </span>
        {task.type === 'defect' && done ? (
          <Badge tone={task.retestConfirmed ? 'success' : 'warning'}>{defectStatusLabel(task)}</Badge>
        ) : task.clientClaimedAt && !done ? (
          <Badge tone="warning">Client says done</Badge>
        ) : (
          <StatusChip status={task.status} />
        )}
      </span>
    </button>
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

