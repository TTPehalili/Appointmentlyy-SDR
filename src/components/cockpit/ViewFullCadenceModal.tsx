'use client';

import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Mail, 
  Phone, 
  Clock, 
  ShieldCheck, 
  Zap, 
  ArrowRight,
  Filter
} from 'lucide-react';
import { CADENCE_TOUCHES, CadenceTouch } from '@/lib/cadenceMaster';
import { Button, IconButton, Badge, Dialog } from '@/components/ui';

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.64 1.64 0 1 0 0 3.28 1.64 1.64 0 0 0 0-3.28" />
    </svg>
  );
}

interface ViewFullCadenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDay?: number;
  contactName?: string;
  companyName?: string;
  repName?: string;
}

export default function ViewFullCadenceModal({
  isOpen,
  onClose,
  currentDay = 2,
  contactName = 'Julian Vance',
  companyName = 'Apex Global BPO',
  repName = 'Emil Halili'
}: ViewFullCadenceModalProps) {
  const [filterChannel, setFilterChannel] = useState<'All' | 'Email' | 'Phone' | 'LinkedIn'>('All');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const replacePlaceholders = (text: string) => {
    return text
      .replace(/\{\{first_name\}\}/g, contactName.split(' ')[0] || 'there')
      .replace(/\{\{company\}\}/g, companyName || 'your company')
      .replace(/\{\{rep_name\}\}/g, repName || 'Emil Halili')
      .replace(/\{\{loom_link\}\}/g, 'https://loom.com/share/bpo-60seat-arm-demo');
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(replacePlaceholders(text));
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  const [activeTouches, setActiveTouches] = useState<CadenceTouch[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tenant_cadence_touches');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item: any, idx: number) => ({
              day: item.day || idx + 1,
              stepName: item.stepName || `Touch #${idx + 1}`,
              touchNumber: item.touchNumber || idx + 1,
              channel: item.channel || 'Email',
              mechanism: item.mechanism || 'Outbound campaign dispatch',
              timingRule: item.timingRule || 'Sub-65 words; laser-focused on value proposition.',
              subject: item.subject,
              body: item.body,
              spokenOpener: item.spokenOpener
            }));
          }
        }
      } catch {}
    }
    return CADENCE_TOUCHES;
  });

  // Open/closed is handled by <Dialog open={isOpen}>. If an early return is ever added
  // back, it must come after every hook (rules of hooks).
  const filteredTouches = activeTouches.filter(t => {
    if (filterChannel === 'All') return true;
    return t.channel === filterChannel;
  });

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Outbound cadence: 27 days, 13 touches"
      size="2xl"
      className="overflow-hidden"
      bare
    >
      <div className="flex h-[min(85vh,calc(100dvh-2rem))] w-full flex-col overflow-hidden">
        {/* Top Header */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h2 text-fg">
                Outbound cadence: 27 days, 13 touches
              </h2>
              <span className="text-caption tabular-nums text-fg-tertiary">
                Spec v3.1
              </span>
            </div>
            <p className="mt-0.5 text-body text-fg-secondary">
              Email automation, priority calls and manual LinkedIn touches, in one sequence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Channel Filters */}
            <div className="hidden items-center rounded-md border border-line bg-subtle p-0.5 sm:inline-flex">
              {(['All', 'Phone', 'Email', 'LinkedIn'] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => setFilterChannel(ch)}
                  aria-pressed={filterChannel === ch}
                  className={`focus-ring inline-flex h-7 cursor-pointer items-center rounded-[6px] px-3 text-small font-medium transition-colors duration-150 ${
                    filterChannel === ch
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>

            {/* Clean Close Button */}
            <IconButton label="Close cadence view" size="sm" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        </div>

        {/* Prospect Dynamic Context Strip */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-app px-6 py-2 text-small text-fg-secondary">
          <div className="flex items-center gap-3">
            <span>Prospect: <span className="text-body-strong text-fg">{contactName}</span> at <span className="text-body-strong text-fg">{companyName}</span></span>
            <span aria-hidden className="text-fg-disabled">·</span>
            <span>Rep: <span className="text-body-strong text-fg">{repName}</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-small tabular-nums text-fg-secondary">
              Current cadence day: <span className="text-body-strong text-fg">Day {currentDay}</span>
            </span>
          </div>
        </div>

        {/* Scrollable Timeline Work Area */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-app p-6">
          <div className="space-y-4">
            {filteredTouches.map((touch, idx) => {
              const isCurrent = touch.day === currentDay;
              const isPassed = touch.day < currentDay;

              return (
                <div
                  key={touch.touchNumber}
                  className={`relative rounded-lg border bg-surface p-4 shadow-xs transition-colors duration-150 ${
                    isCurrent
                      ? 'border-fg'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  {/* Top Touchpoint Header */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex h-5 items-center rounded-sm px-1.5 text-caption tabular-nums ${
                        isCurrent
                          ? 'bg-action text-action-fg'
                          : isPassed
                          ? 'bg-subtle text-fg-tertiary'
                          : 'bg-subtle text-fg-secondary'
                      }`}>
                        Day {touch.day}
                      </span>

                      <span className="flex items-center gap-1.5 text-small text-fg-secondary">
                        {touch.channel === 'Email' && <Mail className="size-3.5" />}
                        {touch.channel === 'Phone' && <Phone className="size-3.5" />}
                        {touch.channel === 'LinkedIn' && <LinkedInIcon className="size-3.5" />}
                        <span>{touch.channel}</span>
                      </span>

                      <h3 className="text-h3 text-fg">
                        Touch {touch.touchNumber}: {touch.stepName}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrent && (
                        <Badge tone="success">Current touchpoint</Badge>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy(touch.body, idx)}
                        title="Copy Script / Copy"
                        icon={copiedIndex === idx ? <Check className="text-success-fg" /> : <Copy />}
                      >
                        {copiedIndex === idx ? (
                          <span>Copied</span>
                        ) : (
                          <span>Copy template</span>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Metadata Row: Mechanism & Timing */}
                  <div className="mb-3 grid grid-cols-1 gap-2 text-small text-fg-secondary md:grid-cols-2">
                    <div className="flex items-start gap-1.5">
                      <Zap className="mt-0.5 size-3.5 shrink-0 text-fg-tertiary" />
                      <div>
                        <span className="text-body-strong text-fg">Execution:</span> {touch.mechanism}
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <Clock className="mt-0.5 size-3.5 shrink-0 text-fg-tertiary" />
                      <div>
                        <span className="text-body-strong text-fg">Timing and rule:</span> {touch.timingRule}
                      </div>
                    </div>
                  </div>

                  {/* Email Subject Line (if applicable) */}
                  {touch.subject && (
                    <div className="mb-2.5 rounded-md border border-line bg-subtle p-2 text-small">
                      <span className="mr-2 text-caption text-fg-tertiary">Subject</span>
                      <span className="text-body-strong text-fg">
                        {replacePlaceholders(touch.subject)}
                      </span>
                    </div>
                  )}

                  {/* Spoken Opener (if Phone) */}
                  {touch.spokenOpener && (
                    <div className="mb-2.5 rounded-md border border-line bg-subtle p-2.5 text-small">
                      <span className="mb-0.5 block text-caption text-fg-tertiary">Spoken opener (screen 1)</span>
                      <p className="text-fg">
                        {replacePlaceholders(touch.spokenOpener)}
                      </p>
                    </div>
                  )}

                  {/* Voicemail Audio (if Phone #2) */}
                  {touch.voicemailAudio && (
                    <div className="mb-2.5 rounded-md border border-line bg-subtle p-2.5 text-small">
                      <span className="mb-0.5 block text-caption text-fg-tertiary">15-second voicemail script</span>
                      <p className="text-fg">
                        {replacePlaceholders(touch.voicemailAudio)}
                      </p>
                    </div>
                  )}

                  {/* Body Copy Block */}
                  <div className="whitespace-pre-wrap rounded-md border border-line bg-app p-3 font-sans text-small text-fg">
                    {replacePlaceholders(touch.body)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Footer Actions */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
          <div className="flex items-center gap-2 text-small text-fg-tertiary">
            <ShieldCheck className="size-4 text-fg-secondary" />
            <span>Cadence gating is on: a step advances only after an outcome is logged or the task is done.</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
