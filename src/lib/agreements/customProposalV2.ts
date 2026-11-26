/**
 * Custom proposals v2 (template `custom-proposal-v2`): the CREDaily-reference design system. Browser + server
 * safe (no Node imports): the editor, the import route, the PDF template and the platform share these helpers.
 *
 * The whole document is stored as JSON in ONE envelope field value (`doc`, as v1), so the envelope, store,
 * preview, send and sign flow carry it unchanged (no database migration). A v2 document is a cover, sections
 * made of components (the 14 flow components of design/proposal-v2/DESIGN_SPEC.md §3), the Acceptance page
 * (C15, fixed: not a block) and the closing band.
 *
 * Character limits are HARD: the lower of the design spec and the copy system (COPY_SYSTEM.md) wins. They are
 * counted on the visible text (the inline markers **bold** and *italic* do not count). `normalizeDocV2`
 * rebuilds any input field by field: unknown keys dropped, enums checked, text cleaned, and anything over a
 * limit is cut and gets a "Check" note. Text is plain: the renderer never turns it into a link.
 *
 * Checks: stored notes (per component, cover field, price row) are cleared one by one or all at once; two
 * STANDING checks are computed and never cleared in bulk: the acceptance line (signing is binding: the owner
 * confirms the exact line, and any edit re-opens it) and, for a signable proposal, missing UAT sign-off terms.
 * Unfilled [placeholders] also block sending.
 */
import { cleanLine, cleanText, type ProposalDoc as ProposalDocV1, parseAmount, parseQty } from './customProposal';

export const CUSTOM_PROPOSAL_V2_ID = 'custom-proposal-v2';

// ------------------------------------------------------------------ types

export type Space = 'tight' | 'normal' | 'loose';
export type Role = 'display' | 'fixed' | 'body' | 'name';
export type SectionKind = 'content' | 'pricing' | 'terms';
export type PageSize = 'letter' | 'a4';

export const COMPONENT_TYPES = [
  'section-header',
  'text',
  'letter',
  'stats',
  'card-grid',
  'detail-card',
  'roadmap',
  'dark-band',
  'data-table',
  'price-table',
  'economics',
  'callout',
  'process',
  'checklist',
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const ICON_KEYS = ['target', 'funnel', 'user-star', 'graduation-cap', 'chart', 'users', 'trending-up', 'circle-check', 'shield-check', 'database', 'clock', 'calendar', 'handshake', 'rocket', 'mail', 'phone'] as const;
export type IconKey = (typeof ICON_KEYS)[number];

interface Base {
  id: string;
  space: Space;
  newPage: boolean;
  check?: string;
}

export interface SectionHeaderC extends Base {
  type: 'section-header';
  variant: 'page' | 'sub' | 'block' | 'group';
  eyebrow: string;
  title: string;
  /** page: lead; sub: text; block: intro; group: inline note. */
  text: string;
  divider: 'none' | 'thin' | 'strong';
}
export interface TextC extends Base {
  type: 'text';
  variant: 'paragraph' | 'bullets' | 'numbered';
  size: 'body' | 'lead' | 'small';
  paragraphs: string[];
  items: string[];
}
export interface LetterC extends Base {
  type: 'letter';
  variant: 'default';
  eyebrow: string;
  salutation: string;
  paragraphs: string[];
}
export interface StatItem {
  label: string;
  value: string;
  description: string;
}
export interface StatsC extends Base {
  type: 'stats';
  variant: 'strip' | 'cards';
  columns: 3 | 4;
  items: StatItem[];
  highlight: number | null;
}
export interface Chip {
  text: string;
  tone: 'neutral' | 'positive';
}
export interface CardItem {
  title: string;
  /** person cards: 2 letters (empty = from the name, else the role). */
  initials: string;
  subtitle: string;
  text: string;
  icon: string;
  chips: Chip[];
  bullets: string[];
}
export interface CardGridC extends Base {
  type: 'card-grid';
  variant: 'card' | 'icon' | 'person' | 'step' | 'list' | 'plain' | 'plain-ruled';
  columns: 2 | 3;
  compact: boolean;
  items: CardItem[];
}
export interface SubItem {
  title: string;
  text: string;
}
export interface DetailCardC extends Base {
  type: 'detail-card';
  variant: 'text' | 'pill';
  title: string;
  tag: string;
  text: string;
  subItems: SubItem[];
}
export interface Phase {
  label: string;
  title: string;
  text: string;
  gateTitle: string;
  gateSub: string;
}
export interface RoadmapC extends Base {
  type: 'roadmap';
  variant: 'default';
  phases: Phase[];
  highlight: number | null;
  bandLeft: string;
  bandRight: string;
  /** Phases 1..bandSplit under the left (light) band label. */
  bandSplit: number;
  /** The right band label is dark (default) or light. */
  bandDark: boolean;
}
export interface DarkBandC extends Base {
  type: 'dark-band';
  variant: 'headline' | 'number';
  label: string;
  headline: string;
  highlight: string;
  number: string;
  text: string;
}
export type ColKind = 'label' | 'text' | 'number' | 'bar';
export type ColTone = 'default' | 'strong' | 'muted' | 'positive';
export interface TableCol {
  header: string;
  kind: ColKind;
  tone: ColTone;
}
export interface TableRow {
  cells: string[];
  subs: string[];
}
export interface DataTableC extends Base {
  type: 'data-table';
  variant: 'normal' | 'dense';
  columns: TableCol[];
  rows: TableRow[];
  highlightCol: number | null;
}
export interface PriceRowV2 {
  id: string;
  category: string;
  item: string;
  itemNote: string;
  rate: string;
  rateNote: string;
  terms: string;
  check?: string;
}
export interface PriceTableC extends Base {
  type: 'price-table';
  variant: '3col' | '4col';
  headers: string[];
  rows: PriceRowV2[];
  showTotal: boolean;
}
export interface Line {
  label: string;
  value: string;
}
export interface EconomicsC extends Base {
  type: 'economics';
  variant: 'default';
  leftLabel: string;
  leftTitle: string;
  lines: Line[];
  totalLabel: string;
  totalValue: string;
  note: string;
  rightLabel: string;
  rightTitle: string;
  bars: Line[];
  /** Optional width of bar 2 in % ("48"); empty = value 2 / value 1. */
  barPct: string;
  resultLabel: string;
  resultValue: string;
  subline: string;
}
export interface CalloutC extends Base {
  type: 'callout';
  variant: 'success' | 'neutral';
  icon: string;
  leadIn: string;
  text: string;
}
export interface ProcessRow {
  label: string;
  boxes: Line[];
}
export interface ProcessC extends Base {
  type: 'process';
  variant: 'default';
  lastDark: boolean;
  rows: ProcessRow[];
}
export interface ChecklistC extends Base {
  type: 'checklist';
  variant: 'default';
  title: string;
  items: string[];
}

export type Component = SectionHeaderC | TextC | LetterC | StatsC | CardGridC | DetailCardC | RoadmapC | DarkBandC | DataTableC | PriceTableC | EconomicsC | CalloutC | ProcessC | ChecklistC;

export interface SectionV2 {
  id: string;
  kind: SectionKind;
  eyebrow: string;
  heading: string;
  lead: string;
  newPage: boolean;
  continuedNote: string;
  blocks: Component[];
  check?: string;
}

export interface Party {
  name: string;
  title: string;
  url: string;
}

export interface CoverV2 {
  docType: string;
  title: string;
  lead: string;
  date: string;
  clientCompany: string;
  stats: { value: string; label: string }[];
  highlight: number | null;
  preparedFor: Party;
  preparedBy: Party & { credential: string };
}

export type CoverField = 'docType' | 'title' | 'lead' | 'date' | 'clientCompany' | 'stats' | 'preparedFor' | 'preparedBy';

export interface ProposalDocV2 {
  v: 2;
  settings: { pageSize: PageSize; docLabel: string; signable: boolean };
  cover: CoverV2;
  coverChecks: Partial<Record<CoverField, string>>;
  sections: SectionV2[];
  acceptance: { eyebrow: string; title: string; lead: string; check?: string; confirmedLine: string };
  closing: { label: string; headline: string };
  /** The owner reviewed the "no UAT sign-off terms" check and cleared it. */
  uatCleared: boolean;
  origin: { kind: 'blank' | 'pdf' | 'text' | 'upgrade'; fileName: string; pages: number };
}

/** The owner's saved sign-off (Agreements settings): inserted by the app, never written by the AI. */
export interface ProposalProfile {
  name: string;
  title: string;
  credential: string;
  url: string;
  proofStats: { value: string; label: string }[];
}

export const DEFAULT_PROFILE: ProposalProfile = {
  name: 'Emil L. Halili',
  title: 'Founder & CEO, Appointmentlyy',
  credential: '',
  url: 'www.appointmentlyy.com',
  proofStats: [],
};

// ------------------------------------------------------------------ limits (hard; the lower of the two specs)

export const V2_LIMITS = {
  docChars: 400_000,
  sections: 30,
  blocks: 40,
  check: 300,
  docLabel: 40,
  continuedNote: 90,
  cover: { docType: 28, clientCompany: 26, title: 70, lead: 160, date: 24, statValue: 8, statLabel: 36, name: 40, forTitle: 60, byTitle: 70, credential: 40, url: 40 },
  section: { eyebrow: 32, heading: 60, lead: 240 },
  acceptance: { eyebrow: 24, title: 28, lead: 160 },
  closing: { label: 32, headline: 60 },
} as const;

export const BRAND_PROMISE = 'Fill high-ticket seats. Zero broker dependency.';
export const DEFAULT_CLOSING_LABEL = 'Questions before you sign?';
export const ESIGN_NOTE =
  'Signed electronically through Appointmentlyy Agreements. Names, titles, signatures and times are recorded on the Execution page and the Certificate of Completion that follow this page.';
export const ACCEPTANCE_CHECK = 'Signing is binding: confirm this line says only what signing commits the client to.';
export const UAT_CHECK = 'No UAT sign-off terms found. Add them before sending.';

/** Visible length: the inline markers do not count. */
export function vlen(s: string): number {
  return stripMarkers(s).length;
}
export function stripMarkers(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\s][^*]*)\*/g, '$1');
}

