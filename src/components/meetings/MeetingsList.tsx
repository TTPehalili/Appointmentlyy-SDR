'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Building2, CalendarCheck, CalendarClock, Phone, RefreshCw, UserRound } from 'lucide-react';
import { Avatar, Button, EmptyState, InlineError, PageHeader, SearchInput, Skeleton, Tabs, buttonClasses } from '@/components/ui';
import { useSession } from '@/lib/session';
import { can } from '@/lib/permissions';
import type { MeetingPlanSummary } from '@/lib/meetingPlan';
import { formatMeetingAt, formatUpdated, meetingPlansApi, sameEmail } from './meetingPlanClient';
import { MeetingStatusBadge } from './meetingUi';

type TabValue = 'mine' | 'booked' | 'all';
const POLL_MS = 4000;

/** Meetings: every plan the signed-in person runs (AE), booked (rep) or, for Supervisor+, the whole team's. */
export default function MeetingsList() {
  const { session, role } = useSession();
  const me = session.email || '';
  const seeAll = can(role, 'team');

  const [plans, setPlans] = React.useState<MeetingPlanSummary[] | null>(null);
  const [error, setError] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const [tab, setTab] = React.useState<TabValue | null>(null);
  const [query, setQuery] = React.useState('');
  const [now, setNow] = React.useState(() => Date.now());

  const apply = React.useCallback((r: Awaited<ReturnType<typeof meetingPlansApi.list>>, mode: 'initial' | 'manual' | 'poll') => {
    setRefreshing(false);
    setNow(Date.now());
    if (r.ok) {
      setPlans(r.plans);
      setError('');
    } else if (mode !== 'poll') {
      // A failed background check keeps the list on screen; the next poll tries again.
      setError(r.error);
    }
  }, []);
  const load = React.useCallback(
    (mode: 'manual' | 'poll') => {
      if (mode === 'manual') setRefreshing(true);
      return meetingPlansApi.list().then((r) => apply(r, mode));
    },
    [apply],
  );

  React.useEffect(() => {
    let live = true;
    void meetingPlansApi.list().then((r) => {
      if (live) apply(r, 'initial');
    });
    return () => {
      live = false;
    };
  }, [apply]);

  // While any plan is still being prepared, check again every few seconds.
  const preparing = (plans ?? []).some((p) => p.status === 'preparing');
  React.useEffect(() => {
    if (!preparing) return;
    const t = setTimeout(() => void load('poll'), POLL_MS);
    return () => clearTimeout(t);
  }, [preparing, plans, load]);

  const mine = React.useMemo(() => (plans ?? []).filter((p) => sameEmail(p.assignedAe, me)), [plans, me]);
  const booked = React.useMemo(() => (plans ?? []).filter((p) => sameEmail(p.bookedBy, me)), [plans, me]);

  // Default tab: where this person's meetings are (AEs: assigned; reps: booked; managers: all).
  const activeTab: TabValue =
    tab ?? (mine.length > 0 ? 'mine' : booked.length > 0 ? 'booked' : seeAll ? 'all' : 'mine');

  const source = activeTab === 'mine' ? mine : activeTab === 'booked' ? booked : plans ?? [];
  const q = query.trim().toLowerCase();
  const shown = [...source]
    .filter((p) =>
      !q
        ? true
        : [p.lead.name, p.lead.company, p.lead.email, p.assignedAeName, p.bookedByName].some((v) => (v || '').toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      if ((a.status === 'preparing') !== (b.status === 'preparing')) return a.status === 'preparing' ? -1 : 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

  const tabs = [
    { value: 'mine', label: 'My meetings', count: plans ? mine.length : undefined },
    { value: 'booked', label: 'Booked by me', count: plans ? booked.length : undefined },
    ...(seeAll ? [{ value: 'all', label: 'All', count: plans ? plans.length : undefined }] : []),
  ];

  return (
    <div className="min-h-full w-full space-y-6 bg-app px-4 py-6 md:px-8">
      <PageHeader
        title="Meetings"
        description="Booked meetings with an AI-prepared plan for the Account Executive and a one-page recap for the customer."
        secondaryActions={
          <Button variant="ghost" icon={<RefreshCw className={refreshing ? 'animate-spin' : undefined} />} onClick={() => void load('manual')} disabled={refreshing}>
            Refresh
          </Button>
        }
        tabs={
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1" data-testid="meetings-tabs">
              <Tabs items={tabs} value={activeTab} onChange={(v) => setTab(v as TabValue)} label="Meeting views" />
            </div>
            {plans && plans.length > 0 && (
              <div className="w-full sm:w-64">
                <SearchInput aria-label="Search meetings" placeholder="Search prospect, company, AE" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            )}
          </div>
        }
      />

      {error && <InlineError message={error} onRetry={() => void load('manual')} />}

      {!plans && !error && (
        <div className="grid gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading meetings">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      )}

      {plans && shown.length === 0 && (
        <div className="rounded-lg border border-line bg-surface" data-testid="meetings-empty">
          {q ? (
            <EmptyState icon={<CalendarCheck />} title="No meetings match your search" description="Try a different name or company." />
          ) : (
            <EmptyState
              icon={<CalendarCheck />}
              title={
                activeTab === 'mine' ? 'No meetings assigned to you yet' : activeTab === 'booked' ? 'You haven’t handed off a meeting yet' : 'No meeting plans yet'
              }
              description="When a rep logs “Booked” in the Dialer, a short handoff form opens. Choose the Account Executive and click “Create meeting plan”: the AI researches the company and the plan appears here in about a minute. You can also create one from a booked card in Pipeline."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/dialer" className={buttonClasses('primary')}>
                    <Phone aria-hidden />
                    Go to the Dialer
                  </Link>
                  <Link href="/pipeline" className={buttonClasses('secondary')}>
                    Open Pipeline
                  </Link>
                </div>
              }
            />
          )}
        </div>
      )}

      {plans && shown.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2" data-testid="meetings-list">
          {shown.map((p) => (
            <MeetingCard key={p.id} plan={p} now={now} me={me} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MeetingCard({ plan: p, now, me }: { plan: MeetingPlanSummary; now: number; me: string }) {
  const when = formatMeetingAt(p.meetingAt);
  const aeName = sameEmail(p.assignedAe, me) ? 'You' : p.assignedAeName || p.assignedAe || 'Unassigned';
  const bookedName = sameEmail(p.bookedBy, me) ? 'you' : p.bookedByName || p.bookedBy;
  return (
    <li>
      <Link
        href={`/meetings/${p.id}`}
        className="focus-ring group flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs transition-colors hover:border-line-strong"
        data-testid="meeting-card"
        data-plan-id={p.id}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-body-strong text-fg">{p.lead.name || p.lead.email || 'Unnamed prospect'}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-small text-fg-secondary">
              <Building2 className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
              <span className="truncate">
                {p.lead.company || 'Company not set'}
                {p.lead.title ? <span className="text-fg-tertiary"> · {p.lead.title}</span> : null}
              </span>
            </p>
          </div>
          <MeetingStatusBadge status={p.status} />
        </div>

        <dl className="grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Meeting time</dt>
            <CalendarClock className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
            <dd className={when ? 'truncate text-fg' : 'truncate text-fg-tertiary'}>{when || 'Time not set'}</dd>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Account Executive</dt>
            {p.assignedAeName || p.assignedAe ? (
              <Avatar name={p.assignedAeName || p.assignedAe} size="sm" />
            ) : (
              <UserRound className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
            )}
            <dd className="truncate text-fg">
              {aeName}
              <span className="text-fg-tertiary"> · AE</span>
            </dd>
          </div>
        </dl>

        {p.status === 'failed' && (
          <p className="flex items-start gap-1.5 rounded-md bg-danger-bg px-2.5 py-1.5 text-small text-danger-fg">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{p.error || 'The plan couldn’t be prepared. Open it to retry.'}</span>
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5 text-caption text-fg-tertiary">
          <span className="truncate">
            Booked by {bookedName || 'a rep'} · updated {formatUpdated(p.updatedAt, now)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-fg-secondary group-hover:text-fg">
            Open
            <ArrowRight className="size-3.5" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}
