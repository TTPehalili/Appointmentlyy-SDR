'use client';

/**
 * Client Intake, owner side: the card drawer's "Client item" panel (the submission and its versions with a diff,
 * Accept with the auto-apply choices, Request changes, and the controls for DNS, keys, envelopes and payments), the
 * project's Submissions inbox, and the Client data tab (with the export). Client uploads are only ever downloaded
 * (attachment), never shown inline.
 */
import * as React from 'react';
import { Check, Download, ExternalLink, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Field, IconButton, Input, Select, Switch, Textarea, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import { fmtAt, todayManila, type OwnerProjectView, type OwnerTaskView } from '@/lib/clientProjects/types';
import {
  FIELD_TYPES,
  FORM_TEMPLATES,
  KIND_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PROVIDER_LABEL,
  UNIFIED_LABEL,
  diffAnswers,
  type ApplyResult,
  type CpSubmission,
  type DnsRecord,
  type FieldType,
  type TableRow,
  type UnifiedStatus,
} from '@/lib/clientProjects/intake';
import type { OwnerIntake, OwnerRequestView } from '@/lib/server/clientProjects/intakeOwner';
import { FormFields, fmtSize } from '@/components/clientProjects/intake/FormRenderer';

// ------------------------------------------------------------------ data

export function useIntake(projectId: string) {
  const [data, setData] = React.useState<OwnerIntake | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(
    async (sync = false) => {
      const r = await apiJson<{ intake: OwnerIntake }>(`/api/client-projects/${projectId}/intake${sync ? '?sync=1' : ''}`);
      if (r.success) {
        setData(r.intake);
        setError(null);
      } else setError(r.error || 'Could not load Client Intake.');
    },
    [projectId],
  );
  React.useEffect(() => {
    void load();
  }, [load]);
  const post = React.useCallback(
    async (body: Record<string, unknown>) => {
      const r = await apiJson<{ intake: OwnerIntake; submission?: CpSubmission }>(`/api/client-projects/${projectId}/intake`, { body });
      if (r.success) setData(r.intake);
      return r;
    },
    [projectId],
  );
  return { data, error, load, post };
}

const toneOf = (u: UnifiedStatus): 'neutral' | 'brand' | 'warning' | 'success' => (u === 'complete' ? 'success' : u === 'waiting_on_us' ? 'warning' : u === 'in_progress' ? 'brand' : 'neutral');
const fileUrl = (projectId: string, fileId: string) => `/api/client-projects/${projectId}/intake/file/${fileId}`;
const who = (actor: string) => (actor.startsWith('client:') ? `${actor.slice(7)} (self-identified)` : actor.replace(/^owner:/, ''));

function FileLinks({ projectId, files }: { projectId: string; files: { id: string; name: string; size: number; mime: string; sha256: string }[] }) {
  if (!files.length) return <p className="text-small text-fg-tertiary">No files.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-md border border-line" data-testid="cpo-files">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 px-2.5 py-1.5">
          <FileText className="size-4 shrink-0 text-fg-tertiary" aria-hidden />
          <a className="focus-ring min-w-0 flex-1 truncate rounded-sm text-small text-fg underline-offset-2 hover:underline" href={fileUrl(projectId, f.id)} download data-testid="cpo-file-link">
            {f.name}
          </a>
          <span className="cp-mono shrink-0 text-caption text-fg-tertiary" title={`sha256 ${f.sha256}`}>
            {fmtSize(f.size)} · {f.sha256.slice(0, 10)}
          </span>
          <Download className="size-3.5 shrink-0 text-fg-tertiary" aria-hidden />
        </li>
      ))}
    </ul>
  );
}

