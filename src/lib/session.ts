'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';

export type UserRole = 'Super Admin' | 'Admin' | 'Manager' | 'Supervisor' | 'Rep';

export interface SdrSession {
  role: UserRole;
  tenantName: string;
  tenantCode: string;
  email: string;
  repName: string;
  headcount?: string;
  isAuthenticated: boolean;
}

export const SDR_SESSION_STORAGE_KEYS = {
  ROLE: 'user_role',
  EMAIL: 'sdr_user_email',
  REP_NAME: 'sdr_rep_name',
  TENANT_NAME: 'sdr_tenant_name',
  TENANT_CODE: 'sdr_tenant_code',
  HEADCOUNT: 'sdr_tenant_headcount',
  AUTH_FLAG: 'sdr_is_authenticated',
  PASSWORD_STORE: 'appointmentlyy_user_passwords_v1',
  ROLE_PERMISSIONS: 'appointmentlyy_role_permissions_v1',
};

export const ROLE_PERMISSIONS_UPDATED_EVENT = 'appointmentlyy_role_permissions_updated';

export interface RolePermissionMatrixItem {
  id: string;
  name: string;
  desc: string;
  sdr: boolean;
  closer: boolean;
  manager: boolean;
  director: boolean;
}

export const DEFAULT_ROLE_PERMISSION_MATRIX: RolePermissionMatrixItem[] = [
  {
    id: 'icp_builder',
    name: 'ICP List Builder & Folders',
    desc: 'Filter 690M+ B2B decision-makers, pull contacts, and distribute lead folders to reps',
    sdr: false, // strictly restricted for Reps / SDRs by default
    closer: false,
    manager: true,
    director: true,
  },
  {
    id: 'cockpit',
    name: 'AI Boris Calling Cockpit',
    desc: 'Sub-second audio interception & ARM talk tracks',
    sdr: true,
    closer: true,
    manager: true,
    director: true,
  },
  {
    id: 'sparring',
    name: 'AI Sparring Simulator',
    desc: 'Simulated voice buyer pushback trials',
    sdr: true,
    closer: true,
    manager: true,
    director: true,
  },
  {
    id: 'dialer',
    name: 'Softphone Dialer & Calling',
    desc: 'WebRTC / SIP live dialer connection',
    sdr: true,
    closer: true,
    manager: true,
    director: true,
  },
  {
    id: 'leads_crm',
    name: 'Leads & Cadence CRM',
    desc: 'Ingest CSV accounts and generate 7-touch cadences',
    sdr: true,
    closer: true,
    manager: true,
    director: true,
  },
  {
    id: 'qa_scorecards',
    name: 'QA Audio Auditing & Scorecards',
    desc: 'Review acoustic hold scores and rep performance',
    sdr: false,
    closer: false,
    manager: true,
    director: true,
  },
  {
    id: 'certificates',
    name: 'Certificate Issuance & Revocation',
    desc: 'Authorize credentials for calling floor access',
    sdr: false,
    closer: false,
    manager: true,
    director: true,
  },
];

/**
 * Retrieve saved role permission matrix from localStorage
 */
export function getStoredRolePermissions(): RolePermissionMatrixItem[] {
  if (typeof window === 'undefined') return DEFAULT_ROLE_PERMISSION_MATRIX;
  try {
    const raw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.ROLE_PERMISSIONS);
    if (!raw) return DEFAULT_ROLE_PERMISSION_MATRIX;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ROLE_PERMISSION_MATRIX;
    
    // Ensure all default tool rows exist
    const merged = DEFAULT_ROLE_PERMISSION_MATRIX.map((def) => {
      const match = parsed.find((p: RolePermissionMatrixItem) => p.id === def.id || p.name === def.name);
      return match ? { ...def, ...match } : def;
    });
    return merged;
  } catch {
    return DEFAULT_ROLE_PERMISSION_MATRIX;
  }
}

/**
 * Save updated role permissions to localStorage and broadcast change
 */
export function saveStoredRolePermissions(matrix: RolePermissionMatrixItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.ROLE_PERMISSIONS, JSON.stringify(matrix));
    window.dispatchEvent(new CustomEvent(ROLE_PERMISSIONS_UPDATED_EVENT, { detail: matrix }));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Session] Failed to save role permissions matrix:', err);
  }
}

/**
 * Check if a specific role is allowed to access the ICP List Builder tool.
 * - Super Admin & Admin (Directors/Owners/Tenants): ALWAYS allowed (full authority).
 * - Manager & Supervisor: allowed if manager permission is enabled.
 * - Rep (SDR): only allowed if the Admin explicitly ticked the SDR box for ICP List Builder in the Role Permission Matrix.
 */
