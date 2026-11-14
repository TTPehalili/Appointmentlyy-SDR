/**
 * Workspace selection colour (Admin › Appearance).
 *
 * Selected states (toggles, segmented controls, tabs, chips, selected rows, active nav) use five
 * role tokens from globals.css: --selected, --selected-hover, --selected-fg, --selected-soft and
 * --selected-soft-fg. A workspace may pick its own base colour per theme; everything else is
 * derived here so every client still clears WCAG contrast.
 *
 * Pure and dependency-free (no React, no DOM except the clearly marked apply helpers), so the
 * server can validate with the same rules the admin page previews with, and node:test can run it.
 */

export type SelectionTheme = 'light' | 'dark';

/** Stored on the tenant's branding. Undefined = platform default for that theme. */
export interface SelectionColours {
  light?: string;
  dark?: string;
}

export interface SelectionTokens {
  '--selected': string;
  '--selected-hover': string;
  '--selected-fg': string;
  '--selected-soft': string;
  '--selected-soft-fg': string;
}

export const SELECTION_TOKEN_KEYS: (keyof SelectionTokens)[] = ['--selected', '--selected-hover', '--selected-fg', '--selected-soft', '--selected-soft-fg'];

const WHITE = '#FFFFFF';
const BLACK = '#000000';
const INK_50 = '#FAFAF9';
const INK_900 = '#1C1917';
const INK_950 = '#0C0A09';
const CANVAS = '#FAF9F5';

/** What each theme's selection sits on: the surface it is checked against, plus the page behind it. */
const SURFACES: Record<SelectionTheme, { surface: string; app: string }> = {
  light: { surface: WHITE, app: CANVAS },
  dark: { surface: INK_900, app: INK_950 },
};

/** Platform defaults (globals.css): black in light theme, violet in dark theme. */
export const DEFAULT_SELECTION: Required<SelectionColours> = { light: INK_900, dark: '#9810FA' };

export const MIN_FILL_CONTRAST = 3;
export const MIN_TEXT_CONTRAST = 4.5;

export interface SelectionPreset {
  id: string;
  label: string;
  hex: string;
}

export const SELECTION_PRESETS: Record<SelectionTheme, SelectionPreset[]> = {
  light: [
    { id: 'black', label: 'Black', hex: '#1C1917' },
    { id: 'purple', label: 'Purple', hex: '#9810FA' },
    { id: 'blue', label: 'Blue', hex: '#2563EB' },
    { id: 'green', label: 'Green', hex: '#0E744A' },
    { id: 'teal', label: 'Teal', hex: '#0F766E' },
  ],
  dark: [
    { id: 'purple', label: 'Purple', hex: '#9810FA' },
    { id: 'white', label: 'White', hex: '#FAFAF9' },
    { id: 'blue', label: 'Blue', hex: '#3B82F6' },
    { id: 'green', label: 'Green', hex: '#10B981' },
    { id: 'teal', label: 'Teal', hex: '#14B8A6' },
  ],
};

const STRICT_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Strict `#RRGGBB` (what the API accepts), upper-cased; null otherwise. */
export function parseHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return STRICT_HEX_RE.test(v) ? v.toUpperCase() : null;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Linear sRGB mix: `weight` is the share of `b`. */
export function mixHex(a: string, b: string, weight: number): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return toHex([r1 + (r2 - r1) * weight, g1 + (g2 - g1) * weight, b1 + (b2 - b1) * weight]);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SOFT_ALPHA_DARK = 0.22;
const SOFT_SHARE_LIGHT = 0.14;

export interface SelectionCheck {
  ok: boolean;
  /** Plain-language result; the reason when not ok. */
  message: string;
  theme: SelectionTheme;
  hex: string;
  /** Always present (also when not ok) so a preview can show why a colour fails. */
  tokens: SelectionTokens;
  ratios: {
    /** Fill against the theme surface (white / ink-900). Needs 3:1. */
    fill: number;
    /** --selected-fg on the fill. Needs 4.5:1. */
    text: number;
    /** --selected-soft-fg on the soft background. Needs 4.5:1. */
    softText: number;
  };
}

/**
 * Derive the five tokens for `base` in `theme`, checked against `surface` (defaults to the
 * theme's own: white in light, ink-900 in dark).
 * - selected: the base.
 * - hover: slightly darker in light, slightly lighter in dark (the other way for near-black /
 *   near-white bases, which can't go further).
 * - fg: white or near-black, whichever contrasts more with the fill (needs 4.5:1).
 * - soft: light = base mixed 14% into white; dark = base at 22% alpha.
 * - soft-fg: the closest shade of the base reaching 4.5:1 on the soft background and the surface.
 */
