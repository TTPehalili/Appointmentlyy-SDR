'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUp, Dumbbell, RotateCcw, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { buildCopilotContext, type CopilotTurn } from '@/lib/copilotContext';
import type { ReportEmail } from '@/lib/copilotReport';
import { IconButton, InlineError, Skeleton, buttonClasses } from '@/components/ui';
import { useShell } from './ShellContext';
import { CopilotMarkdown } from './CopilotMarkdown';
import { DraftCard, ReportEmailCard, type CopilotDraft } from './CopilotCards';

interface CopilotAction {
  label: string;
  href: string;
}

interface Message {
  id: string;
  from: 'user' | 'ai';
  text: string;
  report?: ReportEmail;
  draft?: CopilotDraft;
  actions?: CopilotAction[];
}

/** A quick action: asks the Copilot, or opens a page. */
interface Suggestion {
  label: string;
  prompt?: string;
  href?: string;
}

interface CopilotContext {
  label: string;
  suggestions: Suggestion[];
}

const ask = (label: string, prompt = label): Suggestion => ({ label, prompt });

/** Reps: their own calls, emails and posts. */
const REP_ACTIONS: Suggestion[] = [
  ask('Handle “no budget”', 'How do I handle “we don’t have budget right now”?'),
  ask('Write a follow-up email', 'Write a short follow-up email after a first call'),
  ask('Draft a LinkedIn post', 'Draft a LinkedIn post about something I learned cold calling this week'),
  ask('My activity this week', 'How am I doing this week?'),
  { label: 'Practise an objection', href: '/practice?tab=dialer' },
];

/** Supervisors, managers and admins: the team. */
const LEAD_ACTIONS: Suggestion[] = [
  ask('Generate team report (this week)', 'Generate a team report for this week'),
  ask('Who needs coaching?', 'Who needs coaching this week?'),
  ask('Top objections this week', 'What are the top objections this week?'),
];

/** Context-aware prompts per area (redesign spec 4), shaped by role. */
function contextFor(pathname: string, isRep: boolean): CopilotContext {
  const withRole = (label: string, rep: Suggestion[], lead: Suggestion[]): CopilotContext => ({
    label,
    suggestions: isRep ? [...REP_ACTIONS.slice(0, 4), ...rep, REP_ACTIONS[4]] : [...LEAD_ACTIONS, ...lead],
  });
  if (pathname.startsWith('/dialer'))
    return withRole(
      'Dialer',
      [ask('Rebuttal for “we already have a vendor”'), ask('Shorten my opener')],
      [ask('Rebuttal for “we already have a vendor”'), ask('How do I handle a pricing objection?')],
    );
  if (pathname.startsWith('/inbox'))
    return withRole('Inbox', [ask('Draft a reply that books a demo')], [ask('Draft a reply that books a demo'), ask('Handle a “not now” reply')]);
  if (pathname.startsWith('/contacts') || pathname.startsWith('/pipeline'))
    return withRole('Contacts', [ask('Who should I call first today?')], [ask('Which deals are stalling?'), ask('Summarise my pipeline')]);
  if (pathname.startsWith('/outreach'))
    return withRole('Outreach', [ask('Give me 3 subject lines for ops leaders')], [ask('Give me 3 subject lines for ops leaders'), ask('Suggest a LinkedIn post angle')]);
  if (pathname.startsWith('/practice'))
    return withRole('Practice', [ask('Which objection should I practise next?')], [ask('Which objection should the team practise next?')]);
  return withRole('Workspace', [], [ask('How is the floor doing today?'), ask('How many meetings did we book this week?')]);
}

const ATTEMPT_TIMEOUT_MS = 22_000;

