/**
 * Demo builds (NEXT_PUBLIC_DEMO_LOGIN=1) keep the browser-only password login, URL session
 * overrides and seeded sample data for screenshots and sales demos. Never set it in production.
 * Plain module (no 'use client') so both server and browser code can read it.
 *
 * Production guard: demo login turns the sign-in gate off, so the flag is IGNORED when
 * NODE_ENV=production (every `next build` / `next start`) unless ALLOW_DEMO_LOGIN_IN_PROD=1 is
 * also set (server; the browser bundle reads NEXT_PUBLIC_ALLOW_DEMO_LOGIN_IN_PROD at build time).
 * Never set either on a real deployment. instrumentation.ts logs a warning at start-up.
 */
const DEMO_LOGIN_REQUESTED = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEMO_ALLOWED_IN_PRODUCTION =
  process.env.ALLOW_DEMO_LOGIN_IN_PROD === '1' || process.env.NEXT_PUBLIC_ALLOW_DEMO_LOGIN_IN_PROD === '1';

export const DEMO_LOGIN = DEMO_LOGIN_REQUESTED && (!IS_PRODUCTION || DEMO_ALLOWED_IN_PRODUCTION);

/** A start-up warning about the demo-login flag, or null when there is nothing to say. */
export function demoLoginWarning(): string | null {
  if (!DEMO_LOGIN_REQUESTED) return null;
  if (!DEMO_LOGIN) {
    return '[security] NEXT_PUBLIC_DEMO_LOGIN=1 is set but IGNORED because NODE_ENV=production: real sign-in stays on. Remove the variable from this deployment.';
  }
  if (IS_PRODUCTION) {
    return '[security] WARNING: demo login is ON in production (ALLOW_DEMO_LOGIN_IN_PROD=1). The sign-in gate is OFF: anyone can use the app and its staff-only APIs. Never do this on a real deployment.';
  }
  return null;
}

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
