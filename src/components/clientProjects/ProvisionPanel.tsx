'use client';

/**
 * Client Projects, owner only: the Provision tab. A vertical checklist that sets up the client's workspace from the
 * accepted intake. Every step shows what will happen first, runs only on the owner's click, and is safe to run again
 * (it changes nothing, or resumes). "Create members" never emails anyone: "Send invites" is its own click, with a
 * confirmation. Starter templates are AI DRAFTS: the owner edits or deselects them, then seeds. Nothing is autosaved.
 */
import * as React from 'react';
import { Check, Copy, Mail, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Field, Input, Select, Textarea, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import { fmtAt } from '@/lib/clientProjects/types';
import { PROVISION_STEP_LABEL, STARTER_LABEL, templateIssues, type ProvisionStep, type StarterKey, type StepRecord, type TemplateDraft } from '@/lib/clientProjects/provision';
import { TEMPLATE_WORD_LIMIT, countTemplateWords } from '@/lib/emailTemplates';
import { fmtLogoSize } from '@/lib/tenantLogo';
import type { ProvisionView, RowState } from '@/lib/server/clientProjects/provision';

type Row = { label: string; ok: boolean; note: string; inviteUrl?: string };
type Result = { message?: string; rows?: Row[]; error?: string; ok?: boolean };

const STATE_LABEL: Record<RowState, string> = {
  new: 'Will be created',
  invited: 'Created, invite pending',
  active: 'Active member',
  removed: 'Removed earlier',
  invalid_email: 'Invalid email',
  unknown_role: 'Unknown role',
  staff: 'Staff address',
  duplicate: 'Listed twice',
};
const stateTone = (s: RowState): 'neutral' | 'brand' | 'success' | 'warning' | 'danger' =>
  s === 'active' ? 'success' : s === 'invited' ? 'warning' : s === 'new' ? 'neutral' : s === 'removed' ? 'warning' : 'danger';

function StepBadge({ rec, linked }: { rec?: StepRecord; linked?: boolean }) {
  if (!rec) return <Badge tone={linked ? 'success' : 'neutral'}>{linked ? 'Linked' : 'Not run'}</Badge>;
  return <Badge tone={rec.status === 'done' ? 'success' : rec.status === 'partial' ? 'warning' : 'danger'}>{rec.status === 'done' ? 'Done' : rec.status === 'partial' ? 'Partly done' : 'Not done'}</Badge>;
}

function Step({ n, step, title, rec, linked, children }: { n: number; step: string; title: string; rec?: StepRecord; linked?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative" data-testid={`pv-step-${step}`} data-status={rec?.status ?? (linked ? 'linked' : 'none')}>
      <Card className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold', rec?.status === 'done' ? 'bg-success-bg text-success-fg' : 'bg-subtle text-fg-secondary')}>
            {rec?.status === 'done' ? <Check className="size-3.5" /> : n}
          </span>
          <h3 className="text-body-strong text-fg">{title}</h3>
          <StepBadge rec={rec} linked={linked} />
          {rec && (
            <span className="text-caption text-fg-tertiary" data-testid={`pv-when-${step}`}>
              {fmtAt(rec.at)} · {rec.by.replace(/^owner:/, '')}
            </span>
          )}
        </div>
        {children}
      </Card>
    </li>
  );
}

function Results({ step, r }: { step: string; r?: Result }) {
  const toast = useToast();
  if (!r) return null;
  return (
    <div className="flex flex-col gap-2" data-testid={`pv-result-${step}`} aria-live="polite">
      {r.error ? (
        <p className="flex items-start gap-1.5 text-small text-danger-fg" role="alert">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {r.error}
        </p>
      ) : (
        r.message && <p className="text-small text-fg">{r.message}</p>
      )}
      {!!r.rows?.length && (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="cpi-table">
            <thead>
              <tr>
                <th>Row</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x, i) => (
                <tr key={i} data-testid="pv-result-row" data-ok={x.ok ? '1' : '0'}>
                  <td className="whitespace-nowrap text-fg">{x.label}</td>
                  <td className={x.ok ? 'text-fg-secondary' : 'text-danger-fg'}>
                    {x.note}
                    {x.inviteUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2"
                        icon={<Copy />}
                        data-testid="pv-copy-link"
                        onClick={() => {
                          void navigator.clipboard?.writeText(x.inviteUrl as string).then(
                            () => toast({ message: 'Invite link copied. It signs in as this person: send it only to them.' }),
                            () => toast({ message: 'Could not copy the link.' }),
                          );
                        }}
                      >
                        Copy invite link
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Edits = Record<string, { name: string; subject: string; body: string }>;

export function ProvisionPanel({ projectId, onChanged }: { projectId: string; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [view, setView] = React.useState<ProvisionView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, Result>>({});
  const [ws, setWs] = React.useState({ name: '', code: '', plan: 'Standard', seats: '10', adminEmail: '', adminName: '' });
  const [br, setBr] = React.useState({ brandColor: '', displayName: '', logoInitials: '', supportEmail: '' });
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const [edits, setEdits] = React.useState<Edits>({});
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmSend, setConfirmSend] = React.useState(false);
  const seededForm = React.useRef(false);

  const adopt = React.useCallback((v: ProvisionView, resetForms: boolean) => {
    setView(v);
    if (resetForms || !seededForm.current) {
      seededForm.current = true;
      setWs({ name: v.workspace.name, code: v.workspace.code, plan: v.workspace.plan, seats: String(v.workspace.seats), adminEmail: v.workspace.adminEmail, adminName: v.workspace.adminName });
      setBr({ brandColor: v.branding.brandColor, displayName: v.branding.displayName, logoInitials: v.branding.logoInitials, supportEmail: v.branding.supportEmail });
    }
  }, []);
  const adoptDrafts = (v: ProvisionView) => {
    setEdits(Object.fromEntries(v.templates.drafts.map((d) => [d.key, { name: d.name, subject: d.subject, body: d.body }])));
    setSelected(new Set(v.templates.drafts.filter((d) => !d.seeded && !d.issues.length).map((d) => d.key)));
  };

  const apply = React.useCallback(
    (r: Awaited<ReturnType<typeof apiJson<{ provision: ProvisionView }>>>) => {
      if (r.success) {
        adopt(r.provision, false);
        setEdits((cur) => (Object.keys(cur).length ? cur : Object.fromEntries(r.provision.templates.drafts.map((d) => [d.key, { name: d.name, subject: d.subject, body: d.body }]))));
        setSelected((cur) => (cur.size ? cur : new Set(r.provision.templates.drafts.filter((d) => !d.seeded && !d.issues.length).map((d) => d.key))));
        setError(null);
      } else setError(r.error || 'Could not load provisioning.');
    },
    [adopt],
  );
  const load = React.useCallback(async () => apply(await apiJson<{ provision: ProvisionView }>(`/api/client-projects/${projectId}/provision`)), [projectId, apply]);
  React.useEffect(() => {
    let live = true;
    void apiJson<{ provision: ProvisionView }>(`/api/client-projects/${projectId}/provision`).then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [projectId, apply]);

  // Template edits are kept on this page until they are seeded (never autosaved): warn before leaving with edits.
  const dirty = !!view && view.templates.drafts.some((d) => {
    const e = edits[d.key];
    return e && (e.name !== d.name || e.subject !== d.subject || e.body !== d.body);
  });
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const run = async (step: string, body: Record<string, unknown>, opts: { resetForms?: boolean; drafts?: boolean } = {}) => {
    setBusy(step);
    const r = await apiJson<{ provision: ProvisionView; result: Result & Record<string, unknown> }>(`/api/client-projects/${projectId}/provision`, { body });
    setBusy(null);
    if (r.success) {
      adopt(r.provision, Boolean(opts.resetForms));
      if (opts.drafts) adoptDrafts(r.provision);
      setResults((cur) => ({ ...cur, [step]: { message: r.result?.message as string, rows: r.result?.rows as Row[] | undefined } }));
      await onChanged();
    } else {
      const extra = r as unknown as { issues?: Record<string, string[]> };
      setResults((cur) => ({ ...cur, [step]: { error: r.error || 'That did not work.', ...(extra.issues ? { rows: Object.entries(extra.issues).map(([k, v]) => ({ label: STARTER_LABEL[k as StarterKey] ?? k, ok: false, note: v.join(' ') })) } : {}) } }));
      toast({ message: r.error || 'That did not work.' });
    }
    return r;
  };

  if (error) return <p className="text-small text-danger-fg">{error}</p>;
  if (!view) return <p className="text-small text-fg-tertiary">Loading…</p>;

  const rec = view.record.steps;
  const linked = view.linked;
  const needWs = !linked;
  const rows = view.users.rows;
  const selectable = rows.filter((r) => r.state === 'new' || r.state === 'invited' || r.state === 'active');
  const chosen = picked ?? new Set(selectable.map((r) => r.email));
  const toCreate = rows.filter((r) => r.state === 'new' && chosen.has(r.email)).length;
  const pendingInvites = rows.filter((r) => r.state === 'invited' && !r.sentAt).length + (view.record.adminEmail && !rows.some((r) => r.email === view.record.adminEmail) ? 1 : 0);
  const draftList: (TemplateDraft & { issues: string[]; seeded: boolean })[] = view.templates.drafts.map((d) => {
    const e = edits[d.key] ?? d;
    return { ...d, ...e, issues: templateIssues({ ...e, purpose: d.purpose }, view.templates.sourceNumbers), seeded: d.seeded };
  });
  const toSeed = draftList.filter((d) => selected.has(d.key));
  const step = (k: ProvisionStep) => rec[k];

  return (
    <div className="flex flex-col gap-4" data-testid="pv-panel">
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h3 text-fg">Provision workspace</h2>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Badge tone={view.ai.mode === 'off' ? 'warning' : 'neutral'}>{view.ai.mode === 'off' ? 'AI off' : view.ai.mode === 'stub' ? 'AI: test stub' : 'AI on'}</Badge>
            <Badge tone={view.mail.configured ? 'neutral' : 'warning'}>{view.mail.outbox ? 'Email: test outbox' : view.mail.configured ? 'Email on' : 'Email not set up'}</Badge>
            <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={() => void load()} data-testid="pv-reload">
              Reload
            </Button>
          </span>
        </div>
        <p className="text-small text-fg-secondary">
          Each step shows what will happen, then runs only when you click it. Running a step again changes nothing or picks up where it stopped. Everything goes only to this project’s client workspace.
        </p>
        {linked ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-subtle px-3 py-2 text-small" data-testid="pv-linked" data-code={linked.code}>
            {linked.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={linked.logo.url} alt="" className="size-8 rounded-md border border-line bg-surface object-contain" data-testid="pv-linked-logo" />
            ) : (
              <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-md bg-action text-caption text-action-fg">
                {linked.branding.logoInitials || linked.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="text-fg">
              <span className="font-medium">{linked.branding.displayName || linked.name}</span> <span className="cp-mono text-fg-tertiary">{linked.code}</span>
            </span>
            <span className="text-fg-secondary">
              {linked.plan} · {linked.seatsUsed} of {linked.seatLimit || 'unlimited'} seats used
            </span>
          </div>
        ) : (
          <p className="text-small text-fg-tertiary">No workspace is linked yet. Step 1 creates one and links it.</p>
        )}
        {!view.intakeOn && <p className="text-caption text-fg-tertiary">Client Intake is off for this project: steps use what you type here, and steps that need accepted forms wait for them.</p>}
      </Card>

      <ol className="flex flex-col gap-3">
        {/* ---------------------------------------------------------------- 1 */}
        <Step n={1} step="workspace" title={PROVISION_STEP_LABEL.workspace} rec={step('workspace')} linked={!!linked}>
          {linked ? (
            <p className="text-small text-fg" data-testid="pv-ws-linked">
              Linked to <span className="font-medium">{linked.name}</span> ({linked.code}). This step is skipped.
            </p>
          ) : (
            <>
              <p className="text-small text-fg-secondary">
                Creates the workspace and its first Admin (no email yet), then links it to this project. Prefilled from {view.workspace.sources.length ? view.workspace.sources.join(', ') : 'the project (no accepted forms yet)'}.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Workspace name" htmlFor="pv-ws-name">
                  <Input id="pv-ws-name" value={ws.name} maxLength={80} onChange={(e) => setWs({ ...ws, name: e.target.value })} data-testid="pv-ws-name" />
                </Field>
                <Field label="Workspace code" htmlFor="pv-ws-code" hint="Capital letters, numbers and dashes.">
                  <Input id="pv-ws-code" mono value={ws.code} maxLength={32} onChange={(e) => setWs({ ...ws, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} data-testid="pv-ws-code" />
                </Field>
                <Field label="Plan" htmlFor="pv-ws-plan">
                  <Select id="pv-ws-plan" value={ws.plan} onChange={(e) => setWs({ ...ws, plan: e.target.value })} data-testid="pv-ws-plan">
                    {view.workspace.plans.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Seats" htmlFor="pv-ws-seats" hint={`Suggested: ${view.workspace.seats} (the user list plus 2, at least 10).`}>
                  <Input id="pv-ws-seats" type="number" min={1} max={5000} value={ws.seats} onChange={(e) => setWs({ ...ws, seats: e.target.value })} data-testid="pv-ws-seats" />
                </Field>
                <Field label="First admin" htmlFor="pv-ws-admin" hint={view.workspace.adminChoices.length ? 'From the accepted user list, or type someone else.' : 'Type the client’s admin.'}>
                  <Input id="pv-ws-admin" type="email" list="pv-ws-admins" value={ws.adminEmail} onChange={(e) => {
                    const email = e.target.value;
                    const hit = view.workspace.adminChoices.find((c) => c.email === email.trim().toLowerCase());
                    setWs({ ...ws, adminEmail: email, adminName: hit ? hit.name : ws.adminName });
                  }} data-testid="pv-ws-admin" />
                  <datalist id="pv-ws-admins">
                    {view.workspace.adminChoices.map((c) => (
                      <option key={c.email} value={c.email}>
                        {c.name}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field label="Admin’s name" htmlFor="pv-ws-admin-name">
                  <Input id="pv-ws-admin-name" value={ws.adminName} maxLength={80} onChange={(e) => setWs({ ...ws, adminName: e.target.value })} data-testid="pv-ws-admin-name" />
                </Field>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={linked ? 'secondary' : 'primary'} loading={busy === 'workspace'} disabled={!!busy} onClick={() => void run('workspace', { action: 'workspace', ...ws, seats: Number(ws.seats) })} data-testid="pv-run-workspace">
              {linked ? 'Check again' : 'Create workspace'}
            </Button>
          </div>
          <Results step="workspace" r={results.workspace} />
        </Step>

        {/* ---------------------------------------------------------------- 2 */}
        <Step n={2} step="branding" title={PROVISION_STEP_LABEL.branding} rec={step('branding')}>
          <p className="text-small text-fg-secondary">Sets the brand colour, the name shown in the app, the initials tile and, if you set it, the support email. {view.branding.source ? `From ${view.branding.source}.` : 'No accepted brand form yet: type the values.'}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Brand colour" htmlFor="pv-br-color">
              <div className="flex gap-2">
                <input type="color" aria-label="Brand colour picker" value={/^#[0-9A-Fa-f]{6}$/.test(br.brandColor) ? br.brandColor.toLowerCase() : '#000000'} onChange={(e) => setBr({ ...br, brandColor: e.target.value.toUpperCase() })} className="focus-ring h-9 w-12 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface p-1" />
                <Input id="pv-br-color" mono value={br.brandColor} maxLength={7} onChange={(e) => setBr({ ...br, brandColor: e.target.value.trim() })} data-testid="pv-br-color" />
              </div>
            </Field>
            <Field label="Name shown" htmlFor="pv-br-name">
              <Input id="pv-br-name" value={br.displayName} maxLength={60} onChange={(e) => setBr({ ...br, displayName: e.target.value })} data-testid="pv-br-name" />
            </Field>
            <Field label="Initials" htmlFor="pv-br-initials">
              <Input id="pv-br-initials" value={br.logoInitials} maxLength={2} onChange={(e) => setBr({ ...br, logoInitials: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} data-testid="pv-br-initials" />
            </Field>
            <Field label="Support email (optional)" htmlFor="pv-br-support">
              <Input id="pv-br-support" type="email" value={br.supportEmail} onChange={(e) => setBr({ ...br, supportEmail: e.target.value })} data-testid="pv-br-support" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={busy === 'branding'} disabled={!!busy || needWs} onClick={() => void run('branding', { action: 'branding', ...br })} data-testid="pv-run-branding">
              Apply branding
            </Button>
            {needWs && <span className="text-caption text-fg-tertiary">Needs the workspace (step 1).</span>}
          </div>
          <Results step="branding" r={results.branding} />
        </Step>

        {/* ---------------------------------------------------------------- 3 */}
        <Step n={3} step="logo" title={PROVISION_STEP_LABEL.logo} rec={step('logo')}>
          <p className="text-small text-fg-secondary" data-testid="pv-logo-preview">
            {view.logo.file ? (
              <>
                Copies the accepted logo <span className="font-medium text-fg">{view.logo.file.name}</span> ({view.logo.file.mime.replace('image/', '').replace('+xml', '').toUpperCase()}, {fmtLogoSize(view.logo.file.size)}) into the workspace. It must be a PNG, JPG, WebP or SVG under 512 KB; SVGs are cleaned first.
              </>
            ) : (
              'No accepted logo yet. The client’s admin can also upload one in Admin › Appearance.'
            )}
          </p>
          {linked && (
            <p className="flex items-center gap-2 text-small text-fg-secondary">
              In the workspace now:{' '}
              {linked.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={linked.logo.url} alt="The workspace logo" className="h-8 max-w-[120px] rounded-sm border border-line bg-surface object-contain" data-testid="pv-logo-current" />
              ) : (
                <span className="text-fg-tertiary">no logo (initials show)</span>
              )}
            </p>
          )}
          <div>
            <Button loading={busy === 'logo'} disabled={!!busy || needWs} onClick={() => void run('logo', { action: 'logo' })} data-testid="pv-run-logo">
              Copy logo to workspace
            </Button>
          </div>
          <Results step="logo" r={results.logo} />
        </Step>

        {/* ---------------------------------------------------------------- 4 */}
        <Step n={4} step="members" title="Users" rec={step('members')}>
          <p className="text-small text-fg-secondary">
            {view.users.source ? `From ${view.users.source}.` : 'No accepted user list yet.'} “Create members” makes the accounts and sends nothing. “Send invites” is a separate click.
          </p>
          {view.users.seats && (
            <p className="text-small text-fg" data-testid="pv-seats">
              Seats: {view.users.seats.used} used of {view.users.seats.limit || 'unlimited'}
              {view.users.seats.free !== null && `, ${view.users.seats.free} free`}. This creates {toCreate}.
              {view.users.seats.free !== null && toCreate > view.users.seats.free && <span className="ml-1 font-medium text-danger-fg">Not enough seats.</span>}
            </p>
          )}
          {!!rows.length && (
            <div className="max-h-80 overflow-auto rounded-md border border-line">
              <table className="cpi-table" data-testid="pv-users">
                <thead>
                  <tr>
                    <th className="w-8">
                      <span className="sr-only">Include</span>
                    </th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.email}-${i}`} data-testid="pv-user-row" data-state={r.state} data-email={r.email}>
                      <td>
                        <Checkbox
                          aria-label={`Include ${r.email}`}
                          checked={chosen.has(r.email)}
                          disabled={!selectable.includes(r)}
                          onChange={(e) => {
                            const next = new Set(chosen);
                            if (e.target.checked) next.add(r.email);
                            else next.delete(r.email);
                            setPicked(next);
                          }}
                        />
                      </td>
                      <td className="whitespace-nowrap text-fg">{r.name || '-'}</td>
                      <td className="whitespace-nowrap text-fg">{r.email || '-'}</td>
                      <td className="text-fg-secondary">{r.role || '-'}</td>
                      <td>
                        <Badge tone={r.sentAt && r.state === 'invited' ? 'success' : stateTone(r.state)}>{r.sentAt && r.state === 'invited' ? 'Invite sent' : STATE_LABEL[r.state]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={busy === 'members'} disabled={!!busy || needWs || !rows.length} onClick={() => void run('members', { action: 'members', emails: [...chosen] })} data-testid="pv-run-members">
              Create members (no email)
            </Button>
          </div>
          <Results step="members" r={results.members} />
          <div className="flex flex-col gap-2 border-t border-line pt-3" data-testid="pv-step-invites" data-status={rec.invites?.status ?? 'none'}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-strong text-fg">Send invites</span>
              <StepBadge rec={rec.invites} />
              {rec.invites && <span className="text-caption text-fg-tertiary">{fmtAt(rec.invites.at)}</span>}
            </div>
            <p className="text-small text-fg-secondary">
              Emails each created member their invite, a few seconds apart. Active members and people already emailed are skipped. {view.mail.configured ? '' : 'Email is not set up on this server: each invite link is shown to you instead, to pass on yourself.'}
            </p>
            <div>
              <Button variant="primary" icon={<Mail />} loading={busy === 'invites'} disabled={!!busy || needWs} onClick={() => setConfirmSend(true)} data-testid="pv-send-invites">
                Send invites
              </Button>
            </div>
            <Results step="invites" r={results.invites} />
          </div>
        </Step>

        {/* ---------------------------------------------------------------- 5 */}
        <Step n={5} step="templates" title={PROVISION_STEP_LABEL.templates} rec={step('templates')}>
          <p className="text-small text-fg-secondary">
            The AI drafts five templates (two cold emails, a follow-up, a break-up and a reply) from the client’s accepted questionnaire and scripts. B2B, {TEMPLATE_WORD_LIMIT} words at most, no links, no numbers that are not in the client’s own answers, never “fully automated” or exclusive lists, and “shared lists”, never “rented”. You edit them, untick any you do not want, then seed. Nothing reaches the workspace before you click Seed.
          </p>
          {view.ai.mode === 'off' && (
            <p className="rounded-md bg-subtle px-3 py-2 text-small text-fg" data-testid="pv-ai-off">
              {view.ai.message}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Sparkles />} loading={busy === 'templates_draft'} disabled={!!busy || view.ai.mode === 'off' || !view.templates.hasSource} onClick={() => void run('templates_draft', { action: 'templates_draft' }, { drafts: true })} data-testid="pv-tpl-draft">
              {draftList.length ? 'Draft again' : 'Draft with AI'}
            </Button>
            {!view.templates.hasSource && <span className="text-caption text-fg-tertiary">Accept the questionnaire or the scripts first.</span>}
            {view.templates.draftedAt && (
              <span className="text-caption text-fg-tertiary">
                Drafted {fmtAt(view.templates.draftedAt)}
                {view.templates.mode === 'stub' ? ' (test stub)' : ''}
              </span>
            )}
          </div>
          <Results step="templates_draft" r={results.templates_draft} />
          {!!draftList.length && (
            <div className="flex flex-col gap-3">
              {draftList.map((d) => {
                const e = edits[d.key] ?? d;
                const words = countTemplateWords(e.body);
                return (
                  <div key={d.key} className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="pv-tpl-card" data-key={d.key} data-issues={d.issues.length}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Checkbox
                        label={<span className="text-body-strong">{STARTER_LABEL[d.key]}</span>}
                        checked={selected.has(d.key)}
                        onChange={(ev) => {
                          const next = new Set(selected);
                          if (ev.target.checked) next.add(d.key);
                          else next.delete(d.key);
                          setSelected(next);
                        }}
                        data-testid="pv-tpl-select"
                      />
                      {d.seeded && <Badge tone="success">In the workspace</Badge>}
                      <span className={cn('ml-auto text-caption tabular-nums', words > TEMPLATE_WORD_LIMIT ? 'text-danger-fg' : 'text-fg-tertiary')}>
                        {words} / {TEMPLATE_WORD_LIMIT} words
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Name" htmlFor={`pv-tpl-name-${d.key}`}>
                        <Input id={`pv-tpl-name-${d.key}`} value={e.name} maxLength={80} onChange={(x) => setEdits({ ...edits, [d.key]: { ...e, name: x.target.value } })} data-testid="pv-tpl-name" />
                      </Field>
                      <Field label="Subject" htmlFor={`pv-tpl-subject-${d.key}`}>
                        <Input id={`pv-tpl-subject-${d.key}`} value={e.subject} maxLength={150} onChange={(x) => setEdits({ ...edits, [d.key]: { ...e, subject: x.target.value } })} data-testid="pv-tpl-subject" />
                      </Field>
                    </div>
                    <Field label="Body" htmlFor={`pv-tpl-body-${d.key}`}>
                      <Textarea id={`pv-tpl-body-${d.key}`} rows={6} value={e.body} onChange={(x) => setEdits({ ...edits, [d.key]: { ...e, body: x.target.value } })} data-testid="pv-tpl-body" />
                    </Field>
                    {d.issues.length > 0 && (
                      <ul className="flex flex-col gap-0.5 text-small text-danger-fg" data-testid="pv-tpl-issues">
                        {d.issues.map((x) => (
                          <li key={x} className="flex items-start gap-1.5">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {x}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-2">
                <Button loading={busy === 'templates_check'} disabled={!!busy || !toSeed.length} onClick={() => void run('templates_check', { action: 'templates_check', templates: toSeed.map(({ key, name, subject, body }) => ({ key, name, subject, body })) })} data-testid="pv-tpl-check">
                  Check
                </Button>
                <Button variant="primary" loading={busy === 'templates_seed'} disabled={!!busy || needWs || !toSeed.length || toSeed.some((d) => d.issues.length > 0)} onClick={() => void run('templates_seed', { action: 'templates_seed', templates: toSeed.map(({ key, name, subject, body }) => ({ key, name, subject, body })) })} data-testid="pv-tpl-seed">
                  Seed {toSeed.length} template{toSeed.length === 1 ? '' : 's'}
                </Button>
                <span className="text-caption text-fg-tertiary">{dirty ? 'Edits are kept on this page until you seed.' : 'Seeding twice adds nothing twice.'}</span>
              </div>
              <Results step="templates_check" r={results.templates_check} />
              <Results step="templates_seed" r={results.templates_seed} />
            </div>
          )}
        </Step>

        {/* ---------------------------------------------------------------- 6 */}
        <li data-testid="pv-record">
          <Card className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-subtle text-caption font-semibold text-fg-secondary">
                6
              </span>
              <h3 className="text-body-strong text-fg">Provisioning record</h3>
              {view.sopCard && (
                <Badge tone={view.sopCard.status === 'done' ? 'success' : 'neutral'}>
                  {view.sopCard.key} {view.sopCard.status === 'done' ? 'done' : 'open'}
                </Badge>
              )}
            </div>
            <p className="text-small text-fg-secondary">
              When steps 1 to 4 are done, the “Branded workspace with users and roles” card completes by itself. Milestones, signatures and payments never do. A line appears in the Delivery Report.
            </p>
            <ul className="flex flex-col gap-1 text-small">
              {(['workspace', 'branding', 'logo', 'members', 'invites', 'templates'] as ProvisionStep[]).map((k) => (
                <li key={k} className="flex flex-wrap items-center gap-2" data-testid="pv-record-row" data-step={k} data-status={rec[k]?.status ?? 'none'}>
                  <span className="w-44 shrink-0 text-fg">{PROVISION_STEP_LABEL[k]}</span>
                  <StepBadge rec={rec[k]} />
                  {rec[k] && (
                    <span className="text-fg-tertiary">
                      {rec[k]!.summary} · {fmtAt(rec[k]!.at)} · {rec[k]!.by.replace(/^owner:/, '')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!!view.events.length && (
              <details>
                <summary className="cursor-pointer text-small text-fg-secondary">Provisioning events ({view.events.length})</summary>
                <ul className="mt-1 flex flex-col gap-0.5 text-caption text-fg-secondary" data-testid="pv-events">
                  {view.events.map((e, i) => (
                    <li key={i}>
                      <span className="cp-mono text-fg-tertiary">{fmtAt(e.at)}</span> {e.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </li>
      </ol>

      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => void run('invites', { action: 'invites' })}
        title="Send the invite emails now?"
        description={`Each created member who has not been emailed yet gets their invite now (${pendingInvites} pending). Active members and people already emailed are skipped.`}
        confirmLabel="Send invites"
        tone="primary"
        icon={<Mail />}
      />
    </div>
  );
}
