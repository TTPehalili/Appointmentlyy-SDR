/**
 * Template `billing-statement-v1` (brief §8b): a one-page Billing Statement, i.e. a payment request
 * (NOT a BIR invoice; the BIR invoice is issued when payment arrives). action 'view': no signature,
 * tracked viewing; the platform manages unpaid/paid/overdue and stamps "PAID".
 *
 * Payment details are never hard-coded: the Wise link, bank transfer details, PayPal link, QR and
 * note are pre-filled from the owner's Agreements settings, each optional and printed only when
 * filled. `statementNo` is filled by the platform's sequential numbering (APY-SOA-2026-0001).
 */
import { Image, Link, View } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { addBusinessDaysIso, blankMark, formatAmount, formatDate, lines, parseMoney, valueOrMark, withDefaults } from './pdf/format';
import { PAYMENT_LIMITS, bankProblem, bankRows, hasBank, oneLine, safePaypalLink } from '../paymentOptions';
import { AgreementDocument, C, ContentPage, FRAME, HAIR, Lockup, T, breakable, docDate, em, renderPdf, rich, sty, type Style } from './pdf/kit';

const FIELDS: TemplateField[] = [
  { group: 'Statement', key: 'statementNo', label: 'Statement no.', type: 'text', required: true, default: '', help: 'Filled automatically, e.g. APY-SOA-2026-0001.' },
  { group: 'Statement', key: 'statementDate', label: 'Statement date', type: 'date', required: true, default: '' },
  { group: 'Statement', key: 'payableDays', label: 'Payable within (business days)', type: 'number', required: true, default: '3', help: 'Business days, Monday to Friday.' },
  { group: 'Statement', key: 'dueDate', label: 'Due date', type: 'date', required: false, default: '', help: 'Leave blank to use the statement date plus the payable business days (Mon–Fri).' },
  { group: 'Statement', key: 'reference', label: 'Reference (agreement title)', type: 'text', required: true, default: 'Appointmentlyy x STACKph: Proposal and Annexes (Growth)' },
  { group: 'Client', key: 'clientShort', label: 'Client short name', type: 'text', required: true, default: 'STACKph' },
  { group: 'Client', key: 'clientLegal', label: 'Bill to: client legal name', type: 'text', required: true, default: 'GDV Business Services Co.' },
  { group: 'Client', key: 'clientAddress', label: 'Bill to: address', type: 'textarea', required: true, default: '' },
  { group: 'Client', key: 'clientTin', label: 'Bill to: TIN (optional)', type: 'text', required: false, default: '' },
  {
    group: 'Items', key: 'lineItems', label: 'Line items', type: 'textarea', required: true,
    default: 'Custom build fee, first 50% (due on signing) | 1 | 7500',
    help: 'One per line: description | qty | unit price (USD). Example: "Monthly platform and support, December 2026 | 1 | 1500".',
  },
  // Payment options (all optional, shown only when filled), in "How to pay" order. Defaults come from Agreements settings.
  {
    group: 'Pay now (Wise)', key: 'paymentLink', label: 'Wise payment link (https://)', type: 'text', required: false, default: '',
    help: 'Shown as a red "Pay now" button and printed in full. https:// only.',
  },
  { group: 'Bank transfer', key: 'bankName', label: 'Bank name', type: 'text', required: false, default: '', help: 'Leave all bank fields empty to hide bank transfer.' },
  { group: 'Bank transfer', key: 'bankAccountName', label: 'Account name', type: 'text', required: false, default: '' },
  { group: 'Bank transfer', key: 'bankAccountNumber', label: 'Account number', type: 'text', required: false, default: '', help: 'Digits, spaces and dashes only.' },
  { group: 'Bank transfer', key: 'bankSwift', label: 'SWIFT/BIC', type: 'text', required: false, default: '', help: '8 or 11 letters and digits.' },
  { group: 'Bank transfer', key: 'bankBranch', label: 'Branch / address (optional)', type: 'text', required: false, default: '' },
  { group: 'Bank transfer', key: 'bankCurrency', label: 'Account currency', type: 'text', required: false, default: '', help: '3-letter code. Blank means USD.' },
  {
    group: 'PayPal', key: 'paypalLink', label: 'PayPal link (https://paypal.me/...)', type: 'text', required: false, default: '',
    help: 'paypal.me or paypal.com only. Shown as a "Pay with PayPal" button and printed in full.',
  },
  {
    group: 'PayPal', key: 'paypalFeeNote', label: 'PayPal fee note', type: 'text', required: false, default: '',
    help: 'Optional, printed under the PayPal button, e.g. "PayPal payments: please add 4.5% to cover PayPal fees".',
  },
  {
    group: 'QR code and note', key: 'paymentQr', label: 'Payment QR (any provider)', type: 'text', required: false, default: '',
    help: 'Set by the platform from the uploaded image: a data:image/png;base64 or data:image/jpeg;base64 string. Anything else is ignored.',
  },
  {
    group: 'QR code and note', key: 'paymentInstructions', label: 'Payment note (optional)', type: 'textarea', required: false, default: '',
    help: 'Any extra payment instructions, printed last in "How to pay". Pre-filled from Agreements settings.',
  },
  { group: 'Issuer', key: 'appyProprietor', label: 'Issuer legal name', type: 'text', required: true, default: 'Emil Libatique Halili' },
  { group: 'Issuer', key: 'appySignerTitle', label: 'Issuer capacity', type: 'text', required: true, default: 'Independent Contractor (Appointmentlyy)' },
  { group: 'Issuer', key: 'appyTin', label: 'Issuer TIN', type: 'text', required: true, default: '271-163-899-00000' },
  { group: 'Issuer', key: 'appyAddress', label: 'Issuer address', type: 'text', required: true, default: 'Lot 22 Blk 11 Avocado St., Trinidad Village, Calibutbut, 2001 Bacolor, Pampanga' },
];

