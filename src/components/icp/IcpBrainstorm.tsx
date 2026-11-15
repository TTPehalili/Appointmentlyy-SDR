'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, RotateCcw, AlertTriangle, Users, Wand2, Target, Building2, MapPin, Zap, MessageSquareQuote } from 'lucide-react';
import { Button } from '@/components/ui';
import type { AiParsedFilters, BuyingCommitteeRole } from '@/lib/leadData/types';
import { FUNDING_STAGE_OPTIONS } from '@/lib/leadData/types';

/**
 * "Brainstorm with AI" for Lead Finder step 1: a rough goal, up to 5 short questions (one at a
 * time, quick-reply chips plus free text), then a proposed ICP with the exact filters it will
 * apply. "Build this list" hands the filters to Lead Finder (which runs the free count); nothing is
 * ever pulled from here. Motion uses the design system's slide-up / pulse-soft (off under
 * prefers-reduced-motion).
 */

type Topic = 'industry' | 'service' | 'committee' | 'size' | 'region' | 'other';

interface QuestionStep {
  type: 'question';
  topic: Topic;
  text: string;
  chips: string[];
  multiSelect: boolean;
  committeeOptions: BuyingCommitteeRole[];
}

export interface BrainstormProposal {
  type: 'proposal';
  summary: string;
  why: string;
  signals: string;
  talkTrack: string;
  committee: BuyingCommitteeRole[];
  filters: AiParsedFilters;
  unmapped: string[];
}

interface Turn {
  topic: Topic;
  question: string;
  answer: string;
  committee?: BuyingCommitteeRole[];
}

const EXAMPLE_GOALS = [
  'Clients for our offshore customer support teams',
  'Virtual assistant services for real-estate brokerages',
  'Executive search for fintech scale-ups',
];

const chipClass = (on: boolean) =>
  `focus-ring inline-flex items-center gap-1 min-h-8 px-3 py-1 rounded-full text-small font-medium border text-left transition-colors duration-150 cursor-pointer disabled:opacity-60 ${
    on ? 'bg-selected text-selected-fg border-selected' : 'bg-ink-900 text-ink-50 border-ink-700 hover:border-ink-400'
  }`;

function fundingLabel(keys: string[]) {
  return keys.map((k) => FUNDING_STAGE_OPTIONS.find((o) => o.key === k)?.label || k).join(', ');
}

/** The buying signals the filters really apply, in plain words. */
function signalLines(f: AiParsedFilters): string[] {
  return [
    f.isHiring && 'Hiring now (LinkedIn Hiring badge)',
    f.newInRoleMonths > 0 && `New in role (last ${f.newInRoleMonths} months)`,
    f.fundingStages.length > 0 && `Funding: ${fundingLabel(f.fundingStages)}`,
    f.revenue.length > 0 && `Revenue: ${f.revenue.join(', ')}`,
    f.companyKeywords && `Company description mentions "${f.companyKeywords}"`,
    f.personKeywords && `LinkedIn bio mentions "${f.personKeywords}"`,
    f.requireDirectDial && 'Direct dial only',
  ].filter((x): x is string => Boolean(x));
}

/** "Thinking" with three softly pulsing dots (static under reduced motion). */
function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-small text-ink-400 motion-safe:animate-fade-in" data-testid="bs-thinking" role="status">
      <Sparkles className="size-4 text-ink-400" aria-hidden />
      <span>{label}</span>
      <span className="inline-flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-ink-400 motion-safe:animate-pulse-soft" style={{ animationDelay: `${i * 180}ms` }} />
        ))}
      </span>
    </div>
  );
}

const ROLE_HINT: Record<string, string> = {
  'Decision maker': 'Signs off',
  Champion: 'Pushes it internally',
  Influencer: 'Shapes the decision',
};

