/**
 * Template `billing-statement-v1` (brief §8b): a one-page Billing Statement, i.e. a payment request
 * (NOT a BIR invoice; the BIR invoice is issued when payment arrives). action 'view': no signature,
 * tracked viewing; the platform manages unpaid/paid/overdue and stamps "PAID".
 *
 * Bank details are never hard-coded: `paymentInstructions` defaults to a highlighted placeholder and
 * the platform pre-fills it from the owner's Agreements settings. `statementNo` is filled by the
 * platform's sequential numbering (APY-SOA-2026-0001).
 */
import { Image, Link, View } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { addBusinessDaysIso, blankMark, formatAmount, formatDate, lines, parseMoney, valueOrMark, withDefaults } from './pdf/format';
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
  {
    group: 'Payment', key: 'paymentInstructions', label: 'Payment instructions (Wise USD account)', type: 'textarea', required: true, default: '',
    help: 'Pre-filled from Agreements settings. One line per detail (account name, account number, routing, bank, address).',
  },
  {
    group: 'Payment', key: 'paymentLink', label: 'Payment link (https://)', type: 'text', required: false, default: '',
    help: 'e.g. a Wise payment link. Shown as a "Pay now" button and printed in full. https:// only.',
  },
  {
    group: 'Payment', key: 'paymentQr', label: 'Payment QR code', type: 'text', required: false, default: '',
    help: 'Set by the platform from the uploaded image: a data:image/png;base64 or data:image/jpeg;base64 string. Anything else is ignored.',
  },
  { group: 'Issuer', key: 'appyProprietor', label: 'Issuer legal name', type: 'text', required: true, default: 'Emil Libatique Halili' },
  { group: 'Issuer', key: 'appySignerTitle', label: 'Issuer capacity', type: 'text', required: true, default: 'Independent Contractor (Appointmentlyy)' },
  { group: 'Issuer', key: 'appyTin', label: 'Issuer TIN', type: 'text', required: true, default: '271-163-899-00000' },
  { group: 'Issuer', key: 'appyAddress', label: 'Issuer address', type: 'text', required: true, default: 'Lot 22 Blk 11 Avocado St., Trinidad Village, Calibutbut, 2001 Bacolor, Pampanga' },
];

/** QR printed at about 32 mm square. */
const QR_SIZE = 90.7;
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
  description: 'A one-page payment request (USD, via Wise). Not a BIR invoice: that is issued when payment is received.',
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
    const pay = lines(v.paymentInstructions);
    const link = safePaymentLink(v.paymentLink);
    const qr = safeQrDataUrl(values.paymentQr ?? '');

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

          {/* Payment instructions */}
          <View wrap={false} style={{ marginTop: 24, backgroundColor: C.paper2, borderTopWidth: HAIR, borderTopColor: C.rule2, padding: 14, flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: qr ? 16 : 0 }}>
              <T style={{ fontSize: 10.5, fontWeight: 600, marginBottom: 4 }}>How to pay</T>
              <T style={{ fontSize: 9.5, lineHeight: 1.55, color: C.ink2 }}>
                {pay.length
                  ? breakable(pay.join('\n'))
                  : rich(blankMark('[Wise USD account details: set the default in Agreements settings]'))}
              </T>
              <T style={{ fontSize: 9, lineHeight: 1.5, color: C.ink2, marginTop: 6 }}>{rich(`Please quote **${valueOrMark(v.statementNo, 'statement no.')}** as the payment reference.`)}</T>
              {link ? (
                <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
                  <Link src={link} style={{ textDecoration: 'none' }}>
                    <View style={{ backgroundColor: C.red, borderRadius: 3, paddingVertical: 6, paddingHorizontal: 16 }}>
                      <T style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: 700, letterSpacing: em(0.02, 10.5), lineHeight: 1.3 }}>Pay now</T>
                    </View>
                  </Link>
                  <Link src={link} style={{ textDecoration: 'none', marginTop: 4 }}>
                    <T style={{ fontSize: 7.5, lineHeight: 1.4, color: C.muted }}>{breakable(link)}</T>
                  </Link>
                </View>
              ) : v.paymentLink ? (
                <T style={{ fontSize: 9, marginTop: 10 }}>{rich(blankMark('[payment link must be a valid https:// URL]'))}</T>
              ) : null}
            </View>
            {qr ? (
              <View style={{ width: QR_SIZE, alignItems: 'center' }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt; captioned below */}
                <Image src={qr} style={{ width: QR_SIZE, height: QR_SIZE, objectFit: 'contain' }} />
                <T style={{ fontSize: 8, color: C.ink2, marginTop: 4, fontWeight: 600 }}>Scan to pay</T>
              </View>
            ) : null}
          </View>

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
