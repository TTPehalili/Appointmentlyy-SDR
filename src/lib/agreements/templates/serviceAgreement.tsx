/**
 * Template `service-agreement-v1`: a standalone Service Agreement, for any client. It is the contract on
 * its own, without the sales-proposal pages (no market comparison, no "why us", no pricing pages).
 *
 * Main terms (parties, services and deliverables, fees and payment, timeline, term and termination,
 * acceptance), then Annex A (UAT, with the specimen Sign-off Certificate) and Annex B. The platform
 * appends the Execution page; signatures are NOT drawn here.
 *
 * The wording is ported from `proposal-growth-v2` (its Terms, its Annex A swaps and its Annex B) and the
 * billing statement. Annex A and Annex B are built ON TOP of v2's annex text (exported from
 * proposalGrowthV2.tsx), so v2's swaps are reused, not rewritten. Every swap here must match exactly
 * once, so a change to the source text fails loudly instead of silently.
 *
 * Wording that is NEW (not ported) is wrapped in NEW(...): the owner's lawyer reviews each of those.
 * Defaults are generic: no client-specific names, dates or prices.
 */
import type { ReactNode } from 'react';
import { View } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { SignerFormField, TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { ANNEX_A_TITLE, ANNEX_B_TITLE, CERT_ACCEPTANCE_STATEMENT, CERT_DELIVERABLES } from './annexText';
import { ANNEX_A_V2_MD, ANNEX_B_V2_MD } from './proposalGrowthV2';
import { blankMark, fillTokens, formatAmount, formatDate, lines, paragraphs, parseMoney, valueOrMark, withDefaults } from './pdf/format';
import { AgreementDocument, C, ContentPage, HAIR, Lockup, Rich, T, docDate, em, renderPdf, rich, sty, type Style } from './pdf/kit';
import { AnnexH2, AnnexKicker, AnnexSign, Certificate, LegalMarkdown } from './pdf/legal';

const ID = 'service-agreement-v1';
const RUN = 'Service Agreement';

/** Marks wording that is NEW in this template (not ported from v2, its annexes or the billing statement): for legal review. */
const NEW = (s: string) => s;

const INCLUDE = ['Include', 'Exclude'];

/** The 10 standard build deliverables (the Certificate's list), as the default deliverables text. */
const STANDARD_DELIVERABLES = CERT_DELIVERABLES.map(([, d]) => d).join('\n');

/* ---------------- fields ---------------- */

const FIELDS: TemplateField[] = [
  { group: 'Client', key: 'clientLegal', label: 'Client legal name', type: 'text', required: true, default: '' },
  { group: 'Client', key: 'clientShort', label: 'Client short name', type: 'text', required: true, default: '', help: 'Used throughout the agreement and annexes.' },
  { group: 'Client', key: 'clientCity', label: 'Client city / province', type: 'text', required: true, default: '', help: 'Also where any onsite training days take place.' },
  { group: 'Client', key: 'clientSecNo', label: 'Client SEC registration no.', type: 'text', default: '', help: 'Optional: left blank, it is left out of the agreement.' },
  { group: 'Client', key: 'clientStreet', label: 'Client street address', type: 'text', default: '', help: 'Street part only; the city / province follows it. Optional: left blank, it is left out of the agreement.' },
  { group: 'Appointmentlyy', key: 'appyProprietor', label: 'Appointmentlyy party: legal name', type: 'text', required: true, default: 'Emil Libatique Halili' },
  { group: 'Appointmentlyy', key: 'appyTin', label: 'TIN', type: 'text', required: true, default: '271-163-899-00000' },
  { group: 'Appointmentlyy', key: 'appyAddress', label: 'Business address', type: 'text', required: true, default: 'Lot 22 Blk 11 Avocado St., Trinidad Village, Calibutbut, 2001 Bacolor, Pampanga' },
  { group: 'Appointmentlyy', key: 'appySignerTitle', label: 'Signer title', type: 'text', required: true, default: 'Independent Contractor (Appointmentlyy)' },
  { group: 'Dates', key: 'agreementDate', label: 'Agreement date', type: 'date', required: true, default: '' },
  {
    group: 'Services', key: 'servicesSummary', label: 'Services summary (clause 2.1)', type: 'textarea', required: true,
    default: 'A custom build of the Appointmentlyy platform around the client’s services, buyers and brand, delivered before Go-live, followed by the monthly subscription.',
    help: 'A blank line starts a new paragraph.',
  },
  {
    group: 'Services', key: 'deliverables', label: 'Deliverables (clause 2.2), one per line', type: 'textarea', required: true, default: STANDARD_DELIVERABLES,
    help: 'Numbered 01, 02 … in clause 2.2 and in the UAT Sign-off Certificate. These are what UAT tests.',
  },
  {
    group: 'Services', key: 'enablement', label: 'Founder-led sales enablement (clause 2.3, Annex A cl. 10B)', type: 'select', required: true, options: INCLUDE, default: 'Include',
    help: 'Exclude: no training text and no clause 10B.',
  },
  { group: 'Services', key: 'trainingOnsiteDays', label: 'Enablement: onsite days', type: 'select', options: ['1', '2', '3', '4', '5'], default: '2' },
  { group: 'Services', key: 'trainingSessions', label: 'Enablement: weekly remote sessions (30 days after Go-live)', type: 'select', options: ['1', '2', '3', '4'], default: '4' },
  { group: 'Services', key: 'trainingWindow', label: 'Enablement: onsite training window', type: 'text', default: '', help: 'Completes "onsite days … in …" and "Training starts in …", e.g. "the 2nd week of March 2027".' },
  { group: 'Fees', key: 'buildFee', label: 'Setup (custom build) fee (USD)', type: 'money', required: true, default: '' },
  { group: 'Fees', key: 'originalFee', label: 'Original price (USD, optional)', type: 'money', default: '', help: 'Shown as "down from …" when above the setup fee. Leave blank for none.' },
  { group: 'Fees', key: 'setupPayments', label: 'Number of setup payments', type: 'select', required: true, options: ['1', '2'], default: '2', help: '1: in full on signing. 2: equal payments, the 2nd at UAT sign-off and Go-live or the date below, whichever comes first.' },
  { group: 'Fees', key: 'secondPaymentBy', label: 'Second payment no later than', type: 'date', default: '', help: 'Only with 2 payments. Left blank, it shows as a yellow placeholder.' },
  { group: 'Fees', key: 'monthlyFee', label: 'Monthly fee (USD)', type: 'money', required: true, default: '' },
  { group: 'Fees', key: 'monthlyStart', label: 'Monthly fee billed from', type: 'text', required: true, default: 'Go-live', help: 'Completes "billed monthly from …".' },
  { group: 'Fees', key: 'noticeDays', label: 'Cancellation notice (days)', type: 'number', required: true, default: '30' },
  { group: 'Fees', key: 'paymentDays', label: 'Payment term (Business Days)', type: 'number', required: true, default: '3' },
  { group: 'Schedule', key: 'buildMonth', label: 'Build phase (month)', type: 'text', required: true, default: '', help: 'E.g. "March 2027". The Readiness Notice is due by its last Business Day (Annex A, clause 2A).' },
  { group: 'Schedule', key: 'onTimePromise', label: 'On-time promise with build-fee refund (Annex A cl. 2B)', type: 'select', required: true, options: INCLUDE, default: 'Include' },
  {
    group: 'Legal', key: 'liquidatedDamages', label: 'Liquidated damages amount, Annex B cl. 12.2(b) (breach of cl. 6.1 or 6.3)', type: 'money', default: '3000000',
    help: 'In the currency below. Leave blank to use 3 × the setup fee in USD.',
  },
  { group: 'Legal', key: 'ldCurrency', label: 'Liquidated damages currency', type: 'select', required: true, options: ['PHP', 'USD'], default: 'PHP' },
  { group: 'Legal', key: 'courtVenue', label: 'Court venue (Annex B cl. 15.5)', type: 'text', required: true, default: 'Angeles City, Pampanga', help: 'Completes "filed exclusively in the proper courts of …".' },
  { group: 'Legal', key: 'arbitrationSeat', label: 'Mediation venue and arbitration seat (Annex B cl. 15.3–15.4)', type: 'text', required: true, default: 'Angeles City, Pampanga' },
];

/* ---------------- derived values ---------------- */

interface Money { n: number | null; s: string }

/** "USD 10,000", or a yellow placeholder. */
function money(raw: string, label: string): Money {
  const n = parseMoney(raw);
  return { n, s: n === null ? blankMark(`[${label}]`) : `USD ${formatAmount(n)}` };
}

/** A whole number of days, or a yellow placeholder. */
function days(raw: string, label: string): string {
  const t = (raw ?? '').trim();
  return /^\d{1,3}$/.test(t) && Number(t) > 0 ? String(Number(t)) : blankMark(`[${label}]`);
}

const plural = (n: string, one: string, many: string) => `${n} ${n === '1' ? one : many}`;

function compute(v: Record<string, string>) {
  const build = money(v.buildFee, 'setup fee');
  const monthly = money(v.monthlyFee, 'monthly fee');
  const half: Money = build.n === null ? { n: null, s: blankMark('[fill in the setup fee]') } : { n: build.n / 2, s: `USD ${formatAmount(build.n / 2)}` };
  const origN = parseMoney(v.originalFee);
  const original: Money | null = origN !== null && build.n !== null && origN > build.n ? { n: origN, s: `USD ${formatAmount(origN)}` } : null;
  const ldIn = parseMoney(v.liquidatedDamages);
  const ldText = ldIn !== null
    ? `${v.ldCurrency === 'USD' ? 'USD' : 'PHP'} ${formatAmount(ldIn)}`
    : build.n !== null ? `USD ${formatAmount(3 * build.n)}` : `USD ${blankMark('[fill in the fees]')}`;
  return {
    build, monthly, half, original, ldText,
    twoPayments: v.setupPayments !== '1',
    training: v.enablement !== 'Exclude',
    onTime: v.onTimePromise !== 'Exclude',
    notice: days(v.noticeDays, 'notice days'),
    payDays: days(v.paymentDays, 'payment days'),
    onsite: /^[1-5]$/.test(v.trainingOnsiteDays) ? v.trainingOnsiteDays : '2',
    sessions: /^[1-4]$/.test(v.trainingSessions) ? v.trainingSessions : '4',
  };
}
type M = ReturnType<typeof compute>;

/* ---------------- Annex A and the certificate (on top of v2) ---------------- */

function swapOnce(src: string, from: string, to: string): string {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`${ID} Annex A: expected 1 match, found ${n}: ${from.slice(0, 60)}`);
  return src.replace(from, () => to);
}

