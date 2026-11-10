/**
 * Role rules shared by the server (authorization) and the browser (what to show).
 * No 'use client' and no browser APIs: safe to import from route handlers.
 */

export type Role = 'Super Admin' | 'Admin' | 'Manager' | 'Supervisor' | 'Rep';

export const ROLES: Role[] = ['Super Admin', 'Admin', 'Manager', 'Supervisor', 'Rep'];

/** Roles a client workspace can hold. Super Admin exists only in the platform workspace. */
export const CLIENT_ROLES: Role[] = ['Admin', 'Manager', 'Supervisor', 'Rep'];

export const ROLE_RANK: Record<Role, number> = {
  Rep: 0,
  Supervisor: 1,
  Manager: 1,
  Admin: 2,
  'Super Admin': 4,
};

/** Which roles each role may grant when inviting or changing someone's role. */
export const GRANTABLE: Record<Role, Role[]> = {
  'Super Admin': ['Super Admin', 'Admin', 'Manager', 'Supervisor', 'Rep'],
  Admin: ['Admin', 'Manager', 'Supervisor', 'Rep'],
  Manager: ['Supervisor', 'Rep'],
  Supervisor: ['Rep'],
  Rep: [],
};

export const ROLE_LABEL: Record<Role, string> = {
  'Super Admin': 'Super Admin',
  Admin: 'Admin',
  Manager: 'Manager',
  Supervisor: 'Supervisor',
  Rep: 'Rep',
};

/** Strict parse: unknown strings are rejected (never silently upgraded). */
export function parseRole(raw: unknown): Role | null {
  if (typeof raw !== 'string') return null;
  const r = raw.trim().toLowerCase();
  if (r === 'super admin' || r === 'superadmin') return 'Super Admin';
  if (r === 'admin' || r === 'client admin') return 'Admin';
  if (r === 'manager') return 'Manager';
  if (r === 'supervisor') return 'Supervisor';
  if (r === 'rep' || r === 'sdr' || r === 'sales rep') return 'Rep';
  return null;
}

/** The platform's own workspace (Appointmentlyy staff). */
export const PLATFORM_TENANT_CODE = 'APPOINTMENTLYY';
export const PLATFORM_TENANT_NAME = 'Appointmentlyy';

/** Uppercase slug used as the tenant code, e.g. "Acme BPO Inc." -> "ACME-BPO-INC". */
export function toTenantCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export const TENANT_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
