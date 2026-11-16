/**
 * Server only. Shared react-pdf building blocks for agreement templates, matching the STACKph
 * proposal HTML (proposals/stackph/proposal.html): brand tokens, type scale, run-head/run-foot,
 * the correct "Appointmentlyy" lockup (ink tile + mark + live wordmark), kickers, callouts.
 */
import type { ReactElement, ReactNode } from 'react';
import { Document, Image, Page, Text, View, renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { Styles } from '@react-pdf/renderer';
import { MARK_PNG_BASE64 } from '../assets/mark';
import { FONT_FAMILY, registerAgreementFonts } from './fonts';
import { MARK_CLOSE, MARK_OPEN, parseIsoDate } from './format';

export type Style = Styles[string];

/* ---------------- brand tokens (proposal.html :root) ---------------- */
export const C = {
  red: '#ED1C24',
  redTint: '#FEF5F5',
  ink: '#1C1917',
  ink2: '#44403C',
  muted: '#78716C',
  rule: '#E7E5E4',
  rule2: '#D6D3D1',
  paper2: '#FAFAF9',
  tile: '#0C0A09',
  mark: '#FFF3BF',
} as const;

export const HAIR = 0.5;
/** A4 in pt, and the proposal page frame: 80pt top, 56pt sides, 72pt bottom. */
export const A4 = { w: 595.28, h: 841.89 } as const;
export const FRAME = { top: 80, side: 56, bottom: 72 } as const;
export const CONTENT_W = A4.w - FRAME.side * 2;
/** Run-foot height (8pt rule gap + 12pt lockup); its rule sits 32pt + FOOT_H above the page bottom. */
export const FOOT_H = 21;

/** em -> pt letter spacing, as in the CSS. */
export const em = (v: number, size: number) => v * size;

const MARK_SRC = `data:image/png;base64,${MARK_PNG_BASE64}`;

/** Never hyphenate (the HTML does not); very long tokens such as URLs are broken by `breakable`. */
const noHyphenation = (word: string) => [word];

type S = Style | Style[];

export function T(props: { style?: S; children?: ReactNode; wrap?: boolean; minPresenceAhead?: number; orphans?: number; widows?: number }) {
  return <Text hyphenationCallback={noHyphenation} {...props} />;
}

/** Insert zero-width spaces after URL separators so long links can wrap without a hyphen. */
export function breakable(s: string): string {
  return s.replace(/([/?&=._-])(?=[^\s])/g, '$1​');
}

/**
 * Inline rich text: **bold** and ⟦MARK:label⟧ (yellow highlight for a blank value). Newlines are
 * hard line breaks. Returns children for a <Text>.
 */
export function rich(text: string, opts: { bold?: Style; mark?: Style } = {}): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|⟦MARK:([^⟧]*)⟧/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<Text key={i++} style={[{ fontWeight: 600, color: C.ink }, opts.bold ?? {}]}>{rich(m[1], opts)}</Text>);
    } else {
      out.push(<Text key={i++} style={[{ backgroundColor: C.mark, color: C.ink }, opts.mark ?? {}]}>{m[2]}</Text>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rich({ text, style, bold }: { text: string; style?: S; bold?: Style }) {
  return <T style={style}>{rich(text, { bold })}</T>;
}

export function hasMark(s: string): boolean {
  return s.includes(MARK_OPEN) && s.includes(MARK_CLOSE);
}

/* ---------------- lockup ---------------- */
export function Lockup({ h }: { h: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: h, height: h, borderRadius: h * 0.24, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; decorative mark */}
        <Image src={MARK_SRC} style={{ width: h * 0.84, height: h * 0.84 }} />
      </View>
      <T style={{ marginLeft: h * 0.3, fontWeight: 800, fontSize: h * 0.64, letterSpacing: em(-0.03, h * 0.64), color: C.ink, lineHeight: 1 }}>
        Appointmentlyy
      </T>
    </View>
  );
}

/* ---------------- running head / foot ---------------- */
export function RunHead({ left, right }: { left: string; right: string }) {
  const st: Style = { fontSize: 7, letterSpacing: em(0.12, 7), textTransform: 'uppercase', color: C.muted, fontWeight: 500 };
  return (
    <View fixed style={{ position: 'absolute', top: 34, left: FRAME.side, right: FRAME.side, flexDirection: 'row', justifyContent: 'space-between' }}>
      <T style={st}>{left}</T>
      <T style={st}>{right}</T>
    </View>
  );
}

export function RunFoot({ client }: { client: string }) {
  const st: Style = { fontSize: 7.5, color: C.muted, letterSpacing: em(0.02, 7.5) };
  // react-pdf quirks (4.9): a dynamic `render` Text inside a fixed container either fails to lay out
  // or drops its siblings after the page-number pass, and bottom-anchored fixed boxes misplace. So:
  // the rule, lockup and confidentiality line are one top-anchored fixed box, and the page number is
  // its own top-anchored fixed Text. Both verified on multi-page output by the preview script.
  const top = A4.h - 32 - FOOT_H;
  return (
    <>
      <View
        fixed
        style={{
          position: 'absolute', top, left: FRAME.side, right: FRAME.side, paddingTop: 8,
          borderTopWidth: HAIR, borderTopColor: C.rule2, flexDirection: 'row', alignItems: 'center',
        }}
      >
        <View style={{ width: 110 }}><Lockup h={12} /></View>
        <T style={[st, { width: CONTENT_W - 220, textAlign: 'center', lineHeight: 1.3 }]}>{`Prepared for ${client} · Confidential`}</T>
      </View>
      <Text
        fixed
        style={[st, { position: 'absolute', top: top + 10.5, right: FRAME.side, width: 110, textAlign: 'right', lineHeight: 1.3 }]}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
}

/* ---------------- page frames ---------------- */
export const pageBase: Style = {
  fontFamily: FONT_FAMILY,
  fontSize: 10.5,
  lineHeight: 1.6,
  color: C.ink,
  backgroundColor: '#FFFFFF',
};

/** A proposal content page: 80/56/72 frame, run-head, run-foot. Overflow flows onto a new page with the same head/foot. */
export function ContentPage({ head, sub, client, children, style }: { head: string; sub: string; client: string; children: ReactNode; style?: Style }) {
  return (
    <Page size="A4" style={[pageBase, { paddingTop: FRAME.top, paddingBottom: FRAME.bottom, paddingHorizontal: FRAME.side }, style ?? {}]}>
      <RunHead left={head} right={sub} />
      {children}
      <RunFoot client={client} />
    </Page>
  );
}

/* ---------------- type ---------------- */
export function Kicker({ n }: { n: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <T style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: em(0.16, 7.5), color: C.red, lineHeight: 1.2 }}>{n}</T>
      <View style={{ marginLeft: 8, width: 24, height: HAIR, backgroundColor: C.red }} />
    </View>
  );
}

