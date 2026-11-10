'use client';

import * as React from 'react';
import { applyBrand } from '@/lib/theme';
import { DEMO_LOGIN, useServerAuth } from '@/lib/authClient';
import { useWhiteLabel } from './WorkspaceSwitcher';

/**
 * Keeps the brand colour on <html> in sync with the signed-in workspace's branding (saved on the
 * server in Admin › Branding), or with the white-label config when the app is served from a
 * client's custom domain. Saving a new colour re-themes the app immediately.
 */
export function ThemeSync() {
  const whiteLabel = useWhiteLabel();
  const { status, identity } = useServerAuth();
  const workspaceBrand = identity?.branding?.brandColor ?? null;
  const brand = whiteLabel?.branding.brandColor ?? workspaceBrand;
  // Wait for the server identity before clearing a brand set by the boot script (no flash).
  const ready = DEMO_LOGIN || status !== 'unknown' || Boolean(whiteLabel);
  React.useEffect(() => {
    if (ready) applyBrand(brand);
  }, [brand, ready]);
  return null;
}
