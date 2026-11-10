'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, GraduationCap, RotateCcw, X } from 'lucide-react';
import { Badge, Button, Dialog, Meter, buttonClasses } from '@/components/ui';
import type { SparringPersona } from '@/lib/personas';
import type { QaEvaluationResult } from '@/lib/qaEvaluator';
import {
  type PracticeDifficulty,
  difficultyLabel,
  practiceCompanyName,
  savePracticeHistory,
} from '@/lib/practice';
import type { Turn } from '@/components/cockpit/AiProspectCall';
import { ElevenLabsAttribution } from '@/components/voice/ElevenLabsAttribution';

/**
 * Practice mode pieces for the Dialer: the banner that marks the screen as training, and the
 * end-of-call summary (transcript, objection, script steps reached, outcome, AI score).
 */

export interface PracticeOutcomeOption {
  label: string;
  value: string;
}

export interface PracticeSummaryData {
  id: string;
  turns: Turn[];
  objectionLabel: string | null;
  stepsReached: number[];
  durationSec: number;
  outcome: string | null;
}

export function PracticeBanner({
  persona,
  objectionLabel,
  difficulty,
  embedded = false,
}: {
  /** Inside the Practice page tab: the setup bar is right above, so no "End practice" link. */
  embedded?: boolean;
  persona: SparringPersona;
  objectionLabel: string | null;
  difficulty: PracticeDifficulty;
}) {
  return (
    <section
      aria-label="Practice session"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-400 bg-warning-bg px-4 py-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-warning-400 px-2 text-caption font-semibold tracking-wide text-ink-950">
          <GraduationCap className="size-3.5" aria-hidden />
          PRACTICE
        </span>
        <span className="text-small text-warning-fg">
          <span className="font-medium">{persona.name}</span>, {persona.title} at {practiceCompanyName(persona)}
        </span>
        <span className="text-small text-warning-fg">
          Objection: <span className="font-medium">{objectionLabel || 'None (script only)'}</span>
        </span>
        <span className="text-small text-warning-fg">
          Difficulty: <span className="font-medium">{difficultyLabel(difficulty)}</span>
        </span>
        <ElevenLabsAttribution label="Customer voice:" inheritColor className="text-small text-warning-fg" />
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-small text-warning-fg xl:inline">Nothing is saved to contacts, activity or CRM.</span>
        {!embedded && (
          <Link href="/practice?tab=dialer" className={buttonClasses('secondary', 'sm')}>
            <X aria-hidden />
            End practice
          </Link>
        )}
      </div>
    </section>
  );
}

type ScoreState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; evaluation: QaEvaluationResult; sessionId: string }
  | { status: 'error' };

