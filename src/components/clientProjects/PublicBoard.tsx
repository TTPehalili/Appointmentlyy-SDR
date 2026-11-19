'use client';

/**
 * The shared client board (/b/[token]): a calm roadmap by phase. The client sees progress, ticks
 * their own items, comments, and reports UAT issues. No login: the private link is the key, and the
 * server decides what this page may see and do.
 */
import * as React from 'react';
import { ArrowRight, ChevronDown, Diamond, Download, Lock } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Field, Input, SegmentedControl, Select, Skeleton, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SEVERITIES, SEVERITY_LABEL, fmtAt, fmtDateLong, type PublicComment, type PublicDefect, type PublicProject, type PublicTask } from '@/lib/clientProjects/types';
import { DueText, ProgressBar, SeverityChip, SideChip, StatusChip, initialsOf } from '@/components/clientProjects/shared';
import { ClientIntakePanel } from '@/components/clientProjects/intake/ClientIntakePanel';
import type { PublicIntake } from '@/lib/clientProjects/intake';

/** The button that opens a card's Client Intake panel. */
export function intakeAction(i: PublicIntake): string {
  if (i.unified === 'complete') return 'View';
  if (i.form && (i.form.status === 'open' || i.form.status === 'draft' || i.form.status === 'changes_requested')) return i.form.status === 'open' ? 'Fill in' : 'Continue';
  if (i.kind === 'dns') return 'Set up DNS';
  if (i.kind === 'keys') return 'Connect keys';
  if (i.kind === 'signature' && i.signature?.ready) return i.signature.action === 'acknowledge' ? 'Open to confirm' : 'Open to sign';
  if (i.kind === 'payment' && i.payment?.canClaim) return 'Pay';
  return 'View';
}

export const NAME_KEY = 'cp_board_name';
/** The client-side person the visitor picked in "Who are you?" (an id from this board's people). */
export const PERSON_KEY = 'cp_board_person';

type Result = { success: boolean; error?: string; board?: PublicProject; status: number };

