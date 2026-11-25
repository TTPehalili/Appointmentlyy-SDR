/**
 * Client Intake: the typed form-schema engine and the request model. Browser-safe (no server imports): the ONE schema
 * drives the client's form, the owner's preview and the server's validator (validateAnswers), so what the client is
 * asked, what the owner sees and what the server accepts can never drift apart.
 *
 * A card can carry a request. Its kind says how the client completes it:
 *   form       fill in a form (+ uploads), the owner accepts or asks for changes
 *   dns        add the DNS records shown, then "Check DNS" (the platform verifies)
 *   keys       enter the keys in the client's OWN workspace; the board only ever sees "test passed"
 *   signature  sign / confirm the linked Agreements envelope
 *   payment    view the billing statement, "I've paid"; only the owner records the payment
 *   uat        run UAT; complete when the UAT certificate is signed
 * Any kind may also carry a form part (e.g. company details on the "Sign the agreement" card).
 */
import { CP_LIMITS, isDate, type TaskStatus } from '@/lib/clientProjects/types';

// ------------------------------------------------------------------ field types

export const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'url', 'select', 'multiselect', 'date', 'color', 'table', 'file', 'confirm'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const COLUMN_TYPES = ['text', 'email', 'phone', 'select', 'date'] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** The upload allow-list. SVG is for logos only (a field must name it in `accept`). */
export const FILE_KINDS = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'svg'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
};
export const FILE_KIND_LABEL: Record<FileKind, string> = { pdf: 'PDF', docx: 'Word (DOCX)', xlsx: 'Excel (XLSX)', csv: 'CSV', txt: 'Text', png: 'PNG', jpg: 'JPG', svg: 'SVG' };
export const kindOfMime = (mime: string): FileKind | null => (Object.entries(FILE_KIND_MIME).find(([, m]) => m === mime)?.[0] as FileKind | undefined) ?? null;

export const INTAKE_LIMITS = {
  // 9 MB: under the proxy's default 10 MB body buffer (security review L2), and the same cap as the planner PDFs.
  fileBytes: 9 * 1024 * 1024,
  filesPerRequest: 20,
  projectFiles: 400,
  projectBytes: 300 * 1024 * 1024,
  submissionsPerDay: 40,
  uploadsPerDay: 200,
  checksPerDay: 120,
  fields: 40,
  options: 40,
  columns: 8,
  tableRows: 300,
  text: 300,
  textarea: 4000,
  csvRows: 1000,
  csvCols: 40,
  csvCell: 500,
  label: 120,
  help: 400,
  note: 2000,
  records: 12,
  answersBytes: 200 * 1024,
} as const;

export interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
  required?: boolean;
  options?: string[];
}

export interface IntakeField {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  required?: boolean;
  /** select / multiselect, and table columns of type select. */
  options?: string[];
  /** text / textarea: max length. table: max rows. file: max files. */
  max?: number;
  /** table only. */
  columns?: TableColumn[];
  /** table only: the client may import rows from a CSV file (validated on the server, nothing created until accepted). */
  csv?: boolean;
  /** table only: a column whose values must be unique (e.g. email). */
  unique?: string;
  /** file only: allowed kinds (default pdf, docx, xlsx, csv, txt, png, jpg; svg only when named). */
  accept?: FileKind[];
  /** color only: show the live workspace-header preview. */
  preview?: 'brand';
  /** The step this field belongs to (fields are grouped into steps by this title, in order). */
  step?: string;
}

export interface IntakeSchema {
  title: string;
  intro?: string;
  fields: IntakeField[];
}

export type TableRow = Record<string, string>;
export type AnswerValue = string | string[] | boolean | TableRow[];
export type Answers = Record<string, AnswerValue>;

/** A file in a request's working set or a submission (a cp_files row; the bytes stay on the server). */
export interface IntakeFileRef {
  id: string;
  name: string;
  size: number;
  mime: string;
  sha256: string;
  /** The field it was uploaded for ('' = the payment receipt). */
  field: string;
  /** SVG only: the hash of the bytes as uploaded (the stored file is the sanitised version). */
  originalSha256?: string;
  at: string;
}

// ------------------------------------------------------------------ request model

export const REQUEST_KINDS = ['form', 'dns', 'keys', 'signature', 'payment', 'uat'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const KIND_LABEL: Record<RequestKind, string> = { form: 'Information', dns: 'System-verified (DNS)', keys: 'System-verified (keys)', signature: 'Signature', payment: 'Payment', uat: 'Testing' };

export const FORM_STATUSES = ['open', 'draft', 'submitted', 'changes_requested', 'accepted'] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];
export const SYS_STATUSES = ['open', 'partial', 'verified', 'sent', 'signed', 'concern', 'completed', 'deemed', 'awaiting', 'client_says_paid', 'received', 'running'] as const;
export type SysStatus = (typeof SYS_STATUSES)[number];

