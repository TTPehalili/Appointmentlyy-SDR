/**
 * Server only. Renders the annex legal text (annexText.ts markdown subset) and the UAT Sign-off
 * Certificate, styled like the .annex / .cert-page blocks in proposal.html.
 */
import type { ReactNode } from 'react';
import { View } from '@react-pdf/renderer';
import { CERT_ACCEPTANCE_STATEMENT, CERT_DELIVERABLES, CERT_PARTIES } from '../annexText';
import { C, HAIR, Rich, T, em, rich, type Style } from './kit';
import { fillTokens } from './format';

export const annexStyle = {
  p: { fontSize: 8.9, lineHeight: 1.5, color: C.ink2 } as Style,
  bold: { color: C.ink, fontWeight: 600 } as Style,
};

export function AnnexKicker({ children }: { children: string }) {
  return <T style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: em(0.16, 7.5), textTransform: 'uppercase', color: C.red, marginBottom: 4, lineHeight: 1.3 }}>{children}</T>;
}

export function AnnexH2({ children }: { children: string }) {
  return <T style={{ fontSize: 17, lineHeight: 1.2, fontWeight: 700, letterSpacing: em(-0.02, 17), marginBottom: 10 }}>{children}</T>;
}

function AnnexH3({ children }: { children: string }) {
  return <T minPresenceAhead={60} style={{ fontSize: 11, fontWeight: 600, marginTop: 8, marginBottom: 6, lineHeight: 1.4 }}>{children}</T>;
}

const th: Style = { fontSize: 7, fontWeight: 600, letterSpacing: em(0.1, 7), textTransform: 'uppercase', color: C.muted, lineHeight: 1.4 };