/** Cut a value to `max` visible characters (markers kept balanced by dropping a broken one). */
export function cutTo(s: string, max: number): string {
  if (vlen(s) <= max) return s;
  // Remove markers, cut, then end at a word boundary if it is close.
  const plain = stripMarkers(s);
  let cut = plain.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.7) cut = cut.slice(0, sp);
  return cut.trimEnd();
}

// ------------------------------------------------------------------ form specs (shared by normalizer, editor and import checks)

export interface FSField {
  key: string;
  label: string;
  max: number;
  multi?: boolean;
  role: Role;
  hint?: string;
}
export interface FSStrings {
  key: string;
  label: string;
  min: number;
  max: number;
  itemMax: number;
  role: Role;
  multi?: boolean;
  /** Sum of all items (visible characters). */
  totalMax?: number;
}
export interface FSList {
  key: string;
  label: string;
  item: string;
  min: number;
  max: number;
  fields: FSField[];
}
export interface FormSpec {
  fields: FSField[];
  strings: FSStrings[];
  lists: FSList[];
}

const f = (key: string, label: string, max: number, role: Role = 'display', multi = false, hint?: string): FSField => ({ key, label, max, role, multi, ...(hint ? { hint } : {}) });

/** Field limits for one component (some depend on its variant and columns). */
export function formSpec(c: Component): FormSpec {
  const none: FormSpec = { fields: [], strings: [], lists: [] };
  switch (c.type) {
    case 'section-header': {
      const v = c.variant;
      const fields = v === 'group' ? [f('title', 'Heading', 48), f('text', 'Note (after the heading)', 40)] : v === 'block' ? [f('title', 'Heading', 56), f('text', 'Intro', 200, 'body', true)] : [f('eyebrow', 'Eyebrow', 32), f('title', 'Title', 60), f('text', v === 'page' ? 'Lead' : 'Text', v === 'page' ? 240 : 700, 'body', true)];
      return { ...none, fields };
    }
    case 'text':
      return c.variant === 'paragraph'
        ? { ...none, strings: [{ key: 'paragraphs', label: 'Paragraphs', min: 1, max: 6, itemMax: 1200, role: 'body', multi: true }] }
        : { ...none, strings: [{ key: 'items', label: 'Items', min: 1, max: 12, itemMax: 240, role: 'body' }] };
    case 'letter':
      return { ...none, fields: [f('eyebrow', 'Eyebrow', 40), f('salutation', 'Salutation', 24)], strings: [{ key: 'paragraphs', label: 'Paragraphs', min: 1, max: 5, itemMax: 350, role: 'body', multi: true, totalMax: 1400 }] };
    case 'stats': {
      const strip = c.variant === 'strip';
      const four = !strip && c.columns === 4;
      const fields = strip ? [f('value', 'Value', 10), f('label', 'Label', 36)] : [f('label', 'Label', four ? 18 : 20), f('value', 'Value', 12), f('description', 'Description', 56)];
      const n = strip ? 3 : c.columns;
      return { ...none, lists: [{ key: 'items', label: 'Stats', item: 'Stat', min: n, max: n, fields }] };
    }
    case 'card-grid': {
      const two = c.columns === 2;
      const v = c.variant;
      let fields: FSField[];
      if (v === 'card') fields = [f('title', 'Title', two ? 32 : 28), f('text', 'Text', two ? 180 : 160, 'body', true)];
      else if (v === 'icon') fields = [f('title', 'Title', 24), f('text', 'Text', 64)];
      else if (v === 'person') fields = [f('title', 'Role', 36), f('subtitle', 'Name or descriptor', 40, 'name'), f('initials', 'Initials (2)', 2), f('text', 'Responsibilities', 110, 'body', true)];
      else if (v === 'step') fields = [f('title', 'Title', 32), f('text', 'Text', 180, 'body', true)];
      else if (v === 'list') fields = [f('title', 'Title', 40)];
      else fields = [f('title', 'Title', 28), f('text', 'Text', 260, 'body', true)];
      return { ...none, lists: [{ key: 'items', label: 'Cards', item: 'Card', min: 1, max: 6, fields }] };
    }
    case 'detail-card':
      return { ...none, fields: [f('title', 'Title', 48), f('tag', 'Tag', c.variant === 'pill' ? 28 : 24), f('text', 'Text', 700, 'body', true)], lists: [{ key: 'subItems', label: 'Sub-items', item: 'Sub-item', min: 0, max: 2, fields: [f('title', 'Title', 32), f('text', 'Text', 90)] }] };
    case 'roadmap':
      return {
        ...none,
        fields: [f('bandLeft', 'Left band label', 48), f('bandRight', 'Right band label', 48)],
        lists: [{ key: 'phases', label: 'Phases', item: 'Phase', min: 3, max: 4, fields: [f('label', 'When', 22), f('title', 'Title', 24), f('text', 'Text', 56), f('gateTitle', 'Gate (optional)', 24), f('gateSub', 'Gate result', 24)] }],
      };
    case 'dark-band':
      return c.variant === 'number'
        ? { ...none, fields: [f('label', 'Label', 16), f('number', 'Number', 4), f('text', 'Text', 220, 'body', true)] }
        : { ...none, fields: [f('label', 'Label', 20), f('headline', 'Headline', 40), f('highlight', 'Crimson phrase (part of the headline)', 18), f('text', 'Text', 220, 'body', true)] };
    case 'data-table':
      return none; // columns and cells: see tableLimits
    case 'price-table':
      return {
        ...none,
        lists: [
          {
            key: 'rows',
            label: 'Rows',
            item: 'Row',
            min: 1,
            max: 10,
            fields: [...(c.variant === '4col' ? [f('category', 'Category', 24, 'fixed')] : []), f('item', 'Item / role', 48, 'fixed'), f('itemNote', 'Item note', 40, 'fixed'), f('rate', 'Rate', 16, 'fixed'), f('rateNote', 'Rate note', 16, 'fixed'), f('terms', c.variant === '4col' ? 'Notes' : 'Billing & terms', 90, 'fixed', true)],
          },
        ],
      };
    case 'economics':
      return {
        ...none,
        fields: [
          f('leftLabel', 'Left card label', 24),
          f('leftTitle', 'Left card title', 32),
          f('totalLabel', 'Total label', 24, 'fixed'),
          f('totalValue', 'Total value', 12, 'fixed'),
          f('note', 'Note', 140, 'body', true),
          f('rightLabel', 'Right card label', 24),
          f('rightTitle', 'Right card title', 44),
          f('barPct', 'Bar 2 width % (optional)', 3, 'fixed'),
          f('resultLabel', 'Result label', 24),
          f('resultValue', 'Result value', 12, 'fixed'),
          f('subline', 'Sub-line', 70, 'fixed'),
        ],
        lists: [
          { key: 'lines', label: 'Cost lines', item: 'Line', min: 2, max: 4, fields: [f('label', 'Label', 32), f('value', 'Value', 12, 'fixed')] },
          { key: 'bars', label: 'Bars', item: 'Bar', min: 2, max: 2, fields: [f('label', 'Label', 24), f('value', 'Value', 14, 'fixed')] },
        ],
      };
    case 'callout':
      return { ...none, fields: [f('leadIn', 'Lead-in (optional)', 24), f('text', 'Text', 280, 'body', true)] };
    case 'process':
      return { ...none, lists: [{ key: 'rows', label: 'Rows', item: 'Row', min: 1, max: 4, fields: [f('label', 'Row label', 14)] }] };
    case 'checklist':
      return { ...none, fields: [f('title', 'Title', 40)], strings: [{ key: 'items', label: 'Items', min: 2, max: 6, itemMax: 48, role: 'display' }] };
  }
}

/** Process boxes: 3 per row. */
export const PROCESS_BOX = { label: 22, value: 18 } as const;
/** Card chips and list bullets. */
export const CHIP = { max: 3, text: 24 } as const;
export const LIST_BULLETS = { min: 2, max: 6, text: 72 } as const;
/** DataTable. */
export const TABLE = { minCols: 2, maxCols: 5, header: 24, minRows: 1, maxRows: 12, text: 120, number: 18, bar: 8, sub: 40 } as const;
export const PRICE_HEADER = 24;