export const UNIFIED = ['not_started', 'in_progress', 'waiting_on_us', 'complete'] as const;
export type UnifiedStatus = (typeof UNIFIED)[number];
export const UNIFIED_LABEL: Record<UnifiedStatus, string> = { not_started: 'Not started', in_progress: 'In progress', waiting_on_us: 'Waiting on us', complete: 'Complete' };
/** The kanban column a client item sits in, from its unified status. */
export const COLUMN_FOR: Record<UnifiedStatus, TaskStatus> = { not_started: 'todo', in_progress: 'in_progress', waiting_on_us: 'in_progress', complete: 'done' };

const FORM_U: Record<FormStatus, UnifiedStatus> = { open: 'not_started', draft: 'in_progress', changes_requested: 'in_progress', submitted: 'waiting_on_us', accepted: 'complete' };
const SYS_U: Record<SysStatus, UnifiedStatus> = {
  open: 'not_started',
  awaiting: 'not_started',
  sent: 'not_started',
  partial: 'in_progress',
  running: 'in_progress',
  signed: 'waiting_on_us',
  concern: 'waiting_on_us',
  client_says_paid: 'waiting_on_us',
  verified: 'complete',
  completed: 'complete',
  deemed: 'complete',
  received: 'complete',
};

/** One status for a card from its form part and its system part: complete only when every part is. */
export function unifiedOf(r: { formStatus: FormStatus | null; sysStatus: SysStatus | null }): UnifiedStatus {
  const parts = [r.formStatus ? FORM_U[r.formStatus] : null, r.sysStatus ? SYS_U[r.sysStatus] : null].filter((x): x is UnifiedStatus => Boolean(x));
  if (!parts.length) return 'not_started';
  if (parts.every((x) => x === 'complete')) return 'complete';
  if (parts.includes('waiting_on_us')) return 'waiting_on_us';
  if (parts.some((x) => x !== 'not_started')) return 'in_progress';
  return 'not_started';
}

export type PaymentMethod = 'bank' | 'paypal' | 'wise' | 'other';
export const PAYMENT_METHODS: PaymentMethod[] = ['bank', 'paypal', 'wise', 'other'];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { bank: 'Bank transfer', paypal: 'PayPal', wise: 'Wise', other: 'Other' };

export interface DnsRecord {
  type: 'TXT' | 'CNAME' | 'MX';
  /** Fully qualified host name. */
  name: string;
  value: string;
  /** Why the record is there (shown to the client). */
  purpose: string;
}

export interface RequestConfig {
  /** signature / payment: the linked Agreements envelope. */
  envelopeId?: string | null;
  /** How it was linked: by the owner, or automatically by template and client name. */
  envelopeLinkedBy?: 'owner' | 'auto' | null;
  /** signature / payment: the template auto-linking looks for. */
  templateId?: string;
  /** signature / payment: the 1st or 2nd envelope of that template (Delivery Report #1 / #2, payment 1 / 2). */
  ordinal?: number;
  /** dns: the client's sending domain and any extra records the owner added (e.g. from the email provider). */
  domain?: string;
  extraRecords?: DnsRecord[];
  /** keys: the providers that must pass ("ai" = any one of Claude, OpenAI or Gemini). */
  providers?: string[];
  /** uat: the card whose completion completes this one (the UAT certificate). */
  followsSopKey?: string;
}

export interface PaymentState {
  claimedBy?: string;
  claimedAt?: string;
  receiptFileId?: string | null;
  received?: { amount: number; date: string; method: PaymentMethod; reference: string; by: string; at: string; via: 'card' | 'agreements' };
  /** "Not received / follow up": the owner's note, shown on the client board. */
  followUpNote?: string;
  followUpAt?: string;
}

export interface RequestState {
  /** The owner's note when changes were requested (shown to the client). */
  ownerNote?: string;
  ownerNoteAt?: string;
  dns?: { checkedAt: string; results: { type: string; name: string; ok: boolean }[] };
  keys?: { checkedAt: string; providers: { provider: string; ok: boolean; at: string | null }[] };
  envelope?: { status: string; title: string; outcome?: string | null; signedAt?: string | null; completedAt?: string | null; sentAt?: string | null; deemedOn?: string | null; paid?: boolean };
  payment?: PaymentState;
  /** How the card was completed (for the record). */
  completedVia?: string;
  completedAt?: string;
}

