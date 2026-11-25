/**
 * Template `proposal-growth-v2`: the Growth proposal with founder-led sales enablement (workstream 11 and
 * its own page, ported from proposals/stackph v3), a "down from" original price, 2 equal build payments
 * (the 2nd at UAT sign-off and go-live, or a fixed date, whichever comes first), and a build-month /
 * training-window schedule. Annex A adds clause 10B, the technical point of contact and the build-phase
 * schedule; Annex B is unchanged. Defaults are the STACKph final terms (2026-11-25).
 *
 * `proposal-growth-v1` stays untouched: existing envelopes re-render from their own template id.
 * Signatures are NOT drawn here: the platform appends the Execution page.
 */
import type { ReactNode } from 'react';
import { Page, View } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { SignerFormField, TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { ANNEX_A_MD, ANNEX_A_TITLE, ANNEX_B_MD, ANNEX_B_TITLE } from './annexText';
import {
  blankMark, fillTokens, formatAmount, formatDate, paragraphs, parseMoney, usd, valueOrMark, withDefaults,
} from './pdf/format';
import {
  A4, AgreementDocument, AsideBox, C, Callout, ContentPage, DashList, H2, HAIR, Kicker, Lockup, Rich, T, docDate, em,
  pageBase, renderPdf, rich, sty, type Style,
} from './pdf/kit';
import { AnnexH2, AnnexKicker, AnnexSign, Certificate, LegalMarkdown } from './pdf/legal';

const ID = 'proposal-growth-v2';
const RUN = 'Your Own Outbound Engine';

/* ---------------- fields ---------------- */

const FIELDS: TemplateField[] = [
  { group: 'Client', key: 'clientLegal', label: 'Client legal name', type: 'text', required: true, default: 'GDV Business Services Co.' },
  { group: 'Client', key: 'clientShort', label: 'Client short name', type: 'text', required: true, default: 'STACKph', help: 'Used throughout the proposal and annexes, e.g. "STACKph".' },
  { group: 'Client', key: 'clientCity', label: 'Client city / province', type: 'text', required: true, default: 'Taytay, Rizal', help: 'Also where the onsite training days take place.' },
  { group: 'Client', key: 'clientSecNo', label: 'Client SEC registration no.', type: 'text', default: '', help: 'Annex A "Parties". Optional: left blank, it is left out of the agreement.' },
  { group: 'Client', key: 'clientStreet', label: 'Client street address', type: 'text', default: '', help: 'Street part only; the city / province follows it. Optional: left blank, it is left out of the agreement.' },
  { group: 'Client', key: 'preparedFor', label: 'Prepared-for line (cover)', type: 'text', required: true, default: 'STACKph leadership' },
  { group: 'Client', key: 'salesLead', label: 'Client sales lead (first name)', type: 'text', required: true, default: 'Brian', help: 'The person Emil trains and mentors with, named on the founder-led enablement page.' },
  {
    group: 'Client', key: 'situation', label: 'Client situation paragraph', type: 'textarea', required: true,
    default: 'Today, STACKph wins clients largely through inbound directories. Appointmentlyy gives your team its own outbound engine.',
    help: 'Opens the "Our recommendation" page. A blank line starts a new paragraph.',
  },
  { group: 'Appointmentlyy', key: 'appyProprietor', label: 'Appointmentlyy party: legal name', type: 'text', required: true, default: 'Emil Libatique Halili' },
  { group: 'Appointmentlyy', key: 'appyTin', label: 'TIN', type: 'text', required: true, default: '271-163-899-00000' },
  { group: 'Appointmentlyy', key: 'appyAddress', label: 'Business address', type: 'text', required: true, default: 'Lot 22 Blk 11 Avocado St., Trinidad Village, Calibutbut, 2001 Bacolor, Pampanga' },
  { group: 'Appointmentlyy', key: 'appySignerTitle', label: 'Signer title', type: 'text', required: true, default: 'Independent Contractor (Appointmentlyy)' },
  { group: 'Dates', key: 'proposalDate', label: 'Proposal date', type: 'date', required: true, default: '2026-11-25' },
  { group: 'Dates', key: 'validUntil', label: 'Pricing valid until', type: 'date', required: true, default: '2026-11-30', help: 'Shown on the cover, in Terms and in Next steps.' },
  {
    group: 'Schedule', key: 'buildMonth', label: 'Build phase (month)', type: 'text', required: true, default: 'December 2026',
    help: 'The technical build phase, e.g. "December 2026". The Readiness Notice is due by its last Business Day (Annex A, clause 2A).',
  },
  {
    group: 'Schedule', key: 'buildNote', label: 'Build phase note (plan page)', type: 'textarea', required: true,
    default: 'Our team builds and configures your system while STACKph observes its December holidays, so your team needs very little time during December.',
    help: 'Printed under the plan timeline.',
  },
  {
    group: 'Schedule', key: 'trainingWindow', label: 'Training window (onsite days)', type: 'text', required: true, default: 'the 1st or 2nd week of January 2027',
    help: 'Completes "2 onsite days in …" and "Training starts in …".',
  },
  { group: 'Pricing', key: 'buildFee', label: 'Growth custom build fee (USD)', type: 'money', required: true, default: '10000', help: 'Paid in 2 equal payments.' },
  { group: 'Pricing', key: 'originalFee', label: 'Original price (USD, optional)', type: 'money', default: '12500', help: 'Shown as "down from …". Leave blank to show no original price.' },
  {
    group: 'Pricing', key: 'secondPaymentBy', label: 'Second payment no later than', type: 'date', default: '2027-01-15',
    help: 'The 2nd payment is due at UAT sign-off and go-live, or on this date, whichever comes first. Left blank, it shows as a yellow placeholder.',
  },
  { group: 'Pricing', key: 'monthlyFee', label: 'Growth monthly fee (USD)', type: 'money', required: true, default: '1500', help: 'Billed monthly from go-live; no long-term commitment (30 days’ notice).' },
  { group: 'Pricing', key: 'entSetup', label: 'Enterprise setup, "from" (USD)', type: 'money', required: true, default: '25000' },
  { group: 'Pricing', key: 'entMonthly', label: 'Enterprise monthly (USD)', type: 'money', required: true, default: '3500' },
  {
    group: 'Legal', key: 'liquidatedDamages', label: 'Liquidated damages amount, Annex B cl. 12.2(b) (breach of cl. 6.1 or 6.3)', type: 'money', default: '3000000',
    help: 'In the currency below. Leave blank to use 3 × the build fee in USD.',
  },
  { group: 'Legal', key: 'ldCurrency', label: 'Liquidated damages currency', type: 'select', required: true, options: ['PHP', 'USD'], default: 'PHP' },
  {
    group: 'Legal', key: 'courtVenue', label: 'Court venue (Annex B cl. 15.5)', type: 'text', required: true,
    default: "Angeles City, Pampanga, or of Taytay, Rizal, at Appointmentlyy's choice",
    help: 'Completes "filed exclusively in the proper courts of …".',
  },
  { group: 'Legal', key: 'arbitrationSeat', label: 'Mediation venue and arbitration seat (Annex B cl. 15.3–15.4)', type: 'text', required: true, default: 'Angeles City, Pampanga' },
];

/* ---------------- derived values ---------------- */

interface Money { n: number | null; s: string }

function money(raw: string, label: string): Money {
  const n = parseMoney(raw);
  return { n, s: n === null ? blankMark(`[${label}]`) : usd(n) };
}

/** A derived amount, or a yellow placeholder if an input is missing. */
function derive(fn: () => number, ...inputs: Money[]): Money {
  if (inputs.some((m) => m.n === null)) return { n: null, s: blankMark('[fill in the fees]') };
  const n = fn();
  return { n, s: usd(n) };
}

function compute(v: Record<string, string>) {
  const build = money(v.buildFee, 'build fee');
  const monthly = money(v.monthlyFee, 'monthly fee');
  const entSetup = money(v.entSetup, 'Enterprise setup');
  const entMonthly = money(v.entMonthly, 'Enterprise monthly');
  const yearOne = derive(() => build.n! + 12 * monthly.n!, build, monthly);
  const half = derive(() => build.n! / 2, build);
  // "Down from" only when an original price is set and is above the fee charged.
  const origN = parseMoney(v.originalFee);
  const original: Money | null = origN !== null && build.n !== null && origN > build.n ? { n: origN, s: usd(origN) } : null;
  const perRepExact = monthly.n !== null && Number.isInteger(monthly.n / 30);
  const perRep = derive(() => Math.round(monthly.n! / 30), monthly);
  const ldInput = money(v.liquidatedDamages, 'liquidated damages');
  const liquidated = ldInput.n !== null ? ldInput : derive(() => 3 * build.n!, build);
  const crmMultiple = build.n ? Math.round((45000 / build.n) * 2) / 2 : null;
  return { build, monthly, entSetup, entMonthly, yearOne, half, original, perRep, perRepExact, liquidated, crmMultiple };
}

/** Annex amounts follow a literal "USD " in the legal text, so only the number goes in ("5,000"). */
function usdWords(m: Money): string {
  return m.n === null ? m.s : formatAmount(m.n);
}

/* ---------------- shared bits ---------------- */

function Section({ children, last }: { children: ReactNode; last?: boolean }) {
  return <View style={last ? {} : sty.section}>{children}</View>;
}

function P({ text, style }: { text: string; style?: Style | Style[] }) {
  return <Rich text={text} style={[sty.p, ...(Array.isArray(style) ? style : style ? [style] : [])]} />;
}

const labelSt = sty.label;

function TwoUp({ items }: { items: { n?: string; title: string; body: string }[] }) {
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View>
      {rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }} wrap={false}>
          {r.map((it, i) => (
            <View key={i} style={{ width: '50%', paddingLeft: i === 1 ? 12 : 0, paddingRight: i === 0 ? 12 : 0 }}>
              <View style={{ borderTopWidth: HAIR, borderTopColor: C.rule2, paddingTop: 10, paddingBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
                  {it.n ? <T style={{ color: C.red, fontSize: 7.5, fontWeight: 700, letterSpacing: em(0.08, 7.5), marginRight: 8, lineHeight: 1.9 }}>{it.n}</T> : null}
                  <T style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.4, letterSpacing: em(-0.005, 10.5), flex: 1 }}>{it.title}</T>
                </View>
                <Rich text={it.body} style={{ fontSize: 10, lineHeight: 1.55, color: C.ink2 }} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Asides({ items, style }: { items: { title: string; body: string }[]; style?: Style }) {
  return (
    <View style={[{ flexDirection: 'row' }, style ?? {}]} wrap={false}>
      {items.map((it, i) => (
        <View key={i} style={{ width: '50%', paddingLeft: i === 1 ? 12 : 0, paddingRight: i === 0 ? 12 : 0 }}>
          <AsideBox title={it.title} style={{ flexGrow: 1 }}>{it.body}</AsideBox>
        </View>
      ))}
    </View>
  );
}

function HeadRow({ cols, widths, style }: { cols: string[]; widths: (number | string)[]; style?: Style }) {
  return (
    <View style={[{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 6 }, style ?? {}]}>
      {cols.map((c, i) => (
        <View key={i} style={typeof widths[i] === 'number' ? { width: widths[i] as number, paddingRight: 8 } : { flex: 1, paddingRight: 8 }}>
          <T style={labelSt}>{c}</T>
        </View>
      ))}
    </View>
  );
}

/** A hairline definition list (Terms, and the enablement page). */
function TermList({ rows, dtWidth = 124.7, style }: { rows: [string, string][]; dtWidth?: number; style?: Style }) {
  return (
    <View style={[{ borderTopWidth: 1, borderTopColor: C.ink, borderBottomWidth: 1, borderBottomColor: C.ink }, style ?? {}]}>
      {rows.map(([dt, dd], i) => (
        <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 3.5, borderBottomWidth: i === rows.length - 1 ? 0 : HAIR, borderBottomColor: C.rule2 }}>
          <T style={{ width: dtWidth, marginRight: 16, fontWeight: 600, fontSize: 10, lineHeight: 1.5 }}>{dt}</T>
          <Rich text={dd} style={{ flex: 1, color: C.ink2, fontSize: 10, lineHeight: 1.5 }} />
        </View>
      ))}
    </View>
  );
}

/* ---------------- pages ---------------- */

type Ctx = {
  v: Record<string, string>; m: ReturnType<typeof compute>; client: string; cs: string; cl: string;
  /** Placeholder-safe schedule and people values. */
  month: string; window: string; lead: string; city: string;
};

function Cover({ v, cs, month }: Ctx) {
  const metaVal: Style = { fontSize: 10.5, lineHeight: 1.55, color: C.ink };
  const s: Style = { color: C.ink2 };
  return (
    <Page size="A4" style={pageBase}>
      <View style={{ position: 'absolute', top: 72, left: 64 }}><Lockup h={44} /></View>
      <View style={{ position: 'absolute', left: 64, right: 64, top: 300 }}>
        <T style={{ fontSize: 54, lineHeight: 1.04, fontWeight: 800, letterSpacing: em(-0.04, 54) }}>{'Your Own\nOutbound Engine'}</T>
        <T style={{ fontSize: 15, lineHeight: 1.45, color: C.ink2, marginTop: 24, maxWidth: 362.8, letterSpacing: em(-0.01, 15) }}>
          {rich(`Find, call, book and coach under the ${cs} brand, built for you in ${month}`)}
        </T>
        <View style={{ width: 64, height: 3, backgroundColor: C.red, marginTop: 32 }} />
      </View>
      <View style={{ position: 'absolute', left: 64, right: 64, bottom: 72, flexDirection: 'row', borderTopWidth: HAIR, borderTopColor: C.rule2, paddingTop: 16 }}>
        <View style={{ flex: 1.15, paddingRight: 24 }}>
          <T style={[labelSt, { marginBottom: 4 }]}>Prepared for</T>
          <T style={metaVal}>{rich(valueOrMark(v.preparedFor, 'prepared for'))}{'\n'}<T style={s}>{rich(valueOrMark(v.clientLegal, 'client legal name'))}</T></T>
        </View>
        <View style={{ flex: 1.05, paddingRight: 24 }}>
          <T style={[labelSt, { marginBottom: 4 }]}>Prepared by</T>
          <T style={metaVal}>{'Emil Halili\n'}<T style={s}>Founder, Appointmentlyy</T></T>
        </View>
        <View style={{ flex: 1.15, paddingTop: 7 * 1.6 + 4 }}>
          <T style={[metaVal, { textAlign: 'right' }]}>
            {rich(valueOrMark(formatDate(v.proposalDate), 'proposal date'))}{'\n'}
            <T style={s}>{rich(`Valid until ${valueOrMark(formatDate(v.validUntil), 'valid until')}`)}</T>
          </T>
        </View>
      </View>
    </Page>
  );
}

function Recommendation({ v, m, client, month }: Ctx) {
  const fig = (label: string, value: string, i: number, size = 26, note?: string) => (
    <View style={{ flex: 1, paddingLeft: i ? 16 : 0, paddingRight: 16, borderLeftWidth: i ? HAIR : 0, borderLeftColor: C.rule2 }}>
      <T style={[labelSt, { marginBottom: 4 }]}>{label}</T>
      <T style={{ fontSize: size, fontWeight: 700, letterSpacing: em(-0.03, size), lineHeight: 1.1 }}>{rich(value)}</T>
      {note ? <T style={{ fontSize: 9, fontWeight: 600, color: C.muted, marginTop: 2 }}>{note}</T> : null}
    </View>
  );
  const lead = m.original
    ? `We recommend the **Growth package**. The custom build is now **${m.build.s}, down from ${m.original.s}**, with founder-led sales enablement included. Then ${m.monthly.s} a month, with no long-term commitment.`
    : `We recommend the **Growth package**. The custom build is **${m.build.s}**, with founder-led sales enablement included. Then ${m.monthly.s} a month, with no long-term commitment.`;
  return (
    <ContentPage head={RUN} sub="Our recommendation" client={client}>
      <Section>
        <Kicker n="01" />
        <H2>Our recommendation</H2>
        <View wrap={false} style={{ borderTopWidth: 2, borderTopColor: C.red, borderBottomWidth: HAIR, borderBottomColor: C.rule2, backgroundColor: C.paper2, padding: 20, marginBottom: 16 }}>
          <Rich text={lead} style={[sty.lead, { marginBottom: 14 }]} />
          <View style={{ flexDirection: 'row' }}>
            {fig('One-time custom build', m.build.s, 0, 26, m.original ? `Down from ${m.original.s}` : undefined)}
            {fig('Per month', m.monthly.s, 1)}
            {fig('Built in', month, 2, 15)}
          </View>
        </View>
        {paragraphs(v.situation).map((p, i) => <P key={i} text={p} />)}
        <P text="Your reps find the right US and Australian decision-makers. They call them with an AI-coached script. They book the meeting, and your Account Executives receive a ready meeting plan." />
        <P text="You own the pipeline instead of renting it. Every user is included, with no per-seat fees." />
        <Callout style={{ marginBottom: 0 }}>Own your pipeline instead of renting it.</Callout>
      </Section>
      <Section last>
        <Kicker n="02" />
        <H2>Why Appointmentlyy</H2>
        <TwoUp
          items={[
            { n: '01', title: 'Own your outbound pipeline.', body: 'Your team builds its own lists, makes its own calls and books its own meetings.' },
            { n: '02', title: 'Unlimited users.', body: 'Add every rep, supervisor and manager at no extra cost.' },
            { n: '03', title: 'Bring your own keys, at cost.', body: 'Connect your own AI, voice, email and lead-data accounts. You pay those providers directly, with no markup from us.' },
            { n: '04', title: 'Built for you, with reseller rights.', body: `Our team builds it in ${month}. Then resell seats under your brand with no extra fees.` },
          ]}
        />
      </Section>
    </ContentPage>
  );
}

function WhatYouGet({ client }: Ctx) {
  const rows: [string, string][] = [
    ['Find', 'Builds target lists in Lead Finder by title, industry, size, revenue and region. Sees free counts before spending a credit.'],
    ['Call', 'Works the Dialer with your scripts, qualifying questions, objection handling and one-click outcomes. Makes real calls from any phone, or runs AI practice calls.'],
    ['Reach out', 'Sends cold email sequences and LinkedIn posts drafted by AI. Your reps review and approve every message before it goes out.'],
    ['Book', 'Sends booked meetings into the pipeline. Each one carries an AI meeting action plan and a customer recap for your Account Executive.'],
    ['Coach', 'Practises with AI role-play prospects that talk back. Certification and practice help new reps ramp in days, not weeks.'],
    ['Run the floor', 'Watches the live floor view. Uses team chat with “Need help” alerts. Reviews reports by rep and outcome, and AI Copilot team reports.'],
    ['Your brand', 'Works inside your playbooks, personas, colours and branding.'],
  ];
  const w1 = 113.4;
  return (
    <ContentPage head={RUN} sub="What you get" client={client}>
      <Section last>
        <Kicker n="03" />
        <H2>What you get</H2>
        <HeadRow cols={['Area', 'What your team does']} widths={[w1, 'flex']} />
        {rows.map(([a, b], i) => (
          <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 16, borderBottomWidth: i === rows.length - 1 ? 1 : HAIR, borderBottomColor: i === rows.length - 1 ? C.ink : C.rule2 }}>
            <T style={{ width: w1, paddingRight: 12, fontWeight: 600, color: C.ink, fontSize: 11.5, letterSpacing: em(-0.01, 11.5), lineHeight: 1.4 }}>{a}</T>
            <T style={{ flex: 1, fontSize: 10.5, lineHeight: 1.55, color: C.ink2 }}>{b}</T>
          </View>
        ))}
        <Asides
          style={{ marginTop: 32 }}
          items={[
            { title: 'Unlimited users.', body: 'Add every rep, supervisor and manager at no extra cost.' },
            { title: 'Bring your own keys.', body: 'You connect your own AI, voice, email and lead-data accounts. You pay those providers directly, at cost, with no markup from us.' },
          ]}
        />
      </Section>
    </ContentPage>
  );
}

