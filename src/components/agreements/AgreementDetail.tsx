'use client';

/** Platform Console › Agreements › one document: preview, tracking, timeline, link rules, countersign, payments. */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, Ban, Copy, Download, Eye, FilePlus2, FileSignature, Mail, Pencil, Receipt, Send, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Field,
  InlineError,
  Input,
  SegmentedControl,
  Skeleton,
  Switch,
  useToast,
} from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import {
  PAYMENT_LABEL,
  PAYMENT_TONE,
  balanceOf,
  describeDevice,
  fmtManila,
  fmtMoney,
  paidSoFar,
  paymentStatus,
  fmtDuration,
  pageRanges,
  type AgreementEvent,
  type CopyStatus,
  type EnvelopeView,
  type ViewRow,
} from '@/lib/agreements/envelope';
import type { WelcomeStatus } from '@/lib/agreements/welcome';
import { PdfViewer } from '@/components/agreements/PdfViewer';
import { SignaturePad, type SignatureValue } from '@/components/agreements/SignaturePad';
import { OwnerGate, StatusChip, copyText, fetchPdf, fromLocalInput, toLocalInput, trackingSummary, type TemplateSummary } from '@/components/agreements/ownerShared';

interface Detail {
  envelope: EnvelopeView;
  events: AgreementEvent[];
  template: TemplateSummary | null;
  files: { original: boolean; final: boolean; certificate: boolean; paid?: boolean };
  views: ViewRow[];
  needsCompletion: boolean;
  /** Copy recipients, with their own (separate) views. */
  copies?: CopyStatus[];
  copiesAvailable?: boolean;
  /** Contracts: the welcome email's state. */
  welcome?: WelcomeStatus;
}