export interface CpRequest {
  id: string;
  projectId: string;
  taskId: string;
  kind: RequestKind;
  templateKey: string;
  schema: IntakeSchema | null;
  formStatus: FormStatus | null;
  sysStatus: SysStatus | null;
  draft: Answers;
  draftAt: string | null;
  draftBy: string;
  files: IntakeFileRef[];
  config: RequestConfig;
  state: RequestState;
  /** The latest submitted version (0 = none yet). */
  version: number;
  rev: number;
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus = 'submitted' | 'accepted' | 'changes_requested' | 'superseded';
export interface ApplyResult {
  target: 'branding' | 'invites' | 'testers' | 'company' | 'questionnaire' | 'scripts';
  ok: boolean;
  /** True when the data is stored and shown on Client data only (no platform target). */
  dataOnly?: boolean;
  detail: string;
  at: string;
  rows?: { label: string; ok: boolean; note: string }[];
}
export interface CpSubmission {
  id: string;
  projectId: string;
  requestId: string;
  taskId: string;
  version: number;
  answers: Answers;
  files: IntakeFileRef[];
  /** 'client:<name>', self-identified via the shared link. */
  actor: string;
  submittedAt: string;
  status: SubmissionStatus;
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  applied: ApplyResult[];
}

// ------------------------------------------------------------------ templates (content: the SOP's intake forms)

const ROLES = ['Rep', 'Supervisor', 'Manager', 'Admin'];
const DOCS: FileKind[] = ['pdf', 'docx', 'txt'];

export const FORM_TEMPLATES: Record<string, IntakeSchema> = {
  company: {
    title: 'Company details',
    intro: 'Your registered details, as they should appear on the agreement and on billing statements.',
    fields: [
      { key: 'legalName', label: 'Registered company name', type: 'text', required: true, max: 160, step: 'Company' },
      { key: 'secNo', label: 'SEC or registration number', type: 'text', required: true, max: 60, step: 'Company' },
      { key: 'tin', label: 'Tax identification number (TIN)', type: 'text', max: 40, step: 'Company' },
      { key: 'address', label: 'Registered address', type: 'textarea', required: true, max: 400, step: 'Company' },
      { key: 'website', label: 'Website', type: 'url', step: 'Company' },
      { key: 'signatoryName', label: 'Signatory name', type: 'text', required: true, max: 80, step: 'Signatory and billing' },
      { key: 'signatoryTitle', label: 'Signatory title', type: 'text', required: true, max: 80, step: 'Signatory and billing' },
      { key: 'billingEmail', label: 'Billing email', type: 'email', required: true, step: 'Signatory and billing' },
      { key: 'phone', label: 'Phone', type: 'phone', step: 'Signatory and billing' },
      { key: 'authority', label: 'Proof of the signatory’s authority', type: 'file', accept: ['pdf', 'png', 'jpg'], max: 3, help: 'A secretary’s certificate or board resolution (PDF, PNG or JPG).', step: 'Signatory and billing' },
    ],
  },
  questionnaire: {
    title: 'Onboarding questionnaire',
    intro: 'Your services, ideal customers and current sales process. It shapes your playbook and AI practice prospects.',
    fields: [
      { key: 'serviceLines', label: 'Service lines you sell', type: 'textarea', required: true, max: 2000, help: 'One per line.', step: 'What you sell' },
      { key: 'dealSize', label: 'Typical deal size', type: 'select', required: true, options: ['Under $5k', '$5k to $25k', '$25k to $100k', 'Over $100k'], step: 'What you sell' },
      { key: 'markets', label: 'Target markets', type: 'multiselect', required: true, options: ['US', 'Canada', 'UK', 'Australia', 'New Zealand', 'Philippines', 'Singapore', 'EU', 'Other'], step: 'Who you sell to' },
      { key: 'icp', label: 'Ideal customer profile', type: 'textarea', required: true, max: 3000, help: 'Industries, company size, the signals that make a good prospect.', step: 'Who you sell to' },
      { key: 'decisionMakers', label: 'Decision-makers you sell to', type: 'textarea', max: 1500, help: 'Titles and who signs.', step: 'Who you sell to' },
      { key: 'tools', label: 'Tools you use today', type: 'text', max: 300, help: 'CRM, dialer, email tools.', step: 'How you sell today' },
      { key: 'startDate', label: 'When your team can start using the platform', type: 'date', step: 'How you sell today' },
    ],
  },
  brand: {
    title: 'Logo and brand colours',
    intro: 'Your logo and colours for your workspace. The preview shows how the header will look.',
    fields: [
      { key: 'logo', label: 'Logo', type: 'file', required: true, accept: ['png', 'jpg', 'svg'], max: 2, help: 'SVG or PNG works best. SVG files are cleaned before use.' },
      { key: 'primary', label: 'Primary colour', type: 'color', required: true, preview: 'brand' },
      { key: 'secondary', label: 'Secondary colour', type: 'color', preview: 'brand' },
      { key: 'displayName', label: 'Name shown in the workspace', type: 'text', max: 60, help: 'Leave empty to use your company name.' },
    ],
  },
  users: {
    title: 'User list with roles',
    intro: 'Everyone who needs an account. Nothing is created until we have checked the list with you.',
    fields: [
      {
        key: 'users',
        label: 'Users',
        type: 'table',
        required: true,
        csv: true,
        unique: 'email',
        max: 300,
        help: 'Add rows, or import a CSV with the columns name, email, role.',
        columns: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'role', label: 'Role', type: 'select', required: true, options: ROLES },
        ],
      },
      { key: 'confirm', label: 'Everyone on this list may have an account in your workspace', type: 'confirm', required: true },
    ],
  },
  'uat-team': {
    title: 'UAT lead and testers',
    intro: 'Who leads acceptance testing, who tests, and when they are available.',
    fields: [
      {
        key: 'testers',
        label: 'UAT team',
        type: 'table',
        required: true,
        unique: 'email',
        max: 30,
        columns: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'role', label: 'Role', type: 'select', required: true, options: ['UAT lead', 'Tester'] },
          { key: 'from', label: 'Available from', type: 'date' },
          { key: 'to', label: 'Available to', type: 'date' },
        ],
      },
    ],
  },
  scripts: {
    title: 'Current scripts and service notes',
    intro: 'Any call scripts, email templates and service descriptions you use today. They feed your custom playbook.',
    fields: [
      { key: 'files', label: 'Scripts and notes', type: 'file', required: true, accept: DOCS, max: 15, help: 'PDF, Word (DOCX) or text files.' },
      { key: 'notes', label: 'Anything we should know', type: 'textarea', max: 3000 },
    ],
  },
};

