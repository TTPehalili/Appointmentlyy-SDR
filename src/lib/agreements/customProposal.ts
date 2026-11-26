/**
 * Custom proposals (template `custom-proposal-v1`): the structured document the owner builds in the
 * section editor, from an uploaded PDF (AI-structured) or from a blank page. Browser + server safe
 * (no Node imports): the editor, the import route and the PDF template all use these helpers.
 *
 * The whole document is stored as JSON in ONE envelope field value (`doc`), so the existing envelope,
 * store, preview and send flow carries it unchanged (no database migration). `normalizeDoc` rebuilds
 * any input (the editor's, the AI's, a stored draft) field by field: unknown keys are dropped, types
 * are checked, text is cleaned and every list is capped. Text is always plain: nothing in it is ever
 * turned into a link, markup or script by the renderer.
 *
 * Items the AI was unsure of (or that do not match the uploaded PDF) carry a `check` note. The owner
 * sees them in the editor and clears them; a proposal with open checks cannot be sent.
 */

export const CUSTOM_PROPOSAL_ID = 'custom-proposal-v1';
/** The envelope field that holds the document JSON. */
export const DOC_KEY = 'doc';
/** Derived from the cover (kept so the platform's usual client-name lookups find it). */
export const CLIENT_KEY = 'clientCompany';

export const PROPOSAL_LIMITS = {
  /** Upload: size and pages read. */
  uploadBytes: 10 * 1024 * 1024,
  uploadPages: 30,
  /** Characters of extracted text sent to the AI (all pages). */
  aiChars: 120_000,
  /** Serialized document. */
  docChars: 400_000,
  sections: 60,
  blocks: 80,
  items: 100,
  tableCols: 8,
  tableRows: 100,
  priceRows: 60,
  heading: 200,
  text: 6000,
  cell: 600,
  short: 200,
  check: 300,
} as const;

export type SectionKind = 'content' | 'pricing' | 'terms';
export type BlockType = 'paragraph' | 'bullets' | 'numbered' | 'table' | 'callout';

export interface Block {
  id: string;
  type: BlockType;
  /** paragraph, callout */
  text: string;
  /** bullets, numbered */
  items: string[];
  /** table: header row and body rows (every row has header.length cells) */
  header: string[];
  rows: string[][];
  check?: string;
}

export interface PriceRow {
  id: string;
  item: string;
  description: string;
  /** As typed: "1", "12", "" (= 1). */
  qty: string;
  /** As typed: "7,500", "1500.50", or words such as "Included". */
  unitPrice: string;
  /** 3-letter code; blank = the section's currency. */
  currency: string;
  check?: string;
}

export interface Section {
  id: string;
  kind: SectionKind;
  heading: string;
  blocks: Block[];
  /** pricing only */
  currency: string;
  rows: PriceRow[];
  showTotal: boolean;
  check?: string;
}

export interface Cover {
  title: string;
  subtitle: string;
  clientCompany: string;
  contactName: string;
  contactTitle: string;
  /** YYYY-MM-DD or free text as written in the source. */
  date: string;
  preparedBy: string;
}

export type CoverKey = keyof Cover;
export const COVER_KEYS: CoverKey[] = ['title', 'subtitle', 'clientCompany', 'contactName', 'contactTitle', 'date', 'preparedBy'];

export interface ProposalDoc {
  v: 1;
  cover: Cover;
  /** Per cover field: a note when the value needs checking. */
  coverChecks: Partial<Record<CoverKey, string>>;
  sections: Section[];
  /** Where the document came from (shown to the owner only). */
  origin: { kind: 'blank' | 'pdf' | 'text'; fileName: string; pages: number };
}

// ------------------------------------------------------------------ text cleaning

/** Plain, single-line text: control characters and our PDF inline-marker characters removed. */
export function cleanLine(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/[⟦⟧]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Plain multi-line text (newlines kept, at most one blank line in a row). */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/[⟦⟧]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const CURRENCY_RE = /^[A-Z]{3}$/;
export const cleanCurrency = (v: unknown, fallback = ''): string => {
  const s = cleanLine(v, 8).toUpperCase().replace(/[^A-Z]/g, '');
  return CURRENCY_RE.test(s) ? s : fallback;
};

// ------------------------------------------------------------------ ids

let seq = 0;
/** A short id for a new block / row / section (React keys and reordering; never security-relevant). */
export function newPartId(prefix: string): string {
  seq = (seq + 1) % 1_000_000;
  const rnd = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 10);
  return `${prefix}${rnd}${seq.toString(36)}`;
}
const ID_RE = /^[a-z][a-z0-9]{1,40}$/;