export function H2({ children, style }: { children: ReactNode; style?: Style }) {
  return <T style={[{ fontSize: 22, lineHeight: 1.15, fontWeight: 700, letterSpacing: em(-0.022, 22), marginBottom: 16 }, style ?? {}]}>{children}</T>;
}

export const sty = {
  p: { marginBottom: 12 } as Style,
  lead: { fontSize: 13, lineHeight: 1.5, letterSpacing: em(-0.01, 13), color: C.ink } as Style,
  body2: { color: C.ink2 } as Style,
  label: { fontSize: 7, fontWeight: 600, letterSpacing: em(0.14, 7), textTransform: 'uppercase', color: C.muted, lineHeight: 1.6 } as Style,
  section: { marginBottom: 32 } as Style,
  sources: { marginTop: 12, fontSize: 8.5, color: C.muted, fontStyle: 'italic', lineHeight: 1.5 } as Style,
};

export function Callout({ children, small, aside, style }: { children: ReactNode; small?: boolean; aside?: string; style?: Style }) {
  const size = small ? 13 : 16;
  return (
    <View wrap={false} style={[{ borderLeftWidth: 3, borderLeftColor: C.red, paddingLeft: 16, paddingVertical: 2, marginVertical: 24 }, style ?? {}]}>
      <T style={{ fontSize: size, lineHeight: small ? 1.45 : 1.35, fontWeight: small ? 500 : 600, letterSpacing: em(small ? -0.01 : -0.018, size), color: C.ink }}>
        {children}
      </T>
      {aside ? <T style={{ marginTop: 4, fontSize: 9, color: C.muted, lineHeight: 1.4 }}>{aside}</T> : null}
    </View>
  );
}

/** Tinted note box (.aside-box): bold lead line, then body. */
export function AsideBox({ title, children, style }: { title: string; children: ReactNode; style?: Style }) {
  return (
    <View wrap={false} style={[{ backgroundColor: C.paper2, borderTopWidth: HAIR, borderTopColor: C.rule2, padding: 16 }, style ?? {}]}>
      <T style={{ fontSize: 10.5, fontWeight: 600, color: C.ink, marginBottom: 4, lineHeight: 1.45 }}>{title}</T>
      <T style={{ fontSize: 10, lineHeight: 1.55, color: C.ink2 }}>{children}</T>
    </View>
  );
}

/** Small red bullet list (.addons li::before: 5pt x 0.75pt red dash). */
export function DashList({ items, style }: { items: ReactNode[]; style?: Style }) {
  return (
    <View style={style}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }} wrap={false}>
          <View style={{ width: 5, height: 0.75, backgroundColor: C.red, marginTop: 7.5, marginRight: 7 }} />
          <T style={{ flex: 1, color: C.ink2 }}>{it}</T>
        </View>
      ))}
    </View>
  );
}

/* ---------------- render ---------------- */

/** Deterministic metadata: creation date comes from the document's own date field (or a fixed epoch). */
export function docDate(iso: string | undefined): Date {
  const p = parseIsoDate(iso);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0)) : new Date(Date.UTC(2026, 0, 1));
}

export function AgreementDocument({ title, subject, date, children }: { title: string; subject: string; date: Date; children: ReactNode }) {
  const props: DocumentProps = {
    title,
    subject,
    author: 'Appointmentlyy',
    creator: 'Appointmentlyy Agreements',
    producer: 'Appointmentlyy Agreements',
    creationDate: date,
    modificationDate: date,
    language: 'en',
  };
  return <Document {...props}>{children}</Document>;
}

export async function renderPdf(doc: ReactElement<DocumentProps>): Promise<Uint8Array> {
  registerAgreementFonts();
  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
