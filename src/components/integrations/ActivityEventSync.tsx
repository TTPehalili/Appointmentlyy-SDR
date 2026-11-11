'use client';

import * as React from 'react';
import { startActivityEventSync } from '@/lib/activityEvents';

/** Sends activity events left unsent from an earlier visit (offline, closed tab). Renders nothing. */
export function ActivityEventSync() {
  React.useEffect(() => {
    startActivityEventSync();
  }, []);
  return null;
}
