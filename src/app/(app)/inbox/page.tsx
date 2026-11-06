'use client';

import React, { Suspense } from 'react';
import UnifiedEmailInbox from '@/components/email/UnifiedEmailInbox';

export default function InboxPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-6 md:px-8">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8 text-small text-fg-tertiary">
              Loading inbox...
            </div>
          }>
            <UnifiedEmailInbox />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
