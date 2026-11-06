'use client';

import * as React from 'react';
import { ToastProvider } from '@/components/ui';
import { ShellProvider } from './ShellContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ImpersonationBanner } from './ImpersonationBanner';
import { CopilotPanel } from './CopilotPanel';
import { MobileTabBar } from './MobileTabBar';
import { ShellCommandPalette } from './ShellCommandPalette';

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
          <ImpersonationBanner />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <div className="flex min-h-0 flex-1">
                <main id="main" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
                  {children}
                </main>
                <CopilotPanel />
              </div>
            </div>
          </div>
          <MobileTabBar />
        </div>
        <ShellCommandPalette />
      </ToastProvider>
    </ShellProvider>
  );
}
