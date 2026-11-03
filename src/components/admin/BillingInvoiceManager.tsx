'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  CheckCircle2,
  Plus,
  Send,
  Trash2,
  Printer,
  Eye,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
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
  const [tenantName, setTenantName] = useState('Apex Global BPO');
  const [tenantCode, setTenantCode] = useState('APEX-GLOBAL');
  const [clientContactName, setClientContactName] = useState('Julian Vance');
  const [clientEmail, setClientEmail] = useState('julian@apexglobalbpo.com');
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

  return (
    <div className="space-y-6">
      {/* 1. Top Studio Header */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 text-white text-xs font-bold tracking-wide uppercase mb-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
            <span>Super Admin Manual Invoice Generator &amp; Dispatcher</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-950 tracking-tight">
            Client Onboarding ($2,500), Month 2+ BYOK ($249), &amp; ICP Tap-Up Invoicing
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Manually input client details, preview the ultra-minimalist Appointmentlyy invoice live, email it directly inside the tool, and 1-click provision ICP credits upon Wise payment.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={WISE_PAYMENT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition"
          >
            <span>Wise Link (@emilhalilih)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-zinc-300 text-zinc-800 hover:bg-zinc-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {dispatchBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-xl p-4 flex items-center justify-between gap-3 text-xs font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{dispatchBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setDispatchBanner(null)}
            className="text-emerald-700 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SIDE-BY-SIDE MANUAL INVOICE BUILDER (LEFT) & LIVE ULTRA-MINIMALIST PREVIEW (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 5 COLS: Manual Client Input & Preset / Line Item Form */}
        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-2xl p-5 shadow-2xs space-y-5">
          {/* Commercial Preset Switcher */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
              1. Choose Commercial Invoice Preset
            </label>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('onboarding_month1')}
                className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition cursor-pointer flex items-center justify-between ${
                  scenario === 'onboarding_month1'
                    ? 'bg-zinc-950 text-white border-zinc-950 font-semibold'
                    : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <span>
                  1. New Customer Signup — Month 1 ($2,500 Setup + Free 8k ICP)
                </span>
                <span className="font-mono font-bold">$2,500</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('renewal_month2')}
                className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition cursor-pointer flex items-center justify-between ${
                  scenario === 'renewal_month2'
                    ? 'bg-zinc-950 text-white border-zinc-950 font-semibold'
                    : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <span>2. Month 2+ Subscription ($249 BYOK + Paid ICP Volume)</span>
                <span className="font-mono font-bold">
                  ${249 + month2VolumePack.price}
                </span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('icp_topup')}
                className={`text-left px-3.5 py-2.5 rounded-xl border text-xs transition cursor-pointer flex items-center justify-between ${
                  scenario === 'icp_topup'
                    ? 'bg-zinc-950 text-white border-zinc-950 font-semibold'
                    : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <span>3. Standalone ICP Quota Tap-Up ($50 / $75 / $150)</span>
                <span className="font-mono font-bold">
                  ${month2VolumePack.price || 75}
                </span>
              </button>
            </div>

            {/* Volume Tier Selector for Month 2+ or Tap-Up */}
            {(scenario === 'renewal_month2' || scenario === 'icp_topup') && (
              <div className="pt-2 space-y-1.5">
                <div className="text-xs font-semibold text-zinc-600">
                  Select ICP Record Volume Tier:
                </div>
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
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                          active
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
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
          <div className="space-y-3 pt-3 border-t border-zinc-100 text-xs">
            <label className="block font-bold uppercase tracking-wider text-zinc-500">
              2. Manually Input Client Details
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Company / Client Name
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900"
                  placeholder="Apex Global BPO"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Workspace Code
                </label>
                <input
                  type="text"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-mono"
                  placeholder="APEX-GLOBAL"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Client Contact Name
                </label>
                <input
                  type="text"
                  value={clientContactName}
                  onChange={(e) => setClientContactName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900"
                  placeholder="Julian Vance"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Client Email Address
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900"
                  placeholder="julian@company.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Invoice #
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Issue Date
                </label>
                <input
                  type="text"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  ICP Credits Included
                </label>
                <input
                  type="number"
                  value={creditsToProvision}
                  onChange={(e) => setCreditsToProvision(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Line Items Editor */}
          <div className="space-y-2.5 pt-3 border-t border-zinc-100 text-xs">
            <div className="flex items-center justify-between">
              <label className="font-bold uppercase tracking-wider text-zinc-500">
                3. Invoice Line Items
              </label>
              <button
                type="button"
                onClick={handleAddCustomLineItem}
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Line Item</span>
              </button>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        handleUpdateLineItem(idx, 'description', e.target.value)
                      }
                      className="flex-1 px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-zinc-900 font-medium"
                      placeholder="Line item description"
                    />
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono">
                        $
                      </span>
                      <input
                        type="number"
                        value={item.amountUsd}
                        onChange={(e) =>
                          handleUpdateLineItem(
                            idx,
                            'amountUsd',
                            Number(e.target.value)
                          )
                        }
                        className="w-full pl-6 pr-2 py-1.5 rounded border border-zinc-300 bg-white text-zinc-900 font-mono text-right"
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(idx)}
                        className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                        title="Remove line item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={item.subtext || ''}
                    onChange={(e) =>
                      handleUpdateLineItem(idx, 'subtext', e.target.value)
                    }
                    className="w-full px-2.5 py-1 rounded border border-zinc-200 bg-white text-zinc-500 text-xs"
                    placeholder="Optional subtext (e.g. Included in Month 1)"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Send Button */}
          <button
            type="button"
            disabled={sendingEmail}
            onClick={handleSendInvoiceToClient}
            className="w-full py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {sendingEmail
                ? 'Dispatching Branded Invoice Email...'
                : `Send Invoice (${invoiceNumber} • $${totalAmountUsd.toLocaleString(
                    'en-US',
                    { minimumFractionDigits: 2 }
                  )} USD) to ${clientEmail || 'Client'}`}
            </span>
          </button>
        </div>

        {/* RIGHT 7 COLS: Live Ultra-Minimalist Invoice Preview */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Live Ultra-Minimalist Invoice Preview (Matches Email &amp; PDF)
            </span>
            <span className="text-xs font-mono text-zinc-500">
              Total Due: ${totalAmountUsd.toFixed(2)} USD
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
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-zinc-950">
              Dispatched Invoices &amp; Wise Credit Provisioning Ledger
            </h3>
            <p className="text-xs text-zinc-500">
              When a client completes their Wise transfer, click &ldquo;Mark Paid &amp; Credit Records&rdquo; to automatically provision their ICP quota.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 font-semibold text-zinc-500">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Client &amp; Recipient</th>
                <th className="py-3 px-4">Amount (USD)</th>
                <th className="py-3 px-4">ICP Credits Attached</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-zinc-50/70">
                  <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                    <div>{inv.invoiceNumber}</div>
                    <div className="font-normal text-zinc-400">{inv.issueDate}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-zinc-900">{inv.tenantName}</div>
                    <div className="text-zinc-500">
                      {inv.clientContactName} &bull; {inv.clientEmail}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-zinc-950">
                    $
                    {inv.totalAmountUsd.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-3.5 px-4 font-mono">
                    {inv.creditsToProvision > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200 font-semibold">
                        +{inv.creditsToProvision.toLocaleString()} records
                      </span>
                    ) : (
                      <span className="text-zinc-400">BYOK Platform Only</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    {inv.status === 'Paid' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Paid &amp; Provisioned</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                        <span>{inv.status}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewInvoice(inv)}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-semibold cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                      {inv.status !== 'Paid' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaidAndCredit(inv.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Mark Paid &amp; Credit Records</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal to View Any Saved Invoice */}
      {selectedPreviewInvoice && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full space-y-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-lg bg-white text-zinc-900 text-xs font-bold shadow cursor-pointer"
              >
                Print / Save PDF
              </button>
              <button
                type="button"
                onClick={() => setSelectedPreviewInvoice(null)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold shadow cursor-pointer"
              >
                Close Preview
              </button>
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
        </div>
      )}
    </div>
  );
}