/** Remove the whole paragraph (blank-line separated) that starts with `head`. */
function cutParagraph(src: string, head: string): string {
  const at = src.indexOf(`\n\n${head}`);
  if (at < 0 || src.indexOf(`\n\n${head}`, at + 1) >= 0) throw new Error(`${ID} Annex A: paragraph not found exactly once: ${head}`);
  const end = src.indexOf('\n\n', at + 2);
  return src.slice(0, at) + (end < 0 ? '' : src.slice(end));
}

export function buildAnnexA(m: Pick<M, 'twoPayments' | 'training' | 'onTime'>): string {
  let a = ANNEX_A_V2_MD;
  a = swapOnce(a,
    '"Agreement" means the proposal dated {{proposalDate}}, the signed Acceptance page, and Annexes A and B. Where the proposal body and an Annex conflict, the Annex prevails.',
    NEW('"Agreement" means the Service Agreement dated {{agreementDate}}, with its signed Acceptance and Execution page, and Annexes A and B. Where the main terms of the Service Agreement and an Annex conflict, the Annex prevails.'));
  if (!m.twoPayments) {
    a = swapOnce(a, ' The second half of the build fee is due at sign-off, or on the fixed date in clause 9 if that comes first.', '');
  }
  a = swapOnce(a,
    'The build consists of workstreams 01 to 10 in section 04 of the proposal (the "Deliverables"). Workstream 11 (Founder-led sales enablement) is governed by clause 10B and is not a Deliverable.',
    NEW('The build consists of the deliverables listed in clause 2.2 of the Service Agreement (the "Deliverables").')
      + (m.training ? NEW(' The founder-led sales enablement in clause 2.3 of the Service Agreement is governed by clause 10B and is not a Deliverable.') : ''));
  a = swapOnce(a,
    'Workstreams 01 (Discovery), 07 (Accounts, testing and cost estimate) and 09 (Training and go-live) are services and are accepted once performed.',
    NEW('Deliverables that are services, such as discovery, account set-up and testing, and training, are accepted once performed.'));
  if (!m.training) a = swapOnce(a, ' Training starts in {{trainingWindow}} (clause 10B).', '');
  if (!m.onTime) a = cutParagraph(a, '**2B. On-time promise.**');
  a = swapOnce(
    a,
    'Except under clause 2B (on-time promise), the build fee is non-refundable',
    m.onTime
      ? NEW('Except under clause 2B (on-time promise) and clause 5.3 of the Service Agreement (Appointmentlyy ending the Agreement before Go-live), the build fee is non-refundable')
      : NEW('Except under clause 5.3 of the Service Agreement (Appointmentlyy ending the Agreement before Go-live), the build fee is non-refundable'),
  );
  a = swapOnce(a,
    'The build fee is USD {{buildFee}}, paid in 2 equal payments. The first 50% (USD {{buildHalf}}) is payable on signing. The second 50% of the build fee (USD {{buildHalf}}) is invoiced at UAT sign-off and Go-live, or on {{secondPaymentBy}}, whichever comes first, and is payable within 3 Business Days.',
    m.twoPayments
      ? 'The build fee is USD {{buildFee}}, paid in 2 equal payments. The first 50% (USD {{buildHalf}}) is payable on signing. The second 50% of the build fee (USD {{buildHalf}}) is invoiced at UAT sign-off and Go-live, or on {{secondPaymentBy}}, whichever comes first, and is payable within {{paymentDays}} Business Days.'
      : NEW('The build fee is USD {{buildFee}}, payable in full on signing.'));
  a = swapOnce(a,
    'discovery and targeting, workspace configuration, writing the playbook and objection bank, designing the AI practice personas, building lead lists, writing the campaign kit, setting up and testing accounts, setting up reporting, training and go-live support, and the build-phase sessions of workstream 11.',
    NEW('the work to deliver the Deliverables in clause 2.2 of the Service Agreement') + (m.training ? NEW(', and the build-phase sessions of the founder-led sales enablement (clause 10B)') : '') + '.');
  if (m.training) {
    a = swapOnce(a,
      '**10B. Founder-led sales enablement (workstream 11).** Workstream 11 is a professional training',
      NEW('**10B. Founder-led sales enablement.** The founder-led sales enablement in clause 2.3 of the Service Agreement is a professional training'));
    a = swapOnce(a, '(b) 2 onsite days at', '(b) {{onsiteDaysText}} at');
    a = swapOnce(a, '(c) 4 remote coaching and mentoring sessions', '(c) {{sessionsText}}');
  } else {
    a = cutParagraph(a, '**10B. Founder-led sales enablement (workstream 11).**');
  }
  return a;
}