/** QR printed at about 32 mm square. */
const QR_SIZE = 90.7;
/** Bank block widths: row 1 bank / account name / account number; row 2 SWIFT / branch (when set) / currency. */
function bankCellWidth(key: string, withBranch: boolean): string {
  if (key === 'bankBranch') return '58%';
  if (key === 'bankCurrency') return withBranch ? '16%' : '74%';
  return key === 'bankName' ? '30%' : key === 'bankAccountName' ? '40%' : key === 'bankSwift' ? '26%' : '30%';
}

/** Largest accepted QR data URL (a 1 MB image is about 1.37 MB as base64). */
const QR_MAX_CHARS = 1_500_000;

/** The link exactly as set, if it is a valid https:// URL with a host; otherwise null (never javascript:, data:, http:). */
export function safePaymentLink(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!/^https:\/\//i.test(s) || /\s/.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname ? s : null;
  } catch {
    return null;
  }
}

/** Only PNG/JPEG base64 data URLs are accepted; anything else is ignored (null). */
export function safeQrDataUrl(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (s.length > QR_MAX_CHARS) return null;
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(s) ? s : null;
}

interface Item { desc: string; qty: number | null; unit: number | null; amount: number | null }

/** "description | qty | unit price" -> item. Qty defaults to 1; a bad number leaves the amount null (highlighted). */
export function parseItems(raw: string): Item[] {
  return (raw ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split('|').map((p) => p.trim());
      const desc = parts[0] ?? '';
      const qty = parts.length >= 3 ? (parts[1] === '' ? 1 : Number(parts[1].replace(/,/g, ''))) : 1;
      const unit = parseMoney(parts.length >= 3 ? parts[2] : parts[1]);
      const okQty = Number.isFinite(qty) && qty > 0 ? qty : null;
      return { desc, qty: okQty, unit, amount: okQty !== null && unit !== null ? Math.round(okQty * unit * 100) / 100 : null };
    });
}

/** Amounts in a statement always show cents: 7500 -> "7,500.00". */
function money2(n: number): string {
  const s = formatAmount(n);
  return s.includes('.') ? s : `${s}.00`;
}

const FOOTER_LINES = (days: string) => [
  'Transfer fees are paid by the sender, so the full amount is received.',
  'An official BIR invoice is issued upon receipt of payment.',
  `Payable within ${days} business days.`,
];