export function checkSelectionColour(value: string, theme: SelectionTheme, surfaceOverride?: string): SelectionCheck {
  const hex = parseHex(value) ?? DEFAULT_SELECTION[theme];
  const surface = surfaceOverride ?? SURFACES[theme].surface;
  const backdrops = surfaceOverride ? [surfaceOverride] : [SURFACES[theme].surface, SURFACES[theme].app];

  // Near-black (light) or near-white (dark) bases can't go further, so they step the other way.
  const hover =
    theme === 'light'
      ? contrastRatio(hex, BLACK) < 1.6
        ? mixHex(hex, WHITE, 0.08)
        : mixHex(hex, BLACK, 0.12)
      : contrastRatio(hex, WHITE) < 1.25
        ? mixHex(hex, BLACK, 0.1)
        : mixHex(hex, WHITE, 0.14);
  const onWhite = contrastRatio(hex, WHITE);
  const onInk = contrastRatio(hex, INK_900);
  const fg = onWhite >= onInk ? WHITE : INK_900;
  const text = Math.max(onWhite, onInk);

  let soft: string;
  let softSolid: string; // what the soft background looks like on the surface (for contrast maths)
  if (theme === 'light') {
    soft = mixHex(hex, WHITE, 1 - SOFT_SHARE_LIGHT);
    softSolid = soft;
  } else {
    const [r, g, b] = toRgb(hex);
    soft = `rgba(${r}, ${g}, ${b}, ${SOFT_ALPHA_DARK})`;
    softSolid = mixHex(surface, hex, SOFT_ALPHA_DARK);
  }

  // Walk from the base toward black (light) or white (dark) until the text reads on every backdrop.
  const toward = theme === 'light' ? BLACK : WHITE;
  const start = theme === 'light' ? 0 : 0.5;
  const reads = (c: string) => contrastRatio(c, softSolid) >= MIN_TEXT_CONTRAST && backdrops.every((bg) => contrastRatio(c, bg) >= MIN_TEXT_CONTRAST);
  let softFg = mixHex(hex, toward, start);
  for (let w = start; w <= 1.0001; w += 0.05) {
    softFg = mixHex(hex, toward, Math.min(1, w));
    if (reads(softFg)) break;
  }
  const softText = contrastRatio(softFg, softSolid);

  const tokens: SelectionTokens = {
    '--selected': hex,
    '--selected-hover': hover,
    '--selected-fg': fg,
    '--selected-soft': soft,
    '--selected-soft-fg': softFg,
  };
  const fill = contrastRatio(hex, surface);
  const ratios = { fill, text, softText };

  if (!parseHex(value)) return { ok: false, message: 'Enter a 6-digit hex colour, like #2563EB.', theme, hex, tokens, ratios };
  if (fill < MIN_FILL_CONTRAST) {
    const message = theme === 'light' ? 'Too light to see on a white background. Pick a darker colour.' : 'Too dark to see in dark mode. Pick a lighter colour.';
    return { ok: false, message, theme, hex, tokens, ratios };
  }
  if (text < MIN_TEXT_CONTRAST) {
    return { ok: false, message: 'Text on this colour would be hard to read in white or black. Pick a darker or lighter shade.', theme, hex, tokens, ratios };
  }
  if (softText < MIN_TEXT_CONTRAST) {
    return { ok: false, message: 'Selected rows would be hard to read with this colour. Pick another shade.', theme, hex, tokens, ratios };
  }
  return { ok: true, message: 'Passes contrast checks.', theme, hex, tokens, ratios };
}

/** Tokens for the platform default of a theme (mirrors globals.css). */
export const DEFAULT_SELECTION_TOKENS: Record<SelectionTheme, SelectionTokens> = {
  light: { '--selected': INK_900, '--selected-hover': '#292524', '--selected-fg': WHITE, '--selected-soft': '#E7E5E4', '--selected-soft-fg': INK_900 },
  dark: { '--selected': '#9810FA', '--selected-hover': '#A42CFF', '--selected-fg': WHITE, '--selected-soft': 'rgba(152, 16, 250, 0.22)', '--selected-soft-fg': '#D9B3FF' },
};

/** Tokens a theme actually shows for a stored value (default tokens when unset or invalid). */
export function selectionTokensFor(value: string | undefined, theme: SelectionTheme): SelectionTokens {
  const hex = parseHex(value);
  if (!hex || hex === DEFAULT_SELECTION[theme]) return DEFAULT_SELECTION_TOKENS[theme];
  const c = checkSelectionColour(hex, theme);
  return c.ok ? c.tokens : DEFAULT_SELECTION_TOKENS[theme];
}

/**
 * Validate a stored / submitted pair. Empty, null or the platform default = unset.
 * Returns the cleaned value or the first error.
 */