export function canUserAccessIcpBuilder(role?: UserRole | string | null): boolean {
  const activeRole = role ? normalizeUserRole(role) : getStoredSession().role;
  if (activeRole === 'Super Admin' || activeRole === 'Admin') return true;

  const matrix = getStoredRolePermissions();
  const icpTool = matrix.find((t) => t.id === 'icp_builder' || t.name.toLowerCase().includes('icp'));
  if (!icpTool) return false;

  if (activeRole === 'Manager' || activeRole === 'Supervisor') {
    return Boolean(icpTool.manager);
  }

  // Rep level: checks the SDR column
  return Boolean(icpTool.sdr);
}

export interface UserPasswordRecord {
  password: string;
  updatedAt: string;
}

const DEFAULT_DEMO_PASSWORDS: Record<string, string> = {
  'emil@appointmentlyy.com': 'Appointmentlyy2026!',
  'julian.vance@apexglobalbpo.ph': 'ApexGlobal2026!',
};

/**
 * Retrieve stored custom password map from localStorage
 */
export function getStoredPasswordMap(): Record<string, UserPasswordRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.PASSWORD_STORE);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, UserPasswordRecord>;
  } catch {
    return {};
  }
}

/**
 * Verify a user's password.
 * If the user has explicitly set/changed their password, we validate against that stored password
 * (while still allowing the demo masked placeholder '••••••••••••' only if they haven't set a custom password yet).
 */
export function verifyUserPassword(
  email: string,
  inputPassword: string
): { valid: boolean; error?: string; hasCustomPassword?: boolean } {
  const cleanEmail = email.trim().toLowerCase();
  const trimmedPassword = inputPassword.trim();
  if (!trimmedPassword) {
    return { valid: false, error: 'Please enter your password.' };
  }

  const map = getStoredPasswordMap();
  const customRecord = map[cleanEmail];

  if (customRecord) {
    if (inputPassword === customRecord.password) {
      return { valid: true, hasCustomPassword: true };
    }
    return {
      valid: false,
      hasCustomPassword: true,
      error: 'Incorrect password. Please enter the updated password you configured.',
    };
  }

  // Default behavior before a custom password is set: allow the default demo password or standard non-empty input
  return { valid: true, hasCustomPassword: false };
}

/**
 * Change / update the password for a user account and persist in localStorage.
 */
export function changeUserPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): { ok: boolean; error?: string; updatedAt?: string } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, error: 'Please enter a valid work email address.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters long.' };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'New password and confirmation do not match.' };
  }

  const map = getStoredPasswordMap();
  const existing = map[cleanEmail];

  // If the user previously set a custom password and provided a non-empty current password that doesn't match
  if (
    existing &&
    currentPassword.trim() !== '' &&
    currentPassword !== '••••••••••••' &&
    currentPassword !== existing.password
  ) {
    return { ok: false, error: 'Your current password does not match our records.' };
  }

  if (existing && existing.password === newPassword) {
    return { ok: false, error: 'New password must be different from your current password.' };
  }

  const updatedAt = new Date().toISOString();
  map[cleanEmail] = {
    password: newPassword,
    updatedAt,
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.PASSWORD_STORE, JSON.stringify(map));
    } catch (err) {
      console.warn('[Session] Failed to persist password update:', err);
      return { ok: false, error: 'Could not save password in browser storage.' };
    }
  }

  return { ok: true, updatedAt };
}

export function getDefaultDemoPassword(email: string): string {
  const clean = email.trim().toLowerCase();
  const map = getStoredPasswordMap();
  if (map[clean]?.password) return map[clean].password;
  return DEFAULT_DEMO_PASSWORDS[clean] || 'Appointmentlyy2026!';
}

export const SDR_SESSION_EVENT = 'appointmentlyy_sdr_session_updated';

export const DEFAULT_SESSION: SdrSession = {
  role: 'Super Admin',
  tenantName: 'Appointmentlyy',
  tenantCode: 'APPOINTMENTLYY',
  email: 'emil@appointmentlyy.com',
  repName: 'Emil Halili',
  headcount: 'CEO/Founder',
  isAuthenticated: true,
};

/**
 * Format an email or string into a clean person name (e.g. julian.vance@company.com -> Julian Vance)
 */
