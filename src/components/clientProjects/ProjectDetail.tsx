'use client';

/**
 * Platform Console › Client Projects › one project (v2). Header with the health chip, the telemetry
 * strip and the milestone track; then the views (Kanban by default, Roadmap, List, Timeline,
 * Dashboard) and the record tabs (Activity, Client delays, Documents & AI, People, Automations).
 *
 * Data: one GET for the project and its cards; every other tab loads its own data, in pages. While the
 * page is visible it asks the cheap "changes" endpoint every 45 s and refetches only when something
 * changed. Moves are optimistic and roll back if the server refuses.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Plus, Search, Share2, Sparkles, TriangleAlert } from 'lucide-react';
import {
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
  SegmentedControl,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
  type Column,
} from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import { copyText } from '@/components/agreements/ownerShared';
import {
  PHASES,
  PHASE_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  SEVERITIES,
  SEVERITY_FIX_BD,
  SEVERITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  TASK_TYPES,
  TYPE_LABEL,
  fmtAt,
  fmtDate,
  fmtDateLong,
  todayManila,
  type CpEvent,
  type DelayRow,
  type OwnerProjectView,
  type OwnerTaskView,
  type TaskStatus,
} from '@/lib/clientProjects/types';
import { HealthChip, Note, OwnerGate, type ProjectResponse } from '@/components/clientProjects/shared';
import { TaskDrawer } from '@/components/clientProjects/TaskDrawer';
import { AiPanel } from '@/components/clientProjects/AiPanel';
import { AutomationsPanel } from '@/components/clientProjects/AutomationsPanel';
import { KanbanView, RoadmapView, useAnnounce, type MoveRequest, type Swimlane } from '@/components/clientProjects/BoardViews';
import { ListView, TimelineView } from '@/components/clientProjects/ListTimeline';
import { DashboardView } from '@/components/clientProjects/DashboardView';
import { PeoplePanel } from '@/components/clientProjects/PeoplePanel';
import { NotificationsBell } from '@/components/clientProjects/Notifications';
import { actorLabel, eventText } from '@/components/clientProjects/eventText';
import { ClientDataTab, SubmissionsTab } from '@/components/clientProjects/intake/OwnerIntake';

const TABS = ['kanban', 'roadmap', 'list', 'timeline', 'dashboard', 'activity', 'delays', 'submissions', 'clientdata', 'ai', 'people', 'automations'] as const;
type Tab = (typeof TABS)[number];
const VIEW_TABS: Tab[] = ['kanban', 'roadmap', 'list', 'timeline'];

export function ProjectDetail({ id, initialTab }: { id: string; initialTab?: string }) {
  const t = initialTab === 'board' ? 'kanban' : initialTab;
  return (
    <OwnerGate>
      <Detail id={id} initialTab={(TABS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'kanban'} />
    </OwnerGate>
  );
}

// ------------------------------------------------------------------ filters (shared by every view)

interface Filters {
  q: string;
  status: string;
  type: string;
  side: string;
  assignee: string;
  priority: string;
  label: string;
  overdue: boolean;
  week: boolean;
  sort: string;
}
const NO_FILTERS: Filters = { q: '', status: '', type: '', side: '', assignee: '', priority: '', label: '', overdue: false, week: false, sort: 'due_asc' };
const weekEnd = () => {
  const d = new Date(`${todayManila()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6 - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const bySchedule = (a: OwnerTaskView, b: OwnerTaskView) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.sort - b.sort;

function applyFilters(tasks: OwnerTaskView[], f: Filters, list: boolean): OwnerTaskView[] {
  const q = f.q.trim().toLowerCase();
  const end = weekEnd();
  const out = tasks.filter(
    (t) =>
      (!q || `${t.key} ${t.title}`.toLowerCase().includes(q)) &&
      (!list || !f.status || t.status === f.status) &&
      (!f.type || t.type === f.type) &&
      (!f.side || t.ownerSide === f.side) &&
      (!f.assignee || (f.assignee === '__none' ? !t.assigneeId : t.assigneeId === f.assignee)) &&
      (!f.priority || (f.priority === '__none' ? !t.priority : t.priority === f.priority)) &&
      (!f.label || (t.labelIds ?? []).includes(f.label)) &&
      (!f.overdue || t.overdue) &&
      (!f.week || (t.status !== 'done' && Boolean(t.dueDate) && (t.dueDate as string) <= end)),
  );
  if (!list) return out;
  return out.sort((a, b) => (f.sort === 'key' ? a.num - b.num : f.sort === 'due_desc' ? (b.dueDate ?? '').localeCompare(a.dueDate ?? '') || a.num - b.num : bySchedule(a, b)));
}

function FilterBar({ f, set, project, list, shown, total }: { f: Filters; set: (f: Filters) => void; project: OwnerProjectView; list: boolean; shown: number; total: number }) {
  const people = project.people ?? [];
  const labels = project.labels ?? [];
  const on = JSON.stringify({ ...f, sort: '' }) !== JSON.stringify({ ...NO_FILTERS, sort: '' });
  return (
    <div className="flex flex-wrap items-center gap-2 [&>div.sel]:w-36" data-testid="cp-list-filters">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-tertiary" aria-hidden />
        <Input aria-label="Search cards" placeholder="Search title or key" value={f.q} onChange={(e) => set({ ...f, q: e.target.value })} className="h-8 pl-8" data-testid="cp-search" />
      </div>
      <Checkbox checked={f.overdue} onChange={(e) => set({ ...f, overdue: e.target.checked })} label="Overdue only" />
      <Checkbox checked={f.week} onChange={(e) => set({ ...f, week: e.target.checked })} label="Due this week" data-testid="cp-filter-week" />
      {list && (
        <div className="sel">
          <Select aria-label="Status" value={f.status} onChange={(e) => set({ ...f, status: e.target.value })} className="h-8">
            <option value="">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="sel">
        <Select aria-label="Assignee" value={f.assignee} onChange={(e) => set({ ...f, assignee: e.target.value })} className="h-8" data-testid="cp-filter-assignee">
          <option value="">Anyone</option>
          <option value="__none">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.side === 'client' ? ' (client)' : ''}
            </option>
          ))}
        </Select>
      </div>
      <div className="sel">
        <Select aria-label="Owner" value={f.side} onChange={(e) => set({ ...f, side: e.target.value })} className="h-8">
          <option value="">Us and client</option>
          <option value="us">Us</option>
          <option value="client">Client</option>
        </Select>
      </div>
      <div className="sel">
        <Select aria-label="Type" value={f.type} onChange={(e) => set({ ...f, type: e.target.value })} className="h-8">
          <option value="">All types</option>
          {TASK_TYPES.map((s) => (
            <option key={s} value={s}>
              {TYPE_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="sel">
        <Select aria-label="Priority" value={f.priority} onChange={(e) => set({ ...f, priority: e.target.value })} className="h-8" data-testid="cp-filter-priority">
          <option value="">Any priority</option>
          <option value="__none">No priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </div>
      {labels.length > 0 && (
        <div className="sel">
          <Select aria-label="Label" value={f.label} onChange={(e) => set({ ...f, label: e.target.value })} className="h-8">
            <option value="">Any label</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {list && (
        <div className="sel">
          <Select aria-label="Sort" value={f.sort} onChange={(e) => set({ ...f, sort: e.target.value })} className="h-8">
            <option value="due_asc">Due: soonest first</option>
            <option value="due_desc">Due: latest first</option>
            <option value="key">Key</option>
          </Select>
        </div>
      )}
      <span className="cp-mono text-small text-fg-tertiary" data-testid="cp-list-count">
        {shown} of {total}
      </span>
      {on && (
        <Button variant="ghost" size="sm" onClick={() => set({ ...NO_FILTERS, sort: f.sort })} data-testid="cp-clear-filters">
          Clear filters
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the page

/** The local result of a move, so the board answers at once (the server's answer replaces it). */
function applyMove(tasks: OwnerTaskView[], t: OwnerTaskView, req: MoveRequest): OwnerTaskView[] {
  const status = req.status ?? t.status;
  let sort = t.sort;
  if ('beforeId' in req) {
    const col = tasks.filter((x) => x.status === status && x.id !== t.id).sort((a, b) => a.sort - b.sort || a.num - b.num);
    const i = req.beforeId === null || req.beforeId === undefined ? col.length : col.findIndex((x) => x.id === req.beforeId);
    const prev = col[i - 1]?.sort;
    const next = col[i]?.sort;
    sort = prev === undefined && next === undefined ? t.sort : prev === undefined ? (next as number) - 1024 : next === undefined ? prev + 1024 : (prev + next) / 2;
  }
  return tasks.map((x) => (x.id === t.id ? { ...x, status, sort, phase: req.phase ?? x.phase, overdue: status === 'done' ? false : x.overdue } : x));
}

