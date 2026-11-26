/**
 * Template `custom-proposal-v1`: a branded Appointmentlyy proposal drawn from a structured document
 * (see lib/agreements/customProposal.ts) that the owner builds in the section editor, from an
 * uploaded PDF or from a blank page. action 'view': no signature and no countersign; the platform
 * tracks views, time, pages and re-reads of the pricing and terms pages.
 *
 * Layout: a cover page, then the sections in order. Ordinary sections flow one after another
 * (headings are kept with the text that follows; table rows, list items and callouts never split);
 * the pricing and terms sections each start on a new page, and so does the section after them, so
 * their pages are exactly theirs. Every section is a PDF bookmark (the platform reads the bookmarks to
 * find which pages hold pricing and terms; readers get a navigable outline).
 *
 * All text is plain: nothing is turned into a link (the renderer never creates one), and our inline
 * markers are stripped from values, except **bold**, which the owner may type.
 */
import { Page, View } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { formatDate, valueOrMark } from './pdf/format';
import { AgreementDocument, C, ContentPage, HAIR, H2, Kicker, Lockup, Rich, T, breakable, docDate, em, pageBase, renderPdf, rich, sty, type Style } from './pdf/kit';
import {
  CLIENT_KEY,
  CUSTOM_PROPOSAL_ID,
  DOC_KEY,
  PROPOSAL_LIMITS,
  docOfValues,
  docProblem,
  docTitle,
  money2,
  normalizeDoc,
  parseAmount,
  parseQty,
  pricingTotals,
  rowTotal,
  serializeDoc,
  watchLabels,
  type Block,
  type ProposalDoc,
  type Section,
} from '../customProposal';

const FIELDS: TemplateField[] = [
  {
    group: 'Proposal',
    key: DOC_KEY,
    label: 'Proposal document',
    type: 'textarea',
    required: true,
    default: '',
    help: 'Built in the section editor (cover, sections, pricing, terms). Stored as structured data.',
  },
  { group: 'Proposal', key: CLIENT_KEY, label: 'Client company', type: 'text', required: false, default: '', help: 'Filled from the cover.' },
];

/**
 * Plain text for the PDF: our bold marker is allowed; anything that looks like a mark is not. Only very long
 * unbroken tokens (URLs, IDs) get soft break points, so ordinary text copies and searches exactly as written.
 */
const plain = (s: string) => s.replace(/[⟦⟧]/g, '').replace(/\S{32,}/g, (w) => breakable(w));

function Para({ text, style }: { text: string; style?: Style }) {
  return <Rich text={plain(text)} style={[sty.p, style ?? {}]} />;
}

function Items({ items, numbered, size }: { items: string[]; numbered: boolean; size: number }) {
  const list = items.filter((x) => x.trim());
  return (
    <View style={{ marginBottom: 12 }}>
      {list.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }} wrap={false}>
          {numbered ? (
            <T style={{ width: 18, fontSize: size, fontWeight: 600, color: C.red, lineHeight: 1.55 }}>{`${i + 1}.`}</T>
          ) : (
            <View style={{ width: 5, height: 0.75, backgroundColor: C.red, marginTop: size * 0.75, marginRight: 8 }} />
          )}
          <T style={{ flex: 1, color: C.ink2, fontSize: size, lineHeight: 1.55 }}>{rich(plain(it))}</T>
        </View>
      ))}
    </View>
  );
}

