'use client';

/** Platform Console › Client Projects: every onboarding project with its progress, next due item and overdue count. */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus } from 'lucide-react';
import { Badge, Button, Card, Checkbox, DataTable, Dialog, EmptyState, Field, InlineError, Input, PageHeader, SegmentedControl, useToast, type Column } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { PROJECT_STATUS_LABEL, fmtDate, suggestKey, todayManila, type OwnerProjectView } from '@/lib/clientProjects/types';
import type { ProjectRow } from '@/lib/server/clientProjects/stats';
import { HealthChip, Note, OwnerGate } from '@/components/clientProjects/shared';
import { NotificationsBell } from '@/components/clientProjects/Notifications';
import { cn } from '@/lib/cn';

interface ListResponse {
  projects: OwnerProjectView[];
  rows: ProjectRow[];
  sop: { version: string; cards: number };
  ai: 'live' | 'stub' | 'off';
  storage: 'supabase' | 'file';
  schema: 'v2' | 'v1';
}

const HEALTH_ORDER = { late: 0, at_risk: 1, on_track: 2, closed: 3 } as const;

export function ProjectsConsole() {
  return (
    <OwnerGate>
      <Console />
    </OwnerGate>
  );
}

function Console() {
  const router = useRouter();
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [show, setShow] = React.useState('open');
  const toast = useToast();

  const load = React.useCallback(async () => {
    const r = await apiJson<ListResponse>('/api/client-projects');
    if (!r.success) return setError(r.error || 'Could not load the projects.');
    setError(null);
    setData(r);
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const restore = async (p: OwnerProjectView) => {
    const r = await apiJson(`/api/client-projects/${p.id}`, { method: 'PATCH', body: { status: 'active' } });
    toast({ message: r.success ? `${p.clientName} restored` : r.error || 'Could not restore it.' });
    await load();
  };
  const rowOf = (p: OwnerProjectView) => data?.rows?.find((r) => r.id === p.id);
  const archived = (data?.projects ?? []).filter((p) => p.status === 'archived');
  const rows = (data?.projects ?? [])
    .filter((p) => (show === 'archived' ? p.status === 'archived' : p.status !== 'archived'))
    .sort((a, b) => HEALTH_ORDER[a.health ?? 'on_track'] - HEALTH_ORDER[b.health ?? 'on_track'] || b.createdAt.localeCompare(a.createdAt));
  const columns: Column<OwnerProjectView>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: (p) => (
        <div className={cn('min-w-0', p.status === 'archived' && 'opacity-60')}>
          <p className="truncate text-body-strong text-fg">{p.clientName}</p>
          <p className="truncate text-small text-fg-secondary">
            <span className="cp-mono">{p.key}</span> · {p.title}
          </p>
        </div>
      ),
    },
    {
      key: 'health',
      header: 'Health',
      cell: (p) => (p.status === 'archived' ? <Badge tone="neutral">Archived</Badge> : p.status === 'draft' ? <Badge tone="neutral">{PROJECT_STATUS_LABEL.draft}</Badge> : <HealthChip health={p.health} reasons={p.healthReasons} />),
    },
    {
      key: 'progress',
      header: 'Done vs plan',
      width: 'w-56',
      cell: (p) => {
        const r = rowOf(p);
        const planned = r && r.cards ? r.plannedToDate / r.cards : 0;
        return (
          <div className="flex min-w-40 items-center gap-3" data-testid="cp-done-vs-plan">
            <div className="cp-track flex-1" style={{ height: 6 }}>
              <span className="fill" style={{ width: `${p.progress.value * 100}%` }} />
              <span className="absolute -top-0.5 h-2.5 w-0.5 bg-fg/55" style={{ left: `${planned * 100}%` }} title={r ? `${r.plannedToDate} planned to date` : undefined} />
            </div>
            <span className="cp-mono w-10 text-right text-small text-fg-secondary">{Math.round(p.progress.value * 100)}%</span>
          </div>
        );
      },
    },
    { key: 'done', header: 'Done', cell: (p) => <span className="cp-mono text-small text-fg-secondary">{p.progress.done}/{p.progress.total}</span> },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      cell: (p) => <span className={cn('cp-mono text-small', p.overdueCount ? 'font-semibold text-danger-fg' : 'text-fg-tertiary')}>{p.overdueCount}</span>,
    },
    {
      key: 'next',
      header: 'Next milestone',
      cell: (p) => {
        const m = rowOf(p)?.nextMilestone;
        return m ? (
          <span className="flex min-w-0 items-center gap-2 text-small">
            <span className="max-w-56 truncate text-fg">{m.title}</span>
            <span className="cp-mono whitespace-nowrap text-fg-secondary">{fmtDate(m.dueDate)}</span>
          </span>
        ) : (
          <span className="text-small text-fg-tertiary">None</span>
        );
      },
    },
    { key: 'golive', header: 'Go-live', cell: (p) => <span className="cp-mono whitespace-nowrap text-small text-fg-secondary">{fmtDate(p.targetGoLive)}</span> },
  ];

  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Client Projects"
        count={data?.projects.length}
        description="One onboarding board per client: what we promised, what is done, and what is waiting on them."
        secondaryActions={<NotificationsBell />}
        primaryAction={
          <Button variant="brand" icon={<Plus />} onClick={() => setCreating(true)} data-testid="cp-new">
            New project
          </Button>
        }
      />
      {archived.length > 0 && (
        <div className="mb-3">
          <SegmentedControl label="Show" size="sm" value={show} onChange={setShow} items={[{ value: 'open', label: 'Projects' }, { value: 'archived', label: `Archived (${archived.length})` }]} />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {data?.storage === 'file' && <Note tone="warning">Projects are saved on this server&apos;s disk. Connect the Supabase database before relying on them.</Note>}
        {data?.schema === 'v1' && (
          <Note tone="warning">
            <span data-testid="cp-schema-v1">The database is missing the Client Projects v2 update. Documents still list, but people, labels, checklists, attachments and moves cannot be saved until the owner runs supabase/migrations/20261125000000_client_projects_v2.sql.</span>
          </Note>
        )}
        {error && <InlineError message={error} onRetry={load} />}
      </div>
      <Card className="overflow-hidden">
        <DataTable
          label="Client projects"
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          loading={!data && !error}
          onRowClick={(p) => router.push(`/platform/client-projects/${p.id}`)}
          rowActions={(p) =>
            p.status === 'archived' ? (
              <Button size="sm" variant="secondary" onClick={() => void restore(p)} data-testid="cp-row-restore">
                Restore
              </Button>
            ) : null
          }
          empty={
            <EmptyState
              icon={<FolderKanban />}
              title="No projects yet"
              description="Start a project from the onboarding SOP. Upload the signed documents and the AI drafts the plan for you to approve."
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New project
                </Button>
              }
            />
          }
        />
      </Card>
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} sopCards={data?.sop.cards ?? 0} onCreated={(id, docs) => router.push(`/platform/client-projects/${id}${docs ? '?tab=ai' : ''}`)} />
    </div>
  );
}

