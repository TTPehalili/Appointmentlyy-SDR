/**
 * Server only. Renders the customer one-page meeting recap to a PDF (US Letter; prints fine on A4).
 *
 * Fitting: the page must ALWAYS be one page. The copy is first capped per field (word-boundary
 * truncation with an ellipsis), then the page is rendered at the largest type scale that lays out on
 * a single page. Each attempt is a real layout pass, so the check is exact rather than estimated. The
 * last tier has the tightest caps and disables page wrapping, so even absurd copy cannot spill onto
 * a second page.
 *
 * Fonts: the built-in Helvetica family only (no font files, no network). Built-in PDF fonts use the
 * WinAnsi character set, so text goes through `pdfText`, which maps or strips characters outside it
 * (e.g. Maori macrons become plain vowels instead of missing glyphs).
 *
 * The on-screen replica is src/components/meetings/OnePagerPreview.tsx; keep FIT_TIERS and the
 * measurements in step with it.
 */
import type { ReactNode } from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer, type Styles } from '@react-pdf/renderer';
import type { OnePagerCopy } from '@/lib/meetingPlan';
import { safeBrandColor, type OnePagerRenderData } from '@/lib/onePagerRender';

/* ---------------- fitting ---------------- */

interface FitCaps {
  headline: number;
  subheadline: number;
  bullet: number;
  step: number;
  when: number;
  cardTitle: number;
  cardDetail: number;
  cta: number;
  heard: number;
  why: number;
  steps: number;
}

interface FitTier {
  scale: number;
  caps: FitCaps;
}

const LOOSE: FitCaps = { headline: 90, subheadline: 200, bullet: 210, step: 170, when: 40, cardTitle: 48, cardDetail: 190, cta: 260, heard: 4, why: 4, steps: 4 };
const TIGHT: FitCaps = { headline: 80, subheadline: 160, bullet: 160, step: 130, when: 32, cardTitle: 44, cardDetail: 150, cta: 210, heard: 4, why: 3, steps: 4 };
const TIGHTER: FitCaps = { ...TIGHT, heard: 3, why: 3, steps: 3 };
const TIGHTEST: FitCaps = { headline: 70, subheadline: 120, bullet: 120, step: 100, when: 28, cardTitle: 40, cardDetail: 110, cta: 160, heard: 3, why: 3, steps: 3 };

/** Largest first. Mirrored in OnePagerPreview.tsx. */
const FIT_TIERS: FitTier[] = [
  { scale: 1, caps: LOOSE },
  { scale: 0.93, caps: LOOSE },
  { scale: 0.87, caps: TIGHT },
  { scale: 0.82, caps: TIGHT },
  { scale: 0.82, caps: TIGHTER },
  { scale: 0.82, caps: TIGHTEST },
];

const ELLIPSIS = '…';

/** Collapse whitespace and cut at a word boundary with an ellipsis. */
function clip(raw: unknown, max: number): string {
  const v = (typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim();
  if (v.length <= max) return v;
  const cut = v.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '') + ELLIPSIS;
}

interface FittedCopy {
  headline: string;
  subheadline: string;
  whatWeHeard: string[];
  whyItMatters: string[];
  nextSteps: { step: string; when: string }[];
  howWeHelp: { title: string; detail: string }[];
  cta: string;
}

function fitCopy(copy: OnePagerCopy, caps: FitCaps): FittedCopy {
  const list = (items: unknown, max: number, len: number) =>
    (Array.isArray(items) ? items : [])
      .map((s) => pdfText(clip(s, len)))
      .filter(Boolean)
      .slice(0, max);
  return {
    headline: pdfText(clip(copy.headline, caps.headline)),
    subheadline: pdfText(clip(copy.subheadline, caps.subheadline)),
    whatWeHeard: list(copy.whatWeHeard, caps.heard, caps.bullet),
    whyItMatters: list(copy.whyItMatters, caps.why, caps.bullet),
    nextSteps: (Array.isArray(copy.nextSteps) ? copy.nextSteps : [])
      .map((s) => ({ step: pdfText(clip(s?.step, caps.step)), when: pdfText(clip(s?.when, caps.when)) }))
      .filter((s) => s.step)
      .slice(0, caps.steps),
    howWeHelp: (Array.isArray(copy.howWeHelp) ? copy.howWeHelp : [])
      .map((c) => ({ title: pdfText(clip(c?.title, caps.cardTitle)), detail: pdfText(clip(c?.detail, caps.cardDetail)) }))
      .filter((c) => c.title || c.detail)
      .slice(0, 3),
    cta: pdfText(clip(copy.cta, caps.cta)),
  };
}