function Scope({ m, client, cs, window }: Ctx) {
  const rows: [string, string][] = [
    ['Discovery and targeting', 'Kickoff call, onboarding questionnaire and a working session to define your ideal clients by service line, region (US, Australia) and buying committee.'],
    ['Your branded workspace', `${cs} name, logo and colours throughout. User accounts and roles for every rep, supervisor and manager.`],
    ['Custom sales playbook', `Call scripts for each ${cs} service line, from opener to close. Qualifying questions, and an objection bank with ready rebuttals for the objections BPO reps hear most: quality, data security, price, “just send me an email” and “we already have a vendor”.`],
    ['AI practice prospects', 'A custom set of voiced AI buyer personas modelled on your real prospects, for example a VP of Operations at a SaaS company. A certification path for new reps.'],
    ['Lead Finder targeting', 'Saved searches for your ideal clients, and your first target lists built and reviewed with you. Contact credits are billed by the data provider, at cost.'],
    ['Outbound campaign kit', 'Cold email templates and a follow-up sequence. LinkedIn post and message templates. Help setting up your sending domain.'],
    ['Accounts, testing and cost estimate', 'We connect and test your AI, voice, email and lead-data accounts, and estimate your monthly usage costs before go-live.'],
    ['Floor and manager reporting', 'Team chat with “Need help” alerts, the live floor view, reports by rep and outcome, and AI Copilot team reports for managers.'],
    ['Training and go-live', 'Live training for reps and supervisors, rep certification, and go-live day with us on your floor.'],
    ['Reseller workspaces', 'Separate, private client workspaces enabled, so you can resell the platform under your brand.'],
    ['Founder-led sales enablement', `Training, coaching and mentoring with Emil Halili: 2 onsite days in ${window}, and 4 weekly Google Meet sessions after go-live (page 5).`],
  ];
  const w1 = 130.4;
  return (
    <ContentPage head={RUN} sub={`What your ${m.build.n === null ? 'build fee' : m.build.s} covers`} client={client}>
      <Section last>
        <Kicker n="04" />
        <H2>{rich(`What your ${m.build.s} custom build covers`)}</H2>
        <P style={sty.body2} text={`Your setup fee pays for a platform built around ${cs}: your services, your buyers and your brand. Here is everything we deliver before go-live.`} />
        <HeadRow cols={['Workstream', 'What we deliver']} widths={[w1, 'flex']} />
        {rows.map(([a, b], i) => (
          <View key={i} wrap={false} style={{ flexDirection: 'row', paddingTop: 3.5, paddingBottom: 5, borderBottomWidth: i === rows.length - 1 ? 1 : HAIR, borderBottomColor: i === rows.length - 1 ? C.ink : C.rule2 }}>
            <View style={{ width: w1, paddingRight: 12 }}>
              <T style={{ color: C.red, fontSize: 7, fontWeight: 700, letterSpacing: em(0.08, 7), marginBottom: 1, lineHeight: 1.4 }}>{String(i + 1).padStart(2, '0')}</T>
              <T style={{ fontWeight: 600, color: C.ink, fontSize: 10, lineHeight: 1.4 }}>{a}</T>
            </View>
            <Rich text={b} style={{ flex: 1, fontSize: 9.25, lineHeight: 1.5, color: C.ink2 }} />
          </View>
        ))}
        <AsideBox title="What your monthly fee covers." style={{ marginTop: 8, paddingVertical: 9 }}>
          Hosting for unlimited users, every new feature and update as we release it, support with the response targets in our terms, and ongoing security updates.
        </AsideBox>
      </Section>
    </ContentPage>
  );
}