function NewProjectDialog({ open, onClose, onCreated, sopCards }: { open: boolean; onClose: () => void; onCreated: (id: string, docs: boolean) => void; sopCards: number }) {
  const toast = useToast();
  const [clientName, setClientName] = React.useState('');
  const [key, setKey] = React.useState('');
  const [keyTouched, setKeyTouched] = React.useState(false);
  const [kickoff, setKickoff] = React.useState('');
  const [fromSop, setFromSop] = React.useState(true);
  const [fromDocs, setFromDocs] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setClientName('');
    setKey('');
    setKeyTouched(false);
    setKickoff(todayManila());
    setFromSop(true);
    setFromDocs(false);
    setError(null);
  }, [open]);

  const shownKey = keyTouched ? key : clientName.trim() ? suggestKey(clientName) : '';
  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await apiJson<{ project: OwnerProjectView }>('/api/client-projects', { body: { clientName, kickoffDate: kickoff, key: shownKey, fromSop } });
    setBusy(false);
    if (!r.success) return setError(r.error || 'Could not create the project.');
    toast({ message: `${r.project.clientName} created with ${r.project.progress.total} cards` });
    onClose();
    onCreated(r.project.id, fromDocs);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      description="A board for one client onboarding."
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="brand" onClick={() => void submit()} loading={busy} disabled={!clientName.trim() || !kickoff} data-testid="cp-create">
            Create project
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field label="Client name" htmlFor="cp-client">
            <Input id="cp-client" value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={120} placeholder="Client company" autoFocus />
          </Field>
          <Field label="Key" htmlFor="cp-key" hint="Cards: KEY-1">
            <Input
              id="cp-key"
              mono
              value={shownKey}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5));
              }}
              placeholder="KEY"
            />
          </Field>
        </div>
        <Field label="Kickoff date" htmlFor="cp-kickoff" hint="Every due date is counted in business days from kickoff.">
          <Input id="cp-kickoff" type="date" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <p className="text-body-strong text-fg">Start from</p>
          <Checkbox checked={fromSop} onChange={(e) => setFromSop(e.target.checked)} label={`The onboarding SOP${sopCards ? ` (${sopCards} cards)` : ''}`} />
          <Checkbox checked={fromDocs} onChange={(e) => setFromDocs(e.target.checked)} label="Signed documents (upload next; the AI drafts the plan)" />
        </div>
        {error && <InlineError message={error} />}
      </div>
    </Dialog>
  );
}
