'use client';

import * as React from 'react';
import { Eye } from 'lucide-react';
import { useSession } from '@/lib/session';
import { HOME_WORKSPACE } from '@/lib/workspaces';
import { DEMO_LOGIN, getServerAuth, switchWorkspaceOnServer, useServerAuth } from '@/lib/authClient';
import { setStoredSession } from '@/lib/session';
import { claimTenantStorage } from '@/lib/tenantStorage';

/**
 * Shown on ink-950 across the top of the app whenever a Super Admin is inside a client
 * workspace. It cannot be dismissed, only exited (redesign spec 3.5). Entering and leaving a
 * client workspace goes through the server and is written to the audit log.
 */
export function ImpersonationBanner() {
  const { role, tenantName, tenantCode, updateSession } = useSession();
  const server = useServerAuth();
  const [leaving, setLeaving] = React.useState(false);
  const isStaff = DEMO_LOGIN ? role === 'Super Admin' : Boolean(server.identity?.isPlatformAdmin);
  if (!isStaff || !tenantCode || tenantCode === HOME_WORKSPACE.code) return null;

  const exit = async () => {
    if (DEMO_LOGIN) {
      updateSession({ tenantName: HOME_WORKSPACE.name, tenantCode: HOME_WORKSPACE.code });
      return;
    }
    setLeaving(true);
    const res = await switchWorkspaceOnServer(HOME_WORKSPACE.code);
    const id = getServerAuth().identity;
    if (!res.ok || !id) {
      setLeaving(false);
      return;
    }
    claimTenantStorage(id.email, id.tenantCode);
    setStoredSession({ email: id.email, role: id.role, tenantCode: id.tenantCode, tenantName: id.tenantName, repName: id.repName, isAuthenticated: true });
    window.location.assign(new URL('/platform/tenants', window.location.origin).href);
  };

  return (
    <div
      role="status"
      className="flex h-8 shrink-0 items-center justify-center gap-3 bg-ink-950 px-4 text-small text-ink-50"
    >
      <Eye className="size-4 text-ink-400" aria-hidden />
      <span className="truncate">
        Viewing <span className="font-medium">{tenantName}</span> as Super Admin
      </span>
      <span className="text-ink-500" aria-hidden>
        ·
      </span>
      <button
        type="button"
        onClick={exit}
        disabled={leaving}
        className="focus-ring rounded-sm font-medium text-ink-50 underline underline-offset-2 hover:text-white disabled:opacity-60"
      >
        {leaving ? 'Leaving…' : 'Exit'}
      </button>
    </div>
  );
}
