'use client';

/**
 * Platform Console › Client Projects › one project. Progress on top, then the board (by phase or
 * by deliverable) or the list, the activity log, the Client Delay log, Documents & AI, Automations.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Download, Plus, Share2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  InlineError,
  Input,
  Menu,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
  type Column,
} from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { copyText } from '@/components/agreements/ownerShared';
import {
  DELIVERABLE_LIST,
  PHASES,
  PHASE_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  SEVERITIES,
  SEVERITY_FIX_BD,
  SEVERITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  TASK_TYPES,
  TYPE_LABEL,
  fmtAt,
  fmtDateLong,
  type CpEvent,
  type DelayRow,
  type OwnerProjectView,
  type OwnerTaskView,
} from '@/lib/clientProjects/types';
import { DueText, Note, OwnerGate, ProgressBar, SeverityChip, SideChip, StatusChip, TaskCard, type ProjectResponse } from '@/components/clientProjects/shared';
import { TaskDrawer } from '@/components/clientProjects/TaskDrawer';
import { AiPanel } from '@/components/clientProjects/AiPanel';
import { AutomationsPanel } from '@/components/clientProjects/AutomationsPanel';
import { actorLabel, eventText } from '@/components/clientProjects/eventText';

const TABS = ['board', 'activity', 'delays', 'ai', 'automations'] as const;
type Tab = (typeof TABS)[number];

export function ProjectDetail({ id, initialTab }: { id: string; initialTab?: string }) {
  return (
    <OwnerGate>
      <Detail id={id} initialTab={(TABS as readonly string[]).includes(initialTab ?? '') ? (initialTab as Tab) : 'board'} />
    </OwnerGate>
  );
}

function Detail({ id, initialTab }: { id: string; initialTab: Tab }) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = React.useState<ProjectResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    const r = await apiJson<ProjectResponse>(`/api/client-projects/${id}`);
    if (!r.success) return setError(r.error || 'Could not load the project.');
    setError(null);
    setData(r);
  }, [id]);
  React.useEffect(() => {
    void load();
    // Client ticks, comments and defect reports show up without a reload.
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 20_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (error && !data) {
    return (
      <div className="px-4 py-6 md:px-8">
        <InlineError message={error} onRetry={load} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3 px-4 py-6 md:px-8">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  const { project: p, tasks } = data;
  const openTask = tasks.find((t) => t.id === openId) ?? null;
  const setStatus = async (status: string) => {
    const r = await apiJson(`/api/client-projects/${id}`, { method: 'PATCH', body: { status } });
    toast({ message: r.success ? `Project is now ${PROJECT_STATUS_LABEL[status as keyof typeof PROJECT_STATUS_LABEL].toLowerCase()}` : r.error || 'Could not change the status.' });
    void load();
  };
  const remove = async () => {
    const r = await apiJson(`/api/client-projects/${id}`, { method: 'DELETE' });
    if (!r.success) return toast({ message: r.error || 'Could not delete the project.' });
    router.push('/platform/client-projects');
  };

  return (
    <div className="flex flex-col px-4 py-6 md:px-8" data-testid="cp-detail">
      <Link href="/platform/client-projects" className="focus-ring mb-2 inline-flex w-fit items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Client Projects
      </Link>
      <PageHeader
        title={p.clientName}
        description={`${p.key} · Kickoff ${fmtDateLong(p.kickoffDate)} · Go-live ${fmtDateLong(p.targetGoLive)}`}
        meta={p.status !== 'active' ? <Badge tone="neutral">{PROJECT_STATUS_LABEL[p.status]}</Badge> : undefined}
        secondaryActions={
          <>
            <Button variant="secondary" icon={<Share2 />} onClick={() => setSharing(true)} data-testid="cp-share">
              {p.hasLink ? 'Board shared' : 'Share board'}
            </Button>
            <Button variant="secondary" icon={<Download />} onClick={() => setExporting(true)} data-testid="cp-export">
              Export progress
            </Button>
            <Menu
              items={[
                { label: 'Edit project', onSelect: () => setEditing(true) },
                'divider',
                ...PROJECT_STATUSES.filter((s) => s !== p.status).map((s) => ({ label: `Mark ${PROJECT_STATUS_LABEL[s].toLowerCase()}`, onSelect: () => void setStatus(s) })),
                ...(p.status === 'draft' ? (['divider', { label: 'Delete draft', danger: true, onSelect: () => setDeleting(true) }] as const) : []),
              ]}
            />
          </>
        }
        primaryAction={
          <Button variant="brand" icon={<Plus />} onClick={() => setAdding(true)} data-testid="cp-add">
            Add card
          </Button>
        }
        className="pb-4"
      />

      <div className="mb-5">
        <ProgressBar progress={p.progress} label="Project progress" />
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-small text-fg-secondary" data-testid="cp-progress-text">
          <span className="tabular-nums">
            {p.progress.done} of {p.progress.total} done
          </span>
          {p.overdueCount > 0 && <span className="font-medium text-danger-fg">{p.overdueCount} overdue</span>}
          {p.clientOverdueCount > 0 && <span>{p.clientOverdueCount} waiting on the client</span>}
          {p.openDefects > 0 && <span>{p.openDefects} open defects</span>}
          {p.uatOpen && <span>UAT open</span>}
        </p>
      </div>

      <div className="-mx-4 mb-5 shrink-0 overflow-x-auto overflow-y-hidden px-4 md:mx-0 md:px-0" data-testid="cp-tabs">
      <Tabs
        className="min-w-max [&>button]:shrink-0 [&>button]:whitespace-nowrap"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { value: 'board', label: 'Board' },
          { value: 'activity', label: 'Activity' },
          { value: 'delays', label: 'Client delays', count: data.delays.length || undefined },
          { value: 'ai', label: 'Documents & AI' },
          { value: 'automations', label: 'Automations' },
        ]}
      />
      </div>
      {error && <InlineError message={error} onRetry={load} className="mb-4" />}

      {tab === 'board' && <BoardTab tasks={tasks} onOpen={(t) => setOpenId(t.id)} />}
      {tab === 'activity' && <ActivityTab key={data.events[0]?.id ?? 'none'} projectId={id} first={data.events} firstBefore={data.eventsBefore} />}
      {tab === 'delays' && <DelaysTab delays={data.delays} onOpen={(taskId) => setOpenId(taskId)} />}
      {tab === 'ai' && <AiPanel project={p} onChanged={load} />}
      {tab === 'automations' && <AutomationsPanel project={p} events={data.automationEvents} counts={data.automationCounts} mail={data.mail} onChanged={load} />}

      <TaskDrawer projectId={id} task={openTask} tasks={tasks} onClose={() => setOpenId(null)} onChanged={load} />
      <AddCardDialog open={adding} onClose={() => setAdding(false)} projectId={id} onCreated={load} />
      <ShareDialog open={sharing} onClose={() => setSharing(false)} project={p} onChanged={load} />
      <EditProjectDialog open={editing} onClose={() => setEditing(false)} project={p} onChanged={load} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} projectId={id} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this draft?"
        description={`“${p.title}” and its cards will be removed. This can’t be undone.`}
        confirmLabel="Delete draft"
        onConfirm={() => {
          setDeleting(false);
          void remove();
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ board + list

function Column_({ title, tasks, onOpen }: { title: string; tasks: OwnerTaskView[]; onOpen: (t: OwnerTaskView) => void }) {
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <section aria-label={title} className="flex min-w-0 flex-col rounded-lg bg-subtle" data-testid="cp-column">
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h3 className="truncate text-body-strong text-fg">{title}</h3>
        <span className="shrink-0 text-caption tabular-nums text-fg-tertiary">
          {done}/{tasks.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 px-2 pb-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onOpen={onOpen} />
        ))}
        {tasks.length === 0 && <p className="px-1 pb-2 text-small text-fg-tertiary">No cards.</p>}
      </div>
    </section>
  );
}

const bySchedule = (a: OwnerTaskView, b: OwnerTaskView) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.sort - b.sort;

function BoardTab({ tasks, onOpen }: { tasks: OwnerTaskView[]; onOpen: (t: OwnerTaskView) => void }) {
  const [view, setView] = React.useState('board');
  const [group, setGroup] = React.useState('phase');
  const [fStatus, setFStatus] = React.useState('');
  const [fType, setFType] = React.useState('');
  const [fOwner, setFOwner] = React.useState('');
  const [fOverdue, setFOverdue] = React.useState(false);
  const [sort, setSort] = React.useState('due_asc');

  const road = tasks.filter((t) => t.type !== 'defect');
  const defects = tasks.filter((t) => t.type === 'defect').sort(bySchedule);
  const columns =
    group === 'phase'
      ? [...PHASES.map((ph) => ({ title: PHASE_LABEL[ph], tasks: road.filter((t) => t.phase === ph).sort(bySchedule) })), ...(defects.length ? [{ title: 'UAT defects', tasks: defects }] : [])]
      : [
          ...DELIVERABLE_LIST.map(([ref, name]) => ({ title: `${ref} ${name}`, tasks: tasks.filter((t) => t.deliverableRef === ref).sort(bySchedule) })),
          { title: 'General', tasks: tasks.filter((t) => !t.deliverableRef).sort(bySchedule) },
        ].filter((c) => c.tasks.length);

  const rows = tasks
    .filter((t) => (!fStatus || t.status === fStatus) && (!fType || t.type === fType) && (!fOwner || t.ownerSide === fOwner) && (!fOverdue || t.overdue))
    .sort((a, b) => (sort === 'key' ? a.num - b.num : sort === 'due_desc' ? (b.dueDate ?? '').localeCompare(a.dueDate ?? '') || a.num - b.num : bySchedule(a, b)));
  const listColumns: Column<OwnerTaskView>[] = [
    { key: 'key', header: 'Key', width: 'w-24', cell: (t) => <span className="whitespace-nowrap font-mono text-small text-fg-secondary">{t.key}</span> },
    { key: 'title', header: 'Title', cell: (t) => <span className="line-clamp-1 min-w-48 text-body text-fg">{t.title}</span> },
    { key: 'type', header: 'Type', cell: (t) => <span className="whitespace-nowrap text-small text-fg-secondary">{TYPE_LABEL[t.type]}</span> },
    { key: 'owner', header: 'Owner', cell: (t) => <SideChip side={t.ownerSide} /> },
    { key: 'status', header: 'Status', cell: (t) => <StatusChip status={t.status} /> },
    { key: 'due', header: 'Due', cell: (t) => <DueText date={t.dueDate} overdue={t.overdue} done={t.status === 'done'} /> },
    { key: 'severity', header: 'Severity', cell: (t) => (t.type === 'defect' ? <SeverityChip severity={t.severity} /> : <span className="text-fg-tertiary">-</span>) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="View" size="sm" value={view} onChange={setView} items={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} />
        {view === 'board' ? (
          <div className="flex items-center gap-2">
            <span className="text-small text-fg-secondary">Group by</span>
            <SegmentedControl label="Group by" size="sm" value={group} onChange={setGroup} items={[{ value: 'phase', label: 'Phase' }, { value: 'deliverable', label: 'Deliverable' }]} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 [&>div]:w-40" data-testid="cp-list-filters">
            <Select aria-label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-8">
              <option value="">All statuses</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select aria-label="Type" value={fType} onChange={(e) => setFType(e.target.value)} className="h-8">
              <option value="">All types</option>
              {TASK_TYPES.map((s) => (
                <option key={s} value={s}>
                  {TYPE_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select aria-label="Owner" value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="h-8">
              <option value="">Us and client</option>
              <option value="us">Us</option>
              <option value="client">Client</option>
            </Select>
            <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="h-8">
              <option value="due_asc">Due: soonest first</option>
              <option value="due_desc">Due: latest first</option>
              <option value="key">Key</option>
            </Select>
            <Checkbox checked={fOverdue} onChange={(e) => setFOverdue(e.target.checked)} label="Overdue only" />
            <span className="text-small tabular-nums text-fg-tertiary" data-testid="cp-list-count">
              {rows.length} of {tasks.length}
            </span>
          </div>
        )}
      </div>

      {view === 'board' ? (
        tasks.length === 0 ? (
          <EmptyState icon={<Plus />} title="No cards yet" description="Add a card, or upload the signed documents under Documents & AI." />
        ) : (
          <div
            className={group === 'phase' ? 'grid gap-3 md:grid-cols-2 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none' : '-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 max-md:flex-col md:-mx-8 md:px-8 [&>section]:md:w-[272px] [&>section]:md:shrink-0'}
            data-testid="cp-board"
            data-group={group}
          >
            {columns.map((c) => (
              <Column_ key={c.title} title={c.title} tasks={c.tasks} onOpen={onOpen} />
            ))}
          </div>
        )
      ) : (
        <Card className="overflow-hidden">
          <DataTable label="Cards" density="compact" columns={listColumns} rows={rows} rowKey={(t) => t.id} onRowClick={onOpen} empty={<EmptyState icon={<Plus />} title="No cards match" description="Change the filters to see more." className="py-10" />} />
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ activity + delays

/** The activity log, newest first, a page at a time: "Load older" walks back to the very first entry. */
function ActivityTab({ projectId, first, firstBefore }: { projectId: string; first: CpEvent[]; firstBefore: string | null }) {
  const [older, setOlder] = React.useState<CpEvent[]>([]);
  const [before, setBefore] = React.useState<string | null>(firstBefore);
  const [busy, setBusy] = React.useState(false);
  const more = async () => {
    if (!before) return;
    setBusy(true);
    const r = await apiJson<{ events: CpEvent[]; nextBefore: string | null }>(`/api/client-projects/${projectId}/events?limit=100&before=${encodeURIComponent(before)}`);
    setBusy(false);
    if (!r.success) return;
    setOlder((o) => [...o, ...r.events]);
    setBefore(r.nextBefore);
  };
  const events = [...first, ...older];
  if (!events.length) return <EmptyState icon={<Plus />} title="No activity yet" />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface" data-testid="cp-activity">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-small">
            <span className="w-28 shrink-0 tabular-nums text-fg-tertiary">{fmtAt(e.at)}</span>
            <span className="min-w-0 flex-1 break-words text-fg">{eventText(e)}</span>
            <span className="text-fg-tertiary">{actorLabel(e.actor)}</span>
          </li>
        ))}
      </ul>
      {before ? (
        <div>
          <Button variant="secondary" size="sm" loading={busy} onClick={() => void more()} data-testid="cp-activity-more">
            Load older
          </Button>
        </div>
      ) : (
        <p className="text-caption text-fg-tertiary" data-testid="cp-activity-end">
          That is the whole log ({events.length} entries).
        </p>
      )}
    </div>
  );
}

