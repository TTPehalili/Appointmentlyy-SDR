'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CreatePasswordForm } from '@/components/account/CreatePasswordForm';
import { refreshServerIdentity, type ServerIdentity } from '@/lib/authClient';

/**
 * Required step for anyone signed in without a password (the app sends them here). Not signed in →
 * back to sign-in; already has a password → straight into the app.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [identity, setIdentity] = React.useState<ServerIdentity | null>(null);

  const home = React.useCallback(
    (id: ServerIdentity) => router.replace(id.role === 'Super Admin' || id.role === 'Admin' ? '/admin' : '/dialer'),
    [router],
  );

  React.useEffect(() => {
    let alive = true;
    refreshServerIdentity().then((state) => {
      if (!alive) return;
      if (state.status !== 'signed-in' || !state.identity) {
        router.replace('/login');
        return;
      }
      if (state.hasPassword) {
        home(state.identity);
        return;
      }
      setIdentity(state.identity);
    });
    return () => {
      alive = false;
    };
  }, [router, home]);

  return (
    <div className="min-h-screen bg-app text-fg flex flex-col justify-between font-sans px-4">
      <header className="w-full max-w-md mx-auto pt-10 pb-3 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/appointmentlyy-logo.png" alt="Appointmentlyy" className="h-8 w-auto object-contain" />
      </header>
      <main className="w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-surface rounded-xl p-8 border border-line shadow-xs">
          {identity ? (
            <CreatePasswordForm name={identity.repName} workspace={identity.tenantName} onDone={() => home(identity)} />
          ) : (
            <div className="py-8 text-center text-body text-fg-tertiary" role="status">
              Loading…
            </div>
          )}
        </div>
      </main>
      <footer className="w-full max-w-md mx-auto py-6 text-center text-caption text-fg-tertiary">© 2026 Appointmentlyy</footer>
    </div>
  );
}