/** With 1 setup payment there is no second 50% to fall due at sign-off. */
const CERT_STATEMENT_ONE_PAYMENT = swapOnce(CERT_ACCEPTANCE_STATEMENT, ' The second 50% of the build fee is now due under Annex A clause 9.', '');

function annexVars(v: Record<string, string>, m: M): Record<string, string> {
  const secNo = (v.clientSecNo ?? '').trim();
  return {
    appyProprietor: valueOrMark(v.appyProprietor, 'Appointmentlyy legal name'),
    appyTin: valueOrMark(v.appyTin, 'TIN'),
    appyAddress: valueOrMark(v.appyAddress, 'business address'),
    clientShort: valueOrMark(v.clientShort, 'client short name'),
    clientLegal: valueOrMark(v.clientLegal, 'client legal name'),
    clientSecPart: secNo ? `, SEC registration no. ${secNo}` : '',
    clientAddressLine: [(v.clientStreet ?? '').trim(), valueOrMark(v.clientCity, 'city / province')].filter(Boolean).join(', '),
    clientCity: valueOrMark(v.clientCity, 'city / province'),
    agreementDate: valueOrMark(formatDate(v.agreementDate), 'agreement date'),
    buildFee: m.build.n === null ? m.build.s : formatAmount(m.build.n),
    buildHalf: m.half.n === null ? m.half.s : formatAmount(m.half.n),
    secondPaymentBy: valueOrMark(formatDate(v.secondPaymentBy), 'second payment date'),
    paymentDays: m.payDays,
    buildMonth: valueOrMark(v.buildMonth, 'build month'),
    trainingWindow: valueOrMark(v.trainingWindow, 'training window'),
    onsiteDaysText: plural(m.onsite, 'onsite day', 'onsite days'),
    sessionsText: plural(m.sessions, 'remote coaching and mentoring session', 'remote coaching and mentoring sessions'),
    liquidatedDamagesText: m.ldText,
    courtVenue: valueOrMark(v.courtVenue, 'court venue'),
    arbitrationSeat: valueOrMark(v.arbitrationSeat, 'arbitration seat'),
  };
}

