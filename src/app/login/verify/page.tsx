'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { setStoredSession, UserRole } from '@/lib/session';

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
            router.push('/cockpit');
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
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 flex flex-col justify-between font-sans px-4">
      <header className="w-full max-w-md mx-auto pt-10 pb-4 flex items-center justify-center">
        <Link href="/login" className="inline-flex items-center">
          <img
            src="/appointmentlyy-logo.png"
            alt="Appointmentlyy Logo"
            className="h-9 w-auto object-contain"
          />
        </Link>
      </header>

      <main className="w-full max-w-md mx-auto my-auto py-8">
        <div className="bg-white rounded-2xl p-8 border border-zinc-200/90 shadow-xs text-center">
          {status === 'verifying' && (
            <div className="space-y-4 py-4">
              <div className="w-10 h-10 rounded-full border-2 border-zinc-200 border-t-zinc-950 animate-spin mx-auto" />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
                  AUTHENTICATING_SESSION
                </div>
                <h1 className="text-lg font-bold text-zinc-950">
                  Verifying your secure login link...
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  Establishing encrypted workspace session on Appointmentlyy SDR.
                </p>
              </div>
            </div>
          )}

          {status === 'success' && identity && (
            <div className="space-y-4 py-2">
              <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-semibold mb-2">
                  <ShieldCheck className="w-3 h-3" />
                  <span>VERIFIED // {identity.tenantCode}</span>
                </div>
                <h1 className="text-lg font-bold text-zinc-950">
                  Welcome, {identity.repName}
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  Routing you to <span className="font-semibold text-zinc-800">{identity.tenantName}</span> ({identity.role})...
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() =>
                    router.push(
                      identity.role === 'Super Admin' || identity.role === 'Admin'
                        ? '/admin'
                        : '/cockpit'
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <span>Enter Workspace Now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4 py-2">
              <div className="w-11 h-11 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-rose-500 mb-1">
                  TOKEN_VERIFICATION_FAILED
                </div>
                <h1 className="text-lg font-bold text-zinc-950">
                  Login Link Expired or Invalid
                </h1>
                <p className="text-xs text-zinc-500 mt-1">{errorMessage}</p>
              </div>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition"
                >
                  <span>Return to Login</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto py-6 text-center font-mono text-[10px] tracking-wider text-zinc-400">
        © 2026 APPOINTMENTLYY AI · SECURE ACCESS GATEWAY
      </footer>
    </div>
  );
}

export default function VerifyLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center text-xs text-zinc-500 font-mono">
          VERIFYING_TOKEN...
        </div>
      }
    >
      <VerifyLoginContent />
    </Suspense>
  );
}

