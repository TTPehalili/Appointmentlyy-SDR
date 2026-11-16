/**
 * Template `proposal-growth-v1`: the Growth proposal (10 pages, from proposals/stackph/proposal.html)
 * followed by Annex A (UAT, incl. clause 10A), the UAT Sign-off Certificate specimen and Annex B
 * (from proposals/stackph/legal/annexes_client_v1.md, word for word). Defaults are the STACKph v2
 * values. Signatures are NOT drawn here: the platform appends the Execution page.
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

const ID = 'proposal-growth-v1';
const RUN = 'Your Own Outbound Engine';

/* ---------------- fields ---------------- */

const FIELDS: TemplateField[] = [
  { group: 'Client', key: 'clientLegal', label: 'Client legal name', type: 'text', required: true, default: 'GDV Business Services Co.' },
  { group: 'Client', key: 'clientShort', label: 'Client short name', type: 'text', required: true, default: 'STACKph', help: 'Used throughout the proposal and annexes, e.g. "STACKph".' },
  { group: 'Client', key: 'clientCity', label: 'Client city / province', type: 'text', required: true, default: 'Taytay, Rizal' },
  { group: 'Client', key: 'clientSecNo', label: 'Client SEC registration no.', type: 'text', default: '', help: 'Annex A "Parties". Left blank, it shows as a yellow placeholder.' },
  { group: 'Client', key: 'clientStreet', label: 'Client street address', type: 'text', default: '', help: 'Street part only; the city / province follows it. Left blank, it shows as a yellow placeholder.' },
  { group: 'Client', key: 'preparedFor', label: 'Prepared-for line (cover)', type: 'text', required: true, default: 'STACKph leadership' },
  {
    group: 'Client', key: 'situation', label: 'Client situation paragraph', type: 'textarea', required: true,
    default: 'Today, STACKph wins clients largely through inbound directories. Appointmentlyy gives your team its own outbound engine.',
    help: 'Opens the "Our recommendation" page. A blank line starts a new paragraph.',
  },
  { group: 'Appointmentlyy', key: 'appyProprietor', label: 'Appointmentlyy party: legal name', type: 'text', required: true, default: 'Emil Libatique Halili' },
  { group: 'Appointmentlyy', key: 'appyTin', label: 'TIN', type: 'text', required: true, default: '271-163-899-00000' },
  { group: 'Appointmentlyy', key: 'appyAddress', label: 'Business address', type: 'text', required: true, default: 'Lot 22 Blk 11 Avocado St., Trinidad Village, Calibutbut, 2001 Bacolor, Pampanga' },
  { group: 'Appointmentlyy', key: 'appySignerTitle', label: 'Signer title', type: 'text', required: true, default: 'Independent Contractor (Appointmentlyy)' },
  { group: 'Dates', key: 'proposalDate', label: 'Proposal date', type: 'date', required: true, default: '2026-11-16' },
  { group: 'Dates', key: 'validUntil', label: 'Pricing valid until', type: 'date', required: true, default: '2026-11-18', help: 'Shown on the cover, in Terms and in Next steps.' },
  { group: 'Pricing', key: 'buildFee', label: 'Growth custom build fee (USD)', type: 'money', required: true, default: '15000' },
  { group: 'Pricing', key: 'monthlyFee', label: 'Growth monthly fee (USD)', type: 'money', required: true, default: '1500', help: 'Billed monthly from go-live; no long-term commitment (30 days’ notice).' },
  { group: 'Pricing', key: 'entSetup', label: 'Enterprise setup, "from" (USD)', type: 'money', required: true, default: '25000' },
  { group: 'Pricing', key: 'entMonthly', label: 'Enterprise monthly (USD)', type: 'money', required: true, default: '3500' },
  {
    group: 'Legal', key: 'liquidatedDamages', label: 'Liquidated damages, Annex B cl. 12.2(b) (USD)', type: 'money', default: '',
    help: 'Leave blank to use 3 × the build fee (USD 45,000 for STACKph).',
  },
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
  // Per-rep illustration for a team of 30: "is $50 per rep" when exact, else "is about $X per rep".
  const perRepExact = monthly.n !== null && Number.isInteger(monthly.n / 30);
  const perRep = derive(() => Math.round(monthly.n! / 30), monthly);
  const ldInput = money(v.liquidatedDamages, 'liquidated damages');
  const liquidated = ldInput.n !== null ? ldInput : derive(() => 3 * build.n!, build);
  // A custom CRM "starts at about N× our setup fee" ($45,000 low end), shown only when the multiple is meaningful.
  const crmMultiple = build.n ? Math.round((45000 / build.n) * 2) / 2 : null;
  return { build, monthly, entSetup, entMonthly, yearOne, half, perRep, perRepExact, liquidated, crmMultiple };
}

