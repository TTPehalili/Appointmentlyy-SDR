'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { AdminNavGroup } from '@/lib/adminNav';
import { useVisibleGroups } from './SettingsShell';

/** Sends /admin and /platform to the first section the current role can open. */
export function SectionRedirect({ groups }: { groups: AdminNavGroup[] }) {
  const router = useRouter();
  const first = useVisibleGroups(groups)[0]?.items[0]?.href;
  React.useEffect(() => {
    if (first) router.replace(first);
  }, [first, router]);
  return null;
}
