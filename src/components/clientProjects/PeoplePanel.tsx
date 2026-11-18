'use client';

/**
 * People (who can be assigned cards, on our side and the client's), the project's labels, and the
 * kanban's soft column limits. Emails stay owner-only: the client board only ever gets client-side names.
 */
import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, ConfirmDialog, Field, IconButton, Input, Select, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { CP_LIMITS, DEFAULT_WIP, LABEL_COLORS, STATUS_LABEL, TASK_STATUSES, type Label, type LabelColor, type OwnerProjectView, type OwnerTaskView, type Person } from '@/lib/clientProjects/types';
import { AssigneeBadge, LabelChip, Note } from '@/components/clientProjects/shared';

export function PeoplePanel({ project, tasks, onChanged }: { project: OwnerProjectView; tasks: OwnerTaskView[]; onChanged: () => Promise<void> | void }) {
  const people = project.people ?? [];
  return (
    <div className="flex flex-col gap-6" data-testid="cp-people">
      <PeopleSection project={project} people={people} tasks={tasks} onChanged={onChanged} />
      <LabelsSection project={project} onChanged={onChanged} />
      <WipSection project={project} onChanged={onChanged} />
    </div>
  );
}

function PeopleSection({ project, people, tasks, onChanged }: { project: OwnerProjectView; people: Person[]; tasks: OwnerTaskView[]; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const blank = { name: '', email: '', side: 'client', role: '' };
  const [form, setForm] = React.useState(blank);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState(blank);
  const [removing, setRemoving] = React.useState<Person | null>(null);
  const [busy, setBusy] = React.useState(false);
  const call = async (url: string, method: string, body?: unknown, done?: string) => {
    setBusy(true);
    const r = await apiJson(url, { method, body });
    setBusy(false);
    if (!r.success) {
      toast({ message: r.error || 'That did not work.' });
      return false;
    }
    if (done) toast({ message: done });
    await onChanged();
    return true;
  };
  const base = `/api/client-projects/${project.id}/people`;
  const count = (id: string) => tasks.filter((t) => t.assigneeId === id && t.status !== 'done').length;
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-h3 text-fg">People</h2>
        <p className="mt-0.5 text-small text-fg-secondary">Everyone who can be assigned a card. A card has one assignee; its Us or Client side follows them. Emails are only used for assignment and mention emails when those automations are on, and are never shown on the client board.</p>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line" data-testid="cp-people-list">
        {people.length === 0 && <li className="px-3 py-3 text-small text-fg-tertiary">No people yet.</li>}
        {people.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid="cp-person" data-side={x.side}>
            <AssigneeBadge person={x} size="md" />
            {editing === x.id ? (
              <div className="grid flex-1 gap-2 sm:grid-cols-4">
                <Input aria-label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={CP_LIMITS.personName} />
                <Input aria-label="Email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} maxLength={254} />
                <Input aria-label="Role" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} maxLength={CP_LIMITS.roleLabel} />
                <div className="flex gap-2">
                  <Select aria-label="Side" value={edit.side} onChange={(e) => setEdit({ ...edit, side: e.target.value })}>
                    <option value="us">Us</option>
                    <option value="client">Client</option>
                  </Select>
                  <Button size="sm" variant="primary" loading={busy} onClick={async () => (await call(`${base}?personId=${x.id}`, 'PATCH', edit, 'Saved')) && setEditing(null)}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-fg">
                    {x.name} <span className="text-small text-fg-tertiary">{x.side === 'client' ? 'Client' : 'Us'}{x.role ? ` · ${x.role}` : ''}</span>
                  </p>
                  <p className="truncate text-caption text-fg-tertiary">{x.email || 'No email'} · {count(x.id)} open card{count(x.id) === 1 ? '' : 's'}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => (setEditing(x.id), setEdit({ name: x.name, email: x.email, side: x.side, role: x.role }))}>
                  Edit
                </Button>
                <IconButton label={`Remove ${x.name}`} size="sm" variant="ghost" onClick={() => setRemoving(x)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_8rem_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call(base, 'POST', form, `${form.name} added`)) setForm(blank);
        }}
      >
        <Field label="Name" htmlFor="cpp-name">
          <Input id="cpp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={CP_LIMITS.personName} data-testid="cp-person-name" />
        </Field>
        <Field label="Email (optional)" htmlFor="cpp-email">
          <Input id="cpp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={254} data-testid="cp-person-email" />
        </Field>
        <Field label="Role (optional)" htmlFor="cpp-role">
          <Input id="cpp-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} maxLength={CP_LIMITS.roleLabel} />
        </Field>
        <Field label="Side" htmlFor="cpp-side">
          <Select id="cpp-side" value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} data-testid="cp-person-side">
            <option value="client">Client</option>
            <option value="us">Us</option>
          </Select>
        </Field>
        <Button type="submit" variant="primary" icon={<Plus />} loading={busy} disabled={form.name.trim().length < 2} data-testid="cp-person-add">
          Add
        </Button>
      </form>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : ''}
        description="Their cards become unassigned and they stop watching cards. The cards themselves stay."
        confirmLabel="Remove"
        onConfirm={() => {
          const r = removing;
          setRemoving(null);
          if (r) void call(`${base}?personId=${r.id}`, 'DELETE', undefined, `${r.name} removed`);
        }}
      />
    </Card>
  );
}

