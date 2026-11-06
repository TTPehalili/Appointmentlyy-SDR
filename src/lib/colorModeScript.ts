/**
 * Light / System / Dark appearance preference: server-safe parts (no React), so the
 * root layout can inline the boot script. The hook lives in colorMode.ts (client).
 */
export type ColorMode = 'light' | 'system' | 'dark';

export const COLOR_MODE_KEY = 'appy_color_mode';
export const COLOR_MODE_EVENT = 'appy:color-mode';

export function isColorMode(v: unknown): v is ColorMode {
  return v === 'light' || v === 'system' || v === 'dark';
}

/**
 * Inline <head> script: applies the saved mode before first paint (no light flash for
 * dark users) and keeps "System" in step with the OS setting while the tab is open.
 */
export const COLOR_MODE_BOOT_SCRIPT = `(function(){try{var k='${COLOR_MODE_KEY}',q=window.matchMedia('(prefers-color-scheme: dark)');function a(){var m=localStorage.getItem(k);if(m!=='light'&&m!=='dark')m='system';var d=m==='dark'||(m==='system'&&q.matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}a();q.addEventListener('change',a);window.addEventListener('storage',function(e){if(e.key===k)a()});window.addEventListener('${COLOR_MODE_EVENT}',a)}catch(e){}})();`;
