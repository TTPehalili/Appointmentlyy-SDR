'use client';

/** Platform Console › Client Projects: every onboarding project with its progress, next due item and overdue count. */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus } from 'lucide-react';
import { Badge, Button, Card, Checkbox, DataTable, Dialog, EmptyState, Field, InlineError, Input, PageHeader, useToast, type Column } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { PROJECT_STATUS_LABEL, fmtDate, suggestKey, todayManila, type OwnerProjectView } from '@/lib/clientProjects/types';
import { Note, OwnerGate, ProgressBar, SideChip, type AiMode } from '@/components/clientProjects/shared';

interface ListResponse {
  projects: OwnerProjectView[];
  sop: { version: string; cards: number };
  ai: AiMode;
  storage: 'supabase' | 'file';
}

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

  const load = React.useCallback(async () => {
    const r = await apiJson<ListResponse>('/api/client-projects');
    if (!r.success) return setError(r.error || 'Could not load the projects.');
    setError(null);
    setData(r);
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<OwnerProjectView>[] = [
    {
      key: 'client',
      header: 'Client',
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate text-body-strong text-fg">{p.clientName}</p>
          <p className="truncate text-small text-fg-secondary">
            <span className="font-mono">{p.key}</span> · {p.title}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (p) => <Badge tone={p.status === 'done' ? 'success' : 'neutral'} className={p.status === 'active' ? 'bg-selected-soft text-selected-soft-fg' : undefined}>{PROJECT_STATUS_LABEL[p.status]}</Badge> },
    {
      key: 'progress',
      header: 'Progress',
      width: 'w-56',
      cell: (p) => (
        <div className="flex min-w-40 items-center gap-3">
          <ProgressBar progress={p.progress} label={`${p.clientName} progress`} className="flex-1" />
          <span className="w-12 text-right text-small tabular-nums text-fg-secondary">
            {p.progress.done}/{p.progress.total}
          </span>
        </div>
      ),
    },
    {
      key: 'next',
      header: 'Next due',
      cell: (p) =>
        p.nextDue ? (
          <div className="flex min-w-0 items-center gap-2">
            <SideChip side={p.nextDue.ownerSide} />
            <span className="max-w-64 truncate text-small text-fg">{p.nextDue.title}</span>
            <span className="whitespace-nowrap text-small text-fg-secondary">{fmtDate(p.nextDue.dueDate)}</span>
          </div>
        ) : (
          <span className="text-small text-fg-tertiary">Nothing due</span>
        ),
    },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      cell: (p) => (p.overdueCount ? <Badge tone="danger">{p.overdueCount}</Badge> : <span className="text-small text-fg-tertiary">0</span>),
    },
    { key: 'golive', header: 'Go-live', cell: (p) => <span className="whitespace-nowrap text-small text-fg-secondary">{fmtDate(p.targetGoLive)}</span> },
  ];

  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Client Projects"
        count={data?.projects.length}
        description="One onboarding board per client: what we promised, what is done, and what is waiting on them."
        primaryAction={
          <Button variant="brand" icon={<Plus />} onClick={() => setCreating(true)} data-testid="cp-new">
            New project
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 empty:hidden">
        {data?.storage === 'file' && <Note tone="warning">Projects are saved on this server&apos;s disk. Connect the Supabase database before relying on them.</Note>}
        {error && <InlineError message={error} onRetry={load} />}
      </div>
      <Card className="overflow-hidden">
        <DataTable
          label="Client projects"
          columns={columns}
          rows={data?.projects ?? []}
          rowKey={(p) => p.id}
          loading={!data && !error}
          onRowClick={(p) => router.push(`/platform/client-projects/${p.id}`)}
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
