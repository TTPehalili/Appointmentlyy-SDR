'use client';

/**
 * Drawer property pickers (design SPEC section 3: "every row is a popover picker; no native selects") and
 * the segmented status control. A Picker is a button that opens a listbox: arrows move, Enter picks,
 * Escape closes and returns focus. State sits in data attributes (data-value) for styling and tests.
 */
import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from '@/lib/clientProjects/types';
import { StatusGlyph } from '@/components/clientProjects/shared';

export interface PickerOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

export function Picker({ id, label, value, options, onChange, testId, placeholder = 'None' }: { id: string; label: string; value: string; options: PickerOption[]; onChange: (v: string) => void; testId?: string; placeholder?: string }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const wrap = React.useRef<HTMLDivElement>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);
  React.useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    requestAnimationFrame(() => list.current?.focus());
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, options, value]);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setActive((i) => Math.min(options.length - 1, i + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(0, i - 1)));
    else if (e.key === 'Home') (e.preventDefault(), setActive(0));
    else if (e.key === 'End') (e.preventDefault(), setActive(options.length - 1));
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), options[active] && pick(options[active].value));
    else if (e.key === 'Escape' || e.key === 'Tab') (e.key === 'Escape' && e.preventDefault(), setOpen(false), btn.current?.focus());
  };
  return (
    <div className="cp-picker relative" ref={wrap} data-testid={testId} data-value={value}>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring flex h-9 w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-body text-fg hover:border-line-strong"
      >
        {current?.icon}
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-fg-tertiary')}>{current?.label ?? placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
      </button>
      {open && (
        <ul
          ref={list}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onKey}
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.value || '__none'}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              data-value={o.value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
              className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body text-fg', i === active && 'bg-subtle')}
            >
              {o.icon}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check className="size-3.5 text-fg-secondary" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The 4-up status control with the column glyphs (mirrors the board; the "Move to…" for mouse users). */
export function StatusSegments({ value, onChange, testId }: { value: string; onChange: (v: TaskStatus) => void; testId?: string }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = TASK_STATUSES.indexOf(value as TaskStatus);
    const next = e.key === 'ArrowRight' ? (i + 1) % 4 : e.key === 'ArrowLeft' ? (i + 3) % 4 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(TASK_STATUSES[next]);
    requestAnimationFrame(() => (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-value="${TASK_STATUSES[next]}"]`)?.focus());
  };
  return (
    <div role="radiogroup" aria-label="Status" onKeyDown={onKey} data-testid={testId} data-value={value} className="cp-status-seg grid grid-cols-2 gap-1 rounded-lg border border-line bg-subtle p-1 sm:grid-cols-4">
      {TASK_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          tabIndex={value === s ? 0 : -1}
          data-value={s}
          onClick={() => onChange(s)}
          className={cn('focus-ring flex h-[30px] items-center justify-center gap-1.5 rounded-md px-2 text-small font-medium', value === s ? 'border border-line bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg')}
        >
          <StatusGlyph status={s} />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
