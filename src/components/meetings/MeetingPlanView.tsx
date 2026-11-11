'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Building2, CalendarClock, Check, FileSearch, Globe, Loader2, PenLine, RotateCcw, Search, UserRound } from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { Button, ConfirmDialog, EmptyState, InlineError, Select, Skeleton, Tabs, buttonClasses, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/session';
import { can } from '@/lib/permissions';
import type { Assignee, MeetingPlan } from '@/lib/meetingPlan';
import type { OnePagerBrand } from '@/lib/onePagerRender';
import { displayHost, formatMeetingAt, formatUpdated, meetingPlansApi, sameEmail, toHref } from './meetingPlanClient';
import { MeetingStatusBadge } from './meetingUi';
import ActionPlanPanel from './ActionPlanPanel';
import OnePagerPanel from './OnePagerPanel';

const POLL_MS = 4000;
type TabValue = 'plan' | 'onepager';

/** One meeting plan: header, Action Plan tab (for the AE) and One-pager tab (for the customer). */
export default function MeetingPlanView({ id }: { id: string }) {
  const { session, role } = useSession();
  const toast = useToast();
  const canReassign = can(role, 'team');

  const [data, setData] = React.useState<{ plan: MeetingPlan; brand: OnePagerBrand } | null>(null);
  const [loadError, setLoadError] = React.useState<{ message: string; status: number } | null>(null);
  const [tab, setTab] = React.useState<TabValue>('plan');
  const [planDirty, setPlanDirty] = React.useState(false);
  const [pagerDirty, setPagerDirty] = React.useState(false);
  const [confirmRegen, setConfirmRegen] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);
  const [regenError, setRegenError] = React.useState('');
  // Bumped after a regenerate so the panels drop any half-finished edits.
  const [panelKey, setPanelKey] = React.useState(0);

  const apply = React.useCallback((r: Awaited<ReturnType<typeof meetingPlansApi.get>>, mode: 'initial' | 'poll') => {
    if (r.ok) {
      setData({ plan: r.plan, brand: r.brand });
      setLoadError(null);
    } else if (mode === 'initial') {
      setLoadError({ message: r.error, status: r.status });
    }
  }, []);
  const load = React.useCallback((mode: 'initial' | 'poll') => meetingPlansApi.get(id).then((r) => apply(r, mode)), [id, apply]);

  React.useEffect(() => {
    if (!id) return;
    let live = true;
    void meetingPlansApi.get(id).then((r) => {
      if (live) apply(r, 'initial');
    });
    return () => {
      live = false;
    };
  }, [id, apply]);

  const plan = data?.plan ?? null;
  const preparing = plan?.status === 'preparing';
  React.useEffect(() => {
    if (!preparing) return;
    const t = setTimeout(() => void load('poll'), POLL_MS);
    return () => clearTimeout(t);
  }, [preparing, data, load]);

  // Unsaved edits: warn before leaving the page.
  const dirty = planDirty || pagerDirty;
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const updatePlan = React.useCallback((p: MeetingPlan) => setData((d) => (d ? { ...d, plan: p } : d)), []);

  const regenerate = async () => {
    setRegenerating(true);
    setRegenError('');
    const r = await meetingPlansApi.regenerate(id);
    setRegenerating(false);
    if (!r.ok) {
      setRegenError(r.error);
      return;
    }
    updatePlan(r.plan);
    setPanelKey((k) => k + 1);
    setPlanDirty(false);
    setPagerDirty(false);
  };

  if (!id || loadError) {
    const notFound = !id || loadError?.status === 404 || loadError?.status === 403;
    return (
      <div className="px-4 py-6 md:px-8">
        <BackLink />
        {notFound ? (
          <EmptyState
            icon={<FileSearch />}
            title={loadError?.status === 403 ? 'This meeting plan isn’t shared with you' : 'Meeting plan not found'}
            description={
              loadError?.status === 403
                ? 'Plans are visible to the rep who booked, the assigned Account Executive and managers.'
                : 'It may have been removed, or the link is incomplete.'
            }
            action={
              <Link href="/meetings" className={buttonClasses('primary')}>
                Go to Meetings
              </Link>
            }
          />
        ) : (
          <InlineError message={loadError?.message || 'Couldn’t load the plan.'} onRetry={() => void load('initial')} className="mt-4" />
        )}
      </div>
    );
  }

  if (!plan || !data) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 md:px-8" aria-busy="true" aria-label="Loading meeting plan">
        <BackLink />
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-4 h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const failed = plan.status === 'failed';
  const hasContent = !preparing && !failed && (!!plan.plan || !!plan.onePager);

  return (
    <div className="min-h-full w-full bg-app px-4 py-6 md:px-8">
      <BackLink />
      <PlanHeader
        plan={plan}
        me={session.email}
        canReassign={canReassign}
        onReassigned={(p) => {
          updatePlan(p);
          toast({ message: `Assigned to ${p.assignedAeName || p.assignedAe}` });
        }}
        onRegenerate={() => (plan.plan || plan.onePager ? setConfirmRegen(true) : void regenerate())}
        regenerating={regenerating}
        disableRegenerate={preparing}
      />
      {regenError && <InlineError message={regenError} onRetry={() => void regenerate()} className="mb-4" />}

      {preparing && <PreparingState plan={plan} />}

      {failed && (
        <div className="rounded-lg border border-danger-fg/30 bg-surface p-6 shadow-xs" role="alert" data-testid="meeting-plan-failed">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-fg" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-h3 text-fg">The plan couldn’t be prepared</p>
              <p className="mt-1 text-body text-fg-secondary">{plan.error || 'Something went wrong while researching or writing the plan.'}</p>
              <p className="mt-1 text-small text-fg-tertiary">Your call notes are saved. Retrying usually works; if not, check the website address and try again later.</p>
              <Button variant="primary" icon={<RotateCcw />} className="mt-4" loading={regenerating} onClick={() => void regenerate()} data-testid="meeting-plan-retry">
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasContent && (
        <>
          <div data-testid="meeting-plan-tabs">
            <Tabs
              items={[
                { value: 'plan', label: planDirty ? 'Action Plan •' : 'Action Plan' },
                { value: 'onepager', label: pagerDirty ? 'One-pager •' : 'One-pager' },
              ]}
              value={tab}
              onChange={(v) => setTab(v as TabValue)}
              label="Meeting plan sections"
              className="mb-5"
            />
          </div>
          {/* Both stay mounted so edits survive switching tabs. */}
          <div hidden={tab !== 'plan'} role="tabpanel" aria-label="Action Plan">
            <ActionPlanPanel key={`plan-${panelKey}`} plan={plan} onSaved={updatePlan} onDirtyChange={setPlanDirty} />
          </div>
          <div hidden={tab !== 'onepager'} role="tabpanel" aria-label="One-pager">
            <OnePagerPanel key={`pager-${panelKey}`} plan={plan} brand={data.brand} onSaved={updatePlan} onDirtyChange={setPagerDirty} />
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => void regenerate()}
        title="Regenerate this plan?"
        description="The AI researches the company again and rewrites the Action Plan and one-pager. Edits you made to them will be replaced. Your call notes stay as they are."
        confirmLabel="Regenerate"
        tone="primary"
        icon={<RotateCcw />}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/meetings" className="focus-ring mb-4 inline-flex items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg">
      <ArrowLeft className="size-3.5" aria-hidden />
      Meetings
    </Link>
  );
}

function PlanHeader({
  plan,
  me,
  canReassign,
  onReassigned,
  onRegenerate,
  regenerating,
  disableRegenerate,
}: {
  plan: MeetingPlan;
  me: string;
  canReassign: boolean;
  onReassigned: (p: MeetingPlan) => void;
  onRegenerate: () => void;
  regenerating: boolean;
  disableRegenerate: boolean;
}) {
  const when = formatMeetingAt(plan.call.meetingAt);
  const site = plan.lead.website;
  const companyLi = plan.lead.companyLinkedinUrl;
  const personLi = plan.lead.personLinkedinUrl;
  const linkCls = 'focus-ring inline-flex items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg hover:underline';

  return (
    <header className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-h1 text-fg">{plan.lead.name || 'Prospect'}</h1>
            <MeetingStatusBadge status={plan.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-body text-fg-secondary">
            <Building2 className="size-4 text-fg-tertiary" aria-hidden />
            <span className="text-fg">{plan.lead.company}</span>
            {plan.lead.title && <span>· {plan.lead.title}</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {site && (
              <a href={toHref(site)} target="_blank" rel="noopener noreferrer" className={linkCls}>
                <Globe className="size-3.5" aria-hidden />
                {displayHost(site)}
              </a>
            )}
            {companyLi && (
              <a href={toHref(companyLi)} target="_blank" rel="noopener noreferrer" className={linkCls}>
                <LinkedinIcon className="size-3.5" />
                Company page
              </a>
            )}
            {personLi && (
              <a href={toHref(personLi)} target="_blank" rel="noopener noreferrer" className={linkCls}>
                <LinkedinIcon className="size-3.5" />
                {plan.lead.name.split(' ')[0] || 'Profile'}
              </a>
            )}
            {plan.lead.email && (
              <a href={`mailto:${plan.lead.email}`} className={cn(linkCls, 'font-mono')}>
                {plan.lead.email}
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<RotateCcw />}
            onClick={onRegenerate}
            loading={regenerating}
            disabled={disableRegenerate}
            title={disableRegenerate ? 'The plan is still being prepared' : 'Research again and rewrite the plan'}
            data-testid="meeting-plan-regenerate"
          >
            Regenerate
          </Button>
        </div>
      </div>

      <dl className="grid gap-3 rounded-lg border border-line bg-surface p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-caption text-fg-tertiary">
            <CalendarClock className="size-3.5" aria-hidden />
            Meeting
          </dt>
          <dd className={cn('mt-0.5 truncate text-body', when ? 'text-fg' : 'text-fg-tertiary')}>{when || 'Time not set'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-caption text-fg-tertiary">
            <UserRound className="size-3.5" aria-hidden />
            Account Executive
          </dt>
          <dd className="mt-0.5">
            {canReassign ? (
              <ReassignSelect plan={plan} onReassigned={onReassigned} />
            ) : (
              <span className="truncate text-body text-fg">
                {sameEmail(plan.assignedAe, me) ? 'You' : plan.assignedAeName || plan.assignedAe}
              </span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-caption text-fg-tertiary">
            <PenLine className="size-3.5" aria-hidden />
            Booked by
          </dt>
          <dd className="mt-0.5 truncate text-body text-fg">{sameEmail(plan.bookedBy, me) ? 'You' : plan.bookedByName || plan.bookedBy}</dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1.5 text-caption text-fg-tertiary">
            <Check className="size-3.5" aria-hidden />
            {plan.status === 'sent' && plan.sentAt ? 'Recap sent' : 'Updated'}
          </dt>
          <dd className="mt-0.5 truncate text-body text-fg">{formatUpdated(plan.status === 'sent' && plan.sentAt ? plan.sentAt : plan.updatedAt)}</dd>
        </div>
      </dl>
    </header>
  );
}

function ReassignSelect({ plan, onReassigned }: { plan: MeetingPlan; onReassigned: (p: MeetingPlan) => void }) {
  const toast = useToast();
  const [assignees, setAssignees] = React.useState<Assignee[] | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void meetingPlansApi.assignees().then((r) => {
      if (live) setAssignees(r.ok ? r.assignees : []);
    });
    return () => {
      live = false;
    };
  }, []);

  const list = assignees ?? [];
  const hasCurrent = list.some((a) => sameEmail(a.email, plan.assignedAe));
  const aes = list.filter((a) => /account executive/i.test(a.role));
  const rest = list.filter((a) => !/account executive/i.test(a.role));

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Account Executive"
        value={plan.assignedAe}
        disabled={saving || !assignees}
        className="h-8"
        data-testid="meeting-plan-reassign"
        onChange={async (e) => {
          const next = e.target.value;
          if (!next || sameEmail(next, plan.assignedAe)) return;
          setSaving(true);
          const r = await meetingPlansApi.update(plan.id, { assignedAe: next });
          setSaving(false);
          if (r.ok) onReassigned(r.plan);
          else toast({ message: r.error });
        }}
      >
        {!hasCurrent && <option value={plan.assignedAe}>{plan.assignedAeName || plan.assignedAe}</option>}
        {aes.length > 0 && (
          <optgroup label="Account Executives">
            {aes.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name || a.email}
              </option>
            ))}
          </optgroup>
        )}
        {rest.length > 0 && (
          <optgroup label="Everyone else">
            {rest.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name || a.email}
                {a.role ? ` · ${a.role}` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {saving && <Loader2 className="size-4 animate-spin text-fg-tertiary" aria-label="Saving" />}
    </div>
  );
}

const STEPS = [
  { label: 'Reading their website', icon: Globe },
  { label: 'Researching the company', icon: Search },
  { label: 'Writing the plan', icon: PenLine },
];

/** Friendly progress while the server works (the steps are timed estimates; polling finds the result). */
function PreparingState({ plan }: { plan: MeetingPlan }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const started = new Date(plan.updatedAt || plan.createdAt).getTime();
  const elapsed = Number.isNaN(started) ? 0 : Math.max(0, (now - started) / 1000);
  const current = elapsed < 12 ? 0 : elapsed < 35 ? 1 : 2;
  const slow = elapsed > 120;

  return (
    <div className="rounded-lg border border-line bg-surface p-6 shadow-xs md:p-8" role="status" aria-live="polite" data-testid="meeting-plan-preparing">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-selected text-brand-text">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </span>
        <p className="mt-4 text-h3 text-fg">Preparing the meeting plan</p>
        <p className="mt-1 text-body text-fg-secondary">
          This usually takes about a minute. You can leave this page: the plan keeps preparing and will be under Meetings.
        </p>
        <ol className="mt-6 flex w-full flex-col gap-2 text-left">
          {STEPS.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'todo';
            const Icon = s.icon;
            return (
              <li
                key={s.label}
                className={cn(
                  'flex items-center gap-3 rounded-md border px-3 py-2.5 text-body transition-colors',
                  state === 'active' ? 'border-line-strong bg-subtle text-fg' : 'border-line text-fg-secondary',
                  state === 'todo' && 'text-fg-tertiary',
                )}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full',
                    state === 'done' ? 'bg-success-bg text-success-fg' : state === 'active' ? 'bg-selected text-brand-text' : 'bg-subtle text-fg-tertiary',
                  )}
                >
                  {state === 'done' ? <Check className="size-3.5" aria-hidden /> : state === 'active' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Icon className="size-3.5" aria-hidden />}
                </span>
                {s.label}
                {i === 0 && !plan.lead.website && <span className="ml-auto text-caption text-fg-tertiary">no website given</span>}
              </li>
            );
          })}
        </ol>
        {slow && <p className="mt-4 text-small text-fg-tertiary">Taking longer than usual. It will show “Needs retry” if something went wrong.</p>}
      </div>
    </div>
  );
}
