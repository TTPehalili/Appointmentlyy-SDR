'use client';

import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './Button';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

/** Arrow-key navigation shared by Tabs and SegmentedControl. */
function useRovingKeys(items: { value: string }[], value: string, onChange: (v: string) => void) {
  return (e: React.KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next].value);
      const list = e.currentTarget as HTMLElement;
      requestAnimationFrame(() => list.querySelector<HTMLElement>(`[data-value="${items[next].value}"]`)?.focus());
    }
  };
}

/** Underline tabs for page sub-views. Render the panel yourself based on `value`. */
export function Tabs({
  items,
  value,
  onChange,
  className,
  label = 'Sections',
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}) {
  const onKeyDown = useRovingKeys(items, value, onChange);
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex gap-5 border-b border-line', className)}>
      {items.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            data-value={t.value}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={cn(
              'focus-ring -mb-px inline-flex h-10 items-center gap-1.5 rounded-t-sm border-b-2 text-body transition-colors duration-150',
              selected ? 'border-action text-fg font-medium' : 'border-transparent text-fg-secondary hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="text-caption tabular-nums text-fg-tertiary">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl({
  items,
  value,
  onChange,
  size = 'md',
  className,
  label,
}: {
  items: { value: string; label: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  label: string;
}) {
  const onKeyDown = useRovingKeys(items, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('inline-flex rounded-md border border-line bg-subtle p-0.5', className)}
    >
      {items.map((it) => {
        const selected = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            data-value={it.value}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(it.value)}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded-[6px] px-3 font-medium transition-colors duration-150',
              size === 'sm' ? 'h-7 text-small' : 'h-8 text-body',
              selected ? 'bg-surface text-fg shadow-xs' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  shortcut?: string;
  /** Shown but not selectable (skipped by arrow keys). */
  disabled?: boolean;
}

/** The `⋯` overflow menu used for progressive disclosure everywhere. */
export function Menu({
  items,
  trigger,
  align = 'end',
  label = 'More actions',
}: {
  items: (MenuItem | 'divider')[];
  trigger?: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => React.ReactNode;
  align?: 'start' | 'end';
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<React.CSSProperties>({ visibility: 'hidden' });
  const ref = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Fixed positioning so the menu is never clipped by scrolling columns/tables; flips up
  // when there's no room below and caps its height to the viewport.
  React.useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const r = ref.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const gap = 4;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const flip = h > below && above > below;
    const room = flip ? above : below;
    setPos({
      position: 'fixed',
      maxHeight: Math.max(160, room),
      ...(flip ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
      ...(align === 'end' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
    });
  }, [open, align]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // A fixed menu would drift from its trigger on scroll/resize: close instead.
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus());
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
    }
  };

  const triggerProps = {
    onClick: () => {
      setPos({ visibility: 'hidden' });
      setOpen((o) => !o);
    },
    'aria-expanded': open,
    'aria-haspopup': 'menu' as const,
  };

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <IconButton label={label} size="sm" {...triggerProps}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      )}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={pos}
          className="fixed z-50 w-max min-w-48 max-w-80 animate-fade-in overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-md"
        >
          {items.map((it, i) =>
            it === 'divider' ? (
              <div key={`d${i}`} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={`${i}-${it.label}`}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-body outline-none',
                  'hover:bg-subtle focus:bg-subtle [&_svg]:size-4',
                  'disabled:pointer-events-none disabled:opacity-50',
                  it.danger ? 'text-danger-fg' : 'text-fg',
                )}
              >
                {it.icon && <span className={it.danger ? '' : 'text-fg-secondary'}>{it.icon}</span>}
                <span className="flex-1">{it.label}</span>
                {it.shortcut && <span className="text-caption text-fg-tertiary">{it.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