function DelaysTab({ delays, onOpen }: { delays: DelayRow[]; onOpen: (taskId: string) => void }) {
  const total = delays.reduce((n, d) => n + d.days, 0);
  const columns: Column<DelayRow>[] = [
    { key: 'key', header: 'Key', width: 'w-24', cell: (d) => <span className="whitespace-nowrap font-mono text-small text-fg-secondary">{d.key}</span> },
    { key: 'title', header: 'Client item', cell: (d) => <span className="line-clamp-1 min-w-48 text-body text-fg">{d.title}</span> },
    { key: 'due', header: 'Was due', cell: (d) => <span className="whitespace-nowrap text-small text-fg-secondary">{fmtDateLong(d.dueDate)}</span> },
    { key: 'state', header: 'State', cell: (d) => (d.state === 'open' ? <Badge tone="danger">Still open</Badge> : <Badge tone="warning">Done late</Badge>) },
    { key: 'days', header: 'Business days late', align: 'right', cell: (d) => <span className="tabular-nums">{d.days}</span> },
    { key: 'logged', header: 'First recorded', cell: (d) => <span className="whitespace-nowrap text-small text-fg-secondary">{fmtAt(d.firstLoggedAt)}</span> },
  ];
  return (
    <div className="flex flex-col gap-3" data-testid="cp-delays">
      <p className="text-small text-fg-secondary">
        Worked out from the board, never typed: client items open past their due date, or finished late. Each is recorded once, with a timestamp, in the activity log.
        {delays.length > 0 && <span className="ml-1 font-medium text-fg">Total: {total} business day(s) across {delays.length} item(s).</span>}
      </p>
      <Card className="overflow-hidden">
        <DataTable label="Client delays" density="compact" columns={columns} rows={delays} rowKey={(d) => d.taskId} onRowClick={(d) => onOpen(d.taskId)} empty={<EmptyState icon={<Plus />} title="No client delays" description="Every client item is on time." className="py-10" />} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

function AddCardDialog({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId: string; onCreated: () => Promise<void> | void }) {
  const toast = useToast();
  const [type, setType] = React.useState('task');
  const [title, setTitle] = React.useState('');
  const [phase, setPhase] = React.useState('week_1');
  const [dueDate, setDueDate] = React.useState('');
  const [ownerSide, setOwnerSide] = React.useState('us');
  const [severity, setSeverity] = React.useState('S3');
  const [steps, setSteps] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setType('task');
    setTitle('');
    setDueDate('');
    setOwnerSide('us');
    setSeverity('S3');
    setSteps('');
  }, [open]);
  const defect = type === 'defect';
  const submit = async () => {
    setBusy(true);
    const body = defect ? { type, title, severity, steps } : { type, title, phase, ownerSide, ...(dueDate ? { dueDate } : {}) };
    const r = await apiJson<{ task: OwnerTaskView }>(`/api/client-projects/${projectId}/tasks`, { body });
    setBusy(false);
    if (!r.success) return toast({ message: r.error || 'Could not add the card.' });
    toast({ message: `${r.task.key} added` });
    onClose();
    await onCreated();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add card"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => void submit()} loading={busy} disabled={!title.trim()} data-testid="cp-add-submit">
            Add card
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl label="Type" value={type} onChange={setType} items={[{ value: 'task', label: 'Task' }, { value: 'milestone', label: 'Milestone' }, { value: 'defect', label: 'Defect' }]} />
        <Field label="Title" htmlFor="cpa-title">
          <Input id="cpa-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        </Field>
        {defect ? (
          <>
            <Field label="Severity" htmlFor="cpa-sev" hint={`Fix due in ${SEVERITY_FIX_BD[severity as keyof typeof SEVERITY_FIX_BD]} business days from now.`}>
              <Select id="cpa-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Steps to reproduce" htmlFor="cpa-steps">
              <Textarea id="cpa-steps" rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={3000} />
            </Field>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner" htmlFor="cpa-owner">
              <Select id="cpa-owner" value={ownerSide} onChange={(e) => setOwnerSide(e.target.value)}>
                <option value="us">Us</option>
                <option value="client">Client</option>
              </Select>
            </Field>
            <Field label="Phase" htmlFor="cpa-phase">
              <Select id="cpa-phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
                {PHASES.map((v) => (
                  <option key={v} value={v}>
                    {PHASE_LABEL[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="cpa-due" className="col-span-2">
              <Input id="cpa-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ShareDialog({ open, onClose, project, onChanged }: { open: boolean; onClose: () => void; project: OwnerProjectView; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState('');
  const act = React.useCallback(
    async (action: string, quiet = false) => {
      setBusy(action);
      const r = await apiJson<{ url: string | null }>(`/api/client-projects/${project.id}/share`, { body: { action } });
      setBusy('');
      if (!r.success) return toast({ message: r.error || 'Could not update sharing.' });
      setUrl(r.url);
      if (!quiet) {
        toast({ message: action === 'disable' ? 'Sharing is off. The old link no longer works.' : action === 'reissue' ? 'New link created. The old link no longer works.' : 'The client board is shared.' });
        await onChanged();
      }
    },
    [project.id, toast, onChanged],
  );
  React.useEffect(() => {
    if (open && project.hasLink) void act('link', true);
    if (!open) setUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Share the client board" description="A private link, no login. The client sees progress, ticks their own items and comments. Internal notes, documents and this console are never shown.">
      {project.hasLink ? (
        <div className="flex flex-col gap-4" data-testid="cp-share-on">
          <div className="flex gap-2">
            <Input readOnly aria-label="Board link" value={url ?? ''} mono data-testid="cp-share-url" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="primary" icon={<Copy />} disabled={!url} onClick={async () => toast({ message: url && (await copyText(url)) ? 'Link copied' : 'Select the link and copy it.' })}>
              Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === 'reissue'} onClick={() => void act('reissue')} data-testid="cp-share-reissue">
              New link
            </Button>
            <Button variant="danger" loading={busy === 'disable'} onClick={() => void act('disable')} data-testid="cp-share-off">
              Turn off sharing
            </Button>
          </div>
          <p className="text-small text-fg-tertiary">“New link” and “Turn off sharing” stop the current link working straight away.</p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-fg-secondary">Sharing is off. Nobody outside can see this project.</p>
          <Button variant="brand" loading={busy === 'enable'} onClick={() => void act('enable')} data-testid="cp-share-enable">
            Turn on sharing
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function EditProjectDialog({ open, onClose, project, onChanged }: { open: boolean; onClose: () => void; project: OwnerProjectView; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [f, setF] = React.useState({ clientName: '', title: '', kickoffDate: '', targetGoLive: '', uat: 'auto' });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) setF({ clientName: project.clientName, title: project.title, kickoffDate: project.kickoffDate, targetGoLive: project.targetGoLive ?? '', uat: project.uatOverride === null ? 'auto' : project.uatOverride ? 'open' : 'closed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = async () => {
    setBusy(true);
    const r = await apiJson(`/api/client-projects/${project.id}`, {
      method: 'PATCH',
      body: { clientName: f.clientName, title: f.title, kickoffDate: f.kickoffDate, targetGoLive: f.targetGoLive || null, uatOverride: f.uat === 'auto' ? null : f.uat === 'open' },
    });
    setBusy(false);
    if (!r.success) return toast({ message: r.error || 'Could not save the project.' });
    toast({ message: 'Project saved' });
    onClose();
    await onChanged();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit project"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Client name" htmlFor="cpe-client">
          <Input id="cpe-client" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Project title" htmlFor="cpe-title">
          <Input id="cpe-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kickoff date" htmlFor="cpe-kick" hint="Open cards still on their planned day move with it.">
            <Input id="cpe-kick" type="date" value={f.kickoffDate} onChange={(e) => setF({ ...f, kickoffDate: e.target.value })} />
          </Field>
          <Field label="Target go-live" htmlFor="cpe-live">
            <Input id="cpe-live" type="date" value={f.targetGoLive} onChange={(e) => setF({ ...f, targetGoLive: e.target.value })} />
          </Field>
        </div>
        <Field label="UAT issue reports from the client" htmlFor="cpe-uat" hint="Automatic opens the form on the Readiness day (kickoff + 10 business days).">
          <Select id="cpe-uat" value={f.uat} onChange={(e) => setF({ ...f, uat: e.target.value })}>
            <option value="auto">Automatic</option>
            <option value="open">Open now</option>
            <option value="closed">Closed</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function ExportDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const toast = useToast();
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return setText(null);
    void apiJson<{ deliveryReport: string }>(`/api/client-projects/${projectId}/export`).then((r) => setText(r.success ? r.deliveryReport : r.error || 'Could not build the report.'));
  }, [open, projectId]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Export progress"
      description="The weekly Delivery Report text, built from the board. Paste it into the Delivery Report in Agreements."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={<Copy />} disabled={!text} onClick={async () => toast({ message: text && (await copyText(text)) ? 'Report copied' : 'Select the text and copy it.' })}>
            Copy
          </Button>
        </>
      }
    >
      {text === null ? <Skeleton className="h-64 w-full" /> : <Textarea aria-label="Delivery Report text" readOnly rows={18} value={text} className="font-mono text-small" data-testid="cp-export-text" />}
    </Dialog>
  );
}

export { Note };