export const cellMax = (k: ColKind) => (k === 'number' ? TABLE.number : k === 'bar' ? TABLE.bar : TABLE.text);

// ------------------------------------------------------------------ helpers

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ID_RE = /^[a-z][a-z0-9]{1,40}$/;
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

let seq = 0;
export function newId(prefix: string): string {
  seq = (seq + 1) % 1_000_000;
  const rnd = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 10);
  return `${prefix}${rnd}${seq.toString(36)}`;
}

export function mark(cur: string | undefined, note: string): string {
  if (!cur) return note.slice(0, V2_LIMITS.check);
  return cur.includes(note) ? cur : `${cur} ${note}`.slice(0, V2_LIMITS.check);
}

/** Collects "Check" notes while a value is rebuilt. */
class Notes {
  list: string[] = [];
  add(n: string) {
    if (!this.list.includes(n)) this.list.push(n);
  }
  merge(cur: string | undefined): string | undefined {
    let out = cur;
    for (const n of this.list) out = mark(out, n);
    return out || undefined;
  }
}

/** A text value within its limit; over the limit it is cut and noted. */
function fit(v: unknown, max: number, multi: boolean, label: string, notes: Notes): string {
  const s = multi ? cleanText(v, max * 3 + 200) : cleanLine(v, max * 3 + 200);
  if (vlen(s) <= max) return s;
  notes.add(`${label} was over ${max} characters and was shortened: check the end.`);
  return cutTo(s, max);
}

// ------------------------------------------------------------------ constructors and samples

export const SPACE_DEFAULT: Space = 'normal';

const base = (id = newId('c')) => ({ id, space: SPACE_DEFAULT, newPage: false });

export const COMPONENT_LABEL: Record<ComponentType, string> = {
  'section-header': 'Section header',
  text: 'Text',
  letter: 'Letter',
  stats: 'Stats',
  'card-grid': 'Card grid',
  'detail-card': 'Detail card',
  roadmap: 'Roadmap',
  'dark-band': 'Dark band',
  'data-table': 'Data table',
  'price-table': 'Price table',
  economics: 'Economics pair',
  callout: 'Callout',
  process: 'Process rows',
  checklist: 'Checklist',
};

export const VARIANTS: Partial<Record<ComponentType, { value: string; label: string }[]>> = {
  'section-header': [
    { value: 'page', label: 'Page header' },
    { value: 'sub', label: 'Sub-section' },
    { value: 'block', label: 'Block heading' },
    { value: 'group', label: 'Group heading (above a table)' },
  ],
  text: [
    { value: 'paragraph', label: 'Paragraphs' },
    { value: 'bullets', label: 'Bullet list' },
    { value: 'numbered', label: 'Numbered list' },
  ],
  stats: [
    { value: 'cards', label: 'Stat cards' },
    { value: 'strip', label: 'Ruled strip (3)' },
  ],
  'card-grid': [
    { value: 'card', label: 'Cards' },
    { value: 'icon', label: 'Icon cards' },
    { value: 'person', label: 'People' },
    { value: 'step', label: 'Numbered steps' },
    { value: 'list', label: 'Bullet lists' },
    { value: 'plain', label: 'Plain columns' },
    { value: 'plain-ruled', label: 'Plain columns with a rule' },
  ],
  'detail-card': [
    { value: 'text', label: 'Text tag' },
    { value: 'pill', label: 'Pill tag' },
  ],
  'dark-band': [
    { value: 'headline', label: 'Headline' },
    { value: 'number', label: 'Big number' },
  ],
  'data-table': [
    { value: 'normal', label: 'Normal rows' },
    { value: 'dense', label: 'Dense rows' },
  ],
  'price-table': [
    { value: '3col', label: 'Item, rate, terms' },
    { value: '4col', label: 'Category, item, rate, notes' },
  ],
  callout: [
    { value: 'neutral', label: 'Neutral' },
    { value: 'success', label: 'Recommendation (green)' },
  ],
};

const emptyCard = (): CardItem => ({ title: '', initials: '', subtitle: '', text: '', icon: 'target', chips: [], bullets: [] });

/** A new component of a type, with sample content inside its limits (the owner edits it). */
export function newComponent(type: ComponentType, variant?: string): Component {
  const b = base();
  switch (type) {
    case 'section-header':
      return { ...b, type, variant: (variant as SectionHeaderC['variant']) ?? 'sub', eyebrow: 'Eyebrow', title: 'A heading that says the point', text: '', divider: 'thin' };
    case 'text':
      return { ...b, type, variant: (variant as TextC['variant']) ?? 'paragraph', size: 'body', paragraphs: ['Write the paragraph here.'], items: ['First item', 'Second item'] };
    case 'letter':
      return { ...b, type, variant: 'default', eyebrow: 'A note from Emil', salutation: '[First name],', paragraphs: ['[What the client already owns, and how the market usually fails companies like theirs.]', '[What we build together, by when, under whose brand.]', '[The bridge into the plan.]'] };
    case 'stats':
      return variant === 'strip'
        ? { ...b, type, variant: 'strip', columns: 3, highlight: null, items: [0, 1, 2].map(() => ({ value: '[Value]', label: '[What it means]', description: '' })) }
        : { ...b, type, variant: 'cards', columns: 4, highlight: 0, items: [0, 1, 2, 3].map(() => ({ label: '[Label]', value: '[Value]', description: '[What is true by then]' })) };
    case 'card-grid': {
      const v = (variant as CardGridC['variant']) ?? 'card';
      const cols = v === 'icon' || v === 'step' ? 3 : 2;
      return { ...b, type, variant: v, columns: cols, compact: false, items: Array.from({ length: cols }, (_, i) => ({ ...emptyCard(), title: `Card ${i + 1}`, text: v === 'list' ? '' : 'Short text for this card.', bullets: v === 'list' ? ['First point', 'Second point'] : [] })) };
    }
    case 'detail-card':
      return { ...b, type, variant: (variant as DetailCardC['variant']) ?? 'text', title: 'Title', tag: '', text: 'What happens, who does it, and what is true when it is done.', subItems: [] };
    case 'roadmap':
      return {
        ...b,
        type,
        variant: 'default',
        highlight: 2,
        bandLeft: '',
        bandRight: '',
        bandSplit: 2,
        bandDark: true,
        phases: [
          { label: '[When]', title: 'Plan', text: '[What happens]', gateTitle: 'Gate: plan approved', gateSub: 'Build begins' },
          { label: '[When]', title: 'Build', text: '[What happens]', gateTitle: 'Gate: UAT sign-off', gateSub: 'Ready for Day 1' },
          { label: '[When]', title: 'Go-live', text: '[What happens]', gateTitle: '', gateSub: '' },
          { label: '[When]', title: 'Scale', text: '[What happens]', gateTitle: '', gateSub: '' },
        ],
      };
    case 'dark-band':
      return variant === 'number'
        ? { ...b, type, variant: 'number', label: 'By day', headline: '', highlight: '', number: '14', text: '[What is live by then.]' }
        : { ...b, type, variant: 'headline', label: 'Architecture', headline: 'Bring your own keys', highlight: 'your own keys', number: '', text: '[The principle the deal rests on.]' };
    case 'data-table':
      return {
        ...b,
        type,
        variant: (variant as DataTableC['variant']) ?? 'normal',
        highlightCol: null,
        columns: [
          { header: 'Item', kind: 'label', tone: 'default' },
          { header: 'Detail', kind: 'text', tone: 'default' },
        ],
        rows: [{ cells: ['', ''], subs: ['', ''] }],
      };
    case 'price-table': {
      const v = (variant as PriceTableC['variant']) ?? '3col';
      return { ...b, type, variant: v, headers: v === '4col' ? ['Department', 'Role / tier', 'Monthly', 'Notes'] : ['Item / role', 'Rate', 'Billing & terms'], showTotal: false, rows: [{ id: newId('r'), category: '', item: '', itemNote: '', rate: '', rateNote: '', terms: '' }] };
    }
    case 'economics':
      return {
        ...b,
        type,
        variant: 'default',
        leftLabel: 'Lean pilot',
        leftTitle: '[Scenario]',
        lines: [
          { label: '[Line]', value: '' },
          { label: '[Line]', value: '' },
        ],
        totalLabel: 'Monthly cost',
        totalValue: '',
        note: '',
        rightLabel: 'At scale',
        rightTitle: '[Scenario]',
        bars: [
          { label: 'Revenue', value: '' },
          { label: 'Total operating cost', value: '' },
        ],
        barPct: '',
        resultLabel: 'Net operating profit',
        resultValue: '',
        subline: '',
      };
    case 'callout':
      return { ...b, type, variant: (variant as CalloutC['variant']) ?? 'neutral', icon: 'trending-up', leadIn: variant === 'success' ? 'Recommendation:' : '', text: 'One short point the reader should not miss.' };
    case 'process':
      return { ...b, type, variant: 'default', lastDark: true, rows: [{ label: '[Row]', boxes: [{ label: '[Step]', value: '' }, { label: '[Step]', value: '' }, { label: '[Step]', value: '' }] }] };
    case 'checklist':
      return { ...b, type, variant: 'default', title: 'To confirm on the alignment call', items: ['[Open decision]', '[Open decision]'] };
  }
}

