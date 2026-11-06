import * as React from 'react';

/**
 * Minimal, safe Markdown for Copilot answers: headings, paragraphs, bullet and numbered
 * lists, blockquotes/callouts, rules and **bold** / *italic* / `code`. No HTML is ever injected.
 * DESIGN-NOTE: tables render as plain rows of text; swap in a real Markdown renderer if
 * answers start relying on them.
 */
function inline(text: string, key: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={`${key}-${i}`} className="font-semibold">{p.slice(2, -2)}</strong>;
    if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) return <em key={`${key}-${i}`}>{p.slice(1, -1)}</em>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={`${key}-${i}`} className="rounded-[4px] bg-subtle px-1 font-mono text-small">{p.slice(1, -1)}</code>;
    return <React.Fragment key={`${key}-${i}`}>{p}</React.Fragment>;
  });
}

export function CopilotMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const k = `b${i}`;

    if (!t) {
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t)) {
      blocks.push(<hr key={k} className="border-line" />);
      i += 1;
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push(
        <p key={k} className={h[1].length <= 2 ? 'text-h3 text-fg' : 'text-body-strong text-fg'}>
          {inline(h[2], k)}
        </p>,
      );
      i += 1;
      continue;
    }
    if (t.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const q = lines[i].trim().replace(/^>\s?/, '').replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
        if (q) quote.push(q);
        i += 1;
      }
      blocks.push(
        <div key={k} className="border-l-2 border-line-strong pl-3 text-fg-secondary">
          {quote.map((q, j) => (
            <p key={j}>{inline(q, `${k}-${j}`)}</p>
          ))}
        </div>,
      );
      continue;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(t)) {
      const ordered = /^\d/.test(t);
      const items: string[] = [];
      while (i < lines.length && /^([-*•]|\d+[.)])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-*•]|\d+[.)])\s+/, ''));
        i += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k} className={`${ordered ? 'list-decimal' : 'list-disc'} flex flex-col gap-1 pl-5 marker:text-fg-tertiary`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${k}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      blocks.push(
        <div key={k} className="flex flex-col divide-y divide-line rounded-md border border-line text-small tabular-nums">
          {rows.map((r, j) => (
            <p key={j} className={`px-2.5 py-1.5 ${j === 0 ? 'font-medium text-fg' : 'text-fg-secondary'}`}>
              {r.map((c, ci) => (
                <React.Fragment key={ci}>
                  {ci > 0 && <span className="text-fg-disabled"> · </span>}
                  {inline(c, `${k}-${j}-${ci}`)}
                </React.Fragment>
              ))}
            </p>
          ))}
        </div>,
      );
      continue;
    }
    // Paragraph: gather consecutive plain lines.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|[-*•]\s|\d+[.)]\s|\||-{3,}$)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>);
  }

  return <div className="flex flex-col gap-3 text-body text-fg">{blocks}</div>;
}
