'use client';

import { ClientOnly } from '@/components/shell/ClientOnly';
import { Skeleton } from '@/components/ui';
import DoNotContactManager from '@/components/admin/DoNotContactManager';

/** Admin › Do Not Contact: the workspace's list, single removal and "undo entries added by a teammate". */
export default function Page() {
  return (
    <div className="px-4 py-6 md:px-8">
      <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
        <DoNotContactManager />
      </ClientOnly>
    </div>
  );
}
