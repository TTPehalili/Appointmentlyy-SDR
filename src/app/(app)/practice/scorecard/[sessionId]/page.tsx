'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Trophy, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  ArrowRight, 
  Clock, 
  Sparkles,
  BarChart3,
  TrendingUp,
  Percent
} from 'lucide-react';
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
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-[#F2F0EF] font-sans antialiased text-[#222021]">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Subheader */}
        <div className="border-b border-[#222021]/10 bg-white px-8 py-2.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/practice"
              className="p-1.5 rounded-lg bg-[#F2F0EF] hover:bg-[#e7e4e2] text-[#222021] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[#222021]">Call Scorecard</span>
              <span className="text-[#6b6968]">•</span>
              <span className="text-[#6b6968] font-mono text-[11px]">{sessionId}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/practice"
              className="px-3.5 py-1.5 rounded-lg bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Spar Again</span>
            </Link>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Banner */}
          <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className={`h-20 w-20 rounded-2xl flex flex-col items-center justify-center font-black shadow-2xs ${
                passed ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-400' : 'bg-red-50 text-[#ED1C24] border-2 border-red-400'
              }`}>
                <span className="text-3xl leading-none">{evaluation.overallScore}</span>
                <span className="text-[10px] uppercase font-mono tracking-wider mt-0.5">SCORE</span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                    passed ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-[#ED1C24] border-red-200'
                  }`}>
                    GRADE {evaluation.overallGrade} • {passed ? 'CERTIFICATION PASS' : 'REMEDIATION NEEDED'}
                  </span>
                </div>
                <h1 className="text-xl font-black text-[#222021] mt-1">
                  Automated Voice QA Evaluation
                </h1>
                <p className="text-xs text-[#6b6968] mt-0.5">
                  Evaluated with sub-second acoustic inference and transcript rubric parsing.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full md:w-auto text-xs">
              <div className="p-3 rounded-xl bg-[#F2F0EF] border border-[#222021]/10">
                <span className="text-[10px] font-mono uppercase text-[#6b6968] block">ARM Execution</span>
                <span className="font-extrabold text-[#222021] text-base">{evaluation.armExecutionScore}%</span>
              </div>
              <div className="p-3 rounded-xl bg-[#F2F0EF] border border-[#222021]/10">
                <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Script Adherence</span>
                <span className="font-extrabold text-[#222021] text-base">{evaluation.scriptAdherenceScore}%</span>
              </div>
            </div>
          </div>

          {/* Strengths & Weaknesses Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Observed Strengths</span>
              </h3>
              <ul className="space-y-2 text-xs text-[#222021]">
                {evaluation.strengths.map((str, idx) => (
                  <li key={idx} className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-2 leading-relaxed">
                    <span className="text-emerald-600 font-bold">•</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#ED1C24] flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#ED1C24]" />
                <span>Coaching & Remediation</span>
              </h3>
              <ul className="space-y-2 text-xs text-[#222021]">
                {evaluation.weaknesses.map((wk, idx) => (
                  <li key={idx} className="p-2.5 rounded-xl bg-red-50/50 border border-red-100 flex items-start gap-2 leading-relaxed">
                    <span className="text-[#ED1C24] font-bold">•</span>
                    <span>{wk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Annotated Transcript */}
          <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs space-y-4">
            <h3 className="text-sm font-extrabold text-[#222021]">
              Annotated Call Transcript & Turn-by-Turn Feedback
            </h3>

            <div className="space-y-3">
              {evaluation.annotatedTranscript.map((t, idx) => (
                <div key={idx} className={`p-4 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
                  t.role === 'rep' ? 'bg-[#ED1C24]/5 border-[#ED1C24]/15' : 'bg-[#F2F0EF] border-[#222021]/10'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-bold uppercase text-[10px] ${
                      t.role === 'rep' ? 'text-[#ED1C24]' : 'text-[#6b6968]'
                    }`}>
                      {t.role === 'rep' ? 'Sales Rep (You)' : 'Buyer'}
                    </span>
                    <span className="text-[10px] font-mono text-[#6b6968]">{t.timestamp}</span>
                  </div>
                  <p className="text-[#222021] font-medium">{t.content}</p>
                  {t.coachingFeedback && (
                    <div className="pt-1.5 border-t border-[#222021]/10 text-[11px] text-[#6b6968] flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-[#ED1C24]" />
                      <span>{t.coachingFeedback}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-[#6b6968]">Loading Scorecard...</div>}>
      <ScorecardContent />
    </Suspense>
  );
}
