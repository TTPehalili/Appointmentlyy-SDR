'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button, buttonClasses } from '@/components/ui';
import { setStoredSession } from '@/lib/session';
import { claimTenantStorage } from '@/lib/tenantStorage';
import AuthBackdrop from '@/components/auth/AuthBackdrop';

/** Opened from the "reset your password" email: choose a new password, then go straight in. */
function ResetPasswordContent() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(!token);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('The passwords don’t match.');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 401 || res.status === 403) setLinkDead(true);
        setError(data.error || 'Could not reset your password.');
        return;
      }
      const user = data.identity;
      claimTenantStorage(user.email, user.tenantCode);
      setStoredSession({
        email: user.email,
        role: user.role,
        tenantName: user.tenantName,
        tenantCode: user.tenantCode,
        repName: user.repName,
        isAuthenticated: true,
      });
      router.replace(user.role === 'Super Admin' || user.role === 'Admin' ? '/admin' : '/dialer');
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'focus-ring w-full h-10 rounded-sm border border-line-strong bg-surface pl-9 pr-10 text-body text-fg placeholder:text-fg-disabled focus:outline-none';

  return (
    <div className="relative isolate overflow-hidden min-h-screen bg-app text-fg flex flex-col justify-between font-sans px-4">
      <AuthBackdrop />
      <header className="w-full max-w-md mx-auto pt-10 pb-3 flex items-center justify-center">
        <img src="/appointmentlyy-logo.png" alt="Appointmentlyy" className="h-8 w-auto object-contain" />
      </header>
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-surface rounded-xl p-8 border border-line shadow-xs">
          {linkDead ? (
            <div className="space-y-4 text-center">
              <div className="size-12 rounded-full bg-danger-bg text-danger-fg flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <h1 className="text-h2 text-fg">This reset link can’t be used</h1>
                <p className="text-body text-fg-secondary mt-1">
                  {error || 'The link is missing or has expired.'} Reset links work once and expire after 30 minutes.
                </p>
              </div>
              <Link href="/login" className={buttonClasses('primary', 'lg', 'w-full')}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <h1 className="text-h1 text-fg">Choose a new password</h1>
                <p className="text-body text-fg-secondary mt-1">At least 10 characters, with letters and numbers or symbols.</p>
              </div>
              {(['new', 'confirm'] as const).map((which) => (
                <div key={which}>
                  <label htmlFor={`reset-${which}`} className="block mb-1.5 text-small font-medium text-fg">
                    {which === 'new' ? 'New password' : 'Confirm new password'}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                    <input
                      id={`reset-${which}`}
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
              {error && (
                <div role="alert" className="px-3 py-2.5 rounded-md bg-danger-bg border border-danger-fg/30 text-danger-fg text-small flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" variant="brand" size="lg" className="w-full" loading={busy} disabled={!password || !confirm}>
                Save password and sign in
                {!busy && <ArrowRight aria-hidden />}
              </Button>
            </form>
          )}
        </div>
      </main>
      <footer className="w-full max-w-md mx-auto py-6 text-center text-caption text-fg-tertiary">© 2026 Appointmentlyy</footer>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
