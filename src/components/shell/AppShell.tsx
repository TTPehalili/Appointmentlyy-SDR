'use client';

import * as React from 'react';
import { ToastProvider } from '@/components/ui';
import { ShellProvider, useShell } from './ShellContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { AnnouncementRibbon } from '@/components/announcements/AnnouncementRibbon';
import { ImpersonationBanner } from './ImpersonationBanner';
import { CopilotPanel } from './CopilotPanel';
import { MobileTabBar } from './MobileTabBar';
import { ShellCommandPalette } from './ShellCommandPalette';
import { ThemeSync } from './ThemeSync';
import { SessionSync } from './SessionSync';
import { ProductTour } from '@/components/tour/ProductTour';
import { cn } from '@/lib/cn';

/**
 * App shell (redesign spec 4):
 *   [impersonation banner, when viewing a client workspace]
 *   Sidebar 240/64 │ Top bar 56 ─────────────────────│
 *                  │ Page content          │ Copilot │
 * Mobile: bottom tab bar, Copilot as a bottom sheet.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ToastProvider>
        <div className="flex h-dvh w-full flex-col overflow-hidden bg-app text-fg">
          <a
            href="#main"
            className="sr-only z-[70] rounded-md bg-action px-3 py-2 text-body font-medium text-action-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
          >
            Skip to main content
          </a>
          <ImpersonationBanner />
          <div className="flex min-h-0 flex-1">
            {/* URL-reading shell parts sit in Suspense so dynamic routes can still prerender (Cache Components). */}
            <React.Suspense fallback={<SidebarPlaceholder />}>
              <Sidebar />
            </React.Suspense>
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <AnnouncementRibbon />
              <div className="flex min-h-0 flex-1">
                <main id="main" tabIndex={-1} className="relative outline-none flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
                  {children}
                </main>
                <React.Suspense fallback={null}>
                  <CopilotPanel />
                </React.Suspense>
              </div>
            </div>
          </div>
          <React.Suspense fallback={null}>
            <MobileTabBar />
          </React.Suspense>
        </div>
        <ShellCommandPalette />
        <ThemeSync />
        <React.Suspense fallback={null}>
          <SessionSync />
        </React.Suspense>
        <React.Suspense fallback={null}>
          <ProductTour />
        </React.Suspense>
      </ToastProvider>
    </ShellProvider>
  );
}

/** Same footprint as the sidebar while it streams in, so content doesn't shift. */
function SidebarPlaceholder() {
  const { collapsed } = useShell();
  return <div aria-hidden className={cn('hidden shrink-0 border-r border-line bg-app md:block', collapsed ? 'w-16' : 'w-60')} />;
}
