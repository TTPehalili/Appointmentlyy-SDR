'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowUp,
  Check,
  CheckCircle2,
  CircleDashed,
  FlaskConical,
  ListChecks,
  Loader2,
  MinusCircle,
  PartyPopper,
  Sparkles,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { Button, IconButton, InlineError, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  CANVAS_EXAMPLES,
  type AssistantAsk,
  type AssistantResponse,
  type CanvasEdgeLite,
  type CanvasNodeLite,
  type CanvasProposal,
  type Checklist,
  type TestRunResult,
} from '@/lib/workflowAssistant';
import { callWorkflowAssistant, isSendKey } from './assistantClient';

export interface CanvasGraph {
  nodes: CanvasNodeLite[];
  edges: CanvasEdgeLite[];
}

export interface ApplyResult {
  saved: boolean;
  /** Opaque copy of the canvas before the change, for Undo. */
  snapshot: unknown;
  graph: CanvasGraph;
}

export interface WorkflowAssistantWidgetProps {
  getGraph: () => CanvasGraph;
  applyProposal: (p: CanvasProposal) => Promise<ApplyResult>;
  restore: (snapshot: unknown) => Promise<boolean>;
  focusNode: (nodeId: string | null) => void;
  /** Open and check the workflow straight away (right after the assistant built it). */
  autoCheck: boolean;
  onAutoCheckDone: () => void;
  /** Canvas has loaded the workflow's nodes. */
  graphReady: boolean;
  /** Platform staff can switch workflows on; workspace admins keep drafts. */
  canActivate: boolean;
}

type Guide = { nodeId: string | null; code: string } | null;

type Entry =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'text'; text: string }
  | { id: number; kind: 'error'; error: string; retry: Record<string, unknown> | null }
  | { id: number; kind: 'checklist'; checklist: Checklist; intro?: string }
  | { id: number; kind: 'ready'; checklist: Checklist }
  | { id: number; kind: 'test'; result: TestRunResult }
  | { id: number; kind: 'ask'; ask: AssistantAsk; guide: boolean; done?: boolean }
  | {
      id: number;
      kind: 'proposal';
      proposal: CanvasProposal;
      guide: Guide;
      status: 'pending' | 'applying' | 'applied' | 'cancelled' | 'undone';
      snapshot?: unknown;
      saved?: boolean;
    };

let seq = 0;
const nid = () => ++seq;
const keyOf = (g: { nodeId: string | null; code: string }) => `${g.nodeId ?? '-'}|${g.code}`;