/**
 * True when two agreement template ids are versions of the same template ("proposal-growth-v1" and
 * "proposal-growth-v2"), so a card set up for one version also finds envelopes made from a newer one.
 */
export function sameTemplateFamily(a: string, b: string): boolean {
  const fam = (id: string) => id.replace(/-v\d+$/, '');
  return a === b || fam(a) === fam(b);
}

/** What each SOP client item becomes (content, not code: a new SOP card only needs a row here). */
export interface SopIntake {
  kind: RequestKind;
  form?: keyof typeof FORM_TEMPLATES;
  config?: RequestConfig;
}
export const SOP_INTAKE: Record<string, SopIntake> = {
  countersign: { kind: 'signature', form: 'company', config: { templateId: 'proposal-growth-v1', ordinal: 1 } },
  'first-payment': { kind: 'payment', config: { templateId: 'billing-statement-v1', ordinal: 1 } },
  'uat-team': { kind: 'form', form: 'uat-team' },
  'dns-access': { kind: 'dns' },
  questionnaire: { kind: 'form', form: 'questionnaire' },
  'brand-assets': { kind: 'form', form: 'brand' },
  'provider-keys': { kind: 'keys', config: { providers: ['ai', 'elevenlabs', 'resend'] } },
  'user-list': { kind: 'form', form: 'users' },
  scripts: { kind: 'form', form: 'scripts' },
  'report-1-confirm': { kind: 'signature', config: { templateId: 'delivery-report-v1', ordinal: 1 } },
  'report-2-confirm': { kind: 'signature', config: { templateId: 'delivery-report-v1', ordinal: 2 } },
  'uat-run': { kind: 'uat', config: { followsSopKey: 'uat-signoff' } },
  'uat-signoff': { kind: 'signature', config: { templateId: 'uat-certificate-v1', ordinal: 1 } },
  'second-payment': { kind: 'payment', config: { templateId: 'billing-statement-v1', ordinal: 2 } },
};

