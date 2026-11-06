import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Identical on every page (redesign spec 5.2):
 *   [Title h1] [count]                      [secondary actions] [ONE primary]
 *   [One-line description, max 80 chars]
 *   [Tabs, if the page has sub-views]
 * No eyebrow labels, hero bars or icon tiles before titles.
 */
export function PageHeader({
  title,
  count,
  description,
  secondaryActions,
  primaryAction,
  meta,
  tabs,
  className,
}: {
  title: string;
  count?: number;
  description?: string;
  /** Secondary, outline or ghost buttons, and the `⋯` Menu. */
  secondaryActions?: React.ReactNode;
  /** The single brand action for the screen. */
  primaryAction?: React.ReactNode;
  /** Slim inline info next to the actions, e.g. a quota meter or a date-range segment. */
  meta?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4', tabs ? 'pb-0' : 'pb-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-h1 text-fg">{title}</h1>
            {count !== undefined && (
              <span className="rounded-sm bg-subtle px-1.5 text-caption tabular-nums leading-5 text-fg-secondary">
                {count.toLocaleString()}
              </span>
            )}
          </div>
          {description && <p className="mt-1 max-w-[80ch] text-body text-fg-secondary">{description}</p>}
        </div>
        {(meta || secondaryActions || primaryAction) && (
          <div className="flex flex-wrap items-center gap-2">
            {meta}
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
      {tabs && <div className="pb-6">{tabs}</div>}
    </header>
  );
}
