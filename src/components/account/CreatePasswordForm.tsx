'use client';

import React, { useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * First sign-in: everyone must create a password before using the app (no skip). Rules match the
 * server's: 10+ characters, letters plus numbers or symbols.
 */
export function CreatePasswordForm({ name, workspace, onDone }: { name: string; workspace: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('The passwords don’t match.');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not save your password. Try again.');
        return;
      }
      onDone();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'focus-ring w-full h-10 rounded-sm border border-line-strong bg-surface pl-9 pr-10 text-body text-fg placeholder:text-fg-disabled focus:outline-none';

  return (
    <form onSubmit={submit} className="space-y-4 text-left" noValidate>
      <div className="text-center">
        <div className="size-12 rounded-full bg-success-bg text-success-fg flex items-center justify-center mx-auto mb-3">
          <KeyRound className="w-6 h-6" aria-hidden />
        </div>
        <h1 className="text-h2 text-fg">Welcome{name ? `, ${name.split(' ')[0]}` : ''}! Create your password</h1>
        <p className="text-body text-fg-secondary mt-1">
          You&apos;re signed in to <span className="font-medium text-fg">{workspace}</span>. Next time, just sign in with your email and
          this password.
        </p>
      </div>
      {(['new', 'confirm'] as const).map((which) => (
        <div key={which}>
          <label htmlFor={`first-${which}`} className="block mb-1.5 text-small font-medium text-fg">
            {which === 'new' ? 'Password' : 'Confirm password'}
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
            <input
              id={`first-${which}`}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus={which === 'new'}
              value={which === 'new' ? password : confirm}
              onChange={(e) => (which === 'new' ? setPassword(e.target.value) : setConfirm(e.target.value))}
              className={inputClass}
            />
            {which === 'new' && (
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-tertiary hover:text-fg"
                aria-label={show ? 'Hide passwords' : 'Show passwords'}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      ))}
      <p className="text-small text-fg-tertiary">At least 10 characters, with letters and numbers or symbols.</p>
      {error && (
        <div role="alert" className="px-3 py-2.5 rounded-md bg-danger-bg border border-danger-fg/30 text-danger-fg text-small flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" variant="brand" size="lg" className="w-full" loading={saving} disabled={!password || !confirm}>
        Save password and continue
        {!saving && <ArrowRight aria-hidden />}
      </Button>
    </form>
  );
}