// ------------------------------------------------------------------ constructors

export function emptyBlock(type: BlockType, id = newPartId('b')): Block {
  return { id, type, text: '', items: type === 'bullets' || type === 'numbered' ? [''] : [], header: type === 'table' ? ['Column 1', 'Column 2'] : [], rows: type === 'table' ? [['', '']] : [] };
}

export function emptyRow(currency = '', id = newPartId('r')): PriceRow {
  return { id, item: '', description: '', qty: '1', unitPrice: '', currency };
}

export function emptySection(kind: SectionKind, id = newPartId('s')): Section {
  return {
    id,
    kind,
    heading: kind === 'pricing' ? 'Investment' : kind === 'terms' ? 'Terms' : '',
    blocks: kind === 'pricing' ? [] : [emptyBlock('paragraph')],
    currency: kind === 'pricing' ? 'USD' : '',
    rows: kind === 'pricing' ? [emptyRow()] : [],
    showTotal: kind === 'pricing',
  };
}

export function emptyCover(): Cover {
  return { title: 'Proposal', subtitle: '', clientCompany: '', contactName: '', contactTitle: '', date: '', preparedBy: 'Emil Halili, Founder, Appointmentlyy' };
}

export function emptyDoc(): ProposalDoc {
  return { v: 1, cover: emptyCover(), coverChecks: {}, sections: [emptySection('content')], origin: { kind: 'blank', fileName: '', pages: 0 } };
}

// ------------------------------------------------------------------ strict rebuild

function cleanCheck(v: unknown): string | undefined {
  const s = cleanLine(v, PROPOSAL_LIMITS.check);
  return s || undefined;
}

function normalizeBlock(raw: unknown, id: string): Block | null {
  if (!isObj(raw)) return null;
  const type = raw.type;
  if (type !== 'paragraph' && type !== 'bullets' && type !== 'numbered' && type !== 'table' && type !== 'callout') return null;
  const b: Block = { id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : id, type, text: '', items: [], header: [], rows: [] };
  if (type === 'paragraph' || type === 'callout') {
    b.text = cleanText(raw.text, PROPOSAL_LIMITS.text);
  } else if (type === 'bullets' || type === 'numbered') {
    b.items = arr(raw.items).slice(0, PROPOSAL_LIMITS.items).map((x) => cleanText(x, PROPOSAL_LIMITS.text));
    if (!b.items.length) b.items = [''];
  } else {
    const header = arr(raw.header).slice(0, PROPOSAL_LIMITS.tableCols).map((x) => cleanLine(x, PROPOSAL_LIMITS.cell));
    const rows = arr(raw.rows).slice(0, PROPOSAL_LIMITS.tableRows).map((r) => arr(r).slice(0, PROPOSAL_LIMITS.tableCols).map((x) => cleanText(x, PROPOSAL_LIMITS.cell)));
    const cols = Math.max(1, Math.min(PROPOSAL_LIMITS.tableCols, header.length || Math.max(0, ...rows.map((r) => r.length))));
    b.header = Array.from({ length: cols }, (_, i) => header[i] ?? '');
    b.rows = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
    if (!b.rows.length) b.rows = [Array.from({ length: cols }, () => '')];
  }
  const check = cleanCheck(raw.check);
  if (check) b.check = check;
  return b;
}

function normalizeRow(raw: unknown, id: string): PriceRow | null {
  if (!isObj(raw)) return null;
  const r: PriceRow = {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : id,
    item: cleanLine(raw.item, PROPOSAL_LIMITS.short),
    description: cleanText(raw.description, PROPOSAL_LIMITS.cell),
    qty: cleanLine(raw.qty, 20),
    unitPrice: cleanLine(raw.unitPrice, 40),
    currency: cleanCurrency(raw.currency),
  };
  const check = cleanCheck(raw.check);
  if (check) r.check = check;
  return r;
}

/**
 * Rebuild a document from anything (editor state, stored JSON, AI output). Returns the document and
 * a list of problems (empty when the input was already well formed). Never throws.
 */
