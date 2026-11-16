/**
 * Template `delivery-report-v1`: the weekly Delivery Report under Annex A clause 10A. One page: work
 * completed (one item per line), evidence links and next week's plan. The client acknowledges it
 * ("Confirm this report") or raises a concern with text; no countersignature.
 */
import { View } from '@react-pdf/renderer';
import { registerTemplate } from './index';
import type { SignerFormField, TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { blankMark, formatDate, lines, valueOrMark, withDefaults } from './pdf/format';
import { AgreementDocument, C, ContentPage, FRAME, H2, HAIR, Kicker, T, breakable, docDate, em, renderPdf, rich, sty } from './pdf/kit';

const FIELDS: TemplateField[] = [
  { group: 'Client', key: 'clientShort', label: 'Client short name', type: 'text', required: true, default: 'STACKph' },
  { group: 'Client', key: 'clientLegal', label: 'Client legal name', type: 'text', required: true, default: 'GDV Business Services Co.' },
  { group: 'Week', key: 'weekNumber', label: 'Build week', type: 'select', required: true, options: ['1', '2', '3'], default: '1' },
  { group: 'Week', key: 'dateFrom', label: 'Week from', type: 'date', required: true, default: '' },
  { group: 'Week', key: 'dateTo', label: 'Week to', type: 'date', required: true, default: '' },
  {
    group: 'Report', key: 'workCompleted', label: 'Work completed this week', type: 'textarea', required: true,
    default: 'Kickoff call and onboarding questionnaire.\nTargeting session: services, regions, buyers.\nBranded workspace and user accounts.\nYour accounts connected and tested.',
    help: 'One item per line.',
  },
  { group: 'Report', key: 'evidenceLinks', label: 'Evidence (screenshots, documents, workspace links)', type: 'textarea', required: true, default: '', help: 'One link or item per line.' },
  {
    group: 'Report', key: 'nextWeekPlan', label: "Next week's plan", type: 'textarea', required: false,
    default: 'Custom playbook, scripts and objection bank.\nAI practice prospects.\nFirst target lists in Lead Finder.\nEmail and LinkedIn campaign kit.',
    help: 'One item per line. Leave blank in the final week.',
  },
];

const SIGNER_FORM: SignerFormField[] = [
  { key: 'decision', label: 'Your response', kind: 'choice', required: true, options: ['Confirm this report', 'Raise a concern'] },
  { key: 'concern', label: 'Your concern', kind: 'text', required: false, help: 'Required if you raise a concern: name the item and what is missing or wrong.' },
];

const FOOT_NOTE = 'Confirm or raise concerns within 2 Business Days; otherwise this report is treated as confirmed (Annex A clause 10A).';

function List({ items, numbered, empty }: { items: string[]; numbered?: boolean; empty: string }) {
  if (!items.length) return <T style={{ fontSize: 10, lineHeight: 1.5 }}>{rich(blankMark(empty))}</T>;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.ink }}>
      {items.map((it, i) => (
        <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: HAIR, borderBottomColor: C.rule2 }}>
          {numbered ? (
            <T style={{ width: 24, color: C.red, fontSize: 7.5, fontWeight: 700, letterSpacing: em(0.08, 7.5), lineHeight: 2 }}>{String(i + 1).padStart(2, '0')}</T>
          ) : (
            <View style={{ width: 24 }}><View style={{ width: 5, height: 0.75, backgroundColor: C.red, marginTop: 7.5 }} /></View>
          )}
          <T style={{ flex: 1, fontSize: 10, lineHeight: 1.5, color: C.ink2 }}>{numbered ? it : breakable(it)}</T>
        </View>
      ))}
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return <T minPresenceAhead={40} style={{ fontSize: 11, fontWeight: 600, marginTop: 18, marginBottom: 6, lineHeight: 1.4 }}>{children}</T>;
}

export const deliveryReportV1: AgreementTemplateDef = {
  id: 'delivery-report-v1',
  name: 'Weekly Delivery Report',
  description: 'The build-week Delivery Report under Annex A clause 10A. The client confirms it or raises a concern within 2 Business Days.',
  action: 'acknowledge',
  countersign: false,
  fields: FIELDS,
  signerForm: SIGNER_FORM,
  title(values) {
    const v = withDefaults(FIELDS, values);
    return `Delivery Report, week ${v.weekNumber || '?'}: Appointmentlyy x ${v.clientShort || 'Client'}`;
  },
  render(values) {
    const v = withDefaults(FIELDS, values);
    const client = v.clientShort || 'Client';
    const week = valueOrMark(v.weekNumber, 'week');
    const period = `${valueOrMark(formatDate(v.dateFrom), 'from')} to ${valueOrMark(formatDate(v.dateTo), 'to')}`;
    const next = lines(v.nextWeekPlan);
    const meta = (label: string, value: string, flex: number) => (
      <View style={{ flex, paddingRight: 16 }}>
        <T style={[sty.label, { marginBottom: 2 }]}>{label}</T>
        <T style={{ fontSize: 10.5, lineHeight: 1.45 }}>{rich(value)}</T>
      </View>
    );
    return renderPdf(
      <AgreementDocument title={`Delivery Report, week ${v.weekNumber}: Appointmentlyy x ${client}`} subject="Annex A, clause 10A" date={docDate(v.dateTo || v.dateFrom)}>
        <ContentPage head="Weekly Delivery Report" sub="Annex A, clause 10A" client={client} style={{ paddingTop: 72, paddingBottom: FRAME.bottom + 54 }}>
          <Kicker n={`WEEK ${v.weekNumber ? v.weekNumber.padStart(2, '0') : '??'}`} />
          <H2>{rich(`Delivery Report, week ${week}`)}</H2>
          <View style={{ flexDirection: 'row', borderTopWidth: HAIR, borderTopColor: C.rule2, borderBottomWidth: HAIR, borderBottomColor: C.rule2, paddingVertical: 10, marginBottom: 4 }}>
            {meta('Client', `${valueOrMark(v.clientShort, 'client')} (${valueOrMark(v.clientLegal, 'client legal name')})`, 1.5)}
            {meta('Build week', `${week} of 3`, 0.6)}
            {meta('Period', period, 1.4)}
          </View>
          <T style={{ fontSize: 9, lineHeight: 1.5, color: C.ink2, marginTop: 6 }}>
            {`Under Annex A clause 10A, Appointmentlyy reports the work completed this build week, with evidence. Please confirm this report, or raise specific concerns, in the response panel.`}
          </T>

          <Heading>Work completed this week</Heading>
          <List items={lines(v.workCompleted)} numbered empty="[work completed]" />

          <Heading>Evidence</Heading>
          <List items={lines(v.evidenceLinks)} empty="[evidence links]" />

          {next.length ? (
            <>
              <Heading>Plan for next week</Heading>
              <List items={next} numbered empty="" />
            </>
          ) : null}

          <View
            fixed
            style={{ position: 'absolute', left: FRAME.side, right: FRAME.side, bottom: 66, borderLeftWidth: 3, borderLeftColor: C.red, backgroundColor: C.paper2, paddingVertical: 8, paddingHorizontal: 12 }}
          >
            <T style={{ fontSize: 9, lineHeight: 1.45, fontWeight: 600, color: C.ink }}>{FOOT_NOTE}</T>
            <T style={{ fontSize: 8, lineHeight: 1.45, color: C.muted, marginTop: 2 }}>Your response, name and the time you respond are recorded on the page that follows.</T>
          </View>
        </ContentPage>
      </AgreementDocument>,
    );
  },
};

registerTemplate(deliveryReportV1);
