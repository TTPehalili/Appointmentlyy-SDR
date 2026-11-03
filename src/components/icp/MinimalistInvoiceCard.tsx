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
    <div className="bg-white text-zinc-900 rounded-xl border border-zinc-200/90 overflow-hidden shadow-xs font-sans">
      {/* Black Header: Official Appointmentlyy Logo & Invoice Meta */}
      <div
        className={`bg-zinc-950 text-white ${
          compact ? 'px-6 py-5' : 'px-8 sm:px-10 py-6'
        } flex items-center justify-between gap-4`}
      >
        <div>
          <img
            src={OFFICIAL_LOGO_PATH}
            alt="Appointmentlyy"
            className="h-7 w-auto object-contain mb-1.5"
          />
          <div className="text-xs text-zinc-400">emil@appointmentlyy.com</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-zinc-400 font-medium">
            Invoice
          </div>
          <div className="text-xs font-mono text-white font-semibold mt-1">
            {invoiceNumber}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">{issueDate}</div>
        </div>
      </div>

      {/* Main Minimalist Invoice Body */}
      <div className={compact ? 'p-6' : 'p-8 sm:p-10'}>
        {/* Billed To & Amount Due Summary */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-zinc-100">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Billed to</div>
            <div className="text-xs font-semibold text-zinc-900">
              {tenantName || 'Client Workspace'}
            </div>
            <div className="text-xs text-zinc-500">
              {clientContactName || 'Account Administrator'} &bull;{' '}
              {clientEmail || 'client@company.com'}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs text-zinc-400 mb-0.5">Amount due</div>
            <div className="text-2xl font-semibold tracking-tight text-zinc-950 font-mono">
              ${formattedTotal}{' '}
              <span className="text-xs font-normal text-zinc-400">USD</span>
            </div>
          </div>
        </div>

        {/* Minimalist Line Items */}
        <div className="py-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 text-xs text-zinc-400 font-normal">
                <th className="py-2.5 font-normal">Description</th>
                <th className="py-2.5 text-right font-normal w-28">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {lineItems.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3.5 pr-4">
                    <div className="font-medium text-zinc-900">
                      {item.description}
                    </div>
                    {item.subtext && (
                      <div className="text-zinc-400 mt-0.5">{item.subtext}</div>
                    )}
                  </td>
                  <td
                    className={`py-3.5 text-right font-mono align-top ${
                      item.amountUsd === 0 ? 'text-zinc-400' : 'text-zinc-900'
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
        <div className="pt-4 pb-8 border-t border-zinc-200 flex justify-between items-center">
          <span className="text-xs font-medium text-zinc-500">Total due</span>
          <span className="text-sm font-semibold font-mono text-zinc-950">
            ${formattedTotal} USD
          </span>
        </div>

        {/* Minimal Wise Payment & QR Section */}
        <div className="pt-6 border-t border-zinc-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2 max-w-sm">
            <div className="text-xs font-semibold text-zinc-900">
              Pay via Wise
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Transfer via Wise using the link below or scan the QR code.
              Reference{' '}
              <button
                type="button"
                onClick={copyInvoiceRef}
                className="inline-flex items-center gap-1 font-mono text-zinc-800 underline decoration-zinc-300 hover:decoration-zinc-900 cursor-pointer"
                title="Copy invoice reference"
              >
                <span>{invoiceNumber}</span>
                {copiedRef ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3 text-zinc-400" />
                )}
              </button>{' '}
              in your note.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <a
                href={WISE_PAYMENT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-950 text-white hover:bg-zinc-800 transition"
              >
                <span>wise.com/pay/me/emilhalilih</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-xs font-mono text-zinc-400">
                {WISE_TAG}
              </span>
              {ticketId && (
                <span className="text-xs font-mono text-zinc-400">
                  &bull; Ticket {ticketId}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center">
            <img
              src={WISE_QR_PATH}
              alt="Wise QR @emilhalilih"
              className="w-24 h-24 object-contain rounded-lg border border-zinc-200"
            />
          </div>
        </div>

        {/* Subtle Note & Official Refund Policy */}
        <div className="mt-8 pt-5 border-t border-zinc-100 space-y-3 text-xs text-zinc-400">
          <div className="text-zinc-500">
            {footerNote ||
              'Month 1 includes platform setup, BYOK access, and 8,000 ICP credits (2,000/wk). Month 2+ renews at $249/mo (BYOK) + selected ICP volume.'}
          </div>
          <div className="pt-3 border-t border-zinc-100 space-y-1 text-zinc-400 leading-relaxed">
            <div className="font-semibold text-zinc-600">
              Refund &amp; Cancellation Policy
            </div>
            <p>
              <strong className="font-medium text-zinc-500">
                Setup &amp; Infrastructure:
              </strong>{' '}
              Initial workspace deployment, configuration, and setup fees
              ($2,500) are non-refundable once resource provisioning has begun.{' '}
              <strong className="font-medium text-zinc-500">
                Monthly Subscriptions:
              </strong>{' '}
              Recurring monthly charges ($249/mo BYOK) operate on a flexible
              30-day model with zero multi-year lock-in and are non-refundable
              once a billing cycle commences; cancel anytime prior to the next
              billing date.{' '}
              <strong className="font-medium text-zinc-500">
                Data Credits &amp; Consumables:
              </strong>{' '}
              Contact enrichment batches and ICP Data Cloud record allocations
              are non-refundable once provisioned or processed. Inquiries:{' '}
              <span className="text-zinc-600 font-mono">
                Admin@appointmentlyy.com
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