/* ---------------- text + colour helpers ---------------- */

/** Characters of Windows-1252 above Latin-1's ASCII range that the built-in fonts can draw. */
const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const CHAR_MAP: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '−': '-', '‐': '-', '‑': '-',
  '≈': '~', '≤': '<=', '≥': '>=', '′': "'", '″': '"', ' ': ' ', ' ': ' ', ' ': ' ',
  '✓': '', '✔': '', '✅': '',
};

/** Keep text inside the WinAnsi set the built-in PDF fonts support. */
export function pdfText(raw: string): string {
  let out = '';
  for (const ch of (raw || '').normalize('NFC')) {
    if (ch in CHAR_MAP) {
      out += CHAR_MAP[ch];
      continue;
    }
    const code = ch.codePointAt(0) || 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.has(ch)) {
      out += ch;
      continue;
    }
    // Decompose (ā -> a + macron) and keep the base letter when it is drawable.
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base !== ch && [...base].every((c) => (c.codePointAt(0) || 0) <= 0xff)) out += base;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Mix `hex` toward `toward` by t (0 = hex, 1 = toward). */
function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export interface OnePagerPalette {
  /** The brand colour as given (bars, tile, numbers). */
  accent: string;
  /** Brand colour darkened until it reads as text on white (labels, dates). */
  accentText: string;
  /** Text colour on the accent fill. */
  onAccent: string;
  /** Very light brand tint for cards and the CTA band. */
  tint: string;
  /** Light brand tint for timeline rails. */
  rail: string;
}

export function onePagerPalette(raw: string | undefined): OnePagerPalette {
  const accent = safeBrandColor(raw);
  let accentText = accent;
  for (let i = 0; i < 8 && contrast(accentText, '#FFFFFF') < 4.5; i++) accentText = mix(accentText, '#000000', 0.15);
  return {
    accent,
    accentText,
    onAccent: contrast('#FFFFFF', accent) >= 3 ? '#FFFFFF' : INK[900],
    tint: mix(accent, '#FFFFFF', 0.94),
    rail: mix(accent, '#FFFFFF', 0.72),
  };
}

const INK = { 900: '#1C1917', 800: '#292524', 700: '#44403B', 600: '#57534D', 500: '#79716B', 300: '#D6D3D1', 200: '#E7E5E4' };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-11-18T10:00" -> "Wed 18 Nov 2026, 10:00 AM". The wall-clock time is shown as written (no
 * timezone conversion), because the rep typed it in the customer's terms. Free text is kept as is.
 */