export function cleanSelection(input: unknown): { ok: true; value: SelectionColours } | { ok: false; error: string; theme?: SelectionTheme } {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const value: SelectionColours = {};
  for (const theme of ['light', 'dark'] as const) {
    const raw = src[theme];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) continue;
    const hex = parseHex(raw);
    const label = theme === 'light' ? 'Light theme' : 'Dark theme';
    if (!hex) return { ok: false, error: `${label}: use a 6-digit hex colour like #2563EB.`, theme };
    if (hex === DEFAULT_SELECTION[theme]) continue;
    const c = checkSelectionColour(hex, theme);
    if (!c.ok) return { ok: false, error: `${label}: ${c.message}`, theme };
    value[theme] = hex;
  }
  return { ok: true, value };
}

const declarations = (t: SelectionTokens) => SELECTION_TOKEN_KEYS.map((k) => `${k}:${t[k]}`).join(';');

const DARK_PANELS = ':is(.bg-inverse, .bg-ink-950, .bg-ink-900)';

/**
 * The stylesheet that overrides the platform defaults. Empty string = nothing to override.
 * Selectors out-rank globals.css whatever the stylesheet order:
 * - light on `:root:not([data-theme="dark"])` (0,2,0 over :root);
 * - dark panels in light theme keep the white treatment from globals.css unless the custom colour
 *   is clearly visible on ink-950, then they use its dark-surface variant;
 * - dark on `:root[data-theme="dark"]` and nested dark containers (0,2,0 over 0,1,0), screen only
 *   like globals.css (printouts stay light).
 */
export function buildSelectionCss(selection: SelectionColours | undefined | null): string {
  if (!selection) return '';
  const out: string[] = [];
  const light = parseHex(selection.light);
  if (light && light !== DEFAULT_SELECTION.light) {
    const c = checkSelectionColour(light, 'light');
    if (c.ok) {
      out.push(`:root:not([data-theme="dark"]){${declarations(c.tokens)}}`);
      const panel = checkSelectionColour(light, 'dark', INK_950);
      if (panel.ok) out.push(`:root:root:not([data-theme="dark"]) ${DARK_PANELS}{${declarations(panel.tokens)}}`);
    }
  }
  const dark = parseHex(selection.dark);
  if (dark && dark !== DEFAULT_SELECTION.dark) {
    const c = checkSelectionColour(dark, 'dark');
    if (c.ok) out.push(`@media screen{:root[data-theme="dark"],:root [data-theme="dark"]{${declarations(c.tokens)}}}`);
  }
  return out.join('\n');
}

/** Role tokens for a mini preview forced to one theme, wherever it sits on the page. */
export const PREVIEW_THEME_VARS: Record<SelectionTheme, Record<string, string>> = {
  light: {
    '--bg-app': CANVAS,
    '--bg-surface': WHITE,
    '--bg-subtle': '#F5F5F4',
    '--text-primary': INK_900,
    '--text-secondary': '#57534D',
    '--text-tertiary': 'color-mix(in srgb, #79716B 80%, #57534D)',
    '--border-default': '#E7E5E4',
    '--border-strong': '#D6D3D1',
    colorScheme: 'light',
  },
  dark: {
    '--bg-app': INK_950,
    '--bg-surface': INK_900,
    '--bg-subtle': '#292524',
    '--text-primary': INK_50,
    '--text-secondary': '#A6A09B',
    '--text-tertiary': '#79716B',
    '--border-default': '#292524',
    '--border-strong': '#44403B',
    colorScheme: 'dark',
  },
};

// ------------------------------------------------------------------ browser application

/** <style> element holding the overrides, and the localStorage copy the boot script applies before paint. */
export const SELECTION_STYLE_ID = 'appy-selection-colour';
export const SELECTION_CSS_KEY = 'appy_selection_css';

/** Characters the generated CSS can contain; the boot script refuses anything else. */
const SAFE_CSS_SOURCE = '^[-\\w\\s#:;,.()\\[\\]="{}@]*$';

/**
 * Inline <head> script: re-applies the last workspace selection colour before first paint, so
 * custom colours don't flash the default. ThemeSync replaces or clears it once the server
 * identity is known (e.g. after switching workspace).
 */
export const SELECTION_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('${SELECTION_CSS_KEY}');if(!c||!new RegExp('${SAFE_CSS_SOURCE.replace(/\\/g, '\\\\')}').test(c))return;var s=document.createElement('style');s.id='${SELECTION_STYLE_ID}';s.textContent=c;document.head.appendChild(s)}catch(e){}})();`;

/** Apply (or clear, with undefined / empty) the workspace selection colours and cache them for the boot script. */
export function applySelection(selection: SelectionColours | undefined | null) {
  if (typeof document === 'undefined') return;
  const css = buildSelectionCss(selection);
  let el = document.getElementById(SELECTION_STYLE_ID) as HTMLStyleElement | null;
  try {
    if (css) localStorage.setItem(SELECTION_CSS_KEY, css);
    else localStorage.removeItem(SELECTION_CSS_KEY);
  } catch {
    /* private mode: still apply for this page */
  }
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = SELECTION_STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}
