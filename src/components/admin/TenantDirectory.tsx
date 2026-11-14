'use client';

import * as React from 'react';
import { Building2, Check, Copy, Eye, Plus, Send, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  InlineError,
  Input,
  Meter,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  Stepper,
  useToast,
} from '@/components/ui';
import { apiJson, getServerAuth, switchWorkspaceOnServer } from '@/lib/authClient';
import { setStoredSession } from '@/lib/session';
import { claimTenantStorage } from '@/lib/tenantStorage';
import { EMAIL_RE, TENANT_CODE_RE, toTenantCode } from '@/lib/roles';
import { DEFAULT_BRAND_500, checkBrandColor, deriveBrandTokens, normalizeHex } from '@/lib/theme';

interface TenantRow {
  code: string;
  name: string;
  plan: string;
  seatLimit: number;
  status: 'active' | 'suspended';
  modules: Record<string, boolean>;
  branding: { brandColor?: string; displayName?: string; logoInitials?: string; supportEmail?: string };
  createdAt: string;
  seatsUsed: number;
  activeMembers: number;
  pendingInvites: number;
  admins: { email: string; name: string; status: string }[];
}

const MODULES: { key: string; label: string; hint: string }[] = [
  { key: 'dialer', label: 'Dialer', hint: 'Calling cockpit, call outcomes, callbacks' },
  { key: 'practice', label: 'Practice', hint: 'AI role-play with buyer personas' },
  { key: 'certificationGate', label: 'Certification gate', hint: 'Reps must pass certification before live calls' },
  { key: 'leadFinder', label: 'Lead Finder', hint: 'Search and pull decision-makers' },
  { key: 'outreach', label: 'Outreach', hint: 'Cold email and LinkedIn studio' },
];

const PLANS = ['Pilot', 'Standard', 'GTM Turnkey', 'Enterprise'];

/** Copy text and show a short toast. */
function useCopy() {
  const toast = useToast();
  return (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ message: `${what} copied` }),
      () => toast({ message: 'Copy failed. Select the link and copy it manually.' }),
    );
  };
}

