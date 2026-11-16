/**
 * Dev-only agreement template for local tests of the e-signature platform before the real templates
 * land. Registered ONLY when AGREEMENTS_DEV_TEMPLATE=1 (set on local test servers, never in Railway).
 */
import { createElement as h } from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { registerTemplate } from '@/lib/agreements/templates/all';
import type { AgreementTemplate } from '@/lib/agreements/templates/types';
import { isLocalTestServer } from '@/lib/server/agreements/mail';

/** Fails closed: the flag alone is not enough; the server must also be a local test server. */
const DEV_TEMPLATES_ON = process.env.AGREEMENTS_DEV_TEMPLATE === '1' && isLocalTestServer();
if (process.env.AGREEMENTS_DEV_TEMPLATE === '1' && !DEV_TEMPLATES_ON) {
  console.error('[agreements] AGREEMENTS_DEV_TEMPLATE is set on a server with production settings: dev templates NOT loaded. Remove it.');
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica', lineHeight: 1.5 },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 12 },
  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  p: { marginBottom: 6 },
  foot: { position: 'absolute', bottom: 24, left: 48, right: 48, fontSize: 8, color: '#666' },
});

export const DEV_TEMPLATE_ID = 'dev-simple-v1';

export const devTemplate: AgreementTemplate = {
  id: DEV_TEMPLATE_ID,
  name: 'Dev test agreement (local only)',
  description: 'A two-page test agreement for local testing of signing, tracking and completion.',
  action: 'sign',
  countersign: true,
  fields: [
    { key: 'clientName', label: 'Client company', type: 'text', required: true, default: 'Test Client Inc.', group: 'Client' },
    { key: 'monthlyFee', label: 'Monthly fee (PHP)', type: 'money', required: true, default: '150000', group: 'Pricing' },
    { key: 'startDate', label: 'Start date', type: 'date', default: '2026-12-01', group: 'Dates' },
    { key: 'notes', label: 'Scope notes', type: 'textarea', default: 'Outbound appointment setting for B2B services.', group: 'Scope' },
  ],
  signerForm: [
    { key: 'package', label: 'Package', kind: 'choice', required: true, options: ['Starter', 'Growth', 'Scale'] },
    { key: 'acceptTerms', label: 'I accept the terms in this agreement', kind: 'confirm', required: true },
  ],
  title: (v) => `Test Agreement: ${v.clientName || 'Client'}`,
  async render(v) {
    const doc = h(
      Document,
      { title: `Test Agreement ${v.clientName || ''}`, producer: 'Appointmentlyy', creator: 'Appointmentlyy' },
      h(
        Page,
        { size: 'A4', style: styles.page },
        h(Text, { style: styles.h1 }, `Test Agreement for ${v.clientName || 'Client'}`),
        h(Text, { style: styles.p }, 'This document is used only to test the Appointmentlyy e-signature flow on a local server.'),
        h(Text, { style: styles.h2 }, '1. Fees'),
        h(Text, { style: styles.p }, `Monthly fee: PHP ${v.monthlyFee || '0'}. Start date: ${v.startDate || 'to be agreed'}.`),
        h(Text, { style: styles.h2 }, '2. Scope'),
        h(Text, { style: styles.p }, v.notes || ''),
        h(Text, { style: styles.foot, fixed: true }, 'Appointmentlyy test agreement'),
      ),
      h(
        Page,
        { size: 'A4', style: styles.page },
        h(Text, { style: styles.h2 }, '3. Acceptance'),
        h(View, null, h(Text, { style: styles.p }, 'The client picks a package in the signing panel. Signatures are added on the Execution page.')),
        h(Text, { style: styles.foot, fixed: true }, 'Appointmentlyy test agreement'),
      ),
    );
    return new Uint8Array(await renderToBuffer(doc));
  },
};

if (DEV_TEMPLATES_ON) registerTemplate(devTemplate);

/** Dev-only billing statement ('view'): exercises numbering, payments and the PAID stamp locally. */
export const devBillingTemplate: AgreementTemplate = {
  id: 'dev-billing-v1',
  name: 'Dev test billing statement (local only)',
  description: 'A one-page test billing statement for local testing of tracking, numbering and payments.',
  action: 'view',
  countersign: false,
  fields: [
    { key: 'billToName', label: 'Bill to', type: 'text', required: true, default: 'Test Client Inc.', group: 'Bill to' },
    { key: 'statementNo', label: 'Statement no.', type: 'text', default: '', group: 'Statement', help: 'Filled in automatically when sent.' },
    { key: 'dueDate', label: 'Due date', type: 'date', default: '2026-12-31', group: 'Statement' },
    { key: 'lineItems', label: 'Line items (description | qty | unit price)', type: 'textarea', required: true, default: 'Build fee, first 50% | 1 | 7500', group: 'Amounts' },
    { key: 'paymentInstructions', label: 'Payment instructions', type: 'textarea', default: '', group: 'Payment' },
    { key: 'paymentLink', label: 'Payment link (https://)', type: 'text', default: '', group: 'Payment' },
    { key: 'paymentQr', label: 'Payment QR code', type: 'text', default: '', group: 'Payment' },
    { key: 'bankName', label: 'Bank name', type: 'text', default: '', group: 'Bank transfer' },
    { key: 'bankAccountName', label: 'Account name', type: 'text', default: '', group: 'Bank transfer' },
    { key: 'bankAccountNumber', label: 'Account number', type: 'text', default: '', group: 'Bank transfer' },
    { key: 'bankSwift', label: 'SWIFT/BIC', type: 'text', default: '', group: 'Bank transfer' },
    { key: 'bankBranch', label: 'Branch / address (optional)', type: 'text', default: '', group: 'Bank transfer' },
    { key: 'bankCurrency', label: 'Account currency', type: 'text', default: '', group: 'Bank transfer' },
    { key: 'paypalLink', label: 'PayPal link', type: 'text', default: '', group: 'PayPal' },
    { key: 'paypalFeeNote', label: 'PayPal fee note', type: 'text', default: '', group: 'PayPal' },
  ],
  signerForm: [],
  title: (v) => `Billing statement ${v.statementNo || '(draft)'}: ${v.billToName || 'Client'}`,
  async render(v) {
    const doc = h(
      Document,
      { title: `Billing statement ${v.statementNo || ''}`, producer: 'Appointmentlyy', creator: 'Appointmentlyy' },
      h(
        Page,
        { size: 'A4', style: styles.page },
        h(Text, { style: styles.h1 }, 'Billing Statement'),
        h(Text, { style: styles.p }, `No. ${v.statementNo || '(assigned when sent)'} · Due ${v.dueDate || '-'}`),
        h(Text, { style: styles.p }, `Bill to: ${v.billToName || ''}`),
        h(Text, { style: styles.h2 }, 'Items'),
        h(Text, { style: styles.p }, v.lineItems || ''),
        h(Text, { style: styles.h2 }, 'Payment instructions'),
        h(Text, { style: styles.p }, v.paymentInstructions || ''),
        h(Text, { style: styles.p }, [v.bankName, v.bankAccountName, v.bankAccountNumber, v.bankSwift].filter(Boolean).join(' / ')),
        h(Text, { style: styles.foot, fixed: true }, 'Appointmentlyy test billing statement'),
      ),
    );
    return new Uint8Array(await renderToBuffer(doc));
  },
};

if (DEV_TEMPLATES_ON) registerTemplate(devBillingTemplate);