/** Annex amounts follow a literal "USD " in the legal text, so only the number goes in ("7,500"). */
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
              <View style={{ borderTopWidth: HAIR, borderTopColor: C.rule2, paddingTop: 12, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
                  {it.n ? <T style={{ color: C.red, fontSize: 7.5, fontWeight: 700, letterSpacing: em(0.08, 7.5), marginRight: 8, lineHeight: 1.9 }}>{it.n}</T> : null}
                  <T style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.4, letterSpacing: em(-0.005, 10.5), flex: 1 }}>{it.title}</T>
                </View>
                <T style={{ fontSize: 10, lineHeight: 1.55, color: C.ink2 }}>{it.body}</T>
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

/** Header row for the proposal's hairline tables. */
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

/* ---------------- pages ---------------- */

function Cover({ v }: { v: Record<string, string> }) {
  const metaVal: Style = { fontSize: 10.5, lineHeight: 1.55, color: C.ink };
  const s: Style = { color: C.ink2 };
  return (
    <Page size="A4" style={pageBase}>
      <View style={{ position: 'absolute', top: 72, left: 64 }}><Lockup h={44} /></View>
      <View style={{ position: 'absolute', left: 64, right: 64, top: 300 }}>
        <T style={{ fontSize: 54, lineHeight: 1.04, fontWeight: 800, letterSpacing: em(-0.04, 54) }}>{'Your Own\nOutbound Engine'}</T>
        <T style={{ fontSize: 15, lineHeight: 1.45, color: C.ink2, marginTop: 24, maxWidth: 362.8, letterSpacing: em(-0.01, 15) }}>
          {rich(`Find, call, book and coach under the ${valueOrMark(v.clientShort, 'client short name')} brand, live in 2–3 weeks`)}
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

type Ctx = { v: Record<string, string>; m: ReturnType<typeof compute>; client: string; cs: string; cl: string };

function Recommendation({ v, m, client }: Ctx) {
  const fig = (label: string, value: string, i: number, size = 26) => (
    <View style={{ flex: 1, paddingLeft: i ? 16 : 0, paddingRight: 16, borderLeftWidth: i ? HAIR : 0, borderLeftColor: C.rule2 }}>
      <T style={[labelSt, { marginBottom: 4 }]}>{label}</T>
      <T style={{ fontSize: size, fontWeight: 700, letterSpacing: em(-0.03, size), lineHeight: 1.1 }}>{rich(value)}</T>
    </View>
  );
  const lead = `We recommend the **Growth package**: a ${m.build.s} one-time custom build, then ${m.monthly.s} a month, with no long-term commitment.`;
  return (
    <ContentPage head={RUN} sub="Our recommendation" client={client}>
      <Section>
        <Kicker n="01" />
        <H2>Our recommendation</H2>
        <View wrap={false} style={{ borderTopWidth: 2, borderTopColor: C.red, borderBottomWidth: HAIR, borderBottomColor: C.rule2, backgroundColor: C.paper2, padding: 24, marginBottom: 24 }}>
          <Rich text={lead} style={[sty.lead, { marginBottom: 24 }]} />
          <View style={{ flexDirection: 'row' }}>
            {fig('One-time custom build', m.build.s, 0)}
            {fig('Per month', m.monthly.s, 1)}
            {fig('Goes live in', '2–3 weeks', 2, 23)}
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
            { n: '04', title: 'Live in 2–3 weeks, with reseller rights.', body: 'Go live within 3 weeks, then resell seats under your brand with no extra fees.' },
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
  const w1 = 113.4; // 40mm
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

function Scope({ m, client, cs }: Ctx) {
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
  ];
  const w1 = 130.4; // 46mm
  return (
    <ContentPage head={RUN} sub={`What your ${m.build.n === null ? 'build fee' : m.build.s} covers`} client={client}>
      <Section last>
        <Kicker n="04" />
        <H2>{rich(`What your ${m.build.s} custom build covers`)}</H2>
        <P style={sty.body2} text={`Your setup fee pays for a platform built around ${cs}: your services, your buyers and your brand. Here is everything we deliver before go-live.`} />
        <HeadRow cols={['Workstream', 'What we deliver']} widths={[w1, 'flex']} />
        {rows.map(([a, b], i) => (
          <View key={i} wrap={false} style={{ flexDirection: 'row', paddingTop: 5.5, paddingBottom: 7.5, borderBottomWidth: i === rows.length - 1 ? 1 : HAIR, borderBottomColor: i === rows.length - 1 ? C.ink : C.rule2 }}>
            <View style={{ width: w1, paddingRight: 12 }}>
              <T style={{ color: C.red, fontSize: 7, fontWeight: 700, letterSpacing: em(0.08, 7), marginBottom: 1, lineHeight: 1.4 }}>{String(i + 1).padStart(2, '0')}</T>
              <T style={{ fontWeight: 600, color: C.ink, fontSize: 10, lineHeight: 1.4 }}>{a}</T>
            </View>
            <Rich text={b} style={{ flex: 1, fontSize: 9.25, lineHeight: 1.5, color: C.ink2 }} />
          </View>
        ))}
        <AsideBox title="What your monthly fee covers." style={{ marginTop: 12, paddingVertical: 12 }}>
          Hosting for unlimited users, every new feature and update as we release it, support with the response targets in our terms, and ongoing security updates.
        </AsideBox>
      </Section>
    </ContentPage>
  );
}

function Market({ m, client, cs }: Ctx) {
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
  // "$1,500 sits at the low end of" the $1,500–$3,000 a month a custom CRM costs to run (wording follows the fee).
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
        <Kicker n="05" />
        <H2>{rich(`How ${m.build.s} compares with a custom build`)}</H2>
        <P style={sty.lead} text={`Building a sales platform from scratch typically costs $50,000 to $150,000 and takes months. Appointmentlyy gives you a proven platform, built around ${cs}, live in 2–3 weeks.`} />
        <View style={{ marginTop: 4 }}>
          <HeadRow cols={['Option', 'Typical cost', 'Time to launch', 'Source']} widths={[c1, 'flex', c3, c4]} />
          {rows.map((r, i) => (
            <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
              <T style={[cell, { width: c1, color: C.ink, fontWeight: 600 }]}>{r.a}</T>
              <T style={[cell, { flex: 1, color: C.ink, fontWeight: 600 }]}>{r.b}</T>
              <T style={[cell, { width: c3 }]}>{r.c}</T>
              <T style={[cell, { width: c4, fontSize: 8, color: C.muted }]}>{r.d}</T>
            </View>
          ))}
          <View wrap={false} style={{ flexDirection: 'row', paddingVertical: 10, backgroundColor: C.redTint, borderTopWidth: 2, borderTopColor: C.red, borderBottomWidth: 1, borderBottomColor: C.ink }}>
            <T style={[cell, { width: c1, color: C.ink, fontWeight: 600, paddingLeft: 8 }]}>
              Appointmentlyy Growth
              {sub('Pipeline, Dialer, Lead Finder, AI practice prospects, email and LinkedIn studios, manager reports, white-label and reseller workspaces', C.ink2)}
            </T>
            <T style={[cell, { flex: 1, color: C.red, fontWeight: 600, fontSize: 11 }]}>
              {rich(`${m.build.s} setup\n+ ${m.monthly.s} / month`)}
              <T style={{ fontWeight: 400, color: C.ink2, fontSize: 8.5 }}>{'\nno long-term commitment'}</T>
            </T>
            <T style={[cell, { width: c3, color: C.ink, fontWeight: 600 }]}>2–3 weeks</T>
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

function Investment({ m, client }: Ctx) {
  const cl = 133.2; // 47mm
  const pad: Style = { paddingVertical: 9, paddingHorizontal: 10 };
  const rec: Style = { backgroundColor: C.redTint };
  type Row = { th: string; ent: ReactNode; gro: ReactNode; price?: boolean };
  const priceSt: Style = { fontSize: 11.5, fontWeight: 600, color: C.ink, letterSpacing: em(-0.01, 11.5) };
  const growthMonthly = (
    <>
      <T style={[priceSt, { textAlign: 'right' }]}>{rich(m.monthly.s)}</T>
      <T style={{ fontSize: 8.5, fontWeight: 600, color: C.red, lineHeight: 1.45, textAlign: 'right' }}>No long-term commitment</T>
    </>
  );
  const rows: Row[] = [
    { th: 'Best for', ent: '60+ reps, several teams', gro: 'Teams of up to ~60 reps' },
    { th: 'One-time custom build', ent: `from ${m.entSetup.s}`, gro: m.build.s, price: true },
    { th: 'Monthly platform and support', ent: m.entMonthly.s, gro: growthMonthly, price: true },
    { th: 'Playbooks and AI practice personas', ent: 'Custom, per team', gro: 'Custom set for your services' },
    { th: 'Go-live', ent: 'Scoped plan', gro: '2–3 weeks, with kickoff and training' },
    { th: 'Support', ent: 'Dedicated contact, fastest response', gro: 'Priority' },
    { th: 'CRM connector, phone-system integration, custom domain', ent: 'Included', gro: 'Add-on' },
  ];
  const tdText = (x: ReactNode, price?: boolean) =>
    typeof x === 'string' ? <T style={[{ fontSize: 9.75, lineHeight: 1.45, color: C.ink2, textAlign: 'right' }, price ? priceSt : {}]}>{rich(x)}</T> : <View style={{ alignItems: 'flex-end' }}>{x}</View>;
  return (
    <ContentPage head={RUN} sub="Investment" client={client}>
      <Section last>
        <Kicker n="06" />
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
              <View style={{ width: cl, paddingVertical: 9, paddingRight: 10 }}>
                <T style={{ fontSize: 9.75, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>{r.th}</T>
              </View>
              <View style={[{ flex: 1 }, pad]}>{tdText(r.ent, r.price)}</View>
              <View style={[{ flex: 1 }, pad, rec]}>{tdText(r.gro, r.price)}</View>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 24, flexDirection: 'row' }} wrap={false}>
          <T style={{ width: 124.7, fontSize: 10.5, fontWeight: 600, lineHeight: 1.6 }}>Optional add-ons</T>
          <DashList style={{ flex: 1 }} items={['CRM connector: $3,000–$5,000 one-time', 'Extra playbook or persona builds: $1,000–$2,000 each']} />
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
        <Kicker n="07" />
        <H2>A second profit line: resell it under your brand</H2>
        <P style={sty.lead} text={`You can resell user seats to your own clients under the ${cs} brand. You keep 100% of what you charge.`} />
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
            { title: 'For comparison:', body: 'GoHighLevel lists its plans at $97, $297 and $497 per month. White-label reselling (“SaaS Mode”) sits on the $497 tier.' },
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
        <Kicker n="08" />
        <H2>Your tech stack: what to bring</H2>
        <P style={sty.lead} text={'You own every account and pay each provider directly, at cost. We connect and test them with you in week 1.'} />
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

function Timeline() {
  const phases = [
    { wk: 'Week 1', focus: 'Discover and set up', items: ['Kickoff call and onboarding questionnaire.', 'Targeting session: services, regions, buyers.', 'Branded workspace and user accounts.', 'Your accounts connected and tested.'] },
    { wk: 'Week 2', focus: 'Build', items: ['Custom playbook, scripts and objection bank.', 'AI practice prospects.', 'First target lists in Lead Finder.', 'Email and LinkedIn campaign kit.'] },
    { wk: 'Week 3', focus: 'Train and launch', items: ['Rep and supervisor training.', 'Rep certification.', 'Floor setup: chat, live view, reports.', 'Go-live day with us on your floor.'] },
  ];
  const third = 483.28 / 3;
  const node = (left: number, color: string) => (
    <View style={{ position: 'absolute', top: 20, left, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: color }} />
  );
  return (
    <View wrap={false} style={{ position: 'relative', paddingTop: 24, marginTop: 8 }}>
      <View style={{ flexDirection: 'row' }}>
        {phases.map((p, i) => (
          <View key={i} style={{ flex: 1, borderTopWidth: 2, borderTopColor: i === 2 ? C.red : C.ink, paddingTop: 16, paddingLeft: i ? 16 : 0, paddingRight: i === 2 ? 0 : 16, borderLeftWidth: i ? HAIR : 0, borderLeftColor: C.rule2 }}>
            <T style={[labelSt, { marginBottom: 4 }]}>{p.wk}</T>
            <T style={{ fontSize: 15, fontWeight: 700, letterSpacing: em(-0.02, 15), lineHeight: 1.2, marginBottom: 12 }}>{p.focus}</T>
            {p.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', paddingBottom: 8 }}>
                <View style={{ width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: i === 2 ? C.red : C.ink, marginTop: 5, marginRight: 9.5 }} />
                <T style={{ flex: 1, fontSize: 9.5, lineHeight: 1.5, color: C.ink2 }}>{it}</T>
              </View>
            ))}
          </View>
        ))}
      </View>
      {node(0, C.ink)}
      {node(third - 5, C.ink)}
      {node(third * 2 - 5, C.red)}
      <View style={{ position: 'absolute', right: 0, top: 0, alignItems: 'flex-end' }}>
        <View style={{ backgroundColor: C.red, borderRadius: 2, paddingVertical: 1, paddingHorizontal: 6 }}>
          <T style={{ color: '#FFFFFF', fontSize: 7, fontWeight: 700, letterSpacing: em(0.12, 7), textTransform: 'uppercase', lineHeight: 1.5 }}>By Day 21</T>
        </View>
        <View style={{ width: 11, height: 11, backgroundColor: C.red, transform: 'rotate(45deg)', marginTop: 5.5, marginRight: 2.3 }} />
      </View>
    </View>
  );
}

function GoLiveTerms({ v, m, client }: Ctx) {
  const terms: [string, string][] = [
    ['Custom build fee:', '50% on signing, 50% at go-live.'],
    ['On-time promise:', 'Ready for UAT within 3 weeks of kickoff. If we miss it for reasons not caused by your team, you can cancel and get your build payment back. Delays on your side extend the deadline day for day (Annex A, clauses 2A and 2B).'],
    ['Monthly fee:', `${m.monthly.s} a month, billed monthly from go-live. No long-term commitment: cancel with 30 days’ notice.`],
    ['Pricing valid until:', `${valueOrMark(formatDate(v.validUntil, 'weekdayLong'), 'valid until')}.`],
    ['Support response targets (business hours):', 'Critical within 1 hour, High within 4 hours, Normal within 1 business day.'],
    ['Your own usage costs:', 'Those providers bill you directly for AI, voice, email and lead data, at cost.'],
    ['Your data stays yours:', 'Each workspace is private, and no data is shared between clients.'],
  ];
  return (
    <ContentPage head={RUN} sub="Go-live in 2–3 weeks · Terms" client={client}>
      <Section>
        <Kicker n="09" />
        <H2>Go-live in 2–3 weeks</H2>
        <Timeline />
      </Section>
      <Section last>
        <Kicker n="10" />
        <H2>Terms</H2>
        <View style={{ borderTopWidth: 1, borderTopColor: C.ink, borderBottomWidth: 1, borderBottomColor: C.ink }}>
          {terms.map(([dt, dd], i) => (
            <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 5.5, borderBottomWidth: i === terms.length - 1 ? 0 : HAIR, borderBottomColor: C.rule2 }}>
              <T style={{ width: 147.4, marginRight: 16, fontWeight: 600, fontSize: 10, lineHeight: 1.5 }}>{dt}</T>
              <Rich text={dd} style={{ flex: 1, color: C.ink2, fontSize: 10, lineHeight: 1.5 }} />
            </View>
          ))}
        </View>
      </Section>
    </ContentPage>
  );
}

function NextStepsAcceptance({ v, client, cs, cl }: Ctx) {
  const steps = [
    `Confirm the Growth package by ${valueOrMark(formatDate(v.validUntil, 'weekdayDayMonth'), 'valid until')}, when this pricing expires.`,
    'We send the agreement and the first invoice for the custom build.',
    'We hold the kickoff call within 2 business days of signing. You start setting up the accounts on page 8.',
    'You go live within 3 weeks of kickoff.',
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
        <Kicker n="11" />
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
        <Kicker n="12" />
        <H2>Acceptance</H2>
        <P
          style={[sty.body2, { fontSize: 9.5, lineHeight: 1.6, marginBottom: 6 }]}
          text={`By signing, ${cs} accepts this proposal together with Annex A (User Acceptance Testing) and Annex B (Non-compete, Non-solicitation, Confidentiality and IP Safeguards), which form the Agreement. Each signatory confirms they are authorised to sign.`}
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
    clientCity: valueOrMark(v.clientCity, 'city / province'),
    proposalDate: valueOrMark(formatDate(v.proposalDate), 'proposal date'),
    buildHalf: usdWords(m.half),
    liquidatedDamages: usdWords(m.liquidated),
    courtVenue: valueOrMark(v.courtVenue, 'court venue'),
    arbitrationSeat: valueOrMark(v.arbitrationSeat, 'arbitration seat'),
  };
}

function ProposalDocument({ values }: { values: Record<string, string> }) {
  const v = withDefaults(FIELDS, values);
  const m = compute(v);
  const client = v.clientShort || 'Client';
  const ctx: Ctx = { v, m, client, cs: valueOrMark(v.clientShort, 'client short name'), cl: valueOrMark(v.clientLegal, 'client legal name') };
  const av = annexVars(v, m);
  const sign = { clientHeader: `For ${av.clientShort} (${av.clientLegal})`, appyName: av.appyProprietor, appyTitle: valueOrMark(v.appySignerTitle, 'signer title') };
  return (
    <AgreementDocument title={`Appointmentlyy x ${client}: ${RUN}`} subject="Proposal, Annex A (UAT) and Annex B" date={docDate(v.proposalDate)}>
      <Cover v={v} />
      <Recommendation {...ctx} />
      <WhatYouGet {...ctx} />
      <Scope {...ctx} />
      <Market {...ctx} />
      <Investment {...ctx} />
      <Resell {...ctx} />
      <TechStack {...ctx} />
      <GoLiveTerms {...ctx} />
      <NextStepsAcceptance {...ctx} />
      <AnnexPage head="Annex A: User Acceptance Testing" client={client}>
        <AnnexKicker>Annex A</AnnexKicker>
        <AnnexH2>{ANNEX_A_TITLE}</AnnexH2>
        <LegalMarkdown md={fillTokens(ANNEX_A_MD, av)} />
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
        <LegalMarkdown md={fillTokens(ANNEX_B_MD, av)} />
        <AnnexSign annex="B" {...sign} />
      </AnnexPage>
    </AgreementDocument>
  );
}

/** Static: the single monthly fee needs no plan choice (proposal.html removed the Plan boxes). */
const SIGNER_FORM: SignerFormField[] = [
  { key: 'package', label: 'Package', kind: 'choice', required: true, options: ['Growth', 'Enterprise'] },
  { key: 'startDate', label: 'Start date', kind: 'date', required: true },
  { key: 'accept', label: 'I have read and accept the proposal, Annex A and Annex B', kind: 'confirm', required: true },
];

export const proposalGrowthV1: AgreementTemplateDef = {
  id: ID,
  name: 'Proposal + Annexes (Growth)',
  description: 'The Growth proposal with Annex A (UAT, incl. weekly Delivery Reports) and Annex B (non-compete, IP, confidentiality). STACKph v2 values pre-filled.',
  action: 'sign',
  countersign: true,
  fields: FIELDS,
  signerForm: SIGNER_FORM,
  title(values) {
    const v = withDefaults(FIELDS, values);
    return `Appointmentlyy x ${v.clientShort || 'Client'}: Proposal and Annexes (Growth)`;
  },
  render(values) {
    return renderPdf(<ProposalDocument values={values} />);
  },
};

registerTemplate(proposalGrowthV1);

// Exposed for the preview script's checks.
export const __test = { FIELDS, compute, annexVars, A4 };