class CopilotError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/** One request with a hard timeout. Network errors, timeouts and 5xx are retryable. */
async function postOnce(body: string, signal: AbortSignal) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/assistant/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new CopilotError('Your session has ended. Sign in again to keep using Copilot.', false);
    if (res.status >= 500) throw new CopilotError('Copilot had a problem answering.', true);
    if (!res.ok || typeof data.answer !== 'string') throw new CopilotError(data.error || 'Copilot couldn’t answer that.', false);
    return data as { answer: string; report?: ReportEmail; draft?: CopilotDraft; actions?: CopilotAction[] };
  } catch (err) {
    if (err instanceof CopilotError) throw err;
    if (signal.aborted) throw new CopilotError('cancelled', false);
    throw new CopilotError('Copilot is taking too long or can’t be reached.', true);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Docked AI Copilot (⌘J). Replaces the floating orb; on desktop it pushes content over
 * as a 360px right rail, on mobile it is a bottom sheet.
 * Role-aware: reps get objection, email and LinkedIn help on their own numbers; supervisors and
 * above also get team reports, coaching and objection summaries. The role comes from useSession(),
 * so a Super Admin's "View as" preview applies; the server only ever narrows it.
 */
export function CopilotPanel() {
  const pathname = usePathname();
  const { copilotOpen, setCopilotOpen } = useShell();
  const { role, repName, tenantName } = useSession();
  const isDemo = useDemoWorkspace();
  const isRep = role === 'Rep';
  const ctx = contextFor(pathname, isRep);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ message: string; question: string } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const inflight = React.useRef<AbortController | null>(null);

  // A new role (e.g. "View as") or workspace starts a fresh conversation: answers were shaped for the old one.
  const convKey = `${role}|${tenantName}`;
  const [shownKey, setShownKey] = React.useState(convKey);
  const liveKey = React.useRef(convKey);
  if (shownKey !== convKey) {
    setShownKey(convKey);
    setMessages([]);
    setError(null);
  }
  React.useEffect(() => {
    liveKey.current = convKey;
  }, [convKey]);

  React.useEffect(() => {
    if (copilotOpen) inputRef.current?.focus();
  }, [copilotOpen]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, error]);

  // Cancel a pending request when the panel unmounts.
  React.useEffect(() => () => inflight.current?.abort(), []);

  // Grow the input with its content (up to max-h-32).
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input, copilotOpen]);

  const send = async (question: string, opts: { retry?: boolean } = {}) => {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    if (!opts.retry) {
      setInput('');
      setMessages((m) => [...m, { id: `u${Date.now()}`, from: 'user', text: q }]);
    }
    setLoading(true);
    setStatus(null);
    const controller = new AbortController();
    inflight.current = controller;
    const startKey = convKey;
    try {
      const history: CopilotTurn[] = messages.map((m) => ({ from: m.from, text: m.report ? m.report.subject : m.draft ? m.draft.body : m.text }));
      const context = await buildCopilotContext({ question: q, page: ctx.label, role, repName, tenantName, isDemo, history });
      const body = JSON.stringify({ question: q, context });
      let data;
      try {
        data = await postOnce(body, controller.signal);
      } catch (err) {
        if (!(err instanceof CopilotError) || !err.retryable) throw err;
        setStatus('Taking longer than usual. Trying again…');
        data = await postOnce(body, controller.signal);
      }
      if (liveKey.current !== startKey) return;
      setMessages((m) => [
        ...m,
        {
          id: `a${Date.now()}`,
          from: 'ai',
          text: data.answer,
          report: data.report?.kind === 'report_email' ? data.report : undefined,
          draft: data.draft,
          actions: (data.actions || []).filter((a) => typeof a.href === 'string' && /^\/(?!\/)/.test(a.href)),
        },
      ]);
    } catch (err) {
      if ((err instanceof CopilotError && err.message === 'cancelled') || liveKey.current !== startKey) return;
      const message =
        err instanceof CopilotError
          ? err.retryable
            ? `${err.message} Check your connection and try again.`
            : err.message
          : 'Copilot couldn’t answer that. Try again.';
      setError({ message, question: q });
    } finally {
      if (inflight.current === controller) {
        inflight.current = null;
        setLoading(false);
        setStatus(null);
      }
    }
  };

  const reset = () => {
    inflight.current?.abort();
    inflight.current = null;
    setMessages([]);
    setError(null);
    setLoading(false);
    setStatus(null);
    inputRef.current?.focus();
  };

  if (!copilotOpen) return null;

  return (
    <>
      {/* Mobile scrim */}
      <div className="fixed inset-0 z-40 bg-ink-950/40 md:hidden" onClick={() => setCopilotOpen(false)} aria-hidden />
      <aside
        aria-label="AI Copilot"
        className={cn(
          'flex flex-col border-line bg-surface',
          'fixed inset-x-0 bottom-0 z-50 h-[75dvh] animate-slide-up rounded-t-xl border-t shadow-lg',
          'md:static md:z-auto md:h-auto md:w-[360px] md:shrink-0 md:animate-none md:rounded-none md:border-l md:border-t-0 md:shadow-none',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-brand-text" aria-hidden />
            <h2 className="text-h3 text-fg">Copilot</h2>
            <span className="truncate text-small text-fg-tertiary">
              · {ctx.label}
              {isRep ? ' · Rep' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(messages.length > 0 || error) && (
              <IconButton label="New chat" size="sm" onClick={reset}>
                <RotateCcw className="size-4" />
              </IconButton>
            )}
            <IconButton label="Close Copilot" size="sm" onClick={() => setCopilotOpen(false)}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col gap-3">
              <p className="text-body text-fg-secondary">
                {isRep
                  ? 'Your sales coach: objection lines, short emails, LinkedIn posts and your own numbers. Try one of these:'
                  : 'Ask about your team, leads, scripts or numbers, or get a report email to send. Try one of these:'}
              </p>
              <div className="flex flex-col gap-2">
                {ctx.suggestions.map((s) =>
                  s.href ? (
                    <Link
                      key={s.label}
                      href={s.href}
                      className="focus-ring flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-body text-fg transition-colors duration-150 hover:bg-subtle"
                    >
                      <Dumbbell className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
                      {s.label}
                    </Link>
                  ) : (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => send(s.prompt || s.label)}
                      className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-left text-body text-fg transition-colors duration-150 hover:bg-subtle"
                    >
                      {s.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-4" aria-live="polite">
            {messages.map((m) =>
              m.from === 'user' ? (
                <p key={m.id} className="ml-8 self-end whitespace-pre-line rounded-lg bg-subtle px-3 py-2 text-body text-fg">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className="flex flex-col gap-3">
                  {m.report ? (
                    <>
                      <p className="text-body text-fg-secondary">{m.text}</p>
                      <ReportEmailCard report={m.report} />
                    </>
                  ) : m.draft ? (
                    <>
                      <p className="text-body text-fg-secondary">{m.text.split('\n')[0]}</p>
                      <DraftCard draft={m.draft} />
                    </>
                  ) : (
                    <CopilotMarkdown source={m.text} />
                  )}
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <Link key={a.href + a.label} href={a.href} className={buttonClasses('secondary', 'sm')}>
                          {a.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {loading && (
              <div className="flex flex-col gap-2" role="status" aria-label="Copilot is thinking">
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                {status && <p className="text-small text-fg-tertiary">{status}</p>}
              </div>
            )}
            {error && <InlineError message={error.message} onRetry={() => send(error.question, { retry: true })} />}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="shrink-0 border-t border-line p-3"
        >
          <div className="flex items-end gap-2 rounded-md border border-line-strong bg-surface p-1.5 focus-within:border-brand-600 focus-within:shadow-[var(--focus-ring)]">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={isRep ? 'Ask for a rebuttal, email or post' : 'Ask Copilot or request a report'}
              aria-label="Ask Copilot"
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1 text-body text-fg outline-none"
            />
            <IconButton type="submit" label="Send" size="sm" variant="primary" disabled={!input.trim() || loading}>
              <ArrowUp className="size-4" />
            </IconButton>
          </div>
        </form>
      </aside>
    </>
  );
}
