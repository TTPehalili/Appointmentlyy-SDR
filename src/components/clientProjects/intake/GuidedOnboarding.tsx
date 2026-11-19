'use client';

/**
 * Guided onboarding (/b/[token]/onboarding): the client's intake items, ONE PER PAGE, in milestone order (Before
 * kickoff, Week 1, Week 2, Week 3, After go-live; then due date; then the board's own order). Each page reuses the
 * item's own body (IntakeStep: forms through FormRenderer, DNS, keys, signature, payment, UAT); a form with several
 * sections becomes sub-pages. The place is in the URL (?step=<requestId>&part=<n>), so a refresh or a shared deep link
 * lands on the same page. Explicit Save draft only (no autosave), and an "unsaved changes" guard on every way out:
 * Back, Skip, Next, the stepper, the picker, the board link, the browser's back button and closing the tab.
 * Data: the same token-scoped board JSON and intake actions as the board itself (no extra endpoint).
 */
import * as React from 'react';
import { ArrowLeft, Check, Clock, Lock } from 'lucide-react';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PHASES, PHASE_LABEL, todayManila, type Phase, type PublicProject, type PublicTask } from '@/lib/clientProjects/types';
import type { PublicIntake } from '@/lib/clientProjects/intake';
import { IntakeStepContent, IntakeSummaryDialog, formLocked, useIntakeStep } from '@/components/clientProjects/intake/IntakeStep';
import { NAME_KEY, NameDialog, PERSON_KEY } from '@/components/clientProjects/PublicBoard';
import '@/components/clientProjects/cp.css';

interface Step {
  task: PublicTask;
  intake: PublicIntake;
  phase: Phase;
}
type Place = { step: string; part: number } | { step: 'done'; part: 0 };

const actionable = (s: Step) => s.intake.unified !== 'complete' && s.intake.unified !== 'waiting_on_us';
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The items in milestone order. The board already lists each phase's cards by due date, then by their order. */
export function stepsOf(board: PublicProject): Step[] {
  const out: Step[] = [];
  for (const ph of [...board.phases].sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase))) {
    for (const t of ph.tasks) if (t.intake) out.push({ task: t, intake: t.intake, phase: ph.phase });
  }
  return out;
}

function placeFromUrl(): Place | null {
  const q = new URLSearchParams(window.location.search);
  const step = q.get('step');
  if (!step) return null;
  if (step === 'done') return { step: 'done', part: 0 };
  const part = Math.max(0, (Number(q.get('part')) || 1) - 1);
  return { step, part };
}
const urlOf = (p: Place) => `?step=${encodeURIComponent(p.step)}${p.step !== 'done' && p.part > 0 ? `&part=${p.part + 1}` : ''}`;

