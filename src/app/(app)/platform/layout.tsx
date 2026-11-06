'use client';

import { SettingsShell } from '@/components/shell/SettingsShell';
import { PLATFORM_NAV } from '@/lib/adminNav';

/** Platform Console (Super Admin): dark ink sub-nav so the cross-tenant context is unmistakable. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsShell groups={PLATFORM_NAV} title="Platform Console" tone="dark" entryPermission="platform">
      {children}
    </SettingsShell>
  );
}
