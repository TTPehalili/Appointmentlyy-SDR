/**
 * Demo builds (NEXT_PUBLIC_DEMO_LOGIN=1) keep the browser-only password login, URL session
 * overrides and seeded sample data for screenshots and sales demos. Never set it in production.
 * Plain module (no 'use client') so both server and browser code can read it.
 */
export const DEMO_LOGIN = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';

/**
 * The platform owner's own workspace: the only place real builds show sample data. Everyone in it
 * (Super Admin plus the demo Admin / Manager / Rep logins used in sales demos) sees the samples;
 * clients never belong to it.
 */
const DEMO_WORKSPACE_CODE = 'APPOINTMENTLYY';

/**
 * Whether sample (demo) data may be shown right now.
 * - Demo builds: always.
 * - Real builds, in the browser: only for people signed in to the APPOINTMENTLYY
 *   workspace (read from the session mirror in localStorage). Client workspaces, including a
 *   Super Admin viewing one through "Open workspace", start clean.
 * - Server: only demo builds. Server routes with a session use isDemoSession().
 */
export function isDemoWorkspace(): boolean {
  if (DEMO_LOGIN) return true;
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('sdr_tenant_code') === DEMO_WORKSPACE_CODE;
  } catch {
    return false;
  }
}

/** Server-side check: anyone signed in to the APPOINTMENTLYY (demo) workspace. */
export function isDemoSession(
  session: { isPlatformAdmin?: boolean; tenantCode?: string } | null | undefined,
): boolean {
  if (DEMO_LOGIN) return true;
  return session?.tenantCode === DEMO_WORKSPACE_CODE;
}
