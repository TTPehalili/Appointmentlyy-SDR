/**
 * Customer-facing text blocks on an Appointmentlyy invoice (Admin > Billing): the note, the refund and
 * cancellation policy, the payment line above the Wise link and the inquiries email. Plain module (no
 * 'use client'): the invoice preview, the billing tool, the invoice email and the AI rewrite route all
 * read the same defaults, caps and checks from here.
 */

export interface InvoiceTextBlocks {
  /** Short note under the payment block. Empty hides it. */
  note: string;
  /** Body of "Refund and cancellation policy" (the title is fixed). Empty hides the section. */
  refundPolicy: string;
  /** The line above the Wise link. The Wise link, tag, QR and reference (the invoice number) are fixed. */
  paymentInstructions: string;
  /** "Inquiries:" contact. Must be a valid email. */
  inquiriesEmail: string;
}

export const INVOICE_TEXT_LIMITS = {
  note: 1000,
  refundPolicy: 2000,
  paymentInstructions: 300,
  inquiriesEmail: 254,
  aiInstruction: 300,
} as const;

export const DEFAULT_REFUND_POLICY =
  "Setup fees are non-refundable once work has started, except as stated in your Service Agreement. Monthly fees are billed from go-live and can be cancelled with 30 days' notice before the next billing date. Invoices are payable within 3 business days. Transfer fees are paid by the sender.";

export const DEFAULT_PAYMENT_INSTRUCTIONS = 'Transfer via Wise using the link below.';

export const DEFAULT_INQUIRIES_EMAIL = 'support@appointmentlyy.com';

/** Built-in text for a new invoice (and for client self-serve top-ups, which cannot set their own). */
export const DEFAULT_INVOICE_TEXT: InvoiceTextBlocks = {
  note: '',
  refundPolicy: DEFAULT_REFUND_POLICY,
  paymentInstructions: DEFAULT_PAYMENT_INSTRUCTIONS,
  inquiriesEmail: DEFAULT_INQUIRIES_EMAIL,
};

/** Default note for the GTM plan preset (today's offer). Editable like any other text. */
export const GTM_PLAN_NOTE =
  'GTM plan: a one-time custom build and setup fee, then a monthly platform and support fee billed from go-live, with unlimited users. BYOK (bring your own keys): you connect your own AI, voice, email and lead-data accounts and pay those providers directly, at cost, with no markup from Appointmentlyy. Provider usage never appears on this invoice.';

/**
 * What invoices sent before these blocks were editable carried (the old hard-coded email text), so
 * reopening one of them shows what the client received. Their email had no note.
 */
export const LEGACY_INVOICE_TEXT: InvoiceTextBlocks = {
  note: '',
  refundPolicy: [
    'Setup & Infrastructure: Initial workspace deployment, configuration, and setup fees ($2,500) are non-refundable once resource provisioning has begun.',
    'Monthly Subscriptions: Recurring monthly charges ($249/mo BYOK) operate on a flexible 30-day model with zero multi-year lock-in and are non-refundable once a billing cycle commences; cancel anytime prior to the next billing date.',
    'Data Credits & Consumables: Contact enrichment batches and ICP Data Cloud record allocations are non-refundable once provisioned or processed.',
  ].join('\n'),
  paymentInstructions: 'Transfer via Wise using the link below or scan the QR code.',
  inquiriesEmail: 'Admin@appointmentlyy.com',
};

const EMAIL_RE = /^[^\s@<>"'(),;:\\[\]]+@[^\s@<>"'(),;:\\[\]]+\.[^\s@<>"'(),;:\\[\]]{2,}$/;

export function isValidInvoiceEmail(v: string): boolean {
  const t = String(v || '').trim();
  return t.length > 0 && t.length <= INVOICE_TEXT_LIMITS.inquiriesEmail && EMAIL_RE.test(t);
}

/**
 * One text block as it is stored and sent: line breaks kept (CRLF folded to LF), other control
 * characters removed, trimmed and capped. Not HTML-escaped: escape where it is rendered.
 */
export function cleanInvoiceBlock(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max)
    .trim();
}

/**
 * The text blocks a request asks for. A missing field takes the default; an empty note or policy hides
 * that section. The inquiries email, when given, must be valid (null = reject the request).
 */
