'use client';

import * as React from 'react';
import { Button, Field, Input, Skeleton } from '@/components/ui';
import { apiJson } from '@/lib/authClient';

/** Settings › Password: set a first password, or change it. Sign-in by email link always works too. */
export function PasswordSettings() {
  const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    apiJson<{ hasPassword: boolean }>('/api/auth/password/change').then((r) => setHasPassword(r.success ? r.hasPassword : false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (next !== confirm) return setError('The new passwords don’t match.');
    setSaving(true);
    const res = await apiJson('/api/auth/password/change', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next },
    });
    setSaving(false);
    if (!res.success) return setError(res.error || 'Could not save the password.');
    setHasPassword(true);
    setCurrent('');
    setNext('');
    setConfirm('');
    setSaved(true);
  };

  if (hasPassword === null) return <Skeleton className="h-40 w-full max-w-md" />;

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
      {hasPassword && (
        <Field label="Current password" htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      )}
      <Field label={hasPassword ? 'New password' : 'Password'} htmlFor="pw-new" hint="At least 10 characters, with letters and numbers or symbols.">
        <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="pw-confirm" error={error ?? undefined}>
        <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={saving} disabled={!next || !confirm || (hasPassword && !current)}>
          {hasPassword ? 'Change password' : 'Set password'}
        </Button>
        {saved && (
          <span role="status" className="text-small text-success-fg">
            Password saved
          </span>
        )}
      </div>
    </form>
  );
}
