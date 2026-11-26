/**
 * Server only. Billing statements ('view' templates): sequential numbers (APY-SOA-2026-0001), the
 * amount due read from the template's fields, payments recorded by the owner, and the "PAID" stamp
 * (pdf-lib) on the "Payment received" copy. These are payment requests, not BIR invoices.
 *
 * Field keys are found by name so the template layer can name them naturally: a statement-number
 * field (statementNo / soaNo ...), a due date (dueDate ...), a currency, a total (total / amountDue)
 * or line items ("description | qty | unit price" per line), and payment instructions.
 */
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { AgreementTemplate, TemplateField } from '@/lib/agreements/templates/types';
import { MANILA_TZ, balanceOf, fmtMoney, paidSoFar, type BillingInfo, type Envelope } from '@/lib/agreements/envelope';
import { getAgreementStore } from '@/lib/server/agreementStore';
import { ansi } from '@/lib/server/agreements/finalPdf';
import { PAYMENT_DEFAULT_KEYS } from '@/lib/agreements/paymentOptions';

const byName = (fields: TemplateField[], re: RegExp) => fields.find((f) => re.test(f.key) || re.test(f.label));

export const numberField = (t: Pick<AgreementTemplate, 'fields'>) => byName(t.fields, /(statement|soa|invoice|billing).?(no|num|number)\b|^statementNo$|^number$/i);
/**
 * A billing statement: a 'view' template with a statement-number field. Other 'view' templates (the custom
 * proposal) are tracked reading only: no number, no total, no payments.
 */
export const isStatementTemplate = (t: Pick<AgreementTemplate, 'action' | 'fields'>) => t.action === 'view' && Boolean(numberField(t));
export const dueField = (t: Pick<AgreementTemplate, 'fields'>) => byName(t.fields, /due.?date|^due$/i);
/** Fields that are not payment options (bank transfer, PayPal, Wise link, QR): their names say "bank", "currency", "Wise". */
const OPTION_KEYS = new Set<string>(PAYMENT_DEFAULT_KEYS.filter((k) => k !== 'paymentInstructions'));
const nonOption = (fields: TemplateField[]) => fields.filter((f) => !OPTION_KEYS.has(f.key));

export const currencyField = (t: Pick<AgreementTemplate, 'fields'>) => byName(nonOption(t.fields), /currency/i);
export const totalField = (t: Pick<AgreementTemplate, 'fields'>) => t.fields.find((f) => /^(total|amount|amountDue|totalDue|total_due)$/i.test(f.key));
export const linesField = (t: Pick<AgreementTemplate, 'fields'>) => byName(t.fields, /line.?items|^items$/i);
export const paymentField = (t: Pick<AgreementTemplate, 'fields'>) =>
  t.fields.find((f) => f.key === 'paymentInstructions') ?? byName(nonOption(t.fields), /payment.?(instructions|details)|wise|bank/i);

const num = (s: string) => {
  const n = Number(String(s ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Sum "description | qty | unit price" lines (qty defaults to 1; a single number is the amount). */
export function sumLineItems(text: string): number {
  let total = 0;
  for (const raw of String(text || '').split('\n')) {
    const parts = raw.split('|').map((p) => p.trim());
    if (parts.length >= 3) total += num(parts[1] || '1') * num(parts[2]);
    else if (parts.length === 2) total += num(parts[1]);
  }
  return Math.round(total * 100) / 100;
}

export function billingTotal(t: AgreementTemplate, values: Record<string, string>): number {
  const tf = totalField(t);
  if (tf && num(values[tf.key])) return num(values[tf.key]);
  const lf = linesField(t);
  return lf ? sumLineItems(values[lf.key] ?? '') : 0;
}

/** Next APY-SOA-<year>-NNNN for the current Manila year (never reuses a number). */
export async function nextStatementNumber(): Promise<string> {
  const year = new Date().toLocaleDateString('en-CA', { timeZone: MANILA_TZ }).slice(0, 4);
  const prefix = `APY-SOA-${year}-`;
  let max = 0;
  for (const e of await getAgreementStore().listEnvelopes()) {
    const n = e.billing?.number;
    if (n && n.startsWith(prefix)) max = Math.max(max, Number(n.slice(prefix.length)) || 0);
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Freeze the statement's billing facts at send time (number assigned into the values first). */
export function billingFor(t: AgreementTemplate, values: Record<string, string>, number: string, sourceEnvelopeId: string | null): BillingInfo {
  const cf = currencyField(t);
  const df = dueField(t);
  let due = df ? (values[df.key] ?? '').trim() : '';
  if (!due) due = dueFromTerms(t, values) ?? '';
  return {
    number,
    currency: ((cf ? values[cf.key] : '') || 'USD').trim().toUpperCase().slice(0, 3) || 'USD',
    total: billingTotal(t, values),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    payments: [],
    sourceEnvelopeId,
  };
}

/** Statement date plus "payable within N business days" (Mon-Fri), when no due date is given. */
function dueFromTerms(t: AgreementTemplate, values: Record<string, string>): string | null {
  const sd = byName(t.fields, /statement.?date|^date$/i);
  const pd = byName(t.fields, /payable|terms.?days/i);
  const start = sd ? (values[sd.key] ?? '').trim() : '';
  const days = pd ? Math.round(num(values[pd.key])) : 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !(days > 0) || days > 120) return null;
  const d = new Date(`${start}T00:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

export const statementDateField = (t: Pick<AgreementTemplate, 'fields'>) => byName(t.fields, /statement.?date/i);

/** The statement with a large "PAID" (or "PART PAID") stamp and the payment lines on page 1. */
export async function stampPaid(original: Uint8Array, e: Envelope): Promise<Uint8Array> {
  const b = e.billing!;
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const full = balanceOf(b) <= 0;
  const label = full ? 'PAID' : 'PART PAID';
  const color = full ? rgb(0.05, 0.55, 0.3) : rgb(0.8, 0.45, 0.05);
  const page = doc.getPage(0);
  const { width, height } = page.getSize();
  const size = full ? 96 : 64;
  const tw = bold.widthOfTextAtSize(label, size);
  page.drawText(label, { x: width / 2 - tw / 2 + 40, y: height / 2 - 40, size, font: bold, color, opacity: 0.28, rotate: degrees(28) });
  const last = b.payments[b.payments.length - 1];
  const lines = [
    `${label}: ${fmtMoney(paidSoFar(b), b.currency)} received of ${fmtMoney(b.total, b.currency)}`,
    ...b.payments.map((p) => `${p.date}  ${fmtMoney(p.amount, b.currency)}  Wise ref ${p.reference}`),
    full ? 'Thank you. Balance: nil.' : `Balance due: ${fmtMoney(balanceOf(b), b.currency)}`,
  ];
  const boxH = 16 + lines.length * 12;
  const boxW = 300;
  const x = width - boxW - 36;
  const y = 36;
  page.drawRectangle({ x, y, width: boxW, height: boxH, color: rgb(1, 1, 1), opacity: 0.92, borderColor: color, borderWidth: 1.2 });
  lines.forEach((l, i) => page.drawText(ansi(l).slice(0, 70), { x: x + 10, y: y + boxH - 18 - i * 12, size: i === 0 ? 9.5 : 8.5, font: i === 0 ? bold : reg, color: rgb(0.1, 0.1, 0.1) }));
  doc.setProducer('Appointmentlyy Agreements');
  doc.setModificationDate(new Date(last?.recordedAt || Date.now()));
  return doc.save();
}
