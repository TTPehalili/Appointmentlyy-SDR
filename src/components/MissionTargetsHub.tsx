'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Target, 
  Swords, 
  Headphones, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  TrendingUp, 
  ArrowRight, 
  Database, 
  PhoneCall, 
  Zap, 
  ShieldAlert, 
  Briefcase, 
  Sun, 
  Sliders, 
  ExternalLink,
  Layers,
  Award,
  Users
} from 'lucide-react';

export default function MissionTargetsHub() {
  // Interactive Capacity Model State
  const [sdrLines, setSdrLines] = useState<number>(2);
  const [dealAcv, setDealAcv] = useState<number>(12000);
  const [closeRate, setCloseRate] = useState<number>(20);
  const [selectedGate, setSelectedGate] = useState<number | null>(null);

  // Projections
  const guaranteedSits = sdrLines * 35;
  const projectedDeals = Math.round(guaranteedSits * (closeRate / 100));
  const pipelineRevenue = projectedDeals * dealAcv;
  const costGtm = sdrLines * 4500;
  const netRoi = (pipelineRevenue / costGtm).toFixed(1);
  const inHouseSavings = sdrLines * 8000;

  const gates = [
    {
      id: 1,
      num: '01',
      excuse: '“The data was bad / wrong number.”',
      category: 'Data & Intel',
      solutionTitle: '600M+ Verified Contacts',
      solutionDesc: 'Every lead is pre-scrubbed for mobile line validity, real-time DNC registry, and verified decision-maker ownership before rep dial.',
      guardrail: '99.2% Line Validity',
      icon: Database,
      badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200'
    },
    {
      id: 2,
      num: '02',
      excuse: '“I had no context on the prospect.”',
      category: 'Data & Intel',
      solutionTitle: 'Lead Context Injection (<180ms)',
      solutionDesc: 'Full prospect history, past notes, and proprietary deep intelligence load on-screen in <180ms with 100% stability. Zero freeze, zero hallucination.',
      guardrail: '<180ms In-Call Feed',
      icon: Zap,
      badgeColor: 'bg-blue-50 text-blue-800 border-blue-200'
    },
    {
      id: 3,
      num: '03',
      excuse: '“I froze when the prospect gave me a hard objection.”',
      category: 'Call Coaching',
      solutionTitle: 'Live Screen Guidance + AI Dojo',
      solutionDesc: 'Live screen guidance displays the exact talking points and qualification questions. Reps drill 40+ runs before dialing live leads.',
      guardrail: '40+ Dojo Drills',
      icon: Sparkles,
      badgeColor: 'bg-purple-50 text-purple-800 border-purple-200'
    },
    {
      id: 4,
      num: '04',
      excuse: '“I didn’t know if the prospect was actually qualified.”',
      category: 'CRM & Gates',
      solutionTitle: 'Code-Enforced Submission Gates',
      solutionDesc: 'Unqualified appointments cannot be booked. Software strictly blocks missing decision-makers or low budgets at submission time.',
      guardrail: 'Zero Unqualified Sits',
      icon: ShieldCheck,
      badgeColor: 'bg-rose-50 text-rose-800 border-rose-200'
    },
    {
      id: 5,
      num: '05',
      excuse: '“Manual CRM note-taking takes up half my shift.”',
      category: 'CRM & Gates',
      solutionTitle: '1-Click Automated Sync',
      solutionDesc: 'Calls transcribe automatically in real time. Summaries, tags, and calendar invites sync to your CRM without rep typing.',
      guardrail: 'Zero Manual Typing',
      icon: Layers,
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
    },
    {
      id: 6,
      num: '06',
      excuse: '“The prospect didn’t show up to the booked demo.”',
      category: 'CRM & Gates',
      solutionTitle: 'Double Confirmation Loop',
      solutionDesc: 'Automated SMS and email confirmations trigger within 60 seconds with calendar invites and direct self-serve rescheduling links.',
      guardrail: '<60s Multi-Channel Sync',
      icon: Clock,
      badgeColor: 'bg-teal-50 text-teal-800 border-teal-200'
    }
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 w-full bg-zinc-50/70 text-zinc-900 font-sans overflow-hidden">

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Scrollable Mission & Targets Canvas */}
        <main className="flex-1 overflow-y-auto px-6 lg:px-12 py-8 space-y-8 max-w-7xl mx-auto w-full">
          
          {/* HERO SECTION: MISSION & CORE POSITIONING */}
          <section className="rounded-xl bg-white text-zinc-950 p-6 sm:p-8 shadow-xs border border-zinc-200">
            <div className="max-w-3xl space-y-3">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-zinc-400 block">
                APPOINTMENTLYY SDR &bull; BPO OUTBOUND ENGINE
              </span>

              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-950 leading-tight">
                Fill Your Seats With High-Ticket Clients.
              </h1>

              <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed max-w-2xl">
                The ultimate AI GTM engine for BPOs. Turn reps into elite appointment setters in 3 days, master unscripted objection handling, and win enterprise contracts.
              </p>

              {/* Action Buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/dialer"
                  className="px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <Swords className="h-3.5 w-3.5" />
                  <span>Launch Calling Floor</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
                </Link>

                <Link
                  href="/practice"
                  className="px-4 py-2 rounded-lg bg-white hover:bg-zinc-50 text-zinc-800 font-medium text-xs flex items-center gap-2 border border-zinc-200 transition-colors cursor-pointer shadow-2xs"
                >
                  <Headphones className="h-3.5 w-3.5 text-zinc-600" />
                  <span>AI Sparring Arena (10 Personas)</span>
                </Link>

                <Link
                  href="/admin"
                  className="px-3.5 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-600" />
                  <span>Admin Control</span>
                </Link>
              </div>
            </div>
          </section>

          {/* KEY OPERATIONAL TARGETS & CONTRACTUAL SLAS */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[#ED1C24]">
                  CONTRACTUAL BENCHMARKS & SLAS
                </span>
                <h2 className="text-2xl font-black text-[#222021] tracking-tight">
                  Appointmentlyy Core Performance Targets
                </h2>
              </div>
              <span className="text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold">
                CONTRACTUAL GUARANTEE
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#6b6968] block uppercase">Target Demo Output</span>
                <span className="text-2xl font-black text-[#222021] font-mono block">35+</span>
                <p className="text-[11px] text-emerald-700 font-semibold leading-tight">sits / rep / mo SLA</p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#6b6968] block uppercase">Global Records</span>
                <span className="text-2xl font-black text-[#222021] font-mono block">600M+</span>
                <p className="text-[11px] text-[#6b6968] leading-tight">Verified B2B data lake</p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#6b6968] block uppercase">Rep Ramp Velocity</span>
                <span className="text-2xl font-black text-[#ED1C24] font-mono block">3 Days</span>
                <p className="text-[11px] text-[#6b6968] leading-tight">TTP floor framework</p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#6b6968] block uppercase">Context Latency</span>
                <span className="text-2xl font-black text-blue-600 font-mono block">&lt;180ms</span>
                <p className="text-[11px] text-[#6b6968] leading-tight">Zero-lag screen feed</p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#6b6968] block uppercase">Line Validity</span>
                <span className="text-2xl font-black text-[#222021] font-mono block">99.2%</span>
                <p className="text-[11px] text-[#6b6968] leading-tight">Pre-scrubbed DNC clean</p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-1">
                <span className="text-[10px] font-mono text-[#6b6968] block uppercase">QA Call Scoring</span>
                <span className="text-2xl font-black text-purple-600 font-mono block">100%</span>
                <p className="text-[11px] text-[#6b6968] leading-tight">ARM 2.0 acoustic score</p>
              </div>
            </div>
          </section>

          {/* THE 3-DAY TRAINING-TO-PRODUCTION (TTP) FLOOR SYSTEM */}
          <section className="space-y-4">
            <div className="text-center max-w-xl mx-auto space-y-1">
              <span className="text-xs font-mono font-bold uppercase text-[#ED1C24]">METHODOLOGY</span>
              <h2 className="text-2xl sm:text-3xl font-black text-[#222021] tracking-tight">
                The 3-Day Training-to-Production (TTP) System
              </h2>
              <p className="text-xs text-[#6b6968]">
                From day-1 hire to hitting quota on the phone in 72 hours with zero AE babysitting.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-6 rounded-3xl bg-white border border-[#222021]/10 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="h-9 w-9 rounded-xl bg-[#222021] text-white font-mono font-bold flex items-center justify-center text-sm mb-3">
                    01
                  </div>
                  <h3 className="text-base font-extrabold text-[#222021]">Day 1: AI Roleplay Sparring</h3>
                  <p className="text-xs text-[#6b6968] mt-2 leading-relaxed">
                    New reps spar with realistic, hostile AI customer personas (burned VPs, skeptical directors, gatekeepers). Reps master tone and pacing before ever touching a live prospect.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#222021]/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-[#6b6968]">Day 1 Benchmark:</span>
                  <span className="font-bold text-[#222021] bg-[#F2F0EF] px-2 py-0.5 rounded">40+ simulated runs</span>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-white border border-[#222021]/10 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="h-9 w-9 rounded-xl bg-[#222021] text-white font-mono font-bold flex items-center justify-center text-sm mb-3">
                    02
                  </div>
                  <h3 className="text-base font-extrabold text-[#222021]">Day 2: Stable Lead Context Injection</h3>
                  <p className="text-xs text-[#6b6968] mt-2 leading-relaxed">
                    When dialer connects, complete prospect history, past notes, and proprietary account intelligence load on-screen in &lt;180ms with rock-solid stability. Zero freeze, zero hallucination.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#222021]/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-[#6b6968]">Day 2 Benchmark:</span>
                  <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">&lt;180ms UI latency</span>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-white border border-[#222021]/10 shadow-2xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="h-9 w-9 rounded-xl bg-[#222021] text-white font-mono font-bold flex items-center justify-center text-sm mb-3">
                    03
                  </div>
                  <h3 className="text-base font-extrabold text-[#222021]">Day 3: Production Floor Live Guidance</h3>
                  <p className="text-xs text-[#6b6968] mt-2 leading-relaxed">
                    Reps dial live prospects with live talking points and objection solutions displayed on screen. 100% of calls are scored automatically with QA analytics.
                  </p>
                </div>
                <div className="pt-4 border-t border-[#222021]/10 flex items-center justify-between text-xs font-mono">
                  <span className="text-[#6b6968]">Day 3 Benchmark:</span>
                  <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">100% QA Scored</span>
                </div>
              </div>
            </div>
          </section>

          {/* ZERO-EXCUSES ARCHITECTURE (6 DETERMINISTIC GATES) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[#ED1C24]">
                  ZERO-EXCUSES SOFTWARE GATES
                </span>
                <h2 className="text-2xl font-black text-[#222021] tracking-tight">
                  We Have Removed All Agent Excuses Not To Convert Leads
                </h2>
              </div>
              <span className="text-xs text-[#6b6968]">6 Code-Enforced Guardrails</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gates.map((g) => {
                const IconComponent = g.icon;
                const isSelected = selectedGate === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGate(isSelected ? null : g.id)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected 
                        ? 'bg-white border-[#ED1C24] shadow-md ring-2 ring-[#ED1C24]/10' 
                        : 'bg-white border-[#222021]/10 hover:border-[#222021]/30 shadow-2xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold uppercase text-[#6b6968]">
                          Excuse #{g.num} &bull; {g.category}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${g.badgeColor}`}>
                          ELIMINATED
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#F2F0EF] mb-3">
                        <p className="text-xs italic font-serif text-[#222021]">
                          {g.excuse}
                        </p>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-[#222021] text-white flex items-center justify-center shrink-0 mt-0.5">
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#222021]">{g.solutionTitle}</h4>
                          <p className="text-[11px] text-[#6b6968] mt-0.5 leading-snug">{g.solutionDesc}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[#222021]/10 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#6b6968]">Guardrail:</span>
                      <strong className="text-[#222021]">{g.guardrail}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* INTERACTIVE CAPACITY & ROI CALCULATOR */}
          <section className="rounded-3xl bg-white border border-[#222021]/10 p-6 sm:p-8 shadow-2xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#222021]/10 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#ED1C24] block">
                  INTERACTIVE CAPACITY MODEL
                </span>
                <h3 className="text-xl font-black text-[#222021] tracking-tight">
                  Calculate Your Guaranteed Outbound ROI
                </h3>
              </div>
              <span className="text-xs font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-xl font-bold self-start sm:self-auto">
                Contractual 35+ Sits SLA
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Sliders (7 cols) */}
              <div className="lg:col-span-7 space-y-5">
                {/* 1. Dedicated SDR Lines */}
                <div className="p-4 rounded-2xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#222021]">1. Dedicated SDR Lines</label>
                    <span className="text-sm font-mono font-black text-[#222021] bg-white px-3 py-0.5 rounded-lg border border-[#222021]/10">
                      {sdrLines} Lines ({sdrLines * 35} sits/mo)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={sdrLines}
                    onChange={(e) => setSdrLines(Number(e.target.value))}
                    className="w-full accent-[#ED1C24] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#6b6968]">
                    <span>1 Line (35 sits)</span>
                    <span>5 Lines (175 sits)</span>
                    <span>10 Lines (350 sits)</span>
                  </div>
                </div>

                {/* 2. Average Deal ACV */}
                <div className="p-4 rounded-2xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#222021]">2. Average Deal ACV</label>
                    <span className="text-sm font-mono font-black text-[#222021] bg-white px-3 py-0.5 rounded-lg border border-[#222021]/10">
                      ${dealAcv.toLocaleString()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2500"
                    max="50000"
                    step="2500"
                    value={dealAcv}
                    onChange={(e) => setDealAcv(Number(e.target.value))}
                    className="w-full accent-[#ED1C24] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#6b6968]">
                    <span>$2,500</span>
                    <span>$25,000</span>
                    <span>$50,000+</span>
                  </div>
                </div>

                {/* 3. Demo to Close Rate */}
                <div className="p-4 rounded-2xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#222021]">3. AE Demo-to-Close Rate</label>
                    <span className="text-sm font-mono font-black text-[#222021] bg-white px-3 py-0.5 rounded-lg border border-[#222021]/10">
                      {closeRate}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="35"
                    step="5"
                    value={closeRate}
                    onChange={(e) => setCloseRate(Number(e.target.value))}
                    className="w-full accent-[#ED1C24] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#6b6968]">
                    <span>10% (Conservative)</span>
                    <span>20% (Target)</span>
                    <span>35% (Top Tier)</span>
                  </div>
                </div>
              </div>

              {/* Live Output Card (5 cols) */}
              <div className="lg:col-span-5 rounded-2xl bg-[#0F1412] text-white p-6 space-y-4 shadow-xl border border-stone-800">
                <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400">
                    Live Capacity Projection
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                    SLA GUARANTEED
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-stone-400">Guaranteed Qualified Sits</span>
                      <p className="text-[10px] text-stone-500">35+ contractual SLA per line</p>
                    </div>
                    <span className="text-2xl font-black font-mono text-white">
                      {guaranteedSits}+ <span className="text-xs font-normal text-stone-400">/ mo</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-stone-800/80 pt-2">
                    <span className="text-xs text-stone-400">Projected Closed Deals</span>
                    <span className="text-xl font-bold font-mono text-stone-200">
                      ~{projectedDeals} <span className="text-xs font-normal text-stone-400">deals/mo</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-stone-800/80 pt-2">
                    <div>
                      <span className="text-xs font-bold text-emerald-400">Projected Pipeline Revenue</span>
                      <p className="text-[10px] text-stone-500">Based on ${dealAcv.toLocaleString()} ACV</p>
                    </div>
                    <span className="text-2xl font-black font-mono text-emerald-400">
                      ${pipelineRevenue.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between">
                    <span className="text-xs text-stone-300 font-semibold">Estimated Net Return</span>
                    <span className="text-xl font-black font-mono text-white">
                      {netRoi}x <span className="text-xs font-normal text-stone-400">ROI</span>
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-stone-400 pt-1">
                    Savings vs. hiring in-house SDRs: <strong className="text-white">${inHouseSavings.toLocaleString()}/mo</strong>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* TWO HIGH-PERFORMANCE VERTICALS & PRODUCT TIERS */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Vertical: BPO Contact Centers */}
            <div className="p-6 rounded-3xl bg-white border border-[#222021]/10 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                  PRIMARY FOCUS (70%)
                </span>
                <span className="text-xs font-mono text-[#6b6968]">High-Velocity Floors</span>
              </div>

              <div>
                <h3 className="text-lg font-black text-[#222021]">High-Velocity BPO Contact Centers</h3>
                <p className="text-xs text-[#6b6968] mt-1 leading-relaxed">
                  For contact centers and outbound agencies booking meetings for B2B tech, SaaS, and professional services. Direct dials to VPs and Directors resulting in <strong>35+ qualified demos per line every month</strong>.
                </p>
              </div>

              <div className="space-y-1.5 text-xs text-[#222021] bg-[#F2F0EF] p-3.5 rounded-xl border border-[#222021]/10 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[#6b6968]">Target Demo Output:</span>
                  <strong className="text-emerald-700">35+ sits / rep / mo</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6b6968]">Enrichment Engine:</span>
                  <strong>Proprietary Neural Core</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6b6968]">Rep Ramp Time:</span>
                  <strong className="text-[#ED1C24]">3 Days (TTP Framework)</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6b6968]">Dialer Compatibility:</span>
                  <strong>Aircall, VICIdial, HubSpot</strong>
                </div>
              </div>
            </div>

            {/* Secondary Vertical: High-Ticket Home Services */}
            <div className="p-6 rounded-3xl bg-white border border-[#222021]/10 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  SECONDARY FOCUS (30%)
                </span>
                <span className="text-xs font-mono text-[#6b6968]">Solar &bull; Roofing &bull; HVAC</span>
              </div>

              <div>
                <h3 className="text-lg font-black text-[#222021]">High-Ticket Home Services</h3>
                <p className="text-xs text-[#6b6968] mt-1 leading-relaxed">
                  For residential solar, roofing, and HVAC outbound teams. Reps cannot book an appointment unless all <strong>6 non-negotiable qualifiers</strong> are checked and verified.
                </p>
              </div>

              <div className="bg-[#F2F0EF] p-3.5 rounded-xl border border-[#222021]/10 space-y-1.5 text-[11px] font-mono">
                <span className="text-[10px] font-bold uppercase text-[#6b6968] block mb-1">
                  6 Non-Negotiable Qualifiers Enforced:
                </span>
                <div className="grid grid-cols-2 gap-1 text-[#222021]">
                  <div>&bull; Q1: Power Bill $450+/qtr</div>
                  <div>&bull; Q2: Dual Owners Present</div>
                  <div>&bull; Q3: Age &lt; 65</div>
                  <div>&bull; Q4: 3+ Yrs at Address</div>
                  <div>&bull; Q5: Stable Employment</div>
                  <div>&bull; Q6: Roof Feasibility</div>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
