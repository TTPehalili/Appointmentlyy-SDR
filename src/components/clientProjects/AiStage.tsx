'use client';

/**
 * The "AI is working" view (design SPEC section 10). Driven only by the run's real progress, read by
 * the 1-query poll GET /ai/progress every 1.5 s while the run is going (paused when the tab is hidden).
 * When several stages arrive in one poll (the model call is a single shot) they are revealed in order,
 * at least 600 ms each: that paces real results, it never invents any. No percentages, no estimates: the
 * stopwatch counts up from the run's start.
 */
import * as React from 'react';
import { Button } from '@/components/ui';
import { useServerAuth } from '@/lib/authClient';
import { AiRobot } from '@/components/clientProjects/AiRobot';
import { AI_STAGE_LABEL, type AiProgress, type AiRun, type AiStage } from '@/lib/clientProjects/types';

type ProgressRun = Pick<AiRun, 'id' | 'status' | 'error' | 'progress' | 'createdAt' | 'updatedAt'>;
const RAIL: AiStage[] = ['reading', 'finding', 'mapping', 'drafting', 'writing'];
const ORDER: AiStage[] = ['queued', ...RAIL, 'ready'];

/**
 * The writing stage: the real drafted text appears sentence by sentence (240 ms each) with a brand caret,
 * all at once with reduced motion. It only paces text the server already returned.
 */
function Reveal({ text, reduced }: { text: string; reduced: boolean }) {
  const sentences = React.useMemo(() => text.match(/[^.!?]+[.!?]*\s*/g)?.filter((x) => x.trim()) ?? [], [text]);
  const [n, setN] = React.useState(reduced ? sentences.length : 0);
  React.useEffect(() => {
    if (reduced) return setN(sentences.length);
    setN(0);
    const t = window.setInterval(() => setN((k) => (k >= sentences.length ? (window.clearInterval(t), k) : k + 1)), 240);
    return () => window.clearInterval(t);
  }, [sentences, reduced]);
  if (!sentences.length) return null;
  return (
    <p className="text-small leading-5 text-fg-secondary" data-testid="ai-reveal" data-shown={n} data-total={sentences.length}>
      {sentences.slice(0, n).map((x, i) => (
        <span key={i} className="ai-sent">
          {x}
        </span>
      ))}
      {n < sentences.length && <span aria-hidden className="ai-caret-t" />}
    </p>
  );
}

function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

/** Poll the run's progress until it is ready or failed. */
export function useAiProgress(projectId: string, active: boolean, onDone: () => void) {
  const [run, setRun] = React.useState<ProgressRun | null>(null);
  const rev = React.useRef<string | null>(null);
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;
  React.useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      const res = await fetch(`/api/client-projects/${projectId}/ai/progress${rev.current ? `?since=${encodeURIComponent(rev.current)}` : ''}`, { cache: 'no-store' }).catch(() => null);
      const d = (await res?.json().catch(() => null)) as { success?: boolean; changed?: boolean; rev?: string; run?: ProgressRun } | null;
      if (!d?.success || !d.changed || !d.run) return;
      rev.current = d.rev ?? null;
      setRun(d.run);
      if (d.run.status !== 'running') {
        stop = true;
        doneRef.current();
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), 1500);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [projectId, active]);
  return run;
}

/** The stage shown: walks forward one stage at a time, at least 600 ms per stage (instant with reduced motion). */
function usePacedStage(target: AiStage, reduced: boolean): AiStage {
  const [shown, setShown] = React.useState<AiStage>(target);
  React.useEffect(() => {
    if (reduced || target === 'failed') return setShown(target);
    if (ORDER.indexOf(target) <= ORDER.indexOf(shown)) return;
    const t = window.setTimeout(() => setShown(ORDER[ORDER.indexOf(shown) + 1] ?? target), 600);
    return () => window.clearTimeout(t);
  }, [target, shown, reduced]);
  return shown;
}

function Stopwatch({ from, running }: { from: string; running: boolean }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const s = Math.max(0, Math.floor((now - Date.parse(from)) / 1000));
  return <span className="cp-mono text-small text-fg-tertiary" data-testid="ai-stopwatch">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>;
}

