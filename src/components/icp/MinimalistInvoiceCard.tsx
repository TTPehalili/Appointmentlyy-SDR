'use client';

import React from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import {
  InvoiceLineItem,
  WISE_PAYMENT_LINK,
  WISE_TAG,
  WISE_QR_PATH,
  OFFICIAL_LOGO_PATH,
} from '@/lib/icpQuotaStore';

export interface MinimalistInvoiceCardProps {
  invoiceNumber: string;
  issueDate: string;
  tenantName: string;
  clientContactName: string;
  clientEmail: string;
  totalAmountUsd: number;
  lineItems: InvoiceLineItem[];
  footerNote?: string;
  ticketId?: string;
  compact?: boolean;
}

export default function MinimalistInvoiceCard({
  invoiceNumber,
  issueDate,
  tenantName,
  clientContactName,
  clientEmail,
  totalAmountUsd,
  lineItems,
  footerNote,
  ticketId,
  compact = false,
}: MinimalistInvoiceCardProps) {
  const [copiedRef, setCopiedRef] = React.useState(false);

  const copyInvoiceRef = () => {
    navigator.clipboard.writeText(invoiceNumber);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 1800);
  };

  const formattedTotal = totalAmountUsd.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="bg-surface text-fg rounded-lg border border-line overflow-hidden shadow-xs font-sans">
      {/* Dark document header: kept because the official logo artwork is designed for a dark background */}
      <div
        className={`bg-ink-950 text-ink-50 ${
          compact ? 'px-6 py-5' : 'px-8 sm:px-10 py-6'
        } flex items-center justify-between gap-4`}
      >
        <div>
          <img
            src={OFFICIAL_LOGO_PATH}
            alt="Appointmentlyy"
            className="h-7 w-auto object-contain mb-1.5"
          />
          <div className="text-small text-ink-400">emil@appointmentlyy.com</div>
        </div>
        <div className="text-right">
          <div className="text-caption text-ink-400">
            Invoice
          </div>
          <div className="text-small font-mono text-ink-50 font-medium mt-1">
            {invoiceNumber}
          </div>
          <div className="text-small text-ink-400 mt-0.5">{issueDate}</div>
        </div>
      </div>

      {/* Main Minimalist Invoice Body */}
      <div className={compact ? 'p-6' : 'p-8 sm:p-10'}>
        {/* Billed To & Amount Due Summary */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-line">
          <div>
            <div className="text-caption text-fg-tertiary mb-1">Billed to</div>
            <div className="text-body-strong text-fg">
              {tenantName || 'Client Workspace'}
            </div>
            <div className="text-small text-fg-secondary">
              {clientContactName || 'Account Administrator'} &bull;{' '}
              {clientEmail || 'client@company.com'}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-caption text-fg-tertiary mb-0.5">Amount due</div>
            <div className="text-kpi tabular-nums text-fg">
              ${formattedTotal}{' '}
              <span className="text-small font-normal text-fg-tertiary">USD</span>
            </div>
          </div>
        </div>

        {/* Minimalist Line Items */}
        <div className="py-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line text-caption text-fg-tertiary">
                <th className="py-2.5 font-medium">Description</th>
                <th className="py-2.5 text-right font-medium w-28">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-small">
              {lineItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3.5 pr-4">
                    <div className="font-medium text-fg">
                      {item.description}
                    </div>
                    {item.subtext && (
                      <div className="text-fg-tertiary mt-0.5">{item.subtext}</div>
                    )}
                  </td>
                  <td
                    className={`py-3.5 text-right tabular-nums align-top ${
                      item.amountUsd === 0 ? 'text-fg-tertiary' : 'text-fg'
                    }`}
                  >
                    $
                    {item.amountUsd.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Due Row */}
        <div className="pt-4 pb-8 border-t border-line flex justify-between items-center">
          <span className="text-small font-medium text-fg-secondary">Total due</span>
          <span className="text-body-strong tabular-nums text-fg">
            ${formattedTotal} USD
          </span>
        </div>

        {/* Minimal Wise Payment & QR Section */}
        <div className="pt-6 border-t border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2 max-w-sm">
            <div className="text-body-strong text-fg">
              Pay via Wise
            </div>
            <p className="text-small text-fg-secondary">
              Transfer via Wise using the link below or scan the QR code.
              Reference{' '}
              <button
                type="button"
                onClick={copyInvoiceRef}
                className="focus-ring rounded-sm inline-flex items-center gap-1 font-mono text-fg underline underline-offset-2 decoration-line-strong hover:decoration-fg cursor-pointer"
                title="Copy invoice reference"
              >
                <span>{invoiceNumber}</span>
                {copiedRef ? (
                  <Check className="w-3 h-3 text-success-fg" />
                ) : (
                  <Copy className="w-3 h-3 text-fg-tertiary" />
                )}
              </button>{' '}
              in your note.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <a
                href={WISE_PAYMENT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line-strong bg-surface text-small font-medium text-fg hover:bg-subtle transition-colors duration-150"
              >
                <span>wise.com/pay/me/emilhalilih</span>
                <ExternalLink className="w-3.5 h-3.5 text-fg-secondary" />
              </a>
              <span className="text-small font-mono text-fg-tertiary">
                {WISE_TAG}
              </span>
              {ticketId && (
                <span className="text-small font-mono text-fg-tertiary">
                  &bull; Ticket {ticketId}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center">
            <img
              src={WISE_QR_PATH}
              alt="Wise QR @emilhalilih"
              className="w-24 h-24 object-contain rounded-md border border-line"
            />
          </div>
        </div>

        {/* Subtle Note & Official Refund Policy */}
        <div className="mt-8 pt-5 border-t border-line space-y-3 text-caption font-normal text-fg-tertiary">
          <div className="text-fg-secondary">
            {footerNote ||
              'Month 1 includes platform setup, BYOK access, and 8,000 ICP credits (2,000/wk). Month 2+ renews at $249/mo (BYOK) + selected ICP volume.'}
          </div>
          <div className="pt-3 border-t border-line space-y-1 text-fg-tertiary">
            <div className="font-medium text-fg-secondary">
              Refund and cancellation policy
            </div>

            <p>
              <strong className="font-medium text-fg-tertiary">
                Setup &amp; Infrastructure:
              </strong>{' '}
              Initial workspace deployment, configuration, and setup fees
              ($2,500) are non-refundable once resource provisioning has begun.{' '}
              <strong className="font-medium text-fg-tertiary">
                Monthly Subscriptions:
              </strong>{' '}
              Recurring monthly charges ($249/mo BYOK) operate on a flexible
              30-day model with zero multi-year lock-in and are non-refundable
              once a billing cycle commences; cancel anytime prior to the next
              billing date.{' '}
              <strong className="font-medium text-fg-tertiary">
                Data Credits &amp; Consumables:
              </strong>{' '}
              Contact enrichment batches and ICP Data Cloud record allocations
              are non-refundable once provisioned or processed. Inquiries:{' '}
              <span className="text-fg-secondary font-mono">
                Admin@appointmentlyy.com
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

