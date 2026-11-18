'use client';

/** The owner's inbox: client actions, defects, @mentions of our people and assignments, across projects. */
import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import { fmtAt, type CpNotification } from '@/lib/clientProjects/types';
import { actorLabel } from '@/components/clientProjects/eventText';

const KIND_LABEL: Record<CpNotification['kind'], string> = { client_action: 'Client', defect: 'Defect', mention: 'Mention', assignment: 'Assigned' };

export function NotificationsBell({ projectId }: { projectId?: string }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<{ items: CpNotification[]; unread: number } | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const load = React.useCallback(async () => {
    const r = await apiJson<{ items: CpNotification[]; unread: number }>('/api/client-projects/notifications?limit=40');
    if (r.success) setData({ items: r.items, unread: r.unread });
  }, []);
  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const seen = async () => {
    await apiJson('/api/client-projects/notifications', { body: {} });
    await load();
  };
  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="cp-bell"
        data-unread={unread}
        className="focus-ring relative inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface text-fg-secondary hover:text-fg"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && <span className="cp-mono absolute -right-1 -top-1 min-w-4 rounded-full bg-action-brand px-1 text-[10px] leading-4 text-action-brand-fg">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-[min(380px,90vw)] overflow-hidden rounded-lg border border-line bg-surface shadow-lg" data-testid="cp-inbox">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-body-strong text-fg">Notifications</p>
            <Button variant="ghost" size="sm" onClick={() => void seen()} disabled={!unread} data-testid="cp-inbox-seen">
              Mark all read
            </Button>
          </div>
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {!data?.items.length && <li className="px-3 py-6 text-center text-small text-fg-tertiary">Nothing new.</li>}
            {data?.items.map((n) => (
              <li key={n.id} data-testid="cp-inbox-item" data-kind={n.kind} data-unread={n.unread ? '1' : '0'} className={cn('px-3 py-2', n.unread && 'bg-selected-soft/40')}>
                <Link href={`/platform/client-projects/${n.projectId}`} className="focus-ring block rounded-sm" onClick={() => setOpen(false)}>
                  <p className="flex items-center gap-2 text-caption text-fg-tertiary">
                    <span className="font-medium text-fg-secondary">{KIND_LABEL[n.kind]}</span>
                    {!projectId || projectId !== n.projectId ? <span>{n.clientName}</span> : null}
                    <span className="cp-mono ml-auto">{fmtAt(n.at)}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-small text-fg">{n.text}</p>
                  <p className="text-caption text-fg-tertiary">{actorLabel(n.actor)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
