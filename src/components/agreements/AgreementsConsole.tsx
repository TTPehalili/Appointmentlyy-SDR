'use client';

/** Platform Console › Agreements: every envelope, its status and tracking, with quick actions. */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, Copy, FilePlus2, FileSignature, Send, Settings2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterChip,
  IconButton,
  InlineError,
  Menu,
  PageHeader,
  StatTile,
  useToast,
  type Column,
} from '@/components/ui';
import { apiJson } from '@/lib/authClient';
import {
  PAYMENT_LABEL,
  PAYMENT_TONE,
  balanceOf,
  fmtDuration,
  fmtManila,
  fmtMoney,
  isStatementEnvelope,
  paymentStatus,
  type EnvelopeStatus,
  type EnvelopeView,
} from '@/lib/agreements/envelope';
import { OwnerGate, StatusChip, copyText, type ListResponse } from '@/components/agreements/ownerShared';
import { AgreementSettingsDialog } from '@/components/agreements/AgreementSettingsDialog';

// Billing statements only: a view-only custom proposal is not an invoice.
const isInvoice = (e: EnvelopeView) => isStatementEnvelope(e);
const FILTERS: { value: string; label: string; match: (s: EnvelopeStatus, e: EnvelopeView) => boolean }[] = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'invoices', label: 'Invoices', match: (_s, e) => isInvoice(e) },
  { value: 'waiting', label: 'Waiting for client', match: (s) => s === 'sent' || s === 'opened' },
  { value: 'signed', label: 'To countersign', match: (s) => s === 'signed' },
  { value: 'completed', label: 'Completed', match: (s) => s === 'completed' },
  { value: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { value: 'closed', label: 'Declined, expired, revoked', match: (s) => s === 'declined' || s === 'expired' || s === 'revoked' },
];

export function AgreementsConsole() {
  return (
    <OwnerGate>
      <Console />
    </OwnerGate>
  );
}

