'use client';

import * as React from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Badge, Button, IconButton, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { MEETING_PLAN_LIMITS, MEETING_STATUS_LABEL, type MeetingPlanStatus } from '@/lib/meetingPlan';
import { STATUS_TONE } from './meetingPlanClient';

export function MeetingStatusBadge({ status, className }: { status: MeetingPlanStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      <span data-testid="meeting-plan-status" data-status={status} className="inline-flex items-center gap-1">
        {status === 'preparing' && <Loader2 className="size-3 animate-spin" aria-hidden />}
        {MEETING_STATUS_LABEL[status]}
      </span>
    </Badge>
  );
}

/** Editable list of short strings with add / remove (used by plan, one-pager and profile editors). */
export function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
  addLabel = 'Add',
  multiline = false,
  max = MEETING_PLAN_LIMITS.listItems,
  maxLength = MEETING_PLAN_LIMITS.shortText,
  testId,
  readOnly = false,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  multiline?: boolean;
  max?: number;
  maxLength?: number;
  testId?: string;
  readOnly?: boolean;
}) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid={testId}>
      <legend className="mb-1.5 text-body-strong text-fg">{label}</legend>
      {items.length === 0 && <p className="text-small text-fg-tertiary">Nothing here yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {multiline ? (
              <Textarea
                aria-label={`${label} ${i + 1}`}
                value={it}
                rows={2}
                maxLength={maxLength}
                readOnly={readOnly}
                onChange={(e) => set(i, e.target.value)}
                placeholder={placeholder}
                className="min-h-0 resize-y"
              />
            ) : (
              <Input
                aria-label={`${label} ${i + 1}`}
                value={it}
                maxLength={maxLength}
                readOnly={readOnly}
                onChange={(e) => set(i, e.target.value)}
                placeholder={placeholder}
              />
            )}
            {!readOnly && (
              <IconButton label={`Remove ${label.toLowerCase()} ${i + 1}`} size="md" onClick={() => remove(i)}>
                <X className="size-4" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {items.length > max && (
        <p className="text-small text-warning-fg">Only the first {max} are kept when you save.</p>
      )}
      {!readOnly && items.length < max && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus />}
          className="self-start"
          aria-label={`${addLabel} (${label})`}
          onClick={() => onChange([...items, ''])}
        >
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}

/** Section block used on the plan page. */
export function PlanSection({
  title,
  icon,
  children,
  className,
  actions,
  testId,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className={cn('rounded-lg border border-line bg-surface p-5 shadow-xs', className)} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-h3 text-fg">
          {icon && <span className="text-fg-tertiary [&_svg]:size-4">{icon}</span>}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function BulletList({ items, empty = 'Nothing noted.' }: { items: string[]; empty?: string }) {
  const list = items.filter((s) => s && s.trim());
  if (list.length === 0) return <p className="text-small text-fg-tertiary">{empty}</p>;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg marker:text-fg-tertiary">
      {list.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}
