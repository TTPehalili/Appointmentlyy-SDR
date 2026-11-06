/**
 * White-label theming (redesign spec 7).
 *
 * Only the --brand-* tokens are tenant-overridable. Neutrals, semantic colours, type and
 * layout stay locked so every tenant still looks enterprise-grade.
 */

export interface TenantTheme {
  name: string;
  logoUrl?: string;
  markUrl?: string;
  faviconUrl?: string;
  /** Tenant primary (hex). Undefined = Appointmentlyy crimson. */
  brand500?: string;
  supportEmail?: string;
  hidePoweredBy: boolean;
  emailFromDomain?: string;
}

/** Cookie carrying the active tenant brand colour so the <head> script can apply it before paint. */
export const BRAND_COOKIE = 'appy_brand';
export const DEFAULT_BRAND_500 = '#FF0943';

const HEX_RE = /^#([0-9a-f]{6})$/i;
const WHITE = '#FFFFFF';
const INK_900 = '#1C1917';
const CANVAS = '#FAF9F5';

export function normalizeHex(value: string | undefined | null): string | null {
  if (!value) return null;
  let v = value.trim();
  if (!v.startsWith('#')) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return HEX_RE.test(v) ? v.toUpperCase() : null;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Linear sRGB mix: weight is the share of `b`. */
function mix(a: string, b: string, weight: number): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return toHex([r1 + (r2 - r1) * weight, g1 + (g2 - g1) * weight, b1 + (b2 - b1) * weight]);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export interface BrandTokens {
  '--brand-500': string;
  '--brand-600': string;
  '--brand-700': string;
  '--brand-50': string;
  '--brand-contrast': string;
}

/**
 * Derive the brand scale from one tenant colour. 600 is the button fill on light
 * backgrounds, 700 hover/pressed, 50 the selected-row tint; contrast is white or ink-900,
 * whichever reads better on 600.
 */
export function deriveBrandTokens(brand500: string): BrandTokens {
  const base = normalizeHex(brand500) ?? DEFAULT_BRAND_500;
  const b600 = mix(base, '#000000', 0.15);
  const b700 = mix(base, '#000000', 0.3);
  const b50 = mix(base, WHITE, 0.94);
  const contrast = contrastRatio(WHITE, b600) >= contrastRatio(INK_900, b600) ? WHITE : INK_900;
  return { '--brand-500': base, '--brand-600': b600, '--brand-700': b700, '--brand-50': b50, '--brand-contrast': contrast };
}

export interface BrandCheck {
  ok: boolean;
  /** Button text on the brand fill (brand-600 vs its contrast colour). AA needs 4.5. */
  buttonText: number;
  /** Brand glyphs, focus rings and borders on the canvas. UI glyphs need 3. */
  onCanvas: number;
  message: string;
}

/** Reject brand colours that can't reach 3:1 for UI glyphs (spec 7.3). */
export function checkBrandColor(value: string): BrandCheck {
  const hex = normalizeHex(value);
  if (!hex) return { ok: false, buttonText: 0, onCanvas: 0, message: 'Enter a 6-digit hex colour, like #FF0943.' };
  const t = deriveBrandTokens(hex);
  const buttonText = contrastRatio(t['--brand-600'], t['--brand-contrast']);
  const onCanvas = contrastRatio(t['--brand-600'], CANVAS);
  if (onCanvas < 3) {
    return { ok: false, buttonText, onCanvas, message: 'Too light: brand buttons and icons would be hard to see on the page. Pick a darker colour.' };
  }
  if (buttonText < 4.5) {
    return { ok: true, buttonText, onCanvas, message: 'Works, but button text is below AA (4.5:1). A slightly darker shade reads better.' };
  }
  return { ok: true, buttonText, onCanvas, message: 'Passes contrast checks.' };
}

/**
 * Inline <head> script: applies the brand cookie before first paint (no flash).
 * Mirrors deriveBrandTokens; kept dependency-free and tiny.
 */
export const BRAND_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${BRAND_COOKIE}=([^;]+)/);if(!m)return;var h=decodeURIComponent(m[1]);if(!/^#[0-9a-fA-F]{6}$/.test(h))return;var n=parseInt(h.slice(1),16),c=[(n>>16)&255,(n>>8)&255,n&255];function x(w,t){return'#'+c.map(function(v,i){return Math.round(v+(t[i]-v)*w).toString(16).padStart(2,'0')}).join('')}function L(a){return a.map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}).reduce(function(s,v,i){return s+v*[0.2126,0.7152,0.0722][i]},0)}var d=x(0.15,[0,0,0]),dn=parseInt(d.slice(1),16),dl=L([(dn>>16)&255,(dn>>8)&255,dn&255]),cw=1.05/(dl+0.05),ci=(dl+0.05)/(L([28,25,23])+0.05),s=document.documentElement.style;s.setProperty('--brand-500',h);s.setProperty('--brand-600',d);s.setProperty('--brand-700',x(0.3,[0,0,0]));s.setProperty('--brand-50',x(0.94,[255,255,255]));s.setProperty('--brand-contrast',cw>=ci?'#FFFFFF':'#1C1917')}catch(e){}})();`;

/** Apply (or clear, with null) the tenant brand on <html> and persist it for the boot script. */
export function applyBrand(brand500: string | null) {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  const hex = normalizeHex(brand500);
  const keys: (keyof BrandTokens)[] = ['--brand-500', '--brand-600', '--brand-700', '--brand-50', '--brand-contrast'];
  if (!hex || hex === DEFAULT_BRAND_500) {
    keys.forEach((k) => style.removeProperty(k));
    document.cookie = `${BRAND_COOKIE}=; path=/; max-age=0; samesite=lax`;
    return;
  }
  const tokens = deriveBrandTokens(hex);
  keys.forEach((k) => style.setProperty(k, tokens[k]));
  document.cookie = `${BRAND_COOKIE}=${encodeURIComponent(hex)}; path=/; max-age=31536000; samesite=lax`;
}