export function emptyPriceRow(): PriceRowV2 {
  return { id: newId('r'), category: '', item: '', itemNote: '', rate: '', rateNote: '', terms: '' };
}

export function emptySectionV2(kind: SectionKind = 'content'): SectionV2 {
  return {
    id: newId('s'),
    kind,
    eyebrow: kind === 'pricing' ? 'Investment' : kind === 'terms' ? 'Terms' : '',
    heading: kind === 'pricing' ? 'Built to be a true win-win' : '',
    lead: '',
    newPage: kind !== 'content',
    continuedNote: '',
    blocks: kind === 'pricing' ? [newComponent('price-table', '3col')] : [newComponent('text')],
  };
}

// ------------------------------------------------------------------ normalize

function normItemsList<T>(raw: unknown, min: number, max: number, label: string, notes: Notes, build: (o: Record<string, unknown>, i: number) => T, blank: () => T): T[] {
  const list = arr(raw).filter(isObj);
  if (list.length > max) notes.add(`Only the first ${max} ${label.toLowerCase()} fit this component.`);
  const out = list.slice(0, max).map((o, i) => build(o, i));
  while (out.length < min) out.push(blank());
  return out;
}

function normStrings(raw: unknown, spec: FSStrings, notes: Notes): string[] {
  const list = arr(raw).filter((x) => typeof x === 'string' || typeof x === 'number');
  if (list.length > spec.max) notes.add(`Only the first ${spec.max} ${spec.label.toLowerCase()} fit this component.`);
  let out = list.slice(0, spec.max).map((x) => fit(x, spec.itemMax, !!spec.multi, spec.label.replace(/s$/, ''), notes));
  if (spec.totalMax) {
    let total = 0;
    out = out.map((p) => {
      const room = spec.totalMax! - total;
      if (room <= 0) {
        notes.add(`${spec.label} were over ${spec.totalMax} characters in total and were shortened.`);
        return '';
      }
      const cut = vlen(p) > room ? (notes.add(`${spec.label} were over ${spec.totalMax} characters in total and were shortened.`), cutTo(p, room)) : p;
      total += vlen(cut);
      return cut;
    }).filter(Boolean);
  }
  while (out.length < spec.min) out.push('');
  return out;
}

const LEGACY_BLOCK: Record<string, (r: Record<string, unknown>) => Record<string, unknown>> = {
  paragraph: (r) => ({ ...r, type: 'text', variant: 'paragraph', paragraphs: String(r.text ?? '').split(/\n{2,}/) }),
  bullets: (r) => ({ ...r, type: 'text', variant: 'bullets' }),
  numbered: (r) => ({ ...r, type: 'text', variant: 'numbered' }),
  callout: (r) => ({ ...r, type: 'callout', variant: r.variant ?? r.tone ?? 'neutral' }),
  table: (r) => {
    const header = arr(r.header).map((x) => String(x ?? ''));
    return { ...r, type: 'data-table', variant: 'normal', columns: header.map((h, i) => ({ header: h, kind: i === 0 ? 'label' : 'text' })), rows: arr(r.rows).map((row) => ({ cells: arr(row).map((x) => String(x ?? '')) })) };
  },
};

/** Rebuild one component from anything. Null for an unknown type. */
export function normalizeComponent(raw0: unknown, id: string): Component | null {
  if (!isObj(raw0)) return null;
  let raw = raw0;
  if (typeof raw.type === 'string' && LEGACY_BLOCK[raw.type]) raw = LEGACY_BLOCK[raw.type](raw);
  const type = raw.type;
  if (typeof type !== 'string' || !(COMPONENT_TYPES as readonly string[]).includes(type)) return null;
  const notes = new Notes();
  const b = {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : id,
    space: oneOf(raw.space, ['tight', 'normal', 'loose'] as const, 'normal'),
    newPage: bool(raw.newPage, false),
  };
  const s = (k: string, max: number, multi = false, label = k) => fit(raw[k], max, multi, label, notes);
  let c: Component;
  switch (type as ComponentType) {
    case 'section-header': {
      const variant = oneOf(raw.variant, ['page', 'sub', 'block', 'group'] as const, 'sub');
      c = { ...b, type: 'section-header', variant, eyebrow: '', title: '', text: '', divider: variant === 'sub' ? oneOf(raw.divider, ['none', 'thin', 'strong'] as const, 'none') : 'none' };
      break;
    }
    case 'text': {
      const variant = oneOf(raw.variant, ['paragraph', 'bullets', 'numbered'] as const, 'paragraph');
      c = { ...b, type: 'text', variant, size: oneOf(raw.size, ['body', 'lead', 'small'] as const, 'body'), paragraphs: [], items: [] };
      break;
    }
    case 'letter':
      c = { ...b, type: 'letter', variant: 'default', eyebrow: '', salutation: '', paragraphs: [] };
      break;
    case 'stats': {
      const variant = oneOf(raw.variant, ['strip', 'cards'] as const, 'cards');
      const rawCount = arr(raw.items).length;
      const columns: 3 | 4 = variant === 'strip' ? 3 : raw.columns === 3 || (raw.columns !== 4 && rawCount === 3) ? 3 : 4;
      c = { ...b, type: 'stats', variant, columns, items: [], highlight: null };
      break;
    }
    case 'card-grid': {
      const variant = oneOf(raw.variant, ['card', 'icon', 'person', 'step', 'list', 'plain', 'plain-ruled'] as const, 'card');
      const columns: 2 | 3 = variant === 'list' || variant === 'plain' || variant === 'plain-ruled' || variant === 'person' ? 2 : raw.columns === 2 ? 2 : raw.columns === 3 ? 3 : variant === 'card' ? 2 : 3;
      c = { ...b, type: 'card-grid', variant, columns, compact: bool(raw.compact, false), items: [] };
      break;
    }
    case 'detail-card':
      c = { ...b, type: 'detail-card', variant: oneOf(raw.variant, ['text', 'pill'] as const, 'text'), title: '', tag: '', text: '', subItems: [] };
      break;
    case 'roadmap':
      c = { ...b, type: 'roadmap', variant: 'default', phases: [], highlight: null, bandLeft: '', bandRight: '', bandSplit: 2, bandDark: bool(raw.bandDark, true) };
      break;
    case 'dark-band':
      c = { ...b, type: 'dark-band', variant: oneOf(raw.variant, ['headline', 'number'] as const, raw.number ? 'number' : 'headline'), label: '', headline: '', highlight: '', number: '', text: '' };
      break;
    case 'data-table':
      c = { ...b, type: 'data-table', variant: oneOf(raw.variant, ['normal', 'dense'] as const, 'normal'), columns: [], rows: [], highlightCol: null };
      break;
    case 'price-table': {
      const rawCols = arr(raw.headers).length;
      const variant = oneOf(raw.variant, ['3col', '4col'] as const, rawCols === 4 || arr(raw.rows).some((r) => isObj(r) && String(r.category ?? '').trim()) ? '4col' : '3col');
      c = { ...b, type: 'price-table', variant, headers: [], rows: [], showTotal: bool(raw.showTotal, false) };
      break;
    }
    case 'economics':
      c = { ...b, type: 'economics', variant: 'default', leftLabel: '', leftTitle: '', lines: [], totalLabel: '', totalValue: '', note: '', rightLabel: '', rightTitle: '', bars: [], barPct: '', resultLabel: '', resultValue: '', subline: '' };
      break;
    case 'callout':
      c = { ...b, type: 'callout', variant: oneOf(raw.variant ?? raw.tone, ['success', 'neutral'] as const, 'neutral'), icon: 'trending-up', leadIn: '', text: '' };
      break;
    case 'process':
      c = { ...b, type: 'process', variant: 'default', lastDark: bool(raw.lastDark, true), rows: [] };
      break;
    case 'checklist':
      c = { ...b, type: 'checklist', variant: 'default', title: '', items: [] };
      break;
  }
  const spec = formSpec(c);
  const o = c as unknown as Record<string, unknown>;
  for (const fs of spec.fields) o[fs.key] = s(fs.key, fs.max, !!fs.multi, fs.label);
  for (const st of spec.strings) o[st.key] = normStrings(raw[st.key], st, notes);
  for (const ls of spec.lists) {
    o[ls.key] = normItemsList(
      raw[ls.key],
      ls.min,
      ls.max,
      ls.label,
      notes,
      (it) => {
        const out: Record<string, unknown> = {};
        for (const fs of ls.fields) out[fs.key] = fit(it[fs.key], fs.max, !!fs.multi, `${ls.item} ${fs.label.toLowerCase()}`, notes);
        return out;
      },
      () => Object.fromEntries(ls.fields.map((fs) => [fs.key, ''])),
    );
  }
  // Type-specific extras.
  switch (c.type) {
    case 'stats': {
      c.items = c.items.map((x) => ({ label: x.label ?? '', value: x.value ?? '', description: x.description ?? '' }));
      c.highlight = typeof raw.highlight === 'number' && Number.isInteger(raw.highlight) && raw.highlight >= 0 && raw.highlight < c.items.length ? raw.highlight : null;
      break;
    }
    case 'card-grid': {
      const rawItems = arr(raw.items).filter(isObj);
      c.items = c.items.map((x, i) => {
        const r = rawItems[i] ?? {};
        const chips = arr(r.chips)
          .filter(isObj)
          .slice(0, CHIP.max)
          .map((ch) => ({ text: fit(ch.text, CHIP.text, false, 'Chip', notes), tone: oneOf(ch.tone, ['neutral', 'positive'] as const, 'neutral') }))
          .filter((ch) => ch.text);
        if (arr(r.chips).length > CHIP.max) notes.add(`Only ${CHIP.max} chips fit a card.`);
        const bullets = c.variant === 'list' ? normStrings(r.bullets, { key: 'bullets', label: 'Bullets', min: LIST_BULLETS.min, max: LIST_BULLETS.max, itemMax: LIST_BULLETS.text, role: 'display' }, notes) : [];
        const icon = oneOf(r.icon, ICON_KEYS, 'target');
        return { title: String(x.title ?? ''), initials: c.variant === 'person' ? String((x as Partial<CardItem>).initials ?? '').toUpperCase() : '', subtitle: String((x as Partial<CardItem>).subtitle ?? ''), text: String((x as Partial<CardItem>).text ?? ''), icon, chips: c.variant === 'card' ? chips : [], bullets };
      });
      break;
    }
    case 'roadmap': {
      c.highlight = typeof raw.highlight === 'number' && Number.isInteger(raw.highlight) && raw.highlight >= 0 && raw.highlight < c.phases.length ? raw.highlight : null;
      const k = typeof raw.bandSplit === 'number' ? Math.round(raw.bandSplit) : Math.floor(c.phases.length / 2);
      c.bandSplit = Math.max(1, Math.min(c.phases.length - 1, k));
      break;
    }
    case 'dark-band': {
      if (c.highlight && !stripMarkers(c.headline).includes(c.highlight)) {
        notes.add('The crimson phrase is not part of the headline.');
        c.highlight = '';
      }
      break;
    }
    case 'callout':
      c.icon = c.variant === 'success' ? 'circle-check' : oneOf(raw.icon, ICON_KEYS, 'trending-up');
      break;
    case 'process': {
      const rawRows = arr(raw.rows).filter(isObj);
      c.rows = c.rows.map((r, i) => {
        const rr = rawRows[i] ?? {};
        const boxes = arr(rr.boxes).filter(isObj);
        if (boxes.length > 3) notes.add('A process row holds 3 boxes.');
        return { label: r.label, boxes: [0, 1, 2].map((j) => ({ label: fit(boxes[j]?.label, PROCESS_BOX.label, false, 'Box label', notes), value: fit(boxes[j]?.value, PROCESS_BOX.value, false, 'Box value', notes) })) };
      });
      break;
    }
    case 'price-table': {
      const n = c.variant === '4col' ? 4 : 3;
      const dflt = c.variant === '4col' ? ['Category', 'Item / role', 'Rate', 'Notes'] : ['Item / role', 'Rate', 'Billing & terms'];
      const hs = arr(raw.headers);
      c.headers = Array.from({ length: n }, (_, i) => fit(hs[i] ?? dflt[i], PRICE_HEADER, false, 'Column header', notes) || dflt[i]);
      const rawRows = arr(raw.rows).filter(isObj);
      const used = new Set<string>();
      c.rows = (c.rows as unknown as Record<string, string>[]).map((r, i) => {
        const rr = rawRows[i] ?? {};
        let rid = typeof rr.id === 'string' && ID_RE.test(rr.id) ? rr.id : `${c.id}r${i + 1}`;
        if (used.has(rid)) rid = `${c.id}r${i + 1}x`;
        used.add(rid);
        const row: PriceRowV2 = { id: rid, category: c.variant === '4col' ? r.category ?? '' : '', item: r.item ?? '', itemNote: r.itemNote ?? '', rate: r.rate ?? '', rateNote: r.rateNote ?? '', terms: r.terms ?? '' };
        const ck = cleanLine(rr.check, V2_LIMITS.check);
        if (ck) row.check = ck;
        return row;
      });
      // A total only when every rate is one plain amount (one currency).
      if (c.showTotal && priceTotal(c) === null) c.showTotal = false;
      break;
    }
    case 'data-table': {
      const cols = arr(raw.columns).filter(isObj);
      if (cols.length > TABLE.maxCols) notes.add(`A table holds up to ${TABLE.maxCols} columns.`);
      c.columns = cols.slice(0, TABLE.maxCols).map((col, i) => ({
        header: fit(col.header, TABLE.header, false, 'Column header', notes),
        kind: i === 0 ? 'label' : oneOf(col.kind, ['text', 'number', 'bar'] as const, 'text'),
        tone: oneOf(col.tone, ['default', 'strong', 'muted', 'positive'] as const, 'default'),
      }));
      while (c.columns.length < TABLE.minCols) c.columns.push({ header: '', kind: c.columns.length ? 'text' : 'label', tone: 'default' });
      const rows = arr(raw.rows);
      if (rows.length > TABLE.maxRows) notes.add(`A table holds up to ${TABLE.maxRows} rows: split it into two tables with group headings.`);
      c.rows = rows.slice(0, TABLE.maxRows).map((r) => {
        const cells = isObj(r) ? arr(r.cells) : arr(r);
        const subs = isObj(r) ? arr(r.subs) : [];
        return {
          cells: c.columns.map((col, j) => fit(cells[j], cellMax(col.kind), false, 'Cell', notes)),
          subs: c.columns.map((_, j) => fit(subs[j], TABLE.sub, false, 'Sub-label', notes)),
        };
      });
      if (!c.rows.length) c.rows = [{ cells: c.columns.map(() => ''), subs: c.columns.map(() => '') }];
      const hc = raw.highlightCol;
      c.highlightCol = typeof hc === 'number' && Number.isInteger(hc) && hc >= 1 && hc < c.columns.length ? hc : null;
      break;
    }
  }
  const merged = notes.merge(cleanLine(raw.check, V2_LIMITS.check) || undefined);
  if (merged) c.check = merged;
  return c;
}