export function normalizeDoc(raw: unknown): { doc: ProposalDoc; problems: string[] } {
  const problems: string[] = [];
  if (typeof raw === 'string') {
    try {
      raw = raw.length > PROPOSAL_LIMITS.docChars ? null : JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!isObj(raw)) return { doc: emptyDoc(), problems: ['not a document'] };
  const rc = isObj(raw.cover) ? raw.cover : {};
  if (!isObj(raw.cover)) problems.push('cover missing');
  const cover: Cover = {
    title: cleanLine(rc.title, PROPOSAL_LIMITS.heading),
    subtitle: cleanText(rc.subtitle, 600),
    clientCompany: cleanLine(rc.clientCompany, PROPOSAL_LIMITS.short),
    contactName: cleanLine(rc.contactName, PROPOSAL_LIMITS.short),
    contactTitle: cleanLine(rc.contactTitle, PROPOSAL_LIMITS.short),
    date: cleanLine(rc.date, 60),
    preparedBy: cleanLine(rc.preparedBy, PROPOSAL_LIMITS.short),
  };
  const coverChecks: Partial<Record<CoverKey, string>> = {};
  const rcc = isObj(raw.coverChecks) ? raw.coverChecks : {};
  for (const k of COVER_KEYS) {
    const c = cleanCheck(rcc[k]);
    if (c) coverChecks[k] = c;
  }
  if (!Array.isArray(raw.sections)) problems.push('sections must be a list');
  let n = 0;
  const sections: Section[] = [];
  let pricingSeen = false;
  let termsSeen = false;
  for (const rs of arr(raw.sections).slice(0, PROPOSAL_LIMITS.sections)) {
    n++;
    if (!isObj(rs)) {
      problems.push(`section ${n} is not an object`);
      continue;
    }
    let kind: SectionKind = rs.kind === 'pricing' ? 'pricing' : rs.kind === 'terms' ? 'terms' : 'content';
    // One pricing and one terms section: any extra one is kept as ordinary content (nothing is lost).
    if (kind === 'pricing' && pricingSeen) kind = 'content';
    if (kind === 'terms' && termsSeen) kind = 'content';
    if (kind === 'pricing') pricingSeen = true;
    if (kind === 'terms') termsSeen = true;
    const blocks = arr(rs.blocks)
      .slice(0, PROPOSAL_LIMITS.blocks)
      .map((b, i) => normalizeBlock(b, `b${n}x${i + 1}`))
      .filter((b): b is Block => {
        if (!b) problems.push(`section ${n} has a block of an unknown type`);
        return Boolean(b);
      });
    const s: Section = {
      id: typeof rs.id === 'string' && ID_RE.test(rs.id) ? rs.id : `s${n}`,
      kind,
      heading: cleanLine(rs.heading, PROPOSAL_LIMITS.heading),
      blocks,
      currency: kind === 'pricing' ? cleanCurrency(rs.currency, 'USD') : '',
      rows:
        kind === 'pricing'
          ? arr(rs.rows)
              .slice(0, PROPOSAL_LIMITS.priceRows)
              .map((r, i) => normalizeRow(r, `r${n}x${i + 1}`))
              .filter((r): r is PriceRow => Boolean(r))
          : [],
      showTotal: kind === 'pricing' ? rs.showTotal !== false : false,
    };
    const check = cleanCheck(rs.check);
    if (check) s.check = check;
    sections.push(s);
  }
  const ro = isObj(raw.origin) ? raw.origin : {};
  const origin: ProposalDoc['origin'] = {
    kind: ro.kind === 'pdf' ? 'pdf' : ro.kind === 'text' ? 'text' : 'blank',
    fileName: cleanLine(ro.fileName, 180),
    pages: typeof ro.pages === 'number' && Number.isInteger(ro.pages) && ro.pages >= 0 && ro.pages <= 1000 ? ro.pages : 0,
  };
  // Ids must be unique (the editor keys on them): a duplicate gets a fresh deterministic one.
  const used = new Set<string>();
  const uniq = (id: string, alt: string) => {
    let out = used.has(id) ? alt : id;
    let k = 1;
    while (used.has(out)) out = `${alt}d${k++}`;
    used.add(out);
    return out;
  };
  sections.forEach((s, si) => {
    s.id = uniq(s.id, `s${si + 1}`);
    s.blocks.forEach((b, bi) => (b.id = uniq(b.id, `b${si + 1}x${bi + 1}`)));
    s.rows.forEach((r, ri) => (r.id = uniq(r.id, `r${si + 1}x${ri + 1}`)));
  });
  return { doc: { v: 1, cover, coverChecks, sections, origin }, problems };
}

export function serializeDoc(doc: ProposalDoc): string {
  return JSON.stringify(doc);
}

/** The document from an envelope's field values (an empty one if missing or unreadable). */
export function docOfValues(values: Record<string, string> | undefined): ProposalDoc {
  const raw = values?.[DOC_KEY];
  return raw ? normalizeDoc(raw).doc : emptyDoc();
}

// ------------------------------------------------------------------ money

/** "7,500" / "$7,500.00" / "USD 1500" -> number; words ("Included", "TBD") -> null. */
export function parseAmount(raw: string): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const cleaned = s.replace(/^[A-Za-z]{3}\s*/, '').replace(/[$€£₱¥,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Blank qty counts as 1. */
export function parseQty(raw: string): number | null {
  const s = (raw ?? '').trim();
  if (!s) return 1;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function rowTotal(r: PriceRow): number | null {
  const q = parseQty(r.qty);
  const u = parseAmount(r.unitPrice);
  return q === null || u === null ? null : Math.round(q * u * 100) / 100;
}

/** Totals per currency (rows without a numeric price are left out and counted). */
export function pricingTotals(s: Section): { totals: { currency: string; amount: number }[]; unpriced: number } {
  const by = new Map<string, number>();
  let unpriced = 0;
  for (const r of s.rows) {
    const t = rowTotal(r);
    if (t === null) {
      if (r.item.trim() || r.unitPrice.trim()) unpriced++;
      continue;
    }
    const cur = r.currency || s.currency || 'USD';
    by.set(cur, Math.round(((by.get(cur) ?? 0) + t) * 100) / 100);
  }
  return { totals: [...by.entries()].map(([currency, amount]) => ({ currency, amount })), unpriced };
}

function group3(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** 7500 -> "7,500.00" (always cents, hand-rolled so the server locale cannot change it). */
export function money2(n: number): string {
  const neg = n < 0;
  const [i, d] = Math.abs(Math.round(n * 100) / 100).toFixed(2).split('.');
  return `${neg ? '-' : ''}${group3(i)}.${d}`;
}

// ------------------------------------------------------------------ checks

export interface OpenCheck {
  where: string;
  note: string;
}

/** Every open "check this" note, in reading order, with where it is. */
export function openChecks(doc: ProposalDoc): OpenCheck[] {
  const out: OpenCheck[] = [];
  const label: Record<CoverKey, string> = { title: 'Title', subtitle: 'Subtitle', clientCompany: 'Client company', contactName: 'Contact', contactTitle: 'Contact title', date: 'Date', preparedBy: 'Prepared by' };
  for (const k of COVER_KEYS) if (doc.coverChecks[k]) out.push({ where: `Cover: ${label[k]}`, note: doc.coverChecks[k]! });
  doc.sections.forEach((s, i) => {
    const name = `${i + 1}. ${s.heading || (s.kind === 'pricing' ? 'Pricing' : s.kind === 'terms' ? 'Terms' : 'Untitled section')}`;
    if (s.check) out.push({ where: name, note: s.check });
    s.blocks.forEach((b) => b.check && out.push({ where: name, note: b.check }));
    s.rows.forEach((r) => r.check && out.push({ where: `${name}: ${r.item || 'price row'}`, note: r.check }));
  });
  return out;
}

/** Why this document cannot be sent yet, or null. */
export function docProblem(doc: ProposalDoc): string | null {
  if (!doc.cover.title.trim()) return 'Give the proposal a title (Cover).';
  if (!doc.cover.clientCompany.trim()) return 'Enter the client company (Cover).';
  if (!doc.sections.length) return 'Add at least one section.';
  const checks = openChecks(doc).length;
  if (checks) return `${checks} ${checks === 1 ? 'item is' : 'items are'} marked “Check”. Review ${checks === 1 ? 'it' : 'them'} in the editor and mark ${checks === 1 ? 'it' : 'them'} as checked before sending.`;
  const pricing = doc.sections.find((s) => s.kind === 'pricing');
  if (pricing) {
    for (const r of pricing.rows) {
      if (!r.item.trim() && !r.unitPrice.trim() && !r.description.trim()) continue;
      if (parseQty(r.qty) === null) return `Pricing: the quantity “${r.qty}” is not a number.`;
    }
  }
  return null;
}

/** "Proposal: Appointmentlyy x Acme" style title. */
export function docTitle(doc: ProposalDoc): string {
  const t = doc.cover.title.trim() || 'Proposal';
  const c = doc.cover.clientCompany.trim();
  return c && !t.toLowerCase().includes(c.toLowerCase()) ? `${t}: Appointmentlyy x ${c}` : t;
}

/** Pages to flag when the client reads them again: one label per section, in order (null = not watched). */
export function watchLabels(doc: ProposalDoc): (string | null)[] {
  return doc.sections.map((s) => (s.kind === 'pricing' ? 'pricing' : s.kind === 'terms' ? 'terms' : null));
}
