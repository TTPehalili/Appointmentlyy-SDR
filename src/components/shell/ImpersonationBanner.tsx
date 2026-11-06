'use client';

import { Eye } from 'lucide-react';
import { useSession } from '@/lib/session';
import { HOME_WORKSPACE } from '@/lib/workspaces';

/**
 * Shown on ink-950 across the top of the app whenever a Super Admin is inside a client
 * workspace. It cannot be dismissed, only exited (redesign spec 3.5).
 *
 * DESIGN-NOTE: the spec shows a "Read-only ▾" access-mode menu here. There is no
 * read-only enforcement behind impersonation yet, so the menu is left out rather than
 * showing a mode that does nothing. Add it once the server supports it.
 */
export function ImpersonationBanner() {
  const { role, tenantName, tenantCode, updateSession } = useSession();
  if (role !== 'Super Admin' || tenantCode === HOME_WORKSPACE.code) return null;

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
        onClick={() => updateSession({ tenantName: HOME_WORKSPACE.name, tenantCode: HOME_WORKSPACE.code })}
        className="focus-ring rounded-sm font-medium text-ink-50 underline underline-offset-2 hover:text-white"
      >
        Exit
      </button>
    </div>
  );
}