const PRICE_AMOUNT_RE = /^\s*(?:([A-Z]{3})\s*)?([$€£₱¥])?\s*(\d[\d,]*(?:\.\d+)?)\s*$/;

/** Total of a price table, or null when a rate is not one plain amount or currencies differ. */
export function priceTotal(c: PriceTableC): { amount: number; prefix: string } | null {
  let sum = 0;
  let prefix: string | null = null;
  let n = 0;
  for (const r of c.rows) {
    if (!r.rate.trim() && !r.item.trim()) continue;
    const m = PRICE_AMOUNT_RE.exec(r.rate);
    if (!m) return null;
    const p = `${m[1] ? `${m[1]} ` : ''}${m[2] ?? ''}`;
    if (prefix !== null && p !== prefix) return null;
    prefix = p;
    const q = /^× ?(\d+)$/.exec(r.rateNote.trim());
    sum += Number(m[3].replace(/,/g, '')) * (q ? Number(q[1]) : 1);
    n++;
  }
  return n ? { amount: Math.round(sum * 100) / 100, prefix: prefix ?? '' } : null;
}

function normParty(raw: unknown, titleMax: number, notes: Notes, label: string): Party {
  const r = isObj(raw) ? raw : {};
  return {
    name: fit(r.name, V2_LIMITS.cover.name, false, `${label} name`, notes),
    title: fit(r.title, titleMax, false, `${label} title`, notes),
    url: fit(r.url, V2_LIMITS.cover.url, false, `${label} website`, notes),
  };
}

/**
 * Rebuild a v2 document from anything (editor state, stored JSON, AI output). Returns the document and a
 * list of structural problems (empty when the input was well formed). Never throws.
 */
