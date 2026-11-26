/**
 * Server only. Tokens, type scale, inline rich text, measuring and drawn glyphs for the v2 custom proposal
 * (design/proposal-v2/DESIGN_SPEC.md §1). Every value is in PDF points (CSS px × 0.75).
 */
import type { ReactNode } from 'react';
import { Circle, Ellipse, Font, Line, Path, Polygon, Polyline, Rect, Svg, Text, View } from '@react-pdf/renderer';
import { FONT_FAMILY, registerAgreementFonts } from './fonts';
import { breakable, T, type Style } from './kit';
import { PROPOSAL_ICONS } from './icons';

export { T };
export type { Style };

/** Colour roles (§1.1). Components use these, never raw hex. */
export const K = {
  ink950: '#0C0A09',
  ink900: '#1C1917',
  ink800: '#292524',
  ink700: '#44403B',
  ink600: '#57534D',
  ink500: '#79716B',
  ink400: '#A6A09B',
  ink300: '#D6D3D1',
  ink200: '#E7E5E4',
  ink100: '#F5F5F4',
  ink50: '#FAFAF9',
  canvas: '#FAF9F5',
  surface: '#FFFFFF',
  crimson500: '#FF0943',
  crimson600: '#D90036',
  crimson700: '#B3002C',
  crimson50: '#FFF1F3',
  crimson100: '#FFC9D5',
  emerald700: '#0E744A',
  emerald50: '#ECFDF5',
  emerald200: '#B7E8D2',
} as const;

/** Tabular numerals: numbers only (§1.3). */
export const TNUM = { fontFeatureSettings: ['tnum'] } as unknown as Style;

const ts = (fontSize: number, lineHeight: number, fontWeight = 400, letterSpacing = 0): Style => ({ fontSize, lineHeight, fontWeight, ...(letterSpacing ? { letterSpacing } : {}) });

/** The type scale (§1.2), pt. Weight 650 in the reference is 700 (the only static face). */
export const S = {
  coverTitle: ts(39, 1.06, 700, -0.78),
  coverTitleM: ts(33, 1.08, 700, -0.66),
  coverTitleS: ts(28.5, 1.1, 700, -0.57),
  coverLead: ts(14.25, 1.5),
  coverStat: { ...ts(25.5, 1.2, 700, -0.26), ...TNUM },
  bigNumber: { ...ts(36, 1.0, 700), ...TNUM },
  profit: { ...ts(24, 1.1, 700), ...TNUM },
  salutation: ts(22.5, 1.2, 700, -0.45),
  h2: ts(21, 1.2, 700, -0.42),
  statLg: { ...ts(21, 1.2, 700), ...TNUM },
  closingTitle: ts(19.5, 1.2, 700, -0.2),
  statMd: { ...ts(18, 1.2, 700), ...TNUM },
  h3: ts(16.5, 1.3, 700, -0.17),
  bandTitle: ts(15, 1.25, 700),
  h4: ts(13.5, 1.4, 600),
  titleLg: ts(12, 1.4, 600),
  title: ts(11.25, 1.4, 600),
  titleSm: ts(10.5, 1.4, 600),
  lead: ts(11.25, 1.55),
  leadLong: ts(10.88, 1.55),
  body: ts(10.5, 1.6),
  bodySm: ts(10.13, 1.55),
  cardText: ts(9.75, 1.5),
  small: ts(9.38, 1.45),
  eyebrow: ts(9.75, 1.25, 600),
  caption: ts(9, 1.4, 500),
  captionText: ts(9, 1.45, 400),
} satisfies Record<string, Style>;

// ------------------------------------------------------------------ text helpers

/** Plain text for the PDF: our internal mark characters removed; long unbroken tokens get soft break points. */
export const plain = (s: string) => s.replace(/[⟦⟧]/g, '').replace(/\S{32,}/g, (w) => breakable(w));

/** "text-wrap: pretty": the last two words of a paragraph never split (a no-break space). */
export function pretty(s: string): string {
  const m = /^([\s\S]*\S) (\S{1,10})$/.exec(s);
  if (!m) return s;
  const prev = /(\S+)$/.exec(m[1])?.[1] ?? '';
  return prev.length + m[2].length <= 18 ? `${m[1]} ${m[2]}` : s;
}

const noHyph = (w: string) => [w];

/**
 * Inline rich text: **bold** (600, ink-900, or ink-50 on dark) and *italic* (400 italic). No other styling:
 * no links, colours or fonts. Newlines are hard breaks. Returns children for a <Text>.
 * Punctuation touching a styled run joins it: react-pdf treats a style change inside a word as a break
 * point and would hyphenate there ("deposit-" / ",").
 */
export function rx(text: string, opts: { dark?: boolean; bold?: Style } = {}): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let before = text.slice(last, m.index);
    const lead = /[^\s]+$/.exec(before)?.[0] ?? '';
    before = before.slice(0, before.length - lead.length);
    const trail = /^[^\s*]+/.exec(text.slice(m.index + m[0].length))?.[0] ?? '';
    if (before) out.push(before);
    const body = `${lead}${m[1] ?? m[2]}${trail}`;
    if (m[1] !== undefined) out.push(<Text key={i++} hyphenationCallback={noHyph} style={[{ fontWeight: 600, color: opts.dark ? K.ink50 : K.ink900 }, opts.bold ?? {}]}>{body}</Text>);
    else out.push(<Text key={i++} hyphenationCallback={noHyph} style={{ fontStyle: 'italic', fontWeight: 400 }}>{body}</Text>);
    last = m.index + m[0].length + trail.length;
    re.lastIndex = last;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ------------------------------------------------------------------ measuring (balanced headlines, §3)

