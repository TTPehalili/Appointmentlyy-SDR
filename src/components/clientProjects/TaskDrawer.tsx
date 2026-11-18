'use client';

/**
 * The card drawer: everything a card does not show. Edit (one manual Save, no autosave, the checklist
 * included), attachments (each upload is its own action), comments with @mentions, and the history.
 */
import * as React from 'react';
import { Download, Eye, EyeOff, FileText, Lock, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Checkbox, ConfirmDialog, Drawer, Field, IconButton, Input, Select, Textarea, useToast } from '@/components/ui';
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
  PRIORITIES,
  PRIORITY_LABEL,
  CP_LIMITS,
  checklistProgress,
  type ChecklistItem,
  type CpComment,
  type CpEvent,
  type CpFileMeta,
  type OwnerProjectView,
  type OwnerTaskView,
} from '@/lib/clientProjects/types';
import { actorLabel, eventText } from '@/components/clientProjects/eventText';
import { AssigneeBadge, LabelChip, PriorityMark } from '@/components/clientProjects/shared';
import { Picker, StatusSegments } from '@/components/clientProjects/Picker';

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
  assigneeId: string;
  priority: string;
  startDate: string;
  estimate: string;
  labelIds: string[];
  watchers: string[];
  blockers: string[];
  checklist: ChecklistItem[];
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
  assigneeId: t.assigneeId ?? '',
  priority: t.priority ?? '',
  startDate: t.startDate ?? '',
  estimate: t.estimateHours === null || t.estimateHours === undefined ? '' : String(t.estimateHours),
  labelIds: t.labelIds ?? [],
  watchers: t.watchers ?? [],
  blockers: t.blockers ?? [],
  checklist: t.checklist ?? [],
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function TaskDrawer({
  projectId,
  project,
  task,
  tasks,
  attachments,
  onClose,
  onChanged,
}: {
  projectId: string;
  project: OwnerProjectView;
  task: OwnerTaskView | null;
  tasks: OwnerTaskView[];
  attachments: CpFileMeta[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [forceDone, setForceDone] = React.useState<string[] | null>(null);
  const [newItem, setNewItem] = React.useState('');
  const [blockQuery, setBlockQuery] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
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
    setNewItem('');
    setBlockQuery('');
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
  const dirty = (Object.keys(base) as (keyof Form)[]).some((k) => !same(base[k], form[k]));

  const save = async (override = false) => {
    const body: Record<string, unknown> = {};
    const changed = (k: keyof Form) => !same(base[k], form[k]);
    if (changed('assigneeId')) body.assigneeId = form.assigneeId || null;
    if (changed('priority')) body.priority = form.priority || null;
    if (changed('startDate')) body.startDate = form.startDate || null;
    if (changed('estimate')) body.estimateHours = form.estimate === '' ? null : Number(form.estimate);
    if (changed('labelIds')) body.labelIds = form.labelIds;
    if (changed('watchers')) body.watchers = form.watchers;
    if (changed('blockers')) body.blockers = form.blockers;
    if (changed('checklist')) body.checklist = form.checklist;
    if (override) body.override = true;
    if (changed('title')) body.title = form.title;
    if (changed('status')) body.status = form.status;
    if (changed('phase')) body.phase = form.phase;
    if (changed('dueDate')) body.dueDate = form.dueDate || null;
    if (changed('deliverableRef')) body.deliverableRef = form.deliverableRef;
    if (changed('clientVisible')) body.clientVisible = form.clientVisible;
    if (changed('descriptionClient')) body.descriptionClient = form.descriptionClient;
    if (changed('notesInternal')) body.notesInternal = form.notesInternal;
    if (changed('evidence')) body.evidence = form.evidence.split('\n').map((x) => x.trim()).filter(Boolean);
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
    const r = await apiJson<{ task: OwnerTaskView; code?: string; blockers?: string[] }>(`/api/client-projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', body });
    setSaving(false);
    if (!r.success && r.code === 'blockers_open') return setForceDone(r.blockers ?? []);
    if (!r.success) return toast({ message: r.error || 'Could not save the card.' });
    setForm(formOf(r.task));
    toast({ message: `${task.key} saved` });
    await Promise.all([onChanged(), loadThread(task.id)]);
  };

  const post = async () => {
    setPosting(true);
    const r = await apiJson(`/api/client-projects/${projectId}/tasks/${task.id}`, { body: { comment, clientVisible: commentVisible && task.clientVisible } });
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
  const people = project.people ?? [];
  const labels = project.labels ?? [];
  const myFiles = attachments.filter((f) => f.taskId === task.id);
  const cl = checklistProgress(form.checklist);
  const toggle = (k: 'labelIds' | 'watchers' | 'blockers', id: string) => set(k, form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id]);
  // @mention suggestions: the word being typed after "@".
  const at = /(?:^|\s)@([\w.-]{0,30})$/.exec(comment);
  const suggestions = at ? people.filter((x) => x.name.toLowerCase().startsWith(at[1].toLowerCase()) || x.name.toLowerCase().includes(` ${at[1].toLowerCase()}`)).slice(0, 5) : [];
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const res = await fetch(`/api/client-projects/${projectId}/tasks/${task.id}/attachments`, { method: 'POST', headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' }, body: file });
      const d = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      toast({ message: res.ok && d.success ? `${file.name} attached (hidden from the client)` : d.error || `Could not attach ${file.name}.` });
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    await Promise.all([onChanged(), loadThread(task.id)]);
  };
  const fileAct = async (f: CpFileMeta, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
    const r = await apiJson(`/api/client-projects/${projectId}/tasks/${task.id}/attachments?fileId=${f.id}`, { method, body });
    if (!r.success) return toast({ message: r.error || 'That did not work.' });
    await onChanged();
  };

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
          {dirty && <span className="mr-2 text-caption text-fg-tertiary">Unsaved changes</span>}
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
        <div className="flex flex-col gap-1.5">
          <span className="text-body-strong text-fg">Status</span>
          <StatusSegments value={form.status} onChange={(v) => set('status', v)} testId="cp-drawer-status" />
          {isDefect && form.status === 'done' && <span className="text-caption text-fg-tertiary">{defectStatusLabel({ status: 'done', retestConfirmed: form.retestConfirmed })}</span>}
        </div>
        <div className="grid grid-cols-2 gap-4">
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
                <Picker id="cpd-owner" label="Owner" value={form.ownerSide} onChange={(v) => set('ownerSide', v)} options={[{ value: 'us', label: 'Us' }, { value: 'client', label: 'Client' }]} testId="cp-drawer-owner" />
              </Field>
              <Field label="Phase" htmlFor="cpd-phase">
                <Picker id="cpd-phase" label="Phase" value={form.phase} onChange={(v) => set('phase', v)} options={PHASES.map((v) => ({ value: v, label: PHASE_LABEL[v] }))} testId="cp-drawer-phase" />
              </Field>
            </>
          )}
          <Field label="Deliverable" htmlFor="cpd-ref">
            <Picker id="cpd-ref" label="Deliverable" value={form.deliverableRef} onChange={(v) => set('deliverableRef', v)} options={[{ value: '', label: 'None' }, ...DELIVERABLE_LIST.map(([k, v]) => ({ value: k, label: `${k} ${v}` }))]} testId="cp-drawer-deliverable" />
          </Field>
          <Field label="Assignee" htmlFor="cpd-assignee" hint={!isDefect ? 'The card’s Us or Client side follows the assignee.' : undefined}>
            <Picker
              id="cpd-assignee"
              label="Assignee"
              value={form.assigneeId}
              onChange={(v) => set('assigneeId', v)}
              placeholder="Nobody"
              testId="cp-drawer-assignee"
              options={[
                { value: '', label: 'Nobody', icon: <AssigneeBadge person={null} /> },
                ...people.filter((x) => !isDefect || x.side === 'us').map((x) => ({ value: x.id, label: `${x.name}${x.side === 'client' ? ' (client)' : ''}`, icon: <AssigneeBadge person={x} /> })),
              ]}
            />
          </Field>
          <Field label="Priority" htmlFor="cpd-priority">
            <Picker
              id="cpd-priority"
              label="Priority"
              value={form.priority}
              onChange={(v) => set('priority', v)}
              testId="cp-drawer-priority"
              options={[{ value: '', label: 'None' }, ...PRIORITIES.map((v) => ({ value: v, label: PRIORITY_LABEL[v], icon: <PriorityMark priority={v} /> }))]}
            />
          </Field>
          <Field label="Start date" htmlFor="cpd-start">
            <Input id="cpd-start" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} data-testid="cp-drawer-start" />
          </Field>
          <Field label="Estimate (hours)" htmlFor="cpd-est">
            <Input id="cpd-est" type="number" min={0} max={CP_LIMITS.estimateMax} step="0.5" value={form.estimate} onChange={(e) => set('estimate', e.target.value)} data-testid="cp-drawer-estimate" />
          </Field>
        </div>

        {labels.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-body-strong text-fg">Labels</legend>
            <div className="flex flex-wrap gap-1.5" data-testid="cp-drawer-labels">
              {labels.map((l) => (
                <button key={l.id} type="button" aria-pressed={form.labelIds.includes(l.id)} onClick={() => toggle('labelIds', l.id)} className={`focus-ring rounded-md ${form.labelIds.includes(l.id) ? 'ring-2 ring-fg/60' : 'opacity-60'}`}>
                  <LabelChip label={l} />
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {people.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-body-strong text-fg">Watchers</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5" data-testid="cp-drawer-watchers">
              {people.map((x) => (
                <Checkbox key={x.id} checked={form.watchers.includes(x.id)} onChange={() => toggle('watchers', x.id)} label={`${x.name}${x.side === 'client' ? ' (client)' : ''}`} />
              ))}
            </div>
          </fieldset>
        )}

        <section aria-label="Checklist" className="flex flex-col gap-2" data-testid="cp-drawer-checklist">
          <div className="flex items-baseline justify-between">
            <h3 className="text-body-strong text-fg">Checklist</h3>
            <span className="cp-mono text-caption text-fg-tertiary">
              {cl.done}/{cl.total}
            </span>
          </div>
          {cl.total > 0 && (
            <div className="cp-track">
              <span className="fill" style={{ width: `${(cl.done / cl.total) * 100}%` }} />
            </div>
          )}
          <ul className="flex flex-col">
            {form.checklist.map((item, i) => (
              <li key={item.id} className="flex min-h-8 items-center gap-2">
                <Checkbox checked={item.done} onChange={(e) => set('checklist', form.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} aria-label={item.text} />
                <span className={`flex-1 text-body ${item.done ? 'text-fg-tertiary line-through' : 'text-fg'}`}>{item.text}</span>
                <IconButton label={`Remove ${item.text}`} size="sm" variant="ghost" onClick={() => set('checklist', form.checklist.filter((_, j) => j !== i))}>
                  <X className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
          {form.checklist.length < CP_LIMITS.checklistItems && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newItem.trim()) return;
                set('checklist', [...form.checklist, { id: `new-${Date.now()}`, text: newItem.trim(), done: false }]);
                setNewItem('');
              }}
            >
              <Input aria-label="New checklist item" placeholder="Add an item" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={CP_LIMITS.checklistText} data-testid="cp-drawer-checklist-input" />
              <Button type="submit" variant="secondary" icon={<Plus />} disabled={!newItem.trim()}>
                Add
              </Button>
            </form>
          )}
        </section>

        <section aria-label="Blocked by" className="flex flex-col gap-2">
          <h3 className="text-body-strong text-fg">Blocked by</h3>
          <p className="-mt-1 text-small text-fg-tertiary">The cards this one waits on. Moving it to Done while one is open asks you first.</p>
          {form.blockers.length > 0 && (
            <ul className="flex flex-col gap-1" data-testid="cp-drawer-blockers">
              {form.blockers.map((id) => {
                const b = tasks.find((x) => x.id === id);
                return (
                  <li key={id} className="flex items-center gap-2 text-small">
                    <span className="cp-mono text-fg-secondary">{b?.key ?? '?'}</span>
                    <span className="flex-1 truncate text-fg">{b?.title ?? 'Card removed'}</span>
                    <span className="text-fg-tertiary">{b ? STATUS_LABEL[b.status] : ''}</span>
                    <IconButton label={`Stop waiting on ${b?.key ?? 'it'}`} size="sm" variant="ghost" onClick={() => toggle('blockers', id)}>
                      <X className="size-3.5" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
          <Input aria-label="Find a card to wait on" placeholder="Find a card by key or title" value={blockQuery} onChange={(e) => setBlockQuery(e.target.value)} data-testid="cp-drawer-blocked" />
          {blockQuery.trim() && (
            <ul className="max-h-40 overflow-y-auto rounded-md border border-line">
              {others
                .filter((t) => !form.blockers.includes(t.id) && `${t.key} ${t.title}`.toLowerCase().includes(blockQuery.trim().toLowerCase()))
                .slice(0, 8)
                .map((t) => (
                  <li key={t.id}>
                    <button type="button" className="focus-ring flex w-full gap-2 px-3 py-1.5 text-left text-small hover:bg-subtle" onClick={() => (toggle('blockers', t.id), setBlockQuery(''))}>
                      <span className="cp-mono text-fg-secondary">{t.key}</span>
                      <span className="truncate text-fg">{t.title}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
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
        <div className="cp-internal">
          <Field label={<span className="inline-flex items-center gap-1.5">Internal notes <Badge tone="warning"><Lock className="mr-1 inline size-3" aria-hidden />Internal only</Badge></span> as unknown as string} htmlFor="cpd-notes" hint="Never shown to the client.">
            <Textarea id="cpd-notes" rows={3} value={form.notesInternal} onChange={(e) => set('notesInternal', e.target.value)} maxLength={4000} />
          </Field>
        </div>
        <Field label="Evidence links" htmlFor="cpd-evidence" hint="One https:// link per line. Internal.">
          <Textarea id="cpd-evidence" rows={2} value={form.evidence} onChange={(e) => set('evidence', e.target.value)} />
        </Field>

        <section aria-label="Attachments" className="flex flex-col gap-2 border-t border-line pt-4" data-testid="cp-drawer-attachments">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-body-strong text-fg">Attachments</h3>
            <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" multiple className="sr-only" aria-label="Attach files" data-testid="cp-attach-input" onChange={(e) => void upload(e.target.files)} />
            <Button variant="secondary" size="sm" icon={<Paperclip />} loading={uploading} onClick={() => fileInput.current?.click()} disabled={myFiles.length >= CP_LIMITS.attachmentsPerTask}>
              Attach
            </Button>
          </div>
          <p className="-mt-1 text-small text-fg-tertiary">PDF, PNG or JPG, up to {Math.floor(CP_LIMITS.fileBytes / 1024 / 1024)} MB. New files are internal; switch one to Client to let the client download it from the board.</p>
          {myFiles.length === 0 ? (
            <p className="text-small text-fg-tertiary">No attachments.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {myFiles.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2" data-testid="cp-attachment" data-visible={f.clientVisible ? '1' : '0'}>
                  <FileText className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
                  <a className="focus-ring min-w-0 flex-1 truncate rounded-sm text-small text-fg underline-offset-2 hover:underline" href={`/api/client-projects/${projectId}/tasks/${task.id}/attachments?fileId=${f.id}`} target="_blank" rel="noopener noreferrer">
                    {f.name}
                  </a>
                  <span className="cp-mono text-caption text-fg-tertiary">{(f.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => void fileAct(f, 'PATCH', { clientVisible: !f.clientVisible })} className="focus-ring inline-flex items-center gap-1 rounded-sm text-caption" data-testid="cp-attachment-visibility" aria-label={f.clientVisible ? `${f.name}: visible to the client. Make internal` : `${f.name}: internal. Show to the client`}>
                    {f.clientVisible ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                    <Badge tone={f.clientVisible ? 'brand' : 'neutral'}>{f.clientVisible ? 'Client' : 'Internal'}</Badge>
                  </button>
                  <a className="focus-ring rounded-sm text-fg-tertiary hover:text-fg" href={`/api/client-projects/${projectId}/tasks/${task.id}/attachments?fileId=${f.id}&download=1`} aria-label={`Download ${f.name}`}>
                    <Download className="size-3.5" />
                  </a>
                  <IconButton label={`Remove ${f.name}`} size="sm" variant="ghost" onClick={() => void fileAct(f, 'DELETE')}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

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
              <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg">
                {c.body.split(/(@[\w.-]+(?: [A-Z][\w.-]+)?)/g).map((part, i) => (part.startsWith('@') && people.some((x) => part.slice(1).toLowerCase().startsWith(x.name.split(' ')[0].toLowerCase())) ? <span key={i} className="font-medium text-brand-text">{part}</span> : <React.Fragment key={i}>{part}</React.Fragment>))}
              </p>
            </div>
          ))}
          <Textarea aria-label="Add a comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Add a comment. Type @ to mention someone." data-testid="cp-drawer-comment" />
          {suggestions.length > 0 && (
            <div className="-mt-1 flex flex-wrap gap-1.5" data-testid="cp-mention-suggest">
              {suggestions.map((x) => (
                <Button key={x.id} size="sm" variant="secondary" onClick={() => setComment(comment.replace(/@([\w.-]{0,30})$/, `@${x.name} `))}>
                  @{x.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {task.clientVisible ? (
              <Checkbox checked={commentVisible} onChange={(e) => setCommentVisible(e.target.checked)} label="Visible to the client" data-testid="cp-comment-visible" />
            ) : (
              <span className="text-caption text-fg-tertiary" data-testid="cp-comment-internal-only">
                Internal: this card is hidden from the client
              </span>
            )}
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
        open={forceDone !== null}
        onClose={() => setForceDone(null)}
        title={`${task.key} is still blocked`}
        description={`It waits on ${(forceDone ?? []).join(', ')}, which ${(forceDone ?? []).length === 1 ? 'is' : 'are'} not done. Save it as Done anyway? This is recorded in the activity log.`}
        confirmLabel="Save as Done anyway"
        onConfirm={() => {
          setForceDone(null);
          void save(true);
        }}
      />
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