function Table({ b, size }: { b: Block; size: number }) {
  const cols = b.header.length || 1;
  const cell = (i: number): Style => ({ flex: 1, paddingRight: i === cols - 1 ? 0 : 8 });
  const rows = b.rows.filter((r) => r.some((c) => c.trim()));
  return (
    <View style={{ marginTop: 4, marginBottom: 14 }}>
      {/* The header stays with at least the first rows. */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 5 }} minPresenceAhead={40} wrap={false}>
        {b.header.map((h, i) => (
          <View key={i} style={cell(i)}>
            <T style={sty.label}>{plain(h)}</T>
          </View>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} wrap={false} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
          {r.map((c, i) => (
            <View key={i} style={cell(i)}>
              <T style={{ fontSize: size - 0.5, lineHeight: 1.45, color: i === 0 ? C.ink : C.ink2, fontWeight: i === 0 ? 600 : 400 }}>{rich(plain(c))}</T>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BlockView({ b, size }: { b: Block; size: number }) {
  switch (b.type) {
    case 'paragraph':
      return b.text.trim() ? <Para text={b.text} style={{ fontSize: size, lineHeight: 1.6 }} /> : null;
    case 'callout':
      return b.text.trim() ? (
        <View wrap={false} style={{ borderLeftWidth: 3, borderLeftColor: C.red, paddingLeft: 14, paddingVertical: 2, marginVertical: 14 }}>
          <T style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 500, letterSpacing: em(-0.01, 13), color: C.ink }}>{rich(plain(b.text))}</T>
        </View>
      ) : null;
    case 'bullets':
    case 'numbered':
      return <Items items={b.items} numbered={b.type === 'numbered'} size={size} />;
    case 'table':
      return <Table b={b} size={size} />;
  }
}

/** react-pdf supports `bookmark` on any node (PDF outline entry); its View typings only list it on Page. */
const bookmark = (title: string) => ({ bookmark: { title: title.slice(0, 120), fit: true } }) as Record<string, unknown>;

const sectionTitle = (s: Section, i: number) => s.heading.trim() || (s.kind === 'pricing' ? 'Pricing' : s.kind === 'terms' ? 'Terms' : `Section ${i + 1}`);

function SectionHead({ s, i }: { s: Section; i: number }) {
  // Kicker and heading never end a page: at least 90pt of what follows must fit after them.
  return (
    <View minPresenceAhead={90} wrap={false}>
      <Kicker n={String(i + 1).padStart(2, '0')} />
      <H2>{rich(plain(sectionTitle(s, i)))}</H2>
    </View>
  );
}

function Pricing({ s }: { s: Section }) {
  const rows = s.rows.filter((r) => r.item.trim() || r.description.trim() || r.unitPrice.trim());
  const multi = new Set(rows.map((r) => r.currency || s.currency || 'USD')).size > 1;
  const cur = s.currency || 'USD';
  const { totals, unpriced } = pricingTotals(s);
  const w = { qty: 40, unit: 82, total: 96 };
  const num: Style = { textAlign: 'right' };
  const amountText = (raw: string, rowCur: string) => {
    const n = parseAmount(raw);
    if (n === null) return raw.trim() || '-';
    return multi ? `${rowCur} ${money2(n)}` : money2(n);
  };
  return (
    <View style={{ marginTop: 4, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 5 }} minPresenceAhead={40} wrap={false}>
        <T style={[sty.label, { flex: 1, paddingRight: 8 }]}>Item</T>
        <T style={[sty.label, { width: w.qty }, num]}>Qty</T>
        <T style={[sty.label, { width: w.unit }, num]}>{multi ? 'Unit price' : `Unit price (${cur})`}</T>
        <T style={[sty.label, { width: w.total }, num]}>{multi ? 'Total' : `Total (${cur})`}</T>
      </View>
      {rows.map((r) => {
        const rc = r.currency || cur;
        const t = rowTotal(r);
        const q = parseQty(r.qty);
        return (
          <View key={r.id} wrap={false} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <T style={{ fontSize: 10, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>{rich(plain(r.item || '-'))}</T>
              {r.description.trim() ? <T style={{ fontSize: 9, lineHeight: 1.45, color: C.ink2, marginTop: 1 }}>{rich(plain(r.description))}</T> : null}
            </View>
            <T style={[{ width: w.qty, fontSize: 10, lineHeight: 1.45, color: C.ink2 }, num]}>{q === null ? r.qty : r.qty.trim() || '1'}</T>
            <T style={[{ width: w.unit, fontSize: 10, lineHeight: 1.45, color: C.ink2 }, num]}>{amountText(r.unitPrice, rc)}</T>
            <T style={[{ width: w.total, fontSize: 10, lineHeight: 1.45, color: C.ink, fontWeight: 600 }, num]}>
              {t === null ? (parseAmount(r.unitPrice) === null && r.unitPrice.trim() ? r.unitPrice : '-') : multi ? `${rc} ${money2(t)}` : money2(t)}
            </T>
          </View>
        );
      })}
      {s.showTotal && totals.length > 0 ? (
        <View wrap={false} style={{ marginTop: 8, alignItems: 'flex-end' }}>
          {totals.map((x) => (
            <View key={x.currency} style={{ flexDirection: 'row', backgroundColor: C.redTint, borderTopWidth: 2, borderTopColor: C.red, paddingVertical: 7, paddingLeft: 10, marginTop: 4 }}>
              <T style={[{ width: 150, fontSize: 11, fontWeight: 700 }, num]}>{totals.length > 1 ? `Total (${x.currency})` : 'Total'}</T>
              <T style={[{ width: w.total + 20, fontSize: 11, fontWeight: 700, color: C.red }, num]}>{`${x.currency} ${money2(x.amount)}`}</T>
            </View>
          ))}
          {unpriced > 0 ? <T style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>{`Excludes ${unpriced} ${unpriced === 1 ? 'item' : 'items'} without a numeric price.`}</T> : null}
        </View>
      ) : null}
    </View>
  );
}

function SectionBody({ s, i }: { s: Section; i: number }) {
  const size = s.kind === 'terms' ? 9.75 : 10.5;
  return (
    <View {...bookmark(sectionTitle(s, i))} style={{ marginBottom: 28 }}>
      <SectionHead s={s} i={i} />
      {s.kind === 'pricing' ? (
        <>
          {/* Intro text first, then the price table. */}
          {s.blocks.map((b) => (
            <BlockView key={b.id} b={b} size={size} />
          ))}
          <Pricing s={s} />
        </>
      ) : (
        s.blocks.map((b) => <BlockView key={b.id} b={b} size={size} />)
      )}
    </View>
  );
}

function Cover({ doc }: { doc: ProposalDoc }) {
  const c = doc.cover;
  const metaVal: Style = { fontSize: 10.5, lineHeight: 1.55, color: C.ink };
  const sub: Style = { color: C.ink2 };
  const titleSize = c.title.length > 60 ? 34 : c.title.length > 32 ? 42 : 52;
  const [byName, ...byRest] = (c.preparedBy || 'Appointmentlyy').split(/,\s*/);
  return (
    <Page size="A4" style={pageBase} bookmark={{ title: 'Cover', fit: true }}>
      <View style={{ position: 'absolute', top: 72, left: 64 }}>
        <Lockup h={44} />
      </View>
      <View style={{ position: 'absolute', left: 64, right: 64, top: 280 }}>
        <T style={{ fontSize: titleSize, lineHeight: 1.06, fontWeight: 800, letterSpacing: em(-0.04, titleSize) }}>{rich(valueOrMark(plain(c.title), 'proposal title'))}</T>
        {c.subtitle.trim() ? (
          <T style={{ fontSize: 15, lineHeight: 1.45, color: C.ink2, marginTop: 22, maxWidth: 380, letterSpacing: em(-0.01, 15) }}>{rich(plain(c.subtitle))}</T>
        ) : null}
        <View style={{ width: 64, height: 3, backgroundColor: C.red, marginTop: 30 }} />
      </View>
      <View style={{ position: 'absolute', left: 64, right: 64, bottom: 72, flexDirection: 'row', borderTopWidth: HAIR, borderTopColor: C.rule2, paddingTop: 16 }}>
        <View style={{ flex: 1.2, paddingRight: 24 }}>
          <T style={[sty.label, { marginBottom: 4 }]}>Prepared for</T>
          <T style={metaVal}>
            {rich(c.contactName.trim() ? plain(c.contactName) : valueOrMark(plain(c.clientCompany), 'client company'))}
            {c.contactTitle.trim() ? <T style={sub}>{`\n${plain(c.contactTitle)}`}</T> : null}
            {c.contactName.trim() ? <T style={sub}>{rich(`\n${valueOrMark(plain(c.clientCompany), 'client company')}`)}</T> : null}
          </T>
        </View>
        <View style={{ flex: 1.1, paddingRight: 24 }}>
          <T style={[sty.label, { marginBottom: 4 }]}>Prepared by</T>
          <T style={metaVal}>
            {plain(byName)}
            {byRest.length ? <T style={sub}>{`\n${plain(byRest.join(', '))}`}</T> : null}
          </T>
        </View>
        <View style={{ flex: 0.9, paddingTop: 7 * 1.6 + 4 }}>
          <T style={[metaVal, { textAlign: 'right' }]}>{c.date.trim() ? plain(formatDate(c.date)) : ''}</T>
        </View>
      </View>
    </Page>
  );
}

/** Consecutive ordinary sections share one flowing page run; pricing and terms each get their own. */
function pageGroups(doc: ProposalDoc): { kind: Section['kind']; items: { s: Section; i: number }[] }[] {
  const out: { kind: Section['kind']; items: { s: Section; i: number }[] }[] = [];
  doc.sections.forEach((s, i) => {
    const last = out[out.length - 1];
    if (s.kind === 'content' && last && last.kind === 'content') last.items.push({ s, i });
    else out.push({ kind: s.kind, items: [{ s, i }] });
  });
  return out;
}

function ProposalPdf({ doc }: { doc: ProposalDoc }) {
  const client = doc.cover.clientCompany.trim() || 'Client';
  const head = (doc.cover.title.trim() || 'Proposal').slice(0, 70);
  const groups = pageGroups(doc);
  return (
    <AgreementDocument title={docTitle(doc)} subject={`Appointmentlyy x ${client}`} date={docDate(doc.cover.date)}>
      <Cover doc={doc} />
      {groups.map((g, gi) => (
        <ContentPage key={gi} head={head} sub={g.kind === 'content' ? (doc.cover.clientCompany.trim() ? `For ${client}`.slice(0, 50) : 'Proposal') : sectionTitle(g.items[0].s, g.items[0].i).slice(0, 40)} client={client}>
          {g.items.map(({ s, i }) => (
            <SectionBody key={s.id} s={s} i={i} />
          ))}
        </ContentPage>
      ))}
      {groups.length === 0 ? (
        <ContentPage head={head} sub="Proposal" client={client}>
          <T style={{ color: C.muted }}>{rich('⟦MARK:[add a section]⟧')}</T>
        </ContentPage>
      ) : null}
    </AgreementDocument>
  );
}

type CustomTemplate = AgreementTemplateDef & {
  /** Rebuild the values from the owner's input: the document is validated and re-serialized. */
  cleanValues: (raw: Record<string, unknown>) => Record<string, string>;
  /** Why it cannot be sent (checked by the platform at send), or null. */
  valueProblems: (values: Record<string, string>) => string | null;
  /** One label per PDF bookmark after the cover, in order: 'pricing' / 'terms' / null. */
  watchLabels: (values: Record<string, string>) => (string | null)[];
};

export const customProposalV1: CustomTemplate = {
  id: CUSTOM_PROPOSAL_ID,
  name: 'Custom proposal',
  description: 'Your own proposal, from your PDF or a blank page, in Appointmentlyy branding. Edited section by section.',
  action: 'view',
  countersign: false,
  fields: FIELDS,
  signerForm: [],
  title(values) {
    return docTitle(docOfValues(values));
  },
  cleanValues(raw) {
    const v = raw[DOC_KEY];
    const src = typeof v === 'string' && v.length <= PROPOSAL_LIMITS.docChars ? v : v && typeof v === 'object' ? v : '';
    const { doc } = normalizeDoc(src || null);
    return { [DOC_KEY]: serializeDoc(doc), [CLIENT_KEY]: doc.cover.clientCompany };
  },
  valueProblems(values) {
    if (!values[DOC_KEY]) return 'Build the proposal in the editor first.';
    return docProblem(docOfValues(values));
  },
  watchLabels(values) {
    return watchLabels(docOfValues(values));
  },
  render(values) {
    const doc = docOfValues(values);
    return renderPdf(<ProposalPdf doc={doc} />);
  },
};

registerTemplate(customProposalV1);
