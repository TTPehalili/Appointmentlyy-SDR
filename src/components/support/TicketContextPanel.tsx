'use client';

import * as React from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { Button } from '@/components/ui';
import type { TicketAttachmentMeta, TroubleTicket } from '@/lib/ticketTypes';
import { SCREENSHOT_REMOVED_LABEL, formatTicketForClaude, screenshotIsExpired, screenshotsWereRemoved } from '@/lib/supportReport';

/** In place of a screenshot that is no longer there (removed after 90 days, or could not be loaded). */
function RemovedShot({ box, label }: { box: string; label: string }) {
  return (
    <span
      className={`flex items-center justify-center rounded-md border border-dashed border-line bg-subtle px-2 text-center text-caption text-fg-tertiary ${box}`}
      data-testid="ticket-shot-removed"
    >
      {label}
    </span>
  );
}

/** One thumbnail; if the picture cannot be loaded (e.g. removed since the list was loaded) it says so, not a broken image. */
function ShotThumb({ ticketId, a, i, box }: { ticketId: string; a: TicketAttachmentMeta; i: number; box: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <RemovedShot box={box} label={screenshotIsExpired(a.createdAt) ? SCREENSHOT_REMOVED_LABEL : 'Screenshot unavailable'} />;
  const href = `/api/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(a.id)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`focus-ring block overflow-hidden rounded-md border border-line bg-subtle ${box}`}
      title={`Screenshot ${i + 1}: ${a.width} x ${a.height}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={href} alt={`Screenshot ${i + 1} of ${ticketId}`} loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
    </a>
  );
}

/**
 * Screenshot thumbnails (the reporter and staff get the URLs; the image route checks again). Screenshots are kept for
 * 90 days; after that the report shows "Screenshot removed after 90 days" in their place.
 */
export function TicketScreenshots({ ticket, size = 'md' }: { ticket: TroubleTicket; size?: 'sm' | 'md' }) {
  const shots = ticket.attachments ?? [];
  const removed = !!ticket.attachments && screenshotsWereRemoved(ticket);
  if (!shots.length && !removed) return null;
  const box = size === 'sm' ? 'h-16 w-24' : 'h-24 w-36';
  return (
    <ul className="flex flex-wrap gap-2" data-testid="ticket-shots">
      {shots.map((a, i) => (
        <li key={a.id}>
          <ShotThumb ticketId={ticket.id} a={a} i={i} box={box} />
        </li>
      ))}
      {removed && (
        <li>
          <RemovedShot box={box} label={SCREENSHOT_REMOVED_LABEL} />
        </li>
      )}
    </ul>
  );
}

/**
 * What the browser captured when the report was filed, in plain sections, plus "Copy for Claude" (one plain-text
 * block with everything needed to reproduce the problem). Shown in Platform › Support; render it with
 * key={ticket.id} so another ticket starts fresh.
 */
export function TicketContextPanel({ ticket, showCopy }: { ticket: TroubleTicket; showCopy: boolean }) {
  const [copied, setCopied] = React.useState<'idle' | 'copied' | 'manual'>('idle');
  const [manualText, setManualText] = React.useState('');
  const c = ticket.context;

  const copy = async () => {
    const text = formatTicketForClaude(
      {
        ...ticket,
        messages: ticket.messages,
        attachments: ticket.attachments ?? [],
      },
      window.location.origin,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied('copied');
      setTimeout(() => setCopied((s) => (s === 'copied' ? 'idle' : s)), 2500);
    } catch {
      setManualText(text);
      setCopied('manual');
    }
  };

  const rows: [string, string][] = c
    ? [
        ['Page', c.page.path || '/'],
        ['Page title', c.page.title],
        ['Error on screen', c.errorText || ''],
        ['App version', c.app.version + (c.serverVersion && c.serverVersion !== c.app.version ? ` (server ${c.serverVersion})` : '')],
        ['Time', `${c.time.at ? new Date(c.time.at).toLocaleString() : ''}${c.time.timeZone ? ` (${c.time.timeZone})` : ''}`],
        ['Workspace and role', [c.workspace, c.role].filter(Boolean).join(', ')],
        ['Browser', c.env ? `${c.env.browser} on ${c.env.os}` : ''],
        ['Screen and window', c.env ? `${c.env.screen} screen, ${c.env.viewport} window, pixel ratio ${c.env.pixelRatio}` : ''],
        ['Connection', c.env ? (c.env.online ? 'Online' : 'Offline') : ''],
        ['Appearance', c.env?.colorMode || ''],
        ['Language', c.env?.language || ''],
      ].filter((r): r is [string, string] => !!r[1])
    : [];

  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-4" aria-label="Captured context" data-testid="ticket-context">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h3 text-fg">Captured context</h3>
        {showCopy && (
          <Button size="sm" variant="secondary" icon={copied === 'copied' ? <Check /> : <ClipboardCopy />} onClick={copy} data-testid="copy-for-claude">
            {copied === 'copied' ? 'Copied' : 'Copy for Claude'}
          </Button>
        )}
      </div>
      {copied === 'manual' && (
        <div className="space-y-1">
          <p className="text-small text-fg-secondary">Copying was blocked by the browser. Select the text below and copy it.</p>
          <textarea readOnly value={manualText} rows={8} className="focus-ring w-full rounded-sm border border-line-strong bg-surface p-2 font-mono text-caption text-fg" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <TicketScreenshots ticket={ticket} />
      {!c ? (
        <p className="text-small text-fg-tertiary">Nothing was captured for this ticket.</p>
      ) : (
        <>
          {c.omitted && <p className="text-small text-fg-secondary">The reporter chose to leave the technical details out.</p>}
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-small sm:grid-cols-[10rem_1fr]">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt className="text-fg-tertiary">{k}</dt>
                <dd className="min-w-0 break-words text-fg">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
          {!c.omitted && (
            <>
              <div>
                <h4 className="text-body-strong text-fg">Browser errors ({c.errors?.length ?? 0})</h4>
                {c.errors?.length ? (
                  <ol className="mt-1 space-y-1 font-mono text-caption text-fg-secondary" data-testid="ctx-errors">
                    {c.errors.map((e, i) => (
                      <li key={i} className="break-words">
                        <span className="text-fg-tertiary">{e.at ? new Date(e.at).toLocaleTimeString() : ''}</span> {e.kind === 'rejection' ? 'Unhandled promise: ' : ''}
                        {e.message}
                        {e.source ? <span className="text-fg-tertiary"> ({e.source}:{e.line}:{e.col})</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-small text-fg-tertiary">None</p>
                )}
              </div>
              <div>
                <h4 className="text-body-strong text-fg">Failed requests ({c.failedRequests?.length ?? 0})</h4>
                {c.failedRequests?.length ? (
                  <ol className="mt-1 space-y-1 font-mono text-caption text-fg-secondary" data-testid="ctx-requests">
                    {c.failedRequests.map((r, i) => (
                      <li key={i} className="break-all">
                        <span className="text-fg-tertiary">{r.at ? new Date(r.at).toLocaleTimeString() : ''}</span> {r.method} {r.path}{' '}
                        <span className="text-danger-fg">{r.status === 0 ? 'no response' : r.status}</span> <span className="text-fg-tertiary">{r.ms} ms</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-small text-fg-tertiary">None</p>
                )}
              </div>
              {c.env?.userAgent && <p className="break-all font-mono text-caption text-fg-tertiary">{c.env.userAgent}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}