const EVENT_TEXT: Record<string, string> = {
  created: 'Draft created',
  updated: 'Draft changed',
  sent: 'Sent to the client',
  resent: 'Sent again',
  email_failed: 'Email not sent',
  opened: 'Opened',
  otp_sent: 'Code emailed',
  otp_verified: 'Code verified',
  otp_failed: 'Wrong code entered',
  signed: 'Signed by the client',
  acknowledged: 'Confirmed by the client',
  concern: 'Client raised a concern',
  declined: 'Declined',
  countersigned: 'Countersigned',
  completed: 'Completed, final PDF sealed',
  final_emailed: 'Final copy emailed',
  access_changed: 'Link rules changed',
  revoked: 'Link revoked',
  expired: 'Link expired',
  downloaded: 'Final PDF downloaded',
  payment_recorded: 'Payment recorded',
  payment_emailed: 'Payment receipt emailed',
  completion_retried: 'Completion retried',
  pay_link_clicked: 'Client clicked Pay now (Wise)',
  cc_sent: 'View-only copy emailed to',
  cc_email_failed: 'Copy email not sent to',
  cc_viewed: 'Viewed by copy recipient',
  cc_removed: 'Copy recipient removed:',
  cc_final_emailed: 'Final copy emailed to copy recipient',
  cc_downloaded: 'Final PDF downloaded by copy recipient',
  cc_pay_link_clicked: 'Copy recipient clicked a payment link:',
  welcome_sent: 'Welcome email sent',
  welcome_failed: 'Welcome email not sent',
  welcome_no_checklist: 'Welcome email sent without a checklist link: create or share the client’s onboarding board.',
};

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Timeline text for one event; copy events name the copy recipient (never the signer's counters). */
function eventText(ev: AgreementEvent, copies: CopyStatus[]): string {
  if (ev.type === 'pay_link_clicked' && ev.data?.provider === 'paypal') return 'Client clicked Pay with PayPal';
  if (ev.type === 'welcome_sent') return `Welcome email sent to ${people(Number(ev.data?.count) || 0)}${ev.data?.trigger === 'manual' ? ' (sent by hand)' : ''}`;
  const base = EVENT_TEXT[ev.type] ?? ev.type;
  if (!ev.type.startsWith('cc_')) return base;
  const c = copies.find((x) => x.id === ev.data?.ccId);
  const who = c ? (c.name ? `${c.name} <${c.email}>` : c.email) : typeof ev.data?.to === 'string' ? ev.data.to : 'a copy recipient';
  return `${base} ${who}`;
}

const COPY_STATE: Record<CopyStatus['state'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }> = {
  not_sent: { label: 'Not sent yet', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'brand' },
  failed: { label: 'Email failed', tone: 'danger' },
  removed: { label: 'Removed', tone: 'neutral' },
};

export function AgreementDetail({ id }: { id: string }) {
  return (
    <OwnerGate>
      <DetailInner id={id} />
    </OwnerGate>
  );
}

function DetailInner({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const [d, setD] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [which, setWhich] = React.useState<'original' | 'final' | 'certificate'>('original');
  const [pdf, setPdf] = React.useState<ArrayBuffer | null>(null);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const [counterOpen, setCounterOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [removeCc, setRemoveCc] = React.useState<CopyStatus | null>(null);
  const [ccBusy, setCcBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const r = await apiJson<Detail>(`/api/agreements/${id}`);
    if (!r.success) return setError(r.error || 'Could not load the document.');
    setError(null);
    setD(r);
  }, [id]);

  React.useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10_000);
    return () => window.clearInterval(t);
  }, [load]);

  const e = d?.envelope;
  const status = e?.status;
  React.useEffect(() => {
    if (status === 'completed') setWhich((w) => (w === 'original' ? 'final' : w));
  }, [status]);

  // Preview: the frozen file, or a live render for drafts.
  const previewKey = e ? `${which}:${e.status === 'draft' ? JSON.stringify(e.fieldValues) : e.originalSha256}:${e.finalSha256}` : '';
  React.useEffect(() => {
    if (!e) return;
    let alive = true;
    (async () => {
      setPdf(null);
      setPdfError(null);
      const r =
        e.status === 'draft'
          ? await fetchPdf('/api/agreements/preview', { body: { templateId: e.templateId, values: e.fieldValues } })
          : await fetchPdf(`/api/agreements/${e.id}/file/${which}`);
      if (!alive) return;
      if (r instanceof ArrayBuffer) setPdf(r);
      else setPdfError(r.error);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the file identity changes
  }, [previewKey]);

  if (error && !d) return <div className="px-4 py-6 md:px-8"><InlineError message={error} onRetry={load} /></div>;
  if (!d || !e) {
    return (
      <div className="flex flex-col gap-3 px-4 py-6 md:px-8">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const unsigned = ['sent', 'opened', 'expired'].includes(e.status);
  const isView = e.templateMeta?.action === 'view';
  const pay = e.billing ? paymentStatus(e.billing) : null;
  const copies = d.copies ?? [];
  const liveCopies = copies.filter((c) => c.state !== 'removed');

  const copyLink = async () => {
    const r = await apiJson<{ url: string }>(`/api/agreements/${e.id}/link`, { method: 'POST' });
    if (!r.success) return toast({ message: r.error || 'Could not get the link.' });
    toast({ message: (await copyText(r.url)) ? 'Link copied' : `Copy this link: ${r.url}` });
  };
  const resend = async () => {
    const r = await apiJson<{ email: { ok: boolean; error?: string } }>(`/api/agreements/${e.id}/resend`, { method: 'POST' });
    if (!r.success) return toast({ message: r.error || 'Could not send it again.' });
    toast({ message: r.email.ok ? `Sent again to ${e.recipient.email}${liveCopies.length ? `, and the view-only email to ${liveCopies.length} ${liveCopies.length === 1 ? 'copy' : 'copies'}` : ''}` : r.email.error || 'The email was not sent. Copy the link instead.' });
    void load();
  };
  const resendToCopies = async () => {
    setCcBusy(true);
    const r = await apiJson<{ copies: { sent: number; failed: number; error?: string } }>(`/api/agreements/${e.id}/resend-copies`, { method: 'POST' });
    setCcBusy(false);
    if (!r.success) return toast({ message: r.error || 'Could not send to the copies.' });
    toast({ message: r.copies.failed ? `Sent to ${r.copies.sent}, not sent to ${r.copies.failed}. ${r.copies.error ?? ''}` : `View-only email sent again to ${r.copies.sent} ${r.copies.sent === 1 ? 'copy' : 'copies'}` });
    void load();
  };
  const doRemoveCopy = async (c: CopyStatus) => {
    const r = await apiJson(`/api/agreements/${e.id}/remove-copy`, { method: 'POST', body: { ccId: c.id } });
    toast({ message: r.success ? `${c.email} removed. Their view-only link no longer works.` : r.error || 'Could not remove the copy.' });
    void load();
  };
  const send = async () => {
    const r = await apiJson<{ url: string; email: { ok: boolean; error?: string } }>(`/api/agreements/${e.id}/send`, { method: 'POST' });
    if (!r.success) return toast({ message: r.error || 'Could not send.' });
    toast({ message: r.email.ok ? `Sent to ${e.recipient.email}` : r.email.error || 'Sent, but the email failed. Copy the link.' });
    void load();
  };
  const revoke = async () => {
    const r = await apiJson(`/api/agreements/${e.id}/revoke`, { method: 'POST' });
    toast({ message: r.success ? 'Link revoked' : r.error || 'Could not revoke.' });
    void load();
  };
  const retryComplete = async () => {
    setRetrying(true);
    const r = await apiJson(`/api/agreements/${e.id}/complete`, { method: 'POST' });
    setRetrying(false);
    toast({ message: r.success ? 'Completed. The final PDF is sealed and sent to both parties.' : r.error || 'Could not complete. Try again.' });
    void load();
  };
  const remove = async () => {
    const r = await apiJson(`/api/agreements/${e.id}`, { method: 'DELETE' });
    if (!r.success) return toast({ message: r.error || 'Could not delete.' });
    toast({ message: 'Draft deleted' });
    router.push('/platform/agreements');
  };

  const isProposal = e.templateMeta?.action === 'sign' && /proposal/i.test(e.templateId);

  return (
    <div className="px-4 py-6 md:px-8">
      <Link href="/platform/agreements" className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-sm text-small text-fg-secondary hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> All agreements
      </Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 text-fg">{e.title}</h1>
            <StatusChip status={e.status} concern={e.signer?.outcome === 'concern'} />
            {pay && <Badge tone={PAYMENT_TONE[pay]}>{PAYMENT_LABEL[pay]}</Badge>}
          </div>
          <p className="mt-1 text-body text-fg-secondary" data-testid="tracking-summary">
            {trackingSummary(e)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {e.status === 'draft' && (
            <>
              <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleteOpen(true)}>
                Delete draft
              </Button>
              <Link href={`/platform/agreements/new?draft=${e.id}`} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-body font-medium text-fg hover:bg-subtle">
                <Pencil className="size-4" aria-hidden /> Edit draft
              </Link>
              <Button variant="brand" icon={<Send />} onClick={send}>
                Send
              </Button>
            </>
          )}
          {e.hasLink && (
            <Button variant="secondary" icon={<Copy />} onClick={copyLink}>
              Copy link
            </Button>
          )}
          {(e.status === 'sent' || e.status === 'opened') && (
            <Button variant="secondary" icon={<Send />} onClick={resend}>
              Send again
            </Button>
          )}
          {['sent', 'opened', 'expired', 'signed'].includes(e.status) && (
            <Button variant="danger" icon={<Ban />} onClick={() => setRevokeOpen(true)}>
              Revoke
            </Button>
          )}
          {e.status === 'signed' && e.templateMeta?.countersign && !e.ownerSignature && (
            <Button variant="brand" icon={<FileSignature />} onClick={() => setCounterOpen(true)}>
              Countersign
            </Button>
          )}
          {d.needsCompletion && (
            <Button variant="brand" icon={<RotateCcw />} onClick={retryComplete} loading={retrying} data-testid="retry-completion">
              Retry completion
            </Button>
          )}
          {isView && e.billing && pay !== 'paid' && e.status !== 'draft' && e.status !== 'revoked' && (
            <Button variant="brand" icon={<Receipt />} onClick={() => setPayOpen(true)}>
              Mark as paid
            </Button>
          )}
          {isProposal && e.status === 'completed' && (
            <Link href={`/platform/agreements/new?from=${e.id}`} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-body font-medium text-fg hover:bg-subtle">
              <FilePlus2 className="size-4" aria-hidden /> Create billing statement
            </Link>
          )}
        </div>
      </header>

      {d.needsCompletion && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border-danger-fg/40 p-4" role="alert">
          <p className="text-body text-fg">
            <span className="font-medium">All signatures are recorded, but the final PDF was not sealed.</span> Retry completion: no one signs again.
          </p>
          <Button variant="primary" onClick={retryComplete} loading={retrying}>
            Retry completion
          </Button>
        </Card>
      )}

      {e.status === 'signed' && e.templateMeta?.countersign && !e.ownerSignature && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border-warning-400/50 p-4">
          <p className="text-body text-fg">
            <span className="font-medium">Client signed, countersign now.</span> {e.signer?.name} signed on {fmtManila(e.signedAt)}.
          </p>
          <Button variant="primary" onClick={() => setCounterOpen(true)}>
            Countersign
          </Button>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {e.status === 'completed' ? (
              <SegmentedControl
                label="Which file"
                value={which}
                onChange={(v) => setWhich(v as typeof which)}
                items={[
                  { value: 'final', label: isView ? 'Paid copy' : 'Final signed' },
                  { value: 'original', label: 'Original' },
                  ...(isView ? [] : [{ value: 'certificate', label: 'Certificate' }]),
                ]}
              />
            ) : (
              <p className="text-small text-fg-secondary">{e.status === 'draft' ? 'Preview (not sent yet)' : 'The document as sent'}</p>
            )}
          </div>
          <div className="rounded-lg border border-line bg-subtle p-3 md:p-5">
            {pdfError ? <InlineError message={pdfError} /> : <PdfViewer data={pdf} label={e.title} />}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          {e.billing && <BillingCard e={e} />}
          <Card>
            <CardHeader title="Recipient" />
            <CardBody className="flex flex-col gap-1 text-body">
              <p className="text-fg">{e.recipient.name || '-'}</p>
              <p className="text-fg-secondary">{e.recipient.title}</p>
              <p className="text-fg-secondary">{e.recipient.email}</p>
            </CardBody>
          </Card>

          {copies.length > 0 && (
            <Card data-testid="copies-card">
              <CardHeader title={`Copy recipients (${liveCopies.length})`} description="View only. Their views are listed here, not counted as the client’s." />
              <CardBody className="flex flex-col gap-3">
                <ul className="flex flex-col divide-y divide-line">
                  {copies.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0" data-testid="copy-row" data-state={c.state}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {c.name && <p className={c.state === 'removed' ? 'text-body text-fg-tertiary line-through' : 'text-body text-fg'}>{c.name}</p>}
                          <p className={c.state === 'removed' ? 'break-all text-small text-fg-tertiary line-through' : 'break-all text-small text-fg-secondary'}>{c.email}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge tone={COPY_STATE[c.state].tone}>{COPY_STATE[c.state].label}</Badge>
                          {c.state !== 'removed' && e.status !== 'draft' && (
                            <Button variant="ghost" size="sm" icon={<X />} aria-label={`Remove ${c.email}`} onClick={() => setRemoveCc(c)} data-testid="copy-remove" />
                          )}
                        </div>
                      </div>
                      <p className="text-small text-fg-tertiary">
                        {c.lastSentAt ? `Emailed ${fmtManila(c.lastSentAt)}` : c.state === 'not_sent' ? 'Emailed when you send the document' : ''}
                        {c.finalSentAt ? ` · final copy emailed ${fmtManila(c.finalSentAt)}` : ''}
                      </p>
                      {c.lastError && c.state === 'failed' && <p className="text-small text-danger-fg">{c.lastError}</p>}
                      <p className="inline-flex items-center gap-1 text-small text-fg-secondary" data-testid="copy-views">
                        <Eye className="size-3.5" aria-hidden />
                        {c.views.length ? `Viewed ${c.views.length} ${c.views.length === 1 ? 'time' : 'times'}, last ${fmtManila(c.views[c.views.length - 1].at)} · ${c.views[c.views.length - 1].device}` : 'Not viewed yet'}
                      </p>
                    </li>
                  ))}
                </ul>
                {(e.status === 'sent' || e.status === 'opened') && liveCopies.some((c) => c.hasLink) && (
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" icon={<Send />} onClick={resendToCopies} loading={ccBusy} data-testid="resend-copies">
                      Resend to copies
                    </Button>
                  </div>
                )}
                {e.access.requireOtpToView && <p className="text-caption text-fg-tertiary">The email code is for the client. Copies open their view-only link without a code.</p>}
              </CardBody>
            </Card>
          )}
          {d.copiesAvailable === false && e.status === 'draft' && (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="cc-unavailable">
              Copy recipients are not available on this server.
            </p>
          )}

          {e.signer && (
            <Card>
              <CardHeader title={e.templateMeta?.action === 'sign' ? 'Client signature' : 'Client response'} />
              <CardBody className="flex flex-col gap-2 text-body">
                <p>
                  {e.signer.name}, {e.signer.title}
                </p>
                <p className="text-small text-fg-secondary">
                  {fmtManila(e.signer.signedAt, true)} · {e.signer.ip} · {describeDevice(e.signer.userAgent)}
                </p>
                {e.signer.outcome === 'concern' && <p className="rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg">Concern: {e.signer.concern}</p>}
                {(e.templateMeta?.signerForm ?? []).map((f) => {
                  const v = e.signerFormValues?.[f.key];
                  const text = v === true ? 'Yes' : v === false ? 'No' : Array.isArray(v) ? (v as unknown[]).map((x) => (Array.isArray(x) ? x.join(' / ') : String(x))).join(', ') || '-' : String(v ?? '-');
                  return (
                    <p key={f.key} className="text-small">
                      <span className="text-fg-secondary">{f.label}:</span> <span className="text-fg">{text}</span>
                    </p>
                  );
                })}
              </CardBody>
            </Card>
          )}

          {e.declineReason && (
            <Card>
              <CardHeader title="Declined" />
              <CardBody className="text-body text-fg">{e.declineReason}</CardBody>
            </Card>
          )}

          {d.welcome?.applies && <WelcomeCard e={e} w={d.welcome} copies={liveCopies.length} onDone={load} />}

          {(unsigned || e.status === 'draft') && <AccessCard e={e} onSaved={load} />}

          {e.status !== 'draft' && (
            <Card>
              <CardHeader title="Downloads" />
              <CardBody className="flex flex-wrap gap-2">
                {d.files.original && <DownloadLink href={`/api/agreements/${e.id}/file/original`} label="Original" />}
                {d.files.final && <DownloadLink href={`/api/agreements/${e.id}/file/final`} label={isView ? 'Paid copy' : 'Final signed'} />}
                {d.files.certificate && <DownloadLink href={`/api/agreements/${e.id}/file/certificate`} label="Certificate" />}
              </CardBody>
            </Card>
          )}

          {d.views.length > 0 && (
            <Card>
              <CardHeader title={`Opened ${d.views.length} ${d.views.length === 1 ? 'time' : 'times'}`} description="Each real view. Times in Asia/Manila." />
              <CardBody>
                <ol className="flex flex-col divide-y divide-line" data-testid="views">
                  {[...d.views].reverse().map((v, i) => (
                    <li key={v.at + i} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0" data-testid="view-row">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-body text-fg">{fmtManila(v.at)}</span>
                        <span className="tabular-nums text-small text-fg-secondary">{v.seconds ? fmtDuration(v.seconds) : 'under 10 s'}</span>
                      </div>
                      <span className="text-small text-fg-secondary">
                        {v.device}
                        {v.pages.length ? ` · ${v.pages.length === 1 ? 'page' : 'pages'} ${pageRanges(v.pages)}` : ' · page 1'}
                      </span>
                      {v.flags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {v.flags.map((f) => (
                            <Badge key={f} tone="warning">{f}</Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Timeline" description="Times in Asia/Manila" />
            <CardBody>
              <ol className="flex flex-col gap-3" data-testid="timeline">
                {[...d.events].reverse().map((ev) => (
                  <li key={ev.id} className="flex flex-col">
                    <span className="text-body text-fg">{eventText(ev, copies)}</span>
                    <span className="text-small text-fg-tertiary">
                      {fmtManila(ev.at, true)}
                      {ev.ip ? ` · ${ev.ip}` : ''}
                      {ev.userAgent ? ` · ${describeDevice(ev.userAgent)}` : ''}
                    </span>
                    {(ev.type === 'email_failed' || ev.type === 'cc_email_failed') && typeof ev.data.error === 'string' && <span className="text-small text-danger-fg">{ev.data.error}</span>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>

      <CountersignDialog open={counterOpen} onClose={() => setCounterOpen(false)} id={e.id} onDone={() => { setCounterOpen(false); void load(); }} />
      {e.billing && <PayDialog open={payOpen} onClose={() => setPayOpen(false)} e={e} onDone={() => { setPayOpen(false); void load(); }} />}
      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title="Revoke this link?"
        description={`The link stops working for ${e.recipient.name}. They will see a polite “expired” page. This can’t be undone.`}
        confirmLabel="Revoke link"
        onConfirm={() => {
          setRevokeOpen(false);
          void revoke();
        }}
      />
      <ConfirmDialog
        open={!!removeCc}
        onClose={() => setRemoveCc(null)}
        title="Remove this copy recipient?"
        description={removeCc ? `${removeCc.email} stops receiving emails about this document, and their view-only link stops working at once. ${e.recipient.name}’s link is not affected.` : ''}
        confirmLabel="Remove copy"
        onConfirm={() => {
          const c = removeCc;
          setRemoveCc(null);
          if (c) void doRemoveCopy(c);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this draft?"
        description="The draft and its values are removed. This can’t be undone."
        confirmLabel="Delete draft"
        onConfirm={() => {
          setDeleteOpen(false);
          void remove();
        }}
      />
    </div>
  );
}

/** Contracts: "Welcome email: sent … to N people" / "will send when fully signed", and "Send welcome email now". */
function WelcomeCard({ e, w, copies, onDone }: { e: EnvelopeView; w: WelcomeStatus; copies: number; onDone: () => void }) {
  const toast = useToast();
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const line =
    w.state === 'sent'
      ? `Sent ${fmtManila(w.sentAt)} to ${people(w.recipients)}.${w.failed ? ` Not sent to ${people(w.failed)}.` : ''}`
      : w.state === 'pending'
        ? `Will send when fully signed${e.templateMeta?.countersign ? ' (after your countersignature)' : ''}, to the signer${copies ? ` and ${copies} ${copies === 1 ? 'copy recipient' : 'copy recipients'}` : ''}.`
        : w.state === 'sending'
          ? w.canSendNow
            ? 'Sending was interrupted. Check your Sent folder before sending it again.'
            : 'Sending…'
          : w.state === 'failed'
            ? 'Not sent: the email could not be delivered.'
            : w.state === 'not_sent'
              ? 'Not sent for this document.'
              : 'Off for this document.';
  const sendNow = async () => {
    setBusy(true);
    const r = await apiJson<{ welcome: { sent: number; failed: number; checklist: boolean; error?: string } }>(`/api/agreements/${e.id}/welcome`, { method: 'POST' });
    setBusy(false);
    if (!r.success) toast({ message: r.error || 'Could not send the welcome email.' });
    else toast({ message: r.welcome.sent ? `Welcome email sent to ${people(r.welcome.sent)}${r.welcome.checklist ? '' : ', without a checklist link'}.` : r.welcome.error || 'The welcome email was not sent.' });
    onDone();
  };
  return (
    <Card data-testid="welcome-card" data-state={w.state}>
      <CardHeader title="Welcome email" description="The kickoff email with next steps, sent once when the agreement is fully signed." />
      <CardBody className="flex flex-col gap-3">
        <p className="text-body text-fg" data-testid="welcome-line">
          {line}
        </p>
        {w.state === 'sent' && w.checklist === false && (
          <p className="rounded-md bg-warning-bg px-3 py-2 text-small text-warning-fg" data-testid="welcome-no-checklist">
            Sent without a checklist link: create or share the client’s onboarding board.
          </p>
        )}
        {w.error && w.state !== 'sent' && <p className="text-small text-danger-fg">{w.error}</p>}
        {w.canSendNow && (
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" icon={<Mail />} onClick={() => setConfirm(true)} loading={busy} data-testid="welcome-send-now">
              Send welcome email now
            </Button>
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send the welcome email now?"
        description={`It goes to ${e.recipient.name || e.recipient.email}${copies ? ` and ${copies} ${copies === 1 ? 'copy recipient' : 'copy recipients'}` : ''}, once. It is never sent twice.`}
        confirmLabel="Send welcome email"
        onConfirm={() => {
          setConfirm(false);
          void sendNow();
        }}
      />
    </Card>
  );
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-small font-medium text-fg hover:bg-subtle">
      <Download className="size-4" aria-hidden /> {label}
    </a>
  );
}

function BillingCard({ e }: { e: EnvelopeView }) {
  const b = e.billing!;
  return (
    <Card>
      <CardHeader title={`Billing statement ${b.number}`} description={b.dueDate ? `Due ${b.dueDate}` : undefined} />
      <CardBody className="flex flex-col gap-2 text-body">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-caption text-fg-tertiary">Total</p>
            <p className="tabular-nums text-fg">{fmtMoney(b.total, b.currency)}</p>
          </div>
          <div>
            <p className="text-caption text-fg-tertiary">Paid</p>
            <p className="tabular-nums text-fg">{fmtMoney(paidSoFar(b), b.currency)}</p>
          </div>
          <div>
            <p className="text-caption text-fg-tertiary">Balance</p>
            <p className="tabular-nums font-medium text-fg" data-testid="balance">{fmtMoney(balanceOf(b), b.currency)}</p>
          </div>
        </div>
        {b.payments.length > 0 && (
          <ul className="flex flex-col gap-1 border-t border-line pt-2">
            {b.payments.map((p, i) => (
              <li key={i} className="text-small text-fg-secondary">
                {p.date} · {fmtMoney(p.amount, b.currency)} · Wise ref {p.reference}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function AccessCard({ e, onSaved }: { e: EnvelopeView; onSaved: () => void }) {
  const toast = useToast();
  const [expiresAt, setExpiresAt] = React.useState(toLocalInput(e.access.expiresAt));
  const [maxOpens, setMaxOpens] = React.useState(e.access.maxOpens ? String(e.access.maxOpens) : '');
  const [openFrom, setOpenFrom] = React.useState(toLocalInput(e.access.openFrom));
  const [openUntil, setOpenUntil] = React.useState(toLocalInput(e.access.openUntil));
  const [otpView, setOtpView] = React.useState(e.access.requireOtpToView);
  const [downloadDays, setDownloadDays] = React.useState(String(e.access.downloadDays));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await apiJson(`/api/agreements/${e.id}`, {
      method: 'PATCH',
      body: {
        access: {
          expiresAt: fromLocalInput(expiresAt),
          maxOpens: maxOpens ? Number(maxOpens) : null,
          openFrom: fromLocalInput(openFrom),
          openUntil: fromLocalInput(openUntil),
          requireOtpToView: otpView,
          downloadDays: Number(downloadDays) || 30,
        },
      },
    });
    setBusy(false);
    if (!r.success) return setErr(r.error || 'Could not save.');
    toast({ message: 'Link rules saved' });
    onSaved();
  };
  return (
    <Card>
      <CardHeader title="Link rules" description="Change them any time before the client signs." />
      <CardBody className="flex flex-col gap-3">
        <Field label="Link expires" htmlFor="acc-exp">
          <Input id="acc-exp" type="datetime-local" value={expiresAt} onChange={(ev) => setExpiresAt(ev.target.value)} />
        </Field>
        <Field label="Maximum opens" htmlFor="acc-max" hint="Leave empty for no limit.">
          <Input id="acc-max" type="number" min={1} max={1000} value={maxOpens} onChange={(ev) => setMaxOpens(ev.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Field label="Open from (optional)" htmlFor="acc-from">
            <Input id="acc-from" type="datetime-local" value={openFrom} onChange={(ev) => setOpenFrom(ev.target.value)} />
          </Field>
          <Field label="Open until (optional)" htmlFor="acc-until">
            <Input id="acc-until" type="datetime-local" value={openUntil} onChange={(ev) => setOpenUntil(ev.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-body text-fg">Ask for an email code to open</span>
          <Switch checked={otpView} onCheckedChange={setOtpView} label="Ask for an email code to open" />
        </div>
        <Field label="Download link works for (days after completion)" htmlFor="acc-dl">
          <Input id="acc-dl" type="number" min={1} max={365} value={downloadDays} onChange={(ev) => setDownloadDays(ev.target.value)} />
        </Field>
        {err && <p role="alert" className="text-small text-danger-fg">{err}</p>}
        <div className="flex justify-end">
          <Button variant="primary" onClick={save} loading={busy}>
            Save link rules
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function CountersignDialog({ open, onClose, id, onDone }: { open: boolean; onClose: () => void; id: string; onDone: () => void }) {
  const toast = useToast();
  const [saved, setSaved] = React.useState<string | null>(null);
  const [useSaved, setUseSaved] = React.useState(false);
  const [sig, setSig] = React.useState<SignatureValue | null>(null);
  const [saveIt, setSaveIt] = React.useState(true);
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const r = await apiJson<{ savedSignature: string | null }>('/api/agreements/settings');
      if (!alive || !r.success) return;
      setSaved(r.savedSignature);
      setUseSaved(Boolean(r.savedSignature));
      setPassword('');
      setErr(null);
    })();
    return () => {
      alive = false;
    };
  }, [open]);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const r = await apiJson(`/api/agreements/${id}/countersign`, {
      method: 'POST',
      body: useSaved ? { password, useSaved: true } : { password, signature: sig?.png, saveSignature: saveIt },
    });
    setBusy(false);
    if (!r.success) return setErr(r.error || 'Could not countersign.');
    toast({ message: 'Countersigned. The final PDF is sealed and sent to both of you.' });
    onDone();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Countersign"
      description="Your signature is added to the Execution page, then the final PDF is sealed and emailed to both parties."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="brand" onClick={submit} loading={busy} disabled={!password || (!useSaved && !sig)} data-testid="countersign-submit">
            Countersign and complete
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {saved && (
          <div className="flex flex-col gap-2">
            <Checkbox label="Use my saved signature" checked={useSaved} onChange={(ev) => setUseSaved(ev.target.checked)} />
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL of the owner's own signature */}
            {useSaved && <img src={saved} alt="Your saved signature" className="h-16 w-fit rounded-md border border-line bg-white px-2" />}
          </div>
        )}
        {!useSaved && (
          <>
            <SignaturePad onChange={setSig} label="Your signature" />
            <Checkbox label="Save this signature for next time" checked={saveIt} onChange={(ev) => setSaveIt(ev.target.checked)} />
          </>
        )}
        <Field label="Confirm with your password" htmlFor="cs-password" hint="A quick check that it is really you.">
          <Input id="cs-password" type="password" autoComplete="current-password" value={password} onChange={(ev) => setPassword(ev.target.value)} />
        </Field>
        {err && <p role="alert" className="text-small text-danger-fg">{err}</p>}
      </div>
    </Dialog>
  );
}

function PayDialog({ open, onClose, e, onDone }: { open: boolean; onClose: () => void; e: EnvelopeView; onDone: () => void }) {
  const toast = useToast();
  const b = e.billing!;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [date, setDate] = React.useState(today);
  const [reference, setReference] = React.useState('');
  const [amount, setAmount] = React.useState(String(balanceOf(b)));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const r = await apiJson<{ email: { ok: boolean; error?: string } }>(`/api/agreements/${e.id}/pay`, { method: 'POST', body: { date, reference, amount: Number(amount) } });
    setBusy(false);
    if (!r.success) return setErr(r.error || 'Could not record the payment.');
    toast({ message: r.email?.ok ? 'Payment recorded. The client got a “Payment received” email.' : `Payment recorded. ${r.email?.error || ''}` });
    onDone();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Mark ${b.number} as paid`}
      description={`Balance ${fmtMoney(balanceOf(b), b.currency)}. Part payments are fine: the balance is shown on the statement.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={submit} loading={busy} disabled={!reference.trim() || !(Number(amount) > 0) || !date} data-testid="pay-submit">
            Record payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Date received" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={date} max={today} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        <Field label="Wise reference" htmlFor="pay-ref">
          <Input id="pay-ref" value={reference} onChange={(ev) => setReference(ev.target.value)} maxLength={120} mono />
        </Field>
        <Field label={`Amount received (${b.currency})`} htmlFor="pay-amount">
          <Input id="pay-amount" type="number" min={0.01} step="0.01" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
        </Field>
        {err && <p role="alert" className="text-small text-danger-fg">{err}</p>}
      </div>
    </Dialog>
  );
}
