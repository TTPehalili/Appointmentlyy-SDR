'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DEMO_LOGIN, canViewAsRoles, getViewAsRole, refreshServerIdentity, setViewAsRole } from '@/lib/authClient';
import { clearStoredSession, getStoredSession, normalizeUserRole, setStoredSession } from '@/lib/session';
import { STORAGE_OWNER_KEY, claimTenantStorage, getStorageOwner } from '@/lib/tenantStorage';

/**
 * Keeps the browser's copy of the session in step with the server (the httpOnly cookie, checked
 * against the member records):
 * - signed out, removed or suspended → local data cleared, back to /login
 * - another person or workspace than the data in this browser → that data is wiped first
 * - role / workspace / name changed by an admin → picked up on the next focus
 * Demo builds (browser-only login) skip all of this.
 */
export function SessionSync() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = React.useRef(pathname);
  React.useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  React.useEffect(() => {
    if (DEMO_LOGIN) return;
    let alive = true;
    // Whose data this tab loaded. If another tab switches person or workspace, this tab reloads
    // instead of showing (and saving) the previous workspace's data.
    let tabOwner: string | null = getStorageOwner();

    const sync = async () => {
      const state = await refreshServerIdentity();
      if (!alive) return;
      if (state.status === 'signed-out') {
        clearStoredSession();
        const next = pathRef.current && pathRef.current !== '/' ? `?next=${encodeURIComponent(pathRef.current)}` : '';
        router.replace(`/login${next}`);
        return;
      }
      if (state.status !== 'signed-in' || !state.identity) return;
      // A password is required: nobody uses the app until they've created one.
      if (state.hasPassword === false) {
        router.replace('/login/set-password');
        return;
      }
      const id = state.identity;
      const wiped = claimTenantStorage(id.email, id.tenantCode);
      // Staff "view as" preview (display only) in their own workspace; cleared anywhere else.
      if (!canViewAsRoles(id)) setViewAsRole(null);
      const effectiveRole = (canViewAsRoles(id) && getViewAsRole()) || id.role;
      const nowOwner = getStorageOwner();
      const changedElsewhere = tabOwner !== null && nowOwner !== tabOwner;
      tabOwner = nowOwner;
      const cur = getStoredSession();
      if (
        wiped ||
        !cur.isAuthenticated ||
        cur.email !== id.email ||
        cur.role !== normalizeUserRole(effectiveRole) ||
        cur.tenantCode !== id.tenantCode ||
        cur.tenantName !== id.tenantName ||
        cur.repName !== id.repName
      ) {
        setStoredSession({
          email: id.email,
          role: effectiveRole,
          tenantCode: id.tenantCode,
          tenantName: id.tenantName,
          repName: id.repName,
          isAuthenticated: true,
        });
      }
      // Screens already holding the previous workspace's data in memory start fresh.
      if (wiped || changedElsewhere) window.location.reload();
    };

    sync();
    const onFocus = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_OWNER_KEY && tabOwner !== null && e.newValue !== tabOwner) window.location.reload();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [router]);

  return null;
}