export default function WorkflowAssistantWidget(props: WorkflowAssistantWidgetProps) {
  const { getGraph, applyProposal, restore, focusNode, autoCheck, onAutoCheckDone, graphReady, canActivate } = props;
  const [open, setOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [progress, setProgress] = React.useState<{ ready: number; total: number; done: boolean } | null>(null);
  const skipped = React.useRef(new Set<string>());
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const autoRan = React.useRef(false);

  const push = React.useCallback((e: Entry) => setEntries((prev) => [...prev, e]), []);
  const patch = (id: number, p: Partial<Entry>) => setEntries((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...p } as Entry) : e)));

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [entries, busy]);

  // Hidden by Activity (navigated away): collapse, and drop the canvas highlight.
  React.useLayoutEffect(
    () => () => {
      setOpen(false);
    },
    [],
  );

  const history = () =>
    entries
      .filter((e): e is Extract<Entry, { kind: 'user' | 'text' }> => e.kind === 'user' || e.kind === 'text')
      .slice(-6)
      .map((e) => ({ role: e.kind === 'user' ? 'user' : 'assistant', text: e.text }));

  const call = async (payload: Record<string, unknown>, graph?: CanvasGraph): Promise<AssistantResponse> => {
    const g = graph ?? getGraph();
    setBusy(true);
    try {
      return await callWorkflowAssistant({ ...payload, nodes: g.nodes, edges: g.edges });
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ the fix walkthrough

  const nextFix = async (cl: Checklist, graph?: CanvasGraph) => {
    for (const item of cl.items) {
      for (const issue of item.issues) {
        const g = { nodeId: item.nodeId, code: issue.code };
        if (skipped.current.has(keyOf(g)) || issue.fix.kind === 'external') continue;
        focusNode(item.nodeId);
        push({ id: nid(), kind: 'text', text: `${item.nodeId ? `Step ${item.number}, “${item.label}”` : item.label}: ${issue.message}` });
        if (issue.fix.kind === 'ask') {
          push({ id: nid(), kind: 'ask', guide: true, ask: { question: issue.fix.question, options: issue.fix.options, placeholder: issue.fix.placeholder, context: g } });
          return;
        }
        const res = await call({ stage: 'fix', nodeId: item.nodeId, code: issue.code }, graph);
        handle(res, { stage: 'fix', nodeId: item.nodeId, code: issue.code }, g);
        return;
      }
    }
    focusNode(null);
    const left = skipped.current.size;
    push({
      id: nid(),
      kind: 'text',
      text: left
        ? `I skipped ${left} item${left === 1 ? '' : 's'} for now. Say “check my workflow” whenever you want to pick ${left === 1 ? 'it' : 'them'} up again.`
        : 'Nothing else I can fix from here.',
    });
  };

  const onChecklist = (cl: Checklist, intro: string | undefined, guide: boolean, graph?: CanvasGraph) => {
    setProgress({ ready: cl.readyCount, total: cl.total, done: cl.ready });
    push({ id: nid(), kind: 'checklist', checklist: cl, intro });
    if (cl.ready) {
      focusNode(null);
      push({ id: nid(), kind: 'ready', checklist: cl });
    } else if (guide) {
      void nextFix(cl, graph);
    }
  };

  const handle = (res: AssistantResponse, retry: Record<string, unknown>, guide: Guide = null, graph?: CanvasGraph) => {
    if (!res.ok) {
      push({ id: nid(), kind: 'error', error: res.error, retry: res.retryable ? retry : null });
      return;
    }
    switch (res.type) {
      case 'answer':
        push({ id: nid(), kind: 'text', text: res.text });
        break;
      case 'proposal':
        push({ id: nid(), kind: 'proposal', proposal: res.proposal, guide, status: 'pending' });
        break;
      case 'checklist':
        onChecklist(res.checklist, res.intro, true, graph);
        break;
      case 'ask':
        push({ id: nid(), kind: 'ask', ask: res.ask, guide: Boolean(guide) || res.ask.context.code !== 'add_after' });
        break;
      case 'test':
        push({ id: nid(), kind: 'test', result: res.result });
        break;
      default:
        break;
    }
  };

  const runCheck = async (graph?: CanvasGraph) => {
    const res = await call({ stage: 'check' }, graph);
    handle(res, { stage: 'check' }, null, graph);
  };

  const runTest = async () => {
    push({ id: nid(), kind: 'user', text: 'Run a safe test' });
    const res = await call({ stage: 'test' });
    handle(res, { stage: 'test' });
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    push({ id: nid(), kind: 'user', text });
    const payload = { stage: 'edit', message: text, history: history() };
    const res = await call(payload);
    handle(res, payload);
  };

  const apply = async (e: Extract<Entry, { kind: 'proposal' }>) => {
    patch(e.id, { status: 'applying' });
    const r = await applyProposal(e.proposal);
    patch(e.id, { status: 'applied', snapshot: r.snapshot, saved: r.saved });
    if (e.guide) await runCheck(r.graph);
  };

  const cancel = async (e: Extract<Entry, { kind: 'proposal' }>) => {
    patch(e.id, { status: 'cancelled' });
    if (e.guide) {
      skipped.current.add(keyOf(e.guide));
      push({ id: nid(), kind: 'text', text: 'Okay, I’ll leave that one. Moving on.' });
      await runCheck();
    }
  };

  const undo = async (e: Extract<Entry, { kind: 'proposal' }>) => {
    const ok = await restore(e.snapshot);
    patch(e.id, { status: 'undone' });
    push({ id: nid(), kind: 'text', text: ok ? 'Undone. The canvas is back to how it was, and saved.' : 'Undone on the canvas, but I couldn’t save it. Press Save at the top.' });
  };

  const answerAsk = async (e: Extract<Entry, { kind: 'ask' }>, answer: string) => {
    patch(e.id, { done: true });
    push({ id: nid(), kind: 'user', text: answer });
    const payload = { stage: 'fix', nodeId: e.ask.context.nodeId, code: e.ask.context.code, answer };
    const res = await call(payload);
    handle(res, payload, e.guide ? e.ask.context : null);
  };

  const skipAsk = async (e: Extract<Entry, { kind: 'ask' }>) => {
    patch(e.id, { done: true });
    if (!e.guide) return;
    skipped.current.add(keyOf(e.ask.context));
    push({ id: nid(), kind: 'text', text: 'No problem, we can come back to it. Next one.' });
    await runCheck();
  };

  const startCheck = async () => {
    skipped.current.clear();
    push({ id: nid(), kind: 'user', text: 'Check my workflow' });
    await runCheck();
  };

  // Right after the assistant built the workflow: open and walk through it.
  React.useEffect(() => {
    if (!autoCheck || !graphReady || autoRan.current) return;
    autoRan.current = true;
    setOpen(true);
    push({ id: nid(), kind: 'text', text: 'Your draft is on the canvas. Let me check that every step is ready to work.' });
    void runCheck().finally(onAutoCheckDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, graphReady]);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const lastId = entries[entries.length - 1]?.id;

  if (!open) {
    return (
      <div className="absolute right-3 top-3 z-20">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} icon={<Sparkles className="size-4" />} className="shadow-md">
          Ask the assistant
          {progress && !progress.done && (
            <span className="ml-1 rounded-sm bg-warning-bg px-1.5 text-caption tabular-nums text-warning-fg">
              {progress.ready}/{progress.total}
            </span>
          )}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label="Workflow assistant"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
      }}
      className="absolute bottom-3 right-3 top-3 z-20 flex w-[380px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-brand-text" aria-hidden />
          <h2 className="truncate text-body-strong text-fg">Workflow assistant</h2>
          {progress && (
            <span className={cn('rounded-sm px-1.5 text-caption tabular-nums', progress.done ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
              {progress.done ? 'Ready' : `${progress.ready} of ${progress.total} ready`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => void startCheck()} disabled={busy} icon={<ListChecks className="size-4" />}>
            Check
          </Button>
          <IconButton label="Close assistant" size="sm" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </IconButton>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3" aria-live="polite">
        <div className="flex flex-col gap-3">
          {entries.length === 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-small text-fg-secondary">
                I can check that every step is ready and fix them with you one by one, explain a step, change a setting, add or remove steps, or run a safe test. I always show the change first.
              </p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestions">
                {CANVAS_EXAMPLES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    onClick={() => (p === 'Check my workflow' ? void startCheck() : p === 'Run a safe test' ? void runTest() : void send(p))}
                    className="focus-ring rounded-full border border-line-strong bg-surface px-2.5 py-1 text-small text-fg hover:bg-subtle disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.map((e) => {
            const active = e.id === lastId && !busy;
            switch (e.kind) {
              case 'user':
                return (
                  <p key={e.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-action px-3 py-2 text-small text-action-fg">
                    {e.text}
                  </p>
                );
              case 'text':
                return (
                  <p key={e.id} className="max-w-[95%] whitespace-pre-wrap text-small text-fg">
                    {e.text}
                  </p>
                );
              case 'error':
                return <InlineError key={e.id} message={e.error} onRetry={e.retry && active ? () => void call(e.retry!).then((r) => handle(r, e.retry!)) : undefined} className="text-small" />;
              case 'checklist':
                return <ChecklistCard key={e.id} checklist={e.checklist} intro={e.intro} onPick={focusNode} />;
              case 'ready':
                return <ReadyCard key={e.id} checklist={e.checklist} canActivate={canActivate} onTest={() => void runTest()} disabled={busy} />;
              case 'test':
                return <TestCard key={e.id} result={e.result} onFix={() => void startCheck()} onFocus={focusNode} disabled={busy} />;
              case 'ask':
                return <AskCard key={e.id} entry={e} active={!e.done && !busy} onAnswer={(a) => void answerAsk(e, a)} onSkip={() => void skipAsk(e)} />;
              case 'proposal':
                return (
                  <ProposalCard
                    key={e.id}
                    entry={e}
                    busy={busy}
                    onApply={() => void apply(e)}
                    onCancel={() => void cancel(e)}
                    onUndo={() => void undo(e)}
                  />
                );
            }
          })}

          {busy && (
            <span role="status" className="flex items-center gap-2 text-small text-fg-secondary">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Working on it…
            </span>
          )}
        </div>
      </div>

      <form
        className="flex items-end gap-2 border-t border-line px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="wf-widget-input" className="sr-only">
          Ask the workflow assistant
        </label>
        <textarea
          id="wf-widget-input"
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={800}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (isSendKey(e)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="e.g. “make the wait 2 days” or “it isn’t sending”"
          className="focus-ring min-h-9 w-full resize-none rounded-md border border-line-strong bg-surface px-2.5 py-2 text-small text-fg placeholder:text-fg-disabled disabled:bg-subtle"
        />
        <IconButton label="Send" variant="primary" size="sm" type="submit" disabled={busy || !input.trim()}>
          <ArrowUp className="size-4" />
        </IconButton>
      </form>
    </section>
  );
}

function ChecklistCard({ checklist, intro, onPick }: { checklist: Checklist; intro?: string; onPick: (id: string | null) => void }) {
  const pct = checklist.total ? Math.round((checklist.readyCount / checklist.total) * 100) : 0;
  return (
    <div className="rounded-md border border-line bg-app p-3">
      {intro && <p className="mb-2 text-small text-fg">{intro}</p>}
      <p className="text-small font-medium text-fg">
        {checklist.readyCount} of {checklist.total} steps ready
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Steps ready">
        <div className={cn('h-full rounded-full', checklist.ready ? 'bg-success-500' : 'bg-warning-400')} style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-2.5 flex flex-col gap-1">
        {checklist.items.map((it) => (
          <li key={`${it.nodeId}-${it.label}`}>
            <button
              type="button"
              onClick={() => onPick(it.nodeId)}
              className="focus-ring flex w-full items-start gap-2 rounded-sm px-1 py-0.5 text-left text-small hover:bg-subtle"
            >
              {it.ready ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-fg" aria-label="Ready" /> : <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning-fg" aria-label="Needs attention" />}
              <span className="min-w-0">
                <span className="text-fg">{it.nodeId ? `${it.number}. ${it.label}` : it.label}</span>
                {!it.ready && <span className="block text-fg-secondary">{it.issues.map((i) => i.message).join(' ')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadyCard({ checklist, canActivate, onTest, disabled }: { checklist: Checklist; canActivate: boolean; onTest: () => void; disabled: boolean }) {
  return (
    <div className="rounded-md border border-success-fg/30 bg-success-bg/40 p-3">
      <p className="flex items-center gap-2 text-body-strong text-fg">
        <PartyPopper className="size-4 text-success-fg" aria-hidden />
        Your workflow is ready
      </p>
      <p className="mt-1 text-small text-fg-secondary">Here’s what will happen:</p>
      <ol className="mt-1 list-decimal pl-5 text-small text-fg">
        {checklist.summary.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      {checklist.external.length > 0 && (
        <div className="mt-2 rounded-sm bg-warning-bg px-2 py-1.5 text-small text-warning-fg">
          <p className="font-medium">Before it can send for real:</p>
          <ul className="list-disc pl-4">
            {checklist.external.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-small text-fg-secondary">
        {canActivate
          ? 'It’s still a draft. When you’re happy, switching it on is your call: use the Active switch at the top.'
          : 'It’s saved as a draft and stays off. Switching it on is always a separate, deliberate step by your platform team.'}
      </p>
      <div className="mt-2.5">
        <Button size="sm" variant="primary" onClick={onTest} disabled={disabled} icon={<FlaskConical className="size-4" />}>
          Run a safe test
        </Button>
      </div>
    </div>
  );
}

function TestCard({ result, onFix, onFocus, disabled }: { result: TestRunResult; onFix: () => void; onFocus: (id: string | null) => void; disabled: boolean }) {
  return (
    <div className={cn('rounded-md border p-3', result.passed ? 'border-success-fg/30' : 'border-danger-fg/30')}>
      <p className="flex items-center gap-2 text-small font-medium text-fg">
        <FlaskConical className="size-4" aria-hidden />
        Safe test run (simulated, nothing sent)
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {result.steps.map((s, i) => (
          <li key={`${s.number}-${i}`} className="flex items-start gap-2 text-small">
            {s.status === 'ok' ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-fg" aria-label="Passed" />
            ) : s.status === 'skipped' ? (
              <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-fg-tertiary" aria-label="Not reached" />
            ) : (
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger-fg" aria-label="Failed" />
            )}
            <span className="min-w-0">
              <span className="text-fg">
                {s.number}. {s.label}
              </span>
              <span className="block text-fg-secondary">{s.text}</span>
            </span>
          </li>
        ))}
      </ul>
      {result.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-small text-warning-fg">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className={cn('mt-2 text-small', result.passed ? 'text-success-fg' : 'text-danger-fg')}>{result.explanation}</p>
      {!result.passed && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={disabled}
            onClick={() => {
              onFocus(result.failedNodeId);
              onFix();
            }}
          >
            Fix it with me
          </Button>
        </div>
      )}
    </div>
  );
}

function AskCard({
  entry,
  active,
  onAnswer,
  onSkip,
}: {
  entry: Extract<Entry, { kind: 'ask' }>;
  active: boolean;
  onAnswer: (a: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = React.useState('');
  const { ask } = entry;
  return (
    <div className="rounded-md border border-line bg-app p-3">
      {ask.error && <p className="mb-1.5 text-small text-danger-fg">{ask.error}</p>}
      <p id={`ask-${entry.id}`} className="text-small font-medium text-fg">
        {ask.question}
      </p>
      {ask.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-labelledby={`ask-${entry.id}`}>
          {ask.options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={!active}
              onClick={() => onAnswer(o)}
              className="focus-ring rounded-full border border-line-strong bg-surface px-2.5 py-1 text-small text-fg hover:bg-subtle disabled:opacity-50"
            >
              {o}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onAnswer(text.trim());
        }}
      >
        <Input
          aria-label={ask.question}
          placeholder={ask.placeholder}
          value={text}
          disabled={!active}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          className="h-8 text-small"
        />
        <Button size="sm" variant="primary" type="submit" disabled={!active || !text.trim()}>
          OK
        </Button>
      </form>
      {active && entry.guide && (
        <button type="button" onClick={onSkip} className="focus-ring mt-1.5 rounded-sm text-caption text-fg-tertiary underline-offset-2 hover:text-fg hover:underline">
          Skip for now
        </button>
      )}
    </div>
  );
}

function ProposalCard({
  entry,
  busy,
  onApply,
  onCancel,
  onUndo,
}: {
  entry: Extract<Entry, { kind: 'proposal' }>;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const { proposal, status } = entry;
  return (
    <div className="rounded-md border border-brand-600/40 bg-surface p-3">
      <p className="text-small font-medium text-fg">{proposal.summary}</p>
      {proposal.changes.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-caption text-fg-secondary">
          {proposal.changes.map((c, i) => (
            <li key={i} className="flex gap-1.5">
              <CircleDashed className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {status === 'pending' && (
          <>
            <Button size="sm" variant="brand" onClick={onApply} disabled={busy} icon={<Check className="size-4" />}>
              Apply
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </>
        )}
        {status === 'applying' && (
          <span role="status" className="flex items-center gap-1.5 text-small text-fg-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Applying…
          </span>
        )}
        {status === 'applied' && (
          <>
            <span className="flex items-center gap-1.5 text-small text-success-fg">
              <CheckCircle2 className="size-4" aria-hidden />
              {entry.saved ? 'Applied and saved as a draft' : 'Applied (press Save to keep it)'}
            </span>
            <Button size="sm" variant="ghost" onClick={onUndo} disabled={busy} icon={<Undo2 className="size-4" />}>
              Undo
            </Button>
          </>
        )}
        {status === 'cancelled' && <span className="text-small text-fg-tertiary">Cancelled. Nothing changed.</span>}
        {status === 'undone' && <span className="text-small text-fg-tertiary">Undone.</span>}
      </div>
    </div>
  );
}
