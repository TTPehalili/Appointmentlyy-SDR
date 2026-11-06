'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/outreach/email', label: 'Cold email' },
  { href: '/outreach/linkedin', label: 'LinkedIn' },
];

/** Outreach = Cold Email Studio + LinkedIn Studio, switched by underline tabs (redesign spec 3.3). */
export default function OutreachLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Outreach" className="flex shrink-0 gap-5 border-b border-line px-4 md:px-8">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'focus-ring -mb-px inline-flex h-11 items-center rounded-t-sm border-b-2 text-body transition-colors duration-150',
                active ? 'border-action font-medium text-fg' : 'border-transparent text-fg-secondary hover:text-fg',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