export default function IcpBrainstorm({
  onBuild,
  onFallback,
}: {
  onBuild: (proposal: BrainstormProposal) => void;
  onFallback: (message: string) => void;
}) {
  const [goal, setGoal] = useState('');
  const [started, setStarted] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState<QuestionStep | null>(null);
  const [proposal, setProposal] = useState<BrainstormProposal | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [freeText, setFreeText] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const freeRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [question, proposal, turns.length, loading]);

  const call = async (nextTurns: Turn[], finish: boolean, goalText = goal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/icp/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goalText.trim(), turns: nextTurns, finish }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.fallback) {
        onFallback(typeof data.error === 'string' ? data.error : 'The AI brainstorm is unavailable right now.');
        return;
      }
      if (!res.ok || !data?.success || !data.step) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'The AI could not answer. Try again.');
      }
      setTurns(nextTurns);
      setPicked([]);
      setFreeText('');
      setAdjusting(false);
      if (data.step.type === 'proposal') {
        setQuestion(null);
        setProposal(data.step as BrainstormProposal);
      } else {
        setProposal(null);
        setQuestion(data.step as QuestionStep);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The AI could not answer. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const start = (text = goal) => {
    if (text.trim().length < 5 || loading) return;
    setGoal(text);
    setStarted(true);
    void call([], false, text);
  };

  const answer = (overridePick?: number[]) => {
    if (!question || loading) return;
    const pick = overridePick ?? picked;
    const chosen = pick.map((i) => question.chips[i]).filter((c) => c && !/^other$/i.test(c));
    const text = [...chosen, freeText.trim()].filter(Boolean).join(', ');
    if (!text) return;
    const committee =
      question.topic === 'committee' && question.committeeOptions.length
        ? pick.map((i) => question.committeeOptions[i]).filter(Boolean)
        : undefined;
    void call([...turns, { topic: question.topic, question: question.text, answer: text, ...(committee?.length ? { committee } : {}) }], false);
  };

  const skip = () => {
    if (loading) return;
    const t = question ? [...turns, { topic: question.topic, question: question.text, answer: '' }] : turns;
    void call(t, true);
  };

  const adjust = () => {
    if (!freeText.trim() || loading) return;
    void call([...turns, { topic: 'other', question: 'What should change?', answer: freeText.trim() }], true);
  };

  const reset = () => {
    setStarted(false);
    setTurns([]);
    setQuestion(null);
    setProposal(null);
    setPicked([]);
    setFreeText('');
    setError(null);
    setAdjusting(false);
  };

  const toggle = (i: number) => {
    if (!question) return;
    const chip = question.chips[i];
    if (/^other$/i.test(chip)) {
      freeRef.current?.focus();
      return;
    }
    if (!question.multiSelect) {
      // One answer: send it at once (fast in a live demo).
      setPicked([i]);
      answer([i]);
      return;
    }
    setPicked((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  };

  const f = proposal?.filters;
  const signals = f ? signalLines(f) : [];
  const tiles: { key: string; label: string; value: string; icon: React.ReactNode }[] = f
    ? [
        { key: 'industry', label: 'Industry', value: f.industry || 'Any industry', icon: <Building2 /> },
        { key: 'signals', label: 'Signals', value: signals.join(' · ') || 'None, a broad search', icon: <Zap /> },
        { key: 'company-size', label: 'Company size', value: f.headcountRange || 'Any size', icon: <Target /> },
        { key: 'region', label: 'Region', value: [f.city, f.state, f.country].filter(Boolean).join(' · ') || 'Default markets', icon: <MapPin /> },
      ]
    : [];
  const questionNo = turns.filter((t) => t.topic !== 'other').length + 1;

  return (
    <div className="space-y-3" data-testid="bs-root">
      {!started && (
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              aria-label="Your rough goal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') start();
              }}
              maxLength={600}
              placeholder='What do you sell, and to whom? e.g. "Clients for our offshore customer support teams"'
              className="focus-ring flex-1 h-11 px-3.5 rounded-md bg-ink-900 border border-ink-700 text-body text-ink-50 placeholder:text-ink-400"
              data-testid="bs-goal"
            />
            <Button variant="brand" size="lg" icon={<Wand2 />} onClick={() => start()} disabled={loading || goal.trim().length < 5} data-testid="bs-start">
              Start brainstorm
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-ink-400">Try:</span>
            {EXAMPLE_GOALS.map((g) => (
              <button key={g} type="button" onClick={() => start(g)} className={chipClass(false)}>
                {g}
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-400">
            A few quick questions about your best niche, winning service and buying committee, then a ready-to-run list. Only filters Lead Finder can really use.
          </p>
        </div>
      )}

      {started && (
        <div className="rounded-md border border-ink-700 bg-ink-900/60 p-3 sm:p-4 space-y-3" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <div className="text-small text-ink-400 truncate">
              Goal: <span className="text-ink-50">{goal}</span>
            </div>
            <button
              type="button"
              onClick={reset}
              className="focus-ring inline-flex items-center gap-1 rounded-sm text-caption text-ink-400 hover:text-ink-50 cursor-pointer shrink-0"
            >
              <RotateCcw className="size-3.5" /> Start over
            </button>
          </div>

          {turns.map((t, i) => (
            <div key={i} className="space-y-1.5 motion-safe:animate-slide-up">
              <div className="flex gap-2 items-start">
                <Sparkles className="size-4 text-ink-400 mt-0.5 shrink-0" aria-hidden />
                <div className="text-small text-ink-400">{t.question}</div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-md bg-ink-800 border border-ink-700 px-3 py-1.5 text-small text-ink-50">
                  {t.answer || <span className="text-ink-400">Skipped</span>}
                </div>
              </div>
            </div>
          ))}

          {question && !loading && (
            <div className="space-y-2 motion-safe:animate-slide-up" data-testid="bs-question" data-topic={question.topic}>
              <div className="flex gap-2 items-start">
                <Sparkles className="size-4 text-ink-50 mt-1 shrink-0" aria-hidden />
                <div className="text-body text-ink-50 font-medium">{question.text}</div>
              </div>
              <div className="pl-6 text-caption text-ink-400">
                Question {Math.min(questionNo, 5)} of up to 5
                {question.multiSelect ? ' · Pick all that apply, add your own, then send.' : ' · Tap one, or type your own.'}
              </div>
              <div className="flex flex-wrap gap-1.5 pl-6">
                {question.chips.map((chip, i) => (
                  <button
                    key={`${i}-${chip}`}
                    type="button"
                    aria-pressed={picked.includes(i)}
                    onClick={() => toggle(i)}
                    disabled={loading}
                    className={chipClass(picked.includes(i))}
                    data-testid="bs-chip"
                  >
                    {question.topic === 'committee' && question.committeeOptions[i] ? (
                      <span>
                        <span className="font-semibold">{question.committeeOptions[i].role}:</span>{' '}
                        {question.committeeOptions[i].titles.join(', ')}
                      </span>
                    ) : (
                      chip
                    )}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pl-6">
                <input
                  ref={freeRef}
                  aria-label="Your answer"
                  type="text"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') answer();
                  }}
                  maxLength={300}
                  placeholder="Or type your own answer"
                  className="focus-ring flex-1 h-9 px-3 rounded-sm bg-ink-950 border border-ink-700 text-small text-ink-50 placeholder:text-ink-400"
                  data-testid="bs-free"
                />
                <div className="flex gap-2">
                  <Button
                    variant="brand"
                    size="sm"
                    icon={<Send />}
                    onClick={() => answer()}
                    disabled={loading || (!picked.length && !freeText.trim())}
                    data-testid="bs-send"
                  >
                    Send
                  </Button>
                  <Button variant="secondary" size="sm" onClick={skip} disabled={loading} data-testid="bs-skip">
                    Skip, build it now
                  </Button>
                </div>
              </div>
            </div>
          )}

          {loading && <Thinking label={!turns.length && !question ? 'Reading your goal' : proposal || adjusting ? 'Updating the proposal' : 'Thinking'} />}

          {proposal && f && !loading && (
            <div className="rounded-lg border border-ink-700 bg-ink-950 p-4 sm:p-5 space-y-4 motion-safe:animate-slide-up" data-testid="bs-proposal">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-caption uppercase tracking-wide text-ink-400">
                  <Sparkles className="size-3.5" aria-hidden /> Proposed ideal customer
                </div>
                <p className="text-h3 text-ink-50 leading-snug">{proposal.summary}</p>
                {proposal.why && (
                  <p className="border-l-2 border-brand-500 pl-3 text-small text-ink-50">
                    <span className="text-ink-400">Why this fits: </span>
                    {proposal.why}
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tiles.map((t) => (
                  <div key={t.key} className="rounded-md border border-ink-700 bg-ink-900/60 p-2.5">
                    <dt className="flex items-center gap-1.5 text-caption text-ink-400 [&_svg]:size-3.5">
                      {t.icon}
                      {t.label}
                    </dt>
                    <dd className="mt-0.5 text-small text-ink-50" data-testid={`bs-row-${t.key}`}>
                      {t.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {proposal.committee.length > 0 && (
                <div className="space-y-2" data-testid="bs-committee">
                  <div className="flex items-center gap-1.5 text-small text-ink-50 font-medium">
                    <Users className="size-4 text-ink-400" aria-hidden /> Buying committee
                    <span className="font-normal text-ink-400">
                      · up to {Math.min(3, Math.max(2, proposal.committee.length))} people per company
                    </span>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {proposal.committee.map((c) => (
                      <li key={c.role} className="rounded-md border border-ink-700 bg-ink-900/60 p-2.5 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-small font-semibold text-ink-50">{c.role}</span>
                          <span className="text-caption text-ink-400">{ROLE_HINT[c.role] || ''}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {c.titles.map((t) => (
                            <span key={t} className="px-1.5 py-0.5 rounded-sm bg-ink-800 text-caption text-ink-50">
                              {t}
                            </span>
                          ))}
                        </div>
                        {c.seniority.length > 0 && <div className="text-caption text-ink-400">{c.seniority.join(' · ')}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!proposal.committee.length && f.titles && (
                <div className="text-small text-ink-50">
                  <span className="text-ink-400">Titles: </span>
                  {f.titles}
                </div>
              )}

              {proposal.talkTrack && (
                <div className="flex items-start gap-1.5 text-small text-ink-400">
                  <MessageSquareQuote className="size-4 shrink-0 mt-0.5" aria-hidden />
                  <span>
                    <span className="text-ink-50">Talk track: </span>
                    {proposal.talkTrack}
                  </span>
                </div>
              )}
              {proposal.unmapped.length > 0 && (
                <div className="flex items-start gap-1.5 text-small text-ink-50" data-testid="bs-unmapped">
                  <AlertTriangle className="size-4 text-ink-400 shrink-0 mt-0.5" aria-hidden />
                  Not a filterable industry, so not used as a filter: {proposal.unmapped.join(', ')}. Pick a closer industry in the filters below if you need one.
                </div>
              )}

              {adjusting ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    ref={freeRef}
                    aria-label="What should change?"
                    type="text"
                    autoFocus
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') adjust();
                    }}
                    maxLength={300}
                    placeholder='e.g. "UK only" or "add CFOs as influencers"'
                    className="focus-ring flex-1 h-9 px-3 rounded-sm bg-ink-900 border border-ink-700 text-small text-ink-50 placeholder:text-ink-400"
                  />
                  <Button variant="brand" size="sm" icon={<Send />} onClick={adjust} disabled={loading || !freeText.trim()}>
                    Update proposal
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button variant="brand" size="md" icon={<Sparkles />} onClick={() => onBuild(proposal)} disabled={loading} data-testid="bs-build">
                    Build this list
                  </Button>
                  <Button variant="secondary" size="md" onClick={() => setAdjusting(true)} disabled={loading} data-testid="bs-adjust">
                    Adjust
                  </Button>
                  <span className="text-caption text-ink-400">Free count only. Nothing is pulled until you confirm.</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-small text-ink-50">
              <AlertTriangle className="size-4 text-ink-400 shrink-0" aria-hidden />
              {error}
              {!loading && (
                <button type="button" onClick={() => void call(turns, false)} className="focus-ring underline cursor-pointer">
                  Retry
                </button>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
