'use client';

import { SettingsShell } from '@/components/shell/SettingsShell';
import { ADMIN_NAV } from '@/lib/adminNav';

/** Admin: one place for all management (redesign spec 3.4). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsShell groups={ADMIN_NAV} title="Admin" entryPermission="admin">
      {children}
    </SettingsShell>
  );
}
