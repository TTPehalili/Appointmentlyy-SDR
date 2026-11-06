'use client';

import React, { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { CalendarClock, Check, PhoneCall, RotateCcw } from 'lucide-react';
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';
import { getTenantQuota } from '@/lib/icpQuotaStore';
import {
  CallbackTask,
  canUserCompleteCallback,
  canUserReassignCallback,
  formatCallbackDue,
  getCallbackDueState,
  getLocalTimeZone,
  getServerCallbacks,
  getStoredCallbacks,
  getTimeZoneAbbr,
  reassignCallbackTask,
  setCallbackTaskDone,
  subscribeToCallbacks,
} from '@/lib/callbackStore';

export interface CallbackActor {
  name: string;
  role?: string | null;
  tenantCode: string;
}

/** Live callback tasks for one org. */
export function useCallbackTasks(tenantCode: string): CallbackTask[] {
  const all = useSyncExternalStore(subscribeToCallbacks, getStoredCallbacks, getServerCallbacks);
  return useMemo(() => all.filter((t) => t.tenantCode === tenantCode), [all, tenantCode]);
}

/** Reps in the org (tenant roster), with the current rep first. */
export function getOrgRepRoster(tenantCode: string, tenantName: string, currentRep: string): string[] {
  const roster = getTenantQuota(tenantCode, tenantName).repsRoster || [];
  const seen = new Set<string>();
  return [currentRep, ...roster]
    .map((r) => r.trim())
    .filter((r) => {
      const key = r.toLowerCase();
      if (!r || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ------------------------------------------------------------------ dialog */

export interface ScheduleCallbackInput {
  dueAt: string;
  timeZone: string;
  note: string;
  assignedTo: string;
}

export function ScheduleCallbackDialog({
  open,
  onClose,
  onConfirm,
  contactName,
  companyName,
  repName,
  roster,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: ScheduleCallbackInput) => void;
  contactName: string;
  companyName: string;
  repName: string;
  roster: string[];
}) {
  const formId = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule a callback"
      description={`${contactName} at ${companyName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" form={formId} icon={<CalendarClock />}>
            Schedule callback
          </Button>
        </>
      }
    >
      {/* Mounted only while open, so every open starts from fresh defaults. */}
      <ScheduleCallbackForm formId={formId} onConfirm={onConfirm} repName={repName} roster={roster} />
    </Dialog>
  );
}

function ScheduleCallbackForm({
  formId,
  onConfirm,
  repName,
  roster,
}: {
  formId: string;
  onConfirm: (input: ScheduleCallbackInput) => void;
  repName: string;
  roster: string[];
}) {
  const ids = { date: useId(), time: useId(), note: useId(), assignee: useId() };
  const [defaults] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { date: toDateInput(tomorrow), today: toDateInput(new Date()) };
  });
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [assignedTo, setAssignedTo] = useState(repName);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useMemo(() => getLocalTimeZone(), []);
  const zoneAbbr = useMemo(() => {
    const d = new Date(`${date}T${time || '00:00'}`);
    return getTimeZoneAbbr(Number.isNaN(d.getTime()) ? new Date() : d);
  }, [date, time]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      setError('Pick a date and a time.');
      return;
    }
    const due = new Date(`${date}T${time}`);
    if (Number.isNaN(due.getTime())) {
      setError('Pick a valid date and time.');
      return;
    }
    if (due.getTime() <= Date.now()) {
      setError('Pick a time in the future.');
      return;
    }
    onConfirm({ dueAt: due.toISOString(), timeZone, note: note.trim(), assignedTo: assignedTo || repName });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor={ids.date}>
          <Input
            id={ids.date}
            type="date"
            value={date}
            min={defaults.today}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            required
            autoFocus
          />
        </Field>
        <Field label="Time" htmlFor={ids.time}>
          <Input
            id={ids.time}
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            required
          />
        </Field>
      </div>
      <p className="-mt-2 text-small text-fg-tertiary">
        Your time zone: {timeZone}
        {zoneAbbr ? ` (${zoneAbbr})` : ''}
      </p>
      {error && (
        <p className="-mt-2 text-small text-danger-fg" role="alert">
          {error}
        </p>
      )}

      <Field label="Assign to" htmlFor={ids.assignee}>
        <Select id={ids.assignee} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          {roster.map((r) => (
            <option key={r} value={r}>
              {r === repName ? `${r} (you)` : r}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Note (optional)" htmlFor={ids.note} hint="Saved with the callback when you schedule it.">
        <Textarea
          id={ids.note}
          rows={3}
          className="min-h-20"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to cover on the callback"
        />
      </Field>
    </form>
  );
}

/* -------------------------------------------------------------- reassign */

export function CallbackReassignSelect({
  task,
  roster,
  actor,
  onReassigned,
  className,
}: {
  task: CallbackTask;
  roster: string[];
  actor: CallbackActor;
  onReassigned?: (task: CallbackTask) => void;
  className?: string;
}) {
  const id = useId();
  if (!canUserReassignCallback(task, actor.name, actor.role)) {
    return (
      <span className="text-caption text-fg-tertiary">
        Assigned to <span className="text-fg-secondary">{task.assignedTo}</span>
      </span>
    );
  }
  const options = roster.some((r) => r.toLowerCase() === task.assignedTo.toLowerCase())
    ? roster
    : [task.assignedTo, ...roster];
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <label htmlFor={id} className="shrink-0 text-caption text-fg-tertiary">
        Assigned to
      </label>
      <Select
        id={id}
        value={task.assignedTo}
        className="h-7 text-small"
        onChange={(e) => {
          const updated = reassignCallbackTask(task.id, e.target.value, actor);
          if (updated) onReassigned?.(updated);
        }}
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
    </div>
  );
}

/* ------------------------------------------------------------------ rows */

function DueBadge({ task }: { task: CallbackTask }) {
  if (task.status === 'done') return <Badge tone="success">Done</Badge>;
  const state = getCallbackDueState(task.dueAt);
  if (state === 'overdue') return <Badge tone="danger">Overdue</Badge>;
  if (state === 'today') return <Badge tone="warning">Today</Badge>;
  return <Badge>Upcoming</Badge>;
}

export function CallbackTaskRow({
  task,
  roster,
  actor,
  onOpenLead,
  onReassigned,
  showContact = true,
}: {
  task: CallbackTask;
  roster: string[];
  actor: CallbackActor;
  onOpenLead?: (task: CallbackTask) => void;
  onReassigned?: (task: CallbackTask) => void;
  showContact?: boolean;
}) {
  const canComplete = canUserCompleteCallback(task, actor.name, actor.role);
  const isDone = task.status === 'done';
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showContact && (
            <p className="truncate text-body-strong text-fg">
              {task.contactName}
              <span className="font-normal text-fg-secondary"> at {task.companyName}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5 text-small tabular-nums text-fg-secondary">
            <CalendarClock className="size-3.5 shrink-0" />
            <span>{formatCallbackDue(task.dueAt)}</span>
            <span className="text-fg-tertiary">{getTimeZoneAbbr(new Date(task.dueAt))}</span>
          </p>
        </div>
        <DueBadge task={task} />
      </div>

      {task.note && <p className="whitespace-pre-wrap text-small text-fg-secondary">{task.note}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 flex-col gap-1">
          {isDone ? (
            <span className="text-caption text-fg-tertiary">
              Assigned to <span className="text-fg-secondary">{task.assignedTo}</span>
            </span>
          ) : (
            <CallbackReassignSelect task={task} roster={roster} actor={actor} onReassigned={onReassigned} />
          )}
          <span className="text-caption text-fg-tertiary">
            Scheduled by <span className="text-fg-secondary">{task.createdBy}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onOpenLead && !isDone && (
            <Button variant="ghost" size="sm" icon={<PhoneCall />} onClick={() => onOpenLead(task)}>
              Open lead
            </Button>
          )}
          {canComplete && (
            <Button
              variant="secondary"
              size="sm"
              icon={isDone ? <RotateCcw /> : <Check />}
              onClick={() => setCallbackTaskDone(task.id, !isDone, actor)}
            >
              {isDone ? 'Reopen' : 'Mark done'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

type PanelFilter = 'mine' | 'scheduled' | 'team';

export function CallbacksPanel({
  tasks,
  roster,
  actor,
  isAdmin,
  onOpenLead,
}: {
  tasks: CallbackTask[];
  roster: string[];
  actor: CallbackActor;
  isAdmin: boolean;
  onOpenLead?: (task: CallbackTask) => void;
}) {
  const [filter, setFilter] = useState<PanelFilter>('mine');
  const [showDone, setShowDone] = useState(false);
  const me = actor.name.toLowerCase();

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => (showDone ? t.status === 'done' : t.status === 'open'))
      .filter((t) => {
        if (filter === 'mine') return t.assignedTo.toLowerCase() === me;
        if (filter === 'scheduled') return t.createdBy.toLowerCase() === me;
        return true;
      })
      .sort((a, b) =>
        showDone ? b.updatedAt.localeCompare(a.updatedAt) : a.dueAt.localeCompare(b.dueAt)
      );
  }, [tasks, filter, showDone, me]);

  const dueTodayCount = tasks.filter(
    (t) => t.status === 'open' && t.assignedTo.toLowerCase() === me && getCallbackDueState(t.dueAt) !== 'upcoming'
  ).length;

  const filters: { id: PanelFilter; label: string }[] = [
    { id: 'mine', label: 'Assigned to me' },
    { id: 'scheduled', label: 'Scheduled by me' },
    ...(isAdmin ? [{ id: 'team' as const, label: 'Team' }] : []),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="text-h3 text-fg">Callbacks</h3>
          <p className="text-small text-fg-secondary">
            {dueTodayCount === 0
              ? 'Nothing due today.'
              : `${dueTodayCount} ${dueTodayCount === 1 ? 'callback' : 'callbacks'} due today or overdue.`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowDone((v) => !v)}>
          {showDone ? 'Show open' : 'Show done'}
        </Button>
      </div>

      <div className="inline-flex flex-wrap items-center rounded-md border border-line bg-subtle p-0.5" aria-label="Filter callbacks">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`focus-ring h-7 cursor-pointer rounded-[6px] px-2.5 text-small font-medium transition-colors duration-150 ${
              filter === f.id ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
        {filtered.length > 0 ? (
          filtered.map((t) => (
            <CallbackTaskRow key={t.id} task={t} roster={roster} actor={actor} onOpenLead={onOpenLead} />
          ))
        ) : (
          <EmptyState
            icon={<CalendarClock />}
            title={showDone ? 'No completed callbacks' : 'No open callbacks'}
            description={showDone ? undefined : 'Choose Callback in the Outcome row to schedule one.'}
            className="py-8"
          />
        )}
      </div>
    </div>
  );
}