function formatDuration(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function PracticeSummaryDialog({
  open,
  onClose,
  summary,
  persona,
  difficulty,
  scriptSteps,
  outcomes,
  onOutcomeChange,
  onTryAgain,
  embedded = false,
}: {
  embedded?: boolean;
  open: boolean;
  onClose: () => void;
  summary: PracticeSummaryData;
  persona: SparringPersona;
  difficulty: PracticeDifficulty;
  scriptSteps: { step: number; name: string }[];
  outcomes: PracticeOutcomeOption[];
  onOutcomeChange: (value: string) => void;
  onTryAgain: () => void;
}) {
  const repTurns = summary.turns.filter((t) => t.role === 'rep').length;
  const scorable = repTurns > 0;
  const [score, setScore] = React.useState<ScoreState>(() => (scorable ? { status: 'loading' } : { status: 'idle' }));

  // Score once per practice call with the same QA engine as the Sparring scorecard.
  React.useEffect(() => {
    if (!scorable) return;
    let cancelled = false;
    const scenario = [
      `Practice call in the Dialer with ${persona.name} (${persona.title}, ${practiceCompanyName(persona)}).`,
      `Objection drilled: ${summary.objectionLabel || 'none'}.`,
      `Difficulty: ${difficultyLabel(difficulty)}.`,
      'The rep follows their own call script: Opener, Problem, Solution, Close.',
    ].join(' ');
    fetch('/api/webhooks/elevenlabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: summary.id,
        scenario,
        transcript: summary.turns.map((t) => ({ role: t.role, content: t.content })),
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        if (!data?.evaluation) throw new Error('no evaluation');
        const sessionId = String(data.sessionId || summary.id);
        try {
          sessionStorage.setItem(`eval-${sessionId}`, JSON.stringify(data.evaluation));
        } catch {}
        setScore({ status: 'done', evaluation: data.evaluation as QaEvaluationResult, sessionId });
      })
      .catch(() => {
        if (!cancelled) setScore({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // One score per practice call (summary.id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id]);

  // Keep this call in the practice history (this browser) so it shows on the Practice page.
  const evaluation = score.status === 'done' ? score.evaluation : undefined;
  const scorecardId = score.status === 'done' ? score.sessionId : undefined;
  React.useEffect(() => {
    savePracticeHistory({
      id: summary.id,
      at: new Date().toISOString(),
      personaId: persona.id,
      personaName: persona.name,
      objectionLabel: summary.objectionLabel || 'None',
      difficulty,
      outcome: summary.outcome,
      score: evaluation?.overallScore ?? null,
      grade: evaluation?.overallGrade ?? null,
      scorecardId,
      evaluation,
    });
  }, [summary.id, scorecardId, evaluation, summary.outcome, summary.objectionLabel, persona.id, persona.name, difficulty]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Practice call summary"
      description={
        <span>
          {persona.name} · {difficultyLabel(difficulty)} · {formatDuration(summary.durationSec)}
        </span>
      }
      size="lg"
      footer={
        <>
          {embedded ? (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <Link href="/practice?tab=dialer" className={buttonClasses('secondary', 'md')}>
              Back to Practice
            </Link>
          )}
          <Button variant="primary" onClick={onTryAgain} icon={<RotateCcw />}>
            Try again
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-app p-3">
            <dt className="text-caption text-fg-tertiary">Objection drilled</dt>
            <dd className="mt-0.5 text-body-strong text-fg">{summary.objectionLabel || 'None (script only)'}</dd>
          </div>
          <div className="rounded-md border border-line bg-app p-3">
            <dt className="text-caption text-fg-tertiary">Script steps reached</dt>
            <dd className="mt-1.5">
              <ol className="flex flex-wrap gap-1.5" aria-label="Script steps">
                {scriptSteps.map((s) => {
                  const reached = summary.stepsReached.includes(s.step);
                  return (
                    <li key={s.step}>
                      <Badge tone={reached ? 'success' : 'neutral'}>
                        {reached ? <Check className="size-3" aria-hidden /> : null}
                        <span className={reached ? '' : 'text-fg-tertiary'}>{s.name}</span>
                        <span className="sr-only">{reached ? '(reached)' : '(not reached)'}</span>
                      </Badge>
                    </li>
                  );
                })}
              </ol>
            </dd>
          </div>
        </dl>

        <fieldset>
          <legend className="text-caption text-fg-tertiary">Outcome</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {outcomes.map((o) => {
              const selected = summary.outcome === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onOutcomeChange(o.value)}
                  className={`focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${
                    selected ? 'border-transparent bg-action text-action-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                  }`}
                >
                  {selected && <Check className="size-3.5" aria-hidden />}
                  {o.label}
                </button>
              );
            })}
          </div>
          {!summary.outcome && <p className="mt-1.5 text-small text-fg-tertiary">How did the call end? Pick one (practice only, nothing is logged).</p>}
        </fieldset>

        <section aria-label="Score" className="rounded-md border border-line p-3">
          {score.status === 'idle' && (
            <p className="text-small text-fg-secondary">No score: you didn&rsquo;t say anything on this call. Try again and talk to the buyer.</p>
          )}
          {score.status === 'loading' && (
            <p className="text-small text-fg-secondary" aria-live="polite">
              Scoring your call…
            </p>
          )}
          {score.status === 'error' && (
            <p className="text-small text-fg-secondary">Scoring isn&rsquo;t available right now. Your transcript is below.</p>
          )}
          {score.status === 'done' && (
            <div className="space-y-3" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-kpi tabular-nums text-fg">{score.evaluation.overallScore}</span>
                  <span className="text-small text-fg-secondary">/ 100</span>
                  <Badge tone={score.evaluation.overallScore >= 80 ? 'success' : score.evaluation.overallScore >= 60 ? 'warning' : 'danger'}>
                    Grade {score.evaluation.overallGrade}
                  </Badge>
                </div>
                <Link href={`/practice/scorecard/${encodeURIComponent(score.sessionId)}`} className={buttonClasses('ghost', 'sm')}>
                  Full scorecard
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-caption text-fg-tertiary">Objection handling</p>
                  <Meter value={score.evaluation.armExecutionScore / 100} label="Objection handling" />
                </div>
                <div>
                  <p className="mb-1 text-caption text-fg-tertiary">Script adherence</p>
                  <Meter value={score.evaluation.scriptAdherenceScore / 100} label="Script adherence" />
                </div>
              </div>
              {(score.evaluation.strengths?.length > 0 || score.evaluation.weaknesses?.length > 0) && (
                <div className="grid grid-cols-1 gap-3 text-small sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-caption text-fg-tertiary">What went well</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-fg-secondary">
                      {score.evaluation.strengths.slice(0, 2).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-caption text-fg-tertiary">Work on</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-fg-secondary">
                      {score.evaluation.weaknesses.slice(0, 2).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section aria-label="Transcript">
          <h3 className="mb-1.5 text-caption text-fg-tertiary">Transcript</h3>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-line bg-app p-3 text-small" tabIndex={0}>
            {summary.turns.length === 0 ? (
              <p className="text-fg-tertiary">Nothing was said on this call.</p>
            ) : (
              summary.turns.map((t, i) => (
                <p key={i} className={t.role === 'rep' ? 'text-fg' : 'text-fg-secondary'}>
                  <span className="font-medium">{t.role === 'rep' ? 'You' : persona.name.split(' ')[0]}:</span> {t.content}
                </p>
              ))
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