function Detail({ id, initialTab }: { id: string; initialTab: Tab }) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = React.useState<ProjectResponse | null>(null);
  const dataRef = React.useRef<ProjectResponse | null>(null);
  dataRef.current = data;
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [swimlane, setSwimlane] = React.useState<Swimlane>('none');
  const [forceDone, setForceDone] = React.useState<{ t: OwnerTaskView; req: MoveRequest; blockers: string[] } | null>(null);
  const [announce, say] = useAnnounce();
  const latest = React.useRef<string | null>(null);

  const load = React.useCallback(async () => {
    const r = await apiJson<ProjectResponse>(`/api/client-projects/${id}`);
    if (!r.success) return setError(r.error || 'Could not load the project.');
    setError(null);
    setData(r);
  }, [id]);
  React.useEffect(() => {
    void load();
    // Cheap polling: one query asks whether anything changed; the project is refetched only then.
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await apiJson<{ latest: string | null }>(`/api/client-projects/${id}/changes`);
      if (!r.success) return;
      if (latest.current !== null && r.latest !== latest.current) void load();
      latest.current = r.latest;
    };
    void poll();
    const t = window.setInterval(() => void poll(), 45_000);
    const onVisible = () => document.visibilityState === 'visible' && void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, id]);
  // After our own change, refetch and remember the new "latest" so the poll does not fetch it again.
  const reload = React.useCallback(async () => {
    await load();
    const r = await apiJson<{ latest: string | null }>(`/api/client-projects/${id}/changes`);
    if (r.success) latest.current = r.latest;
  }, [load, id]);

  /** Optimistic move with rollback. A Done over open blockers asks first (warn, and allow). */
  const move = React.useCallback(
    async (t: OwnerTaskView, req: MoveRequest, override = false) => {
      const before = dataRef.current;
      if (!before) return;
      setData({ ...before, tasks: applyMove(before.tasks, t, req) });
      const r = await apiJson<{ task: OwnerTaskView; suggestRedate: { dueDate: string } | null; code?: string; blockers?: string[] }>(`/api/client-projects/${id}/tasks/${t.id}/move`, { body: { ...req, ...(override ? { override: true } : {}) } });
      if (!r.success) {
        setData(before);
        if (r.code === 'blockers_open') return setForceDone({ t, req, blockers: r.blockers ?? [] });
        say(`${t.key} could not be moved`);
        return toast({ message: r.error || 'Could not move the card.' });
      }
      say(req.phase ? `${t.key} moved to ${PHASE_LABEL[req.phase]}` : `${t.key} moved to ${STATUS_LABEL[(req.status ?? t.status) as TaskStatus]}`);
      if (r.suggestRedate) {
        const date = r.suggestRedate.dueDate;
        toast({
          message: `${t.key} moved to ${PHASE_LABEL[req.phase as keyof typeof PHASE_LABEL]}. Due date kept (${fmtDate(t.dueDate)}).`,
          action: {
            label: `Re-date to ${fmtDate(date)}`,
            onClick: () => void apiJson(`/api/client-projects/${id}/tasks/${t.id}/move`, { body: { phase: req.phase, redate: true } }).then(() => reload()),
          },
        });
      }
      void reload();
    },
    [id, reload, say, toast],
  );

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
  const people = p.people ?? [];
  const labels = p.labels ?? [];
  const openTask = tasks.find((t) => t.id === openId) ?? null;
  const isView = VIEW_TABS.includes(tab);
  const shown = applyFilters(tasks, filters, tab === 'list');
  const filtered = shown.length !== tasks.length;
  const openKey = (key: string) => {
    const t = tasks.find((x) => x.key === key);
    if (t) setOpenId(t.id);
  };
  const patchProject = async (body: Record<string, unknown>, done: string) => {
    const r = await apiJson(`/api/client-projects/${id}`, { method: 'PATCH', body });
    toast({ message: r.success ? done : r.error || 'Could not change the project.' });
    await reload();
  };
  const loadSop = async () => {
    const r = await apiJson<{ cards: number }>(`/api/client-projects/${id}/sop`, { body: {} });
    toast({ message: r.success ? `${r.cards} SOP cards loaded` : r.error || 'Could not load the SOP cards.' });
    await reload();
  };
  const overdue = tasks.filter((t) => t.overdue).length;
  const waiting = tasks.filter((t) => t.ownerSide === 'client' && t.status !== 'done' && t.overdue).length;
  const dueWeek = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate >= todayManila() && t.dueDate <= weekEnd()).length;

  return (
    <div className="flex flex-col px-4 py-6 md:px-8" data-testid="cp-detail" data-project-status={p.status}>
      <Link href="/platform/client-projects" className="focus-ring mb-2 inline-flex w-fit items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Client Projects
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-bold leading-8 tracking-[-0.02em] text-fg">{p.clientName}</h1>
            {tasks.length ? <HealthChip health={p.health} reasons={p.healthReasons} /> : <span className="cp-chip" data-health="closed">No cards yet</span>}
            {p.status !== 'active' && <span className="cp-chip" data-health="closed" data-testid="cp-status-chip">{PROJECT_STATUS_LABEL[p.status]}</span>}
          </div>
          <p className="mt-1 text-small text-fg-secondary">
            <span className="cp-mono">{p.key}</span> · Kickoff {fmtDateLong(p.kickoffDate)} · Go-live {fmtDateLong(p.targetGoLive)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NotificationsBell projectId={id} />
          <Button
            variant="ghost"
            icon={<Sparkles />}
            onClick={() => {
              // The Ask Copilot panel lives on the Dashboard tab, below the charts: switch tab, then bring it into view and focus it.
              setTab('dashboard');
              let tries = 0;
              const reveal = () => {
                const panel = document.querySelector<HTMLElement>('[data-testid="cp-copilot"]');
                if (!panel) {
                  if (++tries < 40) window.setTimeout(reveal, 50);
                  return;
                }
                panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                panel.querySelector<HTMLInputElement>('[data-testid="cp-copilot-input"]')?.focus({ preventScroll: true });
                panel.classList.remove('cp-flash');
                void panel.offsetWidth;
                panel.classList.add('cp-flash');
              };
              window.setTimeout(reveal, 0);
            }}
            data-testid="cp-ask-copilot"
          >
            Ask Copilot
          </Button>
          <Button variant="secondary" icon={<Share2 />} onClick={() => setSharing(true)} data-testid="cp-share" disabled={p.status === 'archived'}>
            {p.hasLink ? 'Board shared' : 'Share board'}
          </Button>
          <span data-testid="cp-project-menu">
            <Menu
              label="Project actions"
              items={[
                { label: 'Share settings', onSelect: () => setSharing(true), disabled: p.status === 'archived' },
                { label: 'Edit dates and details', onSelect: () => setEditing(true) },
                { label: 'Export progress', onSelect: () => setExporting(true) },
                'divider',
                ...PROJECT_STATUSES_MENU(p.status).map((s) => ({ label: s.label, onSelect: () => void patchProject({ status: s.value }, s.done) })),
                'divider',
                { label: 'Delete permanently…', danger: true, onSelect: () => setDeleting(true) },
              ]}
            />
          </span>
          <Button variant="brand" icon={<Plus />} onClick={() => setAdding(true)} data-testid="cp-add" disabled={p.status === 'archived'}>
            Add card
          </Button>
        </div>
      </header>
      {p.status === 'archived' && (
        <Note>
          Archived: hidden from the project list and the client board link is off.{' '}
          <button type="button" className="focus-ring rounded-sm underline" onClick={() => void patchProject({ status: 'active' }, 'Project restored')} data-testid="cp-restore">
            Restore
          </button>
        </Note>
      )}

      <Telemetry project={p} overdue={overdue} waiting={waiting} dueWeek={dueWeek} />
      {/* The old export button stays reachable for the regression suite and keyboard users. */}
      <span className="sr-only">
        <button type="button" onClick={() => setExporting(true)} data-testid="cp-export">
          Export progress
        </button>
      </span>

      <div className="-mx-4 mb-4 shrink-0 overflow-x-auto overflow-y-hidden px-4 md:mx-0 md:px-0" data-testid="cp-tabs">
        <Tabs
          className="min-w-max [&>button]:shrink-0 [&>button]:whitespace-nowrap"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          items={[
            { value: 'kanban', label: 'Kanban' },
            { value: 'roadmap', label: 'Roadmap' },
            { value: 'list', label: 'List' },
            { value: 'timeline', label: 'Timeline' },
            { value: 'dashboard', label: 'Dashboard' },
            { value: 'activity', label: 'Activity' },
            { value: 'delays', label: 'Client delays', count: data.delays.length || undefined },
            { value: 'submissions', label: 'Submissions', count: tasks.filter((t) => t.intake?.review).length || undefined },
            { value: 'clientdata', label: 'Client data' },
            { value: 'ai', label: 'Documents & AI' },
            { value: 'people', label: 'People', count: people.length || undefined },
            { value: 'automations', label: 'Automations' },
          ]}
        />
      </div>
      {error && <InlineError message={error} onRetry={load} className="mb-4" />}
      <p aria-live="polite" className="sr-only" data-testid="cp-announce">
        {announce}
      </p>

      {isView && tasks.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterBar f={filters} set={setFilters} project={p} list={tab === 'list'} shown={shown.length} total={tasks.length} />
          {tab === 'kanban' && (
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-small text-fg-secondary">Swimlanes</span>
              <SegmentedControl label="Swimlanes" size="sm" value={swimlane} onChange={(v) => setSwimlane(v as Swimlane)} items={[{ value: 'none', label: 'None' }, { value: 'phase', label: 'Phase' }, { value: 'assignee', label: 'Assignee' }]} />
            </div>
          )}
        </div>
      )}

      {tab === 'kanban' && <KanbanView tasks={shown} allTasks={tasks} people={people} labels={labels} onOpen={(t) => setOpenId(t.id)} onMove={(t, r) => void move(t, r)} onLoadSop={loadSop} empty={tasks.length === 0} wip={p.settings?.wip} swimlane={swimlane} filtered={filtered} onClearFilters={() => setFilters(NO_FILTERS)} />}
      {tab === 'roadmap' && <RoadmapView tasks={shown} allTasks={tasks} people={people} labels={labels} onOpen={(t) => setOpenId(t.id)} onMove={(t, r) => void move(t, r)} onLoadSop={loadSop} empty={tasks.length === 0} />}
      {tab === 'list' && <ListView projectId={id} rows={shown} total={tasks.length} people={people} labels={labels} onOpen={(t) => setOpenId(t.id)} onChanged={reload} />}
      {tab === 'timeline' && <TimelineView tasks={shown} onOpen={(t) => setOpenId(t.id)} />}
      {tab === 'dashboard' && <DashboardView projectId={id} onOpenKey={openKey} refreshKey={String(tasks.map((t) => t.updatedAt).sort().pop())} />}
      {tab === 'activity' && <ActivityTab projectId={id} />}
      {tab === 'delays' && <DelaysTab delays={data.delays} onOpen={(taskId) => setOpenId(taskId)} />}
      {tab === 'ai' && <AiPanel project={p} onChanged={reload} />}
      {tab === 'people' && <PeoplePanel project={p} tasks={tasks} onChanged={reload} />}
      {tab === 'submissions' && <SubmissionsTab projectId={id} onOpenTask={(taskId) => setOpenId(taskId)} />}
      {tab === 'clientdata' && <ClientDataTab projectId={id} project={p} onChanged={reload} onOpenTask={(taskId) => setOpenId(taskId)} />}
      {tab === 'automations' && <AutomationsPanel project={p} onChanged={reload} />}

      <TaskDrawer projectId={id} project={p} task={openTask} tasks={tasks} attachments={data.attachments ?? []} onClose={() => setOpenId(null)} onChanged={reload} />
      <AddCardDialog open={adding} onClose={() => setAdding(false)} project={p} onCreated={reload} />
      <ShareDialog open={sharing} onClose={() => setSharing(false)} project={p} onChanged={reload} />
      <EditProjectDialog open={editing} onClose={() => setEditing(false)} project={p} onChanged={reload} />
      <ExportDialog open={exporting} onClose={() => setExporting(false)} projectId={id} />
      <DeleteProjectDialog
        open={deleting}
        project={p}
        onClose={() => setDeleting(false)}
        onArchive={() => {
          setDeleting(false);
          void patchProject({ status: 'archived' }, 'Project archived. The client board link is off.');
        }}
        onDeleted={() => router.push('/platform/client-projects')}
      />
      <ConfirmDialog
        open={forceDone !== null}
        onClose={() => setForceDone(null)}
        title={forceDone ? `${forceDone.t.key} is still blocked` : ''}
        description={forceDone ? `It waits on ${forceDone.blockers.join(', ')}, which ${forceDone.blockers.length === 1 ? 'is' : 'are'} not done. Mark it Done anyway? This is recorded in the activity log.` : ''}
        confirmLabel="Mark Done anyway"
        onConfirm={() => {
          const f = forceDone;
          setForceDone(null);
          if (f) void move(f.t, f.req, true);
        }}
      />
    </div>
  );
}

