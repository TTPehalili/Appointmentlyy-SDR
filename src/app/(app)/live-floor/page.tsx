'use client';

import React from 'react';
import LiveMonitoringCenter from '@/components/LiveMonitoringCenter';

export default function LiveMonitoringPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <LiveMonitoringCenter />
        </main>
      </div>
    </div>
  );
}