/** Generic annex table: header row (uppercase, 1pt ink rule) and hairline body rows. */
export function LegalTable({ head, rows, widths, cellStyle }: { head: ReactNode[]; rows: ReactNode[][]; widths: number[]; cellStyle?: Style }) {
  const cell = (w: number, last: boolean): Style => ({ width: `${w * 100}%`, paddingRight: last ? 0 : 6 });
  return (
    <View style={{ marginTop: 4, marginBottom: 10 }} wrap={false}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingVertical: 3 }}>
        {head.map((h, i) => (
          <View key={i} style={cell(widths[i], i === head.length - 1)}>
            {typeof h === 'string' ? <T style={th}>{h}</T> : h}
          </View>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={{ flexDirection: 'row', borderBottomWidth: HAIR, borderBottomColor: C.rule2, paddingVertical: 4 }}>
          {r.map((c, i) => (
            <View key={i} style={cell(widths[i], i === r.length - 1)}>
              {typeof c === 'string' ? <T style={[{ fontSize: 8.5, lineHeight: 1.45, color: C.ink2 }, cellStyle ?? {}]}>{rich(c, { bold: annexStyle.bold })}</T> : c}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function tableWidths(cols: number): number[] {
  if (cols === 3) return [0.2, 0.6, 0.2];
  if (cols === 2) return [0.45, 0.55];
  return Array.from({ length: cols }, () => 1 / cols);
}

/** Markdown subset -> blocks. `md` must already have its {{tokens}} filled. */
export function LegalMarkdown({ md }: { md: string }) {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) return <AnnexH3 key={i}>{b.slice(3)}</AnnexH3>;
        if (b.startsWith('|')) {
          const rows = b.split('\n').map((l) => l.split('|').slice(1, -1).map((s) => s.trim()));
          const [head, , ...body] = rows;
          return <LegalTable key={i} head={head} rows={body} widths={tableWidths(head.length)} />;
        }
        const ls = b.split('\n');
        return (
          <View key={i} style={{ marginBottom: 6 }}>
            {ls.map((l, j) => (
              <Rich key={j} text={l} bold={annexStyle.bold} style={[annexStyle.p, j > 0 ? { marginTop: 1.5 } : {}]} />
            ))}
          </View>
        );
      })}
    </>
  );
}

/* ---------------- UAT Sign-off Certificate ---------------- */

export interface CertificateProps {
  /** 'specimen': blank form inside the proposal (Annex A, A3). 'document': the issued certificate. */
  mode: 'specimen' | 'document';
  clientShort: string;
  clientLegal: string;
  projectName: string;
  /** Already formatted, or a yellow mark. */
  workspace: string;
  readinessDate: string;
  uatFrom: string;
  uatTo: string;
  retestCycles: string;
  appyProprietor: string;
  /** e.g. "Independent Contractor (Appointmentlyy)". */
  appySignerTitle: string;
  /** document mode: e.g. "USD 7,500" (or a mark). */
  secondInstalment?: string;
  /** Optional: the Deliverables rows. Default: the 10 Growth Deliverables (CERT_DELIVERABLES). */
  deliverables?: readonly (readonly [string, string])[];
  /** Optional: the acceptance statement ({{clientShort}} token). Default: CERT_ACCEPTANCE_STATEMENT. */
  acceptanceStatement?: string;
}

function Box({ size = 9 }: { size?: number }) {
  return <View style={{ width: size, height: size, borderWidth: 0.9, borderColor: C.ink, borderRadius: 1.5, marginTop: 1.5 }} />;
}

const certP: Style = { fontSize: 8.9, lineHeight: 1.5, color: C.ink, marginBottom: 6 };

export function Certificate(p: CertificateProps) {
  const vars = { clientShort: p.clientShort, clientLegal: p.clientLegal };
  const statement = fillTokens(p.acceptanceStatement ?? CERT_ACCEPTANCE_STATEMENT, vars);
  const parties = fillTokens(CERT_PARTIES, vars);
  const sp = (v: string) => (p.mode === 'specimen' ? '__________' : v);
  const doc = p.mode === 'document';

  return (
    <View>
      <T style={{ fontSize: 20, fontWeight: 800, letterSpacing: em(-0.02, 20), borderBottomWidth: 2, borderBottomColor: C.red, paddingBottom: 6, marginBottom: 4, lineHeight: 1.2 }}>
        UAT Sign-off Certificate
      </T>
      <T style={{ fontSize: 9, color: C.muted, marginBottom: 14, lineHeight: 1.4 }}>{`${parties} · Annex A, clause A3`}</T>

      <T style={certP}>
        {rich(`**Project:** ${p.projectName}   **Workspace:** ${p.workspace}`, { bold: annexStyle.bold })}
        {'\n'}
        {rich(
          `**Readiness Notice date:** ${sp(p.readinessDate)}   **UAT Period:** ${sp(p.uatFrom)} to ${sp(p.uatTo)}   **Retest cycles used:** ${p.mode === 'specimen' ? '0 / 1 / 2 / 3' : p.retestCycles}`,
          { bold: annexStyle.bold },
        )}
      </T>
      {doc ? (
        <T style={[certP, { color: C.ink2, fontSize: 8.5 }]}>
          The ticks below, any outstanding minor items and both signatures are recorded on the Execution page at the end of this document.
        </T>
      ) : null}

      <LegalTable
        head={['#', 'Deliverable', 'Accepted', 'Notes']}
        widths={[0.07, 0.63, 0.12, 0.18]}
        rows={(p.deliverables ?? CERT_DELIVERABLES).map(([n, d]) => [n, d, <Box key="b" />, ''])}
      />

      <T style={[certP, { fontWeight: 600 }]}>Outstanding minor items (S3/S4 only)</T>
      {doc ? (
        <LegalTable head={['#', 'Item', 'Severity', 'Agreed fix date']} widths={[0.07, 0.55, 0.15, 0.23]} rows={[['', 'Recorded on the Execution page (up to 3 items).', '', '']]} />
      ) : (
        <LegalTable
          head={['#', 'Item', 'Severity', 'Agreed fix date']}
          widths={[0.07, 0.55, 0.15, 0.23]}
          rows={['1', '2', '3'].map((n) => [<T key="n" style={{ fontSize: 8.5, color: C.ink2, lineHeight: 1.45, minHeight: 12 }}>{n}</T>, '', '', ''])}
        />
      )}

      <T style={certP}>{rich(`**Acceptance statement.** ${statement}`, { bold: annexStyle.bold })}</T>
      {doc && p.secondInstalment ? (
        <T style={[certP, { color: C.ink2 }]}>{rich(`Second build-fee instalment due under Annex A clause 9: **${p.secondInstalment}**.`, { bold: annexStyle.bold })}</T>
      ) : null}

      <SignTable mode={p.mode} clientHeader={`For ${p.clientShort} (${p.clientLegal})`} appyName={p.appyProprietor} appyTitle={p.appySignerTitle} />
    </View>
  );
}

/** The two-column signature block. In 'document' mode the signatures live on the platform's Execution page. */
export function SignTable({ mode, clientHeader, appyName, appyTitle, signatureNote }: { mode: 'specimen' | 'document'; clientHeader: string; appyName: string; appyTitle: string; signatureNote?: string }) {
  const rows: [string, string][] = [
    ['Name:', `Name: ${appyName}`],
    ['Title:', `Title: ${appyTitle}`],
    ['Signature:', 'Signature:'],
    ['Date:', 'Date:'],
  ];
  const head: Style = { fontSize: 7, fontWeight: 600, letterSpacing: em(0.1, 7), textTransform: 'uppercase', color: C.muted, lineHeight: 1.4 };
  return (
    <View wrap={false} style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.ink, paddingBottom: 3 }}>
        <T style={[head, { width: '50%', paddingRight: 18 }]}>{clientHeader}</T>
        <T style={[head, { width: '50%' }]}>For Appointmentlyy</T>
      </View>
      {mode === 'specimen' ? (
        rows.map(([a, b], i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            <View style={{ width: '50%', paddingRight: 18 }}>
              <View style={{ height: 26, justifyContent: 'flex-end', borderBottomWidth: 0.75, borderBottomColor: C.ink, paddingBottom: 3 }}>
                <T style={{ fontSize: 8.5, color: C.ink2 }}>{rich(a)}{signatureNote && a === 'Signature:' ? <T style={{ color: C.muted }}>{` ${signatureNote}`}</T> : null}</T>
              </View>
            </View>
            <View style={{ width: '50%' }}>
              <View style={{ height: 26, justifyContent: 'flex-end', borderBottomWidth: 0.75, borderBottomColor: C.ink, paddingBottom: 3 }}>
                <T style={{ fontSize: 8.5, color: C.ink2 }}>{rich(b)}{signatureNote && b === 'Signature:' ? <T style={{ color: C.muted }}>{` ${signatureNote}`}</T> : null}</T>
              </View>
            </View>
          </View>
        ))
      ) : (
        <View style={{ flexDirection: 'row', paddingTop: 6 }}>
          <View style={{ width: '50%', paddingRight: 18 }}>
            <T style={{ fontSize: 8.5, color: C.ink2, lineHeight: 1.5 }}>Name and title: as signed on the Execution page.</T>
          </View>
          <View style={{ width: '50%' }}>
            <T style={{ fontSize: 8.5, color: C.ink2, lineHeight: 1.5 }}>{`Name: ${appyName}\nTitle: ${appyTitle}`}</T>
          </View>
        </View>
      )}
      {mode === 'document' ? (
        <T style={{ marginTop: 10, fontSize: 9, fontWeight: 600, color: C.ink }}>Signatures: see the Execution page at the end of this document.</T>
      ) : null}
    </View>
  );
}

/**
 * "Signed for Annex A/B" block (proposal.html .annex-sign): red rule, heading, two-column sign table.
 * The tool collects signatures on the Execution page, so the Signature rows say so in muted text.
 */
export function AnnexSign({ annex, clientHeader, appyName, appyTitle }: { annex: 'A' | 'B'; clientHeader: string; appyName: string; appyTitle: string }) {
  return (
    <View wrap={false} style={{ marginTop: 18 }}>
      <T style={{ fontSize: 10, fontWeight: 700, color: C.ink, borderTopWidth: 2, borderTopColor: C.red, paddingTop: 6, marginBottom: 4 }}>{`Signed for Annex ${annex}`}</T>
      <SignTable mode="specimen" clientHeader={clientHeader} appyName={appyName} appyTitle={appyTitle} signatureNote="Signed electronically: see the Execution page" />
    </View>
  );
}
