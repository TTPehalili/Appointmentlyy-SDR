'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { setStoredSession, UserRole } from '@/lib/session';
import { claimTenantStorage } from '@/lib/tenantStorage';
import { Badge, Button, buttonClasses } from '@/components/ui';

function VerifyLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [identity, setIdentity] = useState<{
    email: string;
    role: UserRole;
    tenantName: string;
    tenantCode: string;
    repName: string;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing authentication token. Please request a fresh login link.');
      return;
    }

    let cancelled = false;
    async function verify() {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.success || !data.identity) {
          setStatus('error');
          setErrorMessage(data.error || 'This login link is invalid or has expired.');
          return;
        }

        const user = data.identity;
        setIdentity(user);
        // Wipe anything a previous person or workspace left in this browser before adopting the new identity.
        claimTenantStorage(user.email, user.tenantCode);
        setStoredSession({
          email: user.email,
          role: user.role,
          tenantName: user.tenantName,
          tenantCode: user.tenantCode,
          repName: user.repName,
          isAuthenticated: true,
        });
        setStatus('success');

        setTimeout(() => {
          if (user.role === 'Super Admin' || user.role === 'Admin') {
            router.push('/admin');
          } else {
            router.push('/dialer');
          }
        }, 1100);
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage('Could not verify login token. Please try again.');
        }
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="min-h-screen bg-app text-fg flex flex-col justify-between font-sans px-4">
      <header className="w-full max-w-md mx-auto pt-10 pb-3 flex items-center justify-center">
        <Link href="/login" className="focus-ring inline-flex items-center rounded-sm">
          <img
            src="/appointmentlyy-logo.png"
            alt="Appointmentlyy"
            className="h-8 w-auto object-contain"
          />
        </Link>
      </header>

      <main className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-surface rounded-xl p-8 border border-line shadow-xs text-center" aria-live="polite">
          {status === 'verifying' && (
            <div className="space-y-4 py-4">
              <div className="w-10 h-10 rounded-full border-2 border-line border-t-fg animate-spin mx-auto" aria-hidden />
              <div>
                <h1 className="text-h2 text-fg">
                  Verifying your login link...
                </h1>
                <p className="text-body text-fg-secondary mt-1">
                  Opening a secure session for your Appointmentlyy workspace.
                </p>
              </div>
            </div>
          )}

          {status === 'success' && identity && (
            <div className="space-y-4 py-2">
              <div className="size-12 rounded-full bg-success-bg text-success-fg flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <div className="mb-2">
                  <Badge tone="success">
                    <ShieldCheck className="w-3 h-3" aria-hidden />
                    <span>Verified</span>
                    <span className="font-mono">{identity.tenantCode}</span>
                  </Badge>
                </div>
                <h1 className="text-h2 text-fg">
                  Welcome, {identity.repName}
                </h1>
                <p className="text-body text-fg-secondary mt-1">
                  Taking you to <span className="font-medium text-fg">{identity.tenantName}</span> ({identity.role})...
                </p>
              </div>
              <div className="pt-2">
                <Button
                  variant="brand"
                  size="lg"
                  className="w-full"
                  onClick={() =>
                    router.push(
                      identity.role === 'Super Admin' || identity.role === 'Admin'
                        ? '/admin'
                        : '/dialer'
                    )
                  }
                >
                  Enter workspace
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-2">
              <div className="size-12 rounded-full bg-danger-bg text-danger-fg flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <h1 className="text-h2 text-fg">
                  This login link has expired or is invalid
                </h1>
                <p className="text-body text-fg-secondary mt-1">{errorMessage}</p>
              </div>
              <div className="pt-2">
                <Link
                  href="/login"
                  className={buttonClasses('primary', 'lg', 'w-full')}
                >
                  <span>Back to sign in</span>
                  <ArrowRight aria-hidden />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto py-6 text-center text-caption text-fg-tertiary">
        © 2026 Appointmentlyy
      </footer>
    </div>
  );
}

export default function VerifyLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app flex items-center justify-center text-body text-fg-tertiary">
          Verifying...
        </div>
      }
    >
      <VerifyLoginContent />
    </Suspense>
  );
}
