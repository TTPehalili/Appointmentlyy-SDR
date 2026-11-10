'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus, Search, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { usePermission } from '@/lib/permissions';
import {
  getSimulatedCustomHost,
  resolveTenantByHostname,
  subscribeToCustomDomains,
  type TenantCustomDomainConfig,
} from '@/lib/customDomainStore';
import { HOME_WORKSPACE, WORKSPACES, getRecentWorkspaceCodes, pushRecentWorkspace } from '@/lib/workspaces';
import { DEMO_LOGIN, getServerAuth, switchWorkspaceOnServer, useServerAuth } from '@/lib/authClient';
import { setStoredSession } from '@/lib/session';
import { claimTenantStorage } from '@/lib/tenantStorage';

/** Tenant config when the app is served from a client's custom domain (white-label lock). */
export function useWhiteLabel(): TenantCustomDomainConfig | null {
  const [config, setConfig] = React.useState<TenantCustomDomainConfig | null>(null);
  React.useEffect(() => {
    const sync = () => {
      // Same host the proxy resolved (it honours ?custom_domain= previews via the appy_active_host cookie).
      const proxyHost = document.cookie.match(/(?:^|; )appy_active_host=([^;]+)/)?.[1];
      const host = getSimulatedCustomHost() || (proxyHost && decodeURIComponent(proxyHost)) || window.location.hostname;
      const resolved = resolveTenantByHostname(host);
      setConfig(resolved && resolved.tenantCode !== HOME_WORKSPACE.code ? resolved : null);
    };
    sync();
    return subscribeToCustomDomains(sync);
  }, []);
  return config;
}

