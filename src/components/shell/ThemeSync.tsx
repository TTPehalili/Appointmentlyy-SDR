'use client';

import * as React from 'react';
import { applyBrand } from '@/lib/theme';
import { useWhiteLabel } from './WorkspaceSwitcher';

/**
 * Keeps the tenant brand colour on <html> in sync with the white-label config for this
 * host (custom domain or Super Admin domain preview). Saving a new colour in
 * Admin › Branding & domains re-themes the app immediately.
 */
export function ThemeSync() {
  const whiteLabel = useWhiteLabel();
  const brand = whiteLabel?.branding.brandColor ?? null;
  React.useEffect(() => {
    applyBrand(brand);
  }, [brand]);
  return null;
}