export const PROVIDER_LABEL: Record<string, string> = { ai: 'AI (Claude, OpenAI or Gemini)', claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini', elevenlabs: 'ElevenLabs (voice)', resend: 'Resend (email sending)' };
export const KEY_PROVIDERS = ['ai', 'claude', 'openai', 'gemini', 'elevenlabs', 'resend'] as const;

// ------------------------------------------------------------------ schema checks (owner-defined custom forms)

const KEY_RE = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const clean1 = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

/** A schema from owner input (a custom request), cleaned field by field. Throws an Error with a plain message. */
export function cleanSchema(raw: unknown): IntakeSchema {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const title = clean1(r.title, INTAKE_LIMITS.label);
  if (!title) throw new Error('Give the form a title.');
  if (!Array.isArray(r.fields) || !r.fields.length) throw new Error('Add at least one field.');
  if (r.fields.length > INTAKE_LIMITS.fields) throw new Error(`A form has at most ${INTAKE_LIMITS.fields} fields.`);
  const seen = new Set<string>();
  const fields: IntakeField[] = r.fields.map((x, i) => {
    const f = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    const type = (FIELD_TYPES as readonly unknown[]).includes(f.type) ? (f.type as FieldType) : null;
    if (!type) throw new Error(`Field ${i + 1}: pick a field type.`);
    const label = clean1(f.label, INTAKE_LIMITS.label);
    if (!label) throw new Error(`Field ${i + 1}: give it a label.`);
    let key = typeof f.key === 'string' && KEY_RE.test(f.key) ? f.key : `f${i + 1}`;
    while (seen.has(key)) key = `${key}_${i}`;
    seen.add(key);
    const out: IntakeField = { key, label, type, required: f.required === true };
    const help = clean1(f.help, INTAKE_LIMITS.help);
    if (help) out.help = help;
    const step = clean1(f.step, 60);
    if (step) out.step = step;
    if (type === 'select' || type === 'multiselect') {
      const opts = Array.isArray(f.options) ? [...new Set(f.options.map((o) => clean1(o, 80)).filter(Boolean))].slice(0, INTAKE_LIMITS.options) : [];
      if (opts.length < 1) throw new Error(`“${label}”: add the options.`);
      out.options = opts;
    }
    if (type === 'text' || type === 'textarea' || type === 'table' || type === 'file') {
      const cap = type === 'text' ? INTAKE_LIMITS.text : type === 'textarea' ? INTAKE_LIMITS.textarea : type === 'table' ? INTAKE_LIMITS.tableRows : INTAKE_LIMITS.filesPerRequest;
      if (typeof f.max === 'number' && Number.isInteger(f.max) && f.max > 0) out.max = Math.min(f.max, cap);
    }
    if (type === 'table') {
      const cols = Array.isArray(f.columns) ? f.columns.slice(0, INTAKE_LIMITS.columns) : [];
      if (!cols.length) throw new Error(`“${label}”: add the table’s columns.`);
      const ck = new Set<string>();
      out.columns = cols.map((c, j) => {
        const cr = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
        const ctype = (COLUMN_TYPES as readonly unknown[]).includes(cr.type) ? (cr.type as ColumnType) : 'text';
        let ckey = typeof cr.key === 'string' && KEY_RE.test(cr.key) ? cr.key : `c${j + 1}`;
        while (ck.has(ckey)) ckey = `${ckey}_${j}`;
        ck.add(ckey);
        const col: TableColumn = { key: ckey, label: clean1(cr.label, 60) || `Column ${j + 1}`, type: ctype, required: cr.required === true };
        if (ctype === 'select') {
          const opts = Array.isArray(cr.options) ? [...new Set(cr.options.map((o) => clean1(o, 60)).filter(Boolean))].slice(0, INTAKE_LIMITS.options) : [];
          if (!opts.length) throw new Error(`“${label}”: add options for the column “${col.label}”.`);
          col.options = opts;
        }
        return col;
      });
      if (f.csv === true) out.csv = true;
      if (typeof f.unique === 'string' && out.columns.some((c) => c.key === f.unique)) out.unique = f.unique;
    }
    if (type === 'file') {
      const acc = Array.isArray(f.accept) ? f.accept.filter((k): k is FileKind => (FILE_KINDS as readonly unknown[]).includes(k)) : [];
      out.accept = acc.length ? [...new Set(acc)] : ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'png', 'jpg'];
    }
    if (type === 'color' && f.preview === 'brand') out.preview = 'brand';
    return out;
  });
  const intro = clean1(r.intro, 600);
  return { title, ...(intro ? { intro } : {}), fields };
}

// ------------------------------------------------------------------ the validator (client and server share it)

export const EMAIL_RE_INTAKE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const PHONE_RE = /^\+?[0-9][0-9 ().-]{5,24}$/;
export const URL_RE = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s<>"']*)?$/i;
export const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const cleanText = (v: unknown, max: number, multi = false): string =>
  typeof v === 'string'
    ? (multi
        ? v
            .replace(/\r\n?/g, '\n')
            .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, ' ')
            .replace(/\n{4,}/g, '\n\n\n')
        : v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ')
      )
        .trim()
        .slice(0, max)
    : '';

export const defaultAccept: FileKind[] = ['pdf', 'docx', 'xlsx', 'csv', 'txt', 'png', 'jpg'];
export const acceptOf = (f: IntakeField): FileKind[] => (f.accept?.length ? f.accept : defaultAccept);
const colOk = (c: TableColumn, v: string): string | null => {
  if (!v) return c.required ? `${c.label} is required` : null;
  if (c.type === 'email' && !EMAIL_RE_INTAKE.test(v)) return `${c.label}: not a valid email`;
  if (c.type === 'phone' && !PHONE_RE.test(v)) return `${c.label}: not a valid phone number`;
  if (c.type === 'date' && !isDate(v)) return `${c.label}: use a date`;
  if (c.type === 'select' && !(c.options ?? []).includes(v)) return `${c.label}: pick one of ${(c.options ?? []).join(', ')}`;
  return null;
};

