'use client';

import { useSyncExternalStore } from 'react';
import { COLOR_MODE_EVENT as CHANGE_EVENT, COLOR_MODE_KEY, isColorMode, type ColorMode } from './colorModeScript';

export type { ColorMode };

/**
 * Light / System / Dark appearance preference (per device, chosen in Settings).
 * The resolved theme is written to <html data-theme>, which globals.css keys the
 * dark role tokens on. Brand (white-label) colours are independent of this.
 */
export function getColorMode(): ColorMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = localStorage.getItem(COLOR_MODE_KEY);
    return isColorMode(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function setColorMode(mode: ColorMode) {
  try {
    if (mode === 'system') localStorage.removeItem(COLOR_MODE_KEY);
    else localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    /* storage blocked: still apply for this page view */
  }
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  // The boot script listens for this too, so every listener re-resolves consistently.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === COLOR_MODE_KEY && onChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Current preference; 'system' during SSR so server and first client render agree. */
export function useColorMode(): [ColorMode, (mode: ColorMode) => void] {
  const mode = useSyncExternalStore(subscribe, getColorMode, () => 'system' as ColorMode);
  return [mode, setColorMode];
}
