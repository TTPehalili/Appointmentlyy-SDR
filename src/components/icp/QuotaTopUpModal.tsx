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
  Check,
} from 'lucide-react';
import {
  ICP_TOPUP_PACKAGES,
  TopUpPackage,
  addSystemInvoice,
  WISE_PAYMENT_LINK,
} from '@/lib/icpQuotaStore';
import MinimalistInvoiceCard from './MinimalistInvoiceCard';
import { Badge, Button, Dialog, IconButton, buttonClasses } from '@/components/ui';

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
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={generatedInvoice ? `Invoice ${generatedInvoice.invoiceNumber} is ready to pay on Wise` : 'Top up your lead quota'}
      size="xl"
      bare
      dismissible={!submitting}
      className="bg-app"
    >
      <div>
        {/* Top Modal Header */}
        <div className="bg-surface border-b border-line px-6 py-4 flex items-start justify-between gap-4 sticky top-0 z-10">
          <div>
            <div className="text-small text-fg-secondary">
              {tenantName}
            </div>
            <h2 id="quota-topup-title" className="text-h3 text-fg mt-0.5">
              {generatedInvoice
                ? `Invoice ${generatedInvoice.invoiceNumber} is ready to pay on Wise`
                : 'Top up your lead quota'}
            </h2>
          </div>
          <IconButton label="Close" variant="ghost" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        <div className="p-6 space-y-6">
          {!generatedInvoice ? (
            <>
              {/* Step 1: Volume Tier Selection */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-body-strong text-fg">
                      1. Choose how many records to add
                    </h3>
                    <p className="text-small text-fg-secondary mt-0.5">
                      We&apos;ll email you an invoice and open a priority billing
                      ticket so the records are added as soon as you pay.
                    </p>
                  </div>
                  <Link
                    href="/admin/support"
                    onClick={onClose}
                    className={buttonClasses('ghost', 'sm')}
                  >
                    <LifeBuoy className="text-fg-secondary" />
                    <span>Contact support</span>
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ICP_TOPUP_PACKAGES.map((pack) => {
                    const isSelected = selectedPack.id === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedPack(pack)}
                        className={`focus-ring text-left rounded-lg p-4 border transition-colors duration-150 cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-selected bg-selected-soft ring-1 ring-selected shadow-xs'
                            : 'border-line bg-surface hover:border-line-strong'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-caption tabular-nums text-fg-tertiary">
                              {pack.costPerRecord}
                            </span>
                            {pack.badge && (
                              <Badge tone={isSelected ? 'brand' : 'neutral'}>
                                {pack.badge}
                              </Badge>
                            )}
                          </div>
                          <div className="text-body-strong text-fg">{pack.label}</div>
                          <div className="text-small mt-1 text-fg-secondary">
                            Direct phones and verified work emails
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-line flex items-baseline justify-between">
                          <span className="text-h2 tabular-nums text-fg">
                            ${pack.priceUsd}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 text-small ${
                              isSelected ? 'text-fg font-medium' : 'text-fg-tertiary'
                            }`}
                          >
                            {isSelected ? <Check className="w-3.5 h-3.5" /> : null}
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Invoice Recipient & Notes */}
              <div className="bg-surface border border-line rounded-lg shadow-xs p-4 space-y-3">
                <h3 className="text-body-strong text-fg">
                  2. Invoice and ticket details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-small font-medium text-fg mb-1">
                      Send the invoice to
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled"
                      placeholder="billing@yourcompany.com"
                    />
                  </div>
                  <div>
                    <label className="block text-small font-medium text-fg mb-1">
                      Note for the billing ticket <span className="font-normal text-fg-tertiary">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled"
                      placeholder="e.g. Urgent Q4 campaign pull"
                    />
                  </div>
                </div>
              </div>

              {/* Live Minimalist Preview Before Sending */}
              <div className="space-y-2">
                <div className="text-caption text-fg-tertiary">
                  Invoice preview
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
                <div className="text-small text-fg-secondary">
                  Need a custom enterprise volume? Email{' '}
                  <a
                    href="mailto:emil@appointmentlyy.com"
                    className="focus-ring rounded-sm font-medium text-fg underline underline-offset-2 decoration-line-strong"
                  >
                    emil@appointmentlyy.com
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="brand"
                    disabled={submitting}
                    onClick={handleGenerateInvoice}
                    icon={<Send />}
                  >
                    <span>
                      {submitting
                        ? 'Creating invoice and ticket...'
                        : `Send invoice and pay $${selectedPack.priceUsd} via Wise`}
                    </span>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* Step 3: Confirmation Screen + Wise Link + QR + Ticket Link */
            <div className="space-y-5">
              <div className="bg-success-bg rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0 mt-0.5" />
                  <div className="text-small text-fg">
                    <div className="text-body-strong text-success-fg">
                      Invoice {generatedInvoice.invoiceNumber} created and logged
                    </div>
                    <p className="text-fg-secondary mt-0.5">
                      Sent to <span className="font-medium text-fg">{recipientEmail}</span>
                      {generatedInvoice.ticketId
                        ? ` and logged under support ticket #${generatedInvoice.ticketId}.`
                        : '.'}{' '}
                      Pay <span className="font-medium text-fg tabular-nums">${selectedPack.priceUsd}.00 USD</span>{' '}
                      on Wise below to add your{' '}
                      <span className="font-medium text-fg tabular-nums">
                        +{selectedPack.records.toLocaleString()} records
                      </span>
                      .
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={WISE_PAYMENT_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses('brand', 'md')}
                  >
                    <span>Pay ${selectedPack.priceUsd} on Wise</span>
                    <ExternalLink />
                  </a>
                  {generatedInvoice.ticketId && (
                    <Link
                      href={`/admin/support?id=${generatedInvoice.ticketId}`}
                      onClick={onClose}
                      className={buttonClasses('secondary', 'md')}
                    >
                      <LifeBuoy className="text-fg-secondary" />
                      <span>Open ticket</span>
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
                <Button
                  variant="secondary"
                  icon={<Printer />}
                  onClick={() => window.print()}
                >
                  Print or save as PDF
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setGeneratedInvoice(null);
                    onClose();
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
