'use client';

import { useSession } from '@/lib/session';
import { can } from '@/lib/permissions';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { NAV_ITEMS, type NavItem } from '@/lib/nav';

/** Nav items the current user may see. Hidden, never shown disabled (spec 3.2). */
export function useVisibleNav(): NavItem[] {
  const { role, canAccessIcp } = useSession();
  return NAV_ITEMS.filter((item) => {
    if (item.featureFlag && !isFeatureEnabled(item.featureFlag)) return false;
    if (!item.permission) return true;
    if (item.permission === 'leadFinder') return canAccessIcp;
    return can(role, item.permission);
  });
}