/** Platform Console › Tenants: every client workspace, onboarding wizard, seats, suspend, view-as. */
export function TenantDirectory() {
  const toast = useToast();
  const [rows, setRows] = React.useState<TenantRow[] | null>(null);
  const [storage, setStorage] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'active' | 'suspended'>('all');
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [seatTenant, setSeatTenant] = React.useState<TenantRow | null>(null);
  const [inviteTenant, setInviteTenant] = React.useState<TenantRow | null>(null);
  const [suspendTenant, setSuspendTenant] = React.useState<TenantRow | null>(null);
  const [opening, setOpening] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await apiJson<{ tenants: TenantRow[]; storage: string }>('/api/platform/tenants');
    if (!res.success) {
      setError(res.error || 'Could not load workspaces.');
      return;
    }
    setError(null);
    setRows(res.tenants);
    setStorage(res.storage);
  }, []);

  React.useEffect(() => {
    // Defer to a microtask so the first fetch never sets state during the effect itself.
    void Promise.resolve().then(load);
  }, [load]);

  const setTenantStatus = async (t: TenantRow, next: 'active' | 'suspended') => {
    const res = await apiJson(`/api/platform/tenants/${encodeURIComponent(t.code)}`, { method: 'PATCH', body: { status: next } });
    if (!res.success) return toast({ message: res.error || 'Could not update the workspace.' });
    toast({ message: next === 'suspended' ? `${t.name} suspended. Its people are signed out.` : `${t.name} is active again.` });
    load();
  };

  const toggleModule = async (t: TenantRow, key: string) => {
    const res = await apiJson(`/api/platform/tenants/${encodeURIComponent(t.code)}`, {
      method: 'PATCH',
      body: { modules: { [key]: !t.modules[key] } },
    });
    if (!res.success) return toast({ message: res.error || 'Could not update modules.' });
    load();
  };

  const openWorkspace = async (t: TenantRow) => {
    setOpening(t.code);
    const res = await switchWorkspaceOnServer(t.code);
    const id = getServerAuth().identity;
    if (!res.ok || !id) {
      setOpening(null);
      return toast({ message: res.error || 'Could not open the workspace.' });
    }
    claimTenantStorage(id.email, id.tenantCode);
    setStoredSession({ email: id.email, role: id.role, tenantCode: id.tenantCode, tenantName: id.tenantName, repName: id.repName, isAuthenticated: true });
    window.location.assign(new URL('/admin/members', window.location.origin).href);
  };

  const q = query.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (t) =>
      (status === 'all' || t.status === status) &&
      (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.admins.some((a) => a.email.includes(q))),
  );

  return (
    <div>
      <PageHeader
        title="Client workspaces"
        count={rows?.length}
        description="Create a workspace for each client, invite their admin, and manage seats and modules."
        primaryAction={
          <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setWizardOpen(true)}>
            New client workspace
          </Button>
        }
      />

      {storage === 'file' && (
        <div role="note" className="mb-4 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg">
          Workspaces are saved on this server&apos;s disk (<span className="font-mono">.data/tenancy.json</span>). Connect the
          Supabase database before going live so nothing is lost when the server is redeployed.
        </div>
      )}

      {error && <InlineError message={error} onRetry={load} />}

      {rows === null && !error && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <EmptyState
            icon={<Building2 />}
            title="No client workspaces yet"
            description="Create one per client. Their admin gets an email invite and can then invite their own team."
            action={
              <Button variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => setWizardOpen(true)}>
                New client workspace
              </Button>
            }
          />
        </Card>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-md">
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by company, code or admin email"
                aria-label="Search workspaces"
              />
            </div>
            <div className="w-full sm:w-44">
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </div>
          </div>

          {visible.map((t) => {
            const pct = t.seatLimit > 0 ? Math.min(1, t.seatsUsed / t.seatLimit) : 0;
            return (
              <Card key={t.code} className="space-y-4 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-md text-caption font-medium ${t.branding.brandColor ? '' : 'bg-action text-action-fg'}`}
                      style={
                        t.branding.brandColor
                          ? {
                              background: deriveBrandTokens(t.branding.brandColor)['--brand-600'],
                              color: deriveBrandTokens(t.branding.brandColor)['--brand-contrast'],
                            }
                          : undefined
                      }
                      aria-hidden
                    >
                      {t.branding.logoInitials || t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-h3 text-fg">{t.name}</h2>
                        <span className="font-mono text-caption text-fg-tertiary">{t.code}</span>
                      </div>
                      <p className="mt-0.5 text-small text-fg-secondary">
                        {t.plan} · created {new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="mt-1 text-small text-fg-secondary">
                        {t.admins.length === 0
                          ? 'No admin yet'
                          : t.admins.map((a) => `${a.name || a.email}${a.status === 'invited' ? ' (invite pending)' : ''}`).join(', ')}
                      </p>
                    </div>
                  </div>
                  <Badge tone={t.status === 'active' ? 'success' : 'danger'}>{t.status === 'active' ? 'Active' : 'Suspended'}</Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-small">
                    <span className="text-fg-secondary">
                      Seats · {t.activeMembers} active{t.pendingInvites ? `, ${t.pendingInvites} invited` : ''}
                    </span>
                    <span className="tabular-nums text-fg">
                      {t.seatsUsed} / {t.seatLimit}
                    </span>
                  </div>
                  <Meter value={pct} label={`${t.name} seats used`} className={t.status === 'suspended' ? 'opacity-40' : undefined} />
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <span className="mb-1.5 block text-caption text-fg-tertiary">Modules</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {MODULES.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => toggleModule(t, m.key)}
                          aria-pressed={Boolean(t.modules[m.key])}
                          title={m.hint}
                          className={`focus-ring inline-flex h-6 cursor-pointer items-center gap-1 rounded-sm border px-2 text-caption transition-colors ${
                            t.modules[m.key]
                              ? 'border-selected bg-selected text-selected-fg hover:bg-selected-hover'
                              : 'border-line bg-surface text-fg-tertiary line-through hover:border-line-strong'
                          }`}
                        >
                          {t.modules[m.key] && <Check className="h-3 w-3" aria-hidden />}
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" icon={<Send className="h-3.5 w-3.5" />} onClick={() => setInviteTenant(t)}>
                      Invite admin
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Users className="h-3.5 w-3.5" />} onClick={() => setSeatTenant(t)}>
                      Seats
                    </Button>
                    <Button
                      variant={t.status === 'active' ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => (t.status === 'active' ? setSuspendTenant(t) : setTenantStatus(t, 'active'))}
                    >
                      {t.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      loading={opening === t.code}
                      onClick={() => openWorkspace(t)}
                      title="Open this workspace as Super Admin (written to the audit log)"
                    >
                      Open workspace
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {visible.length === 0 && <p className="py-6 text-center text-small text-fg-tertiary">No workspaces match.</p>}
        </div>
      )}

      <NewTenantWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={load}
        takenCodes={(rows ?? []).map((r) => r.code)}
        onOpenWorkspace={(t) => openWorkspace(t)}
      />
      <SeatsDialog key={`seats-${seatTenant?.code ?? ''}`} tenant={seatTenant} onClose={() => setSeatTenant(null)} onSaved={load} />
      <InviteAdminDialog key={`invite-${inviteTenant?.code ?? ''}`} tenant={inviteTenant} onClose={() => setInviteTenant(null)} onSent={load} />
      <ConfirmDialog
        open={suspendTenant !== null}
        onClose={() => setSuspendTenant(null)}
        onConfirm={() => {
          if (suspendTenant) setTenantStatus(suspendTenant, 'suspended');
          setSuspendTenant(null);
        }}
        title={`Suspend ${suspendTenant?.name ?? 'workspace'}?`}
        description="Everyone in this workspace is signed out and can't sign back in until you reactivate it. Their data is kept."
        confirmLabel="Suspend workspace"
      />
    </div>
  );
}

// ------------------------------------------------------------------ wizard

const STEPS = ['Company', 'Plan & seats', 'Brand', 'Client admin'];

interface Draft {
  name: string;
  code: string;
  codeEdited: boolean;
  plan: string;
  seatLimit: string;
  modules: Record<string, boolean>;
  brandColor: string;
  displayName: string;
  logoInitials: string;
  adminName: string;
  adminEmail: string;
}

const EMPTY: Draft = {
  name: '',
  code: '',
  codeEdited: false,
  plan: 'Standard',
  seatLimit: '10',
  modules: Object.fromEntries(MODULES.map((m) => [m.key, true])),
  brandColor: '',
  displayName: '',
  logoInitials: '',
  adminName: '',
  adminEmail: '',
};

interface CreatedResult {
  tenant: TenantRow;
  adminEmail: string;
  emailDelivered: boolean;
  inviteUrl?: string;
  deliveryError?: string;
}

function NewTenantWizard({
  open,
  onClose,
  onCreated,
  takenCodes,
  onOpenWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  takenCodes: string[];
  onOpenWorkspace: (t: TenantRow) => void;
}) {
  const copy = useCopy();
  const [step, setStep] = React.useState(0);
  const [d, setD] = React.useState<Draft>(EMPTY);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<CreatedResult | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);

  const reset = () => {
    setStep(0);
    setD(EMPTY);
    setServerError(null);
    setDone(null);
    setShowErrors(false);
  };
  const close = () => {
    if (submitting) return;
    onClose();
    // Let the closing animation finish before clearing.
    setTimeout(reset, 200);
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const brandHex = normalizeHex(d.brandColor);
  const brandCheck = d.brandColor.trim() ? checkBrandColor(d.brandColor) : null;
  const preview = deriveBrandTokens(brandHex ?? DEFAULT_BRAND_500);
  const seats = Number(d.seatLimit);

  const errors: Record<string, string | undefined> = {
    name: d.name.trim().length < 2 ? 'Enter the company name.' : undefined,
    code: !TENANT_CODE_RE.test(d.code)
      ? '2-32 capital letters, numbers or dashes.'
      : takenCodes.includes(d.code) || d.code === 'APPOINTMENTLYY'
        ? 'This code is already used. Pick another.'
        : undefined,
    seatLimit: !Number.isInteger(seats) || seats < 1 || seats > 5000 ? 'Between 1 and 5000.' : undefined,
    brandColor: brandCheck && !brandCheck.ok ? brandCheck.message : undefined,
    adminEmail: !EMAIL_RE.test(d.adminEmail.trim()) ? 'Enter a valid email address.' : undefined,
  };
  const stepFields: string[][] = [['name', 'code'], ['seatLimit'], ['brandColor'], ['adminEmail']];
  const stepValid = (i: number) => stepFields[i].every((f) => !errors[f]);

  const next = () => {
    if (!stepValid(step)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => s + 1);
  };

  const submit = async () => {
    if (![0, 1, 2, 3].every(stepValid)) {
      setShowErrors(true);
      setStep([0, 1, 2, 3].find((i) => !stepValid(i)) ?? 0);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const res = await apiJson<{
      tenant: TenantRow;
      emailDelivered: boolean;
      inviteUrl?: string;
      deliveryError?: string;
    }>('/api/platform/tenants', {
      method: 'POST',
      body: {
        name: d.name.trim(),
        code: d.code,
        plan: d.plan,
        seatLimit: seats,
        modules: d.modules,
        branding: { brandColor: brandHex ?? '', displayName: d.displayName.trim(), logoInitials: d.logoInitials.trim() },
        admin: { name: d.adminName.trim(), email: d.adminEmail.trim().toLowerCase() },
      },
    });
    setSubmitting(false);
    if (!res.success) {
      setServerError(res.error || 'Could not create the workspace.');
      if (res.status === 409 && /code/i.test(res.error || '')) setStep(0);
      return;
    }
    setDone({
      tenant: { ...res.tenant, seatsUsed: 1, activeMembers: 0, pendingInvites: 1, admins: [] },
      adminEmail: d.adminEmail.trim().toLowerCase(),
      emailDelivered: res.emailDelivered,
      inviteUrl: res.inviteUrl,
      deliveryError: res.deliveryError,
    });
    onCreated();
  };

  const err = (k: string) => (showErrors ? errors[k] : undefined);

  return (
    <Dialog open={open} onClose={close} title="New client workspace" size="lg" dismissible={!submitting}>
      {done ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-success-500/30 bg-success-bg p-4 text-success-fg">
            <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="text-body">
              <p className="font-medium">{done.tenant.name} is ready.</p>
              <p className="mt-0.5 text-small">
                {done.emailDelivered
                  ? `We emailed an invite to ${done.adminEmail}. It's valid for 7 days. Once they accept, they can invite their own team from Admin › Members.`
                  : `The workspace was created, but the invite email to ${done.adminEmail} didn't send${done.deliveryError ? ` (${done.deliveryError})` : ''}. Send them this link yourself:`}
              </p>
            </div>
          </div>
          {done.inviteUrl && (
            <div className="flex items-center gap-2">
              <Input readOnly value={done.inviteUrl} aria-label="Invite link" className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(done.inviteUrl!, 'Invite link')}>
                Copy
              </Button>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={reset}>
              Create another
            </Button>
            <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => onOpenWorkspace(done.tenant)}>
              Open workspace
            </Button>
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < STEPS.length - 1) next();
            else submit();
          }}
        >
          <Stepper steps={STEPS} current={step} className="flex-wrap gap-y-2" />

          {step === 0 && (
            <div className="space-y-4">
              <Field label="Company name" htmlFor="t-name" error={err('name')}>
                <Input
                  id="t-name"
                  autoFocus
                  value={d.name}
                  placeholder="e.g. Northwind BPO"
                  onChange={(e) => {
                    const name = e.target.value;
                    setD((p) => ({ ...p, name, code: p.codeEdited ? p.code : toTenantCode(name) }));
                  }}
                />
              </Field>
              <Field
                label="Workspace code"
                htmlFor="t-code"
                error={err('code')}
                hint="Short ID used in links and support tickets. Can't be changed later."
              >
                <Input
                  id="t-code"
                  value={d.code}
                  className="font-mono uppercase"
                  maxLength={32}
                  onChange={(e) =>
                    setD((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''), codeEdited: true }))
                  }
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Plan" htmlFor="t-plan">
                  <Select id="t-plan" value={d.plan} onChange={(e) => set('plan', e.target.value)}>
                    {PLANS.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Seats" htmlFor="t-seats" error={err('seatLimit')} hint="Everyone invited counts, including the admin.">
                  <Input
                    id="t-seats"
                    type="number"
                    min={1}
                    max={5000}
                    inputMode="numeric"
                    value={d.seatLimit}
                    onChange={(e) => set('seatLimit', e.target.value)}
                  />
                </Field>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-body-strong text-fg">Modules</legend>
                {MODULES.map((m) => (
                  <div key={m.key} className="flex items-start gap-2">
                    <Checkbox
                      id={`mod-${m.key}`}
                      checked={Boolean(d.modules[m.key])}
                      onChange={(e) => set('modules', { ...d.modules, [m.key]: e.target.checked })}
                    />
                    <label htmlFor={`mod-${m.key}`} className="-mt-0.5 cursor-pointer text-body text-fg">
                      {m.label} <span className="text-small text-fg-tertiary">· {m.hint}</span>
                    </label>
                  </div>
                ))}
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5 sm:grid-cols-[1fr_14rem]">
              <div className="space-y-4">
                <Field
                  label="Brand colour"
                  htmlFor="t-brand"
                  error={err('brandColor')}
                  hint={brandCheck?.ok ? brandCheck.message : 'Hex code from the client’s logo. Leave empty for Appointmentlyy red.'}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick a brand colour"
                      value={brandHex ?? DEFAULT_BRAND_500}
                      onChange={(e) => set('brandColor', e.target.value.toUpperCase())}
                      className="focus-ring h-9 w-11 shrink-0 cursor-pointer rounded-sm border border-line-strong bg-surface p-1"
                    />
                    <Input
                      id="t-brand"
                      value={d.brandColor}
                      placeholder="#0F766E"
                      className="font-mono uppercase"
                      maxLength={7}
                      onChange={(e) => set('brandColor', e.target.value)}
                    />
                  </div>
                </Field>
                <Field label="Name shown in the app" htmlFor="t-display" hint={`Optional. Defaults to “${d.name || 'the company name'}”.`}>
                  <Input id="t-display" value={d.displayName} maxLength={60} onChange={(e) => set('displayName', e.target.value)} />
                </Field>
                <Field label="Initials on the workspace tile" htmlFor="t-initials" hint="Two letters, optional.">
                  <Input
                    id="t-initials"
                    value={d.logoInitials}
                    maxLength={2}
                    className="w-20 font-mono uppercase"
                    onChange={(e) => set('logoInitials', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                </Field>
              </div>
              <div className="space-y-2" aria-label="Brand preview">
                <span className="text-caption text-fg-tertiary">Preview</span>
                <div className="space-y-3 rounded-lg border border-line bg-app p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-7 items-center justify-center rounded-md text-caption font-medium"
                      style={{ background: preview['--brand-600'], color: preview['--brand-contrast'] }}
                    >
                      {(d.logoInitials || d.name.slice(0, 2) || 'AB').toUpperCase()}
                    </span>
                    <span className="truncate text-body-strong text-fg">{d.displayName || d.name || 'Client workspace'}</span>
                  </div>
                  <span
                    className="flex h-9 items-center justify-center rounded-md text-body font-medium"
                    style={{ background: preview['--brand-600'], color: preview['--brand-contrast'] }}
                  >
                    Start calling
                  </span>
                  <span className="block rounded-sm px-2 py-1 text-small" style={{ background: preview['--brand-50'], color: preview['--brand-700'] }}>
                    Selected row
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-body text-fg-secondary">
                This person becomes the workspace Admin. They get an email invite and can then invite their own reps, managers and supervisors.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Admin's name" htmlFor="t-admin-name">
                  <Input id="t-admin-name" autoFocus value={d.adminName} onChange={(e) => set('adminName', e.target.value)} />
                </Field>
                <Field label="Admin's email" htmlFor="t-admin-email" error={err('adminEmail')}>
                  <Input
                    id="t-admin-email"
                    type="email"
                    autoComplete="off"
                    value={d.adminEmail}
                    placeholder="name@client.com"
                    onChange={(e) => set('adminEmail', e.target.value)}
                  />
                </Field>
              </div>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 rounded-md border border-line bg-subtle p-3 text-small">
                <dt className="text-fg-tertiary">Workspace</dt>
                <dd className="text-fg">
                  {d.name || '—'} <span className="font-mono text-fg-tertiary">{d.code}</span>
                </dd>
                <dt className="text-fg-tertiary">Plan</dt>
                <dd className="text-fg">
                  {d.plan} · {d.seatLimit} seats
                </dd>
                <dt className="text-fg-tertiary">Modules</dt>
                <dd className="text-fg">{MODULES.filter((m) => d.modules[m.key]).map((m) => m.label).join(', ') || 'None'}</dd>
                <dt className="text-fg-tertiary">Brand</dt>
                <dd className="flex items-center gap-1.5 text-fg">
                  <span className="size-3 rounded-sm border border-line" style={{ background: brandHex ?? DEFAULT_BRAND_500 }} aria-hidden />
                  {brandHex ?? 'Appointmentlyy default'}
                </dd>
              </dl>
            </div>
          )}

          {serverError && (
            <p role="alert" className="text-small text-danger-fg">
              {serverError}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={step === 0 ? close : () => setStep((s) => s - 1)} disabled={submitting}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit" variant="primary">
                Next
              </Button>
            ) : (
              <Button type="submit" variant="brand" loading={submitting} icon={<Send className="h-4 w-4" />}>
                Create workspace & send invite
              </Button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ seats & invite dialogs

function SeatsDialog({ tenant, onClose, onSaved }: { tenant: TenantRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = React.useState(tenant ? String(tenant.seatLimit) : '');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setSaving(true);
    const res = await apiJson(`/api/platform/tenants/${encodeURIComponent(tenant.code)}`, {
      method: 'PATCH',
      body: { seatLimit: Number(value) },
    });
    setSaving(false);
    if (!res.success) return setError(res.error || 'Could not save.');
    toast({ message: `${tenant.name} now has ${value} seats.` });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={tenant !== null} onClose={onClose} title={`Seats for ${tenant?.name ?? ''}`} size="sm">
      <form onSubmit={save} className="space-y-4" noValidate>
        <Field label="Seat limit" htmlFor="seat-limit" error={error ?? undefined} hint={tenant ? `${tenant.seatsUsed} in use (active + invited).` : undefined}>
          <Input id="seat-limit" type="number" min={1} max={5000} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InviteAdminDialog({ tenant, onClose, onSent }: { tenant: TenantRow | null; onClose: () => void; onSent: () => void }) {
  const toast = useToast();
  const copy = useCopy();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    setSending(true);
    setError(null);
    const res = await apiJson<{ emailDelivered: boolean; inviteUrl?: string; reinvited: boolean }>('/api/auth/invite', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), name: name.trim(), role: 'Admin', tenantCode: tenant.code },
    });
    setSending(false);
    if (!res.success) return setError(res.error || 'Could not send the invite.');
    onSent();
    if (res.emailDelivered) {
      toast({ message: `${res.reinvited ? 'Invite re-sent' : 'Invite sent'} to ${email.trim()}.` });
      onClose();
    } else {
      setLink(res.inviteUrl || null);
    }
  };

  return (
    <Dialog
      open={tenant !== null}
      onClose={onClose}
      title={`Invite an admin to ${tenant?.name ?? ''}`}
      description="Sends a 7-day invite. Inviting someone who already has a pending invite re-sends it."
      size="md"
    >
      {link ? (
        <div className="space-y-3">
          <p className="text-body text-fg-secondary">The email didn&apos;t send. Share this invite link with them directly:</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={link} aria-label="Invite link" className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(link, 'Invite link')}>
              Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="ia-name">
              <Input id="ia-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Email" htmlFor="ia-email" error={error ?? undefined}>
              <Input id="ia-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@client.com" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={sending} icon={<Send className="h-4 w-4" />}>
              Send invite
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
