'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUp, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildOpsSnapshot } from '@/lib/opsSnapshot';
import { IconButton, InlineError, Skeleton } from '@/components/ui';
import { useShell } from './ShellContext';
import { CopilotMarkdown } from './CopilotMarkdown';

interface Message {
  id: string;
  from: 'user' | 'ai';
  text: string;
}

interface CopilotContext {
  label: string;
  suggestions: string[];
}

/** Context-aware prompts per area (redesign spec 4). */
function contextFor(pathname: string): CopilotContext {
  if (pathname.startsWith('/dialer'))
    return {
      label: 'Dialer',
      suggestions: ['Rebuttal for “we already have a vendor”', 'Shorten my opener', 'How do I handle a pricing objection?'],
    };
  if (pathname.startsWith('/inbox'))
    return { label: 'Inbox', suggestions: ['Draft a reply that books a demo', 'Answer a pricing question', 'Handle a “not now” reply'] };
  if (pathname.startsWith('/contacts') || pathname.startsWith('/pipeline'))
    return { label: 'Contacts', suggestions: ['Who should I call first today?', 'Which deals are stalling?', 'Summarise my pipeline'] };
  if (pathname.startsWith('/outreach'))
    return { label: 'Outreach', suggestions: ['Give me 3 subject lines for ops leaders', 'Make this email shorter', 'Suggest a LinkedIn post angle'] };
  if (pathname.startsWith('/practice'))
    return { label: 'Practice', suggestions: ['Which objection should I practise next?', 'How did my last session go?'] };
  return { label: 'Workspace', suggestions: ['How is the floor doing today?', 'Who is the top rep this week?', 'How many meetings did we book?'] };
}

/**
 * Docked AI Copilot (⌘J). Replaces the floating orb; on desktop it pushes content over
 * as a 360px right rail, on mobile it is a bottom sheet.
 * DESIGN-NOTE: every context uses /api/assistant/query today. Dialer rebuttals and inbox
 * drafts can switch to /api/rebuttal and a reply-draft endpoint in Phase 4.
 */
export function CopilotPanel() {
  const pathname = usePathname();
  const { copilotOpen, setCopilotOpen } = useShell();
  const ctx = contextFor(pathname);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastQuestion = React.useRef('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (copilotOpen) inputRef.current?.focus();
  }, [copilotOpen]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    lastQuestion.current = q;
    setError(null);
    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, from: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context: { snapshot: buildOpsSnapshot(), page: ctx.label } }),
      });
      const data = await res.json();
      if (!res.ok || !data.answer) throw new Error(data.error || 'No answer');
      setMessages((m) => [...m, { id: `a${Date.now()}`, from: 'ai', text: String(data.answer) }]);
    } catch {
      setError('Couldn’t reach the Copilot. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-text" aria-hidden />
            <h2 className="text-h3 text-fg">Copilot</h2>
            <span className="text-small text-fg-tertiary">· {ctx.label}</span>
          </div>
          <IconButton label="Close Copilot" size="sm" onClick={() => setCopilotOpen(false)}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col gap-3">
              <p className="text-body text-fg-secondary">Ask about your leads, scripts or numbers. Try one of these:</p>
              <div className="flex flex-col gap-2">
                {ctx.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-left text-body text-fg transition-colors duration-150 hover:bg-subtle"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-4">
            {messages.map((m) =>
              m.from === 'user' ? (
                <p key={m.id} className="ml-8 self-end rounded-lg bg-subtle px-3 py-2 text-body text-fg">
                  {m.text}
                </p>
              ) : (
                <CopilotMarkdown key={m.id} source={m.text} />
              ),
            )}
            {loading && (
              <div className="flex flex-col gap-2" aria-label="Copilot is thinking">
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
            {error && <InlineError message={error} onRetry={() => ask(lastQuestion.current)} />}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
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
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="Ask Copilot"
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
