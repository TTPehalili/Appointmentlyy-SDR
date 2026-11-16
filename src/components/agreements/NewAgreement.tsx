'use client';

/** Platform Console › Agreements › New: template → details → preview → recipient and link rules → send. */
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Copy, FileText, Send } from 'lucide-react';
import { Button, Card, Field, InlineError, Input, Select, Skeleton, Stepper, Switch, Textarea, useToast } from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import { cn } from '@/lib/cn';
import type { TemplateField } from '@/lib/agreements/templates/types';
import type { EnvelopeView } from '@/lib/agreements/envelope';
import { PdfViewer } from '@/components/agreements/PdfViewer';
import { PaymentLinkInput, PaymentQrInput } from '@/components/agreements/PaymentInputs';
import { OwnerGate, copyText, fetchPdf, fromLocalInput, toLocalInput, type ListResponse, type TemplateSummary } from '@/components/agreements/ownerShared';

const STEPS = ['Template', 'Details', 'Preview', 'Send'];

const find = (fields: TemplateField[], re: RegExp) => fields.find((f) => re.test(f.key) || re.test(f.label));
const isNumberField = (f: TemplateField) => /(statement|soa|invoice|billing).?(no|num|number)|^statementNo$/i.test(f.key) || /statement no/i.test(f.label);

/** Billing statements: today's date and the saved payment instructions fill empty fields. */
function withStatementDefaults(t: TemplateSummary, values: Record<string, string>, payment: string, extra?: { paymentLink?: string; paymentQr?: string }): Record<string, string> {
  if (t.action !== 'view') return values;
  const out = { ...values };
  const sd = find(t.fields, /statement.?date/i);
  if (sd && !out[sd.key]) out[sd.key] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const pf = find(t.fields, /payment.?(instructions|details)|wise/i);
  if (pf && !out[pf.key] && payment) out[pf.key] = payment;
  if (extra?.paymentLink && t.fields.some((f) => f.key === 'paymentLink') && !out.paymentLink) out.paymentLink = extra.paymentLink;
  if (extra?.paymentQr && t.fields.some((f) => f.key === 'paymentQr') && !out.paymentQr) out.paymentQr = extra.paymentQr;
  return out;
}

/** Pre-fill a billing statement from a completed proposal: client, address, reference, and the amount picked. */
function billingPrefill(t: TemplateSummary, src: EnvelopeView, line: string): Record<string, string> {
  const v = src.fieldValues;
  const out: Record<string, string> = {};
  const set = (re: RegExp, value: string) => {
    const f = find(t.fields, re);
    if (f && value) out[f.key] = value;
  };
  set(/bill.?to.?name|client.?legal|client.?name|bill to/i, v.clientLegal || v.clientName || '');
  set(/bill.?to.?address|client.?address|address/i, [v.clientStreet, v.clientCity].filter(Boolean).join(', '));
  set(/reference|agreement/i, src.title);
  set(/client.?short/i, v.clientShort || '');
  set(/line.?items|items/i, line);
  return out;
}

function amountOptions(src: EnvelopeView): { label: string; line: string }[] {
  const n = (k: string) => Number(String(src.fieldValues[k] ?? '').replace(/[^0-9.]/g, '')) || 0;
  const build = n('buildFee');
  const monthly = n('monthlyFee');
  const opts: { label: string; line: string }[] = [];
  if (build) {
    opts.push({ label: `Build fee, first 50% at signing ($${(build / 2).toLocaleString()})`, line: `Growth custom build fee, first 50% (due at signing) | 1 | ${build / 2}` });
    opts.push({ label: `Build fee, second 50% at go-live ($${(build / 2).toLocaleString()})`, line: `Growth custom build fee, second 50% (due at go-live) | 1 | ${build / 2}` });
  }
  if (monthly) opts.push({ label: `Monthly fee ($${monthly.toLocaleString()})`, line: `Growth monthly fee (month to month, 30 days' notice) | 1 | ${monthly}` });
  return opts;
}

export function NewAgreement() {
  return (
    <OwnerGate>
      <React.Suspense fallback={<div className="px-4 py-6 md:px-8"><Skeleton className="h-64 w-full" /></div>}>
        <Wizard />
      </React.Suspense>
    </OwnerGate>
  );
}

