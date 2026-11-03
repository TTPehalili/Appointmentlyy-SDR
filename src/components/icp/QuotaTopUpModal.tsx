'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  CheckCircle2,
  ExternalLink,
  LifeBuoy,
  Send,
  Sparkles,
  Printer,
} from 'lucide-react';
import {
  ICP_TOPUP_PACKAGES,
  TopUpPackage,
  addSystemInvoice,
  WISE_PAYMENT_LINK,
} from '@/lib/icpQuotaStore';
import MinimalistInvoiceCard from './MinimalistInvoiceCard';

export interface QuotaTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantCode: string;
  tenantName: string;
  clientContactName: string;
  clientEmail: string;
  onInvoiceGenerated?: (invoiceNumber: string, ticketId?: string) => void;
}

export default function QuotaTopUpModal({
  isOpen,
  onClose,
  tenantCode,
  tenantName,
  clientContactName,
  clientEmail,
  onInvoiceGenerated,
}: QuotaTopUpModalProps) {
  const [selectedPack, setSelectedPack] = useState<TopUpPackage>(ICP_TOPUP_PACKAGES[1]); // Default +5,000 ($75)
  const [recipientEmail, setRecipientEmail] = useState(clientEmail || 'admin@company.com');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [generatedInvoice, setGeneratedInvoice] = useState<{
    invoiceNumber: string;
    issueDate: string;
    ticketId?: string;
    emailDispatched: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleGenerateInvoice = async () => {
    setSubmitting(true);
    try {
      const invNum = `INV-2026-${Math.floor(1000 + Math.random() * 8999)}`;
      const nowDate = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const lineItems = [
        {
          description: `ICP Data Cloud Quota Tap-Up — +${selectedPack.records.toLocaleString()} Verified Records`,
          subtext:
            'Additional verified B2B decision-maker records credited upon confirmation',
          amountUsd: selectedPack.priceUsd,
        },
      ];

      const res = await fetch('/api/intelligence/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber: invNum,
          tenantCode,
          tenantName,
          clientContactName,
          clientEmail: recipientEmail.trim(),
          scenario: 'icp_topup',
          recordsToCredit: selectedPack.records,
          totalAmountUsd: selectedPack.priceUsd,
          issueDate: nowDate,
          dueDate: nowDate,
          lineItems,
          createSupportTicket: true,
          notes,
        }),
      });

      const data = await res.json();
      const finalInvNum = data.invoiceNumber || invNum;
      const finalTicketId = data.ticketId;

      // Save to client-side invoice ledger
      addSystemInvoice({
        id: `inv_${Date.now()}`,
        invoiceNumber: finalInvNum,
        tenantCode,
        tenantName,
        clientContactName,
        clientEmail: recipientEmail.trim(),
        scenario: 'icp_topup',
        issueDate: nowDate,
        dueDate: nowDate,
        status: 'Awaiting Wise Transfer',
        totalAmountUsd: selectedPack.priceUsd,
        creditsToProvision: selectedPack.records,
        creditsProvisioned: false,
        ticketId: finalTicketId,
        lineItems,
        notes,
        createdAt: new Date().toISOString(),
      });

      setGeneratedInvoice({
        invoiceNumber: finalInvNum,
        issueDate: nowDate,
        ticketId: finalTicketId,
        emailDispatched: Boolean(data.emailDispatched),
      });

      if (onInvoiceGenerated) {
        onInvoiceGenerated(finalInvNum, finalTicketId);
      }
    } catch (err) {
      console.error('[QuotaTopUpModal] Failed to generate invoice:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Top Modal Header */}
        <div className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-900 text-white">
                ICP Data Cloud
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                {tenantName}
              </span>
            </div>
            <h2 className="text-base font-bold text-zinc-950 mt-1">
              {generatedInvoice
                ? `Official Invoice ${generatedInvoice.invoiceNumber} — Ready for Wise Payment`
                : 'Tap Up ICP List Building Quota'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!generatedInvoice ? (
            <>
              {/* Step 1: Volume Tier Selection */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                      1. Select Additional Record Volume
                    </h3>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Choose the volume you wish to add. We will email your
                      system-generated invoice and log a priority billing ticket
                      for instant activation.
                    </p>
                  </div>
                  <Link
                    href="/tickets"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 shrink-0"
                  >
                    <LifeBuoy className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Contact Support / Ticket Desk</span>
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ICP_TOPUP_PACKAGES.map((pack) => {
                    const isSelected = selectedPack.id === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setSelectedPack(pack)}
                        className={`text-left rounded-xl p-4 border transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-zinc-950 text-white border-zinc-950 shadow-sm'
                            : 'bg-white text-zinc-900 border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span
                              className={`text-xs font-mono font-semibold ${
                                isSelected ? 'text-zinc-300' : 'text-zinc-500'
                              }`}
                            >
                              {pack.costPerRecord}
                            </span>
                            {pack.badge && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isSelected
                                    ? 'bg-white text-zinc-950'
                                    : 'bg-zinc-100 text-zinc-800'
                                }`}
                              >
                                {pack.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold">{pack.label}</div>
                          <div
                            className={`text-xs mt-1 ${
                              isSelected ? 'text-zinc-400' : 'text-zinc-500'
                            }`}
                          >
                            Direct Dial Phones + Verified Work Emails
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-zinc-200/20 flex items-baseline justify-between">
                          <span className="text-xl font-mono font-bold">
                            ${pack.priceUsd}
                          </span>
                          <span
                            className={`text-xs ${
                              isSelected ? 'text-emerald-400' : 'text-zinc-400'
                            }`}
                          >
                            {isSelected ? '✓ Selected' : 'Select'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Invoice Recipient & Notes */}
              <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  2. Invoice Delivery &amp; Ticket Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Send Branded Invoice To (Email)
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                      placeholder="billing@yourcompany.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Optional Note for Support / Billing Ticket
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                      placeholder="e.g. Urgent Q4 campaign pull"
                    />
                  </div>
                </div>
              </div>

              {/* Live Minimalist Preview Before Sending */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Invoice Preview
                </div>
                <MinimalistInvoiceCard
                  invoiceNumber="INV-2026-PREVIEW"
                  issueDate={new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  tenantName={tenantName}
                  clientContactName={clientContactName}
                  clientEmail={recipientEmail}
                  totalAmountUsd={selectedPack.priceUsd}
                  compact
                  lineItems={[
                    {
                      description: `ICP Data Cloud Quota Tap-Up — +${selectedPack.records.toLocaleString()} Verified Records`,
                      subtext:
                        'Additional verified B2B decision-maker records credited upon confirmation',
                      amountUsd: selectedPack.priceUsd,
                    },
                  ]}
                  footerNote="On-demand ICP credit top-up. Automatically logged in Appointmentlyy Support Tickets upon generation."
                />
              </div>

              {/* Submit Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="text-xs text-zinc-500">
                  Need a custom enterprise volume tier? Email{' '}
                  <a
                    href="mailto:emil@appointmentlyy.com"
                    className="font-semibold text-zinc-900 underline"
                  >
                    emil@appointmentlyy.com
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-xs font-semibold border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleGenerateInvoice}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {submitting
                        ? 'Generating Invoice & Ticket...'
                        : `Send Invoice & Pay $${selectedPack.priceUsd} via Wise`}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Step 3: Confirmation Screen + Wise Link + QR + Ticket Link */
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950">
                    <div className="font-bold">
                      Invoice {generatedInvoice.invoiceNumber} Generated &amp;
                      Logged
                    </div>
                    <p className="text-emerald-800 mt-0.5">
                      Dispatched to <strong>{recipientEmail}</strong>
                      {generatedInvoice.ticketId
                        ? ` and logged under Support Ticket #${generatedInvoice.ticketId}.`
                        : '.'}{' '}
                      Complete your <strong>${selectedPack.priceUsd}.00 USD</strong>{' '}
                      transfer via Wise below to credit your{' '}
                      <strong>
                        +{selectedPack.records.toLocaleString()} records
                      </strong>
                      .
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={WISE_PAYMENT_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 transition"
                  >
                    <span>Pay ${selectedPack.priceUsd} on Wise</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {generatedInvoice.ticketId && (
                    <Link
                      href={`/tickets?id=${generatedInvoice.ticketId}`}
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 transition"
                    >
                      <LifeBuoy className="w-3.5 h-3.5" />
                      <span>Open Ticket</span>
                    </Link>
                  )}
                </div>
              </div>

              {/* Official Minimalist Invoice Document */}
              <MinimalistInvoiceCard
                invoiceNumber={generatedInvoice.invoiceNumber}
                issueDate={generatedInvoice.issueDate}
                tenantName={tenantName}
                clientContactName={clientContactName}
                clientEmail={recipientEmail}
                totalAmountUsd={selectedPack.priceUsd}
                ticketId={generatedInvoice.ticketId}
                lineItems={[
                  {
                    description: `ICP Data Cloud Quota Tap-Up — +${selectedPack.records.toLocaleString()} Verified Records`,
                    subtext:
                      'Additional verified B2B decision-maker records credited upon confirmation',
                    amountUsd: selectedPack.priceUsd,
                  },
                ]}
                footerNote={`On-demand ICP credit top-up. Logged under Support Ticket ${
                  generatedInvoice.ticketId || 'Desk'
                }.`}
              />

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedInvoice(null);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