/** Page 5 (v3): founder-led sales enablement. A bounded package: 2 onsite days + 4 remote sessions. */
function Enablement({ m, client, cs, window, lead, city }: Ctx) {
  const intro = m.original
    ? `Your build fee is now ${m.build.s}, down from ${m.original.s}, and it includes working side by side with Emil Halili, founder of Appointmentlyy, from the first build session to your reps’ first live campaigns.`
    : `Your ${m.build.s} build fee includes working side by side with Emil Halili, founder of Appointmentlyy, from the first build session to your reps’ first live campaigns.`;
  return (
    <ContentPage head={RUN} sub="Founder-led sales enablement" client={client}>
      <Section last>
        <Kicker n="05" />
        <H2>Founder-led sales enablement, now included</H2>
        <P style={sty.lead} text={intro} />
        <P
          style={[sty.body2, { marginBottom: 20 }]}
          text={`Emil brings 12 years in business development: managing sales floors, coaching, training and mentoring reps, and scaling outbound teams. He shares that experience with ${lead} and your team, so your people know how to use the platform on a real sales floor. A great system is not enough without proper training and mentoring.`}
        />
        <TwoUp
          items={[
            { n: '01', title: 'Build it with you.', body: `Working sessions with ${lead} on your playbook, objection bank, AI practice prospects and target lists, built around how ${cs} sells.` },
            { n: '02', title: 'Learn the platform.', body: 'Hands-on navigation training for reps and supervisors on every tool your floor uses, from Lead Finder to the Dialer and reports.' },
            { n: '03', title: 'Run it live.', body: 'Cold outbound coaching on live operations: openers, objection handling, call reviews and booking the meeting, using the platform on real campaigns.' },
            { n: '04', title: 'Mentor your leaders.', body: `Mentoring sessions with ${lead} and your supervisors on floor management, daily coaching routines, reading the reports and scaling the team.` },
          ]}
        />
        <TermList
          style={{ marginTop: 20 }}
          dtWidth={124.7}
          rows={[
            ['Onsite:', `2 days at ${cs} in ${city}, in ${window}, co-training with ${lead}. Travel is on us.`],
            ['Remote coaching and mentoring:', `4 weekly sessions on Google Meet with ${lead} and your supervisors in the first 30 days after go-live.`],
            ['During the build:', `Working sessions with ${lead} as part of discovery and playbook design.`],
          ]}
        />
        <Callout style={{ marginTop: 24, marginBottom: 12 }}>Software vendors hand you a login. We build the platform, we use it, and we come from the BPO sales trenches.</Callout>
        <T style={[sty.sources, { fontStyle: 'normal' }]}>
          Training, coaching and mentoring share experience and best practice. Results depend on your people, offer and market, so this is not a commitment to any level of performance, meetings, sales or production targets. Extra onsite days or coaching sessions are available on request (Annex A, clause 10B).
        </T>
      </Section>
    </ContentPage>
  );
}

