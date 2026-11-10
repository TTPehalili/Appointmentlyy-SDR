'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw, Sparkles, Wrench, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useServerAuth } from '@/lib/authClient';
import type { ActiveAnnouncement, AnnouncementKind } from '@/lib/announcements';

export const ANNOUNCEMENT_KIND_META: Record<
  AnnouncementKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; tile: string; accent: string }
> = {
  feature: { label: 'New feature', icon: Sparkles, tile: 'bg-selected text-brand-text', accent: 'bg-brand-500' },
  update: { label: 'Update', icon: RefreshCw, tile: 'bg-success-bg text-success-fg', accent: 'bg-success-500' },
  maintenance: { label: 'Maintenance', icon: Wrench, tile: 'bg-warning-bg text-warning-fg', accent: 'bg-warning-400' },
};

type RibbonContent = Pick<ActiveAnnouncement, 'title' | 'message' | 'linkUrl' | 'linkLabel' | 'kind'>;

/** The ribbon itself (also used as the live preview in Platform Console › Announcements). */
export function AnnouncementRibbonView({
  announcement: a,
  onDismiss,
  className,
}: {
  announcement: RibbonContent;
  onDismiss: () => void;
  className?: string;
}) {
  const meta = ANNOUNCEMENT_KIND_META[a.kind] ?? ANNOUNCEMENT_KIND_META.update;
  const Icon = meta.icon;
  const linkClass =
    'focus-ring inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-small font-medium text-brand-text underline-offset-2 hover:underline';
  const label = a.linkLabel || 'Learn more';
  return (
    <div className={cn('shrink-0 px-3 pt-2 md:px-4', className)}>
      <div
        role="status"
        className="relative flex max-h-14 min-h-11 w-full items-center gap-3 overflow-hidden rounded-lg border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-sm motion-safe:animate-slide-up"
      >
        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', meta.accent)} />
        <span aria-hidden className={cn('hidden size-7 shrink-0 items-center justify-center rounded-md sm:flex', meta.tile)}>
          <Icon className="size-4" />
        </span>
        <p className="line-clamp-2 min-w-0 flex-1 text-small leading-5 text-fg-secondary">
          <span className="sr-only">{meta.label}: </span>
          <span className="font-medium text-fg">{a.title || 'Title'}</span>
          <span aria-hidden className="mx-1.5 text-fg-tertiary">
            ·
          </span>
          {a.message || 'Message'}
        </p>
        {a.linkUrl &&
          (a.linkUrl.startsWith('/') ? (
            <Link href={a.linkUrl} className={linkClass}>
              {label}
            </Link>
          ) : (
            <a href={a.linkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {label}
              <ArrowUpRight className="size-3.5" aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        <IconButton label="Dismiss announcement" size="sm" onClick={onDismiss} className="shrink-0">
          <X className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

const REFRESH_MS = 5 * 60 * 1000;
const FOCUS_MIN_GAP_MS = 20 * 1000;
const dismissedKey = (email: string) => `appy_announce_dismissed:${email}`;

function readDismissed(email: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(dismissedKey(email)) || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

interface RibbonState {
  email: string;
  items: ActiveAnnouncement[];
  dismissed: string[];
}

/**
 * Platform announcements for the signed-in person: the newest live one they haven't closed.
 * Closing hides it for good on this browser (per email). Refreshes every 5 minutes and when
 * the window regains focus, so scheduled announcements appear without a reload.
 */
export function AnnouncementRibbon({ className }: { className?: string }) {
  const server = useServerAuth();
  const { email: localEmail } = useSession();
  const email = (server.identity?.email || localEmail || '').trim().toLowerCase();
  const [state, setState] = React.useState<RibbonState>({ email: '', items: [], dismissed: [] });
  const lastFetch = React.useRef(0);

  React.useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const load = async () => {
      lastFetch.current = Date.now();
      try {
        const res = await fetch('/api/announcements/active', { cache: 'no-store', credentials: 'same-origin' });
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) setState({ email, items: [], dismissed: [] });
          return;
        }
        const data = (await res.json()) as { announcements?: ActiveAnnouncement[] };
        if (cancelled) return;
        setState({ email, items: Array.isArray(data.announcements) ? data.announcements : [], dismissed: readDismissed(email) });
      } catch {
        // Offline or server hiccup: keep what we have and try again on the next tick.
      }
    };
    void Promise.resolve().then(load);
    const timer = window.setInterval(load, REFRESH_MS);
    const onFocus = () => {
      if (Date.now() - lastFetch.current > FOCUS_MIN_GAP_MS) void load();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [email]);

  const current = state.email === email ? state.items.find((a) => !state.dismissed.includes(a.id)) : undefined;
  if (!current) return null;

  const dismiss = () => {
    const next = [...readDismissed(email).filter((id) => id !== current.id), current.id].slice(-200);
    try {
      localStorage.setItem(dismissedKey(email), JSON.stringify(next));
    } catch {
      // Storage full or blocked: still hide it for this visit.
    }
    setState((s) => ({ ...s, dismissed: next }));
  };

  return <AnnouncementRibbonView key={current.id} announcement={current} onDismiss={dismiss} className={className} />;
}
