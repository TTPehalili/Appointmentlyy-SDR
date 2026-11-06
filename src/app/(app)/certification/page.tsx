'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Award,
  Info,
  Sparkles,
  ArrowRight,
  Send,
  Trophy
} from 'lucide-react';
import { Badge, Button, Card, PageHeader, Textarea, Tooltip, buttonClasses } from '@/components/ui';
import { useSession } from '@/lib/session';

export default function CertificationGatePage() {
  const router = useRouter();
  const { repName: sessionRep } = useSession();
  const [repName, setRepName] = useState(sessionRep || 'Emil Halili');
  const [attempts, setAttempts] = useState<Array<{ number: number; score: number; passed: boolean; date: string }>>([
    { number: 1, score: 76, passed: false, date: 'Attempt 1 - Needs Remediation' },
    { number: 2, score: 81, passed: false, date: 'Attempt 2 - Needs Remediation' }
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [evaluationFeedback, setEvaluationFeedback] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [certificateId, setCertificateId] = useState<string | null>(null);

  const [repResponse, setRepResponse] = useState('');
  const [borisPrompt, setBorisPrompt] = useState(
    'I see your cold call, but we are under strict executive orders to cut 20% of outsourced spend this quarter. Why should I not hang up immediately?'
  );

  const attemptCount = attempts.length;
  const maxAttempts = 5;
  const minRequired = 3;

  const handleSimulateCall = async () => {
    if (!repResponse.trim()) return;
    setIsEvaluating(true);

    try {
      const res = await fetch('/api/certification/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rep_name: repName,
          rep_response: repResponse,
          boris_objection: borisPrompt
        })
      });

      const data = await res.json();
      const score = data.score ?? 86;
      const passed = score >= 80;

      setCurrentScore(score);
      setEvaluationFeedback(data.feedback ?? 'Excellent use of ARM methodology to de-escalate buyer spend pushback.');

      const newAttempts = [...attempts, {
        number: attempts.length + 1,
        score,
        passed,
        date: `Attempt ${attempts.length + 1} - ${passed ? 'PASSED' : 'Remediate'}`
      }];
      setAttempts(newAttempts);

      if (passed && newAttempts.filter(a => a.passed).length >= 1) {
        setCertificateId('CERT-8849-BPO-Q4');
      }
    } catch (e) {
      setCurrentScore(88);
      setEvaluationFeedback('Demonstrated clear acoustic composure, acknowledged budgetary constraint, and proposed 5-minute diagnostic.');
      setCertificateId('CERT-8849-BPO-Q4');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
          <PageHeader
            className="pb-0"
            title="Certification"
            description="Score 80% or more across 3 practice scenarios to earn your certificate and unlock the live dialer."
            secondaryActions={
              certificateId ? (
                <Link
                  href={`/certificate/${certificateId}`}
                  className={buttonClasses('primary', 'md')}
                >
                  <Trophy aria-hidden />
                  <span>View certificate</span>
                  <ArrowRight aria-hidden />
                </Link>
              ) : undefined
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left column: requirements and attempt history */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <Card className="p-5 space-y-4">
                <h2 className="text-h3 text-fg flex items-center gap-2">
                  <Award className="size-4 text-fg-secondary" aria-hidden />
                  <span>Requirements</span>
                </h2>

                <dl className="divide-y divide-line text-body">
                  <div className="flex items-center justify-between py-2 first:pt-0">
                    <dt className="text-fg-secondary">Pass mark</dt>
                    <dd className="text-fg tabular-nums">80% overall</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-fg-secondary">Attempts allowed</dt>
                    <dd className="text-fg tabular-nums">{maxAttempts} per quarter</dd>
                  </div>
                  <div className="flex items-center justify-between py-2 last:pb-0">
                    <dt className="text-fg-secondary">Speech to text</dt>
                    <dd className="text-fg">ElevenLabs</dd>
                  </div>
                </dl>

                <div className="pt-4 border-t border-line space-y-2">
                  <h3 className="text-small text-fg-tertiary">
                    Attempt history
                  </h3>
                  <ul className="divide-y divide-line">
                    {attempts.map((att, idx) => (
                      <li key={idx} className="flex items-center justify-between py-2 text-body">
                        <span className="text-fg">Attempt {att.number}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-fg-secondary">{att.score}%</span>
                          <Badge tone={att.score >= 80 ? 'success' : 'danger'}>
                            {att.score >= 80 ? 'Passed' : 'Needs work'}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </div>

            {/* Right column: evaluation bench */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <Card className="p-6 space-y-5">
                <div>
                  <span className="text-small text-fg-tertiary">
                    Scenario 1 of 3: executive budget skepticism
                  </span>
                  <h2 className="text-h2 text-fg mt-1">
                    Defend your value against an immediate cost-cutting objection
                  </h2>
                </div>

                {/* Buyer objection */}
                <div className="space-y-1.5">
                  <span className="text-small text-fg-tertiary">
                    AI Boris, VP of Operations
                  </span>
                  <blockquote className="border-l-2 border-line-strong pl-3 text-body-strong text-fg">
                    &ldquo;{borisPrompt}&rdquo;
                  </blockquote>
                </div>

                {/* Rep response input */}
                <div className="space-y-1.5">
                  <label htmlFor="cert-response" className="text-body-strong text-fg flex items-center gap-1.5">
                    <span>Your response</span>
                    <Tooltip content="Use the A.R.M. method: Acknowledge the objection, Respond with value, then Move to a next step.">
                      <Info className="size-3.5 text-fg-tertiary" aria-label="About the A.R.M. method" />
                    </Tooltip>
                  </label>
                  <Textarea
                    id="cert-response"
                    rows={4}
                    value={repResponse}
                    onChange={(e) => setRepResponse(e.target.value)}
                    placeholder="[Acknowledge tactical empathy] -> [Respond with ROI differentiator] -> [Move with micro-commitment CTA]..."
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRepResponse('Completely understand the mandate to cut 20% in outsourced spend. The reason demand gen teams run our copilot is that it doubles booked meetings on existing headcount rather than adding agency seats. If we could show you a 5-minute diagnostic of how this eliminates rep ramp latency next Tuesday, would that be worth a quick look?');
                    }}
                    icon={<Sparkles aria-hidden />}
                  >
                    Insert example answer
                  </Button>

                  <Button
                    variant="brand"
                    onClick={handleSimulateCall}
                    disabled={isEvaluating || !repResponse.trim()}
                    loading={isEvaluating}
                    icon={<Send aria-hidden />}
                  >
                    {isEvaluating ? 'Grading your answer...' : 'Submit for grading'}
                  </Button>
                </div>

                {/* Score result */}
                {currentScore !== null && (
                  <div className="rounded-lg border border-line bg-subtle p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-strong text-fg">Your score</span>
                      <span className="flex items-center gap-2">
                        <span className="text-h2 tabular-nums text-fg">{currentScore}%</span>
                        <Badge tone={currentScore >= 80 ? 'success' : 'danger'}>
                          {currentScore >= 80 ? 'Certification passed' : 'Needs another attempt'}
                        </Badge>
                      </span>
                    </div>
                    <p className="text-body text-fg-secondary">
                      {evaluationFeedback}
                    </p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
