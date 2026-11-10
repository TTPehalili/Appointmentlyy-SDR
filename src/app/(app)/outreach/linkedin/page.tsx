'use client';

import React, { Suspense } from 'react';
import LinkedInCreatorStudio from '@/components/linkedin/LinkedInCreatorStudio';

export default function LinkedInPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8 text-small text-fg-tertiary">
              Loading LinkedIn studio...
            </div>
          }>
            <LinkedInCreatorStudio />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
