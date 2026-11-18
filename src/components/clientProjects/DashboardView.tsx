'use client';

/**
 * Dashboard: every number comes from GET /stats (server-computed, stats.ts). The same facts back the
 * "Ask Copilot" panel; with no AI key its answer is built from these facts alone (and says so).
 */
import * as React from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Input, Meter, Skeleton, StatTile } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateLong } from '@/lib/clientProjects/types';
import type { ProjectStats } from '@/lib/server/clientProjects/stats';
import { HealthChip } from '@/components/clientProjects/shared';

interface BurnPoint {
  date: string;
  done: number | null;
  planned: number;
  scope: number;
}
interface StatsResponse {
  stats: ProjectStats;
  burnUp: BurnPoint[];
  suggested: string[];
  ai: 'live' | 'stub' | 'off';
}

export function DashboardView({ projectId, onOpenKey, refreshKey }: { projectId: string; onOpenKey: (key: string) => void; refreshKey: string }) {
  const [data, setData] = React.useState<StatsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    void apiJson<StatsResponse>(`/api/client-projects/${projectId}/stats`).then((r) => (r.success ? (setData(r), setError(null)) : setError(r.error || 'Could not load the dashboard.')));
  }, [projectId, refreshKey]);
  if (error) return <p className="text-body text-danger-fg">{error}</p>;
  if (!data) return <Skeleton className="h-96 w-full" />;
  const s = data.stats;
  const onTrack = s.goal.plannedToDate ? s.goal.doneOfPlanned / s.goal.plannedToDate : 1;
  const keyLink = (k: string) => (
    <button key={k} type="button" className="focus-ring rounded-sm font-mono text-small text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg" onClick={() => onOpenKey(k)}>
      {k}
    </button>
  );
  const sevTotal = s.defects.open;
  return (
    <div className="cp-dashboard flex flex-col gap-5" data-testid="cp-dashboard">
      <div className="flex flex-wrap items-center gap-3">
        <HealthChip health={s.health} reasons={s.healthReasons} />
        <p className="text-small text-fg-secondary" data-testid="cp-health-reasons">
          {s.healthReasons.join(' ')}
        </p>
        <span className="ml-auto text-caption text-fg-tertiary">As of {fmtDateLong(s.asOf)}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="cp-dash-today">
        <StatTile label="Done today" value={String(s.doneToday.length)} />
        <StatTile label="Due today" value={String(s.dueToday.length)} />
        <StatTile label="Overdue" value={String(s.overdue.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-body-strong text-fg">Burn-up</h3>
            <span className="text-caption text-fg-tertiary">Cards done vs planned, by day</span>
          </div>
          <BurnUp points={data.burnUp} asOf={s.asOf} />
        </Card>
        <Card className="flex flex-col gap-3 p-4" data-testid="cp-dash-goal">
          <h3 className="text-body-strong text-fg">On track?</h3>
          <Meter value={onTrack} label="Planned to date that is done" className="h-2" />
          <p className="text-small text-fg-secondary">
            <span className="text-h3 tabular-nums text-fg">{s.goal.doneOfPlanned}</span> of {s.goal.plannedToDate} cards planned to date are done
            {s.goal.gap ? (
              <>
                {' '}
                · <span className="font-medium text-warning-fg">gap {s.goal.gap}</span>
              </>
            ) : (
              ' · no gap'
            )}
          </p>
          <p className="text-small text-fg-secondary">
            {s.totals.done} of {s.totals.cards} done overall ({s.totals.percentDone}%).
          </p>
          <div className="mt-auto border-t border-line pt-3" data-testid="cp-dash-milestone">
            <p className="text-caption text-fg-tertiary">Next milestone</p>
            {s.nextMilestone ? (
              <p className="mt-0.5 text-body text-fg">
                {keyLink(s.nextMilestone.key)} {s.nextMilestone.title}
                <span className={cn('block text-small', s.nextMilestone.daysTo < 0 ? 'text-danger-fg' : 'text-fg-secondary')}>
                  {fmtDate(s.nextMilestone.dueDate)} · {s.nextMilestone.daysTo < 0 ? `${-s.nextMilestone.daysTo} days overdue` : s.nextMilestone.daysTo === 0 ? 'today' : `in ${s.nextMilestone.daysTo} days (${s.nextMilestone.businessDaysTo} business)`}
                </span>
              </p>
            ) : (
              <p className="text-small text-fg-secondary">No open milestone with a date.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-2 p-4" data-testid="cp-dash-waiting">
          <h3 className="text-body-strong text-fg">Waiting on the client</h3>
          <p className="text-small text-fg-secondary">
            <span className="text-h3 tabular-nums text-fg">{s.waitingOnClient.count}</span> card{s.waitingOnClient.count === 1 ? '' : 's'} · {s.waitingOnClient.days} business day{s.waitingOnClient.days === 1 ? '' : 's'} late · client delay {s.clientDelay.totalDays} day{s.clientDelay.totalDays === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-x-2 gap-y-1">{s.waitingOnClient.cards.slice(0, 10).map((c) => keyLink(c.key))}</div>
        </Card>
        <Card className="flex flex-col gap-2 p-4" data-testid="cp-dash-defects">
          <h3 className="text-body-strong text-fg">Open defects</h3>
          <p className="text-h3 tabular-nums text-fg">{sevTotal}</p>
          <div className="flex flex-wrap gap-2">
            {(['S1', 'S2', 'S3', 'S4'] as const).map((k) => (
              <Badge key={k} tone={k === 'S1' && s.defects.bySeverity[k] ? 'danger' : k === 'S2' && s.defects.bySeverity[k] ? 'warning' : 'neutral'}>
                {k}: {s.defects.bySeverity[k]}
              </Badge>
            ))}
          </div>
        </Card>
        <Card className="flex flex-col gap-2 p-4" data-testid="cp-dash-blocked">
          <h3 className="text-body-strong text-fg">Blocked</h3>
          <p className="text-h3 tabular-nums text-fg">{s.blocked.length}</p>
          <ul className="flex flex-col gap-1 text-small text-fg-secondary">
            {s.blocked.slice(0, 5).map((b) => (
              <li key={b.key}>
                {keyLink(b.key)} {b.waitingOn.length ? `waits on ${b.waitingOn.join(', ')}` : 'in Blocked'}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="overflow-x-auto p-4" data-testid="cp-dash-workload">
        <h3 className="mb-2 text-body-strong text-fg">Workload</h3>
        <table className="w-full min-w-[520px] text-small">
          <thead className="text-left text-caption text-fg-tertiary">
            <tr>
              <th className="py-1 font-medium">Person</th>
              <th className="py-1 text-right font-medium">Open</th>
              <th className="py-1 text-right font-medium">Overdue</th>
              <th className="py-1 text-right font-medium">Due this week</th>
              <th className="py-1 text-right font-medium">Done this week</th>
              <th className="py-1 text-right font-medium">Estimate (h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.workload.map((w) => (
              <tr key={w.personId ?? 'none'} data-testid="cp-workload-row">
                <td className="py-1.5 text-fg">
                  {w.name}
                  {w.side === 'client' && <span className="ml-1 text-fg-tertiary">(client)</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums">{w.open}</td>
                <td className={cn('py-1.5 text-right tabular-nums', w.overdue && 'font-medium text-danger-fg')}>{w.overdue}</td>
                <td className="py-1.5 text-right tabular-nums">{w.dueThisWeek}</td>
                <td className="py-1.5 text-right tabular-nums">{w.doneThisWeek}</td>
                <td className="py-1.5 text-right tabular-nums">{w.openEstimateHours || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <AskCopilot projectId={projectId} suggested={data.suggested} ai={data.ai} onOpenKey={onOpenKey} />
    </div>
  );
}

/** A small SVG burn-up: done (solid), planned to date (dashed) and scope (faint), with a today marker. */
function BurnUp({ points, asOf }: { points: BurnPoint[]; asOf: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  if (points.length < 2) return <p className="text-small text-fg-tertiary">Not enough dated cards to draw a chart.</p>;
  const W = 640;
  const H = 200;
  const pad = { l: 30, r: 8, t: 8, b: 22 };
  const maxY = Math.max(1, ...points.map((p) => p.scope));
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
  const path = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .map((p, i) => `${i ? 'L' : 'M'}${p}`)
      .join(' ');
  const ti = points.findIndex((p) => p.date === asOf);
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const last = points.filter((p) => p.done !== null).pop();
  return (
    <figure className="cp-burnup m-0" data-testid="cp-burnup" data-points={points.length}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Burn-up: ${last?.done ?? 0} done of ${maxY} cards; ${last?.planned ?? 0} planned by today`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(maxY * f)} y2={y(maxY * f)} className="stroke-line" />
            <text x={pad.l - 6} y={y(maxY * f) + 3} textAnchor="end" className="fill-fg-tertiary text-[10px]">
              {Math.round(maxY * f)}
            </text>
          </g>
        ))}
        <path d={path(points.map((p) => p.scope))} className="fill-none stroke-line-strong" strokeWidth={1.5} />
        <path d={path(points.map((p) => p.planned))} className="fill-none stroke-fg-tertiary" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={path(points.map((p) => p.done))} className="fill-none stroke-action-brand" strokeWidth={2.5} />
        {ti >= 0 && <line x1={x(ti)} x2={x(ti)} y1={pad.t} y2={H - pad.b} className="stroke-fg-tertiary" strokeDasharray="2 2" />}
        {hover !== null && points[hover] && (
          <g data-testid="cp-burnup-tip" data-date={points[hover].date} pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-fg-secondary" strokeWidth={1} />
            {points[hover].done !== null && <circle cx={x(hover)} cy={y(points[hover].done as number)} r={4} className="fill-action-brand" />}
            {(() => {
              const pt = points[hover];
              const tx = Math.min(W - pad.r - 128, Math.max(pad.l, x(hover) + 8));
              return (
                <g transform={`translate(${tx} ${pad.t + 4})`}>
                  <rect width={124} height={50} rx={6} className="fill-inverse" />
                  <text x={8} y={16} className="fill-fg-inverse text-[11px] font-semibold">
                    {fmtDate(pt.date)}
                  </text>
                  <text x={8} y={31} className="fill-fg-inverse text-[11px]">
                    Done {pt.done === null ? '-' : pt.done}
                  </text>
                  <text x={8} y={44} className="fill-fg-inverse text-[11px]">
                    Planned {pt.planned}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
        {/* the whole plot height is the hover target */}
        <rect
          x={pad.l}
          y={pad.t}
          width={W - pad.l - pad.r}
          height={H - pad.t - pad.b}
          fill="transparent"
          data-testid="cp-burnup-hit"
          onPointerMove={(e) => {
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const vx = ((e.clientX - r.left) / r.width) * W;
            setHover(Math.max(0, Math.min(points.length - 1, Math.round(((vx - pad.l) / (W - pad.l - pad.r)) * (points.length - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
        />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-fg-tertiary text-[10px]">
            {fmtDate(points[i].date)}
          </text>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-caption text-fg-secondary">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 bg-action-brand" /> Done</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0 w-4 border-t border-dashed border-fg-tertiary" /> Planned</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 bg-line-strong" /> Scope</span>
      </figcaption>
    </figure>
  );
}

/** **bold** and "- " bullets only: the answer is plain text otherwise (never HTML). */
function Answer({ text, onOpenKey }: { text: string; onOpenKey: (k: string) => void }) {
  const inline = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*|\b[A-Z]{2,5}-\d{1,4}\b)/g).map((part, i) =>
      /^\*\*[^*]+\*\*$/.test(part) ? (
        <strong key={`${k}-${i}`}>{part.slice(2, -2)}</strong>
      ) : /^[A-Z]{2,5}-\d{1,4}$/.test(part) ? (
        <button key={`${k}-${i}`} type="button" className="focus-ring rounded-sm font-mono underline decoration-line-strong underline-offset-2" onClick={() => onOpenKey(part)}>
          {part}
        </button>
      ) : (
        <React.Fragment key={`${k}-${i}`}>{part}</React.Fragment>
      ),
    );
  return (
    <div className="flex flex-col gap-1.5 text-body text-fg" data-testid="cp-copilot-answer">
      {text.split('\n').map((l, i) =>
        l.startsWith('- ') ? (
          <p key={i} className="pl-4 -indent-3">
            • {inline(l.slice(2), String(i))}
          </p>
        ) : l.trim() ? (
          <p key={i}>{inline(l, String(i))}</p>
        ) : (
          <span key={i} className="h-1" />
        ),
      )}
    </div>
  );
}

function AskCopilot({ projectId, suggested, ai, onOpenKey }: { projectId: string; suggested: string[]; ai: string; onOpenKey: (k: string) => void }) {
  const [q, setQ] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState<{ q: string; text: string; source: string; tools: { name: string }[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    const r = await apiJson<{ answer: string; source: string; tools: { name: string }[] }>('/api/client-projects/copilot', { body: { question, projectId } });
    setBusy(false);
    if (!r.success) return setError(r.error || 'Copilot could not answer.');
    setAnswer({ q: question, text: r.answer, source: r.source, tools: r.tools });
    setQ('');
  };
  return (
    <Card className="cp-copilot flex flex-col gap-3 p-4" data-testid="cp-copilot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-body-strong text-fg">
          <Sparkles className="size-4" aria-hidden /> Ask Copilot
        </h3>
        <span className="text-caption text-fg-tertiary">{ai === 'live' ? 'Answers from the project facts, cited by card key.' : 'No AI key on this server: answers are built from the project facts.'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggested.map((s) => (
          <Button key={s} variant="secondary" size="sm" disabled={busy} onClick={() => void ask(s)} data-testid="cp-copilot-suggest">
            {s}
          </Button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <Input aria-label="Ask about this project" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask about this project" data-testid="cp-copilot-input" />
        <Button type="submit" variant="primary" icon={<Send />} loading={busy} disabled={!q.trim()}>
          Ask
        </Button>
      </form>
      {error && <p className="text-small text-danger-fg">{error}</p>}
      {answer && (
        <div className="rounded-md border border-line bg-app p-3" data-testid="cp-copilot-result" data-source={answer.source}>
          <p className="mb-2 text-caption text-fg-tertiary">
            {answer.q} · {answer.source === 'ai' ? 'AI, from the facts' : 'From the project facts'} · tools: {[...new Set(answer.tools.map((t) => t.name))].join(', ')}
          </p>
          <Answer text={answer.text} onOpenKey={onOpenKey} />
        </div>
      )}
    </Card>
  );
}
