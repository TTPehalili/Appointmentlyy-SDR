'use client';

/**
 * Browser side of the server session. The server (httpOnly `appy_auth` cookie, checked against
 * the member records) is the source of truth; localStorage only mirrors it for the UI.
 */
import { useSyncExternalStore } from 'react';
import type { Role } from '@/lib/roles';

export { DEMO_LOGIN } from '@/lib/demoMode';

export interface TenantBrandingInfo {
  brandColor?: string;
  displayName?: string;
  logoInitials?: string;
  supportEmail?: string;
  /** Lead Finder pull progress style. Unset = 'playful'. */
  leadFinderAnimation?: 'playful' | 'professional';
  /** Selected-state colour per theme (Admin › Appearance). Unset = platform default. */
  selection?: { light?: string; dark?: string };
}

export interface ServerIdentity {
  email: string;
  repName: string;
  role: Role;
  tenantCode: string;
  tenantName: string;
  isPlatformAdmin: boolean;
  branding: TenantBrandingInfo;
  modules: Record<string, boolean>;
}

export interface WorkspaceOption {
  code: string;
  name: string;
  displayName: string;
  logoInitials: string;
  status: string;
}

interface AuthState {
  status: 'unknown' | 'signed-in' | 'signed-out';
  identity: ServerIdentity | null;
  workspaces: WorkspaceOption[];
  /** False until the person has created a password (required on first sign-in). */
  hasPassword?: boolean;
}

const EVENT = 'appy:server-identity';
let state: AuthState = { status: 'unknown', identity: null, workspaces: [] };
const SERVER_STATE: AuthState = state;

function setState(next: AuthState) {
  state = next;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useServerAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

export function getServerAuth(): AuthState {
  return state;
}

/** Ask the server who is signed in. Returns null when signed out (cookie missing, expired or revoked). */
export async function refreshServerIdentity(): Promise<AuthState> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) {
      setState({ status: 'signed-out', identity: null, workspaces: [] });
      return state;
    }
    const data = await res.json();
    if (!res.ok || !data.success) return state; // transient error: keep what we have
    setState({ status: 'signed-in', identity: data.identity, workspaces: data.workspaces ?? [], hasPassword: data.hasPassword !== false });
  } catch {
    // offline / server restarting: keep the current state
  }
  return state;
}

export async function switchWorkspaceOnServer(tenantCode: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantCode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) return { ok: false, error: data.error || 'Could not switch workspace.' };
  await refreshServerIdentity();
  return { ok: true };
}

export async function signOutOnServer() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // the local sign-out still happens
  }
  setState({ status: 'signed-out', identity: null, workspaces: [] });
}

/** Small JSON helper for the admin screens. */
export async function apiJson<T = Record<string, unknown>>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<T & { success: boolean; error?: string; status: number }> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({ success: false, error: 'Unexpected server reply.' }));
  return { ...data, success: Boolean(res.ok && data.success), status: res.status };
}

// ------------------------------------------------------------------ "View as role" (staff demos)

const VIEW_AS_KEY = 'appy_view_as_role';
const VIEW_AS_ROLES: Role[] = ['Admin', 'Manager', 'Supervisor', 'Rep'];

/**
 * Display-only role preview for Appointmentlyy staff in their own (demo) workspace. It changes what
 * the UI shows; the server still uses the real role, so it can't grant or remove any access.
 */
export function getViewAsRole(): Role | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(VIEW_AS_KEY) as Role | null;
    return v && VIEW_AS_ROLES.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function setViewAsRole(role: Role | null) {
  try {
    if (role && VIEW_AS_ROLES.includes(role)) localStorage.setItem(VIEW_AS_KEY, role);
    else localStorage.removeItem(VIEW_AS_KEY);
  } catch {
    // storage unavailable: preview just won't persist
  }
}

/** Staff signed in to the platform's own workspace may preview other roles. */
export function canViewAsRoles(identity: ServerIdentity | null): boolean {
  return Boolean(identity?.isPlatformAdmin && identity.tenantCode === 'APPOINTMENTLYY');
}
