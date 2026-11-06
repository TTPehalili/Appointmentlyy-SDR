'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, KeyRound, LogOut, Mail } from 'lucide-react';
import { cn } from '@/lib/cn';
import { changeUserPassword, useSession, type UserRole } from '@/lib/session';
import { Avatar, Button, Dialog, Field, Input } from '@/components/ui';

const ROLE_LABELS: Record<UserRole, string> = {
  Rep: 'Rep',
  Supervisor: 'Supervisor',
  Manager: 'Manager',
  Admin: 'Org admin',
  'Super Admin': 'Super admin',
};

const TEST_ROLES: UserRole[] = ['Rep', 'Supervisor', 'Manager', 'Admin', 'Super Admin'];

function avatarSrc(name: string) {
  // Kept from the old header: the founder's profile photo.
  return name.toLowerCase().includes('emil') ? '/images/emil-halili.gif' : undefined;
}

export function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { repName, email, role, updateSession, logout } = useSession();
  const [open, setOpen] = React.useState(false);
  const [pwdOpen, setPwdOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item =
    'flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-body outline-none hover:bg-subtle focus-visible:bg-subtle [&_svg]:size-4';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? `${repName} · ${ROLE_LABELS[role]}` : undefined}
        className={cn(
          'focus-ring flex h-11 w-full items-center gap-2.5 rounded-md transition-colors duration-150 hover:bg-subtle',
          collapsed ? 'justify-center' : 'px-2',
        )}
      >
        <Avatar name={repName} src={avatarSrc(repName)} size="sm" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-body-strong text-fg">{repName}</span>
              <span className="block truncate text-small text-fg-tertiary">{ROLE_LABELS[role]}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-0 z-50 mb-1 w-64 animate-fade-in rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-2 pb-2 pt-1.5">
            <Avatar name={repName} src={avatarSrc(repName)} />
            <div className="min-w-0">
              <p className="truncate text-body-strong text-fg">{repName}</p>
              <p className="truncate text-small text-fg-tertiary">{email}</p>
            </div>
          </div>

          {/* DESIGN-NOTE: role switching is a testing aid carried over from the old header. Remove before GA. */}
          <p className="px-2 pb-0.5 pt-2 text-group text-fg-tertiary">View as role (testing)</p>
          {TEST_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={role === r}
              onClick={() => {
                updateSession({ role: r });
                setOpen(false);
              }}
              className={cn(item, 'text-fg')}
            >
              <span className="flex-1">{ROLE_LABELS[r]}</span>
              {role === r && <Check className="text-fg-secondary" aria-hidden />}
            </button>
          ))}

          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPwdOpen(true);
              }}
              className={cn(item, 'text-fg')}
            >
              <KeyRound className="text-fg-secondary" aria-hidden />
              Change password
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push('/login?tab=email');
              }}
              className={cn(item, 'text-fg')}
            >
              <Mail className="text-fg-secondary" aria-hidden />
              Send a login email
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className={cn(item, 'text-fg')}
            >
              <LogOut className="text-fg-secondary" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}

      <ChangePasswordDialog open={pwdOpen} onClose={() => setPwdOpen(false)} email={email} />
    </div>
  );
}

function ChangePasswordDialog({ open, onClose, email }: { open: boolean; onClose: () => void; email: string }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setDone(false);
    onClose();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = changeUserPassword(email, current, next, confirm);
    if (!res.ok) {
      setError(res.error || 'Couldn’t update the password.');
      return;
    }
    setError(null);
    setDone(true);
    setTimeout(close, 1100);
  };

  return (
    <Dialog open={open} onClose={close} title="Change password" description={email}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Current password" htmlFor="pwd-current">
          <Input id="pwd-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pwd-new" hint="At least 8 characters.">
          <Input id="pwd-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="pwd-confirm" error={error ?? undefined}>
          <Input id="pwd-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!error || undefined} />
        </Field>
        {done && (
          <p role="status" className="text-small text-success-fg">
            Password updated.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Update password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
