'use client';

/** The List view (v1 table plus bulk actions) and the read-only Timeline (a simple Gantt in SVG). */
import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, DataTable, EmptyState, Select, useToast, type Column } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import {
  PHASES,
  PHASE_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  TYPE_LABEL,
  fmtDate,
  todayManila,
  type Label,
  type OwnerTaskView,
  type Person,
} from '@/lib/clientProjects/types';
import { AssigneeBadge, DueText, LabelChip, PriorityMark, SeverityChip, SideChip, StatusChip } from '@/components/clientProjects/shared';

// ------------------------------------------------------------------ List

export function ListView({ projectId, rows, total, people, labels, onOpen, onChanged }: { projectId: string; rows: OwnerTaskView[]; total: number; people: Person[]; labels: Label[]; onOpen: (t: OwnerTaskView) => void; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const columns: Column<OwnerTaskView>[] = [
    { key: 'key', header: 'Key', width: 'w-24', cell: (t) => <span className="whitespace-nowrap font-mono text-small text-fg-secondary">{t.key}</span> },
    {
      key: 'title',
      header: 'Title',
      cell: (t) => (
        <span className="flex min-w-48 items-center gap-1.5">
          <PriorityMark priority={t.priority} />
          <span className="line-clamp-1 text-body text-fg">{t.title}</span>
        </span>
      ),
    },
    { key: 'type', header: 'Type', cell: (t) => <span className="whitespace-nowrap text-small text-fg-secondary">{TYPE_LABEL[t.type]}</span> },
    {
      key: 'owner',
      header: 'Owner',
      cell: (t) => {
        const a = people.find((p) => p.id === t.assigneeId);
        return a ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-small text-fg">
            <AssigneeBadge person={a} />
            {a.name}
          </span>
        ) : (
          <SideChip side={t.ownerSide} />
        );
      },
    },
    { key: 'status', header: 'Status', cell: (t) => <StatusChip status={t.status} /> },
    { key: 'due', header: 'Due', cell: (t) => <DueText date={t.dueDate} overdue={t.overdue} done={t.status === 'done'} /> },
    {
      key: 'labels',
      header: 'Labels',
      cell: (t) => (
        <span className="flex flex-wrap gap-1">
          {labels
            .filter((l) => (t.labelIds ?? []).includes(l.id))
            .slice(0, 2)
            .map((l) => (
              <LabelChip key={l.id} label={l} />
            ))}
        </span>
      ),
    },
    { key: 'severity', header: 'Severity', cell: (t) => (t.type === 'defect' ? <SeverityChip severity={t.severity} /> : <span className="text-fg-tertiary">-</span>) },
  ];

  const bulk = async (ids: string[], body: Record<string, unknown>, clear: () => void) => {
    setBusy(true);
    const r = await apiJson<{ updated: string[]; skipped: { key: string; reason: string }[] }>(`/api/client-projects/${projectId}/tasks/bulk`, { body: { ids, ...body } });
    setBusy(false);
    if (!r.success) return toast({ message: r.error || 'Could not change the cards.' });
    toast({ message: `${r.updated.length} card${r.updated.length === 1 ? '' : 's'} changed${r.skipped.length ? `; ${r.skipped.length} skipped (${r.skipped[0].key}: ${r.skipped[0].reason})` : ''}` });
    clear();
    await onChanged();
  };
  const pick = (label: string, testid: string, options: [string, string][], make: (v: string) => Record<string, unknown>, ids: string[], clear: () => void) => (
    <div className="w-36">
      <Select
        aria-label={label}
        data-testid={testid}
        value=""
        disabled={busy}
        onChange={(e) => {
          if (e.target.value) void bulk(ids, make(e.target.value), clear);
        }}
        className="h-8"
      >
        <option value="">{label}…</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <DataTable
        label="Cards"
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        onRowClick={onOpen}
        bulkActions={(ids, clear) => (
          <div className="flex flex-wrap items-center gap-2" data-testid="cp-bulk-bar">
            {pick('Set status', 'cp-bulk-status', TASK_STATUSES.map((s) => [s, STATUS_LABEL[s]]), (v) => ({ status: v }), ids, clear)}
            {pick('Assign to', 'cp-bulk-assignee', [['__none', 'Nobody'], ...people.map((p) => [p.id, `${p.name}${p.side === 'client' ? ' (client)' : ''}`] as [string, string])], (v) => ({ assigneeId: v === '__none' ? null : v }), ids, clear)}
            {pick('Priority', 'cp-bulk-priority', [['__none', 'None'], ...PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]] as [string, string])], (v) => ({ priority: v === '__none' ? null : v }), ids, clear)}
            {labels.length > 0 && pick('Add label', 'cp-bulk-label', labels.map((l) => [l.id, l.name]), (v) => ({ addLabelId: v }), ids, clear)}
          </div>
        )}
        empty={<EmptyState icon={<Plus />} title="No cards match" description={total ? 'Change the filters to see more.' : 'Add a card, or load the SOP cards.'} className="py-10" />}
      />
    </Card>
  );
}

// ------------------------------------------------------------------ Timeline (read-only Gantt)

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const ROW = 26;
const LEFT = 240;

