'use client';

import React from 'react';
import LinkedInCreatorStudio from '@/components/linkedin/LinkedInCreatorStudio';

export default function LinkedInPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-zinc-50/70 font-sans antialiased text-zinc-900">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <LinkedInCreatorStudio />
        </main>
      </div>
    </div>
  );
}
