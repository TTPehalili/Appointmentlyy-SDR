'use client';

import React, { useState } from 'react';
import { 
  Phone, 
  Mail, 
  Copy, 
  Check, 
  CheckSquare, 
  Square 
} from 'lucide-react';
import { CockpitLead } from './LeadQueue';
import { buttonClasses, Kbd } from '@/components/ui';
import { useSession } from '@/lib/session';

interface ScriptViewerProps {
  lead: CockpitLead;
  isCallActive: boolean;
  callDuration: number;
  onToggleCall: () => void;
  onSetDisposition: (label: string) => void;
  activeDisposition: string | null;
}

export default function ScriptViewer({
  lead,
  isCallActive,
  callDuration,
  onToggleCall,
  onSetDisposition,
  activeDisposition
}: ScriptViewerProps) {
  const { session } = useSession();
  const [activeChannel, setActiveChannel] = useState<'call' | 'email' | 'linkedin'>('call');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    pain: false,
    stack: false,
    authority: false,
    meeting: false
  });

  const toggleCheck = (key: string) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const formatSeconds = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <section className="flex-1 bg-surface flex flex-col min-w-0 overflow-hidden select-text">
      
      {/* =======================================================================
          1. TOP PROSPECT BANNER
          ======================================================================= */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Contact Identity */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-subtle text-body-strong text-ink-700">
              {lead.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-h2 text-fg">
                  {lead.name}
                </h1>
                <span className="text-small tabular-nums text-fg-secondary">
                  {lead.headcount}
                </span>
                <span className="text-small tabular-nums text-fg-tertiary">
                  {lead.localTime}
                </span>
              </div>
              <p className="text-small text-fg-secondary">
                {lead.title} at <span className="text-body-strong text-fg">{lead.company}</span>
              </p>
            </div>
          </div>

          {/* Quick Connect & Dial Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleCall}
              className={buttonClasses(isCallActive ? 'danger' : 'brand', 'md')}
            >
              <Phone />
              <span className="tabular-nums">{isCallActive ? `End call (${formatSeconds(callDuration)})` : 'Call'}</span>
              {!isCallActive && <span className="border-l border-action-brand-fg/30 pl-2 font-mono text-small">{lead.phone}</span>}
            </button>

            <button
              onClick={() => copyToClipboard(lead.email, 'email')}
              title="Copy Email"
              aria-label="Copy email"
              className={buttonClasses('secondary', 'md', 'size-9 px-0')}
            >
              {copiedKey === 'email' ? <Check className="text-success-fg" /> : <Mail />}
            </button>
          </div>
        </div>

        {/* Enriched CSV Metadata Attributes Bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-small">
          <div className="flex items-center gap-1 text-fg-secondary">
            <span className="text-fg-tertiary">Current BPO:</span>
            <span className="text-fg">{lead.currentBpo}</span>
          </div>
          <div className="flex items-center gap-1 text-fg-secondary">
            <span className="text-fg-tertiary">Tech stack:</span>
            <span className="text-fg">{lead.techStack}</span>
          </div>
          <div className="flex items-center gap-1 text-fg-secondary">
            <span className="text-fg-tertiary">Pain point:</span>
            <span className="text-fg">{lead.painPoint}</span>
          </div>
        </div>
      </div>

      {/* =======================================================================
          2. CHANNEL TABS (Segmented Pill Switcher)
          ======================================================================= */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-2">
        <div className="inline-flex items-center rounded-md border border-line bg-subtle p-0.5 text-small font-medium">
          <button
            onClick={() => setActiveChannel('call')}
            className={`focus-ring flex h-7 items-center gap-1.5 rounded-[6px] px-3 transition-colors duration-150 ${
              activeChannel === 'call'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-secondary hover:text-fg'
            }`}
          >
            <Phone className="size-3.5" />
            <span>Cold call</span>
          </button>
          <button
            onClick={() => setActiveChannel('email')}
            className={`focus-ring flex h-7 items-center gap-1.5 rounded-[6px] px-3 transition-colors duration-150 ${
              activeChannel === 'email'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-secondary hover:text-fg'
            }`}
          >
            <Mail className="size-3.5" />
            <span>Email</span>
          </button>
          <button
            onClick={() => setActiveChannel('linkedin')}
            className={`focus-ring flex h-7 items-center gap-1.5 rounded-[6px] px-3 transition-colors duration-150 ${
              activeChannel === 'linkedin'
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-secondary hover:text-fg'
            }`}
          >
            <span>LinkedIn</span>
          </button>
        </div>

        <div className="hidden items-center gap-2 text-small tabular-nums text-fg-tertiary sm:flex">
          <span>Cadence step 3 of 8</span>
        </div>
      </div>

      {/* =======================================================================
          3. DYNAMIC SCRIPT CANVAS (Scrollable)
          ======================================================================= */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-surface p-4">
        
        {activeChannel === 'call' && (
          <div className="space-y-4">
            
            {/* Step 1: Opener & Lead Source Check */}
            <div className="relative rounded-lg border border-line bg-app p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">
                  1. Pattern interrupt and lead source check (15s)
                </span>
                <button
                  onClick={() => copyToClipboard(`Hey ${lead.name.split(' ')[0]}, quick question—where do your outbound leads come from today, and how much of that list actually connects?`, 'c1')}
                  aria-label="Copy line"
                  className="focus-ring rounded-sm p-1 text-fg-tertiary hover:bg-subtle hover:text-fg"
                >
                  {copiedKey === 'c1' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-body text-fg">
                &quot;Hey <span className="rounded-sm bg-subtle px-1 font-medium text-fg">{lead.name.split(' ')[0]}</span>, quick question—where do your outbound leads come from today, and how much of that list actually connects?&quot;
              </p>
            </div>

            {/* Step 2: Confirm Core Bottleneck */}
            <div className="relative rounded-lg border border-line bg-app p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">
                  2. The lead-quality and pipeline check (30s)
                </span>
                <button
                  onClick={() => copyToClipboard(`The reason I ask is most BPO owners we talk to tell us a big share of every list is stale: bounced emails, wrong numbers, people who left months ago, or companies that were never a fit. Reps burn the shift and the pipeline stays thin and hard to forecast. Is that happening on your floor too?`, 'c2')}
                  aria-label="Copy line"
                  className="focus-ring rounded-sm p-1 text-fg-tertiary hover:bg-subtle hover:text-fg"
                >
                  {copiedKey === 'c2' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-body text-fg">
                &quot;The reason I ask is most BPO owners tell us a big share of every list is stale: bounced emails, wrong numbers, people who left months ago, or companies that were never a fit. Reps burn the shift and the pipeline stays thin and hard to forecast. Is that happening on your floor too?&quot;
              </p>
            </div>

            {/* Step 3: Problem vs. Solution */}
            <div className="relative rounded-lg border border-line bg-app p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">
                  3. Lead burn vs. verified AI lists and practice (45s)
                </span>
                <button
                  onClick={() => copyToClipboard(`What we do differently is twofold: First, we generate verified, Claude-enriched ICP lists matched to the clients you actually want. Second, before your reps ever dial those leads, our AI Boris runs them through 5 realistic objection sparring rounds so they never burn expensive contacts on warm-up swings.`, 'c3')}
                  aria-label="Copy line"
                  className="focus-ring rounded-sm p-1 text-fg-tertiary hover:bg-subtle hover:text-fg"
                >
                  {copiedKey === 'c3' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-body text-fg">
                &quot;What we do differently is twofold: First, we generate verified, Claude-enriched ICP lists matched to the clients you actually want. Second, before your reps ever dial those leads, our AI Boris runs them through 5 realistic objection sparring rounds so they never burn expensive contacts on warm-up swings.&quot;
              </p>
            </div>

            {/* Step 4: Vertical Diagnostic Pivot */}
            <div className="relative rounded-lg border border-line bg-app p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">
                  4. Vertical diagnostic pivot (30s)
                </span>
                <button
                  onClick={() => copyToClipboard(`Are you guys currently placing more customer service reps, specialized bookkeeping, or outbound sales seats?`, 'c4')}
                  aria-label="Copy line"
                  className="focus-ring rounded-sm p-1 text-fg-tertiary hover:bg-subtle hover:text-fg"
                >
                  {copiedKey === 'c4' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-body text-fg">
                &quot;Are you guys currently placing more customer service reps, specialized bookkeeping, or outbound sales seats?&quot;
              </p>
            </div>

            {/* Step 5: Close with Founder Emil */}
            <div className="relative rounded-lg border border-line bg-app p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">
                  5. The close: demo with founder Emil (30s)
                </span>
                <button
                  onClick={() => copyToClipboard(`Our founder, Emil, has been in the BPO BDM trenches for over 17 years. He put together a 20-minute screen share showing how we build private Claude-enriched lists and let reps spar with AI before live calls. Would you be open to taking a look with Emil this Thursday at 2:00 PM, or does Friday morning work better for your calendar?`, 'c5')}
                  aria-label="Copy line"
                  className="focus-ring rounded-sm p-1 text-fg-tertiary hover:bg-subtle hover:text-fg"
                >
                  {copiedKey === 'c5' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <p className="text-body text-fg">
                &quot;Our founder, Emil, has been in the BPO BDM trenches for over 17 years. He put together a 20-minute screen share showing how we build private Claude-enriched lists and let reps spar with AI before live calls. Would you be open to taking a look with Emil this Thursday at 2:00 PM, or does Friday morning work better for your calendar?&quot;
              </p>
            </div>

            {/* Interactive Qualification Checklist */}
            <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
              <span className="block text-h3 text-fg">
                Qualification checklist
              </span>
              <div className="grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
                <button
                  onClick={() => toggleCheck('pain')}
                  className={`focus-ring flex items-center gap-2 rounded-md border p-2 text-left transition-colors duration-150 ${
                    checklist.pain ? 'border-success-500/40 bg-success-bg text-success-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                  }`}
                >
                  {checklist.pain ? <CheckSquare className="size-4 shrink-0 text-success-fg" /> : <Square className="size-4 shrink-0 text-fg-tertiary" />}
                  <span>Uncovered core pain point</span>
                </button>

                <button
                  onClick={() => toggleCheck('stack')}
                  className={`focus-ring flex items-center gap-2 rounded-md border p-2 text-left transition-colors duration-150 ${
                    checklist.stack ? 'border-success-500/40 bg-success-bg text-success-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                  }`}
                >
                  {checklist.stack ? <CheckSquare className="size-4 shrink-0 text-success-fg" /> : <Square className="size-4 shrink-0 text-fg-tertiary" />}
                  <span>Validated stack and incumbent</span>
                </button>

                <button
                  onClick={() => toggleCheck('authority')}
                  className={`focus-ring flex items-center gap-2 rounded-md border p-2 text-left transition-colors duration-150 ${
                    checklist.authority ? 'border-success-500/40 bg-success-bg text-success-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                  }`}
                >
                  {checklist.authority ? <CheckSquare className="size-4 shrink-0 text-success-fg" /> : <Square className="size-4 shrink-0 text-fg-tertiary" />}
                  <span>Confirmed decision authority</span>
                </button>

                <button
                  onClick={() => toggleCheck('meeting')}
                  className={`focus-ring flex items-center gap-2 rounded-md border p-2 text-left transition-colors duration-150 ${
                    checklist.meeting ? 'border-success-500/40 bg-success-bg text-success-fg' : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                  }`}
                >
                  {checklist.meeting ? <CheckSquare className="size-4 shrink-0 text-success-fg" /> : <Square className="size-4 shrink-0 text-fg-tertiary" />}
                  <span>Booked 15-minute diagnostic call</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeChannel === 'email' && (
          <div className="space-y-3 rounded-lg border border-line bg-app p-4">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <span className="text-body-strong text-fg">
                Subject: Quick question re: {lead.painPoint} at {lead.company}
              </span>
              <button
                onClick={() => copyToClipboard(`Subject: Quick question re: ${lead.painPoint} at ${lead.company}\n\nHi ${lead.name.split(' ')[0]},\n\nNoticed ${lead.company} is using ${lead.techStack}. Many sales teams we speak with cite ${lead.painPoint} as their biggest hurdle.\n\nWe provide sub-second live call ARM interception to boost outbound conversions.\n\nOpen to a brief 10-minute chat next week?\n\nBest,\nAlex`, 'email_copy')}
                className={buttonClasses('secondary', 'sm')}
              >
                {copiedKey === 'email_copy' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                <span>Copy draft</span>
              </button>
            </div>
            <div className="space-y-3 rounded-md border border-line bg-surface p-3 text-body text-fg">
              <p>Hi {lead.name.split(' ')[0]},</p>
              <p>Noticed {lead.company} is currently running {lead.techStack} with {lead.currentBpo}. Typically, demand generation leaders in your space mention that {lead.painPoint} holds back outbound pipeline quotas.</p>
              <p>We built AI Boris to feed SDRs live objection talk tracks during live calls with zero hesitation.</p>
              <p>Would you be open to a 10-minute diagnostic session next Tuesday or Wednesday?</p>
              <p>Best,<br />{session?.repName || 'Emil Halili'}</p>
            </div>
          </div>
        )}

        {activeChannel === 'linkedin' && (
          <div className="space-y-3 rounded-lg border border-line bg-app p-4">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <span className="text-body-strong text-fg">
                LinkedIn connection note (under 300 characters)
              </span>
              <button
                onClick={() => copyToClipboard(`Hi ${lead.name.split(' ')[0]}, noticed your work leading sales development at ${lead.company}. We track B2B outbound benchmarks around ${lead.painPoint} across ${lead.headcount} companies. Would love to connect and share notes!`, 'li_copy')}
                className={buttonClasses('secondary', 'sm')}
              >
                {copiedKey === 'li_copy' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5" />}
                <span>Copy note</span>
              </button>
            </div>
            <div className="rounded-md border border-line bg-surface p-3 text-body text-fg">
              &quot;Hi {lead.name.split(' ')[0]}, noticed your work leading sales development at {lead.company}. We track B2B outbound benchmarks around {lead.painPoint} across {lead.headcount} companies. Would love to connect and share notes!&quot;
            </div>
          </div>
        )}
      </div>

      {/* =======================================================================
          4. BOTTOM FIXED CALL DISPOSITION DOCK (Height 14 border-t)
          ======================================================================= */}
      <div className="flex h-14 shrink-0 select-none items-center justify-between border-t border-line bg-surface px-4">
        <div className="flex items-center gap-2">
          <span className="text-caption text-fg-tertiary">
            Outcome
          </span>

          {/* [1] Meeting Booked */}
          <button
            onClick={() => onSetDisposition('Meeting Booked')}
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${
              activeDisposition === 'Meeting Booked'
                ? 'border-success-500/50 bg-success-bg text-success-fg'
                : 'border-line-strong bg-surface text-fg hover:bg-subtle'
            }`}
          >
            <Kbd>1</Kbd>
            <span>Meeting booked</span>
          </button>

          {/* [2] Gatekeeper */}
          <button
            onClick={() => onSetDisposition('Gatekeeper')}
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${
              activeDisposition === 'Gatekeeper'
                ? 'border-fg bg-subtle text-fg'
                : 'border-line-strong bg-surface text-fg hover:bg-subtle'
            }`}
          >
            <Kbd>2</Kbd>
            <span>Gatekeeper</span>
          </button>

          {/* [3] Left VM */}
          <button
            onClick={() => onSetDisposition('Left Voicemail')}
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${
              activeDisposition === 'Left Voicemail'
                ? 'border-fg bg-subtle text-fg'
                : 'border-line-strong bg-surface text-fg hover:bg-subtle'
            }`}
          >
            <Kbd>3</Kbd>
            <span>Left voicemail</span>
          </button>

          {/* [4] Disqualified */}
          <button
            onClick={() => onSetDisposition('Disqualified')}
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${
              activeDisposition === 'Disqualified'
                ? 'border-danger-fg/40 bg-danger-bg text-danger-fg'
                : 'border-line-strong bg-surface text-fg hover:bg-subtle'
            }`}
          >
            <Kbd>4</Kbd>
            <span>Disqualified</span>
          </button>
        </div>

        {activeDisposition && (
          <div className="flex items-center gap-1.5 text-small text-success-fg">
            <Check className="size-3.5" />
            <span>Saved: {activeDisposition}</span>
          </div>
        )}
      </div>
    </section>
  );
}