function LabelsSection({ project, onChanged }: { project: OwnerProjectView; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [list, setList] = React.useState<Label[]>(project.labels ?? []);
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState<LabelColor>('blue');
  React.useEffect(() => setList(project.labels ?? []), [project.labels]);
  const save = async (next: { id?: string; name: string; color: LabelColor }[]) => {
    const r = await apiJson(`/api/client-projects/${project.id}/labels`, { method: 'PUT', body: { labels: next } });
    if (!r.success) return toast({ message: r.error || 'Could not save the labels.' });
    setName('');
    await onChanged();
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-h3 text-fg">Labels</h2>
        <p className="mt-0.5 text-small text-fg-secondary">Up to {CP_LIMITS.labels}. Labels are internal: the client board never shows them.</p>
      </div>
      <div className="flex flex-wrap gap-2" data-testid="cp-labels">
        {list.length === 0 && <span className="text-small text-fg-tertiary">No labels yet.</span>}
        {list.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1">
            <LabelChip label={l} />
            <IconButton label={`Delete label ${l.name}`} size="sm" variant="ghost" onClick={() => void save(list.filter((x) => x.id !== l.id))}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </span>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save([...list, { name, color }]);
        }}
      >
        <Field label="New label" htmlFor="cpl-name">
          <Input id="cpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={CP_LIMITS.labelName} data-testid="cp-label-name" />
        </Field>
        <Field label="Colour" htmlFor="cpl-color">
          <Select id="cpl-color" value={color} onChange={(e) => setColor(e.target.value as LabelColor)}>
            {LABEL_COLORS.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" disabled={!name.trim() || list.length >= CP_LIMITS.labels} data-testid="cp-label-add">
          Add label
        </Button>
      </form>
    </Card>
  );
}

function WipSection({ project, onChanged }: { project: OwnerProjectView; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const current = project.settings?.wip ?? DEFAULT_WIP;
  const [vals, setVals] = React.useState<Record<string, string>>({});
  React.useEffect(() => setVals(Object.fromEntries(TASK_STATUSES.map((s) => [s, current[s] ? String(current[s]) : '']))), [project.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const wip = Object.fromEntries(TASK_STATUSES.map((s) => [s, Math.max(0, Math.trunc(Number(vals[s] || 0)) || 0)]));
    const r = await apiJson(`/api/client-projects/${project.id}`, { method: 'PATCH', body: { wip } });
    toast({ message: r.success ? 'Column limits saved' : r.error || 'Could not save the limits.' });
    await onChanged();
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-h3 text-fg">Kanban column limits</h2>
        <p className="mt-0.5 text-small text-fg-secondary">A soft limit per column: over it, the column shows a warning. It never blocks a move. Empty or 0 = no limit.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {TASK_STATUSES.map((s) => (
          <Field key={s} label={STATUS_LABEL[s]} htmlFor={`cpw-${s}`} className="w-28">
            <Input id={`cpw-${s}`} type="number" min={0} max={CP_LIMITS.wipMax} value={vals[s] ?? ''} onChange={(e) => setVals({ ...vals, [s]: e.target.value })} />
          </Field>
        ))}
        <Button variant="secondary" onClick={() => void save()}>
          Save limits
        </Button>
      </div>
      {!project.settings?.wip && <Note>Using the defaults: In progress 8, Blocked 5.</Note>}
    </Card>
  );
}
