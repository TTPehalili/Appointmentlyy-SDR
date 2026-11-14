'use client';

import * as React from 'react';
import { AlertTriangle, ArrowUp, Check, Loader2, Pencil, RotateCcw, ShieldCheck, Sparkles, Wand2, X } from 'lucide-react';
import { Badge, Button, Dialog, IconButton, InlineError, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  EXAMPLE_PROMPTS,
  type AssistantAnswer,
  type AssistantQuestion,
  type AssistantResponse,
  type UnderstandingLine,
  type WorkflowPlan,
  type WorkflowSpec,
} from '@/lib/workflowAssistant';
import { callWorkflowAssistant, isSendKey } from './assistantClient';

type Entry =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; kind: 'text'; text: string }
  | { id: number; role: 'assistant'; kind: 'questions'; intro: string; questions: AssistantQuestion[] }
  | { id: number; role: 'assistant'; kind: 'understanding'; spec: WorkflowSpec; lines: UnderstandingLine[] }
  | { id: number; role: 'assistant'; kind: 'plan'; spec: WorkflowSpec; plan: WorkflowPlan }
  | { id: number; role: 'assistant'; kind: 'error'; error: string; retry: Record<string, unknown> | null };

type Phase = 'start' | 'questions' | 'confirm' | 'plan';

const KEYWORD: Record<UnderstandingLine['kind'], string> = {
  when: 'When',
  then: 'Then',
  wait: 'Wait',
  if: 'If',
  otherwise: 'Otherwise',
};

let entrySeq = 0;
const nextId = () => ++entrySeq;

export interface WorkflowAssistantDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new draft's id after "Build this workflow" succeeds. */
  onBuilt: (workflowId: string) => void;
  folderId?: string | null;
}