export function normalizeDocV2(raw: unknown): { doc: ProposalDocV2; problems: string[] } {
  const problems: string[] = [];
  if (typeof raw === 'string') {
    try {
      raw = raw.length > V2_LIMITS.docChars ? null : JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!isObj(raw)) return { doc: emptyDocV2(DEFAULT_PROFILE, { blank: true }), problems: ['not a document'] };
  const L = V2_LIMITS.cover;
  const rs = isObj(raw.settings) ? raw.settings : {};
  const rc = isObj(raw.cover) ? raw.cover : {};
  if (!isObj(raw.cover)) problems.push('cover missing');
  const rcc = isObj(raw.coverChecks) ? raw.coverChecks : {};
  const coverChecks: ProposalDocV2['coverChecks'] = {};
  const cn = (k: CoverField) => {
    const n = new Notes();
    return { n, done: () => {
      const m = n.merge(cleanLine(rcc[k], V2_LIMITS.check) || undefined);
      if (m) coverChecks[k] = m;
    } };
  };
  const field = (k: Exclude<CoverField, 'stats' | 'preparedFor' | 'preparedBy'>, max: number, label: string) => {
    const x = cn(k);
    const v = fit(rc[k], max, false, label, x.n);
    x.done();
    return v;
  };
  const statsN = cn('stats');
  let stats = arr(rc.stats)
    .filter(isObj)
    .map((x) => ({ value: fit(x.value, L.statValue, false, 'Stat value', statsN.n), label: fit(x.label, L.statLabel, false, 'Stat label', statsN.n) }))
    .filter((x) => x.value || x.label);
  if (stats.length && stats.length !== 3) {
    statsN.n.add('The cover stat strip needs exactly 3 figures: it is left out with fewer, and only the first 3 are kept.');
    stats = stats.length > 3 ? stats.slice(0, 3) : [];
  }
  statsN.done();
  const pfN = cn('preparedFor');
  const preparedFor = normParty(rc.preparedFor, L.forTitle, pfN.n, 'Prepared for');
  pfN.done();
  const pbN = cn('preparedBy');
  const rpb = isObj(rc.preparedBy) ? rc.preparedBy : {};
  const preparedBy = { ...normParty(rpb, L.byTitle, pbN.n, 'Prepared by'), credential: fit(rpb.credential, L.credential, false, 'Credential', pbN.n) };
  pbN.done();
  const cover: CoverV2 = {
    docType: field('docType', L.docType, 'Document label'),
    title: field('title', L.title, 'Title'),
    lead: field('lead', L.lead, 'Lead'),
    date: field('date', L.date, 'Date'),
    clientCompany: field('clientCompany', L.clientCompany, 'Client company'),
    stats,
    highlight: typeof rc.highlight === 'number' && Number.isInteger(rc.highlight) && rc.highlight >= 0 && rc.highlight < stats.length ? rc.highlight : null,
    preparedFor,
    preparedBy,
  };
  const settings: ProposalDocV2['settings'] = {
    pageSize: rs.pageSize === 'a4' ? 'a4' : 'letter',
    docLabel: cleanLine(rs.docLabel, V2_LIMITS.docLabel * 2).slice(0, V2_LIMITS.docLabel),
    signable: rs.signable !== false,
  };
  if (!Array.isArray(raw.sections)) problems.push('sections must be a list');
  const sections: SectionV2[] = [];
  let n = 0;
  for (const r of arr(raw.sections).slice(0, V2_LIMITS.sections)) {
    n++;
    if (!isObj(r)) {
      problems.push(`section ${n} is not an object`);
      continue;
    }
    const notes = new Notes();
    const kind: SectionKind = r.kind === 'pricing' ? 'pricing' : r.kind === 'terms' ? 'terms' : 'content';
    const rawBlocks = [...arr(r.blocks)];
    // A v1-shaped price list (section rows: item, qty, unit price) is kept as a price table: prices are never dropped.
    const legacyRows = arr(r.rows).filter(isObj);
    if (legacyRows.length) {
      rawBlocks.push({
        type: 'price-table',
        variant: '3col',
        rows: legacyRows.map((x) => {
          const qty = cleanLine(x.qty, 20);
          const cur = cleanLine(x.currency, 8);
          return { item: x.item, rate: `${cur ? `${cur} ` : ''}${cleanLine(x.unitPrice, 40)}`, rateNote: qty && qty !== '1' ? `× ${qty}` : '', terms: x.description, ...(typeof x.check === 'string' ? { check: x.check } : {}) };
        }),
      });
    }
    if (rawBlocks.length > V2_LIMITS.blocks) notes.add(`Only the first ${V2_LIMITS.blocks} components of this section are kept.`);
    const blocks = rawBlocks
      .slice(0, V2_LIMITS.blocks)
      .map((b, i) => normalizeComponent(b, `c${n}x${i + 1}`))
      .filter((b): b is Component => {
        if (!b) problems.push(`section ${n} has a component of an unknown type`);
        return Boolean(b);
      });
    const sec: SectionV2 = {
      id: typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : `s${n}`,
      kind,
      eyebrow: fit(r.eyebrow, V2_LIMITS.section.eyebrow, false, 'Eyebrow', notes),
      heading: fit(r.heading, V2_LIMITS.section.heading, false, 'Heading', notes),
      lead: fit(r.lead, V2_LIMITS.section.lead, true, 'Lead', notes),
      newPage: kind !== 'content' ? true : bool(r.newPage, false),
      continuedNote: fit(r.continuedNote, V2_LIMITS.continuedNote, false, 'Continued note', notes),
      blocks,
    };
    const ck = notes.merge(cleanLine(r.check, V2_LIMITS.check) || undefined);
    if (ck) sec.check = ck;
    sections.push(sec);
  }
  const ra = isObj(raw.acceptance) ? raw.acceptance : {};
  const an = new Notes();
  const acceptance: ProposalDocV2['acceptance'] = {
    eyebrow: fit(ra.eyebrow, V2_LIMITS.acceptance.eyebrow, false, 'Acceptance eyebrow', an) || 'Acceptance',
    title: fit(ra.title, V2_LIMITS.acceptance.title, false, 'Acceptance title', an) || 'Let’s build it',
    lead: fit(ra.lead, V2_LIMITS.acceptance.lead, true, 'Acceptance line', an),
    confirmedLine: typeof ra.confirmedLine === 'string' ? ra.confirmedLine.slice(0, 2000) : '',
  };
  const ack = an.merge(cleanLine(ra.check, V2_LIMITS.check) || undefined);
  if (ack) acceptance.check = ack;
  const rcl = isObj(raw.closing) ? raw.closing : {};
  const closing = {
    label: cleanLine(rcl.label, V2_LIMITS.closing.label * 2).slice(0, V2_LIMITS.closing.label) || DEFAULT_CLOSING_LABEL,
    headline: cleanLine(rcl.headline, V2_LIMITS.closing.headline * 2).slice(0, V2_LIMITS.closing.headline) || BRAND_PROMISE,
  };
  const ro = isObj(raw.origin) ? raw.origin : {};
  const origin: ProposalDocV2['origin'] = {
    kind: ro.kind === 'pdf' ? 'pdf' : ro.kind === 'text' ? 'text' : ro.kind === 'upgrade' ? 'upgrade' : 'blank',
    fileName: cleanLine(ro.fileName, 180),
    pages: typeof ro.pages === 'number' && Number.isInteger(ro.pages) && ro.pages >= 0 && ro.pages <= 1000 ? ro.pages : 0,
  };
  // Unique ids (the editor keys on them).
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
    s.blocks.forEach((b, bi) => {
      b.id = uniq(b.id, `c${si + 1}x${bi + 1}`);
      if (b.type === 'price-table') b.rows.forEach((r, ri) => (r.id = uniq(r.id, `${b.id}r${ri + 1}`)));
    });
  });
  return { doc: { v: 2, settings, cover, coverChecks, sections, acceptance, closing, uatCleared: raw.uatCleared === true, origin }, problems };
}

export function serializeDocV2(doc: ProposalDocV2): string {
  return JSON.stringify(doc);
}

/** True for a stored value that holds a v2 document. */
export function isV2Value(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const o = JSON.parse(raw) as { v?: unknown };
    return o?.v === 2;
  } catch {
    return false;
  }
}

export function docOfValuesV2(values: Record<string, string> | undefined): ProposalDocV2 {
  const raw = values?.doc;
  return raw ? normalizeDocV2(raw).doc : emptyDocV2(DEFAULT_PROFILE, { blank: true });
}

// ------------------------------------------------------------------ the "Start blank" skeleton (COPY_SYSTEM §5)

