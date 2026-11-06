'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Printer, 
  ArrowLeft, 
  ShieldCheck
} from 'lucide-react';
import { Button, buttonClasses } from '@/components/ui';
import { CertificateMetadata } from '@/lib/certificateRenderer';

function CertificateContent() {
  const params = useParams();
  const certId = (params?.certId as string) || 'CERT-BORIS-2026-X981F';

  const [certData, setCertData] = useState<CertificateMetadata>({
    certificateId: certId,
    repName: 'Emil Halili',
    campaignName: 'Enterprise Outbound BDR Mastery',
    trackName: 'ARM (Acknowledge, Respond, Move) Objection Interception Framework',
    score: 92,
    issueDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    verificationHash: '84F7A9C2',
    supervisorName: 'Emil H. (VP of Sales Enablement)',
    directorName: 'Marcus Vance (Director of Operations)',
    endorsementNotes: 'Candidate achieved mastery score exceeding 85% across 5 multi-archetype stress trials.'
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-app font-sans antialiased text-fg flex flex-col items-center py-10 px-4">
      {/* Top controls bar (hidden during print) */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-3 mb-6 no-print">
        <Link
          href="/certification"
          className={buttonClasses('ghost', 'md')}
        >
          <ArrowLeft aria-hidden />
          <span>Back to certification</span>
        </Link>

        <Button
          variant="brand"
          onClick={handlePrint}
          icon={<Printer aria-hidden />}
        >
          Print or save as PDF
        </Button>
      </div>

      {/* Certificate canvas */}
      <div className="w-full max-w-4xl bg-surface border border-line rounded-xl p-12 shadow-xs relative overflow-hidden flex flex-col justify-between min-h-[640px]">

        {/* Inner frame */}
        <div className="absolute inset-3 border border-line rounded-lg pointer-events-none" />
        <div className="absolute top-0 left-12 right-12 h-1 rounded-b-sm bg-brand-500 pointer-events-none" />

        {/* Certificate header */}
        <div className="text-center relative z-10 pt-4">
          <p className="text-small text-fg-tertiary mb-4">
            Appointmentlyy sales enablement
          </p>

          <h1 className="text-display text-fg">
            Certificate of sales mastery
          </h1>
          <p className="text-body text-fg-secondary mt-2">
            Awarded to
          </p>
        </div>

        {/* Candidate name */}
        <div className="text-center my-6 relative z-10">
          <h2 className="text-[40px] leading-[48px] font-semibold tracking-tight text-fg">
            {certData.repName}
          </h2>
          <div className="mx-auto mt-4 h-0.5 w-24 rounded-full bg-brand-500" aria-hidden />
          <p className="text-body text-fg-secondary mt-6 max-w-2xl mx-auto">
            For showing strong skill in the <strong className="font-medium text-fg">{certData.trackName}</strong> and passing the AI Boris practice trials with an audited score of <strong className="font-medium text-fg tabular-nums">{certData.score}%</strong>.
          </p>
        </div>

        {/* Certificate details */}
        <div className="grid grid-cols-3 gap-6 my-6 pt-6 border-t border-line relative z-10 text-center">
          <div>
            <span className="text-caption text-fg-tertiary block">
              Campaign track
            </span>
            <span className="text-body-strong text-fg mt-1 block">
              {certData.campaignName}
            </span>
          </div>

          <div>
            <span className="text-caption text-fg-tertiary block">
              Audited score
            </span>
            <span className="text-h2 tabular-nums text-success-fg mt-0.5 block">
              {certData.score}%
            </span>
          </div>

          <div>
            <span className="text-caption text-fg-tertiary block">
              Issue date
            </span>
            <span className="text-body-strong tabular-nums text-fg mt-1 block">
              {certData.issueDate}
            </span>
          </div>
        </div>

        {/* Signatures and verification */}
        <div className="pt-6 border-t border-line grid grid-cols-3 items-end relative z-10">
          {/* Supervisor signature */}
          <div className="text-left">
            <div className="italic text-h3 text-fg pb-1 border-b border-line-strong inline-block pr-6">
              Emil Halili
            </div>
            <span className="text-caption text-fg-tertiary block mt-1">
              VP of Sales Enablement
            </span>
          </div>

          {/* Verification seal */}
          <div className="flex flex-col items-center justify-center">
            <div className="size-14 rounded-full border border-line-strong bg-subtle flex items-center justify-center mb-2">
              <ShieldCheck className="size-7 text-brand-text" aria-hidden />
            </div>
            <span className="text-caption text-fg-tertiary">
              ID <span className="font-mono text-fg-secondary">{certData.certificateId}</span>
            </span>
            <span className="text-[10px] text-fg-tertiary">
              Hash <span className="font-mono">{certData.verificationHash}</span>
            </span>
          </div>

          {/* Director signature */}
          <div className="text-right">
            <div className="italic text-h3 text-fg pb-1 border-b border-line-strong inline-block pl-6">
              Marcus Vance
            </div>
            <span className="text-caption text-fg-tertiary block mt-1">
              Director of Operations
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CertificateViewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-small text-fg-secondary">Loading certificate...</div>}>
      <CertificateContent />
    </Suspense>
  );
}
