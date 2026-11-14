'use client';

import * as React from 'react';
import { applyBrand } from '@/lib/theme';
import { applySelection } from '@/lib/selectionColour';
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

  // Selection colour (Admin › Appearance): the boot script re-applies the last workspace's colours
  // before paint; once the server says who is signed in, apply this workspace's (or clear them).
  const sel = identity?.branding?.selection;
  const selLight = sel?.light ?? '';
  const selDark = sel?.dark ?? '';
  React.useEffect(() => {
    if (status === 'unknown') return;
    applySelection(status === 'signed-in' ? { light: selLight, dark: selDark } : null);
  }, [status, selLight, selDark]);
  return null;
}