export interface ValidationResult {
  ok: boolean;
  value: Answers;
  /** Per field key (table cells as `key.row.col`): a plain message. */
  errors: Record<string, string>;
}

/**
 * Clean and check answers against a schema. `mode` 'draft' skips the required checks (a draft may be partial) but
 * still refuses values of the wrong shape. `files` is the request's working set (file fields hold file ids from it).
 * Unknown keys are dropped. Never throws.
 */
export function validateAnswers(schema: IntakeSchema, raw: unknown, files: Pick<IntakeFileRef, 'id' | 'field' | 'mime'>[], mode: 'draft' | 'submit'): ValidationResult {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const value: Answers = {};
  const errors: Record<string, string> = {};
  const need = mode === 'submit';
  for (const f of schema.fields) {
    const v = Object.hasOwn(src, f.key) ? src[f.key] : undefined;
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'phone':
      case 'url':
      case 'date':
      case 'color':
      case 'select': {
        const max = f.type === 'textarea' ? Math.min(f.max ?? INTAKE_LIMITS.textarea, INTAKE_LIMITS.textarea) : f.type === 'text' ? Math.min(f.max ?? INTAKE_LIMITS.text, INTAKE_LIMITS.text) : 300;
        const s = cleanText(v, max, f.type === 'textarea');
        if (v !== undefined && typeof v !== 'string') errors[f.key] = 'Enter text.';
        if (!s) {
          if (need && f.required) errors[f.key] = `${f.label} is required.`;
          break;
        }
        if (f.type === 'email' && !EMAIL_RE_INTAKE.test(s)) errors[f.key] = 'Enter a valid email address.';
        else if (f.type === 'phone' && !PHONE_RE.test(s)) errors[f.key] = 'Enter a valid phone number.';
        else if (f.type === 'url' && !URL_RE.test(s)) errors[f.key] = 'Enter a web address starting with https://';
        else if (f.type === 'date' && !isDate(s)) errors[f.key] = 'Pick a date.';
        else if (f.type === 'color' && !COLOR_RE.test(s)) errors[f.key] = 'Pick a colour (#RRGGBB).';
        else if (f.type === 'select' && !(f.options ?? []).includes(s)) errors[f.key] = 'Pick one of the options.';
        // Only a valid value is kept (a draft keeps what is valid; the error says what was dropped).
        if (!errors[f.key]) value[f.key] = f.type === 'color' ? s.toUpperCase() : f.type === 'email' ? s.toLowerCase() : s;
        break;
      }
      case 'multiselect': {
        const list = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
        if (v !== undefined && !Array.isArray(v)) errors[f.key] = 'Pick from the list.';
        const bad = list.filter((x) => !(f.options ?? []).includes(x));
        if (bad.length) errors[f.key] = 'Pick from the list.';
        const ok = list.filter((x) => (f.options ?? []).includes(x));
        if (need && f.required && !ok.length) errors[f.key] = `${f.label}: pick at least one.`;
        if (ok.length) value[f.key] = ok;
        break;
      }
      case 'confirm': {
        if (v !== undefined && typeof v !== 'boolean') errors[f.key] = 'Tick the box.';
        if (v === true) value[f.key] = true;
        else if (need && f.required) errors[f.key] = 'Please confirm.';
        break;
      }
      case 'table': {
        const cols = f.columns ?? [];
        const maxRows = Math.min(f.max ?? INTAKE_LIMITS.tableRows, INTAKE_LIMITS.tableRows);
        if (v !== undefined && !Array.isArray(v)) {
          errors[f.key] = 'Send the rows as a list.';
          break;
        }
        const rows = (Array.isArray(v) ? v : []).map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : {}));
        if (rows.length > maxRows) {
          errors[f.key] = `At most ${maxRows} rows.`;
          break;
        }
        const out: TableRow[] = [];
        rows.forEach((r, i) => {
          const row: TableRow = {};
          for (const c of cols) {
            let s = cleanText(r[c.key], c.type === 'email' ? 254 : 160);
            if (c.type === 'email') s = s.toLowerCase();
            row[c.key] = s;
          }
          // A row with nothing in it is simply dropped (an empty line at the end of the table).
          if (cols.every((c) => !row[c.key])) return;
          for (const c of cols) {
            const e = colOk(c, row[c.key]);
            if (e && (need || row[c.key])) errors[`${f.key}.${out.length}.${c.key}`] = e;
          }
          out.push(row);
          void i;
        });
        if (f.unique) {
          const seen = new Map<string, number>();
          out.forEach((row, i) => {
            const k = (row[f.unique as string] ?? '').toLowerCase();
            if (!k) return;
            if (seen.has(k)) errors[`${f.key}.${i}.${f.unique}`] = `Duplicate of row ${(seen.get(k) as number) + 1}`;
            else seen.set(k, i);
          });
        }
        if (need && f.required && !out.length) errors[f.key] = `${f.label}: add at least one row.`;
        if (Object.keys(errors).some((k) => k.startsWith(`${f.key}.`)) && !errors[f.key]) errors[f.key] = 'Some rows need fixing.';
        if (out.length) value[f.key] = out;
        break;
      }
      case 'file': {
        const ids = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
        if (v !== undefined && !Array.isArray(v)) errors[f.key] = 'Upload the files again.';
        const accept = acceptOf(f).map((k) => FILE_KIND_MIME[k]);
        const known = ids.map((id) => files.find((x) => x.id === id && x.field === f.key));
        if (known.some((x) => !x)) errors[f.key] = 'A file is missing. Upload it again.';
        const good = known.filter((x): x is Pick<IntakeFileRef, 'id' | 'field' | 'mime'> => Boolean(x));
        if (good.some((x) => !accept.includes(x.mime))) errors[f.key] = 'That file type is not allowed here.';
        const max = Math.min(f.max ?? 10, INTAKE_LIMITS.filesPerRequest);
        if (good.length > max) errors[f.key] = `At most ${max} file${max === 1 ? '' : 's'}.`;
        if (need && f.required && !good.length) errors[f.key] = `${f.label}: upload a file.`;
        if (good.length) value[f.key] = good.map((x) => x.id);
        break;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, value, errors };
}