export const billingStatementV1: AgreementTemplateDef = {
  id: 'billing-statement-v1',
  name: 'Billing Statement',
  description: 'A one-page payment request (USD; Wise, bank transfer or PayPal). Not a BIR invoice: that is issued when payment is received.',
  action: 'view',
  countersign: false,
  fields: FIELDS,
  signerForm: [],
  title(values) {
    const v = withDefaults(FIELDS, values);
    return `Billing Statement${v.statementNo ? ` ${v.statementNo}` : ''}: Appointmentlyy x ${v.clientShort || 'Client'}`;
  },
  render(values) {
    const v = withDefaults(FIELDS, values);
    const client = v.clientShort || 'Client';
    const items = parseItems(v.lineItems);
    const allOk = items.length > 0 && items.every((i) => i.amount !== null);
    const subtotal = items.reduce((s, i) => s + (i.amount ?? 0), 0);
    const days = /^\d+$/.test(v.payableDays) ? v.payableDays : '';
    const due = v.dueDate || (days ? addBusinessDaysIso(v.statementDate, Number(days)) : '');
    const totalStr = allOk ? `USD ${money2(subtotal)}` : blankMark('[check the line items]');

    const label: Style = { ...sty.label, marginBottom: 3 };
    const val: Style = { fontSize: 9.5, lineHeight: 1.5, color: C.ink };
    const cellR: Style = { textAlign: 'right' };
    const w = { qty: 50, unit: 95, amt: 100 };

    const party = (title: string, body: string) => (
      <View style={{ flex: 1, paddingRight: 16 }}>
        <T style={label}>{title}</T>
        <T style={val}>{rich(body)}</T>
      </View>
    );
    const meta = (title: string, body: string, flex = 1) => (
      <View style={{ flex, paddingRight: 12 }}>
        <T style={label}>{title}</T>
        <T style={[val, { fontWeight: 600 }]}>{rich(body)}</T>
      </View>
    );

    const issuer = [
      `**${valueOrMark(v.appyProprietor, 'issuer name')}**`,
      valueOrMark(v.appySignerTitle, 'capacity'),
      `TIN ${valueOrMark(v.appyTin, 'TIN')}`,
      valueOrMark(v.appyAddress, 'address'),
    ].join('\n');
    const billTo = [
      `**${valueOrMark(v.clientLegal, 'client legal name')}**`,
      lines(v.clientAddress).join('\n') || blankMark('[client address]'),
      v.clientTin ? `TIN ${v.clientTin}` : '',
    ].filter(Boolean).join('\n');
    // How to pay: 1 Wise (Pay now), 2 bank transfer, 3 PayPal, 4 QR, 5 note. Each only when filled;
    // the whole box is hidden only when all five are empty. Invalid values print a highlighted mark, never the value.
    const pay = lines(v.paymentInstructions);
    const link = safePaymentLink(v.paymentLink);
    const qr = safeQrDataUrl(values.paymentQr ?? '');
    const bankUsed = hasBank(v);
    const bank = bankRows(v);
    const paypal = safePaypalLink(v.paypalLink);
    const paypalNote = oneLine(v.paypalFeeNote, PAYMENT_LIMITS.paypalFeeNote);
    const anyAbove = Boolean(v.paymentLink.trim() || bankUsed || v.paypalLink.trim() || qr);
    const showPay = anyAbove || pay.length > 0;
    const optLabel: Style = { fontSize: 7, fontWeight: 600, letterSpacing: em(0.14, 7), textTransform: 'uppercase', color: C.muted, lineHeight: 1.4 };
    const button = (href: string, text: string, bg: string) => (
      <View style={{ alignItems: 'flex-start' }}>
        <Link src={href} style={{ textDecoration: 'none' }}>
          <View style={{ backgroundColor: bg, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 14 }}>
            <T style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 700, letterSpacing: em(0.02, 10), lineHeight: 1.3 }}>{text}</T>
          </View>
        </Link>
        <Link src={href} style={{ textDecoration: 'none', marginTop: 2 }}>
          <T style={{ fontSize: 7.5, lineHeight: 1.35, color: C.muted }}>{breakable(href)}</T>
        </Link>
      </View>
    );
    const bad = (text: string) => <T style={{ fontSize: 8.5, marginTop: 2 }}>{rich(blankMark(text))}</T>;

    return renderPdf(
      <AgreementDocument title={`Billing Statement ${v.statementNo}`.trim()} subject={`Appointmentlyy x ${client}`} date={docDate(v.statementDate)}>
        <ContentPage head="Billing Statement" sub={v.statementNo || 'Statement'} client={client} style={{ paddingTop: 64, paddingBottom: FRAME.bottom + 56 }}>
          {/* Masthead */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: C.red, marginBottom: 18 }}>
            <Lockup h={26} />
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontSize: 22, fontWeight: 800, letterSpacing: em(-0.02, 22), lineHeight: 1.1 }}>Billing Statement</T>
              <T style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{rich(`No. ${valueOrMark(v.statementNo, 'statement no.')}`)}</T>
            </View>
          </View>

          {/* Parties */}
          <View style={{ flexDirection: 'row', marginBottom: 16 }}>
            {party('From', issuer)}
            {party('Bill to', billTo)}
          </View>

          {/* Meta */}
          <View style={{ flexDirection: 'row', borderTopWidth: HAIR, borderTopColor: C.rule2, borderBottomWidth: HAIR, borderBottomColor: C.rule2, paddingVertical: 10, marginBottom: 20 }}>
            {meta('Statement date', valueOrMark(formatDate(v.statementDate), 'statement date'))}
            {meta('Due date', valueOrMark(formatDate(due), 'due date'))}
            {meta('Currency', 'USD', 0.6)}
            {meta('Reference', valueOrMark(v.reference, 'reference'), 2.2)}
          </View>

          {/* Items */}
          <View wrap={false}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 5 }}>
              <T style={[sty.label, { flex: 1 }]}>Description</T>
              <T style={[sty.label, { width: w.qty }, cellR]}>Qty</T>
              <T style={[sty.label, { width: w.unit }, cellR]}>Unit price</T>
              <T style={[sty.label, { width: w.amt }, cellR]}>Amount</T>
            </View>
            {(items.length ? items : [{ desc: '', qty: null, unit: null, amount: null }]).map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
                <T style={{ flex: 1, fontSize: 10, lineHeight: 1.45, color: C.ink, paddingRight: 10 }}>{rich(it.desc || blankMark('[line items]'))}</T>
                <T style={[{ width: w.qty, fontSize: 10, lineHeight: 1.45, color: C.ink2 }, cellR]}>{rich(it.qty === null ? blankMark('[qty]') : formatAmount(it.qty))}</T>
                <T style={[{ width: w.unit, fontSize: 10, lineHeight: 1.45, color: C.ink2 }, cellR]}>{rich(it.unit === null ? blankMark('[price]') : money2(it.unit))}</T>
                <T style={[{ width: w.amt, fontSize: 10, lineHeight: 1.45, color: C.ink, fontWeight: 600 }, cellR]}>{rich(it.amount === null ? blankMark('[amount]') : money2(it.amount))}</T>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 }}>
              <T style={[{ width: 150, fontSize: 10, color: C.ink2 }, cellR]}>Subtotal</T>
              <T style={[{ width: w.amt, fontSize: 10, color: C.ink2 }, cellR]}>{rich(allOk ? money2(subtotal) : blankMark('[subtotal]'))}</T>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
              <View style={{ flexDirection: 'row', backgroundColor: C.redTint, borderTopWidth: 2, borderTopColor: C.red, paddingVertical: 8, paddingLeft: 10 }}>
                <T style={[{ width: 140, fontSize: 11, fontWeight: 700 }, cellR]}>Total due</T>
                <T style={[{ width: w.amt, fontSize: 11, fontWeight: 700, color: C.red }, cellR]}>{rich(totalStr)}</T>
              </View>
            </View>
          </View>

          {/* How to pay */}
          {showPay ? (
            <View wrap={false} style={{ marginTop: 14, backgroundColor: C.paper2, borderTopWidth: HAIR, borderTopColor: C.rule2, paddingHorizontal: 14, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <T style={{ fontSize: 10.5, fontWeight: 600 }}>How to pay</T>
                <T style={{ fontSize: 8.5, color: C.ink2 }}>{rich(`Please quote **${valueOrMark(v.statementNo, 'statement no.')}** as the payment reference.`)}</T>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, paddingRight: qr ? 16 : 0 }}>
                  {/* 1. Wise */}
                  {link ? button(link, 'Pay now', C.red) : v.paymentLink.trim() ? bad('[Wise payment link must be a valid https:// URL]') : null}
                  {/* 2. Bank transfer */}
                  {bankUsed ? (
                    <View style={{ marginTop: link || v.paymentLink.trim() ? 6 : 0 }}>
                      <T style={[optLabel, { color: C.ink, marginBottom: 2 }]}>Bank transfer</T>
                      {bank.length ? (
                        // Labelled block, three per row: bank, account name, account number / SWIFT, branch, currency.
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          {bank.map((r) => (
                            <View key={r.key} style={{ width: bankCellWidth(r.key, bank.some((x) => x.key === 'bankBranch')), paddingRight: 8, marginBottom: 3 }}>
                              <T style={{ fontSize: 7, lineHeight: 1.3, color: C.muted }}>{r.label}</T>
                              <T style={{ fontSize: 9, lineHeight: 1.3, color: C.ink, fontWeight: r.key === 'bankAccountNumber' || r.key === 'bankSwift' ? 600 : 400 }}>{r.value}</T>
                            </View>
                          ))}
                        </View>
                      ) : (
                        bad(`[bank details: ${bankProblem(v)?.replace(/^Bank transfer: /, '') ?? 'check them'}]`)
                      )}
                    </View>
                  ) : null}
                  {/* 3. PayPal */}
                  {v.paypalLink.trim() ? (
                    <View style={{ marginTop: link || v.paymentLink.trim() || bankUsed ? 5 : 0 }}>
                      {paypal ? button(paypal, 'Pay with PayPal', '#003087') : bad('[PayPal link must be https:// on paypal.me or paypal.com]')}
                      {paypal && paypalNote ? <T style={{ fontSize: 8, lineHeight: 1.4, color: C.ink2, marginTop: 2 }}>{paypalNote}</T> : null}
                    </View>
                  ) : null}
                </View>
                {/* 4. QR (any provider) */}
                {qr ? (
                  <View style={{ width: QR_SIZE, alignItems: 'center' }}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; captioned below */}
                    <Image src={qr} style={{ width: QR_SIZE, height: QR_SIZE, objectFit: 'contain' }} />
                    <T style={{ fontSize: 8, color: C.ink2, marginTop: 3, fontWeight: 600 }}>Scan to pay</T>
                  </View>
                ) : null}
              </View>
              {/* 5. Note */}
              {pay.length ? (
                <T style={anyAbove ? { fontSize: 8.5, lineHeight: 1.45, color: C.ink2, marginTop: 5, paddingTop: 4, borderTopWidth: HAIR, borderTopColor: C.rule2 } : { fontSize: 8.5, lineHeight: 1.45, color: C.ink2 }}>
                  {breakable(pay.join('\n'))}
                </T>
              ) : null}
            </View>
          ) : null}

          {/* Footer notes */}
          <View fixed style={{ position: 'absolute', left: FRAME.side, right: FRAME.side, top: 842 - 66 - 50, borderLeftWidth: 3, borderLeftColor: C.red, paddingLeft: 12, paddingVertical: 2 }}>
            {FOOTER_LINES(days || blankMark('[N]')).map((l, i) => (
              <T key={i} style={{ fontSize: 8.5, lineHeight: 1.5, color: i === 2 ? C.ink : C.ink2, fontWeight: i === 2 ? 600 : 400 }}>{rich(l)}</T>
            ))}
          </View>
        </ContentPage>
      </AgreementDocument>,
    );
  },
};

registerTemplate(billingStatementV1);