export function formatRepNameFromEmail(emailOrName: string): string {
  if (!emailOrName) return 'Emil Halili';
  if (!emailOrName.includes('@')) return emailOrName;
  if (emailOrName.toLowerCase() === 'emil@appointmentlyy.com') return 'Emil Halili';

  const localPart = emailOrName.split('@')[0].replace(/[._-]/g, ' ');
  return localPart
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Normalize role string to valid UserRole
 */
export function normalizeUserRole(rawRole?: string | null): UserRole {
  if (!rawRole) return 'Super Admin';
  const r = rawRole.trim().toLowerCase();
  if (r === 'super admin' || r === 'superadmin' || r === 'director' || r === 'owner') return 'Super Admin';
  if (r === 'admin' || r === 'administrator' || r === 'client admin') return 'Admin';
  if (r === 'manager' || r === 'sales manager') return 'Manager';
  if (r === 'supervisor' || r === 'lead' || r === 'team lead' || r === 'floor supervisor') return 'Supervisor';
  if (r === 'rep' || r === 'sdr' || r === 'bdr' || r === 'sales rep' || r === 'agent') return 'Rep';
  return 'Super Admin';
}

/**
 * Check if a role has administrator, managerial, or supervisory clearance
 * (Super Admin, Admin, Manager, or Supervisor)
 */
export function isRoleAdmin(role: UserRole | string): boolean {
  const normalized = normalizeUserRole(role);
  return (
    normalized === 'Super Admin' ||
    normalized === 'Admin' ||
    normalized === 'Manager' ||
    normalized === 'Supervisor'
  );
}

/**
 * Check if a user role is authorized to assign or reassign leads to other agents/users.
 * Explicitly granted to: Super Admin, Admin (Client Admin), Manager, and Supervisor.
 * Strictly blocked for: Rep (SDR / Agent).
 */
export function canUserReassignLeads(role?: UserRole | string | null): boolean {
  const activeRole = role ? normalizeUserRole(role) : getStoredSession().role;
  return (
    activeRole === 'Super Admin' ||
    activeRole === 'Admin' ||
    activeRole === 'Manager' ||
    activeRole === 'Supervisor'
  );
}

/**
 * Read current session from localStorage (safe for SSR)
 */
export function getStoredSession(): SdrSession {
  if (typeof window === 'undefined') {
    return DEFAULT_SESSION;
  }

  try {
    const roleRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.ROLE);
    const emailRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.EMAIL);
    const repNameRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.REP_NAME);
    const tenantNameRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.TENANT_NAME);
    const tenantCodeRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.TENANT_CODE);
    const headcountRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.HEADCOUNT);
    const authRaw = localStorage.getItem(SDR_SESSION_STORAGE_KEYS.AUTH_FLAG);

    // Auto-migrate legacy Alex Mercer demo profile to Emil Halili / Appointmentlyy production state
    if (!repNameRaw || repNameRaw === 'Alex Mercer' || emailRaw === 'alex.mercer@apexglobalbpo.ph') {
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.REP_NAME, 'Emil Halili');
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.EMAIL, 'emil@appointmentlyy.com');
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.TENANT_NAME, 'Appointmentlyy');
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.TENANT_CODE, 'APPOINTMENTLYY');
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.HEADCOUNT, 'CEO/Founder');
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.ROLE, 'Super Admin');
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.AUTH_FLAG, 'true');
      return DEFAULT_SESSION;
    }

    return {
      role: normalizeUserRole(roleRaw || DEFAULT_SESSION.role),
      tenantName: tenantNameRaw || DEFAULT_SESSION.tenantName,
      tenantCode: tenantCodeRaw || DEFAULT_SESSION.tenantCode,
      email: emailRaw || DEFAULT_SESSION.email,
      repName: repNameRaw || (emailRaw ? formatRepNameFromEmail(emailRaw) : DEFAULT_SESSION.repName),
      headcount: headcountRaw || DEFAULT_SESSION.headcount,
      isAuthenticated: authRaw !== 'false',
    };
  } catch (err) {
    console.warn('[Session] Failed to read from localStorage:', err);
    return DEFAULT_SESSION;
  }
}

/**
 * Persist updated session to localStorage and broadcast change event
 */
export function setStoredSession(sessionUpdates: Partial<SdrSession>): SdrSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION;

  const current = getStoredSession();
  const next: SdrSession = {
    ...current,
    ...sessionUpdates,
    role: sessionUpdates.role ? normalizeUserRole(sessionUpdates.role) : current.role,
    repName: sessionUpdates.repName || (sessionUpdates.email ? formatRepNameFromEmail(sessionUpdates.email) : current.repName),
    isAuthenticated: sessionUpdates.isAuthenticated !== undefined ? sessionUpdates.isAuthenticated : true,
  };

  try {
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.ROLE, next.role);
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.TENANT_NAME, next.tenantName);
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.TENANT_CODE, next.tenantCode);
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.EMAIL, next.email);
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.REP_NAME, next.repName);
    if (next.headcount) {
      localStorage.setItem(SDR_SESSION_STORAGE_KEYS.HEADCOUNT, next.headcount);
    }
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.AUTH_FLAG, String(next.isAuthenticated));

    // Also populate legacy keys for backward compatibility
    localStorage.setItem('appointmentlyy_user_email', next.email);
    localStorage.setItem('appointmentlyy_tenant_name', next.tenantName);
    localStorage.setItem('appointmentlyy_tenant_code', next.tenantCode);
    localStorage.setItem('appointmentlyy_user_role', next.role);

    window.dispatchEvent(new CustomEvent(SDR_SESSION_EVENT, { detail: next }));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Session] Failed to write session to localStorage:', err);
  }

  return next;
}

