'use client';

import * as React from 'react';

const subscribe = () => () => {};

/**
 * Renders children only in the browser. Used for admin tools that were previously
 * shown only after a tab click (so never server-rendered) and read dates or
 * localStorage while rendering.
 */
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const isClient = React.useSyncExternalStore(subscribe, () => true, () => false);
  return <>{isClient ? children : fallback}</>;
}
