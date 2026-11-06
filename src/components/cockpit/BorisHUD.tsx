'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  Copy, 
  Check 
} from 'lucide-react';
import { ArmRebuttalResponse, TranscriptEntry } from '@/types';
import LiveTranscript from '@/components/cockpit/LiveTranscript';

interface BorisHUDProps {
  rebuttal: ArmRebuttalResponse;
  transcript: TranscriptEntry[];
  interimText: string;
  isListening: boolean;
  volume: number;
  onSimulateObjection?: (type: string) => void;
}

export default function BorisHUD({
  rebuttal,
  transcript,
  interimText,
  isListening,
  volume,
  onSimulateObjection
}: BorisHUDProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyText = (txt: string, section: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 1800);
  };

  return (
    <div className="flex w-96 flex-shrink-0 select-none flex-col space-y-3 overflow-hidden border-l border-line bg-app p-3">

      {/* =======================================================================
          1. HUD HEADER (Height 40px with audio meter + status)
          ======================================================================= */}
      <div className="flex h-10 shrink-0 items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-fg-secondary" />
          <div>
            <span className="block text-h3 leading-none text-fg">
              AI copilot
            </span>
            <span className="text-caption text-fg-tertiary">
              Live objection help
            </span>
          </div>
        </div>

        {/* Live Audio Level + Status */}
        <div className="flex items-center gap-2">
          {/* Dynamic 5-bar level meter */}
          <div className="flex h-4 items-end gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((bar) => {
              const active = isListening && volume > bar * 16;
              return (
                <div
                  key={bar}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    active ? 'bg-fg' : 'bg-line-strong'
                  }`}
                  style={{ height: `${active ? Math.max(4, (volume / 100) * 16) : 4}px` }}
                />
              );
            })}
          </div>

          <span className="inline-flex items-center gap-1.5 text-caption text-fg-secondary" aria-live="polite">
            <span className={`size-2 rounded-full ${isListening ? 'bg-success-500 animate-pulse-soft' : 'bg-fg-disabled'}`} aria-hidden />
            <span>{isListening ? 'Listening' : 'Standby'}</span>
          </span>
        </div>
      </div>

      {/* =======================================================================
          2. ACTIVE OBJECTION CARD (The Hero Component)
          ======================================================================= */}
      <div className="shrink-0 space-y-2.5 rounded-lg border border-line bg-surface p-3 shadow-xs">

        {/* Card Header: Objection Label + Latency indicator */}
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-h3 text-fg">
              {rebuttal.objection_type || 'Active Competitor Lock-in'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-caption tabular-nums text-fg-tertiary" title="Response time">
              {rebuttal.latency_ms ? `${rebuttal.latency_ms}ms` : '138ms'}
            </span>
          </div>
        </div>

        {/* [A] Acknowledge Line */}
        <div
          onClick={() => copyText(rebuttal.acknowledge || '', 'a')}
          className="group relative cursor-pointer rounded-md border border-line bg-app p-2.5 text-small text-fg transition-colors duration-150 hover:bg-subtle"
        >
          <span className="mb-0.5 block text-caption text-fg-tertiary">
            Acknowledge
          </span>
          <span>
            &quot;{rebuttal.acknowledge || 'I completely understand—you have an established rhythm with them and they know your brand.'}&quot;
          </span>
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            {copiedSection === 'a' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5 text-fg-tertiary" />}
          </div>
        </div>

        {/* [R] Respond Line */}
        <div
          onClick={() => copyText(rebuttal.respond || '', 'r')}
          className="group relative cursor-pointer rounded-md border border-line bg-app p-2.5 text-small text-fg transition-colors duration-150 hover:bg-subtle"
        >
          <span className="mb-0.5 block text-caption text-fg-tertiary">
            Respond
          </span>
          <span>
            &quot;{rebuttal.respond || 'We don’t ask you to fire them. We act as an overflow layer that handles objection friction before it burns qualified pipeline.'}&quot;
          </span>
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            {copiedSection === 'r' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5 text-fg-tertiary" />}
          </div>
        </div>

        {/* [M] Move Line */}
        <div
          onClick={() => copyText(rebuttal.move || '', 'm')}
          className="group relative cursor-pointer rounded-md border border-line bg-app p-2.5 text-small text-fg transition-colors duration-150 hover:bg-subtle"
        >
          <span className="mb-0.5 block text-caption text-fg-tertiary">
            Move
          </span>
          <span className="underline decoration-ai decoration-2 underline-offset-4">
            &quot;{rebuttal.move || 'Are you opposed to a 10-minute side-by-side run next Tuesday to benchmark your hold rate?'}&quot;
          </span>
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            {copiedSection === 'm' ? <Check className="size-3.5 text-success-fg" /> : <Copy className="size-3.5 text-fg-tertiary" />}
          </div>
        </div>

        {/* Fast Rebuttal Quick-Swap Pills */}
        {onSimulateObjection && (
          <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-caption text-fg-tertiary">Test an objection</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSimulateObjection('Incumbent BPO Agency')}
                className="focus-ring inline-flex h-7 items-center rounded-full border border-line-strong bg-surface px-2.5 text-caption text-fg transition-colors duration-150 hover:bg-subtle"
              >
                Incumbent
              </button>
              <button
                onClick={() => onSimulateObjection('No Budget / Freeze')}
                className="focus-ring inline-flex h-7 items-center rounded-full border border-line-strong bg-surface px-2.5 text-caption text-fg transition-colors duration-150 hover:bg-subtle"
              >
                No budget
              </button>
              <button
                onClick={() => onSimulateObjection('Send Me An Email')}
                className="focus-ring inline-flex h-7 items-center rounded-full border border-line-strong bg-surface px-2.5 text-caption text-fg transition-colors duration-150 hover:bg-subtle"
              >
                Send email
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =======================================================================
          3. LIVE DIARIZED TRANSCRIPT LOG
          ======================================================================= */}
      <LiveTranscript
        transcript={transcript}
        interimText={interimText}
        isListening={isListening}
      />
    </div>
  );
}
