'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Plus, Send, Trash2, Printer, Eye, ExternalLink } from 'lucide-react';
import { Badge, Button, buttonClasses, Card, CardHeader, Dialog, Field, IconButton, Input, PageHeader } from '@/components/ui';
import {
  SystemInvoice,
  InvoiceLineItem,
  InvoiceScenarioType,
  getStoredInvoices,
  addSystemInvoice,
  markInvoicePaidAndProvision,
  subscribeToQuotaStore,
  WISE_PAYMENT_LINK,
} from '@/lib/icpQuotaStore';
import MinimalistInvoiceCard from '@/components/icp/MinimalistInvoiceCard';
import { isDemoWorkspace } from '@/lib/demoMode';

export default function BillingInvoiceManager() {
  const [invoices, setInvoices] = useState<SystemInvoice[]>(() => getStoredInvoices());
  const [selectedPreviewInvoice, setSelectedPreviewInvoice] =
    useState<SystemInvoice | null>(null);

  // Manual Invoice Generator Studio State
  const [scenario, setScenario] = useState<InvoiceScenarioType>('onboarding_month1');
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-1008');
  const [issueDate, setIssueDate] = useState(() =>
    new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  );
  // The sample client is prefilled in the demo workspace only.
  const [tenantName, setTenantName] = useState(() => (isDemoWorkspace() ? 'Apex Global BPO' : ''));
  const [tenantCode, setTenantCode] = useState(() => (isDemoWorkspace() ? 'APEX-GLOBAL' : ''));
  const [clientContactName, setClientContactName] = useState(() => (isDemoWorkspace() ? 'Julian Vance' : ''));
  const [clientEmail, setClientEmail] = useState(() => (isDemoWorkspace() ? 'julian@apexglobalbpo.com' : ''));
  const [creditsToProvision, setCreditsToProvision] = useState<number>(8000);
  const [month2VolumePack, setMonth2VolumePack] = useState<{
    records: number;
    price: number;
  }>({ records: 5000, price: 75 });

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    {
      description: 'Platform Setup & Workspace Deployment',
      subtext: 'One-time onboarding & configuration',
      amountUsd: 2500,
    },
    {
      description: 'Monthly Platform Access (BYOK) — Month 1',
      subtext: 'Included in Month 1 ($249.00/mo begins Month 2)',
      amountUsd: 0,
      isIncludedBonus: true,
    },
    {
      description: 'ICP Data Cloud — 8,000 Records (Month 1)',
      subtext: '2,000 records/week × 4 weeks included in Month 1',
      amountUsd: 0,
      isIncludedBonus: true,
    },
  ]);

  const [sendingEmail, setSendingEmail] = useState(false);
  const [dispatchBanner, setDispatchBanner] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeToQuotaStore(() => {
      setInvoices(getStoredInvoices());
    });
    return () => unsub();
  }, []);

  // Apply Commercial Preset
  const applyPreset = (
    nextScenario: InvoiceScenarioType,
    packOverride?: { records: number; price: number }
  ) => {
    setScenario(nextScenario);
    const activePack = packOverride || month2VolumePack;

    if (nextScenario === 'onboarding_month1') {
      setCreditsToProvision(8000);
      setLineItems([
        {
          description: 'Platform Setup & Workspace Deployment',
          subtext: 'One-time onboarding & configuration',
          amountUsd: 2500,
        },
        {
          description: 'Monthly Platform Access (BYOK) — Month 1',
          subtext: 'Included in Month 1 ($249.00/mo begins Month 2)',
          amountUsd: 0,
          isIncludedBonus: true,
        },
        {
          description: 'ICP Data Cloud — 8,000 Records (Month 1)',
          subtext: '2,000 records/week × 4 weeks included in Month 1',
          amountUsd: 0,
          isIncludedBonus: true,
        },
      ]);
    } else if (nextScenario === 'renewal_month2') {
      setCreditsToProvision(activePack.records);
      const items: InvoiceLineItem[] = [
        {
          description: 'Monthly Platform Access (BYOK)',
          subtext: 'Monthly workspace subscription (excludes ICP credits)',
          amountUsd: 249,
        },
      ];
      if (activePack.records > 0) {
        items.push({
          description: `ICP Data Cloud — +${activePack.records.toLocaleString()} Verified Records`,
          subtext: 'Monthly ICP list building volume add-on',
          amountUsd: activePack.price,
        });
      }
      setLineItems(items);
    } else if (nextScenario === 'icp_topup') {
      const pack = activePack.records > 0 ? activePack : { records: 5000, price: 75 };
      setCreditsToProvision(pack.records);
      setLineItems([
        {
          description: `ICP Data Cloud Quota Tap-Up — +${pack.records.toLocaleString()} Records`,
          subtext: 'Additional verified B2B records credited upon confirmation',
          amountUsd: pack.price,
        },
      ]);
    }
  };

  const totalAmountUsd = lineItems.reduce(
    (sum, item) => sum + (Number(item.amountUsd) || 0),
    0
  );

  // Locks the Send button after a successful send until the invoice itself changes,
  // so a second click can't email the same client a duplicate invoice.
  const invoiceSignature = JSON.stringify([
    tenantName.trim(), tenantCode.trim().toUpperCase(), clientContactName.trim(),
    clientEmail.trim().toLowerCase(), scenario, issueDate, creditsToProvision, lineItems,
  ]);
  const [sentSignature, setSentSignature] = useState<string | null>(null);
  const invoiceSent = sentSignature === invoiceSignature;

  const handleUpdateLineItem = (
    idx: number,
    field: keyof InvoiceLineItem,
    val: string | number
  ) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: val } : item))
    );
  };

  const handleAddCustomLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        description: 'Custom Service / Add-On',
        subtext: 'Appointmentlyy Enterprise Deliverable',
        amountUsd: 100,
      },
    ]);
  };

  const handleRemoveLineItem = (idx: number) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Send Invoice inside the Tool via Resend & Log to System Ledger
  const handleSendInvoiceToClient = async () => {
    if (sendingEmail || invoiceSent) return;
    if (!clientEmail.trim() || !clientEmail.includes('@')) {
      setDispatchBanner({
        type: 'info',
        text: 'Please enter a valid Client Email address before sending.',
      });
      return;
    }

    setSendingEmail(true);
    setDispatchBanner(null);

    try {
      const res = await fetch('/api/intelligence/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: invoiceNumber.trim(),
          tenantName: tenantName.trim(),
          tenantCode: tenantCode.trim().toUpperCase(),
          clientContactName: clientContactName.trim(),
          clientEmail: clientEmail.trim(),
          scenario,
          recordsToCredit: creditsToProvision,
          totalAmountUsd,
          issueDate,
          dueDate: issueDate,
          lineItems,
          createSupportTicket: true,
        }),
      });

      const data = await res.json();
      const createdInvoice: SystemInvoice = {
        id: `inv_${Date.now()}`,
        invoiceNumber: invoiceNumber.trim(),
        tenantCode: tenantCode.trim().toUpperCase(),
        tenantName: tenantName.trim(),
        clientContactName: clientContactName.trim(),
        clientEmail: clientEmail.trim(),
        scenario,
        issueDate,
        dueDate: issueDate,
        status: 'Awaiting Wise Transfer',
        totalAmountUsd,
        creditsToProvision,
        creditsProvisioned: false,
        ticketId: data.ticketId,
        lineItems,
        createdAt: new Date().toISOString(),
      };

      setSentSignature(invoiceSignature);
      const updatedList = addSystemInvoice(createdInvoice);
      setInvoices(updatedList);

      // Increment next invoice number for convenience
      setInvoiceNumber(`INV-2026-${Math.floor(1000 + Math.random() * 8999)}`);

      setDispatchBanner({
        type: 'success',
        text: `Invoice ${createdInvoice.invoiceNumber} ($${totalAmountUsd.toLocaleString(
          'en-US',
          { minimumFractionDigits: 2 }
        )} USD) sent to ${clientEmail} and logged under Ticket ${
          data.ticketId || 'Ledger'
        }!`,
      });
    } catch (err) {
      console.error('[BillingInvoiceManager] Error sending invoice:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleMarkPaidAndCredit = (invId: string) => {
    markInvoicePaidAndProvision(invId);
    setInvoices(getStoredInvoices());
  };

  const footerNoteText =
    scenario === 'onboarding_month1'
      ? 'Month 1 includes setup, platform access, and 8,000 ICP credits. Starting Month 2, platform access is $249/mo (BYOK) and ICP list volume is billed per selected tier.'
      : scenario === 'renewal_month2'
      ? 'Recurring Month 2+ billing: $249/mo BYOK platform access + selected ICP Data Cloud volume tier.'
      : 'On-demand ICP credit top-up. Credited immediately upon Wise transfer confirmation.';

  const presetClass = (active: boolean) =>
    `focus-ring flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-small transition-colors ${
      active
        ? 'border-selected bg-selected-soft text-selected-soft-fg font-medium ring-1 ring-selected'
        : 'border-line bg-surface text-fg hover:bg-subtle'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Create client invoices, send them by email and credit ICP records once the Wise transfer lands."
        secondaryActions={
          <>
            <a
              href={WISE_PAYMENT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses('ghost', 'md')}
            >
              <span>Wise link (@emilhalilih)</span>
              <ExternalLink />
            </a>
            <Button variant="secondary" onClick={() => window.print()} icon={<Printer />}>
              Print / PDF
            </Button>
          </>
        }
      />

      {dispatchBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-success-fg/20 bg-success-bg p-4 text-small text-success-fg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{dispatchBanner.text}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setDispatchBanner(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* 2. SIDE-BY-SIDE MANUAL INVOICE BUILDER (LEFT) & LIVE ULTRA-MINIMALIST PREVIEW (RIGHT) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* LEFT 5 COLS: Manual Client Input & Preset / Line Item Form */}
        <Card className="space-y-5 p-5 lg:col-span-5">
          {/* Commercial Preset Switcher */}
          <div className="space-y-2">
            <h3 className="text-h3 text-fg">Invoice type</h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('onboarding_month1')}
                className={presetClass(scenario === 'onboarding_month1')}
              >
                <span>New customer, month 1 ($2,500 setup + 8k ICP records included)</span>
                <span className="tabular-nums">$2,500</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('renewal_month2')}
                className={presetClass(scenario === 'renewal_month2')}
              >
                <span>Month 2+ subscription ($249 BYOK + paid ICP volume)</span>
                <span className="tabular-nums">${249 + month2VolumePack.price}</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('icp_topup')}
                className={presetClass(scenario === 'icp_topup')}
              >
                <span>ICP record top-up ($50 / $75 / $150)</span>
                <span className="tabular-nums">${month2VolumePack.price || 75}</span>
              </button>
            </div>

            {/* Volume Tier Selector for Month 2+ or Tap-Up */}
            {(scenario === 'renewal_month2' || scenario === 'icp_topup') && (
              <div className="space-y-1.5 pt-2">
                <div className="text-caption text-fg-tertiary">ICP record volume</div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ...(scenario === 'renewal_month2'
                      ? [{ records: 0, price: 0, label: 'BYOK Only ($0 ICP)' }]
                      : []),
                    { records: 2000, price: 50, label: '+2,000 ($50)' },
                    { records: 5000, price: 75, label: '+5,000 ($75)' },
                    { records: 10000, price: 150, label: '+10,000 ($150)' },
                  ].map((opt) => {
                    const active = month2VolumePack.records === opt.records;
                    return (
                      <button
                        key={opt.records}
                        type="button"
                        onClick={() => {
                          const pack = { records: opt.records, price: opt.price };
                          setMonth2VolumePack(pack);
                          applyPreset(scenario, pack);
                        }}
                        className={`focus-ring h-8 rounded-full border px-3 text-small transition-colors ${
                          active
                            ? 'border-selected bg-selected text-selected-fg font-medium'
                            : 'border-line bg-surface text-fg-secondary hover:bg-subtle'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Client Information Inputs */}
          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="text-h3 text-fg">Client details</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company name">
                <Input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Client company name"
                />
              </Field>
              <Field label="Workspace code">
                <Input
                  mono
                  type="text"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.toUpperCase())}
                  placeholder="CLIENT-CODE"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact name">
                <Input
                  type="text"
                  value={clientContactName}
                  onChange={(e) => setClientContactName(e.target.value)}
                  placeholder="Billing contact name"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="billing@client.com"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Invoice number">
                <Input
                  mono
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </Field>
              <Field label="Issue date">
                <Input
                  type="text"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field label="ICP credits included">
                <Input
                  type="number"
                  value={creditsToProvision}
                  onChange={(e) => setCreditsToProvision(Number(e.target.value))}
                  className="tabular-nums"
                />
              </Field>
            </div>
          </div>

          {/* Line Items Editor */}
          <div className="space-y-2.5 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 text-fg">Line items</h3>
              <Button size="sm" variant="ghost" onClick={handleAddCustomLineItem} icon={<Plus />}>
                Add line item
              </Button>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="space-y-1.5 rounded-md border border-line bg-subtle p-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleUpdateLineItem(idx, 'description', e.target.value)}
                      className="flex-1"
                      placeholder="Line item description"
                    />
                    <div className="relative w-28 shrink-0">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-small text-fg-tertiary">
                        $
                      </span>
                      <Input
                        type="number"
                        value={item.amountUsd}
                        onChange={(e) => handleUpdateLineItem(idx, 'amountUsd', Number(e.target.value))}
                        className="pl-6 pr-2 text-right tabular-nums"
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <IconButton
                        label="Remove line item"
                        title="Remove line item"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveLineItem(idx)}
                        className="hover:text-danger-fg"
                      >
                        <Trash2 />
                      </IconButton>
                    )}
                  </div>
                  <Input
                    type="text"
                    value={item.subtext || ''}
                    onChange={(e) => handleUpdateLineItem(idx, 'subtext', e.target.value)}
                    className="h-8 text-small text-fg-secondary"
                    placeholder="Optional subtext (e.g. Included in Month 1)"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Send Button */}
          <Button
            variant="brand"
            size="lg"
            disabled={sendingEmail || invoiceSent}
            loading={sendingEmail}
            onClick={handleSendInvoiceToClient}
            icon={invoiceSent ? <CheckCircle2 /> : <Send />}
            className="w-full"
          >
            <span className="truncate">
              {sendingEmail
                ? 'Sending invoice...'
                : invoiceSent
                ? `Invoice sent to ${clientEmail}`
                : `Send invoice (${invoiceNumber} • $${totalAmountUsd.toLocaleString(
                    'en-US',
                    { minimumFractionDigits: 2 }
                  )} USD) to ${clientEmail || 'Client'}`}
            </span>
          </Button>
        </Card>

        {/* RIGHT 7 COLS: Live Ultra-Minimalist Invoice Preview */}
        <div className="space-y-2 lg:col-span-7">
          <div className="flex items-center justify-between px-1">
            <span className="text-caption text-fg-tertiary">Live preview (matches email and PDF)</span>
            <span className="text-small tabular-nums text-fg-secondary">
              Total due: ${totalAmountUsd.toFixed(2)} USD
            </span>
          </div>

          <MinimalistInvoiceCard
            invoiceNumber={invoiceNumber}
            issueDate={issueDate}
            tenantName={tenantName}
            clientContactName={clientContactName}
            clientEmail={clientEmail}
            totalAmountUsd={totalAmountUsd}
            lineItems={lineItems}
            footerNote={footerNoteText}
          />
        </div>
      </div>

      {/* 3. SYSTEM INVOICE LEDGER & 1-CLICK WISE PAYMENT APPROVAL */}
      <Card className="overflow-hidden">
        <CardHeader
          className="pb-4"
          title="Sent invoices"
          description="When a client completes their Wise transfer, click “Mark paid & credit records” to add their ICP quota."
        />

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-small">
            <thead>
              <tr className="bg-subtle text-caption text-fg-tertiary">
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount (USD)</th>
                <th className="px-4 py-2.5 font-medium">ICP credits</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-line hover:bg-subtle">
                  <td className="px-4 py-3">
                    <div className="font-mono text-fg">{inv.invoiceNumber}</div>
                    <div className="text-fg-tertiary">{inv.issueDate}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-body-strong text-fg">{inv.tenantName}</div>
                    <div className="text-fg-secondary">
                      {inv.clientContactName} &bull; {inv.clientEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    $
                    {inv.totalAmountUsd.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fg-secondary">
                    {inv.creditsToProvision > 0 ? (
                      <span className="text-fg">+{inv.creditsToProvision.toLocaleString()} records</span>
                    ) : (
                      <span>BYOK platform only</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {inv.status === 'Paid' ? (
                      <Badge tone="success">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Paid &amp; provisioned</span>
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <span>{inv.status}</span>
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedPreviewInvoice(inv)} icon={<Eye />}>
                        View
                      </Button>
                      {inv.status !== 'Paid' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleMarkPaidAndCredit(inv.id)}
                          icon={<CheckCircle2 />}
                        >
                          Mark paid &amp; credit records
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal to View Any Saved Invoice */}
      <Dialog
        open={selectedPreviewInvoice !== null}
        onClose={() => setSelectedPreviewInvoice(null)}
        title={selectedPreviewInvoice ? `Invoice ${selectedPreviewInvoice.invoiceNumber}` : 'Invoice preview'}
        size="lg"
        bare
      >
        {selectedPreviewInvoice && (
          <div className="space-y-3 p-4">
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => window.print()} icon={<Printer />}>
                Print / save PDF
              </Button>
              <Button size="sm" variant="primary" onClick={() => setSelectedPreviewInvoice(null)}>
                Close preview
              </Button>
            </div>
            <MinimalistInvoiceCard
              invoiceNumber={selectedPreviewInvoice.invoiceNumber}
              issueDate={selectedPreviewInvoice.issueDate}
              tenantName={selectedPreviewInvoice.tenantName}
              clientContactName={selectedPreviewInvoice.clientContactName}
              clientEmail={selectedPreviewInvoice.clientEmail}
              totalAmountUsd={selectedPreviewInvoice.totalAmountUsd}
              lineItems={selectedPreviewInvoice.lineItems}
              ticketId={selectedPreviewInvoice.ticketId}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}