/* ---------------- main terms ---------------- */

type Item = { n: string; title: string; text: string; list?: string[] };
type Clause = { n: string; title: string; items: Item[] };

function mainTerms(v: Record<string, string>, m: M, av: Record<string, string>): Clause[] {
  const cs = av.clientShort;
  const month = av.buildMonth;
  const window = av.trainingWindow;
  const down = m.original ? `, down from ${m.original.s}` : '';
  const deliverables = lines(v.deliverables);
  const summary = paragraphs(v.servicesSummary);

  const services: Item[] = [
    { n: '2.1', title: 'Services', text: summary.length ? summary.join('\n') : blankMark('[services summary]') },
    {
      n: '2.2', title: 'Deliverables',
      text: NEW('Appointmentlyy delivers the following before Go-live (the "Deliverables"). Their testing and acceptance follow Annex A (User Acceptance Testing).'),
      list: deliverables.length ? deliverables : [blankMark('[deliverables, one per line]')],
    },
  ];
  if (m.training) {
    services.push({
      n: '2.3', title: 'Founder-led sales enablement',
      text: `Training, coaching and mentoring with Emil Halili, founder of Appointmentlyy: ${plural(m.onsite, 'onsite day', 'onsite days')} at ${cs}’s site in ${av.clientCity}, in ${window}, and ${plural(m.sessions, 'weekly session', 'weekly sessions')} on Google Meet in the first 30 days after go-live, with working sessions with ${cs}’s sales lead during the build. Appointmentlyy’s travel costs are included. Training, coaching and mentoring share experience and best practice. Results depend on ${cs}’s people, offer and market, so this is not a commitment to any level of performance, meetings, sales or production targets. Extra onsite days or coaching sessions are available on request (Annex A, clause 10B).`,
    });
  }
  let k = services.length;
  const next = () => `2.${++k}`;
  services.push(
    { n: next(), title: 'What the monthly fee covers', text: 'Hosting for unlimited users, every new feature and update as Appointmentlyy releases it, support with the response targets below, and ongoing security updates.' },
    { n: next(), title: 'Support response targets (business hours)', text: 'Critical within 1 hour, High within 4 hours, Normal within 1 business day.' },
    { n: next(), title: 'Usage costs', text: `${cs} owns every provider account and pays each provider directly, at cost. Those providers bill ${cs} directly for AI, voice, email and lead data. Appointmentlyy connects and tests them with ${cs}’s technical point of contact during the build.` },
    { n: next(), title: 'Data', text: 'Each workspace is private, and no data is shared between clients (Annex B, clauses 7 and 10).' },
  );

  const fee = m.twoPayments
    ? `The one-time custom build fee (the "build fee") is ${m.build.s}${down}, in 2 equal payments of ${m.half.s}. The 1st is due on signing. The 2nd is due at UAT sign-off and go-live, or on ${av.secondPaymentBy}, whichever comes first.`
    : `The one-time custom build fee (the "build fee") is ${m.build.s}${down}, ${NEW('payable in full on signing.')}`;
  const fees: Item[] = [
    { n: '3.1', title: 'Setup fee', text: fee },
    { n: '3.2', title: 'Monthly fee', text: `${m.monthly.s} a month, billed monthly from ${valueOrMark(formatDate(v.monthlyStart), 'monthly fee start')}. No long-term commitment: ${cs} may cancel with ${m.notice} days’ notice (clause 5.2).` },
    {
      n: '3.3', title: 'Payment terms',
      text: `${NEW(`Unless this clause 3 says otherwise, each invoice is payable within ${m.payDays} Business Days (as defined in Annex A, clause 3).`)} Transfer fees are paid by the sender, so the full amount is received. Late amounts carry interest at 1% per month. Appointmentlyy may suspend access after 10 days' written notice of non-payment. Fees exclude VAT and other taxes. If ${cs} withholds tax, it delivers BIR Form 2307 promptly.`,
    },
    { n: '3.4', title: 'Refunds', text: NEW(m.onTime ? 'The build fee is non-refundable except as set out in clause 5.3 and Annex A, clauses 2B and 10. Annex A, clauses 9 and 10 apply to all payments.' : 'The build fee is non-refundable except as set out in clause 5.3 and Annex A, clause 10. Annex A, clauses 9 and 10 apply to all payments.') },
  ];

  const timeline: Item[] = [
    { n: '4.1', title: 'Build phase', text: `${month} is the technical build phase: Appointmentlyy’s team builds and configures the platform, and ${cs}’s team needs very little time beyond the technical point of contact. Appointmentlyy will issue the Readiness Notice by the last Business Day of ${month} (the "Target Date", Annex A, clause 2A).` },
    { n: '4.2', title: 'Technical point of contact', text: `For the build phase, ${cs} names one technical point of contact whom Appointmentlyy may contact directly. The technical point of contact supports the information transfers the build needs (accounts and access, settings and content) and takes part in a few short tests before the end of the build phase.` },
    { n: '4.3', title: 'Client Delay', text: `Delays on ${cs}’s side extend the deadline day for day (Annex A, clause 2A). If the technical point of contact is unavailable, the affected dates move under Annex A, clause 2A (Client Delay); this does not change the payment dates or the fees.` },
  ];
  if (m.onTime) timeline.push({ n: '4.4', title: 'On-time promise', text: `Ready for UAT by the end of ${month}. If Appointmentlyy misses it for reasons not caused by ${cs}’s team, ${cs} can cancel and get its build payment back (Annex A, clauses 2A and 2B).` });
  timeline.push({ n: `4.${timeline.length + 1}`, title: 'UAT and Go-live', text: NEW('Acceptance testing, sign-off and Go-live follow Annex A. "Go-live" has the meaning in Annex A, clause 9.') });

  const term: Item[] = [
    { n: '5.1', title: 'Term', text: `${NEW('The Agreement starts on signing and continues until it ends under this clause 5.')} No long-term commitment.` },
    { n: '5.2', title: 'Cancellation', text: `${cs} may cancel with ${m.notice} days’ notice. ${NEW('The Agreement ends when the notice period ends. Notices go by email under Annex B, clause 16.3.')} ${NEW(`If ${cs} cancels before Go-live, the full build fee, including any payment under clause 3.1 not yet paid, stays payable and falls due on the date the cancellation takes effect. This does not apply when ${cs} terminates under clause 5.4.`)}` },
    { n: '5.3', title: 'Ending by Appointmentlyy', text: NEW(`Appointmentlyy may end the Agreement without cause by giving ${cs} at least ${m.notice} days’ written notice. Monthly fees stop when the notice period ends, and any monthly fee paid for a later period is refunded pro rata. If Appointmentlyy ends the Agreement under this clause before Go-live, it refunds the build fee ${cs} has paid, and no further build fee is due.`) },
    { n: '5.4', title: 'Termination for cause', text: NEW(`Either party may also terminate under Annex B, clause 12.3 (material breach not cured, a breach that cannot be cured, insolvency)${m.onTime ? `, and ${cs} may terminate for late delivery under Annex A, clause 2B` : ''}.`) },
    { n: '5.5', title: 'Effect of termination', text: `Accrued fees stay payable. ${NEW('Annex A, clause 10 (refunds) and Annex B, clause 12.4 (data export and survival) apply.')}` },
  ];

  return [
    {
      n: '1', title: 'Parties',
      items: [
        { n: '1.1', title: 'Appointmentlyy', text: `${av.appyProprietor}, a resident Filipino citizen and independent contractor who provides the Appointmentlyy platform and services under the Appointmentlyy brand (TIN ${av.appyTin}), of ${av.appyAddress} ("Appointmentlyy").` },
        { n: '1.2', title: 'Client', text: `${av.clientLegal}${av.clientSecPart}, of ${av.clientAddressLine} ("${cs}").` },
        { n: '1.3', title: 'The Agreement', text: `These main terms, Annex A (User Acceptance Testing) and Annex B (Non-compete, Non-solicitation, Confidentiality and IP Safeguards) together form the Service Agreement (the "Agreement"). Where the main terms and an Annex conflict, the Annex prevails.` },
      ],
    },
    { n: '2', title: 'Services', items: services },
    { n: '3', title: 'Fees and payment', items: fees },
    { n: '4', title: 'Timeline', items: timeline },
    { n: '5', title: 'Term and termination', items: term },
  ];
}

