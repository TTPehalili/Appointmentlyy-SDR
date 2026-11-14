'use client';

import * as React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Checkbox, SearchInput } from './Input';
import { Skeleton } from './Display';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  /** Tailwind width class, e.g. "w-40". */
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Hover-only row actions: at most 2 icons plus a `⋯` Menu. */
  rowActions?: (row: T) => React.ReactNode;
  /** Passing bulkActions turns on the checkbox column and the bottom bulk bar. */
  bulkActions?: (selected: string[], clear: () => void) => React.ReactNode;
  density?: 'comfortable' | 'compact';
  loading?: boolean;
  empty?: React.ReactNode;
  label: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowActions,
  bulkActions,
  density = 'comfortable',
  loading,
  empty,
  label,
}: DataTableProps<T>) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const selectable = !!bulkActions;
  const allKeys = rows.map(rowKey);
  const allSelected = selected.length > 0 && selected.length === allKeys.length;
  const someSelected = selected.length > 0 && !allSelected;
  const rowH = density === 'compact' ? 'h-10' : 'h-12';
  const clear = () => setSelected([]);

  const headerCheckbox = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-body tabular-nums" aria-label={label}>
          <thead>
            <tr className="h-9 bg-subtle">
              {selectable && (
                <th scope="col" className="w-10 pl-4">
                  <Checkbox
                    ref={headerCheckbox}
                    aria-label="Select all rows"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : allKeys)}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'px-4 text-caption text-fg-tertiary first:pl-4',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    c.width,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="w-24">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk${i}`} className={cn(rowH, 'border-t border-line')}>
                  {selectable && <td className="pl-4" />}
                  {columns.map((c) => (
                    <td key={c.key} className="px-4">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                  {rowActions && <td />}
                </tr>
              ))}
            {!loading &&
              rows.map((row) => {
                const k = rowKey(row);
                const isSel = selected.includes(k);
                return (
                  <tr
                    key={k}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={selectable ? isSel : undefined}
                    className={cn(
                      'group/row border-t border-line transition-colors duration-150 focus-visible:bg-subtle focus-visible:outline-none',
                      rowH,
                      onRowClick && 'cursor-pointer hover:bg-subtle',
                      isSel && 'bg-selected-soft hover:bg-selected-soft',
                    )}
                  >
                    {selectable && (
                      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox aria-label="Select row" checked={isSel} onChange={() => toggle(k)} />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('px-4 text-fg', c.align === 'right' && 'text-right', c.width)}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="pr-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                          {rowActions(row)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && empty}
      </div>

      {selectable && selected.length > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="sticky bottom-4 z-30 mx-auto mt-3 flex w-fit animate-slide-up items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pl-4 pr-1.5 shadow-lg"
        >
          <span className="text-body-strong tabular-nums text-fg">{selected.length} selected</span>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {bulkActions(selected, clear)}
          <Button variant="ghost" size="sm" onClick={clear} icon={<X />}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

/** Search plus up to three filters plus "More filters". */
export function FilterBar({
  search,
  onSearch,
  searchPlaceholder = 'Search',
  filters,
  onMoreFilters,
  end,
  className,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** Max 3. Put the rest behind "More filters". */
  filters?: React.ReactNode;
  onMoreFilters?: () => void;
  /** Right-aligned extras such as a view toggle or density switch. */
  end?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {onSearch && (
        <div className="w-full sm:w-72">
          <SearchInput
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}
      {filters}
      {onMoreFilters && (
        <Button variant="ghost" size="md" icon={<SlidersHorizontal />} onClick={onMoreFilters}>
          More filters
        </Button>
      )}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}

/** Compact filter trigger, e.g. "Status: All · 128". */
export function FilterChip({
  label,
  value,
  onClick,
  active,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-body transition-colors duration-150',
        active ? 'border-selected bg-selected text-selected-fg' : 'border-line-strong bg-surface text-fg-secondary hover:text-fg',
      )}
    >
      <span>{label}</span>
      {value && <span className={cn('font-medium', active ? 'text-selected-fg' : 'text-fg')}>{value}</span>}
    </button>
  );
}
