'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export const fieldBase =
  'focus-ring w-full rounded-sm border border-line-strong bg-surface text-body text-fg ' +
  'transition-colors duration-150 ease-out hover:border-fg-disabled ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-disabled ' +
  'aria-invalid:border-danger-fg';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
  /** Use for phone numbers, IDs, API keys and DNS records only. */
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leadingIcon, mono, ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      className={cn(fieldBase, 'h-9 px-3', leadingIcon && 'pl-9', mono && 'font-mono text-small', className)}
      {...props}
    />
  );
  if (!leadingIcon) return input;
  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-tertiary [&_svg]:size-4">
        {leadingIcon}
      </span>
      {input}
    </div>
  );
});

export const SearchInput = React.forwardRef<HTMLInputElement, InputProps>(function SearchInput(props, ref) {
  return <Input ref={ref} type="search" leadingIcon={<Search />} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 px-3 py-2', className)} {...props} />;
  },
);

/** DESIGN-NOTE: a styled native <select> keeps full keyboard and screen-reader support with no dependency. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative w-full">
        <select ref={ref} className={cn(fieldBase, 'h-9 appearance-none pl-3 pr-9', className)} {...props}>
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary"
        />
      </div>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-body-strong text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-small text-danger-fg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-small text-fg-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  className,
  label,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & { label?: React.ReactNode }) {
  const box = (
    <span className="relative inline-flex size-4 shrink-0">
      <input
        type="checkbox"
        className={cn(
          'focus-ring peer size-4 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-surface',
          'checked:border-selected checked:bg-selected indeterminate:border-selected indeterminate:bg-selected',
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="pointer-events-none absolute inset-0.5 size-3 text-selected-fg opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
  if (!label) return box;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-body text-fg">
      {box}
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'focus-ring relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150',
        checked ? 'bg-selected' : 'bg-line-strong',
        'disabled:opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-surface shadow-xs transition-transform duration-150',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

/** Searchable single-select following the WAI-ARIA combobox pattern. */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  id,
  emptyText = 'No matches',
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  emptyText?: string;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const commit = (opt: ComboboxOption) => {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        className={cn(fieldBase, 'h-9 pl-3 pr-9')}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : selected?.label ?? ''}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && filtered[active]) {
            e.preventDefault();
            commit(filtered[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full animate-fade-in overflow-auto rounded-md border border-line bg-surface p-1 shadow-md"
        >
          {filtered.length === 0 && <li className="px-2.5 py-2 text-small text-fg-tertiary">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-body text-fg',
                i === active && 'bg-subtle', o.value === value && 'bg-selected-soft font-medium text-selected-soft-fg',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.description && <span className="block truncate text-small text-fg-tertiary">{o.description}</span>}
              </span>
              {o.value === value && <Check className="size-4 text-selected-soft-fg" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