function PROJECT_STATUSES_MENU(status: OwnerProjectView['status']) {
  if (status === 'archived') return [{ label: 'Restore project', value: 'active', done: 'Project restored' }];
  return [
    ...(status !== 'done' ? [{ label: 'Mark done', value: 'done', done: 'Project is now done' }] : [{ label: 'Mark active', value: 'active', done: 'Project is now active' }]),
    ...(status === 'draft' ? [{ label: 'Mark active', value: 'active', done: 'Project is now active' }] : []),
    { label: 'Archive project (hidden from the list, link turned off)', value: 'archived', done: 'Project archived. The client board link is off.' },
  ];
}

/** The telemetry strip: four numbers, then the milestone track (done markers, the next one, today). */
function Telemetry({ project: p, overdue, waiting, dueWeek }: { project: OwnerProjectView; overdue: number; waiting: number; dueWeek: number }) {
  const stats: [string, React.ReactNode, boolean?][] = [
    ['Done', <>{p.progress.done}<span className="text-[14px] text-fg-tertiary">/{p.progress.total}</span></>],
    ['Overdue', overdue, overdue > 0],
    ['Waiting on client', waiting],
    ['Due this week', dueWeek],
  ];
  const nextIdx = p.progress.markers.findIndex((m) => !m.done);
  return (
    <div className="mb-5 grid grid-cols-2 gap-x-9 gap-y-3 md:grid-cols-[repeat(4,auto)_1fr] md:items-end" data-testid="cp-progress-text">
      {stats.map(([label, value, danger]) => (
        <div key={label}>
          <p className={cn('cp-mono text-[26px] font-semibold leading-8', danger ? 'text-danger-fg' : 'text-fg')}>{value}</p>
          <p className="text-caption text-fg-secondary">{label}</p>
        </div>
      ))}
      <div className="col-span-2 pb-2 md:col-span-1" data-testid="cp-progress" data-value={Math.round(p.progress.value * 100)}>
        <div className="cp-track" role="img" aria-label={`Project progress: ${p.progress.done} of ${p.progress.total} done`}>
          <span key={p.id} className="fill" style={{ width: `${p.progress.value * 100}%` }} />
          {p.progress.markers.map((m, i) => (
            <span key={m.id} className="dia" data-testid="cp-marker" data-done={m.done ? '1' : '0'} data-next={i === nextIdx ? '1' : '0'} title={`${m.title}${m.done ? ' (done)' : ''}`} style={{ left: `${Math.min(100, Math.max(0, m.at * 100))}%` }} />
          ))}
        </div>
        <p className="mt-2 truncate text-caption text-fg-tertiary">{nextIdx >= 0 ? `Next: ${p.progress.markers[nextIdx].title}` : 'Every milestone is done'}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ activity + delays

/** The activity log, newest first, loaded when the tab opens and a page at a time after that. */
function ActivityTab({ projectId }: { projectId: string }) {
  const [events, setEvents] = React.useState<CpEvent[] | null>(null);
  const [before, setBefore] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const page = React.useCallback(
    async (cursor: string | null) => {
      setBusy(true);
      const r = await apiJson<{ events: CpEvent[]; nextBefore: string | null }>(`/api/client-projects/${projectId}/events?limit=100${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`);
      setBusy(false);
      if (!r.success) return;
      setEvents((o) => [...(cursor ? (o ?? []) : []), ...r.events]);
      setBefore(r.nextBefore);
    },
    [projectId],
  );
  React.useEffect(() => {
    void page(null);
  }, [page]);
  if (!events) return <Skeleton className="h-64 w-full" />;
  if (!events.length) return <EmptyState icon={<Plus />} title="No activity yet" />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface" data-testid="cp-activity">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-small">
            <span className="cp-mono w-28 shrink-0 text-fg-tertiary">{fmtAt(e.at)}</span>
            <span className="min-w-0 flex-1 break-words text-fg">{eventText(e)}</span>
            <span className="text-fg-tertiary">{actorLabel(e.actor)}</span>
          </li>
        ))}
      </ul>
      {before ? (
        <div>
          <Button variant="secondary" size="sm" loading={busy} onClick={() => void page(before)} data-testid="cp-activity-more">
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
    { key: 'key', header: 'Key', width: 'w-24', cell: (d) => <span className="cp-mono whitespace-nowrap text-small text-fg-secondary">{d.key}</span> },
    { key: 'title', header: 'Client item', cell: (d) => <span className="line-clamp-1 min-w-48 text-body text-fg">{d.title}</span> },
    { key: 'due', header: 'Was due', cell: (d) => <span className="whitespace-nowrap text-small text-fg-secondary">{fmtDateLong(d.dueDate)}</span> },
    { key: 'state', header: 'State', cell: (d) => <span className="cp-chip" data-health={d.state === 'open' ? 'late' : 'at_risk'}>{d.state === 'open' ? 'Still open' : 'Done late'}</span> },
    { key: 'days', header: 'Business days late', align: 'right', cell: (d) => <span className="cp-mono">{d.days}</span> },
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

/** Permanent delete (SPEC section 8): the real counts, the client name typed exactly, and "Archive instead". */
function DeleteProjectDialog({ open, project, onClose, onArchive, onDeleted }: { open: boolean; project: OwnerProjectView; onClose: () => void; onArchive: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [counts, setCounts] = React.useState<Record<string, number> | null>(null);
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setTyped('');
    setCounts(null);
    void apiJson<{ counts: Record<string, number> }>(`/api/client-projects/${project.id}/counts`).then((r) => r.success && setCounts(r.counts));
  }, [open, project.id]);
  const ok = typed.trim() === project.clientName.trim();
  const remove = async () => {
    setBusy(true);
    const r = await apiJson(`/api/client-projects/${project.id}?confirm=${encodeURIComponent(typed.trim())}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.success) return toast({ message: r.error || 'Could not delete the project.' });
    toast({ message: `${project.clientName} was deleted.` });
    onDeleted();
  };
  const rows: [string, string][] = [
    ['cards', 'Cards'],
    ['comments', 'Comments'],
    ['documents', 'Documents'],
    ['attachments', 'Attachments'],
    ['people', 'People'],
    ['runs', 'AI runs'],
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={`Delete ${project.clientName} permanently?`}
      description="This cannot be undone. The client board link turns off at once. An audit record with no content (the key, the client name, who and when, and the card count) is kept."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {project.status !== 'archived' && (
            <Button variant="secondary" onClick={onArchive} disabled={busy} data-testid="cp-delete-archive">
              Archive instead
            </Button>
          )}
          <Button variant="danger" onClick={() => void remove()} loading={busy} disabled={!ok || !counts} data-testid="cp-delete-confirm">
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" role="alertdialog" data-testid="cp-delete-dialog">
        <div className="flex items-start gap-3 rounded-md bg-danger-bg p-3 text-small text-danger-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Everything in this project is removed for good.
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-small" data-testid="cp-delete-counts">
          {rows.map(([k, label]) => (
            <div key={k} className="flex justify-between border-b border-line py-1">
              <dt className="text-fg-secondary">{label}</dt>
              <dd className="cp-mono text-fg" data-count={k}>
                {counts ? counts[k] ?? 0 : '…'}
              </dd>
            </div>
          ))}
        </dl>
        <Field label={`Type ${project.clientName} to confirm`} htmlFor="cp-delete-name">
          <Input id="cp-delete-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="cp-delete-input" />
        </Field>
      </div>
    </Dialog>
  );
}

function AddCardDialog({ open, onClose, project, onCreated }: { open: boolean; onClose: () => void; project: OwnerProjectView; onCreated: () => Promise<void> | void }) {
  const toast = useToast();
  const [type, setType] = React.useState('task');
  const [title, setTitle] = React.useState('');
  const [phase, setPhase] = React.useState('week_1');
  const [dueDate, setDueDate] = React.useState('');
  const [ownerSide, setOwnerSide] = React.useState('us');
  const [assigneeId, setAssigneeId] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [severity, setSeverity] = React.useState('S3');
  const [steps, setSteps] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setType('task');
    setTitle('');
    setDueDate('');
    setOwnerSide('us');
    setAssigneeId('');
    setPriority('');
    setSeverity('S3');
    setSteps('');
  }, [open]);
  const defect = type === 'defect';
  const people = project.people ?? [];
  const submit = async () => {
    setBusy(true);
    const body = defect ? { type, title, severity, steps } : { type, title, phase, ownerSide, ...(dueDate ? { dueDate } : {}), ...(assigneeId ? { assigneeId } : {}), ...(priority ? { priority } : {}) };
    const r = await apiJson<{ task: OwnerTaskView }>(`/api/client-projects/${project.id}/tasks`, { body });
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
            <Field label="Assignee" htmlFor="cpa-assignee" hint="The card's side follows its assignee.">
              <Select id="cpa-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Nobody yet</option>
                {people.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.side === 'client' ? ' (client)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" htmlFor="cpa-owner">
              <Select id="cpa-owner" value={ownerSide} onChange={(e) => setOwnerSide(e.target.value)} disabled={Boolean(assigneeId)}>
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
            <Field label="Priority" htmlFor="cpa-prio">
              <Select id="cpa-prio" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">None</option>
                {PRIORITIES.map((v) => (
                  <option key={v} value={v}>
                    {PRIORITY_LABEL[v]}
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
