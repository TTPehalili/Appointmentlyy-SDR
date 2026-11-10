'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { can, type Permission } from '@/lib/permissions';
import { findNavItem, type AdminNavGroup } from '@/lib/adminNav';
import AdminControlCentre from '@/components/AdminControlCentre';
import { Button, EmptyState, Skeleton, useToast } from '@/components/ui';

/** Nav groups filtered to what the current role may see (hidden, never disabled). */
export function useVisibleGroups(groups: AdminNavGroup[]): AdminNavGroup[] {
  const { role } = useSession();
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => can(role, i.permission)) }))
    .filter((g) => g.items.length > 0);
}

function SubNav({
  groups,
  title,
  tone,
  activeId,
}: {
  groups: AdminNavGroup[];
  title: string;
  tone: 'light' | 'dark';
  activeId?: string;
}) {
  const dark = tone === 'dark';
  return (
    <nav
      aria-label={title}
      className={cn(
        'hidden w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r px-3 py-6 md:flex',
        dark ? 'border-ink-800 bg-ink-950' : 'border-line bg-app',
      )}
    >
      <p className={cn('px-2 text-h3', dark ? 'text-ink-50' : 'text-fg')}>{title}</p>
      {groups.map((g) => (
        <div key={g.label}>
          <p className={cn('px-2 pb-1 text-group', dark ? 'text-ink-400' : 'text-fg-tertiary')}>{g.label}</p>
          <ul className="flex flex-col gap-px">
            {g.items.map((it) => {
              const active = it.id === activeId;
              return (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focus-ring flex h-8 items-center rounded-md px-2 text-body transition-colors duration-150',
                      dark
                        ? active
                          ? 'bg-ink-800 font-medium text-ink-50'
                          : 'text-ink-400 hover:bg-ink-800 hover:text-ink-50'
                        : active
                          ? 'bg-subtle font-medium text-fg'
                          : 'text-fg-secondary hover:bg-subtle hover:text-fg',
                    )}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Below 768px the sub-nav collapses into a section picker at the top of the content. */
function MobileSectionPicker({ groups, activeLabel }: { groups: AdminNavGroup[]; activeLabel?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b border-line px-4 py-2 md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-ring flex h-10 w-full items-center justify-between rounded-md px-2 text-body-strong text-fg"
      >
        {activeLabel ?? 'Sections'}
        <ChevronDown className={cn('size-4 text-fg-tertiary transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-3 pb-2 pt-1">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2 pb-1 text-group text-fg-tertiary">{g.label}</p>
              {g.items.map((it) => (
                <Link key={it.id} href={it.href} onClick={() => setOpen(false)} className="flex h-11 items-center rounded-md px-2 text-body text-fg-secondary">
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Friendly route guard (redesign spec 8). */
export function NoAccess({ area }: { area: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={<Lock />}
        title="You don’t have access to this page"
        description={`${area} is limited to admins. Ask your admin if you need it.`}
        action={
          <div className="flex gap-2">
            <Link
              href="/dialer"
              className="focus-ring inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3.5 text-body font-medium text-fg hover:bg-subtle"
            >
              Go to the Dialer
            </Link>
            <Button variant="primary" onClick={() => toast({ message: 'Access request sent to your admin' })}>
              Request access
            </Button>
          </div>
        }
      />
    </div>
  );
}

/**
 * Settings shell for Admin and the Platform Console: 240px sub-nav + content.
 * Sections backed by AdminControlCentre render one shared instance here, so its
 * in-memory edits survive moving between those sections.
 * DESIGN-NOTE: content is full width rather than the spec's 880px, because most
 * existing admin tools (workflows, ticket desk, CRM studio) are wide working surfaces.
 * New form-only settings pages should use SettingsTemplate / SettingsSection (880px).
 */
function SettingsShellInner({
  groups,
  title,
  tone = 'light',
  entryPermission,
  children,
}: {
  groups: AdminNavGroup[];
  title: string;
  tone?: 'light' | 'dark';
  entryPermission: Permission;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { role } = useSession();
  const visible = useVisibleGroups(groups);
  const active = findNavItem(groups, pathname);
  const allowed = can(role, entryPermission) && (!active || can(role, active.permission));

  return (
    <div className="flex min-h-0 flex-1">
      {allowed && <SubNav groups={visible} title={title} tone={tone} activeId={active?.id} />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {allowed && <MobileSectionPicker groups={visible} activeLabel={active?.label} />}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!allowed ? (
            <NoAccess area={title} />
          ) : active?.controlSection ? (
            <div className="px-4 py-6 md:px-8">
              <AdminControlCentre section={active.controlSection} />
              {/* The page segment itself renders nothing, but must stay in the tree for Next's navigation validation. */}
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

/** Suspense keeps dynamic admin routes (e.g. /admin/campaigns/[id]) prerenderable. */
export function SettingsShell(props: React.ComponentProps<typeof SettingsShellInner>) {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-0 flex-1">
          <div aria-hidden className={cn('hidden w-60 shrink-0 border-r md:block', props.tone === 'dark' ? 'border-ink-800 bg-ink-950' : 'border-line bg-app')} />
          <div className="flex flex-1 flex-col gap-3 px-8 py-6">
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      }
    >
      <SettingsShellInner {...props} />
    </React.Suspense>
  );
}
