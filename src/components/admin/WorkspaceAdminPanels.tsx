'use client';

/**
 * Admin panels for real (client) workspaces: they show the workspace's own people, activity and
 * audit trail, or a clean empty state. The demo workspace keeps its sample panels in
 * AdminControlCentre.
 */
import * as React from 'react';
import Link from 'next/link';
import { ClipboardList, Headphones, ScrollText, Users } from 'lucide-react';
import { EmptyState, InlineError, PageHeader, Skeleton, buttonClasses } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { getStoredActivities, subscribeToActivities, type CadenceActivityRecord } from '@/lib/activityStore';

const TH_ROW = 'h-9 bg-subtle';
const TH = 'px-4 text-caption font-medium text-fg-tertiary';
const TR = 'border-t border-line transition-colors duration-150 hover:bg-subtle';

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
}

function useTodaysActivities(): CadenceActivityRecord[] {
  const [activities, setActivities] = React.useState<CadenceActivityRecord[]>([]);
  React.useEffect(() => {
    const load = () => {
      const today = new Date().toDateString();
      setActivities(getStoredActivities().filter((a) => new Date(a.isoDate).toDateString() === today));
    };
    void Promise.resolve().then(load);
    return subscribeToActivities(load);
  }, []);
  return activities;
}

/** Rep roster: the workspace's members with today's logged dials and bookings. */
export function WorkspaceRepRoster() {
  const [members, setMembers] = React.useState<MemberRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const activities = useTodaysActivities();

  const load = React.useCallback(async () => {
    const res = await apiJson<{ members: MemberRow[] }>('/api/tenant/members');
    setError(null);
    if (!res.success) {
      setError(res.error || 'Could not load the roster.');
      return;
    }
    setMembers(res.members.filter((m) => m.status === 'active'));
  }, []);

  React.useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const statsFor = (name: string) => {
    const mine = activities.filter((a) => (a.repName || '').toLowerCase() === name.toLowerCase());
    return {
      dials: mine.filter((a) => a.channel === 'Phone').length,
      booked: mine.filter((a) => /book|meeting|appointment/i.test(a.disposition || '')).length,
    };
  };

  return (
    <div>
      <PageHeader
        title="Rep roster"
        description="Your workspace's people with today's logged dials and bookings."
        primaryAction={
          <Link href="/admin/members" className={buttonClasses('secondary', 'md')}>
            <Users className="h-4 w-4" aria-hidden />
            <span>Manage members</span>
          </Link>
        }
      />
      {error ? (
        <InlineError message={error} onRetry={load} />
      ) : members === null ? (
        <Skeleton className="h-40 w-full" />
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          <EmptyState
            icon={<Users />}
            title="No reps yet"
            description="Invite your team in Members & seats. They appear here once they've joined."
          />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface shadow-xs overflow-x-auto">
          <table className="w-full border-collapse text-left text-body tabular-nums">
            <thead>
              <tr className={TH_ROW}>
                <th scope="col" className={TH}>Person</th>
                <th scope="col" className={TH}>Role</th>
                <th scope="col" className={`${TH} text-right`}>Dials today</th>
                <th scope="col" className={`${TH} text-right`}>Bookings today</th>
                <th scope="col" className={`${TH} text-right`}>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const name = m.name || m.email;
                const s = statsFor(name);
                return (
                  <tr key={m.id} className={TR}>
                    <td className="px-4 py-3">
                      <div className="text-body-strong text-fg">{name}</div>
                      {m.name && <div className="text-small text-fg-tertiary">{m.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{m.role}</td>
                    <td className="px-4 py-3 text-right text-fg">{s.dials}</td>
                    <td className="px-4 py-3 text-right text-fg">{s.booked}</td>
                    <td className="px-4 py-3 text-right text-small text-fg-secondary whitespace-nowrap">{when(m.lastLoginAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AuditRow {
  id?: string;
  at: string;
  actorEmail: string;
  action: string;
  target: string;
  detail?: Record<string, unknown>;
}

const actionLabel = (a: string) => a.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Audit log: the workspace's real sign-in, invite and access events (GET /api/tenant/audit). */
export function WorkspaceAuditLog() {
  const [entries, setEntries] = React.useState<AuditRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await apiJson<{ entries: AuditRow[] }>('/api/tenant/audit');
    setError(null);
    if (!res.success) {
      setError(res.error || 'Could not load the audit log.');
      return;
    }
    setEntries(res.entries || []);
  }, []);

  React.useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div>
      <PageHeader title="Audit log" description="Sign-ins, invites and access changes in this workspace." />
      {error ? (
        <InlineError message={error} onRetry={load} />
      ) : entries === null ? (
        <Skeleton className="h-40 w-full" />
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          <EmptyState icon={<ScrollText />} title="No events yet" description="Sign-ins, invites and access changes will be recorded here." />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface shadow-xs overflow-x-auto">
          <table className="w-full border-collapse text-left text-body">
            <thead>
              <tr className={TH_ROW}>
                <th scope="col" className={TH}>Event</th>
                <th scope="col" className={TH}>Actor</th>
                <th scope="col" className={TH}>Target</th>
                <th scope="col" className={`${TH} text-right`}>Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <tr key={e.id || `${e.at}-${idx}`} className={TR}>
                  <td className="px-4 py-3 text-fg">{actionLabel(e.action)}</td>
                  <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{e.actorEmail}</td>
                  <td className="px-4 py-3 text-fg-secondary">{e.target || '—'}</td>
                  <td className="px-4 py-3 text-right text-small tabular-nums text-fg-secondary whitespace-nowrap">{when(e.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Leads & cadences for real workspaces: leads live in Contacts, which has the real CSV import. */
export function WorkspaceLeadsEmpty() {
  return (
    <div>
      <PageHeader title="Leads & cadences" description="Import prospect lists and review each lead's multichannel cadence." />
      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <EmptyState
          icon={<ClipboardList />}
          title="No leads yet"
          description="Import a CSV or add leads in Contacts, or pull a list in Lead Finder."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/contacts" className={buttonClasses('primary', 'sm')}>Go to Contacts</Link>
              <Link href="/lead-finder" className={buttonClasses('secondary', 'sm')}>Open Lead Finder</Link>
            </div>
          }
        />
      </div>
    </div>
  );
}

/** Call QA reviews for real workspaces: none until calls are reviewed. */
export function WorkspaceQaEmpty() {
  return (
    <div>
      <PageHeader title="Call QA reviews" description="Scored calls with transcripts and coaching notes." />
      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <EmptyState icon={<Headphones />} title="No call reviews yet" description="Reviewed calls and their scores will appear here." />
      </div>
    </div>
  );
}