function Market({ m, client, cs, month }: Ctx) {
  const c1 = 175.7, c3 = 85, c4 = 56.7;
  const sub = (s: string, color: string = C.muted) => <T style={{ fontWeight: 400, color, fontSize: 8.5 }}>{`\n${s}`}</T>;
  const rows: { a: ReactNode; b: ReactNode; c: string; d: string }[] = [
    { a: <>Custom CRM, first version{sub('Contacts, pipeline, reporting')}</>, b: '$45,000–$100,000', c: '12–20 weeks', d: 'RaftLabs' },
    { a: 'Typical custom CRM project', b: <>$50,000–$150,000{sub('where most projects land')}</>, c: '3–12 months', d: 'Space-O' },
    { a: <>Multi-tenant, white-label platform{sub('Needed to resell to your own clients')}</>, b: '$150,000–$230,000', c: '24–36 weeks', d: 'RaftLabs' },
    { a: 'One custom AI role-play sales simulator', b: '$10,000–$25,000', c: 'Not stated', d: 'Learn2' },
    { a: 'Running a custom CRM', b: <>$1,500–$3,000 / month{sub('hosting and maintenance, plus AI fees')}</>, c: 'Ongoing', d: 'RaftLabs' },
  ];
  const cell: Style = { fontSize: 9.5, lineHeight: 1.45, color: C.ink2, paddingRight: 8 };
  const fee = m.monthly.n;
  const vsRun =
    fee === null ? 'compares with' : fee < 1500 ? 'is below' : fee <= 2000 ? 'sits at the low end of' : fee <= 3000 ? 'sits within the range of' : 'compares with';
  const multiple = m.crmMultiple;
  const callout =
    multiple !== null && multiple >= 1.5
      ? `A custom CRM alone starts at about ${multiple}× our setup fee, before any dialer, AI coaching or reseller features.`
      : 'A custom CRM alone starts at about $45,000, before any dialer, AI coaching or reseller features.';
  return (
    <ContentPage head={RUN} sub={`How ${m.build.n === null ? 'the build fee' : m.build.s} compares`} client={client}>
      <Section last>
        <Kicker n="06" />
        <H2>{rich(`How ${m.build.s} compares with a custom build`)}</H2>
        <P style={sty.lead} text={`Building a sales platform from scratch typically costs $50,000 to $150,000 and takes months. Appointmentlyy gives you a proven platform, built around ${cs} in ${month}.`} />
        <View style={{ marginTop: 4 }}>
          <HeadRow cols={['Option', 'Typical cost', 'Time to launch', 'Source']} widths={[c1, 'flex', c3, c4]} />
          {rows.map((r, i) => (
            <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
              <T style={[cell, { width: c1, color: C.ink, fontWeight: 600 }]}>{r.a}</T>
              <T style={[cell, { flex: 1, color: C.ink, fontWeight: 600 }]}>{r.b}</T>
              <T style={[cell, { width: c3 }]}>{r.c}</T>
              <T style={[cell, { width: c4, fontSize: 8, color: C.muted }]}>{r.d}</T>
            </View>
          ))}
          <View wrap={false} style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: C.redTint, borderTopWidth: 2, borderTopColor: C.red, borderBottomWidth: 1, borderBottomColor: C.ink }}>
            <T style={[cell, { width: c1, color: C.ink, fontWeight: 600, paddingLeft: 8 }]}>
              Appointmentlyy Growth
              {sub('Pipeline, Dialer, Lead Finder, AI practice prospects, email and LinkedIn studios, manager reports, white-label and reseller workspaces, founder-led enablement', C.ink2)}
            </T>
            <T style={[cell, { flex: 1, color: C.red, fontWeight: 600, fontSize: 11 }]}>
              {rich(`${m.build.s} setup\n+ ${m.monthly.s} / month`)}
              <T style={{ fontWeight: 400, color: C.ink2, fontSize: 8.5 }}>{'\nno long-term commitment'}</T>
            </T>
            <T style={[cell, { width: c3, color: C.ink, fontWeight: 600 }]}>{rich(`Built in ${month}`)}</T>
            <T style={[cell, { width: c4, fontSize: 8, color: C.muted }]}>This proposal</T>
          </View>
        </View>
        <Callout>{callout}</Callout>
        <P
          style={[sty.body2, { fontSize: 9.5 }]}
          text={`The CRM figures cover the CRM only. A from-scratch build would still need its own dialer, AI practice, lead-data and email work. Our ${m.monthly.s} monthly fee ${vsRun} what a custom CRM costs just to run, and it includes new features and support.`}
        />
        <T style={sty.sources}>
          These are published estimates from software development firms, not quotes. Sources: raftlabs.com/blog/crm-development-cost (updated 11 Nov 2026); spaceotechnologies.com/blog/custom-crm-development-cost (updated 9 Jun 2026); learn2.com/ai-role-play-sales-training (2026). Accessed 16 November 2026.
        </T>
      </Section>
    </ContentPage>
  );
}

