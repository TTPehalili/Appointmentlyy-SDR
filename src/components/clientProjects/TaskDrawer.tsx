'use client';

/** The card drawer: everything a card does not show. Edit, comment, and read the card's history. */
import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Checkbox, ConfirmDialog, Drawer, Field, Input, Select, Textarea, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import {
  DELIVERABLE_LIST,
  PHASES,
  PHASE_LABEL,
  SEVERITIES,
  SEVERITY_FIX_BD,
  SEVERITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  TYPE_LABEL,
  defectStatusLabel,
  fmtAt,
  fmtDateLong,
  type CpComment,
  type CpEvent,
  type OwnerTaskView,
} from '@/lib/clientProjects/types';
import { actorLabel, eventText } from '@/components/clientProjects/eventText';

interface Form {
  title: string;
  status: string;
  ownerSide: string;
  isGate: boolean;
  phase: string;
  dueDate: string;
  deliverableRef: string;
  clientVisible: boolean;
  descriptionClient: string;
  notesInternal: string;
  evidence: string;
  blockedBy: string;
  severity: string;
  steps: string;
  reportedBy: string;
  retestConfirmed: boolean;
  autoComplete: boolean;
  clientMayTick: boolean;
}

const formOf = (t: OwnerTaskView): Form => ({
  title: t.title,
  status: t.status,
  ownerSide: t.ownerSide,
  isGate: t.isGate,
  phase: t.phase,
  dueDate: t.dueDate ?? '',
  deliverableRef: t.deliverableRef,
  clientVisible: t.clientVisible,
  descriptionClient: t.descriptionClient,
  notesInternal: t.notesInternal,
  evidence: t.evidence.join('\n'),
  blockedBy: t.blockedBy ?? '',
  severity: t.severity ?? 'S3',
  steps: t.steps,
  reportedBy: t.reportedBy,
  retestConfirmed: t.retestConfirmed,
  autoComplete: t.autoComplete,
  clientMayTick: t.clientMayTick,
});

