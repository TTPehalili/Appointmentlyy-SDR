'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useServerAuth } from '@/lib/authClient';
import { DEMO_LOGIN } from '@/lib/demoMode';
import { normalizeUserRole, useSession } from '@/lib/session';
import { useVisibleNav } from '@/components/shell/useVisibleNav';
import { buildTourSteps } from './tourSteps';
import { TOUR_START_EVENT, isTourDone, markTourDone } from './tourStorage';

// The tour UI is only downloaded when it actually opens, so it costs nothing on normal page loads.
const TourOverlay = dynamic(() => import('./TourOverlay'), { ssr: false });

/** Wait a moment after the app is ready, so the tour never competes with the first paint. */
const AUTO_START_DELAY_MS = 900;

/**
 * First-login product tour. Starts once per person per device (see tourStorage), and again
 * whenever startTour() is called (Settings › Replay tour, ⌘K "Take the product tour").
 * Renders nothing until the browser knows who is signed in, so there is no hydration mismatch.
 */
export function ProductTour() {
  const pathname = usePathname();
  const auth = useServerAuth();
  const { email: sessionEmail, role, repName, isAuthenticated } = useSession();
  const nav = useVisibleNav();
  const [open, setOpen] = React.useState(false);

  const identity = auth.identity;
  // Wait until the browser's session copy matches the server, so the menu (and the steps) are final.
  const serverReady =
    auth.status === 'signed-in' &&
    !!identity &&
    auth.hasPassword !== false &&
    isAuthenticated &&
    sessionEmail.trim().toLowerCase() === identity.email.trim().toLowerCase() &&
    role === normalizeUserRole(identity.role);
  const demoReady = DEMO_LOGIN && isAuthenticated;
  const ready = !pathname.startsWith('/login') && (serverReady || demoReady);
  const email = ready ? (identity?.email ?? sessionEmail) || 'demo' : '';

  // A replay asked for before the session was known starts as soon as it is.
  const replayPending = React.useRef(false);
  const readyRef = React.useRef(ready);
  React.useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  React.useEffect(() => {
    const onStart = () => {
      if (readyRef.current) setOpen(true);
      else replayPending.current = true;
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, []);

  React.useEffect(() => {
    if (!email) return;
    if (replayPending.current) {
      replayPending.current = false;
      queueMicrotask(() => setOpen(true));
      return;
    }
    if (isTourDone(email)) return;
    const t = window.setTimeout(() => {
      if (!isTourDone(email)) setOpen(true);
    }, AUTO_START_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [email]);

  const firstName = repName.trim().split(/\s+/)[0] ?? '';
  const navKey = nav.map((n) => n.id).join(',');
  const steps = React.useMemo(
    () => buildTourSteps({ navIds: new Set(navKey.split(',')), role, firstName }),
    [navKey, role, firstName],
  );

  const onClose = React.useCallback(
    (how: 'finished' | 'skipped') => {
      if (email) markTourDone(email, how);
      setOpen(false);
    },
    [email],
  );

  if (!open || !ready) return null;
  return <TourOverlay steps={steps} onClose={onClose} />;
}