function Console() {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = React.useState<ListResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState('all');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<EnvelopeView | null>(null);

  const load = React.useCallback(async () => {
    const r = await apiJson<ListResponse>('/api/agreements');
    if (!r.success) return setError(r.error || 'Could not load agreements.');
    setError(null);
    setData(r);
  }, []);

  React.useEffect(() => {
    void load();
    // Live updates: opens, signatures and declines show up without a reload.
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const copyLink = async (e: EnvelopeView) => {
    const r = await apiJson<{ url: string }>(`/api/agreements/${e.id}/link`, { method: 'POST' });
    if (!r.success) return toast({ message: r.error || 'Could not get the link.' });
    toast({ message: (await copyText(r.url)) ? 'Link copied' : `Copy this link: ${r.url}` });
  };
  const resend = async (e: EnvelopeView) => {
    const r = await apiJson<{ email: { ok: boolean; error?: string } }>(`/api/agreements/${e.id}/resend`, { method: 'POST' });
    if (!r.success) return toast({ message: r.error || 'Could not send it again.' });
    toast({ message: r.email.ok ? `Sent again to ${e.recipient.email}` : r.email.error || 'The email was not sent. Copy the link instead.' });
    void load();
  };
  const revoke = async (e: EnvelopeView) => {
    const r = await apiJson(`/api/agreements/${e.id}/revoke`, { method: 'POST' });
    if (!r.success) return toast({ message: r.error || 'Could not revoke the link.' });
    toast({ message: 'Link revoked. It no longer works.' });
    void load();
  };

  const rows = (data?.envelopes ?? []).filter((e) => FILTERS.find((f) => f.value === filter)!.match(e.status, e));
  const templateName = (id: string) => data?.templates.find((t) => t.id === id)?.name ?? id;
  const toCountersign = (data?.envelopes ?? []).filter((e) => e.status === 'signed');
  const counts = (f: (typeof FILTERS)[number]) => (data?.envelopes ?? []).filter((e) => f.match(e.status, e)).length;

  const invoiceColumns: Column<EnvelopeView>[] = [
    { key: 'number', header: 'Statement', cell: (e) => <span className="font-mono text-small">{e.billing?.number || 'Draft'}</span> },
    { key: 'total', header: 'Total', align: 'right', cell: (e) => <span className="tabular-nums">{e.billing?.total ? fmtMoney(e.billing.total, e.billing.currency) : '-'}</span> },
    { key: 'balance', header: 'Balance', align: 'right', cell: (e) => <span className="tabular-nums">{e.billing?.total ? fmtMoney(balanceOf(e.billing), e.billing.currency) : '-'}</span> },
    { key: 'pay', header: 'Payment', cell: (e) => (e.billing?.number ? <Badge tone={PAYMENT_TONE[paymentStatus(e.billing)]}>{PAYMENT_LABEL[paymentStatus(e.billing)]}</Badge> : <span className="text-small text-fg-tertiary">Not sent</span>) },
    { key: 'due', header: 'Due', cell: (e) => <span className="text-small text-fg-secondary">{e.billing?.dueDate ?? '-'}</span> },
  ];
  const invoices = (data?.envelopes ?? []).filter((e) => isInvoice(e) && e.billing?.number && e.status !== 'revoked');
  const monthNow = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
  const totals = {
    outstanding: invoices.reduce((s, e) => s + balanceOf(e.billing!), 0),
    overdue: invoices.filter((e) => paymentStatus(e.billing!) === 'overdue').reduce((s, e) => s + balanceOf(e.billing!), 0),
    paidMonth: invoices.reduce((s, e) => s + e.billing!.payments.filter((p) => p.date.startsWith(monthNow)).reduce((a, p) => a + p.amount, 0), 0),
  };

  const columns: Column<EnvelopeView>[] = [
    {
      key: 'title',
      header: 'Document',
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate text-body-strong text-fg">{e.title}</p>
          <p className="truncate text-small text-fg-secondary">{e.recipient.name ? `${e.recipient.name} · ${e.recipient.email}` : 'No recipient yet'}</p>
        </div>
      ),
    },
    { key: 'template', header: 'Template', cell: (e) => <span className="text-small text-fg-secondary">{e.templateMeta?.name ?? templateName(e.templateId)}</span> },
    { key: 'status', header: 'Status', cell: (e) => <StatusChip status={e.status} concern={e.signer?.outcome === 'concern'} /> },
    {
      key: 'opens',
      header: 'Views',
      cell: (e) => <span className="whitespace-nowrap text-small text-fg-secondary">{e.opens ? `Opened ${e.opens} ${e.opens === 1 ? 'time' : 'times'}` : 'Not opened'}</span>,
    },
    { key: 'time', header: 'View time', align: 'right', cell: (e) => <span className="tabular-nums">{e.viewSeconds ? fmtDuration(e.viewSeconds) : '-'}</span> },
    { key: 'activity', header: 'Last activity', cell: (e) => <span className="text-small text-fg-secondary">{fmtManila(e.lastActivityAt)}</span> },
    {
      key: 'expires',
      header: 'Expires',
      cell: (e) => <span className="text-small text-fg-secondary">{e.status === 'sent' || e.status === 'opened' || e.status === 'draft' ? fmtManila(e.access.expiresAt) : '-'}</span>,
    },
  ];

  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Agreements"
        count={data?.envelopes.length}
        description="Send proposals and sign-offs, see when clients read them, and collect e-signatures."
        secondaryActions={
          <Button variant="secondary" icon={<Settings2 />} onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        }
        primaryAction={
          <Link href="/platform/agreements/new" className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-action-brand px-3.5 text-body font-medium text-action-brand-fg hover:bg-action-brand-hover">
            <FilePlus2 className="size-4" aria-hidden /> New document
          </Link>
        }
      />

      {data?.mail.problem && (
        <div role="note" className="mb-4 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg">
          {data.mail.problem}
        </div>
      )}
      {data?.mail.outbox && (
        <div role="note" className="mb-4 rounded-md border border-line bg-subtle px-3 py-2 text-small text-fg-secondary">
          Test server: emails are written to the local test outbox, not sent.
        </div>
      )}
      {data?.storage === 'file' && (
        <div role="note" className="mb-4 rounded-md border border-warning-400/40 bg-warning-bg px-3 py-2 text-small text-warning-fg">
          Agreements are saved on this server&apos;s disk. Connect the Supabase database before relying on them.
        </div>
      )}
      {error && <InlineError message={error} onRetry={load} className="mb-4" />}

      {toCountersign.length > 0 && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-warning-400/50 p-4">
          <div className="flex items-center gap-3">
            <FileSignature className="size-5 text-warning-fg" aria-hidden />
            <p className="text-body text-fg">
              <span className="font-medium">Client signed, countersign now:</span> {toCountersign.map((e) => e.title).join(', ')}
            </p>
          </div>
          <Button variant="primary" onClick={() => router.push(`/platform/agreements/${toCountersign[0].id}`)}>
            Countersign
          </Button>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <FilterChip key={f.value} label={f.label} value={data ? String(counts(f)) : undefined} active={filter === f.value} onClick={() => setFilter(f.value)} />
        ))}
      </div>

      {filter === 'invoices' && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="invoice-totals">
          <StatTile label="Outstanding" value={fmtMoney(totals.outstanding)} />
          <StatTile label="Paid this month" value={fmtMoney(totals.paidMonth)} />
          <StatTile label="Overdue" value={fmtMoney(totals.overdue)} />
        </div>
      )}

      <Card className="overflow-hidden">
        <DataTable
          label="Agreements"
          columns={filter === 'invoices' ? [columns[0], ...invoiceColumns, columns[5]] : columns}
          rows={rows}
          rowKey={(e) => e.id}
          loading={!data && !error}
          onRowClick={(e) => router.push(`/platform/agreements/${e.id}`)}
          rowActions={(e) => (
            <div className="flex items-center gap-1">
              {e.hasLink && (
                <IconButton label="Copy link" size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); void copyLink(e); }}>
                  <Copy className="size-4" />
                </IconButton>
              )}
              <Menu
                items={[
                  { label: 'Open', onSelect: () => router.push(`/platform/agreements/${e.id}`) },
                  ...(e.hasLink ? [{ label: 'Copy link', icon: <Copy />, onSelect: () => void copyLink(e) }] : []),
                  ...(e.status === 'sent' || e.status === 'opened' ? [{ label: 'Send again', icon: <Send />, onSelect: () => void resend(e) }] : []),
                  ...(['sent', 'opened', 'expired', 'signed'].includes(e.status) ? [{ label: 'Revoke link', icon: <Ban />, onSelect: () => setRevoking(e), danger: true }] : []),
                ]}
              />
            </div>
          )}
          empty={
            <EmptyState
              icon={<FileSignature />}
              title={filter === 'all' ? 'No documents yet' : 'Nothing here'}
              description={filter === 'all' ? 'Prepare a proposal or sign-off from a template and send the client a secure link.' : 'No documents match this filter.'}
            />
          }
        />
      </Card>

      <AgreementSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={load} />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke this link?"
        description={revoking ? `“${revoking.title}” will stop working for ${revoking.recipient.name}. They will see a polite “expired” page. This can’t be undone.` : ''}
        confirmLabel="Revoke link"
        onConfirm={() => {
          if (revoking) void revoke(revoking);
          setRevoking(null);
        }}
      />
    </div>
  );
}