export default function WorkflowAssistantDialog({ open, onClose, onBuilt, folderId }: WorkflowAssistantDialogProps) {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [phase, setPhase] = React.useState<Phase>('start');
  const [busy, setBusy] = React.useState<null | 'think' | 'build'>(null);
  const [input, setInput] = React.useState('');
  const [request, setRequest] = React.useState('');
  const [spec, setSpec] = React.useState<WorkflowSpec | null>(null);
  const [changing, setChanging] = React.useState(false);
  const [buildKey, setBuildKey] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Cache Components keeps this page mounted but hidden (Activity) when the admin navigates away:
  // close the dialog so its modal backdrop never lingers over another page.
  React.useLayoutEffect(() => () => onCloseRef.current(), []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [entries, busy]);

  React.useEffect(() => {
    if (open && phase === 'start') {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open, phase]);

  const push = (e: Entry) => setEntries((prev) => [...prev, e]);

  const reset = () => {
    setEntries([]);
    setPhase('start');
    setBusy(null);
    setInput('');
    setRequest('');
    setSpec(null);
    setChanging(false);
    setBuildKey('');
  };

  const handle = (res: AssistantResponse, payload: Record<string, unknown>) => {
    if (!res.ok) {
      push({ id: nextId(), role: 'assistant', kind: 'error', error: res.error, retry: res.retryable ? payload : null });
      return;
    }
    switch (res.type) {
      case 'questions':
        push({ id: nextId(), role: 'assistant', kind: 'questions', intro: res.intro, questions: res.questions });
        setPhase('questions');
        break;
      case 'understanding':
        setSpec(res.spec);
        setChanging(false);
        push({ id: nextId(), role: 'assistant', kind: 'understanding', spec: res.spec, lines: res.lines });
        setPhase('confirm');
        break;
      case 'plan':
        setSpec(res.spec);
        setChanging(false);
        setBuildKey(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
        push({ id: nextId(), role: 'assistant', kind: 'plan', spec: res.spec, plan: res.plan });
        setPhase('plan');
        break;
      case 'built':
        reset();
        onBuilt(res.workflowId);
        break;
      default:
        break;
    }
  };

  const run = async (payload: Record<string, unknown>) => {
    setBusy(payload.stage === 'build' ? 'build' : 'think');
    try {
      const res = await callWorkflowAssistant(payload);
      handle(res, payload);
    } finally {
      setBusy(null);
    }
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    push({ id: nextId(), role: 'user', text });
    if (phase === 'start' || !spec) {
      setRequest(text);
      void run({ stage: 'interpret', request: text, answers: [] });
    } else {
      void run({ stage: 'interpret', request, previous: spec, change: text, questionsAsked: true });
    }
  };

  const submitAnswers = (answers: AssistantAnswer[]) => {
    push({ id: nextId(), role: 'user', text: answers.map((a) => a.answer).join(' · ') });
    void run({ stage: 'interpret', request, answers, questionsAsked: true });
  };

  const startChange = (hint: string) => {
    setChanging(true);
    push({ id: nextId(), role: 'assistant', kind: 'text', text: hint });
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const lastId = entries[entries.length - 1]?.id;
  const composerDisabled = Boolean(busy) || phase === 'questions';
  const placeholder =
    phase === 'questions'
      ? 'Answer the questions above (you can type your own answer there)'
      : phase === 'start'
        ? 'Describe what you want to automate, in your own words'
        : changing
          ? 'What should I change?'
          : 'Want something different? Describe the change';

  return (
    <Dialog open={open} onClose={onClose} title="Build a workflow with the AI assistant" size="xl" bare dismissible={busy !== 'build'}>
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand-text">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-h2 text-fg">Build with the AI assistant</h2>
              <p className="mt-0.5 text-small text-fg-secondary">
                Tell me what to automate. I’ll confirm what I understood and show you the plan. Nothing is built until you approve it.
              </p>
            </div>
          </div>
          <div className="-mr-2 -mt-1 flex items-center gap-1">
            {entries.length > 0 && (
              <Button size="sm" variant="ghost" onClick={reset} disabled={Boolean(busy)} icon={<RotateCcw className="size-4" />}>
                Start over
              </Button>
            )}
            <IconButton label="Close" size="sm" onClick={onClose} disabled={busy === 'build'}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="min-h-[320px] flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
          <div className="flex flex-col gap-4">
            <AssistantBubble>
              <p className="text-body text-fg">What would you like to automate? Describe it the way you’d explain it to a colleague.</p>
              {phase === 'start' && entries.length === 0 && (
                <div className="mt-3 flex flex-col gap-2" role="group" aria-label="Example requests">
                  <span className="text-caption text-fg-tertiary">Try one of these</span>
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => send(p)}
                      disabled={Boolean(busy)}
                      className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-left text-body text-fg transition-colors hover:border-line-strong hover:bg-subtle disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </AssistantBubble>

            {entries.map((e) => {
              const active = e.id === lastId && !busy;
              if (e.role === 'user') return <UserBubble key={e.id} text={e.text} />;
              switch (e.kind) {
                case 'text':
                  return (
                    <AssistantBubble key={e.id}>
                      <p className="text-body text-fg">{e.text}</p>
                    </AssistantBubble>
                  );
                case 'questions':
                  return (
                    <AssistantBubble key={e.id}>
                      <QuestionsCard intro={e.intro} questions={e.questions} active={active && phase === 'questions'} onSubmit={submitAnswers} />
                    </AssistantBubble>
                  );
                case 'understanding':
                  return (
                    <AssistantBubble key={e.id}>
                      <UnderstandingCard
                        lines={e.lines}
                        active={active && phase === 'confirm'}
                        onConfirm={() => {
                          push({ id: nextId(), role: 'user', text: 'Yes, that’s right' });
                          void run({ stage: 'plan', spec: e.spec });
                        }}
                        onChange={() => startChange('Sure. What should I change? For example “wait 2 days instead” or “alert the manager in Slack”.')}
                      />
                    </AssistantBubble>
                  );
                case 'plan':
                  return (
                    <AssistantBubble key={e.id} wide>
                      <PlanCard
                        plan={e.plan}
                        active={active && phase === 'plan'}
                        building={busy === 'build'}
                        onBuild={(name) => {
                          push({ id: nextId(), role: 'user', text: 'Build this workflow' });
                          void run({ stage: 'build', spec: e.spec, name, folderId: folderId || undefined, buildKey });
                        }}
                        onEdit={() => startChange('What would you like to change in the plan? Describe it and I’ll update it.')}
                      />
                    </AssistantBubble>
                  );
                case 'error':
                  return (
                    <AssistantBubble key={e.id}>
                      <InlineError
                        message={e.error}
                        onRetry={e.retry && active ? () => void run(e.retry as Record<string, unknown>) : undefined}
                      />
                    </AssistantBubble>
                  );
              }
            })}

            {busy && (
              <AssistantBubble>
                <span role="status" className="flex items-center gap-2 text-body text-fg-secondary">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {busy === 'build' ? 'Building your workflow as a draft…' : 'Thinking…'}
                </span>
              </AssistantBubble>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-line px-5 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2"
          >
            <label htmlFor="wf-assistant-input" className="sr-only">
              Message the workflow assistant
            </label>
            <textarea
              id="wf-assistant-input"
              ref={inputRef}
              rows={2}
              value={input}
              disabled={composerDisabled}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (isSendKey(e)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              maxLength={1500}
              className="focus-ring min-h-[44px] w-full resize-none rounded-md border border-line-strong bg-surface px-3 py-2 text-body text-fg placeholder:text-fg-disabled disabled:cursor-not-allowed disabled:bg-subtle"
            />
            <IconButton label="Send" variant="primary" size="md" type="submit" disabled={composerDisabled || !input.trim()}>
              <ArrowUp className="size-4" />
            </IconButton>
          </form>
          <p className="mt-1.5 text-caption text-fg-tertiary">Enter to send · Shift+Enter for a new line · Nothing is switched on or sent while you build.</p>
        </div>
      </div>
    </Dialog>
  );
}

function AssistantBubble({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-secondary" aria-hidden>
        <Wand2 className="size-3.5" />
      </span>
      <div className={cn('min-w-0 rounded-lg border border-line bg-surface px-3.5 py-3 shadow-xs', wide ? 'flex-1' : 'max-w-[90%]')}>{children}</div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-action px-3.5 py-2.5 text-body text-action-fg">{text}</p>
    </div>
  );
}

function QuestionsCard({
  intro,
  questions,
  active,
  onSubmit,
}: {
  intro: string;
  questions: AssistantQuestion[];
  active: boolean;
  onSubmit: (answers: AssistantAnswer[]) => void;
}) {
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const submit = () =>
    onSubmit(
      questions.map((q) => ({
        id: q.id,
        question: q.question,
        answer: (typed[q.id] || '').trim() || picked[q.id] || 'No preference, use your best judgment',
      })),
    );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-fg">{intro}</p>
      {questions.map((q, qi) => (
        <div key={q.id} className="flex flex-col gap-2">
          <p id={`wfq-${q.id}`} className="text-body-strong text-fg">
            {qi + 1}. {q.question}
          </p>
          {q.options.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`wfq-${q.id}`}>
              {q.options.map((o) => {
                const on = picked[q.id] === o && !(typed[q.id] || '').trim();
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={!active}
                    aria-pressed={on}
                    onClick={() => {
                      setPicked((p) => ({ ...p, [q.id]: o }));
                      setTyped((t) => ({ ...t, [q.id]: '' }));
                    }}
                    className={cn(
                      'focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small transition-colors disabled:opacity-60',
                      on ? 'border-selected bg-selected text-selected-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle',
                    )}
                  >
                    {on && <Check className="size-3.5" aria-hidden />}
                    {o}
                  </button>
                );
              })}
            </div>
          )}
          <Input
            aria-label={`Your own answer to: ${q.question}`}
            placeholder="Or type your own answer"
            value={typed[q.id] || ''}
            disabled={!active}
            maxLength={300}
            onChange={(e) => setTyped((t) => ({ ...t, [q.id]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
      ))}
      {active && (
        <div>
          <Button variant="primary" size="sm" onClick={submit} icon={<Check className="size-4" />}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

function UnderstandingCard({
  lines,
  active,
  onConfirm,
  onChange,
}: {
  lines: UnderstandingLine[];
  active: boolean;
  onConfirm: () => void;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h3 text-fg">Here’s what I understood</h3>
      <ul className="flex flex-col gap-1.5" aria-label="What I understood">
        {lines.map((l, i) => (
          <li key={i} className={cn('flex gap-2 text-body text-fg', l.depth > 0 && 'pl-6')}>
            <span className="w-[74px] shrink-0 text-body-strong text-fg">{KEYWORD[l.kind]}</span>
            <span className="min-w-0">{l.text}</span>
          </li>
        ))}
      </ul>
      {active && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="brand" size="sm" onClick={onConfirm} icon={<Check className="size-4" />}>
            Yes, that’s right
          </Button>
          <Button variant="secondary" size="sm" onClick={onChange} icon={<Pencil className="size-4" />}>
            Change something
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  active,
  building,
  onBuild,
  onEdit,
}: {
  plan: WorkflowPlan;
  active: boolean;
  building: boolean;
  onBuild: (name: string) => void;
  onEdit: () => void;
}) {
  const [name, setName] = React.useState(plan.name);
  return (
    <section className="flex flex-col gap-4" aria-label="Workflow plan">
      <div>
        <h3 className="text-h3 text-fg">The plan</h3>
        <p className="mt-0.5 text-small text-fg-secondary">
          {plan.steps.length} steps, connected left to right on the canvas. Review it, then build.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-fg">Workflow name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!active} />
      </label>

      {plan.todo.length > 0 && (
        <div className="rounded-md border border-warning-fg/30 bg-warning-bg px-3.5 py-3">
          <p className="flex items-center gap-2 text-body-strong text-warning-fg">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            You’ll need to fill these in before you switch it on
          </p>
          <ul className="mt-1.5 list-disc pl-9 text-small text-warning-fg">
            {plan.todo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <ol className="flex flex-col gap-3" aria-label="Steps">
        {plan.steps.map((st) => (
          <li key={st.number} className="flex gap-3 rounded-md border border-line bg-app px-3.5 py-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-action text-caption tabular-nums text-action-fg">
              {st.number}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{st.kind}</Badge>
                {st.branch && <Badge tone="brand">{st.branch}</Badge>}
              </div>
              <p className="mt-1 text-body-strong text-fg">{st.title}</p>
              <p className="text-small text-fg-secondary">{st.does}</p>
              {st.settings.length > 0 && (
                <dl className="mt-2 grid grid-cols-[minmax(84px,auto)_1fr] gap-x-3 gap-y-1 text-small">
                  {st.settings.map((x) => (
                    <React.Fragment key={x.label}>
                      <dt className="text-fg-tertiary">{x.label}</dt>
                      <dd className="min-w-0 break-words text-fg">{x.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              {st.todo.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {st.todo.map((t) => (
                    <li key={t} className="flex items-start gap-1.5 rounded-sm bg-warning-bg px-2 py-1 text-small text-warning-fg">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>
                        <span className="font-medium">To do:</span> {t}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="flex items-start gap-2 text-small text-fg-secondary">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        It will be saved as a draft. Nothing is switched on, run or sent while building.
      </p>

      {active && (
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" size="sm" loading={building} onClick={() => onBuild(name.trim() || plan.name)} icon={<Wand2 className="size-4" />}>
            Build this workflow
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit} disabled={building} icon={<Pencil className="size-4" />}>
            Edit plan
          </Button>
        </div>
      )}
    </section>
  );
}
