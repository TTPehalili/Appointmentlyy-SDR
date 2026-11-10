/**
 * Turns a Copilot report (structured JSON) into a copy-paste-ready email: HTML with inline styles only
 * (Gmail and Outlook keep inline CSS and simple tables, drop <style> blocks), plus a plain-text twin.
 * The layout lives here, not in the AI's output, so it is the same every time.
 */
import type { ReportEmail } from '@/lib/copilotReport';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const TEXT = '#1f2933';
const MUTED = '#52606d';
const LINE = '#d9dee5';
const HEAD_BG = '#f3f5f8';

const p = (html: string, extra = '') => `<p style="${FONT}margin:0 0 12px;font-size:14px;line-height:1.55;color:${TEXT};${extra}">${html}</p>`;
const h = (text: string) =>
  `<p style="${FONT}margin:22px 0 8px;font-size:15px;line-height:1.3;font-weight:bold;color:${TEXT};">${esc(text)}</p>`;
const list = (items: string[]) =>
  `<ul style="${FONT}margin:0 0 12px;padding:0 0 0 22px;font-size:14px;line-height:1.55;color:${TEXT};">${items
    .map((i) => `<li style="margin:0 0 4px;">${esc(i)}</li>`)
    .join('')}</ul>`;

const cell = (text: string, head = false, align: 'left' | 'right' = 'left') =>
  `<${head ? 'th' : 'td'} style="${FONT}padding:7px 12px;border:1px solid ${LINE};font-size:13px;line-height:1.4;text-align:${align};color:${TEXT};${
    head ? `background:${HEAD_BG};font-weight:bold;` : ''
  }">${esc(text)}</${head ? 'th' : 'td'}>`;

function table(columns: string[], rows: string[][]) {
  const numeric = (i: number) => i > 0;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 12px;min-width:320px;">${
    columns.length ? `<tr>${columns.map((c, i) => cell(c, true, numeric(i) ? 'right' : 'left')).join('')}</tr>` : ''
  }${rows.map((r) => `<tr>${r.map((c, i) => cell(c, false, numeric(i) ? 'right' : 'left')).join('')}</tr>`).join('')}</table>`;
}

export function reportEmailHtml(r: ReportEmail): string {
  const parts: string[] = [];
  parts.push(p(esc(r.greeting)));
  parts.push(p(r.summary.map(esc).join('<br>')));
  parts.push(h(`Key numbers: ${r.periodLabel} (${r.rangeLabel})`));
  parts.push(table(['Metric', 'Value'], r.metrics.map((m) => [m.label, m.value])));
  if (r.leaderboard && r.leaderboard.rows.length) {
    parts.push(h('Leaderboard'));
    parts.push(table(r.leaderboard.columns, r.leaderboard.rows));
  }
  parts.push(h('Wins'));
  parts.push(r.wins.length ? list(r.wins) : p('None to report yet.', `color:${MUTED};`));
  parts.push(h('Risks and coaching focus'));
  parts.push(list(r.risks));
  parts.push(h('Next steps'));
  parts.push(list(r.nextSteps));
  parts.push(p(r.signoff.split('\n').map(esc).join('<br>'), 'margin-top:20px;'));
  return `<div style="${FONT}font-size:14px;line-height:1.55;color:${TEXT};max-width:640px;">${parts.join('')}</div>`;
}

export function reportEmailText(r: ReportEmail): string {
  const out: string[] = [];
  out.push(r.greeting, '', ...r.summary, '');
  out.push(`KEY NUMBERS: ${r.periodLabel} (${r.rangeLabel})`);
  for (const m of r.metrics) out.push(`- ${m.label}: ${m.value}`);
  if (r.leaderboard && r.leaderboard.rows.length) {
    out.push('', 'LEADERBOARD');
    const [, ...rest] = r.leaderboard.columns;
    r.leaderboard.rows.forEach((row, i) => {
      out.push(`${i + 1}. ${row[0]}: ${rest.map((c, j) => `${c.toLowerCase()} ${row[j + 1]}`).join(', ')}`);
    });
  }
  out.push('', 'WINS');
  out.push(...(r.wins.length ? r.wins.map((w) => `- ${w}`) : ['- None to report yet.']));
  out.push('', 'RISKS AND COACHING FOCUS');
  out.push(...r.risks.map((w) => `- ${w}`));
  out.push('', 'NEXT STEPS');
  out.push(...r.nextSteps.map((w, i) => `${i + 1}. ${w}`));
  out.push('', ...r.signoff.split('\n'));
  return out.join('\n');
}

/**
 * Copy rich HTML with a plain-text fallback (ClipboardItem), else plain text only.
 * Resolves to which flavour made it onto the clipboard, or null if copying failed.
 */
export async function copyRich(html: string, text: string): Promise<'html' | 'text' | null> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return 'html';
    }
  } catch {
    // fall through to plain text
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'text';
  } catch {
    return null;
  }
}