export function AiStage({ run, onReview, onDiscard, onRetry, onUseSop }: { run: ProgressRun; onReview: () => void; onDiscard: () => void; onRetry: () => void; onUseSop: () => void }) {
  const reduced = useReducedMotion();
  // The workspace's Lead Finder animation setting applies here too: "professional" keeps the calm sheet.
  const { identity } = useServerAuth();
  const playful = identity?.branding?.leadFinderAnimation !== 'professional';
  const p: AiProgress | null = run.progress;
  const target: AiStage = run.status === 'failed' ? 'failed' : run.status === 'draft' || run.status === 'approved' ? 'ready' : (p?.stage ?? 'queued');
  const stage = usePacedStage(target, reduced);
  const docs = p?.docs ?? [];
  const pagesTotal = docs.reduce((n, d) => n + d.pages, 0);
  const at = (s: AiStage) => ORDER.indexOf(s);
  const failedAt = target === 'failed' ? (p?.log.filter((l) => l.stage !== 'failed').pop()?.stage ?? 'reading') : null;
  const stepState = (s: AiStage) => (failedAt === s ? 'failed' : failedAt ? (at(s) < at(failedAt) ? 'done' : 'todo') : at(stage) > at(s) ? 'done' : stage === s ? 'active' : 'todo');
  const past = (s: AiStage) => (failedAt ? at(failedAt) >= at(s) : at(stage) >= at(s));
  const detail: Record<string, string> = {
    reading: `${p?.pagesRead ?? 0} of ${pagesTotal} pages · ${docs.length} document${docs.length === 1 ? '' : 's'}`,
    finding: past('mapping') ? `${p?.milestones.length ?? 0} milestones · ${p?.datesFound ?? 0} dates` : `Reading the contract terms${(p?.attempt ?? 0) > 1 ? ` (attempt ${p?.attempt})` : ''}`,
    mapping: `${p?.cardsPlanned ?? 0} cards · ${p?.phases.length ?? 0} phases`,
    drafting: `${past('writing') ? (p?.cards.length ?? 0) : 0} of ${p?.cardsPlanned ?? 0} cards`,
    writing: p?.summaryDone ? 'Summary · Briefing' : 'Summary for the client',
  };
  const live = stage === 'ready' ? 'Plan ready' : stage === 'failed' ? 'The planner stopped' : stage === 'finding' && past('mapping') ? `Found ${p?.milestones.length ?? 0} milestones` : stage === 'drafting' ? `Drafted ${p?.cards.length ?? 0} cards` : AI_STAGE_LABEL[stage];
  let pageNo = 0;
  return (
    <section className="ai-stage" data-theme="dark" data-stage={stage} aria-busy={stage !== 'ready' && stage !== 'failed'} data-testid="cp-ai-stage">
      <div className="ai-beam" aria-hidden />
      <div className="ai-top">
        <span className="ai-orb" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-fg">
            {stage === 'ready' ? 'Plan ready' : stage === 'failed' ? 'The planner stopped' : `Drafting the plan from ${docs.length} signed document${docs.length === 1 ? '' : 's'}`}
          </p>
          <p className="text-small text-fg-secondary">Nothing reaches the board or the client until you approve.</p>
        </div>
        <Stopwatch from={run.createdAt} running={run.status === 'running'} />
      </div>
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <ol className="ai-steps" data-testid="ai-steps">
        {RAIL.map((s) => (
          <li key={s} className="ai-step" data-s={stepState(s)} data-stage={s} data-testid="ai-step">
            <span className="nm">{AI_STAGE_LABEL[s]}</span>
            <span className="dt">{stepState(s) === 'todo' ? '' : detail[s]}</span>
          </li>
        ))}
      </ol>
      <div className="ai-grid">
        <aside>
          {playful ? (
            <AiRobot stage={stage} />
          ) : (
            <div className="ai-sheet" aria-hidden>
              <div className="ai-scan" />
              <p className="cp-mono p-2 text-caption text-fg-tertiary">{docs[0]?.name ?? 'Documents'}</p>
            </div>
          )}
          <p className="cp-mono mt-2 truncate text-caption text-fg-tertiary">{docs[0]?.name ?? 'Documents'}{docs.length > 1 ? ` +${docs.length - 1}` : ''}</p>
          <div className="ai-pages" data-testid="ai-pages" data-read={p?.pagesRead ?? 0}>
            {docs.flatMap((d) =>
              Array.from({ length: d.pages }, (_, i) => {
                pageNo++;
                return (
                  <i key={`${d.id}-${i}`} className={pageNo <= (p?.pagesRead ?? 0) ? 'on' : undefined}>
                    {i + 1}
                  </i>
                );
              }),
            )}
          </div>
        </aside>
        <div className="min-w-0">
          <div className="ai-ms-row" data-testid="ai-milestones">
            {past('mapping') && p?.milestones.map((m, i) => (
              <span key={i} className="ai-msc" style={{ animationDelay: `${i * 80}ms` }}>
                {m.title} <span className="cp-mono text-fg-tertiary">{m.date}</span>
              </span>
            ))}
          </div>
          <div className="ai-cols">
            {(p?.phases.length ? p.phases : [{ name: 'Before kickoff', count: 0 }, { name: 'Week 1', count: 0 }, { name: 'Week 2', count: 0 }, { name: 'Week 3', count: 0 }, { name: 'After go-live', count: 0 }]).map((ph, ci) => {
              const cards = (p?.cards ?? []).filter((c) => c.phase === ph.name);
              const real = past('writing');
              return (
                <div key={ph.name} className={`ai-col${past('mapping') ? ' on' : ''}`}>
                  <p className="flex justify-between text-caption text-fg-secondary">
                    <span className="truncate">{ph.name}</span>
                    <span className="cp-mono">{past('mapping') ? ph.count : ''}</span>
                  </p>
                  {past('mapping') &&
                    (real ? cards : Array.from({ length: Math.min(3, ph.count) })).slice(0, 3).map((c, i) =>
                      real && c ? (
                        <div key={i} className="ai-card is-real" style={{ animationDelay: `${(ci + i * 5) * 120}ms` }}>
                          {(c as { milestone?: boolean }).milestone ? '◆ ' : ''}
                          {(c as { title: string }).title}
                        </div>
                      ) : (
                        <div key={i} className="ai-card is-skeleton" />
                      ),
                    )}
                  {past('mapping') && ph.count > 3 && <p className="cp-mono mt-1 text-[10px] text-fg-tertiary">+{ph.count - 3} more</p>}
                </div>
              );
            })}
          </div>
          <div className="ai-write">
            <div className={`ai-w${past('writing') ? ' on' : ''}`} data-testid="ai-write-summary">
              <p className="mb-1 font-medium text-fg-secondary">Summary for the client</p>
              {past('writing') && <Reveal text={p?.summaryPreview ?? ''} reduced={reduced} />}
            </div>
            <div className={`ai-w${past('writing') ? ' on' : ''}`} data-testid="ai-write-briefing">
              <p className="mb-1 font-medium text-fg-secondary">Internal briefing</p>
              {past('writing') && <Reveal text={p?.briefingPreview ?? ''} reduced={reduced} />}
            </div>
          </div>
        </div>
      </div>
      {stage === 'ready' && (
        <footer className="ai-ready" data-testid="ai-ready">
          <div>
            <p className="text-body-strong text-fg">Plan ready: review and approve</p>
            <p className="cp-mono text-caption text-fg-tertiary">
              {p?.cards.length ?? 0} cards · {p?.milestones.length ?? 0} milestones · {p?.peopleSuggested ?? 0} people suggested · {p?.risks ?? 0} risks flagged
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
            <Button variant="brand" onClick={onReview} data-testid="ai-review">
              Review and approve →
            </Button>
          </div>
        </footer>
      )}
      {stage === 'failed' && (
        <footer className="ai-ready" data-testid="ai-failed">
          <p className="text-body text-warning-fg">The planner stopped: {run.error || 'it could not finish.'}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onUseSop}>
              Use the SOP cards instead
            </Button>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        </footer>
      )}
    </section>
  );
}
