'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Badge, Button, IconButton, Select, Textarea } from '@/components/ui';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { cn } from '@/lib/cn';
import {
  ASSISTANT_FRAMEWORKS,
  ASSISTANT_TARGET_WORDS,
  ASSISTANT_WORD_LIMIT,
  AUTO_FRAMEWORK_ID,
  countWords,
  type AssistantAnswer,
  type AssistantCallContext,
  type AssistantLinkedInPost,
  type AssistantPlan,
  type AssistantPurpose,
  type AssistantQuestion,
  type AssistantRequest,
  type AssistantResponse,
  type AssistantStage,
} from '@/lib/coldEmailAssistant';
import { fillEmptyCampaignFields, saveCampaignMessage, useCampaignMessage, postText } from '@/lib/campaignMessage';

const REQUEST_TIMEOUT_MS = 60000;

type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'note'; text: string; retry?: () => void }
  | { id: string; kind: 'questions'; text: string; questions: AssistantQuestion[] }
  | { id: string; kind: 'plan'; text: string; plan: AssistantPlan }
  | { id: string; kind: 'draft'; text: string; subject: string; body: string; wordCount: number; frameworkName: string; trimmed?: boolean }
  | { id: string; kind: 'post'; text: string; post: AssistantLinkedInPost };

type Phase = 'idle' | 'questions' | 'plan' | 'changing' | 'drafted';

export interface AssistantAutoStart {
  /** Change the key to start again. */
  key: string;
  idea: string;
  stage?: 'questions' | 'draft';
  /** LinkedIn post to mirror as an email. */
  sourcePost?: string;
  /** Shown in the chat as the rep's first message. */
  label?: string;
}

export interface ColdEmailAssistantProps {
  recipient: { name: string; company: string; title: string };
  sender: { name: string; company: string };
  /** What is in the editor right now. */
  draft: { subject: string; body: string };
  /** Put a subject and body into the editor. */
  onApply: (subject: string, body: string) => void;
  frameworkId: string;
  onFrameworkChange: (id: string) => void;
  purpose?: AssistantPurpose;
  callContext?: AssistantCallContext;
  autoStart?: AssistantAutoStart | null;
  /** Offer "Mirror on LinkedIn" after a draft. */
  enableLinkedInMirror?: boolean;
  placeholder?: string;
  /** Height of the conversation area. */
  logClassName?: string;
  className?: string;
  /** Hide the heading (when the host already shows one). */
  hideHeading?: boolean;
}

