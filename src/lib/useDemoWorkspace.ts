'use client';

import { DEMO_LOGIN } from '@/lib/demoMode';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { useSession } from '@/lib/session';

/**
 * React view of isDemoWorkspace(): true in demo builds or for anyone in the platform's own
 * (demo) workspace. Every client workspace (and "Open workspace" into one) gets false,
 * so screens show their real, initially empty, data.
 */
export function useDemoWorkspace(): boolean {
  const { tenantCode } = useSession();
  return DEMO_LOGIN || tenantCode === PLATFORM_TENANT_CODE;
}