/* ---------------- layout ---------------- */

const bodyText: Style = { fontSize: 9.5, lineHeight: 1.55, color: C.ink2 };

function TitleBlock({ v, av }: { v: Record<string, string>; av: Record<string, string> }) {
  const meta = (label: string, value: string, i: number) => (
    <View style={{ flex: 1, paddingLeft: i ? 14 : 0, paddingRight: 14, borderLeftWidth: i ? HAIR : 0, borderLeftColor: C.rule2 }}>
      <T style={[sty.label, { marginBottom: 2 }]}>{label}</T>
      <T style={{ fontSize: 9.5, lineHeight: 1.45, color: C.ink }}>{rich(value)}</T>
    </View>
  );
  return (
    <View style={{ marginBottom: 18 }} wrap={false}>
      <Lockup h={24} />
      <T style={{ marginTop: 30, fontSize: 30, lineHeight: 1.1, fontWeight: 800, letterSpacing: em(-0.03, 30) }}>Service Agreement</T>
      <T style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: C.ink2 }}>{rich(`Appointmentlyy and ${av.clientLegal}`)}</T>
      <View style={{ width: 48, height: 3, backgroundColor: C.red, marginTop: 16 }} />
      <View style={{ flexDirection: 'row', marginTop: 16, borderTopWidth: HAIR, borderTopColor: C.rule2, borderBottomWidth: HAIR, borderBottomColor: C.rule2, paddingVertical: 8 }}>
        {meta('Agreement date', valueOrMark(formatDate(v.agreementDate), 'agreement date'), 0)}
        {meta('Between', `Appointmentlyy and ${av.clientShort}`, 1)}
        {meta('Contents', 'Main terms, Annex A (UAT) and Annex B', 2)}
      </View>
    </View>
  );
}