let seq = 0;
const nextId = () => `ce-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export default function ColdEmailAssistant({
  recipient,
  sender,
  draft,
  onApply,
  frameworkId,
  onFrameworkChange,
  purpose = 'cold',
  callContext,
  autoStart,
  enableLinkedInMirror = true,
  placeholder,
  logClassName,
  className,
  hideHeading,
}: ColdEmailAssistantProps) {
  const campaign = useCampaignMessage();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [idea, setIdea] = useState('');
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [answers, setAnswers] = useState<AssistantAnswer[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<AssistantQuestion[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<AssistantStage | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draftRef = useRef(draft);
  useLayoutEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const push = useCallback((item: ChatItem) => setItems((prev) => [...prev, item]), []);

  const history = useMemo(
    () =>
      items
        .map((it) => {
          if (it.kind === 'user') return { role: 'user' as const, text: it.text };
          if (it.kind === 'draft') return { role: 'assistant' as const, text: `${it.text} [Draft] Subject: ${it.subject} | ${it.body}` };
          if (it.kind === 'plan') return { role: 'assistant' as const, text: `${it.text} [Plan] ${it.plan.frameworkName}: ${it.plan.beats.join(' / ')}` };
          if (it.kind === 'questions') return { role: 'assistant' as const, text: `${it.text} ${it.questions.map((q) => q.text).join(' ')}` };
          return { role: 'assistant' as const, text: it.text };
        })
        .slice(-12),
    [items],
  );

  const apply = useCallback(
    (itemId: string, subject: string, body: string) => {
      setUndo({ subject: draftRef.current.subject, body: draftRef.current.body });
      onApply(subject, body);
      setInsertedId(itemId);
    },
    [onApply],
  );

  const handleUndo = () => {
    if (!undo) return;
    onApply(undo.subject, undo.body);
    setUndo(null);
    setInsertedId(null);
  };

  type RunExtra = Partial<AssistantRequest> & { retryLabel?: string };
  const runRef = useRef<(stage: AssistantStage, extra?: RunExtra) => Promise<void>>(async () => {});
  const run = useCallback(
    async (stage: AssistantStage, extra: Partial<AssistantRequest> & { retryLabel?: string } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      setBusy(stage);
      const body: AssistantRequest = {
        stage,
        purpose,
        callContext: purpose === 'followup' ? callContext : undefined,
        idea: extra.idea ?? idea,
        message: extra.message,
        history,
        answers: 'answers' in extra ? extra.answers : answers,
        plan: 'plan' in extra ? extra.plan : plan ?? undefined,
        currentDraft: extra.currentDraft,
        sourcePost: extra.sourcePost,
        recipient,
        sender,
        frameworkId,
        campaign: { angle: campaign.angle, pain: campaign.pain, proof: campaign.proof, offer: campaign.offer },
      };
      const retry = () => void runRef.current(stage, extra);
      try {
        const res = await fetch('/api/ai/cold-email-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => null)) as (AssistantResponse & { error?: string }) | null;
        if (!res.ok || !data) {
          push({ id: nextId(), kind: 'note', text: data?.error || `The assistant could not answer (${res.status}).`, retry });
          return;
        }
        if (data.stage === 'questions' && data.questions && data.questions.length > 0) {
          setPendingQuestions(data.questions);
          setChoice({});
          setFreeText(Object.fromEntries(data.questions.filter((q) => q.prefill).map((q) => [q.id, q.prefill as string])));
          setPhase('questions');
          push({ id: nextId(), kind: 'questions', text: data.message, questions: data.questions });
        } else if (data.stage === 'plan' && data.plan) {
          setPlan(data.plan);
          setPhase('plan');
          push({ id: nextId(), kind: 'plan', text: data.message, plan: data.plan });
        } else if (data.stage === 'draft' && data.body) {
          const id = nextId();
          const subject = data.subject || '';
          push({
            id,
            kind: 'draft',
            text: data.message,
            subject,
            body: data.body,
            wordCount: data.wordCount ?? countWords(data.body),
            frameworkName: data.framework.name,
            trimmed: data.trimmed,
          });
          setPhase('drafted');
          if (data.framework.id && data.framework.id !== AUTO_FRAMEWORK_ID && frameworkId !== AUTO_FRAMEWORK_ID && data.framework.id !== frameworkId) {
            onFrameworkChange(data.framework.id);
          }
          if (data.campaign) fillEmptyCampaignFields(data.campaign);
          saveCampaignMessage({ lastEmail: { subject, body: data.body, at: new Date().toISOString() } });
          // Empty editor: put the draft straight in (Undo stays available).
          if (!draftRef.current.subject.trim() && !draftRef.current.body.trim()) apply(id, subject, data.body);
        } else if (data.stage === 'linkedin' && data.post) {
          push({ id: nextId(), kind: 'post', text: data.message, post: data.post });
          saveCampaignMessage({
            lastPost: { hook: data.post.hook, body: data.post.body, cta: data.post.cta, hashtags: data.post.hashtags, source: 'email', at: new Date().toISOString() },
          });
        } else {
          push({ id: nextId(), kind: 'note', text: data.message || 'No result. Try again.', retry });
        }
      } catch (err) {
        const aborted = (err as Error)?.name === 'AbortError';
        push({ id: nextId(), kind: 'note', text: aborted ? 'The assistant took too long to answer.' : 'Could not reach the assistant. Check your connection.', retry });
      } finally {
        clearTimeout(timer);
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(null);
      }
    },
    [purpose, callContext, idea, history, answers, plan, recipient, sender, frameworkId, campaign, push, onFrameworkChange, apply],
  );

  useLayoutEffect(() => {
    runRef.current = run;
  });

  const reset = () => {
    abortRef.current?.abort();
    setItems([]);
    setPhase('idle');
    setIdea('');
    setPlan(null);
    setAnswers([]);
    setPendingQuestions([]);
    setInsertedId(null);
    setInput('');
    inputRef.current?.focus();
  };

  const startIdea = (text: string, stage: 'questions' | 'draft' = 'questions', sourcePost?: string, label?: string) => {
    setIdea(text);
    setPlan(null);
    setAnswers([]);
    push({ id: nextId(), kind: 'user', text: label || text });
    void run(stage, { idea: text, answers: [], plan: undefined, sourcePost, message: stage === 'draft' ? text : undefined });
  };

  // Auto start (post-call follow-up, mirror from LinkedIn, campaign message).
  const startedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!autoStart || startedKey.current === autoStart.key) return;
    // Mark as started only when it really runs (StrictMode runs effects twice and clears the first timer).
    const t = setTimeout(() => {
      if (startedKey.current === autoStart.key) return;
      startedKey.current = autoStart.key;
      startIdea(autoStart.idea, autoStart.stage ?? 'questions', autoStart.sourcePost, autoStart.label);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart?.key]);

  const submitAnswers = (extraNote?: string) => {
    const collected: AssistantAnswer[] = pendingQuestions
      .map((q) => ({ question: q.text, answer: (freeText[q.id] || '').trim() || choice[q.id] || '' }))
      .filter((a) => a.answer);
    if (extraNote) collected.push({ question: 'Rep added', answer: extraNote });
    const summary = collected.length > 0 ? collected.map((a) => a.answer).join(' · ') : 'No preference, use your judgment.';
    push({ id: nextId(), kind: 'user', text: summary });
    setAnswers(collected);
    setPendingQuestions([]);
    setPhase('plan');
    void run('plan', { answers: collected, plan: undefined });
  };

  const editorDraft = () =>
    draftRef.current.body.trim() ? { subject: draftRef.current.subject, body: draftRef.current.body } : undefined;

  const latestDraft = () => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'draft') return { subject: it.subject, body: it.body };
    }
    return undefined;
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    if (phase === 'idle') {
      startIdea(text);
      return;
    }
    if (phase === 'questions') {
      submitAnswers(text);
      return;
    }
    push({ id: nextId(), kind: 'user', text });
    if (phase === 'plan' || phase === 'changing') {
      setPhase('plan');
      void run('plan', { message: text, plan: plan ?? undefined });
      return;
    }
    // Drafted: refine the email in the editor (or the latest draft).
    void run('draft', { message: text, currentDraft: editorDraft() || latestDraft() });
  };

  const skipToDraft = () => {
    if (busy) return;
    const text = input.trim();
    setInput('');
    if (phase === 'idle') {
      if (!text) {
        inputRef.current?.focus();
        return;
      }
      startIdea(text, 'draft');
      return;
    }
    if (text) push({ id: nextId(), kind: 'user', text });
    const partial: AssistantAnswer[] | undefined =
      phase === 'questions'
        ? pendingQuestions
            .map((q) => ({ question: q.text, answer: (freeText[q.id] || '').trim() || choice[q.id] || '' }))
            .filter((a) => a.answer)
        : undefined;
    if (partial) setAnswers(partial);
    setPendingQuestions([]);
    void run('draft', {
      message: text || undefined,
      ...(partial ? { answers: partial } : {}),
      plan: plan ?? undefined,
      currentDraft: phase === 'drafted' && text ? editorDraft() || latestDraft() : undefined,
    });
  };

  const approvePlan = () => {
    if (!plan) return;
    push({ id: nextId(), kind: 'user', text: 'Looks good, write it.' });
    void run('draft', { plan });
  };

  const changePlan = () => {
    setPhase('changing');
    inputRef.current?.focus();
  };

  const mirror = (d: { subject: string; body: string }) => {
    push({ id: nextId(), kind: 'user', text: 'Mirror this on LinkedIn.' });
    void run('linkedin', { currentDraft: d });
  };

  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const editorWords = countWords(draft.body);
  const overLimit = editorWords >= ASSISTANT_WORD_LIMIT;
  const lastPlanId = [...items].reverse().find((i) => i.kind === 'plan')?.id;
  const lastQuestionsId = [...items].reverse().find((i) => i.kind === 'questions')?.id;

  const composerPlaceholder =
    phase === 'questions'
      ? 'Answer in your own words, or tap the options above'
      : phase === 'plan' || phase === 'changing'
        ? 'What should change in the plan?'
        : phase === 'drafted'
          ? 'Refine: "softer close", "shorter", "mention Salesforce"'
          : placeholder || 'Your idea in plain words, e.g. "follow up after our call, they are scaling outbound seats, soft CTA"';

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {!hideHeading && (
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-h3 text-fg">
              <Sparkles className="size-4 text-fg-secondary" aria-hidden />
              <span>Writing assistant</span>
            </h2>
            <p className="mt-0.5 text-small text-fg-secondary">Asks, plans, then writes from a proven framework.</p>
          </div>
          {items.length > 0 && (
            <IconButton label="Start a new email" size="sm" onClick={reset} title="Start over">
              <RotateCcw />
            </IconButton>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 px-4 pt-3">
        <label className="block min-w-0 flex-1 space-y-1">
          <span className="block text-caption text-fg-tertiary">Framework</span>
          <Select value={frameworkId} onChange={(e) => onFrameworkChange(e.target.value)} className="h-8 text-small">
            <option value={AUTO_FRAMEWORK_ID}>Auto (best fit)</option>
            {ASSISTANT_FRAMEWORKS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </label>
        <Badge tone="neutral" className="mb-1 shrink-0">Under 90 words</Badge>
        {hideHeading && items.length > 0 && (
          <IconButton label="Start a new email" size="sm" onClick={reset} title="Start over">
            <RotateCcw />
          </IconButton>
        )}
      </div>

      {/* Conversation */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with the writing assistant"
        className={cn('mt-3 max-h-[440px] min-h-[96px] space-y-3 overflow-y-auto border-y border-line bg-subtle px-4 py-3', logClassName)}
      >
        {items.length === 0 && !busy && (
          <p className="text-small text-fg-tertiary">
            Tell me what the email is about. I&apos;ll ask a couple of quick questions, show a short plan, then write it under {ASSISTANT_WORD_LIMIT} words.
          </p>
        )}

        {items.map((it) => {
          if (it.kind === 'user') {
            return (
              <div key={it.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-small text-fg shadow-xs ring-1 ring-line">{it.text}</p>
              </div>
            );
          }
          if (it.kind === 'note') {
            return (
              <div key={it.id} className="space-y-1.5 text-small text-fg-secondary" role={it.retry ? 'alert' : undefined}>
                <p>{it.text}</p>
                {it.retry && (
                  <Button variant="secondary" size="sm" onClick={it.retry} disabled={!!busy}>
                    <RotateCcw />
                    <span>Try again</span>
                  </Button>
                )}
              </div>
            );
          }
          if (it.kind === 'questions') {
            const active = phase === 'questions' && it.id === lastQuestionsId;
            return (
              <div key={it.id} className="space-y-2.5">
                <p className="text-small text-fg">{it.text}</p>
                <ol className="space-y-3">
                  {it.questions.map((q, qi) => (
                    <li key={q.id} className="space-y-1.5">
                      <p id={`${it.id}-${q.id}`} className="text-small font-medium text-fg">
                        {qi + 1}. {q.text}
                      </p>
                      {q.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${it.id}-${q.id}`}>
                          {q.options.map((opt) => {
                            const on = choice[q.id] === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={!active}
                                aria-pressed={on}
                                onClick={() => setChoice((c) => ({ ...c, [q.id]: on ? '' : opt }))}
                                className={cn(
                                  'focus-ring rounded-full border px-2.5 py-1 text-small transition-colors disabled:cursor-default disabled:opacity-60',
                                  on ? 'border-action bg-action text-action-fg' : 'border-line bg-surface text-fg-secondary hover:bg-subtle hover:text-fg',
                                )}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {active && (
                        <input
                          type="text"
                          aria-label={`Your answer: ${q.text}`}
                          value={freeText[q.id] || ''}
                          onChange={(e) => setFreeText((f) => ({ ...f, [q.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              submitAnswers();
                            }
                          }}
                          placeholder={q.options.length > 0 ? 'Or type your own answer' : 'Type your answer'}
                          className="focus-ring h-8 w-full rounded-sm border border-line bg-surface px-2.5 text-small text-fg placeholder:text-fg-tertiary"
                        />
                      )}
                    </li>
                  ))}
                </ol>
                {active && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" onClick={() => submitAnswers()} disabled={!!busy}>
                      <span>Continue</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          }
          if (it.kind === 'plan') {
            const active = (phase === 'plan' || phase === 'changing') && it.id === lastPlanId;
            return (
              <div key={it.id} className="space-y-2">
                <p className="text-small text-fg">{it.text}</p>
                <div className="space-y-2 rounded-md border border-line bg-surface p-3 text-small">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-fg">{it.plan.frameworkName}</span>
                    <span className="tabular-nums text-fg-tertiary">≈{it.plan.targetWords || ASSISTANT_TARGET_WORDS} words</span>
                  </div>
                  {it.plan.why && <p className="text-fg-secondary">{it.plan.why}</p>}
                  {it.plan.angle && (
                    <p className="text-fg">
                      <span className="text-fg-tertiary">Angle: </span>
                      {it.plan.angle}
                    </p>
                  )}
                  <ol className="list-decimal space-y-0.5 pl-4 text-fg">
                    {it.plan.beats.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ol>
                  <p className="text-fg-secondary">
                    <span className="text-fg-tertiary">CTA: </span>
                    {it.plan.ctaType}
                  </p>
                </div>
                {active && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={approvePlan} disabled={!!busy}>
                      <Check />
                      <span>Looks good, write it</span>
                    </Button>
                    <Button variant="secondary" size="sm" onClick={changePlan} disabled={!!busy} aria-pressed={phase === 'changing'}>
                      <span>Change something</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          }
          if (it.kind === 'draft') {
            const inserted = insertedId === it.id;
            return (
              <div key={it.id} className="space-y-2">
                <p className="text-small text-fg">{it.text}</p>
                <div className="space-y-2 rounded-md border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-tertiary">
                    <span>{it.frameworkName}</span>
                    <span className={cn('tabular-nums', it.wordCount >= ASSISTANT_WORD_LIMIT ? 'text-danger-fg' : 'text-success-fg')}>
                      {it.wordCount} words{it.trimmed ? ', trimmed to fit' : ''}
                    </span>
                  </div>
                  <p className="text-small text-fg">
                    <span className="text-fg-tertiary">Subject: </span>
                    <span className="font-medium">{it.subject}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-small leading-relaxed text-fg">{it.body}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {inserted ? (
                    <>
                      <Badge tone="success" className="h-8">
                        <Check className="size-3.5" aria-hidden />
                        <span>In the email</span>
                      </Badge>
                      {undo && (
                        <Button variant="ghost" size="sm" onClick={handleUndo}>
                          <Undo2 />
                          <span>Undo</span>
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => apply(it.id, it.subject, it.body)}>
                      <FileText />
                      <span>Insert into email</span>
                    </Button>
                  )}
                  {enableLinkedInMirror && (
                    <Button variant="secondary" size="sm" onClick={() => mirror({ subject: it.subject, body: it.body })} disabled={!!busy}>
                      <LinkedinIcon className="size-4" />
                      <span>Mirror on LinkedIn</span>
                    </Button>
                  )}
                  <IconButton label="Copy draft" size="sm" onClick={() => copy(`Subject: ${it.subject}\n\n${it.body}`, it.id)}>
                    {copied === it.id ? <Check /> : <Copy />}
                  </IconButton>
                </div>
              </div>
            );
          }
          // LinkedIn post
          const text = postText(it.post);
          return (
            <div key={it.id} className="space-y-2">
              <p className="text-small text-fg">{it.text}</p>
              <div className="space-y-2 rounded-md border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2 text-caption text-fg-tertiary">
                  <span className="flex items-center gap-1">
                    <LinkedinIcon className="size-3.5" />
                    LinkedIn post
                  </span>
                  <span className="tabular-nums">{it.post.wordCount} words</span>
                </div>
                <p className="whitespace-pre-wrap text-small leading-relaxed text-fg">{text}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => copy(text, it.id)}>
                  {copied === it.id ? <Check /> : <Copy />}
                  <span>{copied === it.id ? 'Copied' : 'Copy post'}</span>
                </Button>
                <Link href="/outreach/linkedin?mirror=email" className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-small text-fg-secondary hover:text-fg hover:underline">
                  <span>Open in LinkedIn studio</span>
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          );
        })}

        {busy && (
          <p className="flex items-center gap-2 text-small text-fg-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>
              {busy === 'questions' ? 'Reading your idea...' : busy === 'plan' ? 'Planning...' : busy === 'linkedin' ? 'Writing the LinkedIn post...' : 'Writing...'}
            </span>
          </p>
        )}
      </div>

      {/* Composer */}
      <div className="space-y-2 px-4 py-3">
        <label htmlFor="cold-email-assistant-input" className="sr-only">
          Message the writing assistant
        </label>
        <div className="relative">
          <Textarea
            id="cold-email-assistant-input"
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={composerPlaceholder}
            className="min-h-[64px] resize-none pr-11 text-small leading-relaxed"
          />
          <IconButton
            label="Send to assistant"
            variant="primary"
            size="sm"
            onClick={send}
            disabled={!input.trim() || !!busy}
            className="absolute bottom-2 right-2"
          >
            <ArrowUp />
          </IconButton>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-fg-tertiary">
          <button
            type="button"
            onClick={skipToDraft}
            disabled={!!busy}
            className="focus-ring inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:text-fg hover:underline disabled:opacity-50"
          >
            <Wand2 className="size-3.5" aria-hidden />
            Skip questions, just draft
          </button>
          <span className={cn('tabular-nums', overLimit && 'text-danger-fg')} aria-live="polite">
            Email: {editorWords} / under {ASSISTANT_WORD_LIMIT} words
          </span>
        </div>
        <p className="text-caption text-fg-tertiary">Enter to send, Shift+Enter for a new line.</p>
      </div>
    </div>
  );
}
