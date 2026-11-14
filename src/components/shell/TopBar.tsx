'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, HelpCircle, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EmptyState, IconButton, Kbd } from '@/components/ui';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { useShell } from './ShellContext';

/**
 * Slim top bar (56px): ⌘K search · Help · Notifications · AI Copilot.
 * No brand, domain pill, clock or tenant dropdown (redesign spec 4).
 */
export function TopBar() {
  const { setPaletteOpen, copilotOpen, setCopilotOpen } = useShell();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-app px-4 md:px-6">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="focus-ring hidden h-9 w-full max-w-md items-center gap-2.5 rounded-md border border-line bg-surface px-3 text-body text-fg-tertiary transition-colors duration-150 hover:border-line-strong sm:flex"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Search leads, pages and actions</span>
        <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {/* Small screens: search collapses to an icon so every top-bar action stays reachable. */}
      <IconButton label="Search" className="sm:hidden" onClick={() => setPaletteOpen(true)}>
        <Search className="size-5 stroke-[1.5]" />
      </IconButton>
      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/help"
          aria-label="Help"
          title="Help"
          className="focus-ring inline-flex size-9 items-center justify-center rounded-md text-fg-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg"
        >
          <HelpCircle className="size-5 stroke-[1.5]" />
        </Link>
        <Notifications />
        <IconButton
          label={copilotOpen ? 'Close AI Copilot (Ctrl+J)' : 'Open AI Copilot (Ctrl+J)'}
          aria-pressed={copilotOpen}
          onClick={() => setCopilotOpen(!copilotOpen)}
          className={cn(copilotOpen && 'bg-selected-soft text-selected-soft-fg hover:bg-selected-soft')}
        >
          <Sparkles className="size-5 stroke-[1.5]" />
        </IconButton>
      </div>
    </header>
  );
}

// DESIGN-NOTE: sample notifications for the demo workspace only, until a notifications feed exists.
const DEMO_NOTIFICATIONS = [
  { id: 'n1', title: 'Julian Vance (Apex Global)', body: 'Callback confirmed for Thursday 2:00 PM' },
  { id: 'n2', title: 'Leads loaded', body: 'Your queue was refreshed with 3 accounts' },
];

function Notifications() {
  const [open, setOpen] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const isDemo = useDemoWorkspace();
  const notifications = isDemo ? DEMO_NOTIFICATIONS : [];

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = seen ? 0 : notifications.length;

  return (
    <div ref={ref} className="relative">
      <IconButton
        label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setSeen(true);
        }}
        className="relative"
      >
        <Bell className="size-5 stroke-[1.5]" />
        {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-500 ring-2 ring-app" aria-hidden />}
      </IconButton>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 animate-fade-in rounded-lg border border-line bg-surface shadow-md">
          <p className="border-b border-line px-4 py-3 text-h3 text-fg">Notifications</p>
          {notifications.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="No notifications"
              description="You're all caught up."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <p className="text-body-strong text-fg">{n.title}</p>
                  <p className="mt-0.5 text-small text-fg-secondary">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
