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
    <header className="h-12 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 z-30 select-none shadow-2xs">
      
      {/* =======================================================================
          LEFT: TOOL BRANDING (BORIS // BPO OUTBOUND ENGINE) + MVP v1.0 BADGE
          ======================================================================= */}
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-[#ED1C24] flex items-center justify-center text-white font-black text-xs shadow-xs">
          B
        </div>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-[13px] tracking-tight text-slate-900">
            BORIS // BPO OUTBOUND ENGINE
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono font-semibold">
            MVP v1.0
          </span>
        </div>

        <div className="h-4 w-[1px] bg-slate-200 mx-1" />

        {/* Clean Rep Navigation Switchers */}
        <nav className="flex items-center gap-1 text-xs font-semibold">
          <span className="px-2.5 py-1 rounded-md bg-[#ED1C24]/10 text-[#ED1C24] font-bold border border-[#ED1C24]/20/80 shadow-2xs flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-[#ED1C24]" />
            <span>Cockpit</span>
          </span>
          <Link
            href="/practice"
            className="px-2.5 py-1 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5"
          >
            <Swords className="h-3 w-3 text-slate-400" />
            <span>Sparring Arena</span>
          </Link>
          <Link
            href="/certification"
            className="px-2.5 py-1 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5"
          >
            <Award className="h-3 w-3 text-slate-400" />
            <span>Certification</span>
          </Link>
        </nav>
      </div>

      {/* =======================================================================
          CENTER: ACTIVE CAMPAIGN SELECTOR + TARGET ICP INDICATOR PILL
          ======================================================================= */}
      <div className="hidden lg:flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px]">
          <span className="text-slate-400 font-semibold uppercase text-[10px]">Campaign:</span>
          <select
            value={campaign}
            onChange={(e) => onCampaignChange(e.target.value)}
            className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="Enterprise Outbound Q4">Enterprise Outbound Q4</option>
            <option value="Fintech Scaleups">Fintech Scaleups ($50M+ ARR)</option>
            <option value="Healthcare Systems">Enterprise Healthcare Systems</option>
          </select>
        </div>
        
        <span className="text-[11px] font-mono font-medium px-2 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
          ICP: B2B Mid-Market (50-250 HC)
        </span>
      </div>

      {/* =======================================================================
          RIGHT: AUDIO STATUS BADGE + REP STATE + SHORTCUT TRIGGER + ADMIN LINK
          ======================================================================= */}
      <div className="flex items-center gap-3">
        {/* Real-Time Audio Status Badge */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
          <span className={`h-2 w-2 rounded-full ${isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          <span className="font-semibold text-slate-700">
            {isListening ? 'LIVE MIC: Scribe v2 • 140ms' : 'MIC STANDBY'}
          </span>
        </div>

        {/* Rep State Toggle (On Dial / Break) */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-semibold">
          <button
            onClick={() => onRepStatusChange('on_dial')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              repStatus === 'on_dial'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            On Dial
          </button>
          <button
            onClick={() => onRepStatusChange('break')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              repStatus === 'break'
                ? 'bg-white text-amber-700 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Break
          </button>
        </div>

        {/* Keyboard Shortcut Modal Trigger (⌘K) */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (⌘K)"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1 text-xs font-mono"
        >
          <Keyboard className="h-3.5 w-3.5" />
          <span className="text-[10px]">⌘K</span>
        </button>

        {/* Rep Profile & Discreet Admin Portal Switcher */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="h-6 w-6 rounded-full bg-[#ED1C24]/15 text-[#ED1C24] font-bold text-[10px] flex items-center justify-center border border-[#ED1C24]/20">
            AM
          </div>
          <Link
            href="/admin"
            title="Switch to Supervisor / Enablement Console"
            className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
          >
            <ShieldCheck className="h-3 w-3 text-[#ED1C24]" />
            <span className="hidden xl:inline">Admin</span>
            <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
          </Link>
        </div>
      </div>
    </header>
  );
}
