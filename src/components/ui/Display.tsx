import * as React from 'react';
import { Check, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------- Badge (status only) ---------- */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-subtle text-fg-secondary',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  brand: 'bg-brand-tint text-brand-text',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-caption tabular-nums whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const dotTones: Record<Tone, string> = {
  neutral: 'bg-fg-disabled',
  success: 'bg-success-500',
  warning: 'bg-warning-400',
  danger: 'bg-danger-fg',
  brand: 'bg-brand-500',
};

/** Status as a dot plus a label. Never color alone. */
export function StatusDot({
  tone = 'neutral',
  label,
  live,
  className,
}: {
  tone?: Tone;
  label: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-body text-fg', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', dotTones[tone], live && 'animate-pulse-soft')} aria-hidden />
      {label}
    </span>
  );
}

/* ---------- Avatar (client component: falls back to initials if the photo fails) ---------- */

export { Avatar, type AvatarSize } from './Avatar';

/* ---------- Card ---------- */

export function Card({
  className,
  children,
  as: Tag = 'div',
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' }) {
  return (
    <Tag className={cn('rounded-lg border border-line bg-surface shadow-xs', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-4', className)}>
      <div className="min-w-0">
        <h3 className="text-h3 text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-small text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/* ---------- StatTile ---------- */

export function StatTile({
  label,
  value,
  target,
  delta,
  hint,
  progress,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Rendered as "/ target" after the value. */
  target?: React.ReactNode;
  /** Positive or negative change, e.g. 12 means +12%. */
  delta?: number;
  hint?: React.ReactNode;
  /** 0 to 1, renders a slim meter. */
  progress?: number;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col gap-2 p-4', className)}>
      <span className="text-small text-fg-secondary">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-kpi tabular-nums text-fg">{value}</span>
        {target !== undefined && <span className="text-body tabular-nums text-fg-tertiary">/ {target}</span>}
      </div>
      {progress !== undefined && <Meter value={progress} label={label} />}
      {(delta !== undefined || hint) && (
        <div className="flex items-center gap-2 text-small">
          {delta !== undefined && (
            <span className={cn('inline-flex items-center gap-1 tabular-nums', delta >= 0 ? 'text-success-fg' : 'text-danger-fg')}>
              {delta >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
              {delta >= 0 ? '+' : ''}
              {delta}%
            </span>
          )}
          {hint && <span className="text-fg-tertiary">{hint}</span>}
        </div>
      )}
    </Card>
  );
}

export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-subtle', className)}
    >
      <div className="h-full rounded-full bg-action transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Kbd ---------- */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line bg-subtle px-1 font-sans text-caption text-fg-secondary',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ---------- Skeleton ---------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse-soft rounded-sm bg-subtle', className)} />;
}

/* ---------- Stepper ---------- */

export function Stepper({
  steps,
  current,
  className,
}: {
  steps: string[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn('flex items-center gap-3', className)} aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={s} className="flex items-center gap-3" aria-current={state === 'active' ? 'step' : undefined}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-caption tabular-nums',
                  state === 'done' && 'border-action bg-action text-action-fg',
                  state === 'active' && 'border-action text-fg',
                  state === 'todo' && 'border-line-strong text-fg-tertiary',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn('text-body', state === 'todo' ? 'text-fg-tertiary' : 'text-fg')}>{s}</span>
            </span>
            {i < steps.length - 1 && <span className="h-px w-8 bg-line-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- EmptyState ---------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      <span className="text-line-strong [&_svg]:size-8 [&_svg]:stroke-[1.5]" aria-hidden>
        {icon}
      </span>
      <div className="max-w-sm">
        <p className="text-h3 text-fg">{title}</p>
        {description && <p className="mt-1 text-body text-fg-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Inline error (with retry) ---------- */

export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center justify-between gap-4 rounded-md border border-danger-fg/30 bg-danger-bg px-4 py-3 text-body text-danger-fg',
        className,
      )}
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="focus-ring rounded-sm font-medium underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}

/* ---------- Tooltip (for jargon) ---------- */

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-60 -translate-x-1/2 rounded-sm bg-inverse px-2 py-1 text-caption text-fg-inverse opacity-0 shadow-md transition-opacity duration-150 group-focus-within/tt:opacity-100 group-hover/tt:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
