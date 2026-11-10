'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isNavItemActive } from '@/lib/nav';
import { Drawer } from '@/components/ui';
import { useVisibleNav } from './useVisibleNav';
import { ProfileMenu } from './ProfileMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const PRIMARY = ['dialer', 'inbox', 'contacts', 'pipeline'];

/** Below 768px the sidebar becomes a bottom tab bar: Home, Dialer, Inbox, Contacts, More. */
export function MobileTabBar() {
  const pathname = usePathname();
  const items = useVisibleNav();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const primary = PRIMARY.map((id) => items.find((i) => i.id === id)).filter((i) => !!i);
  const rest = items.filter((i) => !PRIMARY.includes(i.id));
  const moreActive = rest.some((i) => isNavItemActive(i, pathname));

  const tab = 'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-caption';

  return (
    <>
      <nav aria-label="Main" className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(tab, active ? 'text-fg' : 'text-fg-tertiary')}
            >
              <Icon className={cn('size-5 stroke-[1.5]', active && 'text-brand-text')} aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)} className={cn(tab, moreActive ? 'text-fg' : 'text-fg-tertiary')}>
          <MoreHorizontal className={cn('size-5 stroke-[1.5]', moreActive && 'text-brand-text')} aria-hidden />
          More
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="-mx-2 flex flex-col gap-4">
          <WorkspaceSwitcher collapsed={false} />
          <ul className="flex flex-col gap-px">
            {rest.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(item, pathname);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-11 items-center gap-3 rounded-md px-2.5 text-body',
                      active ? 'bg-subtle font-medium text-fg' : 'text-fg-secondary',
                    )}
                  >
                    <Icon className="size-5 stroke-[1.5]" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <ProfileMenu collapsed={false} />
        </div>
      </Drawer>
    </>
  );
}
