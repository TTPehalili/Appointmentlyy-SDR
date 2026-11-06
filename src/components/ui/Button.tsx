import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'brand' | 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'focus-ring inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium ' +
  'transition-colors duration-150 ease-out select-none ' +
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

const variants: Record<ButtonVariant, string> = {
  // The ONE hero action per screen.
  brand: 'border-transparent bg-action-brand text-action-brand-fg hover:bg-action-brand-hover',
  // Default primary (ink).
  primary: 'border-transparent bg-action text-action-fg hover:bg-action-hover',
  secondary: 'border-line-strong bg-surface text-fg hover:bg-subtle',
  ghost: 'border-transparent bg-transparent text-fg-secondary hover:bg-subtle hover:text-fg',
  // Destructive: outline only, always pair with an icon and a confirmation step.
  danger: 'border-danger-fg/40 bg-surface text-danger-fg hover:bg-danger-bg',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-9 px-3.5 text-body',
  lg: 'h-11 px-5 text-body',
};

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon rendered before the label. */
  icon?: React.ReactNode;
  /** Shortcut hint rendered after the label, e.g. "1" or "⌘K". */
  shortcut?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, shortcut, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
      {shortcut && (
        <kbd className="ml-1 font-sans text-caption opacity-60" aria-hidden>
          {shortcut}
        </kbd>
      )}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon buttons need an accessible name. */
  label: string;
  variant?: Exclude<ButtonVariant, 'brand'> | 'brand';
  size?: ButtonSize;
}

const iconSizes: Record<ButtonSize, string> = { sm: 'size-8', md: 'size-9', lg: 'size-11' };

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], iconSizes[size], 'px-0', className)}
      {...props}
    >
      {children}
    </button>
  );
});