export function GuidedOnboarding({ token }: { token: string }) {
  const [board, setBoard] = React.useState<PublicProject | null>(null);
  const [gone, setGone] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [personId, setPersonId] = React.useState('');
  const [askName, setAskName] = React.useState<null | ((n: string) => void)>(null);
  const [place, setPlace] = React.useState<Place | null>(null);
  const [ready, setReady] = React.useState(false);
  // The current page's unsaved-edits state and its "forget them" action (set by the step page).
  const dirtyRef = React.useRef(false);
  const discardRef = React.useRef<() => void>(() => undefined);
  const placeRef = React.useRef<Place | null>(null);
  placeRef.current = place;

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/board/${token}`, { cache: 'no-store', referrerPolicy: 'no-referrer' });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; board?: PublicProject };
      if (res.ok && d.success && d.board) {
        setBoard(d.board);
        setProblem(null);
      } else if (res.status === 404) setGone('This link is not valid any more. Ask your Appointmentlyy contact for the current link.');
      else setProblem(d.error || 'Could not load your onboarding.');
    } catch {
      setProblem('No connection. Check your internet and try again.');
    }
  }, [token]);

  React.useEffect(() => {
    let n = '';
    try {
      n = window.localStorage.getItem(NAME_KEY) || '';
      setName(n);
      setPersonId(window.localStorage.getItem(PERSON_KEY) || '');
    } catch {
      /* private mode: ask each time */
    }
    void load();
  }, [load]);

  const steps = React.useMemo(() => (board ? stepsOf(board) : []), [board]);

  // First visit: ask who they are once (the board's own "Who are you?", same storage key).
  React.useEffect(() => {
    if (board && !ready) {
      setReady(true);
      if (!name.trim()) setAskName(() => () => undefined);
    }
  }, [board, ready, name]);

  // Where to land: the URL's step (a refresh or a deep link), else the first item that is neither complete nor waiting on us.
  React.useEffect(() => {
    if (!board || place) return;
    const fromUrl = placeFromUrl();
    const known = fromUrl && (fromUrl.step === 'done' || steps.some((s) => s.intake.requestId === fromUrl.step));
    const first = steps.find(actionable);
    const p: Place = known && fromUrl ? fromUrl : first ? { step: first.intake.requestId, part: 0 } : { step: 'done', part: 0 };
    setPlace(p);
    window.history.replaceState(null, '', urlOf(p));
  }, [board, steps, place]);

  const confirmLeave = () => !dirtyRef.current || window.confirm('You have unsaved changes on this page. Leave without saving them?');

  /** Every move goes through here: the unsaved guard (when leaving the item), then the URL, then the page. */
  const go = (to: Place, opts: { force?: boolean } = {}) => {
    const cur = placeRef.current;
    const leavingItem = !cur || cur.step !== to.step;
    if (leavingItem && !opts.force) {
      if (!confirmLeave()) return;
      if (dirtyRef.current) discardRef.current();
    }
    dirtyRef.current = leavingItem ? false : dirtyRef.current;
    setPlace(to);
    window.history.pushState(null, '', urlOf(to));
    window.scrollTo({ top: 0 });
  };

  // The browser's back / forward buttons: the same guard. A refused move puts the URL back where it was.
  React.useEffect(() => {
    const onPop = () => {
      const to = placeFromUrl();
      const cur = placeRef.current;
      if (!to || !cur) return;
      if (to.step !== cur.step && dirtyRef.current) {
        if (!window.confirm('You have unsaved changes on this page. Leave without saving them?')) {
          window.history.pushState(null, '', urlOf(cur));
          return;
        }
        discardRef.current();
        dirtyRef.current = false;
      }
      setPlace(to);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const withName = (fn: (n: string) => void) => {
    if (name.trim().length >= 2) return fn(name.trim());
    setAskName(() => fn);
  };

  if (gone) {
    return (
      <div className="flex flex-1 items-center justify-center p-6" data-testid="cpg-closed">
        <EmptyState icon={<Lock />} title="This page is not available" description={gone} />
      </div>
    );
  }
  if (!board || !place) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-8">
        {problem ? <p className="text-body text-danger-fg">{problem}</p> : null}
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const idx = place.step === 'done' ? -1 : steps.findIndex((s) => s.intake.requestId === place.step);
  const cur = idx >= 0 ? steps[idx] : null;
  const total = steps.length;
  const done = steps.filter((s) => s.intake.unified === 'complete').length;
  const milestones = PHASES.map((ph) => ({ phase: ph, items: steps.filter((s) => s.phase === ph) })).filter((m) => m.items.length);
  const curPhase: Phase | null = cur ? cur.phase : null;
  const firstOpen = steps.find(actionable);
  const nextAfter = (i: number): Place => (i + 1 < total ? { step: steps[i + 1].intake.requestId, part: 0 } : { step: 'done', part: 0 });
  const prevBefore = (i: number): Place | null => (i > 0 ? { step: steps[i - 1].intake.requestId, part: 0 } : null);
  const boardHref = `/b/${token}`;

  return (
    <div className="cpg flex min-h-screen flex-col" data-testid="cpg-root">
      <header className="cpg-head">
        <div className="cpg-wrap flex flex-col gap-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <a
              href={boardHref}
              className="focus-ring inline-flex items-center gap-1.5 rounded-sm text-small text-fg-secondary hover:text-fg"
              onClick={(e) => {
                if (!confirmLeave()) e.preventDefault();
              }}
              data-testid="cpg-board-link"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back to your board
            </a>
            <span className="truncate text-small text-fg-tertiary">{board.clientName} · Onboarding</span>
          </div>
          <ol className="cpg-milestones" aria-label="Milestones" data-testid="cpg-milestones">
            {milestones.map((m) => {
              const mDone = m.items.filter((s) => s.intake.unified === 'complete').length;
              const isCur = m.phase === curPhase;
              return (
                <li key={m.phase}>
                  <button
                    type="button"
                    className="cpg-ms focus-ring"
                    aria-current={isCur ? 'step' : undefined}
                    data-complete={mDone === m.items.length ? '1' : '0'}
                    data-testid="cpg-milestone"
                    data-phase={m.phase}
                    onClick={() => go({ step: (m.items.find(actionable) ?? m.items[0]).intake.requestId, part: 0 })}
                  >
                    <span className="cpg-ms-name">{PHASE_LABEL[m.phase]}</span>
                    <span className="cp-mono cpg-ms-count">
                      {mDone}/{m.items.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-small text-fg-secondary" data-testid="cpg-step-line">
              {cur ? (
                <>
                  <span className="cpg-wide">
                    {PHASE_LABEL[cur.phase]} · Step {idx + 1} of {total}
                  </span>
                  <span className="cpg-narrow cp-mono">
                    {PHASE_LABEL[cur.phase]} · {idx + 1}/{total}
                  </span>
                </>
              ) : (
                'All steps'
              )}
            </p>
            <label className="cpg-picker-wrap">
              <span className="sr-only">Go to a step</span>
              <select
                className="cpg-picker focus-ring"
                value={place.step}
                onChange={(e) => go({ step: e.target.value, part: 0 })}
                data-testid="cpg-picker"
              >
                {milestones.map((m) => (
                  <optgroup key={m.phase} label={PHASE_LABEL[m.phase]}>
                    {m.items.map((s) => (
                      <option key={s.intake.requestId} value={s.intake.requestId}>
                        {steps.indexOf(s) + 1}. {s.task.title}
                        {s.intake.unified === 'complete' ? ' ✓' : s.intake.unified === 'waiting_on_us' ? ' (sent)' : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value="done">Summary</option>
              </select>
            </label>
          </div>
          <div className="cpg-progress" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} data-testid="cpg-progress" data-done={done} data-total={total}>
            <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <p className="cp-mono text-caption text-fg-tertiary" data-testid="cpg-progress-text">
            {done} of {total} done
          </p>
        </div>
      </header>

      <main className="cpg-wrap flex flex-1 flex-col py-6">
        {cur ? (
          <StepPage
            key={cur.intake.requestId}
            token={token}
            board={board}
            step={cur}
            index={idx}
            total={total}
            part={place.part}
            futureNote={Boolean(firstOpen && PHASES.indexOf(cur.phase) > PHASES.indexOf(firstOpen.phase) && cur.task.dueDate && cur.task.dueDate > todayManila())}
            who={{ name, personId }}
            withName={withName}
            onBoard={setBoard}
            dirtyRef={dirtyRef}
            discardRef={discardRef}
            onPart={(p) => go({ step: cur.intake.requestId, part: p })}
            onBack={() => {
              const prev = prevBefore(idx);
              if (prev) go(prev);
            }}
            canBack={idx > 0}
            onNext={(force) => go(nextAfter(idx), { force })}
          />
        ) : (
          <EndPage steps={steps} boardHref={boardHref} onOpen={(id) => go({ step: id, part: 0 })} />
        )}
      </main>

      <NameDialog
        open={askName !== null}
        initial={name}
        people={board.people}
        tasks={board.phases.flatMap((ph) => ph.tasks)}
        onClose={() => setAskName(null)}
        onSave={(n, pid) => {
          setName(n);
          setPersonId(pid);
          try {
            window.localStorage.setItem(NAME_KEY, n);
            if (pid) window.localStorage.setItem(PERSON_KEY, pid);
            else window.localStorage.removeItem(PERSON_KEY);
          } catch {
            /* ignore */
          }
          const next = askName;
          setAskName(null);
          next?.(n);
        }}
      />
    </div>
  );
}

function StepPage({
  token,
  board,
  step,
  index,
  total,
  part,
  futureNote,
  who,
  withName,
  onBoard,
  dirtyRef,
  discardRef,
  onPart,
  onBack,
  canBack,
  onNext,
}: {
  token: string;
  board: PublicProject;
  step: Step;
  index: number;
  total: number;
  part: number;
  futureNote: boolean;
  who: { name: string; personId: string };
  withName: (fn: (n: string) => void) => void;
  onBoard: (b: PublicProject) => void;
  dirtyRef: React.MutableRefObject<boolean>;
  discardRef: React.MutableRefObject<() => void>;
  onPart: (p: number) => void;
  onBack: () => void;
  canBack: boolean;
  onNext: (force?: boolean) => void;
}) {
  const { task, intake } = step;
  const s = useIntakeStep({ token, intake, who, withName, onBoard });
  const readOnly = board.readOnly;
  const locked = formLocked(s, readOnly);
  const editableForm = Boolean(s.form) && !locked;
  const parts = editableForm ? Math.max(1, s.parts.length) : 1;
  const p = Math.min(part, parts - 1);
  // The URL's part drives the form's section.
  React.useEffect(() => {
    if (s.part !== p) s.setPart(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);
  // A failed submit moves the form to the section with the first problem: follow it in the URL.
  React.useEffect(() => {
    if (editableForm && s.part !== p) onPart(s.part);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.part]);
  React.useEffect(() => {
    dirtyRef.current = s.dirty;
  }, [s.dirty, dirtyRef]);
  React.useEffect(() => {
    discardRef.current = s.discard;
  });

  const state = intake.unified === 'complete' ? 'done' : intake.unified === 'waiting_on_us' ? 'sent' : 'open';
  const lastPart = p >= parts - 1;
  const submitAndNext = async () => {
    if (await s.submit()) onNext(true);
  };

  return (
    <div className="flex flex-1 flex-col">
      <article key={`${intake.requestId}-${p}`} className="cpg-slide flex flex-col gap-5" data-testid="cpg-step" data-request={intake.requestId} data-kind={intake.kind} data-state={state} data-part={p + 1} data-parts={parts} data-index={index + 1}>
        <div className="flex flex-col gap-2">
          <p className="cp-mono text-caption text-fg-tertiary" data-testid="cpg-step-of">
            Step {index + 1} of {total}
            {parts > 1 ? ` · part ${p + 1} of ${parts}` : ''}
          </p>
          <h1 className="text-h2 text-fg" data-testid="cpg-title">
            {task.title}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-small text-fg-secondary">
            <Badge tone={intake.tone}>{intake.label}</Badge>
            {task.dueDate && (
              <span data-testid="cpg-due" className={cn(task.overdue && state === 'open' && 'text-danger-fg')}>
                Due {shortDate(task.dueDate)}
                {futureNote && state === 'open' ? ' · you can do this now or later' : task.overdue && state === 'open' ? ' · overdue' : ''}
              </span>
            )}
          </p>
        </div>

        {state === 'done' && (
          <div className="cpg-state" data-tone="done" data-testid="cpg-done">
            <Check className="size-5" aria-hidden />
            <span>
              <span className="block text-body-strong">Done ✓</span>
              <span className="text-small opacity-90">Nothing more is needed from you here.</span>
            </span>
          </div>
        )}
        {state === 'sent' && (
          <div className="cpg-state" data-tone="sent" data-testid="cpg-sent">
            <Clock className="size-5" aria-hidden />
            <span>
              <span className="block text-body-strong">Sent ✓, we’re reviewing it</span>
              <span className="text-small opacity-90">We’ll tell you here if anything needs changing. You can move on.</span>
            </span>
          </div>
        )}
        {state === 'open' && task.description && !s.form?.schema.intro && p === 0 && <p className="whitespace-pre-wrap break-words text-body text-fg-secondary">{task.description}</p>}

        <IntakeStepContent s={s} token={token} task={task} intake={intake} readOnly={readOnly} partNav={false} showDescription={false} partHeading={parts > 1 ? s.parts[p]?.title : undefined} />
      </article>

      <footer className="cpg-foot" data-testid="cpg-foot">
        {s.dirty && (
          <span className="cpg-unsaved text-caption text-fg-tertiary" data-testid="cpg-unsaved">
            Unsaved changes
          </span>
        )}
        <div className="cpg-foot-row" data-n={1 + (state === 'open' ? 1 : 0) + (editableForm ? 1 : 0) + 1}>
          <Button
            variant="ghost"
            disabled={!canBack && p === 0}
            onClick={() => (editableForm && p > 0 ? onPart(p - 1) : onBack())}
            data-testid="cpg-back"
          >
            Back
          </Button>
          {state === 'open' && (
            <Button variant="ghost" onClick={() => onNext()} data-testid="cpg-skip">
              Skip for now
            </Button>
          )}
          <span className="cpg-spacer flex-1" />
          {editableForm && (
            <Button variant="secondary" onClick={() => void s.save()} loading={s.busy === 'save'} data-testid="cpg-save">
              Save draft
            </Button>
          )}
          {editableForm && !lastPart ? (
            <Button variant="primary" onClick={() => onPart(p + 1)} data-testid="cpg-primary" data-action="continue">
              Continue
            </Button>
          ) : editableForm ? (
            <Button variant="primary" onClick={() => s.review()} data-testid="cpg-primary" data-action="submit">
              Submit &amp; next
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onNext()} data-testid="cpg-primary" data-action="next">
              Next
            </Button>
          )}
        </div>
      </footer>
      <IntakeSummaryDialog s={s} onSubmit={() => void submitAndNext()} />
    </div>
  );
}

function EndPage({ steps, boardHref, onOpen }: { steps: Step[]; boardHref: string; onOpen: (requestId: string) => void }) {
  const waiting = steps.filter((s) => s.intake.unified === 'waiting_on_us');
  const done = steps.filter((s) => s.intake.unified === 'complete');
  const open = steps.filter(actionable);
  const list = (items: Step[], testId: string) => (
    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface" data-testid={testId}>
      {items.map((s) => (
        <li key={s.intake.requestId}>
          <button type="button" className="focus-ring flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-subtle" onClick={() => onOpen(s.intake.requestId)}>
            <span className="min-w-0 truncate text-body text-fg">{s.task.title}</span>
            <span className="shrink-0 text-caption text-fg-tertiary">{s.intake.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="cpg-slide flex flex-col gap-6" data-testid="cpg-end">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2 text-fg">{open.length ? 'That’s every step for now' : 'You’re all caught up'}</h1>
        <p className="text-body text-fg-secondary">
          {open.length ? `${open.length} step${open.length === 1 ? ' is' : 's are'} still open. Pick one below whenever you are ready.` : 'Everything we need from you is in. We’ll email you if anything else comes up.'}
        </p>
      </div>
      {open.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-body-strong text-fg">Still open ({open.length})</h2>
          {list(open, 'cpg-end-open')}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-body-strong text-fg">Waiting on us ({waiting.length})</h2>
        {waiting.length ? list(waiting, 'cpg-end-waiting') : <p className="text-small text-fg-tertiary">Nothing waiting on us.</p>}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-body-strong text-fg">Done ({done.length})</h2>
        {done.length ? list(done, 'cpg-end-done') : <p className="text-small text-fg-tertiary">Nothing finished yet.</p>}
      </section>
      <a href={boardHref} className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-md bg-inverse px-3.5 py-2 text-small font-medium text-fg-inverse" data-testid="cpg-end-board">
        <ArrowLeft className="size-4" aria-hidden /> Back to your board
      </a>
    </div>
  );
}