function Investment({ m, client, month, window }: Ctx) {
  const cl = 133.2;
  const pad: Style = { paddingVertical: 7, paddingHorizontal: 10 };
  const rec: Style = { backgroundColor: C.redTint };
  type Row = { th: string; ent: ReactNode; gro: ReactNode; price?: boolean };
  const priceSt: Style = { fontSize: 11.5, fontWeight: 600, color: C.ink, letterSpacing: em(-0.01, 11.5) };
  const growthBuild = (
    <>
      <T style={[priceSt, { textAlign: 'right' }]}>{rich(m.build.s)}</T>
      {m.original ? <T style={{ fontSize: 8.5, fontWeight: 600, color: C.muted, lineHeight: 1.45, textAlign: 'right' }}>{`Down from ${m.original.s}`}</T> : null}
    </>
  );
  const growthMonthly = (
    <>
      <T style={[priceSt, { textAlign: 'right' }]}>{rich(m.monthly.s)}</T>
      <T style={{ fontSize: 8.5, fontWeight: 600, color: C.red, lineHeight: 1.45, textAlign: 'right' }}>No long-term commitment</T>
    </>
  );
  const rows: Row[] = [
    { th: 'Best for', ent: '60+ reps, several teams', gro: 'Teams of up to ~60 reps' },
    { th: 'One-time custom build', ent: `from ${m.entSetup.s}`, gro: growthBuild, price: true },
    { th: 'Monthly platform and support', ent: m.entMonthly.s, gro: growthMonthly, price: true },
    { th: 'Playbooks and AI practice personas', ent: 'Custom, per team', gro: 'Custom set for your services' },
    { th: 'Go-live', ent: 'Scoped plan', gro: `Built in ${month}, then training` },
    { th: 'Founder-led sales enablement', ent: 'Scoped plan', gro: 'Included: 2 onsite days + 4 coaching sessions' },
    { th: 'Support', ent: 'Dedicated contact, fastest response', gro: 'Priority' },
    { th: 'CRM connector, phone-system integration, custom domain', ent: 'Included', gro: 'Add-on' },
  ];
  const tdText = (x: ReactNode, price?: boolean) =>
    typeof x === 'string' ? <T style={[{ fontSize: 9.75, lineHeight: 1.45, color: C.ink2, textAlign: 'right' }, price ? priceSt : {}]}>{rich(x)}</T> : <View style={{ alignItems: 'flex-end' }}>{x}</View>;
  return (
    <ContentPage head={RUN} sub="Investment" client={client}>
      <Section last>
        <Kicker n="07" />
        <H2>Investment</H2>
        <P
          style={sty.lead}
          text={`Year one on Growth is **${m.yearOne.s}**: the ${m.build.s} custom build plus 12 × ${m.monthly.s}. Both packages include unlimited users and bring-your-own-keys usage.`}
        />
        <P style={sty.body2} text={`**Illustration:** for a team of 30 reps, ${m.monthly.s} a month is ${m.perRepExact ? '' : 'about '}${m.perRep.s} per rep, and every new hire after that is free.`} />
        <View style={{ marginTop: 12 }} wrap={false}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, alignItems: 'flex-end' }}>
            <View style={{ width: cl, paddingTop: 12, paddingBottom: 8 }}><T style={labelSt}>Package</T></View>
            <View style={{ flex: 1, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 10 }}>
              <T style={{ fontSize: 11, fontWeight: 700, letterSpacing: em(-0.01, 11), textAlign: 'right' }}>Enterprise</T>
            </View>
            <View style={[{ flex: 1, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 10, borderTopWidth: 2, borderTopColor: C.red, alignItems: 'flex-end' }, rec]}>
              <View style={{ backgroundColor: C.red, borderRadius: 2, paddingVertical: 1, paddingHorizontal: 5, marginBottom: 4 }}>
                <T style={{ color: '#FFFFFF', fontSize: 6.5, fontWeight: 700, lineHeight: 1.5, letterSpacing: em(0.12, 6.5), textTransform: 'uppercase' }}>recommended</T>
              </View>
              <T style={{ fontSize: 11, fontWeight: 700, letterSpacing: em(-0.01, 11) }}>Growth</T>
            </View>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: i === rows.length - 1 ? 1 : HAIR, borderBottomColor: i === rows.length - 1 ? C.ink : C.rule2 }}>
              <View style={{ width: cl, paddingVertical: 7, paddingRight: 10 }}>
                <T style={{ fontSize: 9.75, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>{r.th}</T>
              </View>
              <View style={[{ flex: 1 }, pad]}>{tdText(r.ent, r.price)}</View>
              <View style={[{ flex: 1 }, pad, rec]}>{tdText(r.gro, r.price)}</View>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 16, flexDirection: 'row' }} wrap={false}>
          <T style={{ width: 124.7, fontSize: 10.5, fontWeight: 600, lineHeight: 1.6 }}>Optional add-ons</T>
          <DashList style={{ flex: 1 }} items={['CRM connector: $3,000–$5,000 one-time', 'Extra playbook or persona builds: $1,000–$2,000 each', 'Extra onsite days or coaching sessions: on request']} />
        </View>
      </Section>
    </ContentPage>
  );
}

function Resell({ m, client, cs }: Ctx) {
  const covers = m.monthly.n !== null && m.monthly.n <= 2000;
  return (
    <ContentPage head={RUN} sub="A second profit line" client={client}>
      <Section last>
        <Kicker n="08" />
        <H2>A second profit line: resell it under your brand</H2>
        <P style={sty.lead} text={`You can resell user seats to your own clients under the ${cs} brand. You keep 100% of what you charge.`} />
        <P style={[sty.body2, { marginBottom: 24 }]} text="Appointmentlyy charges you nothing extra. There is no per-seat fee, no revenue share and no reseller tier." />
        <TwoUp
          items={[
            { title: 'Your brand:', body: 'your name, logo and colours on every screen your clients see.' },
            { title: 'Your prices:', body: 'you decide what to charge per seat or per team.' },
            { title: 'Separate client workspaces:', body: 'each client gets a private workspace with its own users, leads and data. We enable this during your onboarding.' },
            { title: 'Their own keys:', body: 'each client connects its own AI, voice and lead-data accounts. Their usage costs never land on your bill.' },
          ]}
        />
        <Callout style={{ marginVertical: 32 }}>Resell under your brand. Keep 100% of what you charge.</Callout>
        <Asides
          items={[
            { title: 'Illustration only:', body: `five client teams of 10 users at $40 per user per month brings in $2,000 a month.${covers ? ' That alone covers your platform fee.' : ''}` },
            { title: 'For comparison:', body: 'GoHighLevel lists its plans at $97, $297 and $497 per month. White-label reselling (“SaaS Mode”) sits on the $497 tier.' },
          ]}
        />
        <T style={sty.sources}>Sources: ghlexperts.com/gohighlevel-plans-pricing, rsla.io/blog/go-high-level-pricing, November 2026.</T>
        <Callout small style={{ marginTop: 24, marginBottom: 0 }} aside="(Hypothetical framing, not a forecast.)">
          A simple test for the CFO: if the platform helps you win one additional client account a year, it pays for itself.
        </Callout>
      </Section>
    </ContentPage>
  );
}