const ownerFirst = (p: ProposalProfile) => (p.name.trim().split(/\s+/)[0] || 'Emil').replace(/[^\p{L}'-]/gu, '') || 'Emil';
const ownerShortTitle = (p: ProposalProfile) => p.title.replace(/,\s*Appointmentlyy\s*$/i, '').trim() || p.title;
export { ownerShortTitle };

/** A new document: the §5 outline with [placeholders] (or, with `blank`, the bare frame used as a fallback). */
export function emptyDocV2(profile: ProposalProfile = DEFAULT_PROFILE, opts: { blank?: boolean } = {}): ProposalDocV2 {
  const p = profile;
  const by = { name: p.name.slice(0, 40), title: p.title.slice(0, 70), credential: p.credential.slice(0, 40), url: p.url.slice(0, 40) };
  const proof = p.proofStats.filter((s) => s.value.trim() && s.label.trim()).slice(0, 3);
  const doc: ProposalDocV2 = {
    v: 2,
    settings: { pageSize: 'letter', docLabel: '', signable: true },
    cover: {
      docType: 'Partnership proposal',
      title: opts.blank ? 'Proposal' : 'Building [Client]’s [outcome]',
      lead: opts.blank ? '' : '[What it is], [how it runs]. [Target launch or go-live date].',
      date: '',
      clientCompany: opts.blank ? '' : '[Client]',
      stats: opts.blank ? [] : [{ value: '[Day 14]', label: '[Live under your brand]' }, { value: '[100%]', label: '[Your brand, data and margin]' }, { value: '[0]', label: '[What they no longer do]' }],
      highlight: opts.blank ? null : 2,
      preparedFor: { name: opts.blank ? '' : '[Contact name]', title: opts.blank ? '' : '[Title]', url: '' },
      preparedBy: by,
    },
    coverChecks: {},
    sections: [],
    acceptance: { eyebrow: 'Acceptance', title: 'Let’s build it', lead: opts.blank ? '' : 'Signing below approves [the plan or package] and releases [the first payment, exactly as in the terms].', confirmedLine: '' },
    closing: { label: DEFAULT_CLOSING_LABEL, headline: BRAND_PROMISE },
    uatCleared: false,
    origin: { kind: 'blank', fileName: '', pages: 0 },
  };
  if (opts.blank) {
    doc.sections = [emptySectionV2('content')];
    return doc;
  }
  const S = (kind: SectionKind, eyebrow: string, heading: string, lead: string, blocks: Component[], newPage = false): SectionV2 => ({ id: newId('s'), kind, eyebrow, heading, lead, newPage: kind !== 'content' || newPage, continuedNote: '', blocks });
  const C = <T extends Component>(c: T, patch: Partial<T>): T => ({ ...c, ...patch });
  const letter = C(newComponent('letter') as LetterC, { eyebrow: `A note from ${ownerFirst(p)}` });
  const glance = C(newComponent('section-header', 'sub') as SectionHeaderC, { eyebrow: '', title: 'Proposal at a glance', text: '', divider: 'thin', space: 'tight' });
  const cards = C(newComponent('stats', 'cards') as StatsC, {
    items: [
      { label: '[Commitment]', value: '[Day 14]', description: '[What is true by then]' },
      { label: '[Ownership]', value: '[100% yours]', description: '[What they keep]' },
      { label: '[Quality]', value: '[Figure]', description: '[The mechanism behind it]' },
      { label: '[Support]', value: '[Figure]', description: '[How]' },
    ],
    highlight: 0,
  });
  const offer = C(newComponent('card-grid', 'card') as CardGridC, {
    compact: true,
    items: [
      { ...emptyCard(), title: 'The offer', text: '[What we deliver, in one sentence, under the client’s brand.]' },
      { ...emptyCard(), title: 'What you keep', text: '[Brand, data, keys, margin: only what applies.]' },
    ],
  });
  const roadmap = newComponent('roadmap') as RoadmapC;
  const features = C(newComponent('card-grid', 'icon') as CardGridC, {
    items: [
      { ...emptyCard(), icon: 'target', title: 'Lead Finder', text: '[Target lists by title, industry, size and region]' },
      { ...emptyCard(), icon: 'phone', title: 'Dialer', text: '[Your scripts, qualifying questions and objections]' },
      { ...emptyCard(), icon: 'graduation-cap', title: 'Practice and certification', text: '[AI prospects that talk back, so reps ramp]' },
      { ...emptyCard(), icon: 'chart', title: 'Live floor and reports', text: '[Every rep and outcome, as it happens]' },
      { ...emptyCard(), icon: 'users', title: 'Unlimited users', text: 'No per-seat limits or markup' },
      { ...emptyCard(), icon: 'shield-check', title: 'Your brand', text: '[Your name, logo and colors on every screen]' },
    ],
  });
  const band = C(newComponent('dark-band', 'headline') as DarkBandC, {
    label: 'Architecture',
    headline: 'Bring your own keys',
    highlight: 'your own keys',
    text: 'You connect your own AI, voice and data providers and pay them directly, at cost, with no markup from us. **Each workspace’s data stays private to it.**',
  });
  const act1: Component[] = [features, band];
  if (proof.length === 3) act1.push(C(newComponent('stats', 'strip') as StatsC, { items: proof.map((x) => ({ value: x.value.slice(0, 10), label: x.label.slice(0, 36), description: '' })) }));
  act1.push(C(newComponent('card-grid', 'plain') as CardGridC, { items: [{ ...emptyCard(), title: '[Step]', text: '[Who does what, and what is true when it is done.]' }, { ...emptyCard(), title: 'UAT and sign-off', text: '[You test the platform (UAT) and sign off before go-live.]' }] }));
  const people = C(newComponent('card-grid', 'person') as CardGridC, { items: [{ ...emptyCard(), title: '[Role]', subtitle: '[Name or "Your single point of contact"]', text: '[What they own]' }, { ...emptyCard(), title: '[Role]', subtitle: '[Name or descriptor]', text: '[What they own]' }] });
  const first14 = C(newComponent('section-header', 'block') as SectionHeaderC, { title: 'The first 14 days', text: '' });
  const steps14 = C(newComponent('card-grid', 'plain-ruled') as CardGridC, { items: [{ ...emptyCard(), title: '[Step]', text: '[What happens]' }, { ...emptyCard(), title: '[Step]', text: '[What happens]' }] });
  const byDay = C(newComponent('dark-band', 'number') as DarkBandC, { label: 'By day', number: '14', text: '[What is live, under whose brand, with what visibility.]' });
  const priceIntro = newComponent('price-table', '3col') as PriceTableC;
  const reco = C(newComponent('callout', 'success') as CalloutC, { leadIn: 'Recommendation:', text: '[We recommend option. Reason 1. Reason 2.] Delete this if there is only one option.' });
  const kickoff = C(newComponent('card-grid', 'step') as CardGridC, {
    items: [
      { ...emptyCard(), title: '[Quick alignment call]', text: 'We confirm [open decisions].' },
      { ...emptyCard(), title: '[Approve the plan]', text: 'You [approve what] and release [**payment, as in terms**].' },
      { ...emptyCard(), title: '[UAT and go-live]', text: 'You test and approve the platform, release [**payment**], and we go live [date].' },
    ],
  });
  const termsHead = C(newComponent('section-header', 'block') as SectionHeaderC, { title: 'Terms & assumptions', text: '[One line on what the fees cover.]' });
  const lists = C(newComponent('card-grid', 'list') as CardGridC, {
    items: [
      { ...emptyCard(), title: 'Included in Appointmentlyy fees', bullets: ['[Item]', '[Item]', '[Item]'] },
      { ...emptyCard(), title: 'Provided by [Client]', bullets: ['API keys and subscriptions for AI, voice and data (BYOK)', '[Item]', '[Item]'] },
    ],
  });
  const confirm = C(newComponent('checklist') as ChecklistC, { items: ['[Open decision]', '[Open decision]', '[Open decision]'] });
  const terms = C(newComponent('text', 'bullets') as TextC, {
    items: ['[Setup fee: payment schedule]', '[Monthly fee: start and term]', '[Contract term and notice]', 'UAT sign-off before go-live: [how you test and approve]', '[Proposal valid for N days]', 'Your data: each workspace is private'],
  });
  doc.sections = [
    S('content', '', '', '', [letter, glance, cards, offer]),
    S('content', 'The [N]-day roadmap', '[Built in month], live in [month], [outcome] in [quarter]', '', [roadmap], true),
    S('content', 'Act 1 · [When]', '[Building the machine before (the cost or risk) starts]', '[The usual failure]. [How we avoid it].', act1, true),
    S('content', 'Act 2 · [When]', '[Flipping the switch]', '[What launches, and what the client won’t have to manage].', [people, first14, steps14, byDay], true),
    S('pricing', 'Investment', 'Built to be a true win-win', 'You keep [what they keep], while [how our side only grows as they do].', [priceIntro, reco]),
    S('terms', 'Next steps', 'How we kick off this week', '', [kickoff, termsHead, lists, confirm, terms]),
  ];
  return doc;
}

// ------------------------------------------------------------------ v1 -> v2 ("Upgrade to new design")

/** One-way: a v1 document rebuilt as v2 (text, tables and prices carried over; the owner reviews it). */
export function upgradeV1(d: ProposalDocV1, profile: ProposalProfile = DEFAULT_PROFILE): ProposalDocV2 {
  const sections = d.sections.map((s) => {
    const blocks: unknown[] = s.blocks.map((b) => ({ ...b }));
    if (s.kind === 'pricing' && s.rows.length) {
      const cur = s.currency || 'USD';
      blocks.push({
        type: 'price-table',
        variant: '3col',
        headers: ['Item', `Rate (${cur})`, 'Details'],
        showTotal: false,
        rows: s.rows.map((r) => {
          const q = parseQty(r.qty);
          const n = parseAmount(r.unitPrice);
          return { item: r.item, rate: n === null ? r.unitPrice : `${r.currency && r.currency !== cur ? `${r.currency} ` : ''}${r.unitPrice.replace(/^[A-Za-z]{3}\s*/, '')}`, rateNote: q !== null && q > 1 ? `× ${q}` : '', terms: r.description, ...(r.check ? { check: r.check } : {}) };
        }),
      });
    }
    return { kind: s.kind, eyebrow: s.kind === 'pricing' ? 'Investment' : s.kind === 'terms' ? 'Terms' : '', heading: s.heading, lead: '', blocks, ...(s.check ? { check: s.check } : {}) };
  });
  const { doc } = normalizeDocV2({
    v: 2,
    settings: { pageSize: 'a4', signable: true },
    cover: {
      docType: 'Proposal',
      title: d.cover.title,
      lead: d.cover.subtitle,
      date: d.cover.date,
      clientCompany: d.cover.clientCompany,
      stats: [],
      preparedFor: { name: d.cover.contactName, title: d.cover.contactTitle, url: '' },
      // The sign-off always comes from the Proposal sign-off settings, as on new v2 drafts (PV2-L3).
      preparedBy: { name: profile.name, title: profile.title, credential: profile.credential, url: profile.url },
    },
    coverChecks: Object.fromEntries(
      Object.entries(d.coverChecks).map(([k, v]) => [k === 'subtitle' ? 'lead' : k === 'contactName' || k === 'contactTitle' ? 'preparedFor' : k, v]),
    ),
    sections,
    acceptance: { eyebrow: 'Acceptance', title: 'Let’s build it', lead: '', check: 'Write what signing commits the client to.' },
    origin: { kind: 'upgrade', fileName: d.origin.fileName, pages: d.origin.pages },
  });
  return doc;
}

// ------------------------------------------------------------------ checks

export type CheckKind = 'note' | 'acceptance' | 'uat' | 'placeholder';
export interface OpenCheckV2 {
  where: string;
  note: string;
  kind: CheckKind;
  /** What it belongs to (for the editor's jump links): 'cover:<field>', 'section:<id>', 'comp:<id>', 'row:<id>', 'acceptance', 'uat'. */
  ref: string;
}

const PLACEHOLDER_RE = /\[[^\]\n]{1,80}\]/;

/** Every text value of a component, joined (for placeholder and wording checks). */
export function textsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) textsOf(x, out);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'id' && k !== 'check' && k !== 'type' && k !== 'variant' && k !== 'space' && k !== 'icon' && k !== 'tone' && k !== 'kind' && k !== 'divider' && k !== 'size') textsOf(x, out);
  return out;
}
function compText(c: Component): string {
  return textsOf(c).join(' ');
}

