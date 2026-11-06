'use client';

import * as React from 'react';
import { canUserAccessIcpBuilder, normalizeUserRole, useSession, type UserRole } from '@/lib/session';

/**
 * UI-side permission model (redesign spec 3.2 and 8). The UI only mirrors access;
 * the server must enforce it too.
 *
 * DESIGN-NOTE: the session has no "Agency Admin" role yet. Our roles map as:
 *   Rep → Rep · Supervisor/Manager → Manager · Admin (Client Admin) → Org Admin · Super Admin → Super Admin
 * Agency-level areas are therefore Super Admin only until an agency role exists.
 */
export type Permission =
  | 'work' // Home → Reports
  | 'team' // Live floor, Coaching
  | 'leadFinder' // ICP builder, also gated by the role permission matrix
  | 'admin' // Admin area entry and team-level sections (Manager+)
  | 'adminOrg' // Org-level Admin sections: members, roles, integrations, branding, billing, audit (Org Admin+)
  | 'agency' // Agency clients, white-label, billing
  | 'platform' // Platform Console, cross-tenant views
  | 'switchWorkspace'; // switch between client workspaces

const RANK: Record<UserRole, number> = {
  Rep: 0,
  Supervisor: 1,
  Manager: 1,
  Admin: 2,
  'Super Admin': 4,
};

export function can(role: UserRole | string, permission: Permission): boolean {
  const r = normalizeUserRole(role);
  const rank = RANK[r];
  switch (permission) {
    case 'work':
      return true;
    case 'team':
      return rank >= 1;
    case 'leadFinder':
      return canUserAccessIcpBuilder(r);
    case 'admin':
      return rank >= 1;
    case 'adminOrg':
      return rank >= 2;
    case 'agency':
    case 'platform':
    case 'switchWorkspace':
      return rank >= 4;
  }
}

export function usePermission(permission: Permission): boolean {
  const { role, canAccessIcp } = useSession();
  // canAccessIcp is kept live by useSession when the role matrix changes.
  if (permission === 'leadFinder') return canAccessIcp;
  return can(role, permission);
}

/** Renders children only when the current user has the permission. */
export function Gate({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  return usePermission(permission) ? <>{children}</> : <>{fallback}</>;
}
