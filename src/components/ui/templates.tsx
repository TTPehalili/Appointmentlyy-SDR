import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * Page templates (redesign spec 5.3). Every screen uses exactly one.
 * DESIGN-NOTE: content width is standardised at 1440px for List, Board and Dashboard,
 * 880px for Settings content and 720px for Wizards. Split and Canvas are full width.
 */

const pagePad = 'px-4 py-6 md:px-8';

/** List: PageHeader → FilterBar → DataTable → row click opens a Drawer. */
export function ListTemplate({
  header,
  filters,
  children,
  className,
}: {
  header: React.ReactNode;
  filters?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1440px]', pagePad, className)}>
      {header}
      {filters && <div className="mb-4">{filters}</div>}
      {children}
    </div>
  );
}

/** Board: PageHeader → FilterBar → horizontal 280px columns. */
export function BoardTemplate({
  header,
  filters,
  summary,
  children,
}: {
  header: React.ReactNode;
  filters?: React.ReactNode;
  /** Plain stats strip, e.g. Total pipeline · Meetings · Weighted value. */
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', pagePad)}>
      {header}
      {summary && <div className="mb-4">{summary}</div>}
      {filters && <div className="mb-4">{filters}</div>}
      <div className="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">{children}</div>
    </div>
  );
}

export function BoardColumn({
  title,
  count,
  value,
  children,
}: {
  title: string;
  count: number;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex w-[280px] shrink-0 flex-col rounded-lg bg-subtle">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-body-strong text-fg">{title}</h3>
          <span className="text-caption tabular-nums text-fg-tertiary">{count}</span>
        </div>
        {value && <span className="text-small tabular-nums text-fg-secondary">{value}</span>}
      </header>
      <div className="flex flex-col gap-2 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}

/** Workspace (split): left main (flex) + right 360px context rail. */
export function SplitTemplate({
  header,
  main,
  rail,
  footer,
}: {
  header?: React.ReactNode;
  main: React.ReactNode;
  rail?: React.ReactNode;
  /** Sticky bottom bar, e.g. the Dialer outcome bar. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {header && <div className="border-b border-line px-4 py-3 md:px-6">{header}</div>}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{main}</div>
        {rail && (
          <aside className="w-full shrink-0 overflow-y-auto border-t border-line bg-surface lg:w-[360px] lg:border-l lg:border-t-0">
            {rail}
          </aside>
        )}
      </div>
      {footer && <div className="sticky bottom-0 z-20 border-t border-line bg-surface px-4 py-3 md:px-6">{footer}</div>}
    </div>
  );
}

/** Dashboard: PageHeader with date-range → KPI row (max 5) → 2-col charts → table. */
export function DashboardTemplate({
  header,
  kpis,
  charts,
  children,
}: {
  header: React.ReactNode;
  kpis?: React.ReactNode;
  charts?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[1440px] flex-col gap-6', pagePad)}>
      <div className="-mb-6">{header}</div>
      {kpis && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{kpis}</div>}
      {charts && <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{charts}</div>}
      {children}
    </div>
  );
}

/** Settings: 240px admin sub-nav + form sections (label left, controls right), sticky save bar when dirty. */
export function SettingsTemplate({
  nav,
  header,
  children,
  saveBar,
}: {
  nav: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  saveBar?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1">
      <nav aria-label="Admin" className="hidden w-60 shrink-0 overflow-y-auto border-r border-line px-3 py-6 md:block">
        {nav}
      </nav>
      <div className="relative min-w-0 flex-1 overflow-y-auto">
        <div className={cn('max-w-[880px]', pagePad)}>
          {header}
          <div className="flex flex-col divide-y divide-line">{children}</div>
        </div>
        {saveBar}
      </div>
    </div>
  );
}

export function SettingsNav({
  groups,
  active,
  onSelect,
}: {
  groups: { label: string; items: { id: string; label: string }[] }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2 pb-1 text-group text-fg-tertiary">{g.label}</p>
          <ul className="flex flex-col gap-px">
            {g.items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onSelect(it.id)}
                  aria-current={active === it.id ? 'page' : undefined}
                  className={cn(
                    'focus-ring flex h-8 w-full items-center rounded-md px-2 text-left text-body transition-colors duration-150',
                    active === it.id ? 'bg-subtle font-medium text-fg' : 'text-fg-secondary hover:bg-subtle hover:text-fg',
                  )}
                >
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 py-6 md:grid-cols-[240px_1fr] md:gap-8">
      <div>
        <h2 className="text-h3 text-fg">{title}</h2>
        {description && <p className="mt-1 text-small text-fg-secondary">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function StickySaveBar({ dirty, children }: { dirty: boolean; children: React.ReactNode }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 z-20 flex animate-slide-up items-center justify-between gap-4 border-t border-line bg-surface px-4 py-3 md:px-8">
      <span className="text-body text-fg-secondary">You have unsaved changes</span>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

/** Canvas: full-bleed with minimal floating toolbars. */
export function CanvasTemplate({
  toolbar,
  palette,
  children,
}: {
  toolbar?: React.ReactNode;
  palette?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-app">
      {children}
      {toolbar && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-md">
          {toolbar}
        </div>
      )}
      {palette && (
        <div className="absolute bottom-3 left-3 top-16 z-10 w-60 overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-md">
          {palette}
        </div>
      )}
    </div>
  );
}

/** Wizard: centered 720px, Stepper, one question per step. */
export function WizardTemplate({
  header,
  stepper,
  children,
  footer,
}: {
  header?: React.ReactNode;
  stepper: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[720px] flex-col gap-6', pagePad)}>
      {header}
      {stepper}
      <div className="rounded-lg border border-line bg-surface p-6 shadow-xs">{children}</div>
      <div className="flex items-center justify-between gap-2">{footer}</div>
    </div>
  );
}