function TechStack({ client }: Ctx) {
  const w = [62.4, 102, 130.4];
  const rows: { a: string; b: string; opt?: string; c: string; d: string }[] = [
    { a: 'AI', b: 'Anthropic Claude API', opt: 'Recommended. Google Gemini API also supported.', c: 'AI practice prospects, Copilot, email and LinkedIn drafts, Lead Finder brainstorm', d: 'An API account with billing turned on, and an API key' },
    { a: 'Voice', b: 'ElevenLabs', opt: 'Paid plan', c: 'The voices of your AI practice prospects', d: 'An ElevenLabs account on a paid plan, and an API key' },
    { a: 'Lead data', b: 'GetLeads', c: 'Contacts in Lead Finder. Counts are free; you pay per contact you pull.', d: 'A GetLeads account with credits, and an API key' },
    { a: 'Email sending', b: 'Resend', c: 'Cold email sequences from your reps', d: 'A Resend account, a sending domain you control (we recommend a separate outreach domain), DNS access to verify it, and a from address' },
    { a: 'Phones', b: 'Your existing phones, softphone or dialer', c: 'Real calls launched from the Dialer', d: 'Nothing new to start. Integration with your dialer, for example VICIdial, is an add-on.' },
    { a: 'LinkedIn', b: 'Your reps’ own profiles', c: 'LinkedIn Studio drafts posts and messages; reps review and publish', d: 'Each rep’s own LinkedIn profile' },
    { a: 'Brand', b: 'Your brand assets', c: 'Your branded workspace', d: 'Logo files (SVG or PNG) and brand colours' },
    { a: 'People and content', b: 'Your team', c: 'Users, playbooks and AI personas', d: 'User list (name, email, role), your service lines, current scripts and pitch materials, and target markets' },
    { a: 'CRM', b: 'Your CRM', opt: 'Only with the CRM connector add-on', c: 'Syncing meetings and contacts', d: 'Admin access to your CRM' },
  ];
  const cell: Style = { fontSize: 8.75, lineHeight: 1.45, color: C.ink2, paddingRight: 8 };
  return (
    <ContentPage head={RUN} sub="Your tech stack" client={client}>
      <Section last>
        <Kicker n="09" />
        <H2>Your tech stack: what to bring</H2>
        <P style={sty.lead} text={'You own every account and pay each provider directly, at cost. We connect and test them with your technical point of contact during the build.'} />
        <View style={{ marginTop: 4 }}>
          <HeadRow cols={['Need', 'Provider', 'What it powers', 'What we need from you']} widths={[...w, 'flex']} />
          {rows.map((r, i) => (
            <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: i === rows.length - 1 ? 1 : HAIR, borderBottomColor: i === rows.length - 1 ? C.ink : C.rule2 }}>
              <T style={[cell, { width: w[0], color: C.ink, fontWeight: 600 }]}>{r.a}</T>
              <T style={[cell, { width: w[1], color: C.ink, fontWeight: 600 }]}>
                {r.b}
                {r.opt ? <T style={{ fontWeight: 400, color: C.muted, fontSize: 8 }}>{`\n${r.opt}`}</T> : null}
              </T>
              <T style={[cell, { width: w[2] }]}>{r.c}</T>
              <T style={[cell, { flex: 1, paddingRight: 0 }]}>{r.d}</T>
            </View>
          ))}
        </View>
        <AsideBox title="Not sure what these will cost?" style={{ marginTop: 24 }}>
          Before go-live, we estimate your monthly AI, voice, email and lead-data usage from your team size and call volume, so there are no surprises.
        </AsideBox>
      </Section>
    </ContentPage>
  );
}

/** Build month, then training, then go-live (replaces v1's Week 1 / 2 / 3). */
function Timeline({ month, window, lead }: Ctx) {
  const phases = [
    {
      wk: month, focus: 'Technical build',
      items: [
        'Kickoff call and onboarding questionnaire.',
        'Our team builds and configures your platform.',
        'Your technical point of contact shares access and joins a few short tests.',
      ],
    },
    {
      wk: 'Training', focus: 'Train your team',
      items: [`Starts in ${window}.`, `2 onsite training days with Emil and ${lead}.`, 'Rep certification.'],
    },
    {
      wk: 'Go-live', focus: 'Test and launch',
      items: ['UAT and sign-off.', 'Floor setup: chat, live view, reports.', 'Go-live day with us on your floor.', '4 weekly coaching sessions on Google Meet.'],
    },
  ];
  const third = 483.28 / 3;
  const node = (left: number, color: string) => (
    <View style={{ position: 'absolute', top: 12, left, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: color }} />
  );
  return (
    <View wrap={false} style={{ position: 'relative', paddingTop: 16, marginTop: 0 }}>
      <View style={{ flexDirection: 'row' }}>
        {phases.map((p, i) => (
          <View key={i} style={{ flex: 1, borderTopWidth: 2, borderTopColor: i === 2 ? C.red : C.ink, paddingTop: 16, paddingLeft: i ? 16 : 0, paddingRight: i === 2 ? 0 : 16, borderLeftWidth: i ? HAIR : 0, borderLeftColor: C.rule2 }}>
            <T style={[labelSt, { marginBottom: 4 }]}>{rich(p.wk)}</T>
            <T style={{ fontSize: 15, fontWeight: 700, letterSpacing: em(-0.02, 15), lineHeight: 1.2, marginBottom: 12 }}>{p.focus}</T>
            {p.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', paddingBottom: 3 }}>
                <View style={{ width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: i === 2 ? C.red : C.ink, marginTop: 5, marginRight: 9.5 }} />
                <Rich text={it} style={{ flex: 1, fontSize: 9.5, lineHeight: 1.5, color: C.ink2 }} />
              </View>
            ))}
          </View>
        ))}
      </View>
      {node(0, C.ink)}
      {node(third - 5, C.ink)}
      {node(third * 2 - 5, C.red)}
    </View>
  );
}

function PlanTerms(ctx: Ctx) {
  const { v, m, client, month } = ctx;
  const second = valueOrMark(formatDate(v.secondPaymentBy), 'second payment date');
  const down = m.original ? `, down from ${m.original.s}` : '';
  const terms: [string, string][] = [
    ['Custom build fee:', `${m.build.s}${down}, in 2 equal payments of ${m.half.s}. The 1st is due on signing. The 2nd is due at UAT sign-off and go-live, or on ${second}, whichever comes first.`],
    ['On-time promise:', `Ready for UAT by the end of ${month}. If we miss it for reasons not caused by your team, you can cancel and get your build payment back. Delays on your side extend the deadline day for day (Annex A, clauses 2A and 2B).`],
    ['Monthly fee:', `${m.monthly.s} a month, billed monthly from go-live. No long-term commitment: cancel with 30 days’ notice.`],
    ['Pricing valid until:', `${valueOrMark(formatDate(v.validUntil, 'weekdayLong'), 'valid until')}.`],
    ['Support response targets (business hours):', 'Critical within 1 hour, High within 4 hours, Normal within 1 business day.'],
    ['Your own usage costs:', 'Those providers bill you directly for AI, voice, email and lead data, at cost.'],
    ['Founder-led enablement:', 'Training, coaching and mentoring as set out on page 5. It is not a commitment to any level of performance or results, and it does not affect UAT or payment (Annex A, clause 10B).'],
    ['Your data stays yours:', 'Each workspace is private, and no data is shared between clients.'],
  ];
  return (
    <ContentPage head={RUN} sub="Your plan · Terms" client={client}>
      <View style={{ marginBottom: 10 }}>
        <Kicker n="10" />
        <H2>{rich(`Your plan: build in ${month}, then train`)}</H2>
        <Timeline {...ctx} />
        <P style={[sty.body2, { fontSize: 9, marginTop: 2, marginBottom: 0 }]} text={v.buildNote ? v.buildNote.replace(/\s*\r?\n\s*/g, ' ') : blankMark('[build phase note]')} />
      </View>
      <Section last>
        <Kicker n="11" />
        <H2>Terms</H2>
        <TermList rows={terms} />
      </Section>
    </ContentPage>
  );
}