function ClauseBlock({ c }: { c: Clause }) {
  return (
    <View style={{ marginBottom: 10 }}>
      {/* The rule lives on an unbreakable View so it never stays behind when the heading moves to the next page. */}
      <View minPresenceAhead={48} wrap={false} style={{ borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 6, marginBottom: 6 }}>
        <T style={{ fontSize: 12, fontWeight: 700, letterSpacing: em(-0.01, 12), lineHeight: 1.3, color: C.ink }}>{`${c.n}. ${c.title}`}</T>
      </View>
      {c.items.map((it) => (
        // Fixed-length clauses never split from their number; the owner's free text (2.1, 2.2 list) may run across pages.
        <View key={it.n} style={{ flexDirection: 'row', marginBottom: 5 }} wrap={it.n === '2.1' || !!it.list}>
          <T style={{ width: 26, fontSize: 9.5, lineHeight: 1.55, fontWeight: 600, color: C.ink }}>{it.n}</T>
          <View style={{ flex: 1 }}>
            {it.text.split('\n').map((p, i) => (
              <Rich key={i} text={i === 0 ? `**${it.title}.** ${p}` : p} style={[bodyText, i ? { marginTop: 3 } : {}]} />
            ))}
            {it.list ? (
              <View style={{ marginTop: 4 }}>
                {it.list.map((d, i) => (
                  <View key={i} style={{ flexDirection: 'row', paddingVertical: 2, borderBottomWidth: HAIR, borderBottomColor: C.rule }} wrap={false}>
                    <T style={{ width: 22, color: C.red, fontSize: 7.5, fontWeight: 700, lineHeight: 1.9, letterSpacing: em(0.08, 7.5) }}>{String(i + 1).padStart(2, '0')}</T>
                    <Rich text={d} style={[bodyText, { flex: 1 }]} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function Acceptance({ n, v, av }: { n: string; v: Record<string, string>; av: Record<string, string> }) {
  const cs = av.clientShort;
  const ph = (text: string, color: string) => (
    <View style={{ borderBottomWidth: 2, borderBottomColor: color, paddingBottom: 6, minHeight: 26, justifyContent: 'flex-end' }}>
      <T style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.35 }}>{rich(text)}</T>
    </View>
  );
  const field = (label: string, value: string) => (
    <View style={{ paddingTop: 8 }}>
      <T style={sty.label}>{label}</T>
      <View style={{ borderBottomWidth: 0.75, borderBottomColor: C.ink, minHeight: 20, justifyContent: 'flex-end', paddingBottom: 3 }}>
        <T style={{ fontSize: 10, lineHeight: 1.4 }}>{rich(value)}</T>
      </View>
    </View>
  );
  return (
    <View wrap={false} style={{ marginBottom: 10 }}>
      <T style={{ fontSize: 12, fontWeight: 700, letterSpacing: em(-0.01, 12), lineHeight: 1.3, color: C.ink, borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 6, marginBottom: 6 }}>
        {`${n}. Acceptance and execution`}
      </T>
      <Rich style={bodyText} text={`By signing, ${cs} accepts this Service Agreement, including Annex A and Annex B. Each signatory confirms they are authorised to sign.`} />
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <View style={{ flex: 1, marginRight: 28 }}>
          {ph(`For ${cs} (${av.clientLegal})`, C.ink)}
          <T style={{ marginTop: 8, fontSize: 8.5, lineHeight: 1.45, color: C.muted }}>Name, title and signature: recorded on the Execution page.</T>
        </View>
        <View style={{ flex: 1 }}>
          {ph('For Appointmentlyy', C.red)}
          {field('Name:', av.appyProprietor)}
          {field('Title:', valueOrMark(v.appySignerTitle, 'signer title'))}
        </View>
      </View>
      <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 8 }}>
        <T style={{ fontSize: 10.5, fontWeight: 600 }}>Signatures: see the Execution page at the end of this document.</T>
      </View>
    </View>
  );
}

function AnnexPage({ head, client, children }: { head: string; client: string; children: ReactNode }) {
  return (
    <ContentPage head={RUN} sub={head} client={client} style={{ paddingTop: 72 }}>
      {children}
    </ContentPage>
  );
}

function ServiceAgreementDocument({ values }: { values: Record<string, string> }) {
  const v = withDefaults(FIELDS, values);
  const m = compute(v);
  const client = v.clientShort || 'Client';
  const av = annexVars(v, m);
  const clauses = mainTerms(v, m, av);
  const sign = { clientHeader: `For ${av.clientShort} (${av.clientLegal})`, appyName: av.appyProprietor, appyTitle: valueOrMark(v.appySignerTitle, 'signer title') };
  const certRows = lines(v.deliverables).map((d, i) => [String(i + 1).padStart(2, '0'), d] as const);
  return (
    <AgreementDocument title={`Appointmentlyy x ${client}: ${RUN}`} subject="Service Agreement, Annex A (UAT) and Annex B" date={docDate(v.agreementDate)}>
      <ContentPage head={RUN} sub="Main terms" client={client}>
        <TitleBlock v={v} av={av} />
        {clauses.map((c) => <ClauseBlock key={c.n} c={c} />)}
        <Acceptance n={String(clauses.length + 1)} v={v} av={av} />
      </ContentPage>
      <AnnexPage head="Annex A: User Acceptance Testing" client={client}>
        <AnnexKicker>Annex A</AnnexKicker>
        <AnnexH2>{ANNEX_A_TITLE}</AnnexH2>
        <LegalMarkdown md={fillTokens(buildAnnexA(m), av)} />
        <AnnexSign annex="A" {...sign} />
      </AnnexPage>
      <AnnexPage head="Annex A: UAT Sign-off Certificate" client={client}>
        <Certificate
          mode="specimen"
          clientShort={av.clientShort}
          clientLegal={av.clientLegal}
          projectName={`${av.clientShort} custom build`}
          workspace={blankMark('[workspace name / URL]')}
          readinessDate=""
          uatFrom=""
          uatTo=""
          retestCycles=""
          appyProprietor={av.appyProprietor}
          appySignerTitle={valueOrMark(v.appySignerTitle, 'signer title')}
          deliverables={certRows.length ? certRows : [['01', blankMark('[deliverables]')]]}
          acceptanceStatement={m.twoPayments ? CERT_ACCEPTANCE_STATEMENT : CERT_STATEMENT_ONE_PAYMENT}
        />
      </AnnexPage>
      <AnnexPage head="Annex B: Non-compete, confidentiality and IP" client={client}>
        <AnnexKicker>Annex B</AnnexKicker>
        <AnnexH2>{ANNEX_B_TITLE}</AnnexH2>
        <LegalMarkdown md={fillTokens(ANNEX_B_V2_MD, av)} />
        <AnnexSign annex="B" {...sign} />
      </AnnexPage>
    </AgreementDocument>
  );
}

const SIGNER_FORM: SignerFormField[] = [
  { key: 'accept', label: 'I have read and accept the Service Agreement, Annex A and Annex B', kind: 'confirm', required: true },
];

export const serviceAgreementV1: AgreementTemplateDef = {
  id: ID,
  name: 'Service Agreement (standalone)',
  description: 'The contract on its own, without proposal pages: parties, services and deliverables, fees (1 or 2 setup payments), timeline, term and termination, then Annex A (UAT) and Annex B. Optional founder-led enablement (clause 10B) and on-time promise. Generic defaults.',
  action: 'sign',
  countersign: true,
  fields: FIELDS,
  signerForm: SIGNER_FORM,
  title(values) {
    const v = withDefaults(FIELDS, values);
    return `Appointmentlyy x ${v.clientShort || 'Client'}: Service Agreement`;
  },
  render(values) {
    return renderPdf(<ServiceAgreementDocument values={values} />);
  },
};

registerTemplate(serviceAgreementV1);

// Exposed for the check script.
export const __test = { FIELDS, compute, annexVars, buildAnnexA };