export function formatMeetingAt(raw: string | undefined): string {
  const v = (raw || '').trim();
  if (!v) return '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return clip(v, 60);
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (Number.isNaN(date.getTime()) || +mo < 1 || +mo > 12) return clip(v, 60);
  let out = `${WEEKDAYS[date.getUTCDay()]} ${+d} ${MONTHS[+mo - 1]} ${y}`;
  if (hh !== undefined && mm !== undefined) {
    const h = +hh;
    out += `, ${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }
  return out;
}

function initialsOf(name: string, given?: string): string {
  const g = (given || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  if (g) return g;
  const words = (name || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'A';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** "Harbour Freight Ltd" -> "Harbour Freight", for the "Why it matters for ..." label. */
export function shortCompanyName(raw: string | undefined): string {
  const suffix = /[,.]?\s+(ltd|limited|inc|incorporated|llc|llp|plc|pty|corp|corporation|gmbh)\.?$/i;
  // Twice, for "Pty Ltd" / "Pty. Limited".
  return clip(clip(raw, 80).replace(suffix, '').replace(suffix, ''), 34);
}

function displayWebsite(raw: string | undefined): string {
  return clip((raw || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, ''), 40);
}

/* ---------------- document ---------------- */

const noHyphens = (word: string) => [word];

type PdfStyle = Styles[string];

/** Text without hyphenation; `lines` clamps to that many lines with an ellipsis. */
function T({ style, children, lines }: { style: PdfStyle; children: ReactNode; lines?: number }) {
  return (
    <Text hyphenationCallback={noHyphens} style={lines ? [style, { maxLines: lines, textOverflow: 'ellipsis' }] : style}>
      {children}
    </Text>
  );
}

/** Letter size in points. */
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 50;
const PAD_TOP = 36;
/** Room kept for the footer. */
const PAD_BOTTOM = 84;

function OnePagerDocument({ data, tier, last }: { data: OnePagerRenderData; tier: FitTier; last: boolean }) {
  const k = tier.scale;
  const f = (n: number) => Math.round(n * k * 10) / 10;
  const c = fitCopy(data.copy, tier.caps);
  const p = onePagerPalette(data.brand.brandColor);
  const company = pdfText(clip(data.lead.company, 60));
  const brandName = pdfText(clip(data.brand.companyName, 50)) || 'Our team';
  const website = pdfText(displayWebsite(data.brand.website));
  const meeting = pdfText(formatMeetingAt(data.meetingAt));
  const leadName = pdfText(clip(data.lead.name, 50));
  const leadTitle = pdfText(clip(data.lead.title, 48));
  const aeName = pdfText(clip(data.ae.name, 50));
  const aeEmail = pdfText(clip(data.ae.email, 60));
  const shortCompany = pdfText(shortCompanyName(data.lead.company));

  const s = StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      color: INK[800],
      backgroundColor: '#FFFFFF',
      paddingTop: f(PAD_TOP),
      paddingBottom: PAD_BOTTOM,
      paddingHorizontal: MARGIN_X,
    },
    clipBox: { height: PAGE_H - f(PAD_TOP) - PAD_BOTTOM - 1, overflow: 'hidden' },
    bar: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: p.accent },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 24 },
    headerRight: { maxWidth: 230 },
    tile: { width: 30, height: 30, borderRadius: 7, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    tileText: { lineHeight: 1, fontFamily: 'Helvetica-Bold', fontSize: 11.5, color: p.onAccent, letterSpacing: 0.3 },
    brandName: { lineHeight: 1.2, fontFamily: 'Helvetica-Bold', fontSize: 11, color: INK[900] },
    brandSite: { lineHeight: 1.2, fontSize: 8.5, color: INK[500], marginTop: 2 },
    docType: { lineHeight: 1.2, fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1.6, color: INK[500], textAlign: 'right' },
    meeting: { lineHeight: 1.2, fontSize: 9, color: INK[700], marginTop: 3, textAlign: 'right' },
    rule: { height: 0.75, backgroundColor: INK[200], marginTop: f(16), marginBottom: f(20) },
    preparedFor: { lineHeight: 1.2, fontSize: f(9.5), color: INK[600] },
    preparedName: { fontFamily: 'Helvetica-Bold', color: INK[900] },
    headline: { fontFamily: 'Helvetica-Bold', fontSize: f(25), lineHeight: 1.16, color: INK[900], marginTop: f(10), letterSpacing: -0.3 },
    sub: { fontSize: f(12), lineHeight: 1.45, color: INK[600], marginTop: f(8) },
    section: { marginTop: f(22) },
    label: { lineHeight: 1.2, fontFamily: 'Helvetica-Bold', fontSize: f(7.5), letterSpacing: 1.5, color: p.accentText, marginBottom: f(9) },
    labelRule: { width: 18, height: 1.5, backgroundColor: p.accent, marginBottom: f(7) },
    cols: { flexDirection: 'row' },
    col: { flex: 1 },
    colGap: { marginRight: 28 },
    bulletRow: { flexDirection: 'row', marginBottom: f(6) },
    bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: p.accent, marginTop: f(10) * 0.55, marginRight: 9 },
    body: { flex: 1, fontSize: f(10), lineHeight: 1.5, color: INK[800] },
    stepRow: { flexDirection: 'row' },
    stepRail: { width: 22, alignItems: 'center' },
    stepNum: { width: f(18), height: f(18), borderRadius: f(9), backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' },
    stepNumText: { lineHeight: 1, fontFamily: 'Helvetica-Bold', fontSize: f(8.5), color: p.onAccent },
    stepLine: { flexGrow: 1, width: 1.25, backgroundColor: p.rail, marginVertical: 3 },
    stepBody: { flex: 1, flexDirection: 'row', marginLeft: 10, paddingTop: f(2.5) },
    stepText: { flex: 1, fontSize: f(10), lineHeight: 1.45, color: INK[800] },
    stepWhen: { width: 120, marginLeft: 16, fontFamily: 'Helvetica-Bold', fontSize: f(8.5), lineHeight: 1.6, color: p.accentText, textAlign: 'right' },
    cards: { flexDirection: 'row' },
    card: { flex: 1, backgroundColor: p.tint, borderRadius: 6, borderTopWidth: 2, borderTopColor: p.accent, paddingTop: f(12), paddingBottom: f(13), paddingHorizontal: f(12) },
    cardTitle: { fontFamily: 'Helvetica-Bold', fontSize: f(10.5), lineHeight: 1.3, color: INK[900], marginBottom: f(5) },
    cardDetail: { fontSize: f(9), lineHeight: 1.45, color: INK[700] },
    cta: { flexDirection: 'row', marginTop: f(20), borderLeftWidth: 2.5, borderLeftColor: p.accent, paddingLeft: 14, paddingVertical: f(3) },
    ctaText: { flex: 1, fontSize: f(11), lineHeight: 1.5, color: INK[900] },
    footer: { position: 'absolute', left: MARGIN_X, right: MARGIN_X, bottom: 30, borderTopWidth: 0.75, borderTopColor: INK[200], paddingTop: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    footLeft: { flex: 1, marginRight: 24 },
    footLabel: { lineHeight: 1.2, fontFamily: 'Helvetica-Bold', fontSize: 6.5, letterSpacing: 1.4, color: INK[500], marginBottom: 4 },
    footName: { lineHeight: 1.2, fontFamily: 'Helvetica-Bold', fontSize: 9, color: INK[900] },
    footMeta: { lineHeight: 1.2, fontSize: 8.5, color: INK[600], marginTop: 2 },
    footRight: { maxWidth: 220, alignItems: 'flex-end' },
    footBrand: { lineHeight: 1.2, fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: INK[700], textAlign: 'right' },
    footSite: { lineHeight: 1.2, fontSize: 8.5, color: INK[500], textAlign: 'right', marginTop: 2 },
  });

  const label = (text: string) => (
    <View>
      <View style={s.labelRule} />
      <T style={s.label}>{text.toUpperCase()}</T>
    </View>
  );

  const bullets = (items: string[]) => (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow} wrap={false}>
          <View style={s.bulletDot} />
          <T style={s.body}>{item}</T>
        </View>
      ))}
    </View>
  );

  const heardLabel = 'What we heard';
  const whyLabel = shortCompany ? `Why it matters for ${shortCompany}` : 'Why it matters';
  const hasHeard = c.whatWeHeard.length > 0;
  const hasWhy = c.whyItMatters.length > 0;

  return (
    <Document title={`${brandName} meeting recap${company ? ` for ${company}` : ''}`} author={aeName || brandName} creator={brandName} producer={brandName}>
      <Page size="LETTER" style={s.page}>
        <View style={s.bar} fixed />
        {/* Last tier: a fixed-height clipped box, so nothing can ever flow onto a second page. */}
        <View style={last ? s.clipBox : {}}>

        <View style={s.header}>
          <View style={s.brandRow}>
            <View style={s.tile}>
              <T style={s.tileText}>{initialsOf(data.brand.companyName, data.brand.logoInitials)}</T>
            </View>
            <View>
              <T style={s.brandName}>{brandName}</T>
              {website ? <T style={s.brandSite}>{website}</T> : null}
            </View>
          </View>
          <View style={s.headerRight}>
            <T style={s.docType}>MEETING RECAP</T>
            {meeting ? <T style={s.meeting}>{meeting}</T> : null}
          </View>
        </View>

        <View style={s.rule} />

        {leadName || leadTitle || company ? (
          <T style={s.preparedFor}>
            {'Prepared for '}
            {leadName ? <Text style={s.preparedName}>{leadName}</Text> : null}
            {leadName && leadTitle ? `, ${leadTitle}` : !leadName && leadTitle ? leadTitle : ''}
            {company ? `${leadName || leadTitle ? ' · ' : ''}${company}` : ''}
          </T>
        ) : null}
        {c.headline ? <T style={s.headline}>{c.headline}</T> : null}
        {c.subheadline ? <T style={s.sub}>{c.subheadline}</T> : null}

        {hasHeard || hasWhy ? (
          <View style={s.section}>
            {/* Labels and bullets are separate rows so a two-line label never misaligns the columns. */}
            <View style={s.cols}>
              {hasHeard ? (
                <View style={[s.col, hasWhy ? s.colGap : {}]}>
                  {label(heardLabel)}
                </View>
              ) : null}
              {hasWhy ? (
                <View style={s.col}>
                  {label(whyLabel)}
                </View>
              ) : null}
            </View>
            <View style={s.cols}>
              {hasHeard ? (
                <View style={[s.col, hasWhy ? s.colGap : {}]}>
                  {bullets(c.whatWeHeard)}
                </View>
              ) : null}
              {hasWhy ? (
                <View style={s.col}>
                  {bullets(c.whyItMatters)}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {c.nextSteps.length > 0 ? (
          <View style={s.section}>
            {label('Agreed next steps')}
            {c.nextSteps.map((step, i) => {
              const isLast = i === c.nextSteps.length - 1;
              return (
                <View key={i} style={s.stepRow} wrap={false}>
                  <View style={s.stepRail}>
                    <View style={s.stepNum}>
                      <T style={s.stepNumText}>{String(i + 1)}</T>
                    </View>
                    {isLast ? null : <View style={s.stepLine} />}
                  </View>
                  <View style={[s.stepBody, { paddingBottom: isLast ? 0 : f(10) }]}>
                    <T style={s.stepText}>{step.step}</T>
                    {step.when ? <T style={s.stepWhen}>{step.when}</T> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {c.howWeHelp.length > 0 ? (
          <View style={s.section} wrap={false}>
            {label('How we can help')}
            <View style={s.cards}>
              {c.howWeHelp.map((card, i) => (
                <View key={i} style={[s.card, i < c.howWeHelp.length - 1 ? { marginRight: 12 } : {}]}>
                  {card.title ? <T style={s.cardTitle}>{card.title}</T> : null}
                  {card.detail ? <T style={s.cardDetail}>{card.detail}</T> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {c.cta ? (
          <View style={s.cta} wrap={false}>
            <T style={s.ctaText}>{c.cta}</T>
          </View>
        ) : null}
        </View>

        <View style={s.footer} fixed>
          <View style={s.footLeft}>
            <T style={s.footLabel}>YOUR CONTACT</T>
            <T style={s.footName} lines={1}>{aeName || brandName}</T>
            {aeEmail ? <T style={s.footMeta} lines={1}>{aeEmail}</T> : null}
          </View>
          <View style={s.footRight}>
            <T style={s.footBrand} lines={1}>{brandName}</T>
            {website ? <T style={s.footSite} lines={1}>{website}</T> : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Count page objects in a PDF produced by react-pdf (pdfkit writes uncompressed page dictionaries). */
export function countPdfPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
}

/**
 * Render the one-pager and report which fit tier was used (0 = full size). Useful for logs and tests;
 * the preview shows the same tier in its data-fit-tier attribute.
 */
export async function renderOnePagerPdfDetailed(data: OnePagerRenderData): Promise<{ pdf: Buffer; tier: number }> {
  for (let i = 0; i < FIT_TIERS.length; i++) {
    const last = i === FIT_TIERS.length - 1;
    const pdf = await renderToBuffer(<OnePagerDocument data={data} tier={FIT_TIERS[i]} last={last} />);
    if (last || countPdfPages(pdf) <= 1) return { pdf, tier: i };
  }
  // Unreachable: the last tier always returns.
  throw new Error('Could not lay out the one-pager.');
}

/** Render the one-pager. Always returns a single US Letter page. */
export async function renderOnePagerPdf(data: OnePagerRenderData): Promise<Buffer> {
  return (await renderOnePagerPdfDetailed(data)).pdf;
}

/** Exposed for the preview/tests; not part of the route contract. */
export const ONE_PAGER_PAGE = { width: PAGE_W, height: PAGE_H, marginX: MARGIN_X };