function NextStepsAcceptance({ v, client, cs, cl, month, window }: Ctx) {
  const steps = [
    `Confirm the Growth package by ${valueOrMark(formatDate(v.validUntil, 'weekdayDayMonth'), 'valid until')}, when this pricing expires.`,
    'We send the agreement and the first invoice for the custom build.',
    'We hold the kickoff call within 2 business days of signing. You name your technical point of contact and start setting up the accounts on page 9.',
    `Our team builds your platform in ${month}. Training starts in ${window}.`,
  ];
  const choiceRows: [string, string][] = [
    ['Package selected:', 'Growth or Enterprise'],
    ['Start date:', 'The date your team starts'],
  ];
  const ph = (text: string, color: string) => (
    <View style={{ borderBottomWidth: 2, borderBottomColor: color, paddingBottom: 8, minHeight: 30, justifyContent: 'flex-end' }}>
      <T style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>{rich(text)}</T>
    </View>
  );
  const field = (label: string, value: ReactNode) => (
    <View style={{ paddingTop: 8 }}>
      <T style={labelSt}>{label}</T>
      <View style={{ borderBottomWidth: 0.75, borderBottomColor: C.ink, minHeight: 22, justifyContent: 'flex-end', paddingBottom: 3 }}>
        {typeof value === 'string' ? <T style={{ fontSize: 10.5, lineHeight: 1.4 }}>{rich(value)}</T> : value}
      </View>
    </View>
  );
  return (
    <ContentPage head={RUN} sub="Next steps · Acceptance" client={client}>
      <Section>
        <Kicker n="12" />
        <H2>Next steps</H2>
        <View style={{ borderTopWidth: 1, borderTopColor: C.ink }} wrap={false}>
          {steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
              <View style={{ width: 32 }}>
                <View style={{ width: 17, height: 17, borderRadius: 8.5, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' }}>
                  <T style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 8.5, lineHeight: 1 }}>{String(i + 1)}</T>
                </View>
              </View>
              <Rich text={s} style={{ flex: 1, fontSize: 10.5, lineHeight: 1.5, color: C.ink }} />
            </View>
          ))}
        </View>
        <T style={{ marginTop: 12, fontSize: 10.5, color: C.ink2 }}>
          <T style={{ color: C.ink, fontWeight: 600 }}>Contact:</T> Emil Halili, Founder, Appointmentlyy
        </T>
      </Section>
      <Section last>
        <Kicker n="13" />
        <H2>Acceptance</H2>
        <P
          style={[sty.body2, { fontSize: 9.5, lineHeight: 1.6, marginBottom: 6 }]}
          text={`By signing, ${cs} accepts this proposal together with Annex A (User Acceptance Testing) and Annex B (Non-compete, Non-solicitation, Confidentiality and IP Safeguards), which together form the Service Agreement (the "Agreement"). Each signatory confirms they are authorised to sign.`}
        />
        <View wrap={false} style={{ flexDirection: 'row', marginTop: 8 }}>
          <View style={{ flex: 1, marginRight: 32 }}>
            {ph(`For ${cs} (${cl})`, C.ink)}
            {choiceRows.map(([l, o], i) => (
              <View key={i} style={{ paddingTop: 8 }}>
                <T style={labelSt}>{l}</T>
                <T style={{ fontSize: 10, lineHeight: 1.45, color: C.ink2 }}>{rich(o)}</T>
              </View>
            ))}
            <T style={{ marginTop: 8, fontSize: 8.5, lineHeight: 1.45, color: C.muted }}>
              Chosen by the signatory when signing. The selections, name and title are recorded on the Execution page.
            </T>
          </View>
          <View style={{ flex: 1 }}>
            {ph('For Appointmentlyy', C.red)}
            {field('Name:', valueOrMark(v.appyProprietor, 'Appointmentlyy legal name'))}
            {field('Title:', valueOrMark(v.appySignerTitle, 'signer title'))}
          </View>
        </View>
        <View wrap={false} style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: C.ink, paddingTop: 8 }}>
          <T style={{ fontSize: 10.5, fontWeight: 600 }}>Signatures: see the Execution page at the end of this document.</T>
        </View>
      </Section>
    </ContentPage>
  );
}

function AnnexPage({ head, client, children }: { head: string; client: string; children: ReactNode }) {
  return (
    <ContentPage head={RUN} sub={head} client={client} style={{ paddingTop: 72 }}>
      {children}
    </ContentPage>
  );
}

/* ---------------- Annex A, v2 ---------------- */

/**
 * Annex A for v2: the v1 legal text with the v3 swaps (workstream 11 / clause 10B, two build payments)
 * and the build-phase schedule (build month, technical point of contact, UAT after the build month).
 * Each swap must match exactly once, so a change to the v1 source text fails loudly instead of silently.
 */
const ANNEX_A_V2_SWAPS: [string, string][] = [
  // SEC no. and street are optional in v2: left blank, they are simply left out (no placeholder).
  ['{{clientLegal}}, {{clientSecNo}}, of {{clientStreet}}, {{clientCity}}.', '{{clientLegal}}{{clientSecPart}}, of {{clientAddressLine}}.'],
  [
    'For {{clientShort}}, UAT means you pay the second half of the build fee only after you have seen the platform working for your team.',
    'For {{clientShort}}, UAT means you see the platform working for your team before you sign it off. The second half of the build fee is due at sign-off, or on the fixed date in clause 9 if that comes first.',
  ],
  [
    'The build consists of the 10 workstreams in section 04 of the proposal (the "Deliverables").',
    'The build consists of workstreams 01 to 10 in section 04 of the proposal (the "Deliverables"). Workstream 11 (Founder-led sales enablement) is governed by clause 10B and is not a Deliverable.',
  ],
  [
    '; and a named UAT lead with available testers.',
    '; a named UAT lead with available testers; and, for the build phase, one technical point of contact whom Appointmentlyy may contact directly. The technical point of contact supports the information transfers the build needs (accounts and access, settings and content) and takes part in a few short tests before the end of the build phase. If the technical point of contact is unavailable, the affected dates move under clause 2A (Client Delay); this does not change the payment dates in clause 9 or the fees.',
  ],
  [
    'Appointmentlyy will issue the Readiness Notice within 15 Business Days after the kickoff call (the "Target Date").',
    '{{buildMonth}} is the technical build phase: Appointmentlyy\'s team builds and configures the platform, and {{clientShort}}\'s team needs very little time beyond the technical point of contact in clause 2. Training starts in {{trainingWindow}} (clause 10B). Appointmentlyy will issue the Readiness Notice by the last Business Day of {{buildMonth}} (the "Target Date").',
  ],
  [
    'The build is extended beyond 3 weeks only for Client Delay',
    'The build is extended beyond {{buildMonth}} only for Client Delay',
  ],
  [
    '{{clientShort}} then has **5 Business Days** to test (the "UAT Period").',
    '{{clientShort}} then has **5 Business Days** to test (the "UAT Period"). When the Readiness Notice is issued during {{buildMonth}}, the UAT Period starts on the first Business Day after {{buildMonth}}.',
  ],
  [
    'The second 50% of the build fee (USD {{buildHalf}}) is invoiced at Go-live and payable within 3 Business Days.',
    'The build fee is USD {{buildFee}}, paid in 2 equal payments. The first 50% (USD {{buildHalf}}) is payable on signing. The second 50% of the build fee (USD {{buildHalf}}) is invoiced at UAT sign-off and Go-live, or on {{secondPaymentBy}}, whichever comes first, and is payable within 3 Business Days.',
  ],
  [
    'The build fee pays for professional services performed during the 2–3 week build:',
    'The build fee pays for professional services performed during the build in {{buildMonth}}:',
  ],
  [
    'setting up reporting, training and go-live support. The fee is earned as these services are performed.',
    'setting up reporting, training and go-live support, and the build-phase sessions of workstream 11. The fee is earned as these services are performed.',
  ],
  [
    'Confirmed Delivery Reports are evidence of the work performed and support acceptance under clause 8.',
    'Confirmed Delivery Reports are evidence of the work performed and support acceptance under clause 8.\n\n**10B. Founder-led sales enablement (workstream 11).** Workstream 11 is a professional training, coaching and mentoring service. It is not a Deliverable, is not tested in UAT, and does not affect acceptance, Go-live or payment under clauses 8 and 9. It consists of: (a) working sessions with {{clientShort}}\'s sales lead during the build; (b) 2 onsite days at {{clientShort}}\'s site in {{clientCity}}, during {{trainingWindow}}, on dates agreed at kickoff, with Appointmentlyy\'s travel costs included; and (c) 4 remote coaching and mentoring sessions by video call (Google Meet) of up to 90 minutes each, held weekly in the 30 days after Go-live at mutually agreed times. Appointmentlyy delivers it with reasonable skill and care. Training, coaching and mentoring share experience and best practice. Appointmentlyy makes no commitment, warranty or guarantee about performance. Results depend on {{clientShort}}\'s people, offer, market and management, and Appointmentlyy is not responsible for any level of rep performance, meetings booked, sales, revenue or production targets. No fee is reduced, withheld or refunded by reference to those results. A session that {{clientShort}} cancels with less than 1 Business Day\'s notice, or does not schedule within 60 days after Go-live, counts as delivered. Additional onsite days or coaching sessions are quoted separately.',
  ],
];

