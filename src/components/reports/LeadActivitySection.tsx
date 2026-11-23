'use client';

import * as React from 'react';
import { ClipboardCheck, ExternalLink } from 'lucide-react';
import { Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Skeleton } from '@/components/ui';
import { LEAD_ACTIVITY_LIMITS, type LeadActivityReport } from '@/lib/integrations';
import { localDayKey } from '@/lib/leadActivityChecklist';

/**
 * Reports > Lead activity: what each person ticked on the activity checklist (Contacts lead panel),
 * by lead and day. Supervisors and above pick a person; everyone else sees only their own.
 * The server decides whose rows come back; this only shows them.
 */

type State = { kind: 'loading' } | { kind: 'ready'; report: LeadActivityReport } | { kind: 'unavailable' } | { kind: 'error'; message: string };

const startOfDay = (day: string) => new Date(`${day}T00:00:00`);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayLabel = (day: string) => startOfDay(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function LeadActivitySection() {
  const [today] = React.useState(() => localDayKey(new Date()));
  const [fromDay, setFromDay] = React.useState(today);
  const [toDay, setToDay] = React.useState(today);
  const [member, setMember] = React.useState('');
  const [state, setState] = React.useState<State>({ kind: 'loading' });
  const [reload, setReload] = React.useState(0);
  // Who the viewer may pick, kept from the last good answer so the picker stays put while loading.
  const [people, setPeople] = React.useState<{ canPick: boolean; members: LeadActivityReport['members'] }>({ canPick: false, members: [] });

  const from = startOfDay(fromDay);
  const toEnd = addDays(startOfDay(toDay), 1);
  const rangeDays = Math.round((toEnd.getTime() - from.getTime()) / 86_400_000);
  const rangeError = Number.isNaN(from.getTime()) || Number.isNaN(toEnd.getTime())
    ? 'Pick a start and an end date.'
    : rangeDays < 1
      ? 'The end date must be on or after the start date.'
      : rangeDays > LEAD_ACTIVITY_LIMITS.maxRangeDays
        ? `Pick a range of ${LEAD_ACTIVITY_LIMITS.maxRangeDays} days or less.`
        : '';

  React.useEffect(() => {
    if (rangeError) return;
    const ctrl = new AbortController();
    const params = new URLSearchParams({ from: from.toISOString(), to: toEnd.toISOString(), tz: String(-from.getTimezoneOffset()) });
    if (member) params.set('member', member);
    (async () => {
      try {
        const res = await fetch(`/api/activity/lead-activity?${params}`, { credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal });
        const data = (await res.json().catch(() => null)) as (LeadActivityReport & { success?: boolean; error?: string }) | null;
        if (res.ok && data?.success && Array.isArray(data.reps)) {
          setPeople({ canPick: !!data.canSeeEveryone, members: Array.isArray(data.members) ? data.members : [] });
          setState({ kind: 'ready', report: data });
        }
        else if (res.status === 400 && data?.error) setState({ kind: 'error', message: data.error });
        else setState({ kind: 'unavailable' });
      } catch {
        if (!ctrl.signal.aborted) setState({ kind: 'unavailable' });
      }
    })();
    return () => ctrl.abort();
    // from / toEnd are derived from fromDay / toDay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDay, toDay, member, reload, rangeError]);

  const report = state.kind === 'ready' ? state.report : null;
  const canPick = people.canPick;
  const totals: Record<string, number> = {};
  let total = 0;
  for (const rep of report?.reps ?? []) {
    total += rep.total;
    for (const [k, n] of Object.entries(rep.totals)) totals[k] = (totals[k] || 0) + n;
  }
  const showPerson = canPick && !member;

  return (
    <Card as="section" data-testid="lead-activity" aria-label="Lead activity">
      <CardHeader
        title="Lead activity"
        description={canPick ? 'What your team ticked on the activity checklist, lead by lead.' : 'What you ticked on the activity checklist, lead by lead.'}
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {canPick && (
            <Field label="Person" htmlFor="lead-activity-member">
              <Select id="lead-activity-member" value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="">Everyone</option>
                {people.members.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="From" htmlFor="lead-activity-from">
            <Input id="lead-activity-from" type="date" value={fromDay} max={today} onChange={(e) => setFromDay(e.target.value)} aria-invalid={!!rangeError} />
          </Field>
          <Field label="To" htmlFor="lead-activity-to">
            <Input id="lead-activity-to" type="date" value={toDay} max={today} onChange={(e) => setToDay(e.target.value)} aria-invalid={!!rangeError} />
          </Field>
        </div>

        {rangeError ? (
          <p className="text-small text-danger-fg" role="alert" data-lead-activity-state="range">
            {rangeError}
          </p>
        ) : state.kind === 'loading' ? (
          <div className="space-y-2" data-lead-activity-state="loading" aria-busy="true">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : state.kind === 'error' ? (
          <p className="text-small text-danger-fg" role="alert" data-lead-activity-state="error">
            {state.message}
          </p>
        ) : state.kind === 'unavailable' ? (
          <div data-lead-activity-state="unavailable">
            <EmptyState
              className="py-10"
              icon={<ClipboardCheck />}
              title="Activity isn't available right now"
              description="Ticks are still saved on each lead. Please try again in a few minutes."
              action={
                <button
                  type="button"
                  className="focus-ring rounded-sm text-small text-fg-secondary underline hover:text-fg cursor-pointer"
                  onClick={() => {
                    setState({ kind: 'loading' });
                    setReload((n) => n + 1);
                  }}
                >
                  Try again
                </button>
              }
            />
          </div>
        ) : total === 0 ? (
          <div data-lead-activity-state="empty">
            <EmptyState
              className="py-10"
              icon={<ClipboardCheck />}
              title="No activity ticked for these dates"
              description="Open a lead in Contacts and tick what was done. It shows up here."
            />
          </div>
        ) : (
          <div className="space-y-4" data-lead-activity-state="ready">
            <ul className="flex flex-wrap gap-2" aria-label="Totals" data-lead-activity-totals>
              {report!.activities
                .filter((a) => totals[a.key])
                .map((a) => (
                  <li key={a.key} className="inline-flex items-center gap-2 rounded-sm border border-line bg-subtle px-2.5 py-1 text-small text-fg-secondary">
                    <span>{a.label}</span>
                    <span className="text-body-strong text-fg tabular-nums">{totals[a.key]}</span>
                  </li>
                ))}
            </ul>
            {report!.truncated && (
              <p className="text-small text-fg-tertiary">This is a busy range, so some older activity is not shown. Pick fewer days to see everything.</p>
            )}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[560px] border-collapse text-left text-body">
                <thead>
                  <tr className="bg-subtle text-caption text-fg-tertiary whitespace-nowrap">
                    <th scope="col" className="h-10 px-3 font-medium">Day</th>
                    {showPerson && <th scope="col" className="h-10 px-3 font-medium">Person</th>}
                    <th scope="col" className="h-10 px-3 font-medium">Lead</th>
                    <th scope="col" className="h-10 px-3 font-medium">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {report!.reps.flatMap((rep) =>
                    rep.days.flatMap((d) =>
                      d.leads.map((lead, i) => (
                        <tr key={`${rep.email}|${d.day}|${i}`} className="border-t border-line align-top" data-lead-activity-row>
                          <td className="px-3 py-2.5 text-small text-fg-secondary whitespace-nowrap tabular-nums">{dayLabel(d.day)}</td>
                          {showPerson && <td className="px-3 py-2.5 text-fg whitespace-nowrap">{rep.name}</td>}
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-1.5 text-body-strong text-fg">
                              <span>{lead.name}</span>
                              {lead.linkedinUrl && (
                                <a
                                  href={lead.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`LinkedIn profile of ${lead.name}`}
                                  className="focus-ring rounded-sm text-fg-tertiary hover:text-fg"
                                >
                                  <ExternalLink className="size-3.5" aria-hidden />
                                </a>
                              )}
                            </span>
                            {(lead.title || lead.company) && (
                              <span className="block text-small text-fg-tertiary">{[lead.title, lead.company].filter(Boolean).join(' at ')}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <ul className="space-y-0.5">
                              {lead.activities.map((a, k) => (
                                <li key={k} className="flex flex-wrap items-baseline gap-x-2">
                                  <span className="text-fg">{a.label}</span>
                                  <span className="text-caption text-fg-tertiary tabular-nums">{timeLabel(a.at)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )),
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