function FieldInput({ f, value, onChange }: { f: TemplateField; value: string; onChange: (v: string) => void }) {
  const id = `tf-${f.key}`;
  const label = f.label + (f.required ? ' *' : '');
  if (f.key === 'paymentLink') return <PaymentLinkInput id={id} label={label} value={value} onChange={onChange} hint={f.help} />;
  if (f.key === 'paymentQr') return <PaymentQrInput label={f.label} value={value} onChange={onChange} />;
  const input =
    f.type === 'textarea' ? (
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={4} />
    ) : f.type === 'select' ? (
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    ) : (
      <Input
        id={id}
        type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'number' || f.type === 'money' ? 'text' : 'text'}
        inputMode={f.type === 'number' || f.type === 'money' ? 'decimal' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <Field label={label} htmlFor={id} hint={f.help} className={f.type === 'textarea' ? 'md:col-span-2' : undefined}>
      {input}
    </Field>
  );
}

function Wizard() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const draftId = params.get('draft');
  const fromId = params.get('from');
  const [list, setList] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState(0);
  const [templateId, setTemplateId] = React.useState('');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [recipient, setRecipient] = React.useState({ name: '', title: '', email: '' });
  const [expiresAt, setExpiresAt] = React.useState(toLocalInput(new Date(Date.now() + 3 * 86_400_000).toISOString()));
  const [maxOpens, setMaxOpens] = React.useState('');
  const [openFrom, setOpenFrom] = React.useState('');
  const [openUntil, setOpenUntil] = React.useState('');
  const [otpView, setOtpView] = React.useState(false);
  const [downloadDays, setDownloadDays] = React.useState('30');
  const [pdf, setPdf] = React.useState<ArrayBuffer | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'draft' | 'send' | null>(null);
  const [done, setDone] = React.useState<{ id: string; url?: string; email?: { ok: boolean; error?: string; outbox?: boolean }; sendError?: string } | null>(null);
  const [source, setSource] = React.useState<EnvelopeView | null>(null);
  const [draft, setDraft] = React.useState<EnvelopeView | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const r = await apiJson<ListResponse>('/api/agreements');
      if (!alive) return;
      if (!r.success) return setError(r.error || 'Could not load templates.');
      setList(r);
      if (draftId) {
        const dr = await apiJson<{ envelope: EnvelopeView }>(`/api/agreements/${draftId}`);
        if (dr.success && dr.envelope.status === 'draft') {
          const e = dr.envelope;
          setDraft(e);
          setTemplateId(e.templateId);
          setValues(e.fieldValues);
          setRecipient(e.recipient);
          setExpiresAt(toLocalInput(e.access.expiresAt));
          setMaxOpens(e.access.maxOpens ? String(e.access.maxOpens) : '');
          setOpenFrom(toLocalInput(e.access.openFrom));
          setOpenUntil(toLocalInput(e.access.openUntil));
          setOtpView(e.access.requireOtpToView);
          setDownloadDays(String(e.access.downloadDays));
          setStep(1);
        }
      } else if (fromId) {
        const sr = await apiJson<{ envelope: EnvelopeView }>(`/api/agreements/${fromId}`);
        const bt = r.templates.find((t) => t.action === 'view');
        if (sr.success && bt) {
          setSource(sr.envelope);
          setTemplateId(bt.id);
          const opts = amountOptions(sr.envelope);
          setValues(withStatementDefaults(bt, { ...defaultsOf(bt), ...billingPrefill(bt, sr.envelope, opts[0]?.line ?? '') }, r.settings.paymentInstructions, r.settings));
          setRecipient(sr.envelope.recipient);
          setStep(1);
        } else if (!bt) setError('The billing statement template is not installed yet.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [draftId, fromId]);

  const t = list?.templates.find((x) => x.id === templateId) ?? null;
  const defaultsOf = (tpl: TemplateSummary) => Object.fromEntries(tpl.fields.map((f) => [f.key, f.default ?? '']));

  const pick = (tpl: TemplateSummary) => {
    setTemplateId(tpl.id);
    setValues(withStatementDefaults(tpl, defaultsOf(tpl), list?.settings.paymentInstructions ?? '', list?.settings));
  };

  const groups = React.useMemo(() => {
    const m = new Map<string, TemplateField[]>();
    for (const f of t?.fields ?? []) {
      const g = f.group || 'Details';
      m.set(g, [...(m.get(g) ?? []), f]);
    }
    return [...m.entries()];
  }, [t]);

  // The statement number is assigned when a billing statement is sent.
  const missing = (t?.fields ?? []).filter((f) => f.required && !(values[f.key] ?? '').trim() && !(t?.action === 'view' && isNumberField(f)));

  React.useEffect(() => {
    if (step !== 2 || !t) return;
    let alive = true;
    (async () => {
      setPdf(null);
      setPdfError(null);
      const r = await fetchPdf('/api/agreements/preview', { body: { templateId: t.id, values } });
      if (!alive) return;
      if (r instanceof ArrayBuffer) setPdf(r);
      else setPdfError(r.error);
    })();
    return () => {
      alive = false;
    };
  }, [step, t, values]);

  const access = () => ({
    expiresAt: fromLocalInput(expiresAt),
    maxOpens: maxOpens ? Number(maxOpens) : null,
    openFrom: fromLocalInput(openFrom),
    openUntil: fromLocalInput(openUntil),
    requireOtpToView: otpView,
    downloadDays: Number(downloadDays) || 30,
  });

  const submit = async (send: boolean) => {
    if (!t) return;
    setBusy(send ? 'send' : 'draft');
    setError(null);
    type R = { envelope: EnvelopeView; url?: string; email?: { ok: boolean; error?: string; outbox?: boolean }; sendError?: string };
    let r: Awaited<ReturnType<typeof apiJson<R>>>;
    if (draft) {
      const u = await apiJson<R>(`/api/agreements/${draft.id}`, { method: 'PATCH', body: { values, recipient, access: access() } });
      if (!u.success || !send) r = u;
      else r = await apiJson<R>(`/api/agreements/${draft.id}/send`, { method: 'POST' });
    } else {
      r = await apiJson<R>('/api/agreements', { body: { templateId: t.id, values, recipient, access: access(), send, sourceEnvelopeId: source?.id ?? null } });
    }
    setBusy(null);
    if (!r.success) return setError(r.error || 'Could not save.');
    if (!send) {
      toast({ message: 'Draft saved' });
      router.push(`/platform/agreements/${r.envelope?.id ?? draft?.id}`);
      return;
    }
    setDone({ id: r.envelope?.id ?? draft!.id, url: r.url, email: r.email, sendError: r.sendError });
  };

  if (error && !list) return <div className="px-4 py-6 md:px-8"><InlineError message={error} /></div>;
  if (!list) {
    return (
      <div className="px-4 py-6 md:px-8">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10">
        <Card className="p-6">
          <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-success-bg text-success-fg">
            <Check className="size-5" aria-hidden />
          </div>
          {done.sendError ? (
            <>
              <h1 className="text-h2 text-fg">Saved as a draft</h1>
              <p className="mt-1 text-body text-danger-fg">{done.sendError}</p>
            </>
          ) : (
            <>
              <h1 className="text-h2 text-fg" data-testid="sent-title">Sent</h1>
              <p className="mt-1 text-body text-fg-secondary">
                {done.email?.ok
                  ? done.email.outbox
                    ? 'Test server: the email went to the local test outbox.'
                    : `We emailed the link to ${recipient.email}.`
                  : done.email?.error || 'The email was not sent.'}{' '}
                You can also copy the link and send it yourself.
              </p>
              {done.url && (
                <div className="mt-4 flex gap-2">
                  <Input readOnly value={done.url} aria-label="Signing link" mono data-testid="sent-link" />
                  <Button
                    variant="secondary"
                    icon={<Copy />}
                    onClick={async () => toast({ message: (await copyText(done.url!)) ? 'Link copied' : 'Select the link and copy it' })}
                  >
                    Copy link
                  </Button>
                </div>
              )}
            </>
          )}
          <div className="mt-6 flex justify-end">
            <Link href={`/platform/agreements/${done.id}`} className="focus-ring inline-flex h-9 items-center rounded-md bg-action px-3.5 text-body font-medium text-action-fg hover:bg-action-hover">
              Open the document
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const canNext = step === 0 ? !!t : step === 1 ? missing.length === 0 : true;
  const sendable = recipient.name.trim() && /\S+@\S+\.\S+/.test(recipient.email) && !!fromLocalInput(expiresAt);

  return (
    <div className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-6 md:px-8', step === 2 ? 'max-w-[1100px]' : 'max-w-[880px]')}>
      <div>
        <Link href="/platform/agreements" className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-sm text-small text-fg-secondary hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> All agreements
        </Link>
        <h1 className="text-h1 text-fg">{draft ? 'Edit draft' : source ? 'New billing statement' : 'New document'}</h1>
        {source && <p className="mt-1 text-body text-fg-secondary">From “{source.title}”.</p>}
      </div>
      <Stepper steps={STEPS} current={step} className="flex-wrap" />
      {error && <InlineError message={error} />}

      <div className="rounded-lg border border-line bg-surface p-4 shadow-xs md:p-6">
        {step === 0 && (
          <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Template">
            {list.templates.length === 0 && <p className="text-body text-fg-secondary">No templates are installed on this server yet.</p>}
            {list.templates.map((tpl) => {
              const selected = tpl.id === templateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-template={tpl.id}
                  onClick={() => pick(tpl)}
                  disabled={!!draft}
                  className={cn(
                    'focus-ring flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors',
                    selected ? 'border-selected bg-selected-soft text-selected-soft-fg ring-1 ring-selected' : 'border-line hover:bg-subtle',
                  )}
                >
                  <span className="flex items-center gap-2 text-body-strong">
                    <FileText className="size-4" aria-hidden /> {tpl.name}
                    {selected && <Check className="ml-auto size-4" aria-hidden />}
                  </span>
                  <span className={cn('text-small', selected ? 'opacity-90' : 'text-fg-secondary')}>{tpl.description}</span>
                  <span className={cn('text-caption', selected ? 'opacity-80' : 'text-fg-tertiary')}>
                    {tpl.action === 'sign' ? 'Client signs' : tpl.action === 'acknowledge' ? 'Client confirms' : 'Client views'}
                    {tpl.countersign ? ', then you countersign' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 1 && t && (
          <div className="flex flex-col gap-6">
            {source && (
              <Field label="What is this statement for?" htmlFor="bill-amount">
                <Select
                  id="bill-amount"
                  onChange={(e) => {
                    const line = e.target.value;
                    setValues((v) => ({ ...v, ...billingPrefill(t, source, line) }));
                  }}
                >
                  {amountOptions(source).map((o) => (
                    <option key={o.line} value={o.line}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {groups.map(([g, fields]) => (
              <section key={g} className="flex flex-col gap-3">
                <h2 className="text-h3 text-fg">{g}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {fields.map((f) => (
                    <FieldInput key={f.key} f={f} value={values[f.key] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [f.key]: v }))} />
                  ))}
                </div>
              </section>
            ))}
            {missing.length > 0 && <p className="text-small text-fg-tertiary">Still needed: {missing.map((f) => f.label).join(', ')}.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="rounded-md bg-subtle p-3 md:p-5">
            {pdfError ? <InlineError message={pdfError} /> : <PdfViewer data={pdf} label="Preview" />}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h2 className="text-h3 text-fg">Recipient</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Name *" htmlFor="rc-name">
                  <Input id="rc-name" value={recipient.name} onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))} />
                </Field>
                <Field label="Title" htmlFor="rc-title">
                  <Input id="rc-title" value={recipient.title} onChange={(e) => setRecipient((r) => ({ ...r, title: e.target.value }))} />
                </Field>
                <Field label="Email *" htmlFor="rc-email">
                  <Input id="rc-email" type="email" value={recipient.email} onChange={(e) => setRecipient((r) => ({ ...r, email: e.target.value }))} />
                </Field>
              </div>
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-h3 text-fg">Link rules</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Link expires *" htmlFor="ar-exp" hint="Default: 3 days.">
                  <Input id="ar-exp" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </Field>
                <Field label="Maximum opens" htmlFor="ar-max" hint="Leave empty for no limit.">
                  <Input id="ar-max" type="number" min={1} max={1000} value={maxOpens} onChange={(e) => setMaxOpens(e.target.value)} />
                </Field>
                <Field label="Open from (optional)" htmlFor="ar-from">
                  <Input id="ar-from" type="datetime-local" value={openFrom} onChange={(e) => setOpenFrom(e.target.value)} />
                </Field>
                <Field label="Open until (optional)" htmlFor="ar-until">
                  <Input id="ar-until" type="datetime-local" value={openUntil} onChange={(e) => setOpenUntil(e.target.value)} />
                </Field>
                <Field label="Download link works for (days after completion)" htmlFor="ar-dl">
                  <Input id="ar-dl" type="number" min={1} max={365} value={downloadDays} onChange={(e) => setDownloadDays(e.target.value)} />
                </Field>
                <div className="flex items-center justify-between gap-3 self-end rounded-md border border-line px-3 py-2">
                  <span className="text-body text-fg">Ask for an email code to open</span>
                  <Switch checked={otpView} onCheckedChange={setOtpView} label="Ask for an email code to open" />
                </div>
              </div>
              {list.mail.problem && <p className="rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg">{list.mail.problem}</p>}
            </section>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || (step === 1 && !!draft)}>
          Back
        </Button>
        <div className="flex gap-2">
          {step === 3 ? (
            <>
              <Button variant="secondary" onClick={() => submit(false)} loading={busy === 'draft'} disabled={!!busy}>
                Save draft
              </Button>
              <Button variant="brand" icon={<Send />} onClick={() => submit(true)} loading={busy === 'send'} disabled={!!busy || !sendable} data-testid="send-now">
                Send
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext} data-testid="wizard-next">
              {step === 2 ? 'Looks good' : 'Next'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