function buildAnnexAV2(src: string): string {
  let out = src;
  for (const [from, to] of ANNEX_A_V2_SWAPS) {
    const n = out.split(from).length - 1;
    if (n !== 1) throw new Error(`proposal-growth-v2 Annex A: expected 1 match, found ${n}: ${from.slice(0, 60)}`);
    out = out.replace(from, () => to);
  }
  return out;
}

const ANNEX_A_V2_MD = buildAnnexAV2(ANNEX_A_MD);

/** Annex B for v2: liquidated damages cover the no-derived-product (6.1) and non-compete (6.3) clauses, in a chosen currency. */
const ANNEX_B_V2_MD = (() => {
  const from = '(b) For a breach of clause 6.1, {{clientShort}} pays USD {{liquidatedDamages}}.';
  const n = ANNEX_B_MD.split(from).length - 1;
  if (n !== 1) throw new Error(`proposal-growth-v2 Annex B: expected 1 match, found ${n}`);
  return ANNEX_B_MD.replace(from, () => '(b) For a breach of clause 6.1 or clause 6.3, {{clientShort}} pays {{liquidatedDamagesText}}.');
})();

/* ---------------- template ---------------- */

function annexVars(v: Record<string, string>, m: ReturnType<typeof compute>): Record<string, string> {
  return {
    appyProprietor: valueOrMark(v.appyProprietor, 'Appointmentlyy legal name'),
    appyTin: valueOrMark(v.appyTin, 'TIN'),
    appyAddress: valueOrMark(v.appyAddress, 'business address'),
    clientShort: valueOrMark(v.clientShort, 'client short name'),
    clientLegal: valueOrMark(v.clientLegal, 'client legal name'),
    clientSecNo: valueOrMark(v.clientSecNo, 'SEC registration no.'),
    clientStreet: valueOrMark(v.clientStreet, 'street address'),
    clientSecPart: (v.clientSecNo ?? '').trim() ? `, SEC registration no. ${(v.clientSecNo ?? '').trim()}` : '',
    clientAddressLine: [(v.clientStreet ?? '').trim(), valueOrMark(v.clientCity, 'city / province')].filter(Boolean).join(', '),
    clientCity: valueOrMark(v.clientCity, 'city / province'),
    proposalDate: valueOrMark(formatDate(v.proposalDate), 'proposal date'),
    buildFee: usdWords(m.build),
    buildHalf: usdWords(m.half),
    secondPaymentBy: valueOrMark(formatDate(v.secondPaymentBy), 'second payment date'),
    buildMonth: valueOrMark(v.buildMonth, 'build month'),
    trainingWindow: valueOrMark(v.trainingWindow, 'training window'),
    liquidatedDamages: usdWords(m.liquidated),
    liquidatedDamagesText: (v.liquidatedDamages ?? '').trim() && m.liquidated.n !== null
      ? `${v.ldCurrency === 'USD' ? 'USD' : 'PHP'} ${usdWords(m.liquidated)}`
      : `USD ${usdWords(m.liquidated)}`,
    courtVenue: valueOrMark(v.courtVenue, 'court venue'),
    arbitrationSeat: valueOrMark(v.arbitrationSeat, 'arbitration seat'),
  };
}

function ProposalDocument({ values }: { values: Record<string, string> }) {
  const v = withDefaults(FIELDS, values);
  const m = compute(v);
  const client = v.clientShort || 'Client';
  const ctx: Ctx = {
    v, m, client,
    cs: valueOrMark(v.clientShort, 'client short name'),
    cl: valueOrMark(v.clientLegal, 'client legal name'),
    month: valueOrMark(v.buildMonth, 'build month'),
    window: valueOrMark(v.trainingWindow, 'training window'),
    lead: valueOrMark(v.salesLead, 'sales lead'),
    city: valueOrMark(v.clientCity, 'city / province'),
  };
  const av = annexVars(v, m);
  const sign = { clientHeader: `For ${av.clientShort} (${av.clientLegal})`, appyName: av.appyProprietor, appyTitle: valueOrMark(v.appySignerTitle, 'signer title') };
  return (
    <AgreementDocument title={`Appointmentlyy x ${client}: ${RUN}`} subject="Proposal, Annex A (UAT) and Annex B" date={docDate(v.proposalDate)}>
      <Cover {...ctx} />
      <Recommendation {...ctx} />
      <WhatYouGet {...ctx} />
      <Scope {...ctx} />
      <Enablement {...ctx} />
      <Market {...ctx} />
      <Investment {...ctx} />
      <Resell {...ctx} />
      <TechStack {...ctx} />
      <PlanTerms {...ctx} />
      <NextStepsAcceptance {...ctx} />
      <AnnexPage head="Annex A: User Acceptance Testing" client={client}>
        <AnnexKicker>Annex A</AnnexKicker>
        <AnnexH2>{ANNEX_A_TITLE}</AnnexH2>
        <LegalMarkdown md={fillTokens(ANNEX_A_V2_MD, av)} />
        <AnnexSign annex="A" {...sign} />
      </AnnexPage>
      <AnnexPage head="Annex A: UAT Sign-off Certificate" client={client}>
        <Certificate
          mode="specimen"
          clientShort={av.clientShort}
          clientLegal={av.clientLegal}
          projectName={`${av.clientShort} Growth custom build`}
          workspace={blankMark('[workspace name / URL]')}
          readinessDate=""
          uatFrom=""
          uatTo=""
          retestCycles=""
          appyProprietor={av.appyProprietor}
          appySignerTitle={valueOrMark(v.appySignerTitle, 'signer title')}
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
  { key: 'package', label: 'Package', kind: 'choice', required: true, options: ['Growth', 'Enterprise'] },
  { key: 'startDate', label: 'Start date', kind: 'date', required: true },
  { key: 'accept', label: 'I have read and accept the proposal, Annex A and Annex B', kind: 'confirm', required: true },
];

export const proposalGrowthV2: AgreementTemplateDef = {
  id: ID,
  name: 'Service Agreement: Proposal + Annexes (Growth, v2)',
  description: 'Growth proposal with founder-led sales enablement (workstream 11, Annex A clause 10B), a "down from" original price, 2 equal build payments, and a build-month / training-window plan. Annex A (UAT) and Annex B as v1. STACKph final terms pre-filled.',
  action: 'sign',
  countersign: true,
  fields: FIELDS,
  signerForm: SIGNER_FORM,
  title(values) {
    const v = withDefaults(FIELDS, values);
    return `Appointmentlyy x ${v.clientShort || 'Client'}: Service Agreement (Proposal and Annexes)`;
  },
  render(values) {
    return renderPdf(<ProposalDocument values={values} />);
  },
};

registerTemplate(proposalGrowthV2);

// Exposed for the preview script's checks.
export const __test = { FIELDS, compute, annexVars, A4, ANNEX_A_V2_MD };