export const sectionName = (s: SectionV2, i: number) => stripMarkers(s.heading || s.eyebrow || (s.kind === 'pricing' ? 'Pricing' : s.kind === 'terms' ? 'Terms' : `Section ${i + 1}`));

/** UAT or sign-off wording in the terms, gates or acceptance line. */
export function hasUatTerms(doc: ProposalDocV2): boolean {
  const re = /\bUAT\b|user acceptance|sign[- ]?off|signs? off/i;
  if (re.test(doc.acceptance.lead)) return true;
  for (const s of doc.sections) {
    for (const c of s.blocks) {
      if (c.type === 'roadmap' && c.phases.some((p) => re.test(`${p.gateTitle} ${p.gateSub}`))) return true;
      if ((s.kind === 'terms' || s.kind === 'pricing') && re.test(compText(c))) return true;
    }
  }
  return false;
}

/** The acceptance line needs the owner's own confirmation (and again after any edit). */
export const acceptancePending = (doc: ProposalDocV2) => doc.settings.signable && doc.acceptance.confirmedLine !== doc.acceptance.lead;

/** Every open check, in reading order. */
export function openChecksV2(doc: ProposalDocV2): OpenCheckV2[] {
  const out: OpenCheckV2[] = [];
  const COVER_LABEL: Record<CoverField, string> = { docType: 'Document label', title: 'Title', lead: 'Lead', date: 'Date', clientCompany: 'Client company', stats: 'Stats', preparedFor: 'Prepared for', preparedBy: 'Prepared by' };
  for (const [k, v] of Object.entries(doc.coverChecks)) if (v) out.push({ where: `Cover: ${COVER_LABEL[k as CoverField] ?? k}`, note: v, kind: 'note', ref: `cover:${k}` });
  const coverText = textsOf(doc.cover).join(' ');
  if (PLACEHOLDER_RE.test(coverText)) out.push({ where: 'Cover', note: 'Fill in the [placeholders].', kind: 'placeholder', ref: 'cover:title' });
  doc.sections.forEach((s, i) => {
    const name = `${i + 1}. ${sectionName(s, i)}`;
    if (s.check) out.push({ where: name, note: s.check, kind: 'note', ref: `section:${s.id}` });
    if (PLACEHOLDER_RE.test(`${s.eyebrow} ${s.heading} ${s.lead} ${s.continuedNote}`)) out.push({ where: name, note: 'Fill in the [placeholders].', kind: 'placeholder', ref: `section:${s.id}` });
    s.blocks.forEach((c) => {
      const w = `${name}: ${COMPONENT_LABEL[c.type]}`;
      if (c.check) out.push({ where: w, note: c.check, kind: 'note', ref: `comp:${c.id}` });
      if (c.type === 'price-table') c.rows.forEach((r) => r.check && out.push({ where: `${w}: ${stripMarkers(r.item) || 'row'}`, note: r.check, kind: 'note', ref: `row:${r.id}` }));
      if (PLACEHOLDER_RE.test(compText(c))) out.push({ where: w, note: 'Fill in the [placeholders].', kind: 'placeholder', ref: `comp:${c.id}` });
    });
  });
  if (doc.settings.signable) {
    if (doc.acceptance.check) out.push({ where: 'Acceptance', note: doc.acceptance.check, kind: 'note', ref: 'acceptance' });
    if (PLACEHOLDER_RE.test(`${doc.acceptance.title} ${doc.acceptance.lead}`)) out.push({ where: 'Acceptance', note: 'Fill in the [placeholders].', kind: 'placeholder', ref: 'acceptance' });
    if (acceptancePending(doc)) out.push({ where: 'Acceptance line', note: ACCEPTANCE_CHECK, kind: 'acceptance', ref: 'acceptance' });
    if (!doc.uatCleared && !hasUatTerms(doc)) out.push({ where: 'Terms', note: UAT_CHECK, kind: 'uat', ref: 'uat' });
  }
  return out;
}

/** "Mark all as checked": every stored note. Never the acceptance line, the UAT check or placeholders. */
export function clearAllChecksV2(doc: ProposalDocV2): ProposalDocV2 {
  return {
    ...doc,
    coverChecks: {},
    sections: doc.sections.map((s) => ({
      ...s,
      check: undefined,
      blocks: s.blocks.map((c) => {
        const x = { ...c, check: undefined } as Component;
        if (x.type === 'price-table') x.rows = x.rows.map((r) => ({ ...r, check: undefined }));
        return x;
      }),
    })),
    acceptance: { ...doc.acceptance, check: undefined },
  };
}

/** Why this document cannot be sent yet, or null. */
export function docProblemV2(doc: ProposalDocV2): string | null {
  if (!doc.cover.title.trim()) return 'Give the proposal a title (Cover).';
  if (!doc.cover.clientCompany.trim()) return 'Enter the client company (Cover).';
  if (!doc.sections.length) return 'Add at least one section.';
  if (doc.settings.signable && !doc.acceptance.lead.trim()) return 'Write the acceptance line: what signing commits the client to (Acceptance).';
  if (doc.settings.signable && !doc.cover.preparedFor.name.trim()) return 'Enter the client’s signatory name (Cover, Prepared for): it is printed on the signature card.';
  const checks = openChecksV2(doc);
  const acc = checks.find((c) => c.kind === 'acceptance');
  if (acc) return 'Confirm the acceptance line (Acceptance): signing is binding.';
  const uat = checks.find((c) => c.kind === 'uat');
  if (uat) return UAT_CHECK;
  const n = checks.length;
  if (n) return `${n} ${n === 1 ? 'item is' : 'items are'} marked “Check”. Review ${n === 1 ? 'it' : 'them'} in the editor and mark ${n === 1 ? 'it' : 'them'} as checked before sending.`;
  return null;
}

/** "Proposal: Appointmentlyy x Acme" style title. */
export function docTitleV2(doc: ProposalDocV2): string {
  const t = stripMarkers(doc.cover.title.trim()) || 'Proposal';
  const c = doc.cover.clientCompany.trim();
  return c && !t.toLowerCase().includes(c.toLowerCase()) ? `${t}: Appointmentlyy x ${c}` : t;
}

/** The running header's right label: the document label, else the title cut at a word, else "Partnership proposal". */
export function docLabelOf(doc: ProposalDocV2): string {
  if (doc.settings.docLabel.trim()) return doc.settings.docLabel.trim();
  const t = stripMarkers(doc.cover.title.trim());
  if (!t) return 'Partnership proposal';
  if (t.length <= V2_LIMITS.docLabel) return t;
  const cut = t.slice(0, V2_LIMITS.docLabel);
  const sp = cut.lastIndexOf(' ');
  return (sp > 12 ? cut.slice(0, sp) : cut).replace(/[\s,:;·-]+$/, '');
}

/**
 * Labels per PDF bookmark after the cover, in order: one per section ('pricing' / 'terms' / null), then null for
 * the Acceptance page when the proposal is signable.
 */
export function watchLabelsV2(doc: ProposalDocV2): (string | null)[] {
  const out: (string | null)[] = doc.sections.map((s) => (s.kind === 'pricing' ? 'pricing' : s.kind === 'terms' ? 'terms' : null));
  if (doc.settings.signable) out.push(null);
  return out;
}

/** The profile from Agreements settings values (anything missing falls back to the defaults). */
export function profileOf(s: { proposalSenderName?: string; proposalSenderTitle?: string; proposalCredential?: string; proposalUrl?: string; proposalProofStats?: { value: string; label: string }[] } | null | undefined): ProposalProfile {
  return {
    name: s?.proposalSenderName?.trim() || DEFAULT_PROFILE.name,
    title: s?.proposalSenderTitle?.trim() || DEFAULT_PROFILE.title,
    credential: s?.proposalCredential?.trim() ?? '',
    url: s?.proposalUrl?.trim() || DEFAULT_PROFILE.url,
    proofStats: Array.isArray(s?.proposalProofStats) ? s!.proposalProofStats!.filter((x) => x && typeof x.value === 'string' && typeof x.label === 'string').slice(0, 3) : [],
  };
}
