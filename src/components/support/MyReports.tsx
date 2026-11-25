'use client';

import * as React from 'react';
import { ChevronDown, LifeBuoy, MessageSquare, Send } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, Button, EmptyState, InlineError, Skeleton, Textarea, type Tone } from '@/components/ui';
import { STATUS_LABEL, type TicketStatus, type TroubleTicket } from '@/lib/ticketTypes';
import { SUPPORT_LIMITS, areaLabel, urgencyLabel } from '@/lib/supportReport';
import { REPORT_FILED_EVENT, useReportProblem } from './ReportProblem';
import { TicketScreenshots } from './TicketContextPanel';

const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: 'warning',
  in_progress: 'neutral',
  waiting_on_customer: 'brand',
  resolved: 'success',
  closed: 'neutral',
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type Loaded = { tickets: TroubleTicket[] } | { error: string };

/** The person's own reports (the server scopes the list; `mine=1` narrows it for managers too). */
async function fetchMine(): Promise<Loaded> {
  try {
    const res = await fetch('/api/tickets?mine=1', { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { tickets?: TroubleTicket[]; error?: string };
    if (!res.ok) return { error: data.error || 'Your reports could not be loaded.' };
    return { tickets: Array.isArray(data.tickets) ? data.tickets : [] };
  } catch {
    return { error: 'Your reports could not be loaded. Check your connection.' };
  }
}

/**
 * "My reports" on the Help page: the problems this person reported, their status and the conversation with support,
 * with a reply box. Only the person's own reports (the server scopes the list; `mine=1` narrows it for managers too).
 */
export function MyReports() {
  const { open: openReport } = useReportProblem();
  const [tickets, setTickets] = React.useState<TroubleTicket[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  /** Show a loaded list; `focus` opens that report (?report=TKT-..., or one just filed). */
  const apply = React.useCallback((r: Loaded, focus?: string | null) => {
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(null);
    setTickets(r.tickets);
    if (focus) setOpenId(focus.toUpperCase());
  }, []);
  const load = React.useCallback(async (focus?: string | null) => apply(await fetchMine(), focus), [apply]);

  React.useEffect(() => {
    let alive = true;
    const want = new URLSearchParams(window.location.search).get('report');
    (async () => {
      const r = await fetchMine();
      if (alive) apply(r, want);
    })();
    // Runs again each time the Help page is shown, so the ? menu's "My reports" lands here.
    if (window.location.hash === '#my-reports') requestAnimationFrame(() => document.getElementById('my-reports')?.scrollIntoView({ block: 'start' }));
    const onFiled = (e: Event) => void load((e as CustomEvent<{ id?: string }>).detail?.id);
    window.addEventListener(REPORT_FILED_EVENT, onFiled);
    return () => {
      alive = false;
      window.removeEventListener(REPORT_FILED_EVENT, onFiled);
    };
  }, [apply, load]);

  const update = (t: TroubleTicket) => setTickets((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x)));

  return (
    <section id="my-reports" aria-labelledby="my-reports-title" className="scroll-mt-4 space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs sm:p-6" data-testid="my-reports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="my-reports-title" className="text-h2 text-fg">
            My reports
          </h2>
          <p className="mt-0.5 text-body text-fg-secondary">Problems you reported, and what support said back.</p>
        </div>
        <Button variant="secondary" icon={<LifeBuoy />} onClick={() => openReport()}>
          Report a problem
        </Button>
      </div>
      {error && <InlineError message={error} onRetry={() => void load()} />}
      {tickets === null && !error ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : tickets && tickets.length === 0 ? (
        <EmptyState className="py-8" icon={<LifeBuoy />} title="No reports yet" description="If something is not working, report it here. You will see our answers in this list." />
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line" data-testid="my-reports-list">
          {(tickets ?? []).map((t) => (
            <ReportRow key={t.id} ticket={t} open={openId === t.id} onToggle={() => setOpenId((cur) => (cur === t.id ? null : t.id))} onUpdate={update} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportRow({ ticket: t, open, onToggle, onUpdate }: { ticket: TroubleTicket; open: boolean; onToggle: () => void; onUpdate: (t: TroubleTicket) => void }) {
  const [reply, setReply] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const panelId = React.useId();
  // A "Sent" note is for this moment only: it is gone when the page is hidden and shown again.
  React.useLayoutEffect(
    () => () => {
      setSent(false);
      setError(null);
    },
    [],
  );

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(t.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply }),
      });
      const data = (await res.json().catch(() => ({}))) as { ticket?: TroubleTicket; error?: string };
      if (!res.ok || !data.ticket) {
        setError(data.error || 'Your reply could not be sent. Please try again.');
        return;
      }
      onUpdate(data.ticket);
      setReply('');
      setSent(true);
    } catch {
      setError('Your reply could not be sent. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  const conversation = t.messages.filter((m, i) => !(i === 0 && m.content === t.description));
  return (
    <li data-ticket-id={t.id}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="focus-ring flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-subtle"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-caption text-fg-secondary">{t.id}</span>
            <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
            {t.urgency === 'blocking' && <Badge tone="danger">Blocking</Badge>}
          </div>
          <p className="mt-1 line-clamp-2 break-words text-body-strong text-fg">{t.subject}</p>
          <p className="mt-0.5 text-caption text-fg-tertiary">
            {areaLabel(t.area) || 'General'} · Updated {when(t.updatedAt || t.createdAt)}
            {conversation.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1">
                <MessageSquare className="size-3" aria-hidden />
                {conversation.length}
              </span>
            )}
          </p>
        </div>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-fg-tertiary transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-line bg-app px-4 py-4" data-testid="my-report-detail">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-small sm:grid-cols-[9rem_1fr]">
            <dt className="text-fg-tertiary">Filed</dt>
            <dd className="text-fg">{when(t.createdAt)}</dd>
            <dt className="text-fg-tertiary">How urgent</dt>
            <dd className="text-fg">{urgencyLabel(t.urgency) || t.priority}</dd>
            <dt className="text-fg-tertiary">What happened</dt>
            <dd className="whitespace-pre-wrap break-words text-fg">{t.description}</dd>
            {t.tried && (
              <>
                <dt className="text-fg-tertiary">What you were trying to do</dt>
                <dd className="whitespace-pre-wrap break-words text-fg">{t.tried}</dd>
              </>
            )}
          </dl>
          <TicketScreenshots ticket={t} size="sm" />
          <div className="space-y-2">
            <h3 className="text-body-strong text-fg">Conversation</h3>
            {conversation.length === 0 ? (
              <p className="text-small text-fg-tertiary">No replies yet. We will answer here and by email.</p>
            ) : (
              <ol className="space-y-2" data-testid="my-report-messages">
                {conversation.map((m) =>
                  m.senderRole === 'system' ? (
                    <li key={m.id} className="text-center text-caption text-fg-tertiary">
                      {m.content} · {when(m.createdAt)}
                    </li>
                  ) : (
                    <li key={m.id} className={cn('rounded-md border border-line px-3 py-2', m.senderRole === 'admin' ? 'bg-subtle' : 'bg-surface')}>
                      <p className="text-caption text-fg-tertiary">
                        <span className="font-medium text-fg-secondary">{m.senderName}</span>
                        {m.senderRole === 'admin' ? ' · Appointmentlyy support' : ''} · {when(m.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg">{m.content}</p>
                    </li>
                  ),
                )}
              </ol>
            )}
          </div>
          <form onSubmit={send} className="space-y-2">
            <label htmlFor={`${panelId}-reply`} className="text-body-strong text-fg">
              Add a reply
            </label>
            <Textarea
              id={`${panelId}-reply`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={SUPPORT_LIMITS.reply}
              rows={3}
              placeholder="Add more detail, or answer a question from support."
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-small" aria-live="polite">
                {sent && <span className="text-success-fg">Reply sent.</span>}
              </span>
              <Button type="submit" variant="primary" icon={<Send />} loading={sending} disabled={!reply.trim()}>
                Send reply
              </Button>
            </div>
            {error && <InlineError message={error} />}
          </form>
        </div>
      )}
    </li>
  );
}