/** Steps (in order) from the fields' `step` titles; fields without one form a single step. */
export function stepsOf(schema: IntakeSchema): { title: string; fields: IntakeField[] }[] {
  const out: { title: string; fields: IntakeField[] }[] = [];
  for (const f of schema.fields) {
    const t = f.step ?? schema.title;
    const cur = out.find((s) => s.title === t);
    if (cur) cur.fields.push(f);
    else out.push({ title: t, fields: [f] });
  }
  return out;
}

// ------------------------------------------------------------------ diff between versions

export interface FieldDiff {
  key: string;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  before: string;
  after: string;
}
export function answerText(f: IntakeField, v: AnswerValue | undefined, fileName: (id: string) => string = (id) => id): string {
  if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '';
  if (f.type === 'confirm') return v === true ? 'Confirmed' : '';
  if (f.type === 'file') return (v as string[]).map(fileName).join(', ');
  if (f.type === 'multiselect') return (v as string[]).join(', ');
  if (f.type === 'table') return `${(v as TableRow[]).length} row(s)`;
  return String(v);
}
/** Field-by-field changes from `prev` to `next` (tables: rows added / removed / changed, by their unique column or position). */
export function diffAnswers(schema: IntakeSchema, prev: Answers | null, next: Answers, fileName?: (id: string) => string): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of schema.fields) {
    const a = prev?.[f.key];
    const b = next[f.key];
    if (f.type === 'table') {
      const ra = (Array.isArray(a) ? a : []) as TableRow[];
      const rb = (Array.isArray(b) ? b : []) as TableRow[];
      const id = (r: TableRow, i: number) => (f.unique ? (r[f.unique] ?? '').toLowerCase() : String(i));
      const ma = new Map(ra.map((r, i) => [id(r, i), r]));
      const mb = new Map(rb.map((r, i) => [id(r, i), r]));
      const fmt = (r: TableRow) => (f.columns ?? []).map((c) => r[c.key]).filter(Boolean).join(' · ');
      for (const [k, r] of mb) if (!ma.has(k)) out.push({ key: f.key, label: f.label, kind: 'added', before: '', after: fmt(r) });
      for (const [k, r] of ma) if (!mb.has(k)) out.push({ key: f.key, label: f.label, kind: 'removed', before: fmt(r), after: '' });
      for (const [k, r] of mb) {
        const o = ma.get(k);
        if (o && fmt(o) !== fmt(r)) out.push({ key: f.key, label: f.label, kind: 'changed', before: fmt(o), after: fmt(r) });
      }
      continue;
    }
    const ta = answerText(f, a, fileName);
    const tb = answerText(f, b, fileName);
    if (ta === tb) continue;
    out.push({ key: f.key, label: f.label, kind: !ta ? 'added' : !tb ? 'removed' : 'changed', before: ta, after: tb });
  }
  return out;
}

// ------------------------------------------------------------------ CSV (import into a table; export neutralised)