type FontData = { layout: (s: string, f?: string[]) => { advanceWidth: number }; unitsPerEm: number };
const metrics: Partial<Record<number, FontData>> = {};

/** Load the Inter faces' metrics once (react-pdf's own fontkit instances, the same files it draws with). */
export async function loadMetrics(): Promise<void> {
  registerAgreementFonts();
  for (const w of [400, 500, 600, 700]) {
    if (metrics[w]) continue;
    try {
      const src = Font.getFont({ fontFamily: FONT_FAMILY, fontWeight: w });
      await src.load();
      if (src.data) metrics[w] = src.data as unknown as FontData;
    } catch {
      /* measuring falls back to an estimate */
    }
  }
}

/** Advance width of a single line at a size, pt. */
export function measure(text: string, size: number, weight = 400, letterSpacing = 0, features?: string[]): number {
  const f = metrics[weight] ?? metrics[700];
  const s = text.replace(/\*\*|\*/g, '');
  if (!f) return s.length * size * 0.56 + letterSpacing * s.length;
  return (f.layout(s, features).advanceWidth * size) / f.unitsPerEm + letterSpacing * s.length;
}

/** Width for a balanced headline (§3): narrowed so the lines come out even; null = the full width. */
export function balancedWidth(text: string, style: Style, maxW: number): number | null {
  const size = Number(style.fontSize ?? 10);
  const w = measure(text, size, Number(style.fontWeight ?? 400), Number(style.letterSpacing ?? 0));
  const n = Math.ceil(w / maxW);
  if (n <= 1) return null;
  return Math.min(maxW, Math.ceil(w / n) * 1.06);
}

/** A balanced headline: narrowed width and no one-word last line. */
export function Balanced({ text, style, maxW, dark }: { text: string; style: Style | Style[]; maxW: number; dark?: boolean }) {
  const flat = (Array.isArray(style) ? Object.assign({}, ...style) : style) as Style;
  const bw = balancedWidth(text, flat, maxW);
  return <T style={[...(Array.isArray(style) ? style : [style]), bw ? { width: bw } : { maxWidth: maxW }]}>{rx(pretty(plain(text)), { dark })}</T>;
}

// ------------------------------------------------------------------ drawn glyphs

const SVG_TAGS: Record<string, (p: Record<string, string>, k: number, stroke: string, sw: number) => ReactNode> = {
  path: (p, k, s, w) => <Path key={k} d={p.d} stroke={s} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  circle: (p, k, s, w) => <Circle key={k} cx={Number(p.cx)} cy={Number(p.cy)} r={Number(p.r)} stroke={s} strokeWidth={w} fill="none" />,
  ellipse: (p, k, s, w) => <Ellipse key={k} cx={Number(p.cx)} cy={Number(p.cy)} rx={Number(p.rx)} ry={Number(p.ry)} stroke={s} strokeWidth={w} fill="none" />,
  rect: (p, k, s, w) => <Rect key={k} x={Number(p.x ?? 0)} y={Number(p.y ?? 0)} width={Number(p.width)} height={Number(p.height)} rx={p.rx ? Number(p.rx) : undefined} ry={p.ry ? Number(p.ry) : undefined} stroke={s} strokeWidth={w} fill="none" />,
  line: (p, k, s, w) => <Line key={k} x1={Number(p.x1)} y1={Number(p.y1)} x2={Number(p.x2)} y2={Number(p.y2)} stroke={s} strokeWidth={w} strokeLinecap="round" />,
  polyline: (p, k, s, w) => <Polyline key={k} points={p.points} stroke={s} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  polygon: (p, k, s, w) => <Polygon key={k} points={p.points} stroke={s} strokeWidth={w} strokeLinejoin="round" fill="none" />,
};

/** A registry icon (Lucide geometry, 24 viewBox, 1.5 stroke, round caps). */
export function Icon({ name, size = 15, color = K.ink700, stroke = 1.5, style }: { name: string; size?: number; color?: string; stroke?: number; style?: Style }) {
  const node = PROPOSAL_ICONS[name] ?? PROPOSAL_ICONS.target;
  return (
    <Svg viewBox="0 0 24 24" style={[{ width: size, height: size }, style ?? {}]}>
      {node.map(([tag, attrs], k) => SVG_TAGS[tag]?.(attrs, k, color, stroke) ?? null)}
    </Svg>
  );
}

/** Gate diamond, 8.25 pt, ink-900. */
export function Diamond({ style }: { style?: Style }) {
  return (
    <Svg viewBox="0 0 11 11" style={[{ width: 8.25, height: 8.25 }, style ?? {}]}>
      <Polygon points="5.5,0 11,5.5 5.5,11 0,5.5" fill={K.ink900} />
    </Svg>
  );
}

/** Checkbox: 7.5 pt square, 0.75 ink-500 border, 1.5 radius (Inter has no ☐ glyph). */
export function Checkbox({ style }: { style?: Style }) {
  return <View style={[{ width: 7.5, height: 7.5, borderWidth: 0.75, borderColor: K.ink500, borderRadius: 1.5 }, style ?? {}]} />;
}

/** Bullet: a 3 pt ink-700 disc. */
export function Dot({ top, color = K.ink700 }: { top: number; color?: string }) {
  return <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color, marginTop: top }} />;
}