function ApplyList({ applied }: { applied: ApplyResult[] }) {
  if (!applied.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" data-testid="cpo-applied">
      {applied.map((a, i) => (
        <li key={i} className="rounded-md border border-line px-3 py-2 text-small" data-target={a.target} data-ok={a.ok ? '1' : '0'}>
          <span className="flex items-center gap-2">
            <Badge tone={a.ok ? 'success' : 'warning'}>{a.target}</Badge>
            {a.dataOnly && <Badge tone="neutral">data only</Badge>}
            <span className="cp-mono ml-auto text-caption text-fg-tertiary">{fmtAt(a.at)}</span>
          </span>
          <span className="mt-1 block text-fg-secondary">{a.detail}</span>
          {a.rows && a.rows.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {a.rows.slice(0, 50).map((r, j) => (
                <li key={j} className={cn('text-caption', r.ok ? 'text-fg-secondary' : 'text-warning-fg')}>
                  {r.label}: {r.note}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ review (versions, diff, accept / request changes)

export function ReviewPanel({ projectId, req, subs, data, post, onChanged }: { projectId: string; req: OwnerRequestView; subs: CpSubmission[]; data: OwnerIntake; post: ReturnType<typeof useIntake>['post']; onChanged?: () => void }) {
  const toast = useToast();
  const mine = subs.filter((s) => s.requestId === req.id).sort((a, b) => b.version - a.version);
  const [ver, setVer] = React.useState<number>(mine[0]?.version ?? 0);
  React.useEffect(() => setVer(mine[0]?.version ?? 0), [mine[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sub = mine.find((s) => s.version === ver) ?? mine[0];
  const prev = sub ? mine.find((s) => s.version === sub.version - 1) : undefined;
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const users = (sub?.answers.users as TableRow[] | undefined) ?? [];
  const [invite, setInvite] = React.useState<string[]>([]);
  const [opts, setOpts] = React.useState({ branding: true, testers: true, company: true });
  React.useEffect(() => setInvite(users.map((u) => u.email)), [sub?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!req.schema) return null;
  if (!sub) return <p className="text-small text-fg-tertiary" data-testid="cpo-no-sub">Nothing submitted yet. {req.formStatus === 'draft' ? `The client saved a draft ${fmtAt(req.draftAt)}.` : ''}</p>;
  const fname = (id: string) => sub.files.find((f) => f.id === id)?.name ?? 'file';
  const diff = prev ? diffAnswers(req.schema, prev.answers, sub.answers, fname) : [];
  const latest = sub.version === req.version;
  const wsName = data.tenants.find((t) => t.code === data.tenantCode)?.name ?? null;
  const apply = { branding: req.templateKey === 'brand' && opts.branding, testers: req.templateKey === 'uat-team' && opts.testers, company: req.templateKey === 'company' && opts.company, invites: req.templateKey === 'users' ? invite : null };
  const run = async (body: Record<string, unknown>, what: string, ok: string) => {
    setBusy(what);
    const r = await post({ requestId: req.id, submissionId: sub.id, ...body });
    setBusy(null);
    toast({ message: r.success ? ok : r.error || 'That did not work.' });
    if (r.success) {
      setNote('');
      onChanged?.();
    }
  };
  return (
    <div className="flex flex-col gap-3" data-testid="cpo-review" data-version={sub.version} data-status={sub.status}>
      <div className="flex flex-wrap items-center gap-2">
        {mine.map((s) => (
          <button key={s.id} type="button" onClick={() => setVer(s.version)} className={cn('focus-ring rounded-full px-2.5 py-0.5 text-caption', s.version === sub.version ? 'bg-inverse text-fg-inverse' : 'border border-line text-fg-secondary')} data-testid="cpo-version">
            v{s.version} · {s.status.replace('_', ' ')}
          </button>
        ))}
      </div>
      <p className="text-caption text-fg-tertiary">
        Submitted by {who(sub.actor)} on {fmtAt(sub.submittedAt)}
        {sub.reviewedAt ? ` · reviewed by ${sub.reviewedBy} on ${fmtAt(sub.reviewedAt)}` : ''}
      </p>
      {sub.reviewNote && <p className="rounded-md bg-subtle px-3 py-2 text-small text-fg-secondary">Our note: {sub.reviewNote}</p>}
      {prev && (
        <div className="flex flex-col gap-1" data-testid="cpo-diff">
          <span className="text-caption text-fg-tertiary">Changes from v{prev.version}</span>
          {diff.length === 0 ? (
            <span className="text-small text-fg-tertiary">No changes in the answers.</span>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {diff.slice(0, 60).map((d, i) => (
                <li key={i} className="text-small" data-testid="cpo-diff-row" data-kind={d.kind}>
                  <span className="text-fg-secondary">{d.label}: </span>
                  {d.before && <span className="cpi-diff-del">{d.before}</span>} {d.after && <span className="cpi-diff-add">{d.after}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <FormFields schema={req.schema} values={sub.answers} files={sub.files.map((f) => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, field: f.field }))} readOnly />
      {sub.files.length > 0 && <FileLinks projectId={projectId} files={sub.files} />}
      <ApplyList applied={sub.applied} />
      {latest && sub.status === 'submitted' && (
        <Card className="flex flex-col gap-3 p-3" data-testid="cpo-decide">
          {req.templateKey === 'brand' && <Checkbox checked={opts.branding} onChange={(e) => setOpts({ ...opts, branding: e.target.checked })} label={`Apply the brand colour${wsName ? ` to ${wsName}` : ' (pick the client workspace on Client data first)'}`} data-testid="cpo-apply-branding" />}
          {req.templateKey === 'uat-team' && <Checkbox checked={opts.testers} onChange={(e) => setOpts({ ...opts, testers: e.target.checked })} label="Add them as client people on this project" data-testid="cpo-apply-testers" />}
          {req.templateKey === 'company' && <Checkbox checked={opts.company} onChange={(e) => setOpts({ ...opts, company: e.target.checked })} label="Save as the client’s company profile (for Agreements and billing)" data-testid="cpo-apply-company" />}
          {req.templateKey === 'users' && (
            <fieldset className="flex flex-col gap-1" data-testid="cpo-apply-invites">
              <legend className="mb-1 text-small text-fg">Create invites{wsName ? ` in ${wsName}` : ' (pick the client workspace on Client data first)'} for (no emails are sent):</legend>
              {users.map((u) => (
                <Checkbox key={u.email} checked={invite.includes(u.email)} onChange={(e) => setInvite(e.target.checked ? [...invite, u.email] : invite.filter((x) => x !== u.email))} label={`${u.name} · ${u.email} · ${u.role}`} />
              ))}
            </fieldset>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<Check />} loading={busy === 'accept'} onClick={() => void run({ action: 'accept', apply }, 'accept', `v${sub.version} accepted`)} data-testid="cpo-accept">
              Accept
            </Button>
          </div>
          <Field label="Or ask for changes" htmlFor={`cpo-note-${req.id}`} hint="The client sees this note on the board.">
            <Textarea id={`cpo-note-${req.id}`} rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} data-testid="cpo-note" />
          </Field>
          <Button variant="secondary" className="w-fit" disabled={note.trim().length < 3} loading={busy === 'changes'} onClick={() => void run({ action: 'changes', note }, 'changes', 'Changes requested')} data-testid="cpo-changes">
            Request changes
          </Button>
        </Card>
      )}
      {latest && sub.status === 'accepted' && ['brand', 'users', 'uat-team', 'company'].includes(req.templateKey) && (
        <Button variant="ghost" className="w-fit" icon={<RefreshCw />} loading={busy === 'reapply'} onClick={() => void run({ action: 'reapply', apply }, 'reapply', 'Applied again')} data-testid="cpo-reapply">
          Apply again
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the card drawer panel

export function CardIntakePanel({ projectId, task, onChanged }: { projectId: string; task: OwnerTaskView; onChanged: () => Promise<void> | void }) {
  const { data, error, post } = useIntake(projectId);
  const toast = useToast();
  if (task.ownerSide !== 'client' || task.type === 'defect') return null;
  if (error) return <p className="text-small text-danger-fg">{error}</p>;
  if (!data) return null;
  if (!data.enabled) return null;
  const req = data.requests.find((r) => r.taskId === task.id);
  const act = async (body: Record<string, unknown>, ok: string) => {
    const r = await post(body);
    toast({ message: r.success ? ok : r.error || 'That did not work.' });
    if (r.success) await onChanged();
    return r.success;
  };
  return (
    <section aria-label="Client item" className="flex flex-col gap-3 rounded-lg border border-line p-3" data-testid="cpo-card-intake" data-kind={req?.kind ?? ''}>
      {!req ? (
        <AttachStep onAttach={(body) => act({ action: 'attach', taskId: task.id, ...body }, 'Client step attached')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-strong text-fg">Client item</span>
            <Badge tone="neutral">{KIND_LABEL[req.kind]}</Badge>
            <Badge tone={toneOf(req.unified)}>{req.unified === 'waiting_on_us' ? 'Waiting on us' : UNIFIED_LABEL[req.unified]}</Badge>
            <span className="text-caption text-fg-tertiary" data-testid="cpo-client-label">
              Client sees: {req.clientLabel}
            </span>
          </div>
          {req.state.completedVia && <p className="text-caption text-fg-tertiary">Completed: {req.state.completedVia}{req.state.completedAt ? ` (${fmtAt(req.state.completedAt)})` : ''}</p>}
          {req.schema && <ReviewPanel projectId={projectId} req={req} subs={data.submissions} data={data} post={post} onChanged={() => void onChanged()} />}
          {req.kind === 'dns' && <DnsControl req={req} act={act} />}
          {req.kind === 'keys' && <KeysControl req={req} data={data} act={act} />}
          {(req.kind === 'signature' || req.kind === 'payment') && <EnvelopeControl req={req} data={data} act={act} />}
          {req.kind === 'payment' && <PaymentControl projectId={projectId} req={req} act={act} />}
          {req.kind === 'uat' && <p className="text-small text-fg-secondary">Completes by itself when the UAT Sign-off Certificate card is complete.</p>}
        </>
      )}
    </section>
  );
}

function AttachStep({ onAttach }: { onAttach: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [mode, setMode] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [fields, setFields] = React.useState<{ label: string; type: FieldType; required: boolean; options: string }[]>([{ label: '', type: 'text', required: true, options: '' }]);
  const submit = () => {
    if (mode === 'custom') void onAttach({ kind: 'form', schema: { title, fields: fields.map((f) => ({ label: f.label, type: f.type, required: f.required, options: f.options.split(',').map((x) => x.trim()).filter(Boolean), columns: f.type === 'table' ? [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email' }] : undefined })) } });
    else if (['dns', 'keys', 'payment'].includes(mode)) void onAttach({ kind: mode });
    else if (mode) void onAttach({ kind: 'form', template: mode });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="cpo-attach">
      <span className="text-body-strong text-fg">Client item: how does the client complete it?</span>
      <Select aria-label="Client step" value={mode} onChange={(e) => setMode(e.target.value)} data-testid="cpo-attach-kind">
        <option value="">Tick or “I’ve done this” (no step)</option>
        {Object.entries(FORM_TEMPLATES).map(([k, s]) => (
          <option key={k} value={k}>
            Form: {s.title}
          </option>
        ))}
        <option value="custom">Form: custom fields…</option>
        <option value="dns">DNS records and Check DNS</option>
        <option value="keys">Provider keys (status only)</option>
        <option value="payment">Payment (I’ve paid, owner confirms)</option>
      </Select>
      {mode === 'custom' && (
        <div className="flex flex-col gap-2">
          <Input aria-label="Form title" placeholder="Form title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} data-testid="cpo-custom-title" />
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_auto_auto] items-center gap-2">
              <Input aria-label={`Field ${i + 1} label`} placeholder="Question" value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={120} />
              <Select aria-label={`Field ${i + 1} type`} value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FieldType } : x)))}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Checkbox checked={f.required} label="Required" onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />
              <IconButton label={`Remove field ${i + 1}`} size="sm" variant="ghost" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                <Trash2 />
              </IconButton>
              {(f.type === 'select' || f.type === 'multiselect') && <Input aria-label={`Field ${i + 1} options`} className="col-span-4" placeholder="Options, separated by commas" value={f.options} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)))} />}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus />} className="w-fit" onClick={() => setFields([...fields, { label: '', type: 'text', required: false, options: '' }])}>
            Add a field
          </Button>
        </div>
      )}
      {mode && (
        <Button variant="secondary" className="w-fit" onClick={submit} data-testid="cpo-attach-save">
          Attach
        </Button>
      )}
    </div>
  );
}

function DnsControl({ req, act }: { req: OwnerRequestView; act: (b: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [domain, setDomain] = React.useState(req.config.domain ?? '');
  const [extra, setExtra] = React.useState<DnsRecord[]>(req.config.extraRecords ?? []);
  const res = req.state.dns?.results ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="cpo-dns">
      <Field label="Sending domain" htmlFor={`cpo-dom-${req.id}`}>
        <div className="flex gap-2">
          <Input id={`cpo-dom-${req.id}`} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.client.com" data-testid="cpo-dns-domain" />
          <Button variant="secondary" onClick={() => void act({ action: 'config', requestId: req.id, domain }, 'Domain saved')} data-testid="cpo-dns-domain-save">
            Save
          </Button>
        </div>
      </Field>
      {req.records.length > 0 && (
        <ul className="flex flex-col gap-1">
          {req.records.map((r) => {
            const ok = res.find((x) => x.type === r.type && x.name === r.name)?.ok;
            return (
              <li key={`${r.type}${r.name}`} className="text-caption" data-testid="cpo-dns-record" data-ok={ok === undefined ? '' : ok ? '1' : '0'}>
                <Badge tone={ok ? 'success' : ok === false ? 'warning' : 'neutral'}>{r.type}</Badge> <span className="cp-mono">{r.name}</span> → <span className="cp-mono break-all">{r.value}</span>
              </li>
            );
          })}
        </ul>
      )}
      <details>
        <summary className="cursor-pointer text-small text-fg-secondary">Extra records from the email provider ({extra.length})</summary>
        <div className="mt-2 flex flex-col gap-2">
          {extra.map((r, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2">
              <Select aria-label="Type" value={r.type} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, type: e.target.value as DnsRecord['type'] } : x)))}>
                <option>TXT</option>
                <option>CNAME</option>
                <option>MX</option>
              </Select>
              <Input aria-label="Name" value={r.name} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={`resend._domainkey.${domain || 'domain'}`} />
              <Input aria-label="Value" value={r.value} onChange={(e) => setExtra(extra.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <IconButton label="Remove record" size="sm" variant="ghost" onClick={() => setExtra(extra.filter((_, j) => j !== i))}>
                <Trash2 />
              </IconButton>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setExtra([...extra, { type: 'TXT', name: '', value: '', purpose: 'Email sending.' }])}>
              Add a record
            </Button>
            <Button size="sm" variant="secondary" disabled={!req.config.domain} onClick={() => void act({ action: 'config', requestId: req.id, extraRecords: extra }, 'Records saved')}>
              Save records
            </Button>
          </div>
        </div>
      </details>
      <Button variant="secondary" className="w-fit" icon={<RefreshCw />} disabled={!req.config.domain} onClick={() => void act({ action: 'check_dns', requestId: req.id }, 'DNS checked')} data-testid="cpo-dns-check">
        Check DNS now
      </Button>
    </div>
  );
}

function KeysControl({ req, data, act }: { req: OwnerRequestView; data: OwnerIntake; act: (b: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [providers, setProviders] = React.useState<string[]>(req.config.providers ?? []);
  const res = req.state.keys?.providers ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="cpo-keys">
      {!data.tenantCode && <p className="text-small text-warning-fg">Pick the client’s workspace on Client data: the test results are read from there.</p>}
      <p className="text-caption text-fg-tertiary">No key ever comes through the board. The client enters keys on their own workspace’s AI providers page and runs Test connection; only pass or fail is read here.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {['ai', 'claude', 'openai', 'gemini', 'elevenlabs', 'resend'].map((pv) => (
          <Checkbox key={pv} checked={providers.includes(pv)} label={PROVIDER_LABEL[pv]} onChange={(e) => setProviders(e.target.checked ? [...providers, pv] : providers.filter((x) => x !== pv))} />
        ))}
      </div>
      <ul className="flex flex-col gap-0.5">
        {(req.config.providers ?? []).map((pv) => {
          const r = res.find((x) => x.provider === pv);
          return (
            <li key={pv} className="text-caption" data-testid="cpo-key" data-ok={r?.ok ? '1' : '0'}>
              {r?.ok ? '✓' : '·'} {PROVIDER_LABEL[pv] ?? pv}: {r?.ok ? `test passed ${fmtAt(r.at)}` : 'not passed yet'}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => void act({ action: 'config', requestId: req.id, providers }, 'Providers saved')}>
          Save providers
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={() => void act({ action: 'check_keys', requestId: req.id }, 'Checked')} data-testid="cpo-keys-check">
          Check now
        </Button>
      </div>
    </div>
  );
}

function EnvelopeControl({ req, data, act }: { req: OwnerRequestView; data: OwnerIntake; act: (b: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const opts = data.envelopes.filter((e) => !req.config.templateId || e.templateId === req.config.templateId || e.templateId.startsWith('dev-'));
  const cur = data.envelopes.find((e) => e.id === req.config.envelopeId);
  const env = req.state.envelope;
  return (
    <div className="flex flex-col gap-2" data-testid="cpo-envelope">
      <Field label={req.kind === 'payment' ? 'Billing statement (optional)' : 'Agreements envelope'} htmlFor={`cpo-env-${req.id}`} hint={req.config.envelopeLinkedBy === 'auto' ? 'Linked automatically by template and client name.' : undefined}>
        <Select id={`cpo-env-${req.id}`} value={req.config.envelopeId ?? ''} onChange={(e) => void act({ action: 'config', requestId: req.id, envelopeId: e.target.value || null }, e.target.value ? 'Envelope linked' : 'Envelope unlinked')} data-testid="cpo-envelope-pick">
          <option value="">Not linked</option>
          {opts.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} · {e.client || 'no client'} · {e.status}
            </option>
          ))}
        </Select>
      </Field>
      {env && (
        <p className="text-caption text-fg-secondary" data-testid="cpo-envelope-state">
          Envelope {env.status}
          {env.outcome ? ` (${env.outcome})` : ''}
          {env.deemedOn ? ` · deemed confirmed (due ${env.deemedOn})` : ''}
          {cur?.billing ? ` · ${cur.billing.number}: ${cur.billing.currency} ${cur.billing.paid} of ${cur.billing.total} paid` : ''}
        </p>
      )}
      {req.config.envelopeId && (env?.status === 'completed' || env?.status === 'signed') && (
        <a className="focus-ring inline-flex w-fit items-center gap-1 rounded-sm text-small text-fg underline" href={`/api/agreements/${req.config.envelopeId}/file/final`} target="_blank" rel="noopener noreferrer" data-testid="cpo-signed-pdf">
          Signed PDF <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </div>
  );
}

function PaymentControl({ projectId, req, act }: { projectId: string; req: OwnerRequestView; act: (b: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const pay = req.state.payment ?? {};
  const state = req.sysStatus === 'received' ? 'received' : req.sysStatus === 'client_says_paid' ? 'claimed' : pay.followUpAt ? 'followup' : 'awaiting';
  const [mode, setMode] = React.useState<'' | 'received' | 'not_received'>('');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(todayManila());
  const [method, setMethod] = React.useState('bank');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const receipt = pay.receiptFileId ? req.files.find((f) => f.id === pay.receiptFileId) : undefined;
  const label = { awaiting: 'Not yet due / Awaiting payment', claimed: 'Client says paid', received: 'Payment received', followup: 'Not received / Follow up' }[state];
  return (
    <div className="flex flex-col gap-2" data-testid="cpo-payment" data-state={state}>
      <span className="flex items-center gap-2 text-small">
        Payment status: <Badge tone={state === 'received' ? 'success' : state === 'claimed' ? 'warning' : 'neutral'}>{label}</Badge>
      </span>
      {state === 'claimed' && (
        <p className="text-small text-fg-secondary">
          {pay.claimedBy} (self-identified) said it is paid on {fmtAt(pay.claimedAt)}.
          {receipt && (
            <>
              {' '}
              Receipt:{' '}
              <a className="underline" href={fileUrl(projectId, receipt.id)} download data-testid="cpo-receipt">
                {receipt.name}
              </a>
            </>
          )}
        </p>
      )}
      {pay.received && (
        <p className="text-small text-fg-secondary" data-testid="cpo-received">
          Received {pay.received.amount} on {pay.received.date} by {PAYMENT_METHOD_LABEL[pay.received.method]}
          {pay.received.reference ? ` (ref ${pay.received.reference})` : ''} · recorded by {pay.received.by}
          {pay.received.via === 'agreements' ? ' in Agreements' : ''}
        </p>
      )}
      {state === 'followup' && <p className="text-small text-fg-secondary">Follow-up note on the board: {pay.followUpNote || '(no note)'}</p>}
      <div className="flex flex-wrap gap-2">
        {state !== 'received' && (
          <Button size="sm" variant="primary" onClick={() => setMode('received')} data-testid="cpo-pay-received">
            Payment received
          </Button>
        )}
        {state !== 'received' && (
          <Button size="sm" variant="secondary" onClick={() => setMode('not_received')} data-testid="cpo-pay-not">
            Not received / Follow up
          </Button>
        )}
        {state !== 'awaiting' && (
          <Button size="sm" variant="ghost" onClick={() => void act({ action: 'payment', requestId: req.id, state: 'awaiting' }, 'Set to awaiting payment')} data-testid="cpo-pay-reset">
            Back to awaiting payment
          </Button>
        )}
      </div>
      {mode === 'received' && (
        <Card className="grid grid-cols-2 gap-2 p-3" data-testid="cpo-pay-form">
          <Field label="Amount" htmlFor={`pa-${req.id}`}>
            <Input id={`pa-${req.id}`} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="cpo-pay-amount" />
          </Field>
          <Field label="Date received" htmlFor={`pd-${req.id}`}>
            <Input id={`pd-${req.id}`} type="date" value={date} max={todayManila()} onChange={(e) => setDate(e.target.value)} data-testid="cpo-pay-date" />
          </Field>
          <Field label="Method" htmlFor={`pm-${req.id}`}>
            <Select id={`pm-${req.id}`} value={method} onChange={(e) => setMethod(e.target.value)} data-testid="cpo-pay-method">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference (optional)" htmlFor={`pr-${req.id}`}>
            <Input id={`pr-${req.id}`} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} data-testid="cpo-pay-ref" />
          </Field>
          <Button
            className="col-span-2 w-fit"
            variant="primary"
            disabled={!(Number(amount) > 0) || !date}
            onClick={async () => {
              if (await act({ action: 'payment', requestId: req.id, state: 'received', amount: Number(amount), date, method, reference }, 'Payment recorded; the card is Done')) setMode('');
            }}
            data-testid="cpo-pay-save"
          >
            Record payment
          </Button>
        </Card>
      )}
      {mode === 'not_received' && (
        <Card className="flex flex-col gap-2 p-3">
          <Field label="Note for the client (optional)" htmlFor={`pn-${req.id}`} hint="Shown on the board as “We haven’t received this yet.” followed by your note.">
            <Textarea id={`pn-${req.id}`} rows={2} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} data-testid="cpo-pay-note" />
          </Field>
          <Button
            variant="secondary"
            className="w-fit"
            onClick={async () => {
              if (await act({ action: 'payment', requestId: req.id, state: 'not_received', note }, 'Marked not received')) setMode('');
            }}
            data-testid="cpo-pay-not-save"
          >
            Save
          </Button>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the project's Submissions inbox

export function SubmissionsTab({ projectId, onOpenTask }: { projectId: string; onOpenTask: (taskId: string) => void }) {
  const { data, error, post, load } = useIntake(projectId);
  const [open, setOpen] = React.useState<string | null>(null);
  if (error) return <p className="text-small text-danger-fg">{error}</p>;
  if (!data) return <p className="text-small text-fg-tertiary">Loading…</p>;
  if (!data.enabled) return <EmptyState icon={<FileText />} title="Client Intake is off" description="Turn it on in the Client data tab to give every client item a form, a check, a signature or a payment step." />;
  const byReq = new Map(data.requests.map((r) => [r.id, r]));
  const rows = [...data.submissions].sort((a, b) => Number(b.status === 'submitted') - Number(a.status === 'submitted') || b.submittedAt.localeCompare(a.submittedAt));
  const sel = open ? rows.find((s) => s.id === open) : undefined;
  const selReq = sel ? byReq.get(sel.requestId) : undefined;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]" data-testid="cpo-inbox">
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-small text-fg-tertiary">No submissions yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((s) => {
              const r = byReq.get(s.requestId);
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => setOpen(s.id)} className={cn('focus-ring flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-subtle', open === s.id && 'bg-subtle')} data-testid="cpo-inbox-row" data-status={s.status}>
                    <span className="flex items-center gap-2 text-small">
                      <span className="cp-mono text-fg-tertiary">{r?.key}</span>
                      <span className="min-w-0 flex-1 truncate text-fg">{r?.schema?.title ?? r?.title}</span>
                      <Badge tone={s.status === 'submitted' ? 'warning' : s.status === 'accepted' ? 'success' : 'neutral'}>{s.status === 'submitted' ? 'Needs review' : s.status.replace('_', ' ')}</Badge>
                    </span>
                    <span className="text-caption text-fg-tertiary">
                      v{s.version} · {who(s.actor)} · {fmtAt(s.submittedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <div>
        {sel && selReq ? (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2">
              <span className="text-body-strong text-fg">
                {selReq.key} {selReq.schema?.title}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpenTask(selReq.taskId)}>
                Open card
              </Button>
            </div>
            <ReviewPanel projectId={projectId} req={selReq} subs={data.submissions} data={data} post={post} onChanged={() => void load()} />
          </Card>
        ) : (
          <p className="text-small text-fg-tertiary">Pick a submission to review it.</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the Client data tab

export function ClientDataTab({ projectId, project, onChanged, onOpenTask }: { projectId: string; project: OwnerProjectView; onChanged: () => Promise<void> | void; onOpenTask: (taskId: string) => void }) {
  const { data, error, post, load } = useIntake(projectId);
  const toast = useToast();
  const [ws, setWs] = React.useState<string>('');
  React.useEffect(() => setWs(data?.tenantCode ?? ''), [data?.tenantCode]);
  if (error) return <p className="text-small text-danger-fg">{error}</p>;
  if (!data) return <p className="text-small text-fg-tertiary">Loading…</p>;
  const act = async (body: Record<string, unknown>, ok: string) => {
    const r = await post(body);
    toast({ message: r.success ? ok : r.error || 'That did not work.' });
    if (r.success) await onChanged();
  };
  const latestOf = (tk: string) => {
    const r = data.requests.find((x) => x.templateKey === tk);
    if (!r) return { r: undefined, s: undefined };
    const subs = data.submissions.filter((x) => x.requestId === r.id).sort((a, b) => b.version - a.version);
    return { r, s: subs.find((x) => x.status === 'accepted') ?? subs[0] };
  };
  const users = latestOf('users');
  const testers = latestOf('uat-team');
  const brand = latestOf('brand');
  const quest = latestOf('questionnaire');
  return (
    <div className="flex flex-col gap-4" data-testid="cpo-client-data">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3" data-testid="cpo-intake-switch">
          <Switch checked={data.enabled} onCheckedChange={(v) => void act({ action: 'enable', on: v }, v ? 'Client Intake is on' : 'Client Intake is off')} label="Client Intake" />
          <span className="text-small text-fg">
            <span className="font-medium">Client Intake {data.enabled ? 'on' : 'off'}.</span> Every client item completes through a form, a check, a signature or a payment, and its status syncs to this board.
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="The client’s workspace" htmlFor="cpo-ws" hint="Branding, user invites and key checks only ever go to this one workspace.">
            <Select id="cpo-ws" value={ws} onChange={(e) => setWs(e.target.value)} data-testid="cpo-ws">
              <option value="">Not set</option>
              {data.tenants.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name} ({t.code})
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" disabled={ws === (data.tenantCode ?? '')} onClick={() => void act({ action: 'workspace', tenantCode: ws || null }, 'Workspace saved')} data-testid="cpo-ws-save">
            Save
          </Button>
          <span className="ml-auto flex gap-2">
            <a className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-small" href={`/api/client-projects/${projectId}/intake/export?format=csv`} download data-testid="cpo-export-csv">
              <Download className="size-3.5" aria-hidden /> Export CSV
            </a>
            <a className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-small" href={`/api/client-projects/${projectId}/intake/export?format=json`} download data-testid="cpo-export-json">
              <Download className="size-3.5" aria-hidden /> Export JSON
            </a>
            <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={() => void load(true)}>
              Sync now
            </Button>
          </span>
        </div>
      </Card>

      {data.enabled && (
        <Card className="p-0">
          <table className="w-full text-small" data-testid="cpo-items">
            <thead>
              <tr className="text-left text-caption text-fg-tertiary">
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Client sees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.requests.map((r) => (
                <tr key={r.id} data-testid="cpo-item" data-u={r.unified} data-key={r.key}>
                  <td className="px-3 py-1.5">
                    <button type="button" className="focus-ring rounded-sm text-left text-fg hover:underline" onClick={() => onOpenTask(r.taskId)}>
                      <span className="cp-mono mr-1.5 text-fg-tertiary">{r.key}</span>
                      {r.title}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-fg-secondary">{KIND_LABEL[r.kind]}</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={toneOf(r.unified)}>{r.unified === 'waiting_on_us' ? 'Waiting on us' : UNIFIED_LABEL[r.unified]}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-fg-secondary">{r.clientLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2 p-4" data-testid="cpo-company">
          <span className="text-body-strong text-fg">Company profile</span>
          {data.company ? (
            <>
              <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-small">
                {(
                  [
                    ['Legal name', data.company.legalName],
                    ['SEC / registration', data.company.secNo],
                    ['TIN', data.company.tin],
                    ['Address', data.company.address],
                    ['Signatory', `${data.company.signatoryName}, ${data.company.signatoryTitle}`],
                    ['Billing email', data.company.billingEmail],
                    ['Phone', data.company.phone],
                    ['Website', data.company.website],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-fg-tertiary">{k}</dt>
                    <dd className="whitespace-pre-wrap break-words text-fg">{v || '-'}</dd>
                  </React.Fragment>
                ))}
              </dl>
              {data.agreementFields && (
                <details>
                  <summary className="cursor-pointer text-small text-fg-secondary">Agreements field values (to copy into new envelopes)</summary>
                  <pre className="cp-mono mt-1 overflow-x-auto rounded-md bg-subtle p-2 text-caption" data-testid="cpo-agreement-fields">
                    {JSON.stringify(data.agreementFields, null, 2)}
                  </pre>
                </details>
              )}
            </>
          ) : (
            <p className="text-small text-fg-tertiary">Appears when you accept the company details.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-2 p-4" data-testid="cpo-brand">
          <span className="text-body-strong text-fg">Brand</span>
          {brand.s ? (
            <>
              <span className="flex items-center gap-3 text-small">
                {(['primary', 'secondary'] as const).map((k) =>
                  typeof brand.s?.answers[k] === 'string' ? (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="inline-block size-4 rounded-sm border border-line" style={{ background: brand.s.answers[k] as string }} />
                      <span className="cp-mono">{brand.s.answers[k] as string}</span>
                    </span>
                  ) : null,
                )}
                <Badge tone={brand.s.status === 'accepted' ? 'success' : 'warning'}>v{brand.s.version} {brand.s.status.replace('_', ' ')}</Badge>
              </span>
              <FileLinks projectId={projectId} files={brand.s.files} />
            </>
          ) : (
            <p className="text-small text-fg-tertiary">Nothing submitted yet.</p>
          )}
        </Card>

        <Card className="flex flex-col gap-2 p-4" data-testid="cpo-users">
          <span className="text-body-strong text-fg">Users</span>
          {users.s ? <PeopleTable rows={(users.s.answers.users as TableRow[]) ?? []} cols={['name', 'email', 'role']} status={`v${users.s.version} ${users.s.status.replace('_', ' ')}`} /> : <p className="text-small text-fg-tertiary">Nothing submitted yet.</p>}
          {users.s && <ApplyList applied={users.s.applied} />}
        </Card>

        <Card className="flex flex-col gap-2 p-4" data-testid="cpo-testers">
          <span className="text-body-strong text-fg">UAT lead and testers</span>
          {testers.s ? <PeopleTable rows={(testers.s.answers.testers as TableRow[]) ?? []} cols={['name', 'email', 'role', 'from', 'to']} status={`v${testers.s.version} ${testers.s.status.replace('_', ' ')}`} /> : <p className="text-small text-fg-tertiary">Nothing submitted yet.</p>}
        </Card>

        <Card className="flex flex-col gap-2 p-4" data-testid="cpo-systems">
          <span className="text-body-strong text-fg">Keys, DNS, signatures and payments</span>
          <ul className="flex flex-col gap-1 text-small">
            {data.requests
              .filter((r) => r.kind !== 'form')
              .map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="cp-mono text-fg-tertiary">{r.key}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{r.title}</span>
                  <Badge tone={toneOf(r.unified)}>{r.clientLabel}</Badge>
                </li>
              ))}
          </ul>
          {data.tenantCode && (
            <p className="text-caption text-fg-tertiary">
              Key tests in {data.tenantCode}: {data.keyChecks.length ? data.keyChecks.map((k) => `${k.provider} ${k.ok ? 'passed' : 'failed'}`).join(', ') : 'none yet'}
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-2 p-4" data-testid="cpo-questionnaire">
          <span className="text-body-strong text-fg">Questionnaire</span>
          {quest.s && quest.r?.schema ? <FormFields schema={quest.r.schema} values={quest.s.answers} files={[]} readOnly /> : <p className="text-small text-fg-tertiary">Nothing submitted yet.</p>}
        </Card>
      </div>

      <Card className="flex flex-col gap-2 p-4">
        <span className="text-body-strong text-fg">All client files ({data.files.length})</span>
        <p className="text-caption text-fg-tertiary">Downloads only (never opened in the browser). The hash is the evidence of exactly what was received.</p>
        <FileLinks projectId={projectId} files={data.files} />
      </Card>
      {project.status === 'archived' && <p className="text-caption text-fg-tertiary">This project is archived.</p>}
    </div>
  );
}

function PeopleTable({ rows, cols, status }: { rows: TableRow[]; cols: string[]; status: string }) {
  return (
    <>
      <span className="text-caption text-fg-tertiary">
        {rows.length} row(s) · {status}
      </span>
      <div className="max-h-64 overflow-auto">
        <table className="cpi-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className="text-fg">
                    {r[c] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