/** RFC 4180 CSV to rows. Caps: rows, columns and cell length; returns null when the text is not usable CSV. */
export function parseCsv(textIn: string, caps: { rows: number; cols: number; cell: number } = { rows: INTAKE_LIMITS.csvRows, cols: INTAKE_LIMITS.csvCols, cell: INTAKE_LIMITS.csvCell }): { rows: string[][]; error?: string } {
  const text = textIn.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const push = () => {
    if (cell.length > caps.cell) cell = cell.slice(0, caps.cell);
    row.push(cell);
    cell = '';
    if (row.length > caps.cols) throw new Error(`More than ${caps.cols} columns.`);
  };
  try {
    while (i < text.length) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          quoted = false;
          i++;
          continue;
        }
        cell += ch;
        i++;
        continue;
      }
      if (ch === '"' && cell === '') {
        quoted = true;
        i++;
        continue;
      }
      if (ch === ',') {
        push();
        i++;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        push();
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
        if (rows.length > caps.rows) throw new Error(`More than ${caps.rows - 1} rows.`);
        i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      cell += ch;
      i++;
    }
    if (quoted) throw new Error('A quoted cell is not closed.');
    if (cell !== '' || row.length) {
      push();
      if (row.some((c) => c.trim())) rows.push(row);
    }
    if (rows.length > caps.rows) throw new Error(`More than ${caps.rows - 1} rows.`);
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : 'Not a CSV file.' };
  }
  return { rows };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const SYNONYMS: Record<string, string[]> = { name: ['fullname', 'username', 'person', 'contact'], email: ['emailaddress', 'mail', 'workemail'], role: ['position', 'access', 'permission', 'title'] };
/** CSV rows (first row = header) mapped onto a table's columns by header name. Unmatched columns are ignored. */
export function csvToTable(f: IntakeField, rows: string[][]): { rows: TableRow[]; unmatched: string[]; error?: string } {
  const cols = f.columns ?? [];
  if (rows.length < 2) return { rows: [], unmatched: [], error: 'The CSV needs a header row and at least one row.' };
  const header = rows[0].map(norm);
  const idx = cols.map((c) => header.findIndex((h) => h === norm(c.key) || h === norm(c.label) || (SYNONYMS[c.key] ?? []).includes(h)));
  if (idx.every((x) => x < 0)) return { rows: [], unmatched: rows[0], error: `No column matches. Use the headers: ${cols.map((c) => c.label).join(', ')}.` };
  const unmatched = rows[0].filter((_, j) => !idx.includes(j));
  const out = rows.slice(1).map((r) => {
    const row: TableRow = {};
    cols.forEach((c, j) => {
      let v = idx[j] >= 0 ? (r[idx[j]] ?? '').trim() : '';
      if (c.type === 'select' && v) v = (c.options ?? []).find((o) => o.toLowerCase() === v.toLowerCase()) ?? v;
      row[c.key] = v;
    });
    return row;
  });
  return { rows: out, unmatched };
}

/** One CSV cell for an export: quoted, and a leading = + - @ (or tab / CR) neutralised so a spreadsheet never runs it. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(',');

// ------------------------------------------------------------------ what the client sees (the public projection's shape)

export interface PublicIntakeFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  field: string;
}
export interface PublicIntake {
  requestId: string;
  kind: RequestKind;
  unified: UnifiedStatus;
  /** The plain status line for the client (per kind). */
  label: string;
  tone: 'neutral' | 'brand' | 'warning' | 'success';
  form: {
    schema: IntakeSchema;
    status: FormStatus;
    draft: Answers;
    draftAt: string | null;
    version: number;
    /** The latest submitted answers (for the summary after submitting). */
    submitted: Answers | null;
    submittedAt: string | null;
    /** The owner's note when changes were requested. */
    ownerNote: string | null;
    files: PublicIntakeFile[];
    locked: boolean;
  } | null;
  dns: { domain: string; records: (DnsRecord & { ok: boolean | null })[]; checkedAt: string | null; canSetDomain: boolean } | null;
  keys: { providers: { provider: string; label: string; ok: boolean }[]; workspaceUrl: string | null; checkedAt: string | null; ready: boolean } | null;
  signature: { ready: boolean; action: 'sign' | 'acknowledge' | 'view' | null; done: boolean; deemed: boolean; note: string | null } | null;
  payment: { state: 'awaiting' | 'confirming' | 'paid'; chip: string; note: string | null; canClaim: boolean; statement: boolean; receipt: PublicIntakeFile | null } | null;
  uat: { note: string } | null;
}

export const INTAKE_ACTIONS = ['save', 'submit', 'remove_file', 'set_domain', 'check_dns', 'check_keys', 'paid', 'csv'] as const;
export type IntakeAction = (typeof INTAKE_ACTIONS)[number];

export const safeLimitText = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
export const MAX_ANSWER_CHARS = CP_LIMITS.notes;
