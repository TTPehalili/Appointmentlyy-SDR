/**
 * Template `uat-certificate-v1`: the one-page UAT Sign-off Certificate (Annex A, clause A3), word for
 * word from annexes_client_v1.md, issued as its own document. The client ticks the 10 Deliverables,
 * lists up to 3 minor items and confirms the acceptance statement in the signing panel; the platform
 * records those answers and the signatures on the Execution page.
 */
import { registerTemplate } from './index';
import type { SignerFormField, TemplateField } from './types';
import type { AgreementTemplateDef } from './signerForm';
import { CERT_ACCEPTANCE_STATEMENT, CERT_DELIVERABLES } from './annexText';
import { defaultsOf, fillTokens, formatAmount, formatDate, parseMoney, valueOrMark, withDefaults, blankMark } from './pdf/format';
import { AgreementDocument, ContentPage, docDate, renderPdf } from './pdf/kit';
import { Certificate } from './pdf/legal';

const FIELDS: TemplateField[] = [
  { group: 'Client', key: 'clientLegal', label: 'Client legal name', type: 'text', required: true, default: 'GDV Business Services Co.' },
  { group: 'Client', key: 'clientShort', label: 'Client short name', type: 'text', required: true, default: 'STACKph' },
  { group: 'Project', key: 'projectName', label: 'Project name', type: 'text', required: true, default: 'STACKph Growth custom build' },
  { group: 'Project', key: 'workspace', label: 'Workspace name / URL', type: 'text', required: true, default: '' },
  { group: 'Dates', key: 'readinessDate', label: 'Readiness Notice date', type: 'date', required: true, default: '' },
  { group: 'Dates', key: 'uatFrom', label: 'UAT Period from', type: 'date', required: true, default: '' },
  { group: 'Dates', key: 'uatTo', label: 'UAT Period to', type: 'date', required: true, default: '' },
  { group: 'Project', key: 'retestCycles', label: 'Retest cycles used', type: 'select', required: true, options: ['0', '1', '2', '3'], default: '0' },
  { group: 'Pricing', key: 'secondInstalment', label: 'Second build-fee instalment (USD)', type: 'money', required: true, default: '7500', help: 'The second 50% of the build fee, due under Annex A clause 9.' },
  { group: 'Appointmentlyy', key: 'appyProprietor', label: 'Appointmentlyy signer', type: 'text', required: true, default: 'Emil Libatique Halili' },
  { group: 'Appointmentlyy', key: 'appySignerTitle', label: 'Signer title', type: 'text', required: true, default: 'Independent Contractor (Appointmentlyy)' },
];

function signerFormFor(values: Record<string, string>): SignerFormField[] {
  const v = withDefaults(FIELDS, values);
  return [
    {
      key: 'deliverables', label: 'Deliverables accepted', kind: 'multi-check', required: true,
      options: CERT_DELIVERABLES.map(([, d]) => d),
      help: 'Tick each Deliverable you have tested and accept.',
    },
    {
      key: 'minorItems', label: 'Outstanding minor items (S3/S4 only)', kind: 'rows', required: false,
      columns: ['Item', 'Severity (S3/S4)', 'Agreed fix date'], maxRows: 3,
      help: 'Leave empty if there are none. S1 and S2 defects cannot be listed here.',
    },
    {
      key: 'acceptance', label: fillTokens(CERT_ACCEPTANCE_STATEMENT, { clientShort: v.clientShort || 'The client' }), kind: 'confirm', required: true,
    },
  ];
}

const DEFAULTS = defaultsOf(FIELDS);

export const uatCertificateV1: AgreementTemplateDef = {
  id: 'uat-certificate-v1',
  name: 'UAT Sign-off Certificate',
  description: 'One-page certificate under Annex A, clause A3. The client ticks the Deliverables, lists minor items and accepts; you countersign.',
  action: 'sign',
  countersign: true,
  fields: FIELDS,
  signerForm: signerFormFor(DEFAULTS),
  signerFormFor,
  title(values) {
    const v = withDefaults(FIELDS, values);
    return `UAT Sign-off Certificate: Appointmentlyy x ${v.clientShort || 'Client'}`;
  },
  render(values) {
    const v = withDefaults(FIELDS, values);
    const client = v.clientShort || 'Client';
    const amount = parseMoney(v.secondInstalment);
    const date = (k: string, label: string) => valueOrMark(formatDate(v[k]), label);
    return renderPdf(
      <AgreementDocument title={`UAT Sign-off Certificate: Appointmentlyy x ${client}`} subject="Annex A, clause A3" date={docDate(v.uatTo || v.readinessDate)}>
        <ContentPage head="UAT Sign-off Certificate" sub="Annex A, clause A3" client={client} style={{ paddingTop: 72 }}>
          <Certificate
            mode="document"
            clientShort={valueOrMark(v.clientShort, 'client short name')}
            clientLegal={valueOrMark(v.clientLegal, 'client legal name')}
            projectName={valueOrMark(v.projectName, 'project name')}
            workspace={valueOrMark(v.workspace, 'workspace name / URL')}
            readinessDate={date('readinessDate', 'Readiness Notice date')}
            uatFrom={date('uatFrom', 'from')}
            uatTo={date('uatTo', 'to')}
            retestCycles={valueOrMark(v.retestCycles, '0 / 1 / 2 / 3')}
            appyProprietor={valueOrMark(v.appyProprietor, 'signer')}
            appySignerTitle={valueOrMark(v.appySignerTitle, 'title')}
            secondInstalment={amount === null ? blankMark('[second instalment]') : `USD ${formatAmount(amount)}`}
          />
        </ContentPage>
      </AgreementDocument>,
    );
  },
};

registerTemplate(uatCertificateV1);