async function call(token: string, action?: string, body?: Record<string, unknown>): Promise<Result> {
  try {
    const res = await fetch(`/api/board/${token}${action ? `/${action}` : ''}`, {
      method: action ? 'POST' : 'GET',
      headers: action ? { 'Content-Type': 'application/json' } : undefined,
      body: action ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; board?: PublicProject };
    return { ...data, success: Boolean(res.ok && data.success), status: res.status };
  } catch {
    return { success: false, error: 'No connection. Check your internet and try again.', status: 0 };
  }
}

export function PublicBoard({ token }: { token: string }) {
  const [board, setBoard] = React.useState<PublicProject | null>(null);
  const [gone, setGone] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [personId, setPersonId] = React.useState('');
  const [askName, setAskName] = React.useState<null | ((n: string) => void)>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [view, setView] = React.useState('all');
  const [intakeId, setIntakeId] = React.useState<string | null>(null);
  const dead = React.useRef(false);

  const load = React.useCallback(async () => {
    if (dead.current) return;
    const r = await call(token);
    if (r.success && r.board) {
      setBoard(r.board);
      setGone(null);
    } else if (r.status === 404) {
      dead.current = true;
      setGone('This link is not valid any more. Ask your Appointmentlyy contact for the current link.');
    } else if (r.status === 429) setNotice(r.error || 'Too many requests. Wait a minute.');
    else setNotice(r.error || 'Could not load the board.');
  }, [token]);

  React.useEffect(() => {
    try {
      setName(window.localStorage.getItem(NAME_KEY) || '');
      setPersonId(window.localStorage.getItem(PERSON_KEY) || '');
    } catch {
      /* private mode: ask each time */
    }
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  /** Every action carries the name the client entered once. */
  const withName = (fn: (n: string) => void) => {
    if (name.trim().length >= 2) return fn(name.trim());
    setAskName(() => fn);
  };
  const act = (action: string, body: Record<string, unknown>, after?: () => void) =>
    withName(async (n) => {
      setNotice(null);
      const r = await call(token, action, { ...body, name: n, ...(personId ? { personId } : {}) });
      if (r.success && r.board) {
        setBoard(r.board);
        after?.();
      } else if (r.status === 404 && !r.board && r.error === 'This link is not valid.') setGone('This link is not valid any more. Ask your Appointmentlyy contact for the current link.');
      else setNotice(r.error || 'That did not work. Try again.');
    });

  if (gone) {
    return (
      <div className="flex flex-1 items-center justify-center p-6" data-testid="cpb-closed">
        <EmptyState icon={<Lock />} title="This board is not available" description={gone} />
      </div>
    );
  }
  if (!board) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-8">
        {notice ? <p className="text-body text-danger-fg">{notice}</p> : null}
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // An intake step the client has done (submitted, paid, signed: now waiting on us) or that is complete is not waiting on them.
  const onClient = (t: PublicTask) => t.ownerSide === 'client' && t.status !== 'done' && !(t.intake && (t.intake.unified === 'waiting_on_us' || t.intake.unified === 'complete'));
  const yours = board.phases.flatMap((p) => p.tasks).filter(onClient);
  // A picked person only counts while they are still on the board's people list.
  const me = board.people.find((x) => x.id === personId) ?? null;
  const mineAll = me ? board.phases.flatMap((p) => p.tasks).filter((t) => t.assignee?.id === me.id) : [];
  const mineOpen = mineAll.filter((t) => t.status !== 'done' && onClient(t));
  // "Waiting on you": open client items nobody is assigned to (for every visitor), then, once the visitor
  // has picked who they are, the ones assigned to them.
  const unassignedOpen = board.phases.flatMap((p) => p.tasks).filter((t) => onClient(t) && !t.assignee);
  const waiting = [...mineOpen, ...unassignedOpen];
  const keep = (t: PublicTask) => (view === 'mine' ? t.assignee?.id === me?.id : view === 'open' ? t.status !== 'done' : true);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:py-10" data-testid="cpb">
      <header className="flex flex-col gap-3">
        <p className="text-small text-fg-tertiary">Appointmentlyy · Onboarding</p>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h1 className="text-h1 text-fg">{board.clientName}</h1>
          <p className="text-small text-fg-secondary">
            Kickoff {fmtDateLong(board.kickoffDate)}
            {board.targetGoLive ? ` · Go-live ${fmtDateLong(board.targetGoLive)}` : ''}
          </p>
        </div>
        <ProgressBar progress={board.progress} label="Onboarding progress" />
        <p className="flex flex-wrap items-center gap-x-3 text-small text-fg-secondary" data-testid="cpb-progress-text">
          <span className="tabular-nums">
            {board.progress.done} of {board.progress.total} done
          </span>
          {board.intake && board.intake.forms > 0 && (
            <span className="rounded-full bg-subtle px-2 text-caption text-fg-secondary" data-testid="cpb-intake-progress">
              {board.intake.formsSubmitted} of {board.intake.forms} forms submitted
            </span>
          )}
          {yours.length > 0 && (
            <span>
              {yours.length} waiting on you{yours.some((t) => t.overdue) ? ` (${yours.filter((t) => t.overdue).length} overdue)` : ''}
            </span>
          )}
          {name && (
            <span className="ml-auto">
              You are {name} ·{' '}
              <button type="button" className="focus-ring rounded-sm underline" onClick={() => setAskName(() => () => undefined)}>
                change
              </button>
            </span>
          )}
        </p>
        {board.intake && board.intake.items > 0 && !board.readOnly && (() => {
          const items = board.phases.flatMap((p) => p.tasks).filter((t) => t.intake);
          const started = items.some((t) => t.intake && t.intake.unified !== 'not_started');
          const allDone = board.intake.itemsComplete === board.intake.items;
          return (
            <a
              href={`/b/${token}/onboarding`}
              className="cpg-entry focus-ring"
              data-testid="cpb-guided"
              data-started={started ? '1' : '0'}
              referrerPolicy="no-referrer"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-body-strong">{allDone ? 'Review your onboarding' : started ? 'Continue onboarding' : 'Start onboarding'}</span>
                <span className="text-caption opacity-80">{started ? `${board.intake.itemsComplete} of ${board.intake.items} done` : `${board.intake.items} short steps, one at a time`}</span>
              </span>
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </a>
          );
        })()}
      </header>

      {notice && (
        <div role="alert" className="rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="cpb-notice">
          {notice}
        </div>
      )}
      {board.readOnly && <div className="rounded-md border border-line bg-subtle px-3 py-2 text-small text-fg-secondary">This project is closed. The board is read-only.</div>}

      {(me || waiting.length > 0) && (
        <section className="relative overflow-hidden rounded-lg bg-inverse p-4 text-fg-inverse" data-testid="cpb-waiting" aria-label="Waiting on you">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-action-brand" />
          <p className="flex items-center gap-2 text-body-strong">
            Waiting on you <span className="cp-mono rounded-full bg-action-brand px-2 text-caption text-action-brand-fg">{waiting.length}</span>
          </p>
          {!me && board.people.length > 0 && <p className="mt-0.5 text-caption text-fg-inverse-secondary">Items for your team. Pick your name above to see the ones assigned to you too.</p>}
          {waiting.length === 0 ? (
            <p className="mt-1 text-small text-fg-inverse-secondary">Nothing is waiting on you. We&apos;ll email you when something is.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {waiting.slice(0, 8).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2" data-testid="cpb-waiting-row" data-assigned={t.assignee ? '1' : '0'}>
                  <span className="min-w-0">
                    <span className="block text-body font-medium">{t.title}</span>
                    <span className="cp-mono text-caption text-fg-inverse-secondary">{t.dueDate ? `Due ${fmtDateLong(t.dueDate)}${t.overdue ? ' · overdue' : ''}` : 'No date'}</span>
                  </span>
                  {t.intake && (
                    <Button size="sm" variant="secondary" onClick={() => setIntakeId(t.id)} data-testid="cpb-waiting-intake">
                      {intakeAction(t.intake)}
                    </Button>
                  )}
                  {!board.readOnly && t.canTick && (
                    <Button size="sm" variant="secondary" onClick={() => act('tick', { taskId: t.id })}>
                      Mark done
                    </Button>
                  )}
                  {!board.readOnly && t.canClaim && (
                    <Button size="sm" variant="secondary" onClick={() => act('claim', { taskId: t.id })}>
                      I’ve done this
                    </Button>
                  )}
                  {t.awaitingConfirmation && <span className="text-caption text-fg-inverse-secondary">We confirm it once checked.</span>}
                </li>
              ))}
              {waiting.length > 8 && <li className="text-caption text-fg-inverse-secondary">and {waiting.length - 8} more below.</li>}
            </ul>
          )}
        </section>
      )}

      {(board.summary || board.update) && (
        <Card className="flex flex-col gap-3 p-4">
          {board.update && (
            <div data-testid="cpb-update">
              <p className="text-caption text-fg-tertiary">Latest update · {fmtAt(board.update.at)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg">{board.update.text}</p>
            </div>
          )}
          {board.summary && (
            <div className={board.update ? 'border-t border-line pt-3' : undefined} data-testid="cpb-summary">
              <p className="text-caption text-fg-tertiary">About this project</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg-secondary">{board.summary}</p>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Show"
          size="sm"
          value={view}
          onChange={setView}
          items={[
            { value: 'all', label: 'Everything' },
            ...(me ? [{ value: 'mine', label: `My tasks (${mineAll.length})` }] : []),
            { value: 'open', label: 'Open' },
          ]}
        />
        {!me && board.people.length > 0 && (
          <button type="button" className="focus-ring rounded-sm text-small text-fg-secondary underline" onClick={() => setAskName(() => () => undefined)} data-testid="cpb-who">
            Who are you? Pick your name to see your tasks
          </button>
        )}
      </div>

      {board.phases
        .map((ph) => ({ ...ph, tasks: ph.tasks.filter(keep) }))
        .filter((ph) => ph.tasks.length)
        .map((ph) => {
          const done = ph.tasks.filter((t) => t.status === 'done').length;
          return (
            <section key={ph.phase} aria-label={ph.label} data-testid="cpb-phase">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-h3 text-fg">{ph.label}</h2>
                <span className="text-caption tabular-nums text-fg-tertiary">
                  {done}/{ph.tasks.length}
                </span>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {ph.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    token={token}
                    mine={Boolean(me && t.assignee?.id === me.id)}
                    task={t}
                    open={openId === t.id}
                    readOnly={board.readOnly}
                    onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                    onTick={(done) => act(done ? 'tick' : 'untick', { taskId: t.id })}
                    onClaim={() => act('claim', { taskId: t.id })}
                    onIntake={() => setIntakeId(t.id)}
                    onComment={(body, clear) => act('comment', { taskId: t.id, body }, clear)}
                  />
                ))}
              </ul>
            </section>
          );
        })}

      {(board.uatOpen || board.defects.length > 0) && (
        <UatIssues
          board={board}
          openId={openId}
          setOpenId={setOpenId}
          onReport={(body, clear) => act('defect', body, clear)}
          onRetest={(taskId, confirmed) => act('retest', { taskId, confirmed })}
          onComment={(taskId, body, clear) => act('comment', { taskId, body }, clear)}
        />
      )}

      <footer className="pb-6 pt-2 text-caption text-fg-tertiary">This page is private to your team. Please do not forward the link.</footer>

      {(() => {
        const t = intakeId ? board.phases.flatMap((p) => p.tasks).find((x) => x.id === intakeId) : undefined;
        return t?.intake ? (
          <ClientIntakePanel
            token={token}
            task={t}
            intake={t.intake}
            readOnly={board.readOnly}
            who={{ name, personId }}
            withName={withName}
            onBoard={setBoard}
            onClose={() => setIntakeId(null)}
          />
        ) : null;
      })()}

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

function Comments({ comments, onComment, readOnly }: { comments: PublicComment[]; onComment: (body: string, clear: () => void) => void; readOnly: boolean }) {
  const [body, setBody] = React.useState('');
  return (
    <div className="flex flex-col gap-2">
      {comments.map((c) => (
        <div key={c.id} className="rounded-md bg-subtle px-3 py-2" data-testid="cpb-comment">
          <p className="text-caption text-fg-secondary">
            <span className="font-medium text-fg">{c.author}</span> {c.fromClient && <Badge tone="neutral">Client</Badge>} · {fmtAt(c.at)}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body text-fg">{c.body}</p>
        </div>
      ))}
      {!readOnly && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea aria-label="Write a comment" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Write a comment or question" className="flex-1" />
          <Button variant="secondary" disabled={!body.trim()} onClick={() => onComment(body, () => setBody(''))} data-testid="cpb-comment-send">
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

function TaskRow({ token, mine, task, open, readOnly, onToggle, onTick, onClaim, onIntake, onComment }: { token: string; mine: boolean; task: PublicTask; open: boolean; readOnly: boolean; onToggle: () => void; onTick: (done: boolean) => void; onClaim: () => void; onIntake: () => void; onComment: (body: string, clear: () => void) => void }) {
  const done = task.status === 'done';
  return (
    <li data-testid="cpb-task" data-owner={task.ownerSide} data-status={task.status} data-key={task.key} data-intake={task.intake ? task.intake.unified : ''} data-awaiting={task.awaitingConfirmation ? '1' : '0'} data-mine={mine ? '1' : '0'} className={cn(mine && 'bg-[color-mix(in_srgb,var(--brand-500)_3.5%,transparent)]')}>
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          {task.canTick ? (
            <Checkbox aria-label={`${done ? 'Untick' : 'Tick'}: ${task.title}`} checked={done} disabled={readOnly} onChange={(e) => onTick(e.target.checked)} data-testid="cpb-tick" />
          ) : (
            <span aria-hidden className={cn('size-2 rounded-full', done ? 'bg-success-500' : task.status === 'in_progress' ? 'bg-brand-500' : 'bg-line-strong')} />
          )}
        </span>
        <button type="button" onClick={onToggle} aria-expanded={open} className="focus-ring flex min-w-0 flex-1 flex-col gap-1.5 rounded-sm text-left">
          <span className={cn('flex items-start gap-1.5 text-body', done ? 'text-fg-secondary' : 'text-fg')}>
            {task.isGate && <Diamond className="mt-1 size-3 shrink-0 text-fg-secondary" aria-label="Milestone" />}
            <span>{task.title}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <SideChip side={task.ownerSide} you />
            <DueText date={task.dueDate} overdue={task.overdue} done={done} />
            {task.intake ? (
              <span data-testid="cpb-intake-chip" data-u={task.intake.unified}><Badge tone={task.intake.tone}>
                {task.intake.label}
              </Badge></span>
            ) : task.awaitingConfirmation ? (
              <Badge tone="warning">Awaiting confirmation</Badge>
            ) : (
              <StatusChip status={task.status} />
            )}
            {mine ? (
              <span className="rounded-sm bg-[color-mix(in_srgb,var(--brand-500)_10%,transparent)] px-1.5 text-caption font-medium text-brand-text" data-testid="cpb-assigned-you">
                Assigned to you
              </span>
            ) : task.assignee ? (
              <span className="inline-flex items-center gap-1 text-caption text-fg-secondary" data-testid="cpb-assignee">
                <span className="cp-av" data-side="client" aria-hidden>
                  {initialsOf(task.assignee.name)}
                </span>
                {task.assignee.name.split(' ')[0]}
              </span>
            ) : null}
            {task.comments.length > 0 && <span className="text-caption text-fg-tertiary">{task.comments.length} {task.comments.length === 1 ? 'comment' : 'comments'}</span>}
          </span>
        </button>
        {task.intake && (
          <Button variant={task.intake.unified === 'complete' ? 'ghost' : 'secondary'} size="sm" onClick={onIntake} data-testid="cpb-intake" data-kind={task.intake.kind} className="shrink-0">
            {intakeAction(task.intake)}
          </Button>
        )}
        {task.canClaim && !readOnly && (
          <Button variant="secondary" size="sm" onClick={onClaim} data-testid="cpb-claim" className="shrink-0">
            I’ve done this
          </Button>
        )}
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-fg-tertiary transition-transform', open && 'rotate-180')} />
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line bg-app px-3 py-3 sm:pl-11">
          {task.awaitingConfirmation && <p className="text-small text-fg-secondary">You told us this is done. We will confirm it and mark it Done.</p>}
          {task.canClaim && <p className="text-small text-fg-tertiary">We confirm this item ourselves. Tell us when it is done with “I’ve done this”.</p>}
          {task.description && <p className="whitespace-pre-wrap break-words text-body text-fg-secondary">{task.description}</p>}
          {task.attachments.length > 0 && (
            <ul className="flex flex-col gap-1" data-testid="cpb-attachments">
              {task.attachments.map((f) => (
                <li key={f.id}>
                  <a className="focus-ring inline-flex items-center gap-1.5 rounded-sm text-small text-fg underline-offset-2 hover:underline" href={`/api/board/${token}/file/${f.id}`} rel="noopener noreferrer" referrerPolicy="no-referrer" data-testid="cpb-attachment">
                    <Download className="size-3.5" aria-hidden />
                    {f.name} <span className="cp-mono text-caption text-fg-tertiary">{(f.size / 1024).toFixed(0)} KB</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Comments comments={task.comments} onComment={onComment} readOnly={readOnly} />
        </div>
      )}
    </li>
  );
}

function UatIssues({
  board,
  openId,
  setOpenId,
  onReport,
  onRetest,
  onComment,
}: {
  board: PublicProject;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onReport: (body: Record<string, unknown>, clear: () => void) => void;
  onRetest: (taskId: string, confirmed: boolean) => void;
  onComment: (taskId: string, body: string, clear: () => void) => void;
}) {
  const [reporting, setReporting] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [steps, setSteps] = React.useState('');
  const [severity, setSeverity] = React.useState('S3');
  const can = board.uatOpen && !board.readOnly;
  return (
    <section aria-label="UAT issues" data-testid="cpb-uat">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-h3 text-fg">UAT issues</h2>
        {can && !reporting && (
          <Button variant="secondary" size="sm" onClick={() => setReporting(true)} data-testid="cpb-report">
            Report an issue
          </Button>
        )}
      </div>
      {reporting && (
        <Card className="mb-3 flex flex-col gap-3 p-4" data-testid="cpb-report-form">
          <Field label="What is wrong?" htmlFor="cpb-d-title">
            <Input id="cpb-d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="A short title" />
          </Field>
          <Field label="Steps to see it" htmlFor="cpb-d-steps" hint="Where you were, what you did, what happened, and what you expected.">
            <Textarea id="cpb-d-steps" rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={3000} />
          </Field>
          <Field label="How serious is it?" htmlFor="cpb-d-sev" hint="We confirm the severity the same day.">
            <Select id="cpb-d-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReporting(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={title.trim().length < 4 || steps.trim().length < 10}
              data-testid="cpb-report-send"
              onClick={() =>
                onReport({ title, steps, severity }, () => {
                  setTitle('');
                  setSteps('');
                  setSeverity('S3');
                  setReporting(false);
                })
              }
            >
              Send report
            </Button>
          </div>
        </Card>
      )}
      {board.defects.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-3 py-3 text-small text-fg-secondary">No issues reported. {can ? 'Found something during testing? Report it here.' : ''}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {board.defects.map((d) => (
            <DefectRow key={d.id} d={d} open={openId === d.id} readOnly={board.readOnly} onToggle={() => setOpenId(openId === d.id ? null : d.id)} onRetest={(c) => onRetest(d.id, c)} onComment={(body, clear) => onComment(d.id, body, clear)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DefectRow({ d, open, readOnly, onToggle, onRetest, onComment }: { d: PublicDefect; open: boolean; readOnly: boolean; onToggle: () => void; onRetest: (confirmed: boolean) => void; onComment: (body: string, clear: () => void) => void }) {
  const fixed = d.status === 'done';
  return (
    <li data-testid="cpb-defect" data-key={d.key} data-status={d.status}>
      <div className="flex items-start gap-3 px-3 py-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="focus-ring flex min-w-0 flex-1 flex-col gap-1.5 rounded-sm text-left">
          <span className="text-body text-fg">
            <span className="mr-1.5 font-mono text-caption text-fg-tertiary">{d.key}</span>
            {d.title}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <SeverityChip severity={d.severity} />
            {fixed ? <Badge tone={d.retestConfirmed ? 'success' : 'warning'}>{d.statusLabel}</Badge> : <StatusChip status={d.status} />}
            {!fixed && d.fixDue && (
              <span className="inline-flex items-center gap-1 text-caption text-fg-secondary">
                Fix due <DueText date={d.fixDue} overdue={d.overdue} />
              </span>
            )}
          </span>
        </button>
        <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 text-fg-tertiary transition-transform', open && 'rotate-180')} />
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line bg-app px-3 py-3">
          {d.steps && <p className="whitespace-pre-wrap break-words text-body text-fg-secondary">{d.steps}</p>}
          {fixed && d.reportedByClient && !readOnly && <Checkbox checked={d.retestConfirmed} onChange={(e) => onRetest(e.target.checked)} label="I retested this and it is fixed" data-testid="cpb-retest" />}
          <Comments comments={d.comments} onComment={onComment} readOnly={readOnly} />
        </div>
      )}
    </li>
  );
}

export function NameDialog({ open, initial, people, tasks, onClose, onSave }: { open: boolean; initial: string; people: { id: string; name: string }[]; tasks: PublicTask[]; onClose: () => void; onSave: (name: string, personId: string) => void }) {
  const [v, setV] = React.useState(initial);
  React.useEffect(() => {
    if (open) setV(initial);
  }, [open, initial]);
  const ok = v.trim().length >= 2;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Who are you?"
      description="So the team knows who ticked an item or left a comment, and so you can see your own tasks. You only do this once."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={() => onSave(v.trim(), '')} data-testid="cpb-name-save">
            Continue
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {people.length > 0 && (
          <ul className="flex flex-col gap-1.5" data-testid="cpb-people">
            {people.map((x) => {
              const n = tasks.filter((t) => t.assignee?.id === x.id && t.status !== 'done').length;
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => onSave(x.name, x.id)} className="focus-ring flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:bg-subtle" data-testid="cpb-person">
                    <span className="cp-av is-md" data-side="client" aria-hidden>
                      {initialsOf(x.name)}
                    </span>
                    <span className="flex-1 text-body text-fg">{x.name}</span>
                    <span className="cp-mono text-caption text-fg-tertiary">
                      {n} task{n === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Field label={people.length ? 'Someone else? Type your name' : 'Your name'} htmlFor="cpb-name">
          <Input
            id="cpb-name"
            value={v}
            onChange={(e) => setV(e.target.value)}
            maxLength={80}
            placeholder="First and last name"
            autoFocus={!people.length}
            data-testid="cpb-name"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) onSave(v.trim(), '');
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