/**
 * Clear session and broadcast
 */
export function clearStoredSession() {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(SDR_SESSION_STORAGE_KEYS.ROLE);
    localStorage.removeItem(SDR_SESSION_STORAGE_KEYS.TENANT_NAME);
    localStorage.removeItem(SDR_SESSION_STORAGE_KEYS.TENANT_CODE);
    localStorage.removeItem(SDR_SESSION_STORAGE_KEYS.EMAIL);
    localStorage.removeItem(SDR_SESSION_STORAGE_KEYS.REP_NAME);
    localStorage.removeItem(SDR_SESSION_STORAGE_KEYS.HEADCOUNT);
    localStorage.setItem(SDR_SESSION_STORAGE_KEYS.AUTH_FLAG, 'false');

    localStorage.removeItem('appointmentlyy_user_email');
    localStorage.removeItem('appointmentlyy_tenant_name');
    localStorage.removeItem('appointmentlyy_tenant_code');
    localStorage.removeItem('appointmentlyy_user_role');

    window.dispatchEvent(new CustomEvent(SDR_SESSION_EVENT, { detail: { ...DEFAULT_SESSION, isAuthenticated: false } }));
    window.dispatchEvent(new Event('storage'));
  } catch (err) {
    console.warn('[Session] Failed to clear session:', err);
  }
}

/**
 * Inspect URL search parameters and sync into session if present
 */
export function syncSessionFromUrl(): SdrSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION;

  try {
    const params = new URLSearchParams(window.location.search);
    const company = params.get('company');
    const tenant = params.get('tenant');
    const rep = params.get('rep') || params.get('email');
    const role = params.get('role');
    const seats = params.get('seats');

    if (company || tenant || rep || role) {
      const updates: Partial<SdrSession> = {};
      if (company) updates.tenantName = company;
      if (tenant) updates.tenantCode = tenant;
      if (rep) {
        updates.email = rep;
        updates.repName = formatRepNameFromEmail(rep);
      }
      if (role) updates.role = normalizeUserRole(role);
      if (seats) updates.headcount = seats;
      updates.isAuthenticated = true;

      return setStoredSession(updates);
    }
  } catch (err) {
    console.warn('[Session] Error parsing URL search params:', err);
  }

  return getStoredSession();
}

/**
 * Session store for React. Reads localStorage through useSyncExternalStore so the
 * server render and the first client render agree (DEFAULT_SESSION), then React
 * re-renders with the stored session. This avoids hydration mismatches.
 */
interface SessionSnapshot {
  session: SdrSession;
  canAccessIcp: boolean;
}

const SERVER_SNAPSHOT: SessionSnapshot = {
  session: DEFAULT_SESSION,
  canAccessIcp: true, // DEFAULT_SESSION is Super Admin
};

let cachedKey = '';
let cachedSnapshot: SessionSnapshot = SERVER_SNAPSHOT;

function getSessionSnapshot(): SessionSnapshot {
  const session = getStoredSession();
  const canAccessIcp = canUserAccessIcpBuilder(session.role);
  const key = JSON.stringify(session) + String(canAccessIcp);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSnapshot = { session, canAccessIcp };
  }
  return cachedSnapshot;
}

function subscribeToSession(onChange: () => void) {
  window.addEventListener(SDR_SESSION_EVENT, onChange);
  window.addEventListener(ROLE_PERMISSIONS_UPDATED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SDR_SESSION_EVENT, onChange);
    window.removeEventListener(ROLE_PERMISSIONS_UPDATED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * React hook for consuming and updating SDR session
 */
export function useSession() {
  const { session, canAccessIcp } = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => {
    // Initial sync from URL search params if present (broadcasts an update event).
    syncSessionFromUrl();
  }, []);

  const updateSession = useCallback((updates: Partial<SdrSession>) => setStoredSession(updates), []);

  const logout = useCallback(() => {
    clearStoredSession();
  }, []);

  return {
    session,
    role: session.role,
    tenantName: session.tenantName,
    tenantCode: session.tenantCode,
    email: session.email,
    repName: session.repName,
    isAuthenticated: session.isAuthenticated,
    isAdmin: isRoleAdmin(session.role),
    canAccessIcp,
    updateSession,
    logout,
  };
}