export function readInvoiceTextFromRequest(raw: Record<string, unknown> | null | undefined): InvoiceTextBlocks | null {
  const o = raw || {};
  const pick = (key: keyof InvoiceTextBlocks, max: number) =>
    o[key] === undefined || o[key] === null ? DEFAULT_INVOICE_TEXT[key] : cleanInvoiceBlock(o[key], max);
  const inquiries =
    o.inquiriesEmail === undefined || o.inquiriesEmail === null
      ? DEFAULT_INQUIRIES_EMAIL
      : cleanInvoiceBlock(o.inquiriesEmail, INVOICE_TEXT_LIMITS.inquiriesEmail);
  if (!isValidInvoiceEmail(inquiries)) return null;
  return {
    note: pick('note', INVOICE_TEXT_LIMITS.note),
    refundPolicy: pick('refundPolicy', INVOICE_TEXT_LIMITS.refundPolicy),
    paymentInstructions: pick('paymentInstructions', INVOICE_TEXT_LIMITS.paymentInstructions),
    inquiriesEmail: inquiries,
  };
}

// ------------------------------------------------------------------ AI rewrite checks

export type InvoiceAiField = 'note' | 'refundPolicy';

/** Terms the policy must keep, word for word in meaning, when the current text has them. */
const POLICY_TERMS: { label: string; present: RegExp; keep: RegExp }[] = [
  {
    label: 'non-refundable setup fees',
    present: /non-?\s?refundable/i,
    keep: /non-?\s?refundable/i,
  },
  {
    label: 'except as stated in the Service Agreement',
    present: /service agreement/i,
    keep: /service agreement/i,
  },
  {
    label: "30 days' notice",
    present: /\b(30|thirty)[\s-]*days?\b/i,
    keep: /\b(30|thirty)[\s-]*days?\b[^.]{0,40}notice|notice[^.]{0,40}\b(30|thirty)[\s-]*days?\b/i,
  },
  {
    label: 'payable within 3 business days',
    present: /\b(3|three)\s+business\s+days?\b/i,
    keep: /\b(3|three)\s+business\s+days?\b/i,
  },
  {
    label: 'transfer fees paid by the sender',
    present: /transfer fees?/i,
    keep: /transfer fees?[^.]{0,60}\bsender\b|\bsender\b[^.]{0,60}transfer fees?/i,
  },
];

/** BYOK meaning the note must keep when the current text has it. */
const BYOK_TERMS: { label: string; present: RegExp; keep: RegExp }[] = [
  { label: 'paid to providers directly', present: /\bdirectly\b/i, keep: /\bdirect(ly)?\b/i },
  { label: 'at cost', present: /\bat cost\b/i, keep: /\bat cost\b/i },
  { label: 'no markup', present: /mark-?\s?up/i, keep: /\b(no|without( any)?|zero)\s+mark-?\s?ups?\b/i },
];

const BANNED: { label: string; re: RegExp }[] = [
  { label: '"fully automated"', re: /fully[\s-]+automat/i },
  { label: 'a guarantee', re: /\bguarant(ee|eed|ees)\b/i },
  { label: 'a promise of results', re: /\b(we promise|promised results|results promised|will (increase|double|triple|boost))\b/i },
];

/** Every number in a text (amounts, dates, percentages), normalised: "$10,000.00" -> "10000". */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = m[0].replace(/,/g, '').replace(/\.0+$/, '');
    if (n) out.add(n);
  }
  return out;
}

/** Dollar / USD amounts in a text, normalised. */
function amountsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:\$|USD\s?)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?USD\b/gi)) {
    const n = (m[1] || m[2] || '').replace(/,/g, '').replace(/\.0+$/, '');
    if (n) out.add(n);
  }
  return out;
}

/** Model output as plain invoice text: no HTML, no markdown emphasis, capped. */
export function plainAiText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const t = v
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*[—–]\s*/g, ', ');
  return cleanInvoiceBlock(t, max);
}

/**
 * Why a model version cannot be used, or null when it can: it must keep every legal term (policy) and
 * the BYOK meaning (note) already in the source, add no number or $ amount the source did not have,
 * and make no guarantee or "fully automated" claim.
 */
export function aiVersionProblem(field: InvoiceAiField, source: string, version: string): string | null {
  if (!version.trim()) return 'empty';
  const max = field === 'note' ? INVOICE_TEXT_LIMITS.note : INVOICE_TEXT_LIMITS.refundPolicy;
  if (version.length > max) return 'too long';
  const srcAmounts = amountsIn(source);
  for (const a of amountsIn(version)) if (!srcAmounts.has(a)) return `added the amount ${a}`;
  const srcNumbers = numbersIn(source);
  for (const n of numbersIn(version)) if (!srcNumbers.has(n)) return `added the number ${n}`;
  for (const b of BANNED) if (b.re.test(version) && !b.re.test(source)) return `added ${b.label}`;
  const terms = field === 'refundPolicy' ? POLICY_TERMS : BYOK_TERMS;
  for (const t of terms) if (t.present.test(source) && !t.keep.test(version)) return `dropped "${t.label}"`;
  return null;
}
