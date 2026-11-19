'use client';

/**
 * The client's full-height panel for one item on the shared board: a step-by-step form with uploads (explicit Save
 * draft, an "unsaved changes" guard, a summary before Submit), or the item's own way to complete it (DNS records and
 * Check DNS, the provider-keys status, Open to sign / confirm, View billing statement and "I've paid").
 * The board token is the only credential; the server re-checks everything.
 */
import * as React from 'react';
import { Check, CircleAlert, Copy, ExternalLink, Lock } from 'lucide-react';
import { Badge, Button, Dialog, Drawer, Field, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fmtAt, type PublicProject, type PublicTask } from '@/lib/clientProjects/types';
import { answerText, stepsOf, validateAnswers, type AnswerValue, type Answers, type PublicIntake, type PublicIntakeFile } from '@/lib/clientProjects/intake';
import { FormFields, fmtSize, type UploadResult } from '@/components/clientProjects/intake/FormRenderer';

type Act = (body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; errors?: Record<string, string>; board?: PublicProject }>;

export function ClientIntakePanel({
  token,
  task,
  intake,
  readOnly,
  who,
  withName,
  onBoard,
  onClose,
}: {
  token: string;
  task: PublicTask;
  intake: PublicIntake;
  readOnly: boolean;
  /** The visitor's name and picked person (for the upload headers). */
  who: { name: string; personId: string };
  /** Runs `fn` once the visitor has said who they are. */
  withName: (fn: (name: string) => void) => void;
  onBoard: (b: PublicProject) => void;
  onClose: () => void;
}) {
  const form = intake.form;
  const [values, setValues] = React.useState<Answers>(() => form?.draft ?? {});
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [step, setStep] = React.useState(0);
  const [summary, setSummary] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [extraFiles, setExtraFiles] = React.useState<PublicIntakeFile[]>([]);
  const [previews, setPreviews] = React.useState<Record<string, string>>({});
  const [domain, setDomain] = React.useState(intake.dns?.domain ?? '');
  const [receipt, setReceipt] = React.useState<PublicIntakeFile | null>(intake.payment?.receipt ?? null);

  // Seed the form when a different item opens (never on a background refresh: typing is never lost).
  React.useEffect(() => {
    setValues(form?.draft ?? {});
    setDirty(false);
    setErrors({});
    setStep(0);
    setExtraFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake.requestId]);
  // The "unsaved changes" guard for the browser tab.
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  React.useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const files = [...(form?.files ?? []), ...extraFiles.filter((f) => !(form?.files ?? []).some((x) => x.id === f.id))];
  const steps = form ? stepsOf(form.schema) : [];
  const locked = !form || form.locked || readOnly;

  const act: Act = (body) =>
    new Promise((resolve) =>
      withName(async (name) => {
        try {
          const res = await fetch(`/api/board/${token}/intake`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, requestId: intake.requestId, name, ...(who.personId ? { personId: who.personId } : {}) }),
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
          });
          const d = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; errors?: Record<string, string>; board?: PublicProject };
          if (res.ok && d.success && d.board) onBoard(d.board);
          resolve({ ok: Boolean(res.ok && d.success), error: d.error, errors: d.errors, board: d.board });
        } catch {
          resolve({ ok: false, error: 'No connection. Check your internet and try again.' });
        }
      }),
    );

  const upload = (field: string, file: File, onProgress: (pct: number) => void): Promise<UploadResult> =>
    new Promise((resolve) =>
      withName((name) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/board/${token}/intake/upload?requestId=${encodeURIComponent(intake.requestId)}&field=${encodeURIComponent(field)}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
        xhr.setRequestHeader('X-Person-Name', encodeURIComponent(name));
        if (who.personId) xhr.setRequestHeader('X-Person-Id', who.personId);
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          let d: { success?: boolean; error?: string; file?: PublicIntakeFile; csv?: UploadResult['csv'] } = {};
          try {
            d = JSON.parse(xhr.responseText);
          } catch {
            /* not JSON */
          }
          if (xhr.status === 200 && d.success && d.file) {
            const f = d.file;
            setExtraFiles((x) => [...x, f]);
            if (f.field === 'logo' && /^image\//.test(file.type)) setPreviews((p) => ({ ...p, [f.id]: URL.createObjectURL(file) }));
            resolve({ ok: true, file: f, csv: d.csv });
          } else resolve({ ok: false, error: d.error || `Upload failed (${xhr.status}).` });
        };
        xhr.onerror = () => resolve({ ok: false, error: 'No connection. Try again.' });
        xhr.send(file);
      }),
    );

  const setValue = (k: string, v: AnswerValue | undefined) => {
    setValues((cur) => {
      const next = { ...cur };
      if (v === undefined || v === '') delete next[k];
      else next[k] = v;
      return next;
    });
    setDirty(true);
    setErrors((e) => {
      const { [k]: _gone, ...rest } = e;
      void _gone;
      return Object.fromEntries(Object.entries(rest).filter(([x]) => !x.startsWith(`${k}.`)));
    });
  };

  const save = async () => {
    setBusy('save');
    const r = await act({ action: 'save', answers: values });
    setBusy(null);
    if (r.ok) {
      setDirty(false);
      setNotice({ tone: 'ok', text: 'Draft saved. Nothing is sent to us until you submit.' });
    } else setNotice({ tone: 'bad', text: r.error || 'The draft could not be saved.' });
  };
  const review = () => {
    if (!form) return;
    const v = validateAnswers(form.schema, values, files, 'submit');
    if (!v.ok) {
      setErrors(v.errors);
      const first = steps.findIndex((s) => s.fields.some((f) => Object.keys(v.errors).some((k) => k === f.key || k.startsWith(`${f.key}.`))));
      if (first >= 0) setStep(first);
      setNotice({ tone: 'bad', text: 'Some answers need fixing before you submit.' });
      return;
    }
    setSummary(true);
  };
  const submit = async () => {
    setBusy('submit');
    const r = await act({ action: 'submit', answers: values });
    setBusy(null);
    setSummary(false);
    if (r.ok) {
      setDirty(false);
      setNotice({ tone: 'ok', text: 'Submitted. We review it and tell you here if anything needs changing.' });
    } else {
      if (r.errors) setErrors(r.errors);
      setNotice({ tone: 'bad', text: r.error || 'It could not be submitted.' });
    }
  };
  const removeFile = async (fileId: string) => {
    setExtraFiles((x) => x.filter((f) => f.id !== fileId));
    const r = await act({ action: 'remove_file', fileId });
    if (!r.ok) setNotice({ tone: 'bad', text: r.error || 'The file could not be removed.' });
    else setDirty(true);
  };
  const close = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close without saving them?')) return;
    onClose();
  };
  const simple = async (action: string, body: Record<string, unknown> = {}, ok?: string) => {
    setBusy(action);
    const r = await act({ action, ...body });
    setBusy(null);
    setNotice(r.ok ? (ok ? { tone: 'ok', text: ok } : null) : { tone: 'bad', text: r.error || 'That did not work. Try again.' });
  };

  const footer = form && !locked ? (
    <>
      {dirty && <span className="mr-auto text-caption text-fg-tertiary" data-testid="cpi-unsaved">Unsaved changes</span>}
      {step > 0 && (
        <Button variant="ghost" onClick={() => setStep(step - 1)}>
          Back
        </Button>
      )}
      <Button variant="secondary" onClick={() => void save()} loading={busy === 'save'} data-testid="cpi-save">
        Save draft
      </Button>
      {step < steps.length - 1 ? (
        <Button variant="primary" onClick={() => setStep(step + 1)} data-testid="cpi-next">
          Next
        </Button>
      ) : (
        <Button variant="primary" onClick={review} data-testid="cpi-review">
          Review and submit
        </Button>
      )}
    </>
  ) : (
    <Button variant="ghost" onClick={close}>
      Close
    </Button>
  );

  return (
    <Drawer open onClose={close} width={640} title={task.title} subtitle={<span data-testid="cpi-status">{intake.label}</span>} footer={footer}>
      <div className="flex flex-col gap-5" data-testid="cpi-panel" data-kind={intake.kind} data-u={intake.unified}>
        {notice && (
          <div role="status" className={cn('rounded-md border px-3 py-2 text-small', notice.tone === 'ok' ? 'border-success-fg/30 bg-success-bg text-success-fg' : 'border-warning-400/40 bg-warning-bg text-warning-fg')} data-testid="cpi-notice">
            {notice.text}
          </div>
        )}
        {task.description && !form?.schema.intro && <p className="whitespace-pre-wrap break-words text-body text-fg-secondary">{task.description}</p>}

        {form && (
          <section aria-label={form.schema.title} className="flex flex-col gap-4" data-testid="cpi-form" data-status={form.status}>
            {form.ownerNote && (
              <div role="note" className="flex gap-2 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="cpi-owner-note">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-medium">We asked for a change:</span> <span className="whitespace-pre-wrap">{form.ownerNote}</span>
                </span>
              </div>
            )}
            {locked ? (
              <>
                <p className="flex items-center gap-2 text-small text-fg-secondary" data-testid="cpi-locked">
                  <Lock className="size-3.5" aria-hidden />
                  {form.status === 'accepted' ? `Accepted. Version ${form.version}, submitted ${fmtAt(form.submittedAt)}.` : form.status === 'submitted' ? `Submitted ${fmtAt(form.submittedAt)} (version ${form.version}). We are reviewing it.` : 'Read-only.'}
                </p>
                <FormFields schema={form.schema} values={form.submitted ?? form.draft} files={files} readOnly />
              </>
            ) : (
              <>
                {form.schema.intro && <p className="text-small text-fg-secondary">{form.schema.intro}</p>}
                {steps.length > 1 && (
                  <nav className="cpi-steps" aria-label="Steps">
                    {steps.map((s, i) => (
                      <button key={s.title} type="button" className="focus-ring" aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)} data-testid="cpi-step">
                        {i + 1}. {s.title}
                      </button>
                    ))}
                  </nav>
                )}
                {form.draftAt && !dirty && <p className="text-caption text-fg-tertiary">Draft saved {fmtAt(form.draftAt)}.</p>}
                <FormFields schema={form.schema} fields={steps[step]?.fields} values={values} errors={errors} files={files} onChange={setValue} upload={upload} onRemoveFile={(id) => void removeFile(id)} localPreview={previews} />
              </>
            )}
          </section>
        )}

        {intake.dns && (
          <section aria-label="DNS records" className="flex flex-col gap-3" data-testid="cpi-dns">
            {intake.dns.canSetDomain && !readOnly && (
              <Field label="Your sending domain" htmlFor="cpi-domain" hint="The domain your outreach emails will come from, e.g. mail.yourcompany.com.">
                <div className="flex gap-2">
                  <Input id="cpi-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.yourcompany.com" maxLength={253} data-testid="cpi-domain" />
                  <Button variant="secondary" disabled={!domain.trim() || domain.trim() === intake.dns.domain} loading={busy === 'set_domain'} onClick={() => void simple('set_domain', { domain }, 'Domain saved. Add the records below.')} data-testid="cpi-domain-save">
                    Save
                  </Button>
                </div>
              </Field>
            )}
            {intake.dns.records.length > 0 && (
              <>
                <p className="text-small text-fg-secondary">Add these records at your DNS provider, then check. DNS changes can take a few hours to show.</p>
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                  {intake.dns.records.map((r) => (
                    <li key={`${r.type}|${r.name}`} className="flex flex-col gap-1 px-3 py-2" data-testid="cpi-dns-record" data-ok={r.ok === null ? '' : r.ok ? '1' : '0'}>
                      <span className="flex items-center gap-2 text-caption text-fg-tertiary">
                        <Badge tone="neutral">{r.type}</Badge> {r.purpose}
                        <span className="ml-auto">{r.ok === null ? 'Not checked' : r.ok ? <span className="text-success-fg">Found</span> : <span className="text-warning-fg">Not found yet</span>}</span>
                      </span>
                      <CopyRow label="Name" value={r.name} />
                      <CopyRow label="Value" value={r.value} />
                    </li>
                  ))}
                </ul>
                {!readOnly && intake.unified !== 'complete' && (
                  <Button variant="primary" onClick={() => void simple('check_dns', {}, 'Checked.')} loading={busy === 'check_dns'} data-testid="cpi-check-dns">
                    Check DNS
                  </Button>
                )}
                {intake.dns.checkedAt && <p className="text-caption text-fg-tertiary">Last checked {fmtAt(intake.dns.checkedAt)}.</p>}
              </>
            )}
          </section>
        )}

        {intake.keys && (
          <section aria-label="Provider keys" className="flex flex-col gap-3" data-testid="cpi-keys">
            <div role="note" className="flex gap-2 rounded-md border border-line bg-subtle px-3 py-2 text-small text-fg-secondary">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Never send keys by email, chat or this board. Enter them in your own workspace, where they are kept private, and run “Test connection” there. Only the pass or fail shows here.</span>
            </div>
            {intake.keys.workspaceUrl ? (
              <a className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-md bg-inverse px-3 py-2 text-small font-medium text-fg-inverse" href={intake.keys.workspaceUrl} target="_blank" rel="noopener noreferrer" data-testid="cpi-keys-link">
                Open your workspace’s keys page <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : (
              <p className="text-small text-fg-tertiary">Your workspace link appears here once it is set up.</p>
            )}
            <ul className="flex flex-col gap-1.5">
              {intake.keys.providers.map((pv) => (
                <li key={pv.provider} className="flex items-center gap-2 text-body" data-testid="cpi-key" data-ok={pv.ok ? '1' : '0'}>
                  {pv.ok ? <Check className="size-4 text-success-fg" aria-hidden /> : <span aria-hidden className="inline-block size-4 rounded-full border border-dashed border-line-strong" />}
                  <span className="text-fg">{pv.label}</span>
                  <span className="ml-auto text-caption text-fg-tertiary">{pv.ok ? 'Test passed' : 'Not tested yet'}</span>
                </li>
              ))}
            </ul>
            {!readOnly && intake.unified !== 'complete' && (
              <Button variant="secondary" onClick={() => void simple('check_keys', {}, 'Checked.')} loading={busy === 'check_keys'} data-testid="cpi-check-keys">
                Check again
              </Button>
            )}
          </section>
        )}

        {intake.signature && (
          <section aria-label="Signature" className="flex flex-col gap-3" data-testid="cpi-signature">
            {intake.signature.ready ? (
              <a className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-md bg-action-brand px-3.5 py-2 text-small font-medium text-action-brand-fg" href={`/api/board/${token}/intake/open/${intake.requestId}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" data-testid="cpi-open-sign">
                {intake.signature.action === 'acknowledge' ? 'Open to confirm' : 'Open to sign'} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : intake.signature.done ? (
              <p className="flex items-center gap-2 text-body text-success-fg">
                <Check className="size-4" aria-hidden /> {intake.label}
              </p>
            ) : (
              <p className="text-small text-fg-tertiary">{intake.signature.note ?? 'We send this to you for signature when it is ready. The button appears here.'}</p>
            )}
            {intake.signature.note && intake.signature.ready === false && intake.signature.done && <p className="text-small text-fg-secondary">{intake.signature.note}</p>}
          </section>
        )}

        {intake.payment && (
          <section aria-label="Payment" className="flex flex-col gap-3" data-testid="cpi-payment" data-state={intake.payment.state}>
            <span className="w-fit">
              <Badge tone={intake.payment.state === 'paid' ? 'success' : intake.payment.state === 'confirming' ? 'warning' : 'neutral'}>{intake.payment.chip}</Badge>
            </span>
            {intake.payment.note && (
              <p role="note" className="rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="cpi-pay-note">
                {intake.payment.note}
              </p>
            )}
            {intake.payment.statement && (
              <a className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-small text-fg underline-offset-2 hover:underline" href={`/api/board/${token}/intake/open/${intake.requestId}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" data-testid="cpi-statement">
                View billing statement <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            {intake.payment.canClaim && !readOnly && (
              <>
                <ReceiptPicker
                  receipt={receipt}
                  onPick={async (file) => {
                    const r = await upload('__receipt', file, () => undefined);
                    if (r.ok && r.file) setReceipt(r.file);
                    else setNotice({ tone: 'bad', text: r.error || 'The receipt could not be uploaded.' });
                  }}
                  onRemove={async () => {
                    if (!receipt) return;
                    const r = await act({ action: 'remove_file', fileId: receipt.id });
                    if (r.ok) setReceipt(null);
                  }}
                />
                <Button variant="primary" onClick={() => void simple('paid', { receiptFileId: receipt?.id ?? null }, 'Thank you. We confirm the payment once it arrives.')} loading={busy === 'paid'} data-testid="cpi-paid">
                  I’ve paid
                </Button>
              </>
            )}
            {intake.payment.state === 'confirming' && <p className="text-small text-fg-secondary">You told us it is paid. We confirm it once it arrives.</p>}
          </section>
        )}

        {intake.uat && <p className="text-body text-fg-secondary" data-testid="cpi-uat">{intake.uat.note}</p>}
      </div>

      {form && (
        <Dialog
          open={summary}
          onClose={() => setSummary(false)}
          size="md"
          title={`Submit “${form.schema.title}”?`}
          description="Check your answers. Once submitted, the form is locked while we review it."
          footer={
            <>
              <Button variant="ghost" onClick={() => setSummary(false)}>
                Keep editing
              </Button>
              <Button variant="primary" onClick={() => void submit()} loading={busy === 'submit'} data-testid="cpi-submit">
                Submit
              </Button>
            </>
          }
        >
          <dl className="flex flex-col gap-2" data-testid="cpi-summary">
            {form.schema.fields.map((f) => (
              <div key={f.key} className="flex flex-col">
                <dt className="text-caption text-fg-tertiary">{f.label}</dt>
                <dd className="whitespace-pre-wrap break-words text-small text-fg">{answerText(f, values[f.key], (id) => files.find((x) => x.id === id)?.name ?? 'file') || <span className="text-fg-tertiary">Not answered</span>}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      )}
    </Drawer>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <span className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-caption text-fg-tertiary">{label}</span>
      <code className="cp-mono min-w-0 flex-1 break-all text-caption text-fg">{value}</code>
      <button
        type="button"
        className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-sm text-caption text-fg-secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          });
        }}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}

function ReceiptPicker({ receipt, onPick, onRemove }: { receipt: PublicIntakeFile | null; onPick: (f: File) => Promise<void>; onRemove: () => Promise<void> }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex flex-col gap-1.5" data-testid="cpi-receipt">
      <span className="text-body-strong text-fg">Proof of payment (optional)</span>
      {receipt ? (
        <span className="flex items-center gap-2 text-small text-fg">
          {receipt.name} <span className="cp-mono text-caption text-fg-tertiary">{fmtSize(receipt.size)}</span>
          <button type="button" className="focus-ring rounded-sm text-caption underline" onClick={() => void onRemove()}>
            Remove
          </button>
        </span>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            data-testid="cpi-receipt-input"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              await onPick(f);
              setBusy(false);
              if (input.current) input.current.value = '';
            }}
          />
          <Button size="sm" variant="ghost" loading={busy} onClick={() => input.current?.click()} className="w-fit">
            Attach a receipt (PDF, PNG or JPG)
          </Button>
        </>
      )}
    </div>
  );
}
