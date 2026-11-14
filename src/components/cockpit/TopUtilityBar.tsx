'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Keyboard, 
  ShieldCheck, 
  Swords, 
  Award, 
  ExternalLink,
  Radio
} from 'lucide-react';
import { buttonClasses, Kbd } from '@/components/ui';

interface TopUtilityBarProps {
  campaign: string;
  onCampaignChange: (campaign: string) => void;
  isListening: boolean;
  repStatus: 'on_dial' | 'break';
  onRepStatusChange: (status: 'on_dial' | 'break') => void;
  onOpenShortcuts: () => void;
}

export default function TopUtilityBar({
  campaign,
  onCampaignChange,
  isListening,
  repStatus,
  onRepStatusChange,
  onOpenShortcuts
}: TopUtilityBarProps) {
  return (
    <header className="z-30 flex h-12 shrink-0 select-none items-center justify-between border-b border-line bg-surface px-4">

      {/* =======================================================================
          LEFT: TOOL BRANDING + VERSION
          ======================================================================= */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-body-strong text-fg">
            Boris outbound engine
          </span>
          <span className="text-caption text-fg-tertiary">
            MVP v1.0
          </span>
        </div>

        <div className="mx-1 h-4 w-px bg-line" />

        {/* Clean Rep Navigation Switchers */}
        <nav className="flex items-center gap-1 text-small font-medium">
          <span className="flex h-7 items-center gap-1.5 rounded-sm bg-subtle px-2.5 text-fg">
            <Radio className="size-3.5 text-brand-text" />
            <span>Cockpit</span>
          </span>
          <Link
            href="/practice"
            className="focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-fg-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg"
          >
            <Swords className="size-3.5 text-fg-secondary" />
            <span>Practice</span>
          </Link>
          <Link
            href="/certification"
            className="focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-fg-secondary transition-colors duration-150 hover:bg-subtle hover:text-fg"
          >
            <Award className="size-3.5 text-fg-secondary" />
            <span>Certification</span>
          </Link>
        </nav>
      </div>

      {/* =======================================================================
          CENTER: ACTIVE CAMPAIGN SELECTOR + TARGET ICP INDICATOR
          ======================================================================= */}
      <div className="hidden items-center gap-3 lg:flex">
        <label className="flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 text-small focus-within:border-brand-600">
          <span className="text-fg-tertiary">Campaign</span>
          <select
            value={campaign}
            onChange={(e) => onCampaignChange(e.target.value)}
            className="cursor-pointer bg-transparent font-medium text-fg focus:outline-none"
          >
            <option value="Enterprise Outbound Q4">Enterprise Outbound Q4</option>
            <option value="Fintech Scaleups">Fintech Scaleups ($50M+ ARR)</option>
            <option value="Healthcare Systems">Enterprise Healthcare Systems</option>
          </select>
        </label>

        <span className="text-small text-fg-secondary">
          ICP: B2B mid-market (50 to 250 staff)
        </span>
      </div>

      {/* =======================================================================
          RIGHT: AUDIO STATUS + REP STATE + SHORTCUT TRIGGER + ADMIN LINK
          ======================================================================= */}
      <div className="flex items-center gap-3">
        {/* Real-Time Audio Status */}
        <span className="inline-flex items-center gap-2 text-small text-fg" aria-live="polite">
          <span className={`size-2 shrink-0 rounded-full ${isListening ? 'bg-success-500 animate-pulse-soft' : 'bg-fg-disabled'}`} aria-hidden />
          <span>{isListening ? 'Mic live' : 'Mic on standby'}</span>
        </span>

        {/* Rep State Toggle (On Dial / Break) */}
        <div className="inline-flex rounded-md border border-line bg-subtle p-0.5 text-small font-medium">
          <button
            onClick={() => onRepStatusChange('on_dial')}
            aria-pressed={repStatus === 'on_dial'}
            className={`focus-ring h-7 rounded-[6px] px-2.5 transition-colors duration-150 ${
              repStatus === 'on_dial'
                ? 'bg-success-700 text-white shadow-xs'
                : 'text-fg-secondary hover:bg-surface hover:text-fg'
            }`}
          >
            On dial
          </button>
          <button
            onClick={() => onRepStatusChange('break')}
            aria-pressed={repStatus === 'break'}
            className={`focus-ring h-7 rounded-[6px] px-2.5 transition-colors duration-150 ${
              repStatus === 'break'
                ? 'bg-warning-400 text-ink-900 shadow-xs'
                : 'text-fg-secondary hover:bg-surface hover:text-fg'
            }`}
          >
            Break
          </button>
        </div>

        {/* Keyboard Shortcut Modal Trigger */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (⌘K)"
          className={buttonClasses('ghost', 'sm', 'px-2')}
        >
          <Keyboard />
          <Kbd>⌘K</Kbd>
        </button>

        {/* Rep Profile & Discreet Admin Portal Switcher */}
        <div className="hidden items-center gap-2 border-l border-line pl-3 sm:flex">
          <div className="flex size-6 items-center justify-center rounded-full bg-subtle text-caption text-ink-700">
            AM
          </div>
          <Link
            href="/admin"
            title="Switch to Supervisor / Enablement Console"
            className={buttonClasses('ghost', 'sm', 'px-2')}
          >
            <ShieldCheck />
            <span className="hidden xl:inline">Admin</span>
            <ExternalLink className="text-fg-tertiary" />
          </Link>
        </div>
      </div>
    </header>
  );
}
