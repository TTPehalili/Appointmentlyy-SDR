'use client';

import * as React from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import type { ReportEmail } from '@/lib/copilotReport';
import { copyRich, reportEmailHtml, reportEmailText } from '@/lib/reportEmailFormat';

export interface CopilotDraft {
  kind: 'email' | 'linkedin';
  subject?: string;
  body: string;
  words: number;
}

type CopyState = { what: string; ok: boolean } | null;

/** Copy feedback that clears itself and is announced to screen readers. */
function useCopyStatus() {
  const [status, setStatus] = React.useState<CopyState>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const show = (s: CopyState) => {
    setStatus(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), 2500);
  };
  return [status, show] as const;
}

function CopyStatus({ status }: { status: CopyState }) {
  return (
    <span role="status" aria-live="polite" className={status?.ok === false ? 'text-small text-danger-fg' : 'text-small text-fg-secondary'}>
      {status ? (status.ok ? `${status.what} copied` : 'Couldn’t copy. Select the text and copy it instead.') : ''}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-small font-semibold text-fg">{title}</p>
      {children}
    </div>
  );
}

function Bullets({ items, empty, ordered }: { items: string[]; empty?: string; ordered?: boolean }) {
  if (!items.length) return <p className="text-small text-fg-tertiary">{empty || 'None.'}</p>;
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={`${ordered ? 'list-decimal' : 'list-disc'} flex flex-col gap-1 pl-5 text-small text-fg marker:text-fg-tertiary`}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </List>
  );
}

function MiniTable({ columns, rows, label, dense }: { columns: string[]; rows: string[][]; label: string; dense?: boolean }) {
  const pad = dense ? 'px-1.5 py-1.5' : 'px-2.5 py-1.5';
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full border-collapse text-small tabular-nums" aria-label={label}>
        <thead className="bg-subtle">
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col" className={`${pad} font-medium text-fg ${dense ? 'text-caption' : ''} ${i === 0 ? 'text-left' : 'text-right'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, j) => (
            <tr key={j}>
              {r.map((c, i) => (
                <td key={i} className={`${pad} text-fg-secondary ${i === 0 ? 'text-left text-fg' : 'whitespace-nowrap text-right'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The team report as an email preview, with copy buttons (rich HTML + plain text, and the subject). */
export function ReportEmailCard({ report }: { report: ReportEmail }) {
  const [status, show] = useCopyStatus();
  const html = React.useMemo(() => reportEmailHtml(report), [report]);
  const text = React.useMemo(() => reportEmailText(report), [report]);

  const copyEmail = async () => {
    const r = await copyRich(html, text);
    show({ what: r === 'text' ? 'Email (plain text)' : 'Email', ok: r !== null });
  };
  const copySubject = async () => {
    const r = await copyRich(report.subject.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string), report.subject);
    show({ what: 'Subject', ok: r !== null });
  };

  return (
    <article aria-label="Report email" className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-2">
        <span className="flex items-center gap-1.5 text-small font-medium text-fg">
          <Mail className="size-3.5 text-brand-text" aria-hidden />
          Email report
        </span>
        <span className="flex items-center gap-1">
          {report.sample && <Badge tone="warning">Sample data</Badge>}
          <Badge tone="neutral">{report.periodLabel}</Badge>
        </span>
      </header>

      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-group text-fg-tertiary">Subject</span>
          <p className="text-body-strong text-fg">{report.subject}</p>
        </div>
        <hr className="border-line" />
        <p className="text-small text-fg">{report.greeting}</p>
        <div className="flex flex-col gap-1 text-small text-fg">
          {report.summary.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
        <Section title={`Key numbers: ${report.periodLabel} (${report.rangeLabel})`}>
          <MiniTable columns={['Metric', 'Value']} rows={report.metrics.map((m) => [m.label, m.value])} label="Key numbers" />
        </Section>
        {report.leaderboard && report.leaderboard.rows.length > 0 && (
          <Section title="Leaderboard">
            <MiniTable columns={report.leaderboard.columns} rows={report.leaderboard.rows} label="Leaderboard" dense />
          </Section>
        )}
        <Section title="Wins">
          <Bullets items={report.wins} empty="None to report yet." />
        </Section>
        <Section title="Risks and coaching focus">
          <Bullets items={report.risks} />
        </Section>
        <Section title="Next steps">
          <Bullets items={report.nextSteps} ordered />
        </Section>
        <p className="whitespace-pre-line text-small text-fg">{report.signoff}</p>
        {report.note && <p className="text-small text-fg-tertiary">{report.note}</p>}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <Button size="sm" variant="primary" icon={status?.what.startsWith('Email') && status.ok ? <Check /> : <Copy />} onClick={copyEmail}>
          Copy email
        </Button>
        <Button size="sm" variant="secondary" onClick={copySubject}>
          Copy subject
        </Button>
        <CopyStatus status={status} />
      </footer>
    </article>
  );
}

/** A short email or LinkedIn post, ready to copy. */
export function DraftCard({ draft }: { draft: CopilotDraft }) {
  const [status, show] = useCopyStatus();
  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      show({ what, ok: true });
    } catch {
      show({ what, ok: false });
    }
  };
  const label = draft.kind === 'email' ? 'Email draft' : 'LinkedIn post';
  return (
    <article aria-label={label} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-2">
        <span className="text-small font-medium text-fg">{label}</span>
        <Badge tone="neutral">{draft.words} words</Badge>
      </header>
      <div className="flex flex-col gap-2 px-3 py-3">
        {draft.subject && (
          <p className="text-small text-fg">
            <span className="text-fg-tertiary">Subject: </span>
            <span className="font-medium">{draft.subject}</span>
          </p>
        )}
        <p className="whitespace-pre-line text-small text-fg">{draft.body}</p>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <Button size="sm" variant="primary" icon={<Copy />} onClick={() => copy(draft.kind === 'email' ? 'Email' : 'Post', draft.body)}>
          {draft.kind === 'email' ? 'Copy email' : 'Copy post'}
        </Button>
        {draft.subject && (
          <Button size="sm" variant="secondary" onClick={() => copy('Subject', draft.subject!)}>
            Copy subject
          </Button>
        )}
        <CopyStatus status={status} />
      </footer>
    </article>
  );
}