export function TaskDrawer({
  projectId,
  task,
  tasks,
  onClose,
  onChanged,
}: {
  projectId: string;
  task: OwnerTaskView | null;
  tasks: OwnerTaskView[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [form, setForm] = React.useState<Form | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [comment, setComment] = React.useState('');
  const [commentVisible, setCommentVisible] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // This card's own comments and history, newest first, loaded in pages (never cut off).
  const [comments, setComments] = React.useState<CpComment[]>([]);
  const [commentsBefore, setCommentsBefore] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<CpEvent[]>([]);
  const [historyBefore, setHistoryBefore] = React.useState<string | null>(null);
  const loadThread = React.useCallback(
    async (id: string) => {
      const base = `/api/client-projects/${projectId}/events?taskId=${id}`;
      const [c, h] = await Promise.all([apiJson<{ comments: CpComment[]; nextBefore: string | null }>(`${base}&kind=comments&limit=50`), apiJson<{ events: CpEvent[]; nextBefore: string | null }>(`${base}&limit=30`)]);
      if (c.success) {
        setComments(c.comments);
        setCommentsBefore(c.nextBefore);
      }
      if (h.success) {
        setHistory(h.events);
        setHistoryBefore(h.nextBefore);
      }
    },
    [projectId],
  );
  const older = async (kind: 'comments' | 'events') => {
    const cursor = kind === 'comments' ? commentsBefore : historyBefore;
    if (!task || !cursor) return;
    const r = await apiJson<{ comments?: CpComment[]; events?: CpEvent[]; nextBefore: string | null }>(`/api/client-projects/${projectId}/events?taskId=${task.id}&limit=50&before=${encodeURIComponent(cursor)}${kind === 'comments' ? '&kind=comments' : ''}`);
    if (!r.success) return;
    if (kind === 'comments') {
      setComments((x) => [...x, ...(r.comments ?? [])]);
      setCommentsBefore(r.nextBefore);
    } else {
      setHistory((x) => [...x, ...(r.events ?? [])]);
      setHistoryBefore(r.nextBefore);
    }
  };
  const taskId = task?.id ?? null;

  // Seed the form when a card opens (not on every background refresh, so typing is never lost).
  React.useEffect(() => {
    setForm(task ? formOf(task) : null);
    setComment('');
    setCommentVisible(false);
    setComments([]);
    setHistory([]);
    setCommentsBefore(null);
    setHistoryBefore(null);
    if (taskId) void loadThread(taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task || !form) return <Drawer open={false} onClose={onClose} title="" />;
  const isDefect = task.type === 'defect';
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const base = formOf(task);
  const dirty = (Object.keys(base) as (keyof Form)[]).some((k) => base[k] !== form[k]);

  const save = async () => {
    const body: Record<string, unknown> = {};
    const changed = (k: keyof Form) => base[k] !== form[k];
    if (changed('title')) body.title = form.title;
    if (changed('status')) body.status = form.status;
    if (changed('phase')) body.phase = form.phase;
    if (changed('dueDate')) body.dueDate = form.dueDate || null;
    if (changed('deliverableRef')) body.deliverableRef = form.deliverableRef;
    if (changed('clientVisible')) body.clientVisible = form.clientVisible;
    if (changed('descriptionClient')) body.descriptionClient = form.descriptionClient;
    if (changed('notesInternal')) body.notesInternal = form.notesInternal;
    if (changed('evidence')) body.evidence = form.evidence.split('\n').map((x) => x.trim()).filter(Boolean);
    if (changed('blockedBy')) body.blockedBy = form.blockedBy || null;
    if (isDefect) {
      if (changed('severity')) body.severity = form.severity;
      if (changed('steps')) body.steps = form.steps;
      if (changed('reportedBy')) body.reportedBy = form.reportedBy;
      if (changed('retestConfirmed')) body.retestConfirmed = form.retestConfirmed;
    } else {
      if (changed('ownerSide')) body.ownerSide = form.ownerSide;
      if (changed('isGate')) body.isGate = form.isGate;
      if (changed('autoComplete')) body.autoComplete = form.autoComplete && form.isGate && form.ownerSide === 'us';
      if (changed('clientMayTick')) body.clientMayTick = form.clientMayTick && !form.isGate && form.ownerSide === 'client';
    }
    setSaving(true);
    const r = await apiJson<{ task: OwnerTaskView }>(`/api/client-projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', body });
    setSaving(false);
    if (!r.success) return toast({ message: r.error || 'Could not save the card.' });
    setForm(formOf(r.task));
    toast({ message: `${task.key} saved` });
    await Promise.all([onChanged(), loadThread(task.id)]);
  };

  const post = async () => {
    setPosting(true);
    const r = await apiJson(`/api/client-projects/${projectId}/tasks/${task.id}`, { body: { comment, clientVisible: commentVisible } });
    setPosting(false);
    if (!r.success) return toast({ message: r.error || 'Could not add the comment.' });
    setComment('');
    await Promise.all([onChanged(), loadThread(task.id)]);
  };
  const clearClaim = async () => {
    const r = await apiJson(`/api/client-projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', body: { clearClaim: true } });
    if (!r.success) return toast({ message: r.error || 'Could not clear it.' });
    await Promise.all([onChanged(), loadThread(task.id)]);
  };

  const remove = async () => {
    const r = await apiJson(`/api/client-projects/${projectId}/tasks/${task.id}`, { method: 'DELETE' });
    if (!r.success) return toast({ message: r.error || 'Could not delete the card.' });
    toast({ message: `${task.key} deleted` });
    onClose();
    await onChanged();
  };
  const deletable = task.source === 'manual' || task.source === 'ai';

  const mine = [...comments].reverse();
  const others = tasks.filter((t) => t.id !== task.id && t.type !== 'defect');

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={form.title || task.title}
      subtitle={
        <>
          <span className="font-mono">{task.key}</span> · {TYPE_LABEL[task.type]}
          {task.sourceRef ? ` · ${task.sourceRef}` : ''}
        </>
      }
      footer={
        <>
          {deletable && (
            <Button variant="danger" icon={<Trash2 />} onClick={() => setConfirmDelete(true)} className="mr-auto" data-testid="cp-drawer-delete">
              Delete card
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty} data-testid="cp-drawer-save">
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="cp-drawer">
        <Field label="Title" htmlFor="cpd-title">
          <Input id="cpd-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
        </Field>
        {task.clientClaimedAt && task.status !== 'done' && (
          <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="cp-drawer-claim">
            <span>
              {task.clientClaimedBy || 'The client'} said this is done ({fmtAt(task.clientClaimedAt)}). It is not Done until you confirm it: check, then set the status to Done.
            </span>
            <button type="button" className="focus-ring rounded-sm underline" onClick={() => void clearClaim()}>
              Not done: clear
            </button>
          </div>
        )}
        {!isDefect && form.ownerSide === 'client' && !form.isGate && !form.clientMayTick && (
          <p className="-mb-2 text-small text-fg-tertiary" data-testid="cp-drawer-claim-note">The client cannot tick this card. They can say “I’ve done this”; it is Done only when you mark it. Keep it that way for signatures, payments and acceptances.</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status" htmlFor="cpd-status" hint={isDefect && form.status === 'done' ? defectStatusLabel({ status: 'done', retestConfirmed: form.retestConfirmed }) : undefined}>
            <Select id="cpd-status" value={form.status} onChange={(e) => set('status', e.target.value)} data-testid="cp-drawer-status">
              {TASK_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {STATUS_LABEL[v]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={isDefect ? 'Fix due' : 'Due date'} htmlFor="cpd-due" hint={task.overdue ? `Overdue by ${task.daysLate} business day(s)` : undefined}>
            <Input id="cpd-due" type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
          {isDefect ? (
            <>
              <Field label="Severity" htmlFor="cpd-sev" hint={`Fix target: ${SEVERITY_FIX_BD[form.severity as keyof typeof SEVERITY_FIX_BD]} business days from the report`}>
                <Select id="cpd-sev" value={form.severity} onChange={(e) => set('severity', e.target.value)} data-testid="cp-drawer-severity">
                  {SEVERITIES.map((v) => (
                    <option key={v} value={v}>
                      {SEVERITY_LABEL[v]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reported by" htmlFor="cpd-rep" hint={task.reportedAt ? `${task.reportedByClient ? 'By the client, ' : ''}${fmtAt(task.reportedAt)}` : undefined}>
                <Input id="cpd-rep" value={form.reportedBy} onChange={(e) => set('reportedBy', e.target.value)} maxLength={80} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Owner" htmlFor="cpd-owner">
                <Select id="cpd-owner" value={form.ownerSide} onChange={(e) => set('ownerSide', e.target.value)}>
                  <option value="us">Us</option>
                  <option value="client">Client</option>
                </Select>
              </Field>
              <Field label="Phase" htmlFor="cpd-phase">
                <Select id="cpd-phase" value={form.phase} onChange={(e) => set('phase', e.target.value)}>
                  {PHASES.map((v) => (
                    <option key={v} value={v}>
                      {PHASE_LABEL[v]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Field label="Deliverable" htmlFor="cpd-ref">
            <Select id="cpd-ref" value={form.deliverableRef} onChange={(e) => set('deliverableRef', e.target.value)}>
              <option value="">None</option>
              {DELIVERABLE_LIST.map(([k, v]) => (
                <option key={k} value={k}>
                  {k} {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Blocked by" htmlFor="cpd-blocked" hint="Unblocks itself when that card is done.">
            <Select id="cpd-blocked" value={form.blockedBy} onChange={(e) => set('blockedBy', e.target.value)} data-testid="cp-drawer-blocked">
              <option value="">Nothing</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.key} {t.title.slice(0, 50)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!isDefect && form.isGate && !(form.autoComplete && form.ownerSide === 'us') && (
          <p className="-mb-2 text-small text-fg-tertiary" data-testid="cp-drawer-manual-note">This milestone is only ever marked Done by hand. Leave it that way for anything external or legal: a notice sent, a signature, a payment, go-live.</p>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox checked={form.clientVisible} onChange={(e) => set('clientVisible', e.target.checked)} label="Show on the client board" />
          {!isDefect && <Checkbox checked={form.isGate} onChange={(e) => set('isGate', e.target.checked)} label="Milestone" />}
          {!isDefect && !form.isGate && form.ownerSide === 'client' && (
            <Checkbox checked={form.clientMayTick} onChange={(e) => set('clientMayTick', e.target.checked)} label="The client can tick this themselves" data-testid="cp-drawer-maytick" />
          )}
          {!isDefect && form.isGate && form.ownerSide === 'us' && (
            <Checkbox checked={form.autoComplete} onChange={(e) => set('autoComplete', e.target.checked)} label="Complete automatically when the phase’s work is done" data-testid="cp-drawer-auto" />
          )}
          {isDefect && <Checkbox checked={form.retestConfirmed} disabled={form.status !== 'done'} onChange={(e) => set('retestConfirmed', e.target.checked)} label="Retest confirmed" />}
        </div>
        {isDefect ? (
          <Field label="Steps to reproduce" htmlFor="cpd-steps" hint="Shown to the client.">
            <Textarea id="cpd-steps" rows={4} value={form.steps} onChange={(e) => set('steps', e.target.value)} maxLength={3000} />
          </Field>
        ) : (
          <Field label="Description for the client" htmlFor="cpd-desc" hint="Shown on the client board.">
            <Textarea id="cpd-desc" rows={3} value={form.descriptionClient} onChange={(e) => set('descriptionClient', e.target.value)} maxLength={2000} />
          </Field>
        )}
        <Field label="Internal notes" htmlFor="cpd-notes" hint="Never shown to the client.">
          <Textarea id="cpd-notes" rows={3} value={form.notesInternal} onChange={(e) => set('notesInternal', e.target.value)} maxLength={4000} />
        </Field>
        <Field label="Evidence links" htmlFor="cpd-evidence" hint="One https:// link per line. Internal.">
          <Textarea id="cpd-evidence" rows={2} value={form.evidence} onChange={(e) => set('evidence', e.target.value)} />
        </Field>

        <section aria-label="Comments" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="text-body-strong text-fg">Comments</h3>
          {commentsBefore && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => void older('comments')}>
                Load older comments
              </Button>
            </div>
          )}
          {mine.length === 0 && <p className="text-small text-fg-tertiary">No comments yet.</p>}
          {mine.map((c) => (
            <div key={c.id} className="rounded-md bg-subtle px-3 py-2">
              <p className="flex flex-wrap items-center gap-2 text-caption text-fg-secondary">
                <span className="font-medium text-fg">{actorLabel(c.author)}</span>
                {c.author.startsWith('client:') && <Badge tone="neutral">Client</Badge>}
                {fmtAt(c.at)}
                {!c.clientVisible && <Badge tone="neutral">Internal</Badge>}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg">{c.body}</p>
            </div>
          ))}
          <Textarea aria-label="Add a comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Add a comment" />
          <div className="flex items-center justify-between gap-3">
            <Checkbox checked={commentVisible} onChange={(e) => setCommentVisible(e.target.checked)} label="Visible to the client" />
            <Button variant="secondary" size="sm" onClick={() => void post()} loading={posting} disabled={!comment.trim()}>
              Add comment
            </Button>
          </div>
        </section>

        <section aria-label="History" className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-body-strong text-fg">History</h3>
          {history.length === 0 && <p className="text-small text-fg-tertiary">No changes yet.</p>}
          <ul className="flex flex-col gap-1.5">
            {history.map((e) => (
              <li key={e.id} className="text-small text-fg-secondary">
                <span className="tabular-nums text-fg-tertiary">{fmtAt(e.at)}</span> · {actorLabel(e.actor)} · {eventText(e)}
              </li>
            ))}
          </ul>
          {historyBefore && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => void older('events')}>
                Load older history
              </Button>
            </div>
          )}
          <p className="text-caption text-fg-tertiary">
            Created {fmtAt(task.createdAt)}
            {task.doneAt ? ` · Done ${fmtAt(task.doneAt)}${task.doneBy ? ` by ${actorLabel(task.doneBy)}` : ''}` : ''}
            {task.dueDate ? ` · Due ${fmtDateLong(task.dueDate)}` : ''}
          </p>
        </section>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${task.key}?`}
        description="The card and its comments are removed. The activity log keeps a record that it was deleted. This can’t be undone."
        confirmLabel="Delete card"
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
      />
    </Drawer>
  );
}
