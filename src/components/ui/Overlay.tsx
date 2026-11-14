'use client';

import * as React from 'react';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';
import { Kbd } from './Display';

/**
 * DESIGN-NOTE: Dialog and Drawer use the native <dialog> element (showModal), which gives
 * focus trapping, Esc to close, inert background and top-layer stacking with no dependency.
 */
function useModal(open: boolean, onClose: () => void) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      // React applies `autoFocus` while committing, before this effect; showModal() then moves
      // focus to the first focusable element (often the Close button). Restore React's choice.
      const prev = document.activeElement as HTMLElement | null;
      el.showModal();
      if (prev && prev !== el && el.contains(prev)) prev.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);
  const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  return { ref, onBackdrop };
}

const backdrop = 'backdrop:bg-ink-950/40 backdrop:backdrop-blur-[1px]';

const DIALOG_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-[min(1200px,calc(100%-2rem))]',
} as const;

export type DialogSize = keyof typeof DIALOG_SIZES;

/**
 * Modal dialog. Esc, backdrop click and the close button all call onClose; focus is
 * trapped inside while open and returns to the trigger on close.
 *
 * `bare`: render children as-is (no built-in header/padding/footer) for modals that keep
 * their own header layout. `title` is still required: it becomes the accessible name.
 * `dismissible={false}` ignores Esc/backdrop (use while a request is in flight).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  className,
  size = 'md',
  bare = false,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  size?: DialogSize;
  bare?: boolean;
  dismissible?: boolean;
}) {
  const guardedClose = React.useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);
  const { ref, onBackdrop } = useModal(open, guardedClose);
  const titleId = React.useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={bare ? undefined : titleId}
      aria-label={bare ? title : undefined}
      onClick={onBackdrop}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-fg shadow-lg open:animate-slide-up',
        DIALOG_SIZES[size],
        backdrop,
        className,
      )}
    >
      {open &&
        (bare ? (
          children
        ) : (
          <div className="flex flex-col">
            <div className={cn('flex items-start justify-between gap-4 px-6 pt-5', !children && 'pb-5')}>
              <div>
                <h2 id={titleId} className="text-h2 text-fg">
                  {title}
                </h2>
                {description && <div className="mt-1 text-body text-fg-secondary">{description}</div>}
              </div>
              <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
                <X className="size-4" />
              </IconButton>
            </div>
            {children && <div className="px-6 py-4">{children}</div>}
            {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </div>
        ))}
    </dialog>
  );
}

/**
 * Confirmation step for destructive or irreversible actions (brand guide: danger is
 * always an outline button with an icon, behind a confirmation).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  icon,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  icon?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            icon={icon}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/**
 * Right drawer, used for row details (Contact, Ticket, Member ...). Default 480px.
 * `bare` renders children as-is for drawers that keep their own header layout;
 * `label` is then the accessible name.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  actions,
  footer,
  children,
  width = 480,
  bare = false,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  width?: 480 | 560 | 640 | 720;
  bare?: boolean;
  label?: string;
}) {
  const { ref, onBackdrop } = useModal(open, onClose);
  const titleId = React.useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={bare ? undefined : titleId}
      aria-label={bare ? label : undefined}
      onClick={onBackdrop}
      style={{ maxWidth: width }}
      className={cn(
        'fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full border-l border-line bg-surface p-0 text-fg shadow-lg',
        'open:animate-drawer-in',
        backdrop,
      )}
    >
      {open && bare && <div className="flex h-full flex-col">{children}</div>}
      {open && !bare && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-h2 text-fg">
                {title}
              </h2>
              {subtitle && <p className="mt-0.5 truncate text-small text-fg-secondary">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <IconButton label="Close" size="sm" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Command palette (⌘K) ---------- */

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  hint?: string;
  keywords?: string;
  onRun: () => void;
}

export function CommandPalette({
  open,
  onClose,
  items,
  placeholder = 'Search leads, pages and actions',
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
}) {
  const { ref, onBackdrop } = useModal(open, onClose);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  // Reset on open: adjust state during render instead of in an effect.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
    }
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.group} ${i.keywords ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const groups = React.useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach((i) => map.set(i.group, [...(map.get(i.group) ?? []), i]));
    return Array.from(map.entries());
  }, [filtered]);

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    item.onRun();
  };

  let index = -1;
  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onClick={onBackdrop}
      className={cn(
        'mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-line bg-surface p-0 text-fg shadow-lg open:animate-slide-up',
        backdrop,
      )}
    >
      {open && (
        <div>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].id}` : undefined}
              value={query}
              placeholder={placeholder}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  run(filtered[active]);
                }
              }}
              className="h-12 w-full bg-transparent text-body text-fg outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div id={listId} role="listbox" className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 && <p className="px-3 py-6 text-center text-body text-fg-tertiary">No results</p>}
            {groups.map(([group, groupItems]) => (
              <div key={group} role="group" aria-label={group} className="pb-1">
                <p className="px-3 pb-1 pt-2 text-group text-fg-tertiary">{group}</p>
                {groupItems.map((item) => {
                  index += 1;
                  const i = index;
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(item)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body text-fg [&_svg]:size-4',
                        i === active && 'bg-selected-soft text-selected-soft-fg',
                      )}
                    >
                      {item.icon && <span className={i === active ? 'text-selected-soft-fg' : 'text-fg-secondary'}>{item.icon}</span>}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="text-small text-fg-tertiary">{item.hint}</span>}
                      {i === active && <CornerDownLeft className="text-fg-tertiary" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}

/** Opens the palette on ⌘K / Ctrl+K. */
export function useCommandShortcut(onOpen: () => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}

/* ---------- Toasts (confirmations, with optional Undo) ---------- */

interface ToastData {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

const ToastContext = React.createContext<((t: Omit<ToastData, 'id'>) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = React.useCallback(
    (t: Omit<ToastData, 'id'>) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-slide-up items-center gap-3 rounded-lg bg-inverse px-4 py-3 text-body text-fg-inverse shadow-lg ring-1 ring-fg-inverse/10"
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
                className="focus-ring rounded-sm font-medium text-fg-inverse underline underline-offset-2"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="focus-ring rounded-sm text-fg-inverse-secondary hover:text-fg-inverse"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