/** The square app mark. Tenants get their initials on a neutral tile (brand guide 4, white-label). */
export function WorkspaceMark({ initials, size = 28 }: { initials?: string; size?: number }) {
  if (initials) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-action text-caption text-action-fg"
      >
        {initials}
      </span>
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-ink-900 p-[3px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/appointmentlyy-mark.png" alt="" className="size-full" />
    </span>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { tenantName, tenantCode, updateSession } = useSession();
  const canPlatform = usePermission('platform');
  const whiteLabel = useWhiteLabel();
  const server = useServerAuth();
  const [switching, setSwitching] = React.useState<string | null>(null);
  const [switchError, setSwitchError] = React.useState<string | null>(null);
  // Real builds: the workspaces the server says this person belongs to. Demo builds: the static list.
  const workspaces = DEMO_LOGIN
    ? WORKSPACES.map((w) => ({ code: w.code, name: w.name }))
    : server.workspaces.map((w) => ({ code: w.code, name: w.displayName || w.name }));
  const canSwitchDemo = usePermission('switchWorkspace');
  const canSwitch = DEMO_LOGIN ? canSwitchDemo : workspaces.length > 1;
  const branding = server.identity?.branding;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [recents, setRecents] = React.useState<string[]>([]);
  const ref = React.useRef<HTMLDivElement>(null);

  const isHome = tenantCode === HOME_WORKSPACE.code;
  const displayName = whiteLabel?.branding.workspaceDisplayName ?? (branding?.displayName || tenantName);
  const markInitials = whiteLabel
    ? whiteLabel.branding.logoInitials
    : isHome
      ? undefined
      : branding?.logoInitials || initialsOf(displayName);
  const interactive = canSwitch && !whiteLabel;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setRecents(getRecentWorkspaceCodes());
      setQuery('');
    }
    setOpen((o) => !o);
  };

  const switchTo = async (code: string) => {
    const ws = workspaces.find((w) => w.code === code);
    if (!ws || code === tenantCode) {
      setOpen(false);
      return;
    }
    if (DEMO_LOGIN) {
      pushRecentWorkspace(ws.code);
      updateSession({ tenantName: ws.name, tenantCode: ws.code });
      setOpen(false);
      return;
    }
    // The server re-issues the session for the new workspace; this browser's data from the old
    // workspace is wiped and the app reloads into the new one.
    setSwitching(code);
    setSwitchError(null);
    const res = await switchWorkspaceOnServer(code);
    const id = res.ok ? getServerAuth().identity : null;
    if (!res.ok || !id) {
      setSwitching(null);
      setSwitchError(res.error || 'Could not switch workspace.');
      return;
    }
    claimTenantStorage(id.email, id.tenantCode);
    pushRecentWorkspace(id.tenantCode);
    setStoredSession({ email: id.email, role: id.role, tenantCode: id.tenantCode, tenantName: id.tenantName, repName: id.repName, isAuthenticated: true });
    window.location.assign(new URL('/dialer', window.location.origin).href);
  };

  const q = query.trim().toLowerCase();
  const matches = workspaces.filter((w) => w.name.toLowerCase().includes(q));
  const recentList = q ? [] : recents.map((c) => workspaces.find((w) => w.code === c)).filter((w): w is (typeof workspaces)[number] => !!w);
  const rest = matches.filter((w) => !recentList.some((r) => r.code === w.code));

  const trigger = (
    <>
      <WorkspaceMark initials={markInitials} />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left text-body-strong text-fg">{displayName}</span>
          {interactive && <ChevronsUpDown className="size-4 shrink-0 text-fg-tertiary" aria-hidden />}
        </>
      )}
    </>
  );

  if (!interactive) {
    return (
      <div className={cn('flex h-10 items-center gap-2.5 rounded-md', collapsed ? 'justify-center' : 'px-2')} title={displayName}>
        {trigger}
      </div>
    );
  }

  const Row = ({ code, name }: { code: string; name: string }) => (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={code === tenantCode}
      onClick={() => switchTo(code)}
      className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-body text-fg outline-none hover:bg-subtle focus-visible:bg-subtle"
    >
      <WorkspaceMark initials={code === HOME_WORKSPACE.code ? undefined : initialsOf(name)} size={20} />
      <span className="flex-1 truncate">{name}</span>
      {switching === code && <span className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-transparent" aria-label="Switching" />}
      {code === tenantCode && <Check className="size-4 text-fg-secondary" aria-hidden />}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? displayName : undefined}
        className={cn(
          'focus-ring flex h-10 w-full items-center gap-2.5 rounded-md transition-colors duration-150 hover:bg-subtle',
          collapsed ? 'justify-center' : 'px-2',
        )}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch workspace"
          className="absolute left-0 top-full z-50 mt-1 w-72 animate-fade-in rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a workspace"
              aria-label="Find a workspace"
              className="h-9 w-full rounded-sm bg-transparent pl-8 pr-2 text-body text-fg outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto border-t border-line pt-1">
            {recentList.length > 0 && (
              <>
                <p className="px-2 pb-0.5 pt-1.5 text-group text-fg-tertiary">Recent</p>
                {recentList.map((w) => (
                  <Row key={`r-${w.code}`} code={w.code} name={w.name} />
                ))}
                <p className="px-2 pb-0.5 pt-2 text-group text-fg-tertiary">All workspaces</p>
              </>
            )}
            {rest.map((w) => (
              <Row key={w.code} code={w.code} name={w.name} />
            ))}
            {matches.length === 0 && <p className="px-2 py-3 text-small text-fg-tertiary">No workspaces match</p>}
            {switchError && (
              <p role="alert" className="px-2 py-2 text-small text-danger-fg">
                {switchError}
              </p>
            )}
          </div>
          <div className="mt-1 border-t border-line pt-1">
            {canPlatform && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  router.push('/platform');
                }}
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-body text-fg outline-none hover:bg-subtle focus-visible:bg-subtle"
              >
                <ShieldCheck className="size-4 text-fg-secondary" aria-hidden />
                Platform Console
              </button>
            )}
            {canPlatform && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // New workspaces are provisioned from Platform Console › Tenants.
                router.push('/platform/tenants');
              }}
              className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-body text-fg-secondary outline-none hover:bg-subtle hover:text-fg focus-visible:bg-subtle"
            >
              <Plus className="size-4" aria-hidden />
              New workspace
            </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
