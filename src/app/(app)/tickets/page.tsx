'use client';

import React, { Suspense } from 'react';
import TicketDeskHub from '@/components/tickets/TicketDeskHub';

export default function TicketsPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-zinc-50/70 font-sans antialiased text-zinc-900">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-hidden p-2 sm:p-3 flex flex-col min-h-0">
          <Suspense fallback={
            <div className="p-8 flex items-center justify-center text-xs text-zinc-400">
              Loading Support Ticket Desk...
            </div>
          }>
            <TicketDeskHub />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