/**
 * One bar per card from its start date (or, without one, its due date: a one-day bar) to its due date,
 * grouped by phase. Milestones are diamonds, today is a line. Cards without a due date are listed apart.
 */
export function TimelineView({ tasks, onOpen }: { tasks: OwnerTaskView[]; onOpen: (t: OwnerTaskView) => void }) {
  const today = todayManila();
  const dated = tasks.filter((t) => t.dueDate && t.type !== 'defect');
  const undated = tasks.filter((t) => !t.dueDate && t.type !== 'defect');
  if (!dated.length) return <EmptyState icon={<Plus />} title="Nothing to draw yet" description="Cards with a due date appear here as bars." />;
  const starts = dated.map((t) => (t.startDate && t.startDate <= (t.dueDate as string) ? t.startDate : (t.dueDate as string)));
  const min = Math.min(...starts.map(toMs), toMs(today)) - 2 * DAY;
  const max = Math.max(...dated.map((t) => toMs(t.dueDate as string)), toMs(today)) + 3 * DAY;
  const days = Math.round((max - min) / DAY);
  const px = days > 120 ? 8 : days > 60 ? 14 : 22;
  const width = LEFT + days * px;
  const x = (d: string) => LEFT + ((toMs(d) - min) / DAY) * px;
  type Row = { kind: 'phase'; label: string } | { kind: 'task'; t: OwnerTaskView; start: string };
  const rows: Row[] = [];
  for (const ph of PHASES) {
    const list = dated.filter((t) => t.phase === ph).sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string) || a.sort - b.sort);
    if (!list.length) continue;
    rows.push({ kind: 'phase', label: PHASE_LABEL[ph] });
    for (const t of list) rows.push({ kind: 'task', t, start: t.startDate && t.startDate <= (t.dueDate as string) ? t.startDate : (t.dueDate as string) });
  }
  const height = 28 + rows.length * ROW;
  const ticks: string[] = [];
  for (let m = min; m <= max; m += DAY) {
    const d = new Date(m);
    if (d.getUTCDay() === 1) ticks.push(d.toISOString().slice(0, 10));
  }
  return (
    <div className="flex flex-col gap-3">
      <Card className="cp-timeline overflow-x-auto" data-testid="cp-timeline">
        <svg width={width} height={height} role="img" aria-label="Timeline of the cards by phase" className="block text-fg">
          {ticks.map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={20} y2={height} className="stroke-line" strokeWidth={1} />
              <text x={x(d) + 3} y={14} className="fill-fg-tertiary text-[10px]">
                {fmtDate(d)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const y = 28 + i * ROW;
            if (r.kind === 'phase')
              return (
                <text key={`p${i}`} x={12} y={y + 17} className="fill-fg text-[12px] font-semibold">
                  {r.label}
                </text>
              );
            const t = r.t;
            const x1 = x(r.start);
            const x2 = x(t.dueDate as string) + px;
            const tone = t.status === 'done' ? 'fill-success-500' : t.overdue ? 'fill-danger-700' : t.ownerSide === 'client' ? 'fill-fg-tertiary' : 'fill-fg';
            return (
              <g key={t.id} data-testid={t.type === 'milestone' ? 'cp-tl-milestone' : 'cp-tl-bar'} data-key={t.key} className="cursor-pointer" onClick={() => onOpen(t)}>
                <title>{`${t.key} ${t.title} · ${r.start === t.dueDate ? fmtDate(t.dueDate) : `${fmtDate(r.start)} – ${fmtDate(t.dueDate)}`} · ${STATUS_LABEL[t.status]}`}</title>
                <text x={24} y={y + 17} className={cn('text-[11px]', t.status === 'done' ? 'fill-fg-tertiary' : 'fill-fg-secondary')}>
                  {`${t.key} ${t.title}`.slice(0, 34)}
                </text>
                {t.type === 'milestone' ? (
                  <rect x={x2 - px / 2 - 6} y={y + 7} width={12} height={12} transform={`rotate(45 ${x2 - px / 2} ${y + 13})`} className={tone} />
                ) : (
                  <rect x={x1} y={y + 7} width={Math.max(px - 2, x2 - x1 - 2)} height={12} rx={3} className={tone} opacity={t.status === 'done' ? 0.55 : 0.85} />
                )}
              </g>
            );
          })}
          <line x1={x(today)} x2={x(today)} y1={18} y2={height} className="stroke-action-brand" strokeWidth={2} data-testid="cp-tl-today" />
          <text x={x(today) + 4} y={26} className="fill-action-brand text-[10px] font-semibold">
            Today
          </text>
        </svg>
      </Card>
      <p className="text-caption text-fg-tertiary">Read-only. Bars run from the start date to the due date (a card without a start date is a one-day bar on its due date). Diamonds are milestones; client items are grey; overdue is red; done is green.</p>
      {undated.length > 0 && (
        <p className="text-small text-fg-secondary">
          No due date ({undated.length}):{' '}
          {undated.map((t, i) => (
            <React.Fragment key={t.id}>
              {i > 0 && ', '}
              <Button variant="ghost" size="sm" className="h-auto px-1 py-0" onClick={() => onOpen(t)}>
                {t.key}
              </Button>
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}
