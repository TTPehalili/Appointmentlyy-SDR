'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isNavItemActive, NAV_GROUP_LABELS, type NavGroup, type NavItem } from '@/lib/nav';
import { Kbd } from '@/components/ui';
import { useShell } from './ShellContext';
import { useVisibleNav } from './useVisibleNav';
import { WorkspaceSwitcher, useWhiteLabel } from './WorkspaceSwitcher';
import { ProfileMenu } from './ProfileMenu';

const GROUP_ORDER: NavGroup[] = ['main', 'prospect', 'improve', 'team'];

function NavLink({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      data-tour={item.id}
      className={cn(
        'focus-ring relative flex h-9 items-center gap-3 rounded-md text-body transition-colors duration-150',
        collapsed ? 'mx-auto w-10 justify-center' : 'px-2.5',
        active ? 'bg-subtle font-medium text-fg' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
      )}
    >
      {active && <span className="absolute inset-y-2 -left-2 w-0.5 rounded-full bg-brand-500" aria-hidden />}
      <Icon className={cn('size-5 shrink-0 stroke-[1.5]', active ? 'text-brand-text' : 'text-fg-secondary')} aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed: savedCollapsed, toggleCollapsed } = useShell();
  // Admin and the Platform Console bring their own 240px sub-nav, so the main sidebar becomes an icon rail.
  const inSettings = pathname.startsWith('/admin') || pathname.startsWith('/platform');
  const collapsed = savedCollapsed || inSettings;
  const items = useVisibleNav();
  const whiteLabel = useWhiteLabel();
  // Brand guide 4: tenant logos replace ours; our name appears only in this footer, and tenants can hide it.
  const showPoweredBy = !!whiteLabel && !whiteLabel.branding.hidePoweredByBadge;

  const groups = GROUP_ORDER.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter(
    (g) => g.items.length > 0,
  );
  const footer = items.filter((i) => i.group === 'footer');

  return (
    <aside
      aria-label="Main"
      className={cn(
        'hidden shrink-0 flex-col border-r border-line bg-app transition-[width] duration-150 ease-out md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-1 pb-2 pt-3', collapsed ? 'flex-col px-2' : 'px-3')}>
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar  [' : 'Collapse sidebar  ['}
          className="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-tertiary transition-colors duration-150 hover:bg-subtle hover:text-fg"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className={cn('flex flex-1 flex-col gap-4 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}>
        {groups.map(({ group, items: groupItems }) => (
          <div key={group} className="flex flex-col gap-px">
            {NAV_GROUP_LABELS[group] &&
              (collapsed ? (
                <span className="mx-auto my-1 h-px w-6 bg-line" aria-hidden />
              ) : (
                <p className="px-2.5 pb-1 text-group text-fg-tertiary">{NAV_GROUP_LABELS[group]}</p>
              ))}
            {groupItems.map((item) => (
              <NavLink key={item.id} item={item} collapsed={collapsed} active={isNavItemActive(item, pathname)} />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn('flex flex-col gap-px border-t border-line pb-3 pt-2', collapsed ? 'px-2' : 'px-3')}>
        {footer.map((item) => (
          <NavLink key={item.id} item={item} collapsed={collapsed} active={isNavItemActive(item, pathname)} />
        ))}
        <div className="mt-1" data-tour="profile">
          <ProfileMenu collapsed={collapsed} />
        </div>
        {!collapsed && (
          <p className="flex items-center gap-1.5 px-2.5 pt-1 text-caption text-fg-tertiary">
            <Kbd>[</Kbd> to collapse
          </p>
        )}
        {showPoweredBy && !collapsed && (
          <p className="flex items-center gap-1.5 px-2.5 pt-2 text-caption text-fg-tertiary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/appointmentlyy-mark.png" alt="" className="size-3.5 rounded-[3px] bg-ink-900 p-px" />
            Powered by Appointmentlyy
          </p>
        )}
      </div>
    </aside>
  );
}
