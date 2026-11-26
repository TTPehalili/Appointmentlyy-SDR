/**
 * Template `custom-proposal-v2`: every proposal the builder produces, in the CREDaily reference design
 * (design/proposal-v2/DESIGN_SPEC.md). Cover (dark), interior pages (running header, footer, continued
 * gutter) built from 14 flow components, and the Acceptance page (fixed geometry, always last) with the
 * closing band. Signable by default (the client signs, the owner countersigns; the platform appends the
 * Execution page and Certificate and, at completion, stamps the signatures into the reserved boxes); the owner
 * may send a document view-only (no Acceptance page: the closing band sits at the end if it fits).
 *
 * Rendering is two-pass (§2.6): pass 1 records, through zero-size render callbacks, the page every section
 * and component starts and ends on; pass 2 draws the fixed elements that depend on it (the continued note in
 * the gutter, "<Section>, continued" in the header, the first-element gap, dividers dropped at a page top).
 * Those live in reserved space, so the layout does not move; a third pass runs only if it did.
 *
 * All text is plain: nothing is turned into a link, only **bold** and *italic* are styled.
 */
import type { ReactNode } from 'react';
import { Document, Image, Page, Rect, Svg, Text, View, renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { FONT_FAMILY, registerAgreementFonts } from './pdf/fonts';
import { docDate } from './pdf/kit';
import { Balanced, Checkbox, Diamond, Dot, Icon, K, S, T, TNUM, loadMetrics, measure, plain, pretty, rx, type Style } from './pdf/proposalV2Kit';
import { LOGO_PNG_BASE64, LOGO_SIZE } from './assets/logo';
import { CLIENT_KEY, DOC_KEY } from '../customProposal';
import {
  CUSTOM_PROPOSAL_V2_ID,
  ESIGN_NOTE,
  V2_LIMITS,
  docLabelOf,
  docOfValuesV2,
  docProblemV2,
  docTitleV2,
  normalizeDocV2,
  ownerShortTitle,
  priceTotal,
  sectionName,
  serializeDocV2,
  stripMarkers,
  watchLabelsV2,
  type CalloutC,
  type CardGridC,
  type ChecklistC,
  type Component,
  type DarkBandC,
  type DataTableC,
  type DetailCardC,
  type EconomicsC,
  type LetterC,
  type PriceTableC,
  type ProcessC,
  type ProposalDocV2,
  type RoadmapC,
  type SectionHeaderC,
  type SectionV2,
  type Space,
  type StatsC,
  type TextC,
} from '../customProposalV2';
import { FRAME_V2, PAGE_SIZES, acceptanceGeometry, footerTop, gutterTop, type Rect as GRect } from '../proposalV2Geometry';

const FIELDS: TemplateField[] = [
  { group: 'Proposal', key: DOC_KEY, label: 'Proposal document', type: 'textarea', required: true, default: '', help: 'Built in the proposal editor. Stored as structured data.' },
  { group: 'Proposal', key: CLIENT_KEY, label: 'Client company', type: 'text', required: false, default: '', help: 'Filled from the cover.' },
];

const LOGO_SRC = `data:image/png;base64,${LOGO_PNG_BASE64}`;

// ------------------------------------------------------------------ layout state (two-pass)

type Rec = (key: string) => (p: { pageNumber: number }) => string;

interface Layout {
  /** Page -> continued note text (the section on that page continues on the next). */
  cont: Record<number, string>;
  /** Page -> header right label ("<Section>, continued"). */
  head: Record<number, string>;
  /** Components that start a page: they get the first-element gap. */
  top: string[];
  /** Divider headers that would land first on a page: drawn without the rule. */
  noDivider: string[];
  /** View-only: the closing band fits on the last page. */
  band: boolean;
}
const EMPTY_LAYOUT: Layout = { cont: {}, head: {}, top: [], noDivider: [], band: false };

interface Ctx {
  W: number;
  layout: Layout;
  rec: Rec;
}

const Mark = ({ k, rec }: { k: string; rec: Rec }) => <Text render={rec(k)} style={{ fontSize: 1, height: 0 }} />;

// ------------------------------------------------------------------ rhythm (§4)

const FAMILY: Partial<Record<Component['type'], string>> = { stats: 'glance', 'card-grid': 'glance' };
const pick = (s: Space, tight: number, normal: number, loose: number) => (s === 'tight' ? tight : s === 'loose' ? loose : normal);

/** The gap above a component, from what precedes it. */
function gapAbove(prev: Component | 'header' | null, c: Component): number {
  if (c.type === 'section-header') {
    if (c.variant === 'sub' && c.divider === 'thin') return pick(c.space, 19.5, 24, 30);
    if (c.variant === 'sub' && c.divider === 'strong') return pick(c.space, 13.5, 16.5, 21);
    if (c.variant === 'block') return pick(c.space, 13.5, 18, 24);
    if (c.variant === 'group') return pick(c.space, 10.5, 13.5, 18);
    if (c.variant === 'page') return prev ? pick(c.space, 13.5, 18, 24) : 0;
  }
  if (!prev) return 0;
  if (prev === 'header') return pick(c.space, 12, 15, 21);
  if (prev.type === 'section-header') {
    if (prev.variant === 'group') return 6;
    if (prev.variant === 'block') return pick(c.space, 7.5, 10.5, 13.5);
    return pick(c.space, 12, 15, 21);
  }
  if (c.type === 'text' && c.size === 'small') return pick(c.space, 7.5, 9, 12);
  if (FAMILY[prev.type] && FAMILY[prev.type] === FAMILY[c.type]) return pick(c.space, 7.5, 9, 13.5);
  return pick(c.space, 9, 13.5, 21);
}

// ------------------------------------------------------------------ C1 SectionHeader

function PageHeader({ eyebrow, title, lead, W }: { eyebrow: string; title: string; lead: string; W: number }) {
  return (
    <>
      {eyebrow ? <T style={[S.eyebrow, { color: K.crimson600 }]}>{rx(plain(eyebrow))}</T> : null}
      {title ? <Balanced text={title} style={[S.h2, { color: K.ink900, marginTop: eyebrow ? 6 : 0 }]} maxW={W} /> : null}
      {lead ? (
        <T style={[stripMarkers(lead).length > 260 ? S.leadLong : S.lead, { color: K.ink900, marginTop: title || eyebrow ? 9 : 0 }]} orphans={2} widows={2}>
          {rx(pretty(plain(lead)))}
        </T>
      ) : null}
    </>
  );
}

function SectionHeaderView({ c, W, noDivider }: { c: SectionHeaderC; W: number; noDivider: boolean }) {
  if (c.variant === 'page') return <PageHeader eyebrow={c.eyebrow} title={c.title} lead={c.text} W={W} />;
  if (c.variant === 'block') {
    return (
      <>
        <T style={[S.h4, { color: K.ink900 }]}>{rx(plain(c.title))}</T>
        {c.text ? <T style={[S.body, { lineHeight: 1.55, color: K.ink700, marginTop: 4.5 }]}>{rx(pretty(plain(c.text)))}</T> : null}
      </>
    );
  }
  if (c.variant === 'group') {
    return (
      <T style={[S.titleLg, { color: K.ink900 }]}>
        {rx(plain(c.title))}
        {c.text ? <Text style={[S.cardText, { color: K.ink600, fontWeight: 400 }]}>{` · ${stripMarkers(c.text)}`}</Text> : null}
      </T>
    );
  }
  const below = c.divider === 'thin' ? pick(c.space, 16.5, 18, 21) : pick(c.space, 9, 12, 15);
  return (
    <>
      {c.divider !== 'none' && !noDivider ? <View style={{ borderTopWidth: c.divider === 'strong' ? 1.5 : 0.75, borderTopColor: c.divider === 'strong' ? K.ink900 : K.ink200, marginBottom: below }} /> : null}
      {c.eyebrow ? <T style={[S.eyebrow, { color: K.ink600 }]}>{rx(plain(c.eyebrow))}</T> : null}
      {c.title ? <Balanced text={c.title} style={[S.h3, { color: K.ink900, marginTop: c.eyebrow ? 4.5 : 0 }]} maxW={W} /> : null}
      {c.text ? <T style={[S.body, { color: K.ink700, marginTop: 9 }]} orphans={2} widows={2}>{rx(pretty(plain(c.text)))}</T> : null}
    </>
  );
}

// ------------------------------------------------------------------ C2 Text

function ListItems({ items, numbered, style, gap = 3 }: { items: string[]; numbered: boolean; style: Style; gap?: number }) {
  const list = items.filter((x) => x.trim());
  const size = Number(style.fontSize ?? 10);
  const lh = Number(style.lineHeight ?? 1.5);
  return (
    <>
      {list.map((it, i) => (
        <View key={i} wrap={false} style={{ flexDirection: 'row', marginTop: i ? gap : 0 }}>
          <View style={{ width: 13.5 }}>
            {numbered ? <T style={[style, { fontWeight: 600, color: K.ink900 }, TNUM]}>{`${i + 1}.`}</T> : <Dot top={(size * lh) / 2 - 1.5} />}
          </View>
          <T style={[style, { flex: 1 }]}>{rx(pretty(plain(it)))}</T>
        </View>
      ))}
    </>
  );
}

function TextView({ c }: { c: TextC }) {
  const st = c.size === 'lead' ? [S.lead, { color: K.ink900 }] : c.size === 'small' ? [S.small, { lineHeight: 1.6, color: K.ink600 }] : [S.body, { color: K.ink700 }];
  const flat = Object.assign({}, ...st) as Style;
  if (c.variant !== 'paragraph') return <ListItems items={c.items} numbered={c.variant === 'numbered'} style={flat} />;
  const gap = c.size === 'lead' ? 10.5 : 7.5;
  return (
    <>
      {c.paragraphs.filter((p) => p.trim()).map((p, i) => (
        <T key={i} style={[flat, { marginTop: i ? gap : 0 }]} orphans={2} widows={2}>
          {rx(pretty(plain(p)))}
        </T>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ C3 Letter

function LetterView({ c, doc }: { c: LetterC; doc: ProposalDocV2 }) {
  const paras = c.paragraphs.filter((p) => p.trim());
  const by = doc.cover.preparedBy;
  const para = (p: string, i: number) => (
    <T key={i} style={[S.lead, { color: K.ink900, marginTop: i ? 10.5 : 12 }]} orphans={2} widows={2}>
      {rx(pretty(plain(p)))}
    </T>
  );
  return (
    <>
      <View wrap={false} minPresenceAhead={60}>
        <T style={[S.eyebrow, { color: K.crimson600 }]}>{rx(plain(c.eyebrow))}</T>
        <T style={[S.salutation, { color: K.ink900, marginTop: 6 }]}>{rx(plain(c.salutation))}</T>
      </View>
      {paras.slice(0, -1).map(para)}
      {/* The last paragraph keeps with the sign-off. */}
      <View wrap={false}>
        {paras.length ? para(paras[paras.length - 1], paras.length - 1) : null}
        <T style={{ fontSize: 10.5, lineHeight: 1.5, fontWeight: 600, color: K.ink900, marginTop: 13.5 }}>{plain(by.name)}</T>
        <T style={{ fontSize: 10.5, lineHeight: 1.5, color: K.ink600 }}>{plain(by.title)}</T>
      </View>
    </>
  );
}

// ------------------------------------------------------------------ C4 Stats

function StatsView({ c, W }: { c: StatsC; W: number }) {
  if (c.variant === 'strip') {
    const cw = W / 3;
    return (
      <View style={{ flexDirection: 'row', borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: K.ink200 }}>
        {c.items.map((s, i) => (
          <View key={i} style={{ width: cw, paddingVertical: 12, paddingLeft: i ? 12 : 0, paddingRight: 12, borderLeftWidth: i ? 0.75 : 0, borderLeftColor: K.ink200 }}>
            <T style={[S.statLg, { color: c.highlight === i ? K.crimson600 : K.ink900 }]}>{plain(stripMarkers(s.value))}</T>
            <T style={{ fontSize: 9.75, lineHeight: 1.4, color: K.ink600, marginTop: 1.5 }}>{rx(plain(s.label))}</T>
          </View>
        ))}
      </View>
    );
  }
  const n = c.columns;
  const gap = 9;
  const cw = (W - gap * (n - 1)) / n;
  const small = n === 4 && c.items.some((s) => stripMarkers(s.value).length > 9);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      {c.items.map((s, i) => {
        const hi = c.highlight === i;
        return (
          <View key={i} style={{ width: cw, marginLeft: i ? gap : 0, backgroundColor: hi ? K.crimson50 : K.surface, borderWidth: 0.75, borderColor: hi ? K.crimson100 : K.ink200, borderRadius: 9, padding: 12 }}>
            <T style={[S.caption, { color: hi ? K.crimson700 : K.ink500 }]}>{rx(plain(s.label))}</T>
            <T style={[S.statMd, small ? { fontSize: 15 } : {}, { color: K.ink900, marginTop: 4.5 }]}>{plain(stripMarkers(s.value))}</T>
            {s.description ? <T style={[S.captionText, { color: K.ink600, marginTop: 4.5 }]}>{rx(pretty(plain(s.description)))}</T> : null}
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ C5 CardGrid

const initials = (s: string) =>
  stripMarkers(s)
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '·';

function Card({ c, it, i, w }: { c: CardGridC; it: CardGridC['items'][number]; i: number; w: number }) {
  const box: Style = { width: w, flexGrow: 1, backgroundColor: K.surface, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 9 };
  switch (c.variant) {
    case 'card':
      return (
        <View style={[box, { padding: 12 }]}>
          <T style={[S.title, c.compact ? { fontSize: 9.75 } : {}, { color: K.ink900 }]}>{rx(plain(it.title))}</T>
          {it.text ? <T style={[S.cardText, { color: K.ink700, marginTop: 4.5 }]}>{rx(pretty(plain(it.text)))}</T> : null}
          {it.chips.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7.5 }}>
              {it.chips.map((ch, k) => (
                <View key={k} style={{ backgroundColor: ch.tone === 'positive' ? K.emerald50 : K.ink100, borderRadius: 9, paddingVertical: 3, paddingHorizontal: 7.5, marginRight: 6, marginBottom: 3 }}>
                  <T style={[S.caption, { color: ch.tone === 'positive' ? K.emerald700 : K.ink900 }]}>{plain(stripMarkers(ch.text))}</T>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      );
    case 'icon':
      return (
        <View style={[box, { paddingVertical: 9, paddingHorizontal: 10.5, flexDirection: 'row' }]}>
          <Icon name={it.icon} size={15} style={{ marginTop: 0.5 }} />
          <View style={{ flex: 1, marginLeft: 7.5 }}>
            <T style={[S.titleSm, { color: K.ink900 }]}>{rx(plain(it.title))}</T>
            {it.text ? <T style={[S.small, { color: K.ink600, marginTop: 3 }]}>{rx(pretty(plain(it.text)))}</T> : null}
          </View>
        </View>
      );
    case 'person':
      return (
        <View style={[box, { padding: 13.5 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: K.ink100, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 10.5, fontWeight: 600, color: K.ink700, lineHeight: 1 }}>{it.initials.trim() || initials(/^(\p{Lu}[\p{L}.'-]*\s*){2,3}$/u.test(stripMarkers(it.subtitle).trim()) ? it.subtitle : it.title)}</T>
            </View>
            <View style={{ flex: 1, marginLeft: 9 }}>
              <T style={[S.title, { color: K.ink900 }]}>{rx(plain(it.title))}</T>
              {it.subtitle ? <T style={[S.cardText, { color: K.ink600 }]}>{rx(plain(it.subtitle))}</T> : null}
            </View>
          </View>
          {it.text ? <T style={[S.bodySm, { color: K.ink700, marginTop: 9 }]}>{rx(pretty(plain(it.text)))}</T> : null}
        </View>
      );
    case 'step':
      return (
        <View style={[box, { padding: 12 }]}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: K.ink900, alignItems: 'center', justifyContent: 'center' }}>
            <T style={[{ fontSize: 10.5, fontWeight: 600, color: K.ink50, lineHeight: 1 }, TNUM]}>{String(i + 1)}</T>
          </View>
          <T style={[S.title, { color: K.ink900, marginTop: 9 }]}>{rx(plain(it.title))}</T>
          {it.text ? <T style={[S.cardText, { color: K.ink700, marginTop: 3 }]}>{rx(pretty(plain(it.text)))}</T> : null}
        </View>
      );
    case 'list':
      return (
        <View style={[box, { paddingVertical: 12, paddingHorizontal: 13.5 }]}>
          <T style={[S.titleSm, { color: K.ink900 }]}>{rx(plain(it.title))}</T>
          <View style={{ marginTop: 6 }}>
            <ListItems items={it.bullets} numbered={false} style={[S.cardText, { color: K.ink700 }].reduce((a, b) => ({ ...a, ...b }), {})} />
          </View>
        </View>
      );
    case 'plain':
    case 'plain-ruled': {
      const ruled = c.variant === 'plain-ruled';
      return (
        <View style={{ width: w, flexGrow: 1, ...(ruled ? { borderTopWidth: 1.5, borderTopColor: K.ink900, paddingTop: 9 } : {}) }}>
          <T style={[S.titleSm, ruled ? { fontSize: 10.13 } : {}, { color: K.ink900 }]}>{rx(plain(it.title))}</T>
          {it.text ? <T style={[ruled ? { fontSize: 10.13, lineHeight: 1.5 } : S.body, { color: K.ink700, marginTop: 4.5 }]}>{rx(pretty(plain(it.text)))}</T> : null}
        </View>
      );
    }
  }
}

function CardGridView({ c, W }: { c: CardGridC; W: number }) {
  const n = c.columns;
  const plainish = c.variant === 'plain' || c.variant === 'plain-ruled';
  const gap = plainish ? 18 : n === 2 ? 9 : 7.5;
  const w = (W - gap * (n - 1)) / n;
  const items = c.items.filter((it) => it.title.trim() || it.text.trim() || it.bullets.some((b) => b.trim()));
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return (
    <>
      {rows.map((row, ri) => (
        <View key={ri} wrap={false} style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: ri ? (plainish ? 13.5 : gap) : 0 }}>
          {row.map((it, k) => (
            <View key={k} style={{ marginLeft: k ? gap : 0, flexDirection: 'column' }}>
              <Card c={c} it={it} i={ri * n + k} w={w} />
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ C6 DetailCard

function DetailCardView({ c, W }: { c: DetailCardC; W: number }) {
  const subs = c.subItems.filter((s) => s.title.trim() || s.text.trim());
  const sw = subs.length === 2 ? (W - 27 - 1.5 - 7.5) / 2 : W - 28.5;
  return (
    <View style={{ backgroundColor: K.surface, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 9, padding: 13.5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <T style={[S.titleLg, { color: K.ink900, flex: 1 }]}>{rx(plain(c.title))}</T>
        {c.tag ? (
          c.variant === 'pill' ? (
            <View style={{ backgroundColor: K.ink100, borderRadius: 9, paddingVertical: 3, paddingHorizontal: 7.5, marginLeft: 9 }}>
              <T style={[S.caption, { color: K.ink600 }]}>{plain(stripMarkers(c.tag))}</T>
            </View>
          ) : (
            <T style={[S.caption, { color: K.ink500, marginLeft: 9, marginTop: 1.5 }]}>{plain(stripMarkers(c.tag))}</T>
          )
        ) : null}
      </View>
      {c.text ? <T style={[S.body, { color: K.ink700, marginTop: 7.5 }]}>{rx(pretty(plain(c.text)))}</T> : null}
      {subs.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: 10.5 }}>
          {subs.map((s, i) => (
            <View key={i} style={{ width: sw, marginLeft: i ? 7.5 : 0, backgroundColor: K.canvas, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10.5 }}>
              <T style={[S.titleSm, { color: K.ink900 }]}>{rx(plain(s.title))}</T>
              {s.text ? <T style={[S.cardText, { lineHeight: 1.4, color: K.ink600, marginTop: 3 }]}>{rx(pretty(plain(s.text)))}</T> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ C7 Roadmap

function RoadmapView({ c, W }: { c: RoadmapC; W: number }) {
  const n = c.phases.length;
  const gap = 7.5;
  const cw = (W - gap * (n - 1)) / n;
  const gates = c.phases.some((p) => p.gateTitle.trim());
  const bands = c.bandLeft.trim() || c.bandRight.trim();
  const k = c.bandSplit;
  const lw = k * cw + (k - 1) * gap;
  const band = (text: string, w: number, dark: boolean, ml: number) => (
    <View style={{ width: w, marginLeft: ml, borderRadius: 6, padding: 9, alignItems: 'center', justifyContent: 'center', ...(dark ? { backgroundColor: K.ink900 } : { backgroundColor: K.ink100, borderWidth: 0.75, borderColor: K.ink200 }) }}>
      <T style={{ fontSize: 9.75, lineHeight: 1.3, fontWeight: 500, color: dark ? K.ink50 : K.ink900, textAlign: 'center' }}>{rx(plain(text), { dark })}</T>
    </View>
  );
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {c.phases.map((p, i) => {
          const hi = c.highlight === i;
          return (
            <View key={i} style={{ width: cw, marginLeft: i ? gap : 0, backgroundColor: hi ? K.crimson50 : K.surface, borderWidth: 0.75, borderColor: hi ? K.crimson600 : K.ink200, borderRadius: 9, padding: 10.5 }}>
              <T style={[S.caption, { color: hi ? K.crimson700 : K.ink500 }]}>{rx(plain(p.label))}</T>
              <T style={[S.title, { color: K.ink900, marginTop: 3 }]}>{rx(plain(p.title))}</T>
              {p.text ? <T style={[S.cardText, { lineHeight: 1.45, color: hi ? K.ink700 : K.ink600, marginTop: 6 }]}>{rx(pretty(plain(p.text)))}</T> : null}
            </View>
          );
        })}
      </View>
      {gates ? (
        <View style={{ flexDirection: 'row', marginTop: 9 }}>
          {c.phases.map((p, i) => (
            <View key={i} style={{ width: cw, marginLeft: i ? gap : 0, flexDirection: 'row' }}>
              {p.gateTitle.trim() ? (
                <>
                  <Diamond style={{ marginTop: 3 }} />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <T style={{ fontSize: 9, lineHeight: 1.4, fontWeight: 600, color: K.ink900 }}>{rx(plain(p.gateTitle))}</T>
                    {p.gateSub ? <T style={{ fontSize: 9, lineHeight: 1.4, color: K.ink600 }}>{rx(plain(p.gateSub))}</T> : null}
                  </View>
                </>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {bands ? (
        <View style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: 9 }}>
          {band(c.bandLeft, lw, false, 0)}
          {band(c.bandRight, W - lw - gap, c.bandDark, gap)}
        </View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ C8 DarkBand

function HeadlineWithHighlight({ headline, highlight }: { headline: string; highlight: string }) {
  const h = stripMarkers(headline);
  const at = highlight ? h.indexOf(highlight) : -1;
  if (at < 0) return <>{plain(h)}</>;
  return (
    <>
      {plain(h.slice(0, at))}
      <Text style={{ color: K.crimson500 }}>{plain(highlight)}</Text>
      {plain(h.slice(at + highlight.length))}
    </>
  );
}

function DarkBandView({ c }: { c: DarkBandC }) {
  const num = c.variant === 'number';
  return (
    <View style={{ backgroundColor: K.ink950, borderRadius: 9, paddingVertical: 13.5, paddingHorizontal: 16.5, flexDirection: 'row', alignItems: num ? 'center' : 'flex-start' }}>
      <View style={{ width: num ? 90 : 127.5, justifyContent: 'center' }}>
        {c.label ? <T style={[S.caption, { color: K.ink400 }]}>{plain(stripMarkers(c.label))}</T> : null}
        {num ? (
          <T style={[S.bigNumber, { color: K.crimson500, marginTop: 1.5 }]}>{plain(stripMarkers(c.number))}</T>
        ) : (
          <T style={[S.bandTitle, { color: K.ink50, marginTop: 3 }]}>
            <HeadlineWithHighlight headline={c.headline} highlight={c.highlight} />
          </T>
        )}
      </View>
      <T style={[num ? S.lead : S.body, { color: K.ink300, flex: 1, marginLeft: 18 }]}>{rx(pretty(plain(c.text)), { dark: true })}</T>
    </View>
  );
}

// ------------------------------------------------------------------ C9 DataTable / C10 PriceTable

function colWidths(c: DataTableC): number[] {
  const kinds = c.columns.map((x) => x.kind);
  const n = kinds.length;
  if (n === 5 && kinds[0] === 'label' && kinds.slice(1, 4).every((k) => k === 'number') && kinds[4] === 'bar') return [0.34, 0.1533, 0.1533, 0.1534, 0.2];
  if (n === 3 && kinds[0] === 'label' && kinds[1] === 'text' && kinds[2] === 'text') return [0.22, 0.39, 0.39];
  let label = n >= 4 ? 0.26 : 0.34;
  const fixed = (k: string) => (k === 'number' ? 0.16 : k === 'bar' ? 0.2 : 0);
  const texts = kinds.slice(1).filter((k) => k === 'text').length;
  let rest = 1 - label - kinds.slice(1).reduce((a, k) => a + fixed(k), 0);
  if (texts && rest / texts < 0.22 && label > 0.26) {
    rest += label - 0.26;
    label = 0.26;
  }
  return kinds.map((k, i) => (i === 0 ? label : k === 'text' ? rest / Math.max(1, texts) : fixed(k)));
}

/** Ranges ("$7,500–$10,000/mo") wrap after the en dash, only when the value does not fit on one line. */
function fitRange(s: string, width: number, size: number, weight: number): string {
  if (!s.includes('–') || measure(s, size, weight, 0, ['tnum']) <= width) return s;
  return s.replace('–', '–\n');
}

/** "53–55%" -> 54; "63%" -> 63 (clamped 0-100). */
function barPct(v: string): number {
  const nums = (stripMarkers(v).match(/\d+(?:\.\d+)?/g) ?? []).map(Number).slice(0, 2);
  if (!nums.length) return 0;
  const p = nums.length === 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  return Math.max(0, Math.min(100, p));
}

function TableFrame({ head, rows, minFirst, keepLast }: { head: ReactNode; rows: ReactNode[]; minFirst: number; keepLast: boolean }) {
  // The header repeats on a continuation page (a fixed child of the split table). At least 2 rows stay with the
  // header (a zero-height guard asks for room for the header and 2 rows), and the last 2 rows stay together.
  const body = keepLast && rows.length >= 3 ? [...rows.slice(0, -2), <View key="last2" wrap={false}>{rows.slice(-2)}</View>] : rows;
  return (
    <>
      <View minPresenceAhead={minFirst} style={{ height: 0 }} />
      <View style={{ backgroundColor: K.surface, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 9 }}>
        <View fixed>{head}</View>
        {body}
      </View>
    </>
  );
}

const HEAD_RADIUS: Style = { borderTopLeftRadius: 8.25, borderTopRightRadius: 8.25 };

function DataTableView({ c, W }: { c: DataTableC; W: number }) {
  const inner = W - 1.5;
  const ws = colWidths(c).map((f) => f * inner);
  const dense = c.variant === 'dense';
  const pv = dense ? 5.25 : 7.5;
  const rows = c.rows.filter((r) => r.cells.some((x) => x.trim()));
  const last = c.columns.length - 1;
  const head = (
    <View style={[{ flexDirection: 'row', backgroundColor: K.ink100, borderBottomWidth: 0.75, borderBottomColor: K.ink200 }, HEAD_RADIUS]}>
      {c.columns.map((col, j) => {
        const hi = c.highlightCol === j;
        return (
          <View key={j} style={{ width: ws[j], paddingVertical: pv, paddingHorizontal: 9, ...(hi ? { backgroundColor: K.ink900, ...(j === last ? { borderTopRightRadius: 8.25 } : {}) } : {}) }}>
            <T style={[S.caption, { color: hi ? K.ink50 : K.ink600, textAlign: col.kind === 'number' ? 'right' : 'left' }]}>{plain(stripMarkers(col.header))}</T>
          </View>
        );
      })}
    </View>
  );
  const cell = (j: number, text: string, sub: string) => {
    const col = c.columns[j];
    const base: Style = { fontSize: 9.75, lineHeight: 1.45 };
    let body: ReactNode;
    if (col.kind === 'label') body = <T style={[base, { fontWeight: 600, color: K.ink900 }]}>{rx(plain(text))}</T>;
    else if (col.kind === 'text') body = <T style={[base, { color: c.highlightCol === j ? K.ink900 : K.ink700 }]}>{rx(plain(text))}</T>;
    else if (col.kind === 'number') {
      const tone: Style = col.tone === 'strong' ? { fontWeight: 600, color: K.ink900 } : col.tone === 'muted' ? { color: K.ink600 } : col.tone === 'positive' ? { fontWeight: 600, color: K.emerald700 } : { color: K.ink900 };
      body = <T style={[base, tone, TNUM, { textAlign: 'right' }]}>{fitRange(plain(stripMarkers(text)), ws[j] - 18, 9.75, col.tone === 'strong' || col.tone === 'positive' ? 600 : 400)}</T>;
    } else {
      const pct = barPct(text);
      body = (
        <View>
          <T style={[base, { fontWeight: 600, color: K.ink900 }, TNUM]}>{plain(stripMarkers(text))}</T>
          <View style={{ height: 4.5, borderRadius: 2.25, backgroundColor: K.ink100, marginTop: 3 }}>
            <View style={{ width: `${pct}%`, height: 4.5, borderRadius: 2.25, backgroundColor: K.ink900 }} />
          </View>
        </View>
      );
    }
    return (
      <View key={j} style={{ width: ws[j], paddingVertical: pv, paddingHorizontal: 9 }}>
        {body}
        {sub ? <T style={[S.captionText, { color: K.ink500, textAlign: col.kind === 'number' ? 'right' : 'left' }]}>{plain(stripMarkers(sub))}</T> : null}
      </View>
    );
  };
  const body = rows.map((r, i) => (
    <View key={i} wrap={false} style={{ flexDirection: 'row', ...(i < rows.length - 1 ? { borderBottomWidth: 0.75, borderBottomColor: K.ink200 } : {}) }}>
      {r.cells.map((x, j) => cell(j, x, r.subs[j] ?? ''))}
    </View>
  ));
  return <TableFrame head={head} rows={body} minFirst={(dense ? 24 : 28) + 2 * (dense ? 28 : 34)} keepLast />;
}

function PriceTableView({ c, W }: { c: PriceTableC; W: number }) {
  const four = c.variant === '4col';
  const inner = W - 1.5;
  const ws = (four ? [0.22, 0.32, 0.18, 0.28] : [0.38, 0.18, 0.44]).map((x) => x * inner);
  const rateCol = four ? 2 : 1;
  const rows = c.rows.filter((r) => r.item.trim() || r.rate.trim() || r.terms.trim());
  const pad: Style = { paddingVertical: 5.25, paddingHorizontal: 9 };
  const head = (
    <View style={[{ flexDirection: 'row', backgroundColor: K.ink100, borderBottomWidth: 0.75, borderBottomColor: K.ink200 }, HEAD_RADIUS]}>
      {c.headers.map((h, j) => (
        <View key={j} style={[pad, { width: ws[j] }]}>
          <T style={[S.caption, { color: K.ink600, textAlign: j === rateCol ? 'right' : 'left' }]}>{plain(stripMarkers(h))}</T>
        </View>
      ))}
    </View>
  );
  const base: Style = { fontSize: 9.75, lineHeight: 1.45 };
  const total = c.showTotal ? priceTotal(c) : null;
  const body = rows.map((r, i) => {
    const cells: ReactNode[] = [];
    if (four) cells.push(<View key="cat" style={[pad, { width: ws[0] }]}><T style={[base, { color: K.ink600 }]}>{rx(plain(r.category))}</T></View>);
    cells.push(
      <View key="item" style={[pad, { width: ws[four ? 1 : 0] }]}>
        <T style={[base, { fontWeight: 600, color: K.ink900 }]}>{rx(plain(r.item))}</T>
        {r.itemNote ? <T style={[S.captionText, { color: K.ink500 }]}>{plain(stripMarkers(r.itemNote))}</T> : null}
      </View>,
    );
    cells.push(
      <View key="rate" style={[pad, { width: ws[rateCol] }]}>
        <T style={[base, { fontWeight: 600, color: K.ink900, textAlign: 'right' }, TNUM]}>{fitRange(plain(stripMarkers(r.rate)), ws[rateCol] - 18, 9.75, 600)}</T>
        {r.rateNote ? <T style={{ fontSize: 9, lineHeight: 1.4, color: K.ink500, textAlign: 'right' }}>{plain(stripMarkers(r.rateNote))}</T> : null}
      </View>,
    );
    cells.push(<View key="terms" style={[pad, { width: ws[four ? 3 : 2] }]}><T style={[S.cardText, { color: K.ink700 }]}>{rx(pretty(plain(r.terms)))}</T></View>);
    return (
      <View key={r.id} wrap={false} style={{ flexDirection: 'row', ...(i < rows.length - 1 || total ? { borderBottomWidth: 0.75, borderBottomColor: total && i === rows.length - 1 ? K.ink900 : K.ink200 } : {}) }}>
        {cells}
      </View>
    );
  });
  if (total) {
    const money = `${total.prefix}${total.amount.toLocaleString('en-US', { minimumFractionDigits: total.amount % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    body.push(
      <View key="total" wrap={false} style={{ flexDirection: 'row' }}>
        <View style={[pad, { width: ws.slice(0, rateCol).reduce((a, b) => a + b, 0) }]}><T style={[base, { fontWeight: 600, color: K.ink900 }]}>Total</T></View>
        <View style={[pad, { width: ws[rateCol] }]}><T style={[base, { fontWeight: 600, color: K.ink900, textAlign: 'right' }, TNUM]}>{money}</T></View>
      </View>,
    );
  }
  return <TableFrame head={head} rows={body} minFirst={22 + 2 * 30} keepLast />;
}

// ------------------------------------------------------------------ C11 Economics

const num = (s: string) => {
  const m = stripMarkers(s).replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!m) return null;
  const ns = m.slice(0, 2).map(Number);
  return ns.length === 2 ? (ns[0] + ns[1]) / 2 : ns[0];
};

function EconomicsView({ c, W }: { c: EconomicsC; W: number }) {
  const w = (W - 9) / 2;
  const lines = c.lines.filter((l) => l.label.trim() || l.value.trim());
  const v1 = num(c.bars[0]?.value ?? '');
  const v2 = num(c.bars[1]?.value ?? '');
  const pctOwn = Number(c.barPct);
  const p2 = c.barPct.trim() && Number.isFinite(pctOwn) ? Math.max(0, Math.min(100, pctOwn)) : v1 && v2 !== null ? Math.max(0, Math.min(100, (v2 / v1) * 100)) : 50;
  const row: Style = { flexDirection: 'row', justifyContent: 'space-between' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <View style={{ width: w, backgroundColor: K.surface, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 9, padding: 15 }}>
        <T style={[S.caption, { color: K.ink500 }]}>{plain(stripMarkers(c.leftLabel))}</T>
        <T style={[S.title, { color: K.ink900, marginTop: 3 }]}>{rx(plain(c.leftTitle))}</T>
        <View style={{ marginTop: 10.5 }}>
          {lines.map((l, i) => (
            <View key={i} style={[row, { marginTop: i ? 6 : 0 }]}>
              <T style={{ fontSize: 9.75, lineHeight: 1.4, color: K.ink600, flex: 1 }}>{rx(plain(l.label))}</T>
              <T style={[{ fontSize: 9.75, lineHeight: 1.4, color: K.ink900, marginLeft: 6 }, TNUM]}>{plain(stripMarkers(l.value))}</T>
            </View>
          ))}
          {c.totalLabel || c.totalValue ? (
            <View style={[row, { marginTop: 6, borderTopWidth: 0.75, borderTopColor: K.ink200, paddingTop: 6 }]}>
              <T style={{ fontSize: 9.75, lineHeight: 1.4, fontWeight: 600, color: K.ink900 }}>{plain(stripMarkers(c.totalLabel))}</T>
              <T style={[{ fontSize: 9.75, lineHeight: 1.4, fontWeight: 600, color: K.ink900 }, TNUM]}>{plain(stripMarkers(c.totalValue))}</T>
            </View>
          ) : null}
        </View>
        {c.note ? <T style={[S.cardText, { lineHeight: 1.55, color: K.ink700, marginTop: 10.5 }]}>{rx(pretty(plain(c.note)))}</T> : null}
      </View>
      <View style={{ width: w, marginLeft: 9, backgroundColor: K.ink950, borderRadius: 9, padding: 15 }}>
        <T style={[S.caption, { color: K.ink400 }]}>{plain(stripMarkers(c.rightLabel))}</T>
        <T style={[S.title, { color: K.ink50, marginTop: 3 }]}>{rx(plain(c.rightTitle), { dark: true })}</T>
        <View style={{ marginTop: 10.5 }}>
          {c.bars.slice(0, 2).map((b, i) => (
            <View key={i} style={{ marginTop: i ? 7.5 : 0 }}>
              <View style={row}>
                <T style={{ fontSize: 9.75, lineHeight: 1.4, color: K.ink400 }}>{plain(stripMarkers(b.label))}</T>
                <T style={[{ fontSize: 9.75, lineHeight: 1.4, color: K.ink50 }, TNUM]}>{plain(stripMarkers(b.value))}</T>
              </View>
              <View style={{ marginTop: 3, height: 6, borderRadius: 3, width: `${i === 0 ? 100 : p2}%`, backgroundColor: i === 0 ? K.ink50 : K.ink600 }} />
            </View>
          ))}
        </View>
        {c.resultLabel ? <T style={[S.captionText, { color: K.ink400, marginTop: 12 }]}>{plain(stripMarkers(c.resultLabel))}</T> : null}
        {c.resultValue ? <T style={[S.profit, { color: K.crimson500 }]}>{plain(stripMarkers(c.resultValue))}</T> : null}
        {c.subline ? <T style={{ fontSize: 9.75, lineHeight: 1.4, color: K.ink300, marginTop: 3 }}>{plain(stripMarkers(c.subline))}</T> : null}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ C12 Callout, C13 ProcessRows, C14 Checklist

function CalloutView({ c }: { c: CalloutC }) {
  const ok = c.variant === 'success';
  return (
    <View style={{ borderRadius: 9, paddingVertical: 12, paddingHorizontal: 13.5, flexDirection: 'row', backgroundColor: ok ? K.emerald50 : K.surface, borderWidth: 0.75, borderColor: ok ? K.emerald200 : K.ink200 }}>
      <Icon name={ok ? 'circle-check' : c.icon} size={15} color={ok ? K.emerald700 : K.ink700} stroke={ok ? 1.75 : 1.5} style={{ marginTop: 1.5 }} />
      <T style={[S.bodySm, { lineHeight: 1.6, color: ok ? K.ink900 : K.ink700, flex: 1, marginLeft: 10.5 }]}>
        {c.leadIn ? <Text style={{ fontWeight: 600, color: ok ? K.emerald700 : K.ink900 }}>{`${stripMarkers(c.leadIn)} `}</Text> : null}
        {rx(pretty(plain(c.text)))}
      </T>
    </View>
  );
}

function ProcessView({ c, W }: { c: ProcessC; W: number }) {
  const bw = (W - 82.5 - 6 - 12) / 3;
  return (
    <View>
      {c.rows.map((r, i) => (
        <View key={i} wrap={false} style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: i ? 7.5 : 0 }}>
          <View style={{ width: 82.5, marginRight: 6, justifyContent: 'center' }}>
            <T style={[S.titleSm, { color: K.ink900 }]}>{rx(plain(r.label))}</T>
          </View>
          {r.boxes.map((b, j) => {
            const dark = c.lastDark && j === 2;
            return (
              <View key={j} style={{ width: bw, marginLeft: j ? 6 : 0, borderRadius: 6, paddingVertical: 7.5, paddingHorizontal: 9, ...(dark ? { backgroundColor: K.ink900 } : { backgroundColor: K.surface, borderWidth: 0.75, borderColor: K.ink200 }) }}>
                <T style={{ fontSize: 9, lineHeight: 1.4, color: dark ? K.ink400 : K.ink500 }}>{plain(stripMarkers(b.label))}</T>
                <T style={[S.title, { color: dark ? K.ink50 : K.ink900 }, TNUM]}>{plain(stripMarkers(b.value))}</T>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function ChecklistView({ c, W }: { c: ChecklistC; W: number }) {
  const items = c.items.filter((x) => x.trim());
  const cw = (W - 27 - 1.5 - 18) / 2;
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ backgroundColor: K.ink100, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 9, paddingVertical: 10.5, paddingHorizontal: 13.5 }}>
      <T style={[S.titleSm, { color: K.ink900 }]}>{rx(plain(c.title))}</T>
      <View style={{ marginTop: 4.5 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', marginTop: ri ? 3 : 0 }}>
            {row.map((it, k) => (
              <View key={k} style={{ width: cw, marginLeft: k ? 18 : 0, flexDirection: 'row' }}>
                <Checkbox style={{ marginTop: 3.5 }} />
                <T style={[S.cardText, { color: K.ink700, flex: 1, marginLeft: 4.5 }]}>{rx(plain(it))}</T>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ component dispatch

const ATOMIC = new Set<Component['type']>(['section-header', 'stats', 'roadmap', 'dark-band', 'detail-card', 'economics', 'callout', 'process', 'checklist']);

function ComponentBody({ c, ctx, doc }: { c: Component; ctx: Ctx; doc: ProposalDocV2 }) {
  const W = ctx.W;
  switch (c.type) {
    case 'section-header':
      return <SectionHeaderView c={c} W={W} noDivider={ctx.layout.noDivider.includes(c.id)} />;
    case 'text':
      return <TextView c={c} />;
    case 'letter':
      return <LetterView c={c} doc={doc} />;
    case 'stats':
      return <StatsView c={c} W={W} />;
    case 'card-grid':
      return <CardGridView c={c} W={W} />;
    case 'detail-card':
      return <DetailCardView c={c} W={W} />;
    case 'roadmap':
      return <RoadmapView c={c} W={W} />;
    case 'dark-band':
      return <DarkBandView c={c} />;
    case 'data-table':
      return <DataTableView c={c} W={W} />;
    case 'price-table':
      return <PriceTableView c={c} W={W} />;
    case 'economics':
      return <EconomicsView c={c} W={W} />;
    case 'callout':
      return <CalloutView c={c} />;
    case 'process':
      return <ProcessView c={c} W={W} />;
    case 'checklist':
      return <ChecklistView c={c} W={W} />;
  }
}

/** react-pdf supports `bookmark` on any node (PDF outline entry); its View typings only list it on Page. */
const bookmark = (title: string) => ({ bookmark: { title: title.slice(0, 120), fit: true } }) as Record<string, unknown>;

function SectionView({ s, i, ctx, doc, breakBefore }: { s: SectionV2; i: number; ctx: Ctx; doc: ProposalDocV2; breakBefore: boolean }) {
  const hasHead = Boolean(s.eyebrow || s.heading || s.lead);
  let prev: Component | 'header' | null = hasHead ? 'header' : null;
  const top = (id: string) => ctx.layout.top.includes(id);
  return (
    <View {...bookmark(sectionName(s, i))} break={breakBefore}>
      <Mark k={`s:${s.id}:a`} rec={ctx.rec} />
      {hasHead ? (
        <View wrap={false} minPresenceAhead={90} style={{ marginTop: FRAME_V2.firstGap }}>
          <Mark k={`b:${s.id}h:a`} rec={ctx.rec} />
          <PageHeader eyebrow={s.eyebrow} title={s.heading} lead={s.lead} W={ctx.W} />
          <Mark k={`b:${s.id}h:z`} rec={ctx.rec} />
        </View>
      ) : null}
      {s.blocks.map((c, bi) => {
        const first = !hasHead && bi === 0;
        const noDiv = ctx.layout.noDivider.includes(c.id);
        let gap = first || top(c.id) || noDiv ? FRAME_V2.firstGap : gapAbove(prev, c);
        if (c.type === 'section-header' && c.variant === 'page' && first) gap = FRAME_V2.firstGap;
        prev = c;
        const atomic = ATOMIC.has(c.type);
        const keep = c.type === 'section-header' ? (c.variant === 'block' || c.variant === 'group' ? 60 : 90) : undefined;
        return (
          <View key={c.id} wrap={!atomic} break={c.newPage && !(first && breakBefore)} minPresenceAhead={keep} style={{ marginTop: gap }}>
            <Mark k={`b:${c.id}:a`} rec={ctx.rec} />
            <ComponentBody c={c} ctx={ctx} doc={doc} />
            <Mark k={`b:${c.id}:z`} rec={ctx.rec} />
          </View>
        );
      })}
      <Mark k={`s:${s.id}:z`} rec={ctx.rec} />
    </View>
  );
}

// ------------------------------------------------------------------ frames

function clientLabel(doc: ProposalDocV2): string {
  const c = stripMarkers(doc.cover.clientCompany.trim());
  return c ? `${c} × Appointmentlyy` : 'Appointmentlyy';
}

/** "Prepared for Jordan Berg, CREDaily" (≤ 64; the contact is cut at a word, the company never). */
function footerLeft(doc: ProposalDocV2): string {
  const co = stripMarkers(doc.cover.clientCompany.trim());
  const who = stripMarkers(doc.cover.preparedFor.name.trim());
  if (!who) return co ? `Prepared for ${co}` : '';
  let full = `Prepared for ${who}, ${co}`;
  if (!co) full = `Prepared for ${who}`;
  if (full.length <= 64) return full;
  const room = 64 - `Prepared for , ${co}`.length;
  const words = who.split(' ');
  let name = '';
  for (const w of words) if (`${name} ${w}`.trim().length <= room) name = `${name} ${w}`.trim();
  return name ? `Prepared for ${name}, ${co}` : `Prepared for ${co}`;
}

function RunningHeader({ doc, W, layout }: { doc: ProposalDocV2; W: number; layout: Layout }) {
  const label = docLabelOf(doc);
  return (
    <>
      <View fixed style={{ position: 'absolute', top: FRAME_V2.headerTop, left: FRAME_V2.side, width: W, height: 21, borderBottomWidth: 0.75, borderBottomColor: K.ink200 }}>
        <T style={[S.caption, { fontWeight: 600, color: K.ink900, width: W * 0.55 }]}>{plain(clientLabel(doc))}</T>
      </View>
      <Text
        fixed
        style={[S.caption, { position: 'absolute', top: FRAME_V2.headerTop, right: FRAME_V2.side, width: W * 0.45, textAlign: 'right', color: K.ink500 }]}
        render={({ pageNumber }) => layout.head[pageNumber] ?? label}
      />
    </>
  );
}

function Footer({ doc, W, H, layout }: { doc: ProposalDocV2; W: number; H: number; layout: Layout }) {
  const top = footerTop(H);
  return (
    <>
      <Text
        fixed
        style={[S.small, { position: 'absolute', top: gutterTop(H), left: FRAME_V2.side, width: W, color: K.ink600 }]}
        render={({ pageNumber }) => layout.cont[pageNumber] ?? ''}
      />
      <View fixed style={{ position: 'absolute', top, left: FRAME_V2.side, width: W, borderTopWidth: 0.75, borderTopColor: K.ink200, paddingTop: 9 }}>
        <T style={[S.captionText, { lineHeight: 1.4, color: K.ink500, width: W - 60 }]}>{plain(footerLeft(doc))}</T>
      </View>
      <Text fixed style={[S.captionText, TNUM, { lineHeight: 1.4, position: 'absolute', top: top + 9.75, right: FRAME_V2.side, width: 60, textAlign: 'right', color: K.ink500 }]} render={({ pageNumber }) => String(pageNumber).padStart(2, '0')} />
    </>
  );
}

function Bars({ w, h, rects }: { w: number; h: number; rects: { x: number; w: number; h: number; fill: string }[] }) {
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w * 0.75, height: h * 0.75 }}>
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={h - r.h} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </Svg>
  );
}

const COVER_BARS = [
  { x: 40, w: 44, h: 120, fill: K.ink800 },
  { x: 108, w: 44, h: 190, fill: K.ink800 },
  { x: 176, w: 44, h: 268, fill: K.ink700 },
  { x: 244, w: 44, h: 352, fill: K.ink600 },
  { x: 312, w: 68, h: 440, fill: K.crimson500 },
];
const BAND_BARS = [
  { x: 20, w: 36, h: 90, fill: K.ink800 },
  { x: 76, w: 36, h: 140, fill: K.ink700 },
  { x: 132, w: 36, h: 200, fill: K.ink600 },
  { x: 184, w: 36, h: 260, fill: K.crimson500 },
];

function Cover({ doc, size }: { doc: ProposalDocV2; size: { w: number; h: number } }) {
  const c = doc.cover;
  const tl = stripMarkers(c.title).length;
  const titleStyle = tl <= 60 ? S.coverTitle : tl <= 80 ? S.coverTitleM : S.coverTitleS;
  const logoW = 126;
  const metaTitle = (t: string) => <T style={{ fontSize: 10.5, lineHeight: 1.55, color: K.ink300 }}>{plain(t)}</T>;
  const forTitle = [c.preparedFor.title, c.clientCompany].map((x) => stripMarkers(x).trim()).filter(Boolean).join(', ');
  const byTitle = [c.preparedBy.title, c.preparedBy.credential].map((x) => stripMarkers(x).trim()).filter(Boolean).join(' · ');
  const pageStyle: Style = { fontFamily: FONT_FAMILY, backgroundColor: K.ink950, padding: 48, flexDirection: 'column', color: K.ink50 };
  return (
    <Page size={[size.w, size.h]} style={pageStyle} {...({ bookmark: { title: 'Cover', fit: true } } as Record<string, unknown>)}>
      <View style={{ position: 'absolute', right: 0, top: 105 }}>
        <Bars w={380} h={440} rects={COVER_BARS} />
      </View>
      <View style={{ height: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        <Image src={LOGO_SRC} style={{ width: logoW, height: (logoW * LOGO_SIZE.h) / LOGO_SIZE.w }} />
        <View style={{ alignItems: 'flex-end' }}>
          <T style={[S.caption, { color: K.ink400 }]}>{plain(stripMarkers(c.docType))}</T>
          {c.date ? <T style={{ fontSize: 9, lineHeight: 1.4, color: K.ink400 }}>{plain(stripMarkers(c.date))}</T> : null}
        </View>
      </View>
      <View style={{ marginTop: 112.5 }}>
        <T style={[S.eyebrow, { color: K.crimson500 }]}>{plain(`Prepared for ${stripMarkers(c.clientCompany) || 'you'}`)}</T>
        <Balanced text={c.title} style={[titleStyle, { color: K.ink50, marginTop: 12 }]} maxW={405} dark />
        {c.lead ? <T style={[S.coverLead, { color: K.ink300, marginTop: 16.5, maxWidth: 345 }]}>{rx(pretty(plain(c.lead)), { dark: true })}</T> : null}
      </View>
      <View style={{ marginTop: 'auto' }}>
        {c.stats.length === 3 ? (
          <View style={{ flexDirection: 'row', borderTopWidth: 0.75, borderBottomWidth: 0.75, borderColor: K.ink800 }}>
            {c.stats.map((s, i) => (
              <View key={i} style={{ width: (size.w - 96) / 3, paddingVertical: 16.5, paddingLeft: i ? 15 : 0, paddingRight: 15, borderLeftWidth: i ? 0.75 : 0, borderLeftColor: K.ink800 }}>
                <T style={[S.coverStat, { color: c.highlight === i ? K.crimson500 : K.ink50 }]}>{plain(stripMarkers(s.value))}</T>
                <T style={{ fontSize: 9.75, lineHeight: 1.4, color: K.ink400, marginTop: 3 }}>{plain(stripMarkers(s.label))}</T>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', marginTop: c.stats.length === 3 ? 27 : 0 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            {/* Client logo slot: reserved, empty (backlog). */}
            <T style={[S.caption, { color: K.ink400 }]}>Prepared for</T>
            <T style={[S.titleLg, { color: K.ink50, marginTop: 4.5 }]}>{plain(stripMarkers(c.preparedFor.name) || stripMarkers(c.clientCompany))}</T>
            {forTitle ? metaTitle(forTitle) : null}
            {c.preparedFor.url ? <T style={{ fontSize: 10.5, lineHeight: 1.55, color: K.ink50 }}>{plain(stripMarkers(c.preparedFor.url))}</T> : null}
          </View>
          <View style={{ flex: 1, paddingLeft: 12 }}>
            <T style={[S.caption, { color: K.ink400 }]}>Prepared by</T>
            <T style={[S.titleLg, { color: K.ink50, marginTop: 4.5 }]}>{plain(stripMarkers(c.preparedBy.name))}</T>
            {byTitle ? metaTitle(byTitle) : null}
            {c.preparedBy.url ? <T style={{ fontSize: 10.5, lineHeight: 1.55, color: K.ink50 }}>{plain(stripMarkers(c.preparedBy.url))}</T> : null}
          </View>
        </View>
      </View>
    </Page>
  );
}

function ClosingBand({ doc, size, style }: { doc: ProposalDocV2; size: { w: number; h: number }; style?: Style }) {
  const by = doc.cover.preparedBy;
  const t = [by.title, by.credential].map((x) => stripMarkers(x).trim()).filter(Boolean).join(' · ');
  return (
    <View style={[{ position: 'absolute', left: 0, bottom: 0, width: size.w, height: 203.25, backgroundColor: K.ink950, paddingVertical: 36, paddingHorizontal: 48 }, style ?? {}]}>
      <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
        <Bars w={220} h={260} rects={BAND_BARS} />
      </View>
      <View style={{ width: 330 }}>
        <T style={[S.caption, { color: K.ink400 }]}>{plain(doc.closing.label)}</T>
        <T style={[S.closingTitle, { color: K.ink50, marginTop: 6 }]}>{plain(pretty(doc.closing.headline))}</T>
        <View style={{ marginTop: 16.5 }}>
          <T style={{ fontSize: 10.5, lineHeight: 1.6, fontWeight: 600, color: K.ink50 }}>{plain(stripMarkers(by.name))}</T>
          {t ? <T style={{ fontSize: 10.5, lineHeight: 1.6, color: K.ink300 }}>{plain(t)}</T> : null}
          {by.url ? <T style={{ fontSize: 10.5, lineHeight: 1.6, color: K.ink50 }}>{plain(stripMarkers(by.url))}</T> : null}
        </View>
      </View>
    </View>
  );
}

const box = (r: GRect): Style => ({ position: 'absolute', left: r.x, top: r.y, width: r.w });

function AcceptancePage({ doc, sizeKey }: { doc: ProposalDocV2; sizeKey: 'letter' | 'a4' }) {
  const g = acceptanceGeometry(sizeKey);
  const W = g.page.w - FRAME_V2.side * 2;
  const by = doc.cover.preparedBy;
  const card = (side: 'client' | 'owner') => {
    const col = g[side];
    const party = side === 'client' ? stripMarkers(doc.cover.clientCompany) || 'Client' : 'Appointmentlyy';
    const name = side === 'client' ? stripMarkers(doc.cover.preparedFor.name) : stripMarkers(by.name);
    const title = side === 'client' ? stripMarkers(doc.cover.preparedFor.title) : ownerShortTitle({ ...by, proofStats: [] });
    const line = (y: number): Style => ({ position: 'absolute', left: col.sigBox.x, top: y - 0.375, width: col.sigBox.w, borderTopWidth: 0.75, borderTopColor: K.ink400 });
    return (
      <>
        <View style={{ position: 'absolute', left: col.card.x, top: col.card.y, width: col.card.w, height: col.card.h, backgroundColor: K.surface, borderWidth: 0.75, borderColor: K.ink200, borderRadius: 9 }} />
        <T style={[S.caption, box(col.label), { color: K.ink500 }]}>{plain(party)}</T>
        <View style={line(col.sigLineY)} />
        <T style={[S.captionText, box(col.captionLeft), { color: K.ink600 }]}>Signature</T>
        <T style={[S.title, box(col.name), { color: K.ink900 }]}>{plain(name)}</T>
        <T style={[box(col.title), { fontSize: 9.75, lineHeight: 1.4, color: K.ink600 }]}>{plain(title)}</T>
        <View style={line(col.dateLineY)} />
        <T style={[S.captionText, box(col.dateCaption), { color: K.ink600 }]}>Date</T>
      </>
    );
  };
  return (
    <Page size={[g.page.w, g.page.h]} style={{ fontFamily: FONT_FAMILY, backgroundColor: K.canvas }} {...({ bookmark: { title: 'Acceptance', fit: true } } as Record<string, unknown>)}>
      <View style={{ position: 'absolute', top: FRAME_V2.headerTop, left: FRAME_V2.side, width: W, height: 21, borderBottomWidth: 0.75, borderBottomColor: K.ink200, flexDirection: 'row', justifyContent: 'space-between' }}>
        <T style={[S.caption, { fontWeight: 600, color: K.ink900 }]}>{plain(clientLabel(doc))}</T>
        <T style={[S.caption, { color: K.ink500 }]}>{plain(docLabelOf(doc))}</T>
      </View>
      <T style={[S.eyebrow, box(g.eyebrow), { color: K.crimson600 }]}>{plain(stripMarkers(doc.acceptance.eyebrow))}</T>
      <T style={[S.h2, box(g.title), { color: K.ink900 }]}>{plain(stripMarkers(doc.acceptance.title))}</T>
      <T style={[S.lead, box(g.lead), { color: K.ink900 }]}>{rx(pretty(plain(doc.acceptance.lead)))}</T>
      {card('client')}
      {card('owner')}
      <T style={[S.small, box(g.note), { lineHeight: 1.6, color: K.ink600 }]}>{ESIGN_NOTE}</T>
      <ClosingBand doc={doc} size={g.page} />
    </Page>
  );
}

// ------------------------------------------------------------------ document + passes

function ProposalPdf({ doc, layout, rec, spacer }: { doc: ProposalDocV2; layout: Layout; rec: Rec; spacer: boolean }) {
  const sizeKey = doc.settings.pageSize;
  const size = PAGE_SIZES[sizeKey];
  const W = size.w - FRAME_V2.side * 2;
  const ctx: Ctx = { W, layout, rec };
  const client = stripMarkers(doc.cover.clientCompany.trim()) || 'Client';
  const props: DocumentProps = {
    title: docTitleV2(doc),
    subject: `Appointmentlyy x ${client}`,
    author: 'Appointmentlyy',
    creator: 'Appointmentlyy Agreements',
    producer: 'Appointmentlyy Agreements',
    creationDate: docDate(doc.cover.date),
    modificationDate: docDate(doc.cover.date),
    language: 'en',
  };
  let prevKind: SectionV2['kind'] | null = null;
  return (
    <Document {...props}>
      <Cover doc={doc} size={size} />
      <Page size={[size.w, size.h]} style={{ fontFamily: FONT_FAMILY, backgroundColor: K.canvas, color: K.ink900, paddingTop: FRAME_V2.top, paddingBottom: FRAME_V2.bottom, paddingHorizontal: FRAME_V2.side }}>
        <RunningHeader doc={doc} W={W} layout={layout} />
        <Footer doc={doc} W={W} H={size.h} layout={layout} />
        {doc.sections.map((s, i) => {
          // Pricing and terms start a page (their pages are watched), and so does the section after them.
          const brk = i > 0 && (s.newPage || s.kind !== 'content' || prevKind === 'pricing' || prevKind === 'terms');
          prevKind = s.kind;
          return <SectionView key={s.id} s={s} i={i} ctx={ctx} doc={doc} breakBefore={brk} />;
        })}
        <Mark k="end:content" rec={rec} />
        {spacer ? (
          <View wrap={false} style={{ height: 720 - 570.75 }}>
            <Mark k="end:spacer" rec={rec} />
          </View>
        ) : null}
        {!doc.settings.signable && layout.band && !spacer ? <ClosingBand doc={doc} size={size} /> : null}
      </Page>
      {doc.settings.signable ? <AcceptancePage doc={doc} sizeKey={sizeKey} /> : null}
    </Document>
  );
}

const cutWords = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 8 ? cut.slice(0, sp) : cut).replace(/[\s,:;·]+$/, '');
};

/** Pass-1 marks -> what pass 2 draws (continued notes, header labels, first-element gaps, dropped dividers). */
function computeLayout(doc: ProposalDocV2, marks: Map<string, number>, spacer: boolean): Layout {
  const L: Layout = { cont: {}, head: {}, top: [], noDivider: [], band: false };
  const pg = (k: string) => marks.get(k);
  for (const s of doc.sections) {
    const a = pg(`s:${s.id}:a`);
    const z = pg(`s:${s.id}:z`);
    // A page-level header starting a page means that page has its own title: no "continued" label there.
    const ownHead = new Set<number>();
    const headerStart = pg(`b:${s.id}h:a`);
    if (headerStart) ownHead.add(headerStart);
    let prevEnd = pg(`b:${s.id}h:z`) ?? null;
    s.blocks.forEach((c, bi) => {
      const ca = pg(`b:${c.id}:a`);
      const cz = pg(`b:${c.id}:z`);
      if (c.type === 'section-header' && c.variant === 'page' && ca) ownHead.add(ca);
      if (ca && prevEnd && ca > prevEnd) {
        L.top.push(c.id);
        if (c.type === 'section-header' && c.variant === 'sub' && c.divider !== 'none') L.noDivider.push(c.id);
      }
      if (bi === 0 && !prevEnd && ca && a && ca > a) L.top.push(c.id);
      prevEnd = cz ?? prevEnd;
    });
    if (!a || !z || z <= a) continue;
    const name = stripMarkers(s.heading || s.eyebrow).trim();
    for (let p = a; p < z; p++) L.cont[p] = stripMarkers(s.continuedNote).trim() || 'Continued on the next page.';
    for (let p = a + 1; p <= z; p++) if (name && !ownHead.has(p)) L.head[p] = cutWords(`${name}, continued`, V2_LIMITS.docLabel);
  }
  if (spacer) L.band = Boolean(pg('end:content') && pg('end:content') === pg('end:spacer'));
  return L;
}

const sameLayout = (a: Layout, b: Layout) => JSON.stringify({ ...a, band: 0 }) === JSON.stringify({ ...b, band: 0 });

async function renderOnce(doc: ProposalDocV2, layout: Layout, spacer: boolean): Promise<{ bytes: Uint8Array; marks: Map<string, number> }> {
  const marks = new Map<string, number>();
  const rec: Rec = (k) => ({ pageNumber }) => {
    marks.set(k, pageNumber);
    return '';
  };
  registerAgreementFonts();
  const buf = await renderToBuffer(<ProposalPdf doc={doc} layout={layout} rec={rec} spacer={spacer} />);
  return { bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), marks };
}

/** Render a v2 document (two passes; a third only if the second moved anything). Deterministic. */
export async function renderProposalV2(doc: ProposalDocV2): Promise<Uint8Array> {
  await loadMetrics();
  const viewOnly = !doc.settings.signable;
  let layout = EMPTY_LAYOUT;
  let out = await renderOnce(doc, layout, viewOnly);
  for (let pass = 0; pass < 2; pass++) {
    const next = computeLayout(doc, out.marks, viewOnly);
    if (sameLayout(next, layout)) {
      layout = { ...layout, band: next.band };
      break;
    }
    layout = next;
    out = await renderOnce(doc, layout, viewOnly);
  }
  if (viewOnly) {
    const fin = computeLayout(doc, out.marks, true);
    out = await renderOnce(doc, { ...layout, band: fin.band }, false);
  }
  return out.bytes;
}

// ------------------------------------------------------------------ template definition

type V2Template = AgreementTemplateDef & {
  cleanValues: (raw: Record<string, unknown>) => Record<string, string>;
  valueProblems: (values: Record<string, string>) => string | null;
  watchLabels: (values: Record<string, string>) => (string | null)[];
  /** The frozen signing setup depends on the document: signable (default) or view-only. */
  actionFor: (values: Record<string, string>) => { action: 'sign' | 'view'; countersign: boolean };
};

export const customProposalV2: V2Template = {
  id: CUSTOM_PROPOSAL_V2_ID,
  name: 'Custom proposal',
  description: 'Your proposal in the Appointmentlyy design: from your PDF or the standard outline, edited component by component. The client signs, then you countersign.',
  action: 'sign',
  countersign: true,
  fields: FIELDS,
  signerForm: [],
  title(values) {
    return docTitleV2(docOfValuesV2(values));
  },
  cleanValues(raw) {
    const v = raw[DOC_KEY];
    const src = typeof v === 'string' && v.length <= V2_LIMITS.docChars ? v : v && typeof v === 'object' ? v : '';
    const { doc } = normalizeDocV2(src || null);
    return { [DOC_KEY]: serializeDocV2(doc), [CLIENT_KEY]: doc.cover.clientCompany };
  },
  valueProblems(values) {
    if (!values[DOC_KEY]) return 'Build the proposal in the editor first.';
    return docProblemV2(docOfValuesV2(values));
  },
  watchLabels(values) {
    return watchLabelsV2(docOfValuesV2(values));
  },
  actionFor(values) {
    const signable = docOfValuesV2(values).settings.signable;
    return signable ? { action: 'sign', countersign: true } : { action: 'view', countersign: false };
  },
  render(values) {
    return renderProposalV2(docOfValuesV2(values));
  },
};

registerTemplate(customProposalV2);
