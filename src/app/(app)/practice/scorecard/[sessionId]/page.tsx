'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Sparkles,
  Info
} from 'lucide-react';
import { Badge, Card, Meter, PageHeader, Tooltip, buttonClasses } from '@/components/ui';
import { QaEvaluationResult } from '@/lib/qaEvaluator';

function ScorecardContent() {
  const params = useParams();
  const sessionId = (params?.sessionId as string) || 'session-fallback';

  const [evaluation, setEvaluation] = useState<QaEvaluationResult>({
    sessionId,
    overallScore: 89,
    overallGrade: 'A',
    armExecutionScore: 92,
    scriptAdherenceScore: 86,
    talkToListenRatio: {
      repPercent: 46,
      prospectPercent: 54,
      isOptimal: true
    },
    strengths: [
      'Executed instantaneous tactical empathy acknowledgment without conversational hesitation',
      'Reframed the vendor objection as an overflow partner instead of attacking the incumbent',
      'Closed with a crisp, low-friction 10-minute diagnostic question'
    ],
    weaknesses: [
      'Slight wordiness on the second turn value reframe (exceeded 18 seconds)',
      'Ensure prospect confirms current SLA cost bottleneck before proposing exact meeting slot'
    ],
    coachingActionItems: [
      'Re-drill the 3-second Rule: Pause after prospect objection to let tension dissipate',
      'Use the Diagnostic Micro-Commitment on all future cold calls'
    ],
    annotatedTranscript: [
      {
        role: 'prospect',
        content: 'We already have an agency partner handling this and we are completely satisfied.',
        timestamp: '00:03'
      },
      {
        role: 'rep',
        content: 'I completely understand—you have an established rhythm with them and they know your brand.',
        timestamp: '00:07',
        armTag: 'A',
        coachingFeedback: 'Excellent tactical empathy: disarms prospect defensive wall immediately.'
      },
      {
        role: 'rep',
        content: 'Most teams we work with kept their incumbent for tier-1 routine tasks while leveraging Boris to fix high-value conversion drop-offs.',
        timestamp: '00:15',
        armTag: 'R',
        coachingFeedback: 'Differentiator reframe: avoids direct competition with incumbent.'
      },
      {
        role: 'rep',
        content: 'If we could prove an immediate 20% bump in qualified booked meetings on a 5-minute review next Tuesday, would you be totally opposed to taking a look?',
        timestamp: '00:24',
        armTag: 'M',
        coachingFeedback: 'Clean diagnostic micro-commitment close.'
      }
    ]
  });

  useEffect(() => {
    const saved = sessionStorage.getItem(`eval-${sessionId}`);
    if (saved) {
      try {
        setEvaluation(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved evaluation', e);
      }
    }
  }, [sessionId]);

  const passed = evaluation.overallScore >= 80;

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
          <div className="space-y-3">
            <Link
              href="/practice"
              className="focus-ring inline-flex items-center gap-1.5 rounded-sm text-small text-fg-secondary hover:text-fg transition-colors duration-150"
            >
              <ArrowLeft className="size-4" aria-hidden />
              <span>Sparring Arena</span>
            </Link>
            <PageHeader
              className="pb-0"
              title="Call scorecard"
              description="How you handled the call, scored on the transcript, with feedback on each turn."
              meta={<span className="font-mono text-small text-fg-tertiary">{sessionId}</span>}
              primaryAction={
                <Link href="/practice" className={buttonClasses('brand', 'md')}>
                  <RotateCcw aria-hidden />
                  <span>Practice again</span>
                </Link>
              }
            />
          </div>

          {/* Score summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-small text-fg-secondary">Overall score</span>
                <Badge tone={passed ? 'success' : 'danger'}>
                  {passed ? 'Pass' : 'Needs work'}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-kpi tabular-nums text-fg">{evaluation.overallScore}</span>
                <span className="text-body tabular-nums text-fg-tertiary">/ 100</span>
              </div>
              <span className="text-small text-fg-tertiary">Grade {evaluation.overallGrade}</span>
            </Card>
            <Card className="flex flex-col gap-2 p-4">
              <span className="text-small text-fg-secondary flex items-center gap-1.5">
                <span>Objection handling</span>
                <Tooltip content="A.R.M. execution: how well you acknowledged, responded and moved to a next step.">
                  <Info className="size-3.5 text-fg-tertiary" aria-label="About objection handling" />
                </Tooltip>
              </span>
              <span className="text-kpi tabular-nums text-fg">{evaluation.armExecutionScore}%</span>
              <Meter value={evaluation.armExecutionScore / 100} label="Objection handling" />
            </Card>
            <Card className="flex flex-col gap-2 p-4">
              <span className="text-small text-fg-secondary">Script adherence</span>
              <span className="text-kpi tabular-nums text-fg">{evaluation.scriptAdherenceScore}%</span>
              <Meter value={evaluation.scriptAdherenceScore / 100} label="Script adherence" />
            </Card>
          </div>

          {/* Strengths and weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5 space-y-3">
              <h2 className="text-h3 text-fg flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success-fg" aria-hidden />
                <span>What went well</span>
              </h2>
              <ul className="space-y-2 text-body text-fg">
                {evaluation.strengths.map((str, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-success-500" aria-hidden />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="text-h3 text-fg flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning-fg" aria-hidden />
                <span>What to work on</span>
              </h2>
              <ul className="space-y-2 text-body text-fg">
                {evaluation.weaknesses.map((wk, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning-400" aria-hidden />
                    <span>{wk}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Annotated transcript */}
          <Card className="p-5 space-y-4">
            <h2 className="text-h3 text-fg">
              Transcript with feedback
            </h2>

            <div className="divide-y divide-line">
              {evaluation.annotatedTranscript.map((t, idx) => (
                <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption text-fg-tertiary">
                      {t.role === 'rep' ? 'You' : 'Buyer'}
                    </span>
                    <span className="text-caption tabular-nums text-fg-tertiary">{t.timestamp}</span>
                  </div>
                  <p className={t.role === 'rep' ? 'text-body-strong text-fg' : 'text-body text-fg-secondary'}>{t.content}</p>
                  {t.coachingFeedback && (
                    <div className="text-small text-fg-secondary flex items-start gap-2">
                      <Sparkles className="size-3.5 shrink-0 text-fg-tertiary mt-0.5" aria-hidden />
                      <span className="underline decoration-ai decoration-2 underline-offset-4">{t.coachingFeedback}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-small text-fg-secondary">Loading scorecard...</div>}>
      <ScorecardContent />
    </Suspense>
  );
}
