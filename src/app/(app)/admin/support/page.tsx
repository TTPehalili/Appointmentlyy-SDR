'use client';

import { Suspense } from 'react';
import TicketDeskHub from '@/components/tickets/TicketDeskHub';
import { Skeleton } from '@/components/ui';

/** Admin › Support: the workspace's own tickets (customer desk). */
export default function Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">
      <Suspense fallback={<div className="flex flex-col gap-2 p-6"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div>}>
        <TicketDeskHub perspective="tenant" />
      </Suspense>
    </div>
  );
}
