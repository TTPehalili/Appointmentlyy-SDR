'use client';

import { useState, useEffect, useCallback } from 'react';

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
};

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
 * React hook for consuming and updating SDR session
 */
export function useSession() {
  const [session, setSession] = useState<SdrSession>(() => getStoredSession());

  useEffect(() => {
    // Initial sync from URL search params if present
    const synced = syncSessionFromUrl();
    setSession(synced);

    const handleUpdate = (e: Event) => {
      if (e instanceof CustomEvent && e.detail) {
        setSession(e.detail as SdrSession);
      } else {
        setSession(getStoredSession());
      }
    };

    window.addEventListener(SDR_SESSION_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(SDR_SESSION_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const updateSession = useCallback((updates: Partial<SdrSession>) => {
    const updated = setStoredSession(updates);
    setSession(updated);
    return updated;
  }, []);

  const logout = useCallback(() => {
    clearStoredSession();
    setSession({ ...DEFAULT_SESSION, isAuthenticated: false });
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
    updateSession,
    logout,
  };
}
