'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  BookOpen, 
  Target, 
  Swords, 
  Headphones, 
  Radio, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  PhoneCall, 
  Sparkles, 
  Clock, 
  Zap, 
  ExternalLink, 
  ChevronRight,
  Layers,
  FileText,
  Search,
  Eye,
  Key
} from 'lucide-react';

export default function UserGuideHub() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [searchFilter, setSearchFilter] = useState('');

  const guideSteps = [
    {
      step: 1,
      title: 'Mission & Targets Hub',
      route: '/',
      tag: 'ABOUT & SLAS',
      summary: 'Understand core company positioning, 35+ qualified sits contractual guarantee, the 3-Day TTP ramp framework, and the Outbound ROI calculator.',
      image: '/guide/step1-mission.png',
      caption: 'The Mission & Targets Hub displaying SLAs, 600M+ data lake, and interactive ROI model.',
      highlights: [
        'Contractual 35+ Qualified Sits: Review the monthly guarantee per dedicated SDR line.',
        '3-Day TTP System: Day 1 AI Sparring (40+ drills), Day 2 Context Feed (<180ms latency), Day 3 Live Guidance.',
        'Zero-Excuses Architecture: Review the 6 software gates preventing lost deals.',
        'Interactive Outbound ROI Simulator: Test capacity, closed deals, and pipeline revenue projections.'
      ],
      proTip: 'Show this page to prospective BPO enterprise clients to prove your floor follows deterministic software gates.'
    },
    {
      step: 2,
      title: 'AI Boris Calling Cockpit & 1-Click Dialer',
      route: '/cockpit',
      tag: 'LIVE TELEPROMPTER',
      summary: 'Front-line calling teleprompter with automatic prospect variable injection, 1-click dialer auto-launch, pattern interrupt, and shared-lead diagnostic engine.',
      image: '/guide/step2-cockpit.png',
      caption: 'Lead Identity card with 1-click dialer and real-time prospect intel.',
      highlights: [
        '1-Click Click-to-Call: Click the emerald "Click to Call" button below the phone number to immediately trigger your default dialer (Dialpad, Teams, RingCentral, Phone Link, Softphone).',
        'Screen 1 (Role Verification): Confirm prospect active status (Still in Role, Promoted, Left Company).',
        'Screen 2 (Directory Anchor): Pattern interrupt on Outsource Accelerator awareness.',
        'Screen 3 (Shared-Lead Trap): Expose the hidden cost of competing against 3-5 BPOs on identical leads.',
        'Screen 4 (Diagnostic Engine): Click target services (A to E) to dynamically generate tailored value cards.'
      ],
      proTip: 'Never break conversational pacing. Click any service tag on Screen 4 to instantly load the exact talk track.'
    },
    {
      step: 3,
      title: 'Calendar Bypass & Setting Expectations Closing',
      route: '/cockpit',
      tag: 'CALENDAR & CLOSE',
      summary: 'Direct Calendly screen share scheduling with an instant "Bypass Calendar" continue button to prevent call dead air, followed by Screen 6 zero-prep closing tracks.',
      image: '/guide/step3-closing.png',
      caption: 'Screen 6 setting expectations, zero-prep guarantee, and auto-updating CRM call notes.',
      highlights: [
        'Bypass Calendar Button: If a prospect verbally agrees to a slot, click "⚡ Continue to Setting Expectations & Closing" without waiting on the Calendly iframe form.',
        'Line 1 (Screen Share Demo): Explain that Founder Emil will share screen to show Claude AI building their private list and run a 2-minute sparring simulation.',
        'Line 2 (Zero Prep Guarantee): Clarify that Emil already pulls their company profile and competitor pricing in advance—zero preparation needed.',
        'Line 3 (Attendance & Mobile Check): Check if they will be at their laptop/desk and verify direct cell for a 10-minute heads-up SMS.',
        'Auto-Updating CRM Notes: Every button click auto-formats ready-to-paste CRM text in the right panel.'
      ],
      proTip: 'Click "Lock Meeting Booked & Copy CRM Notes" to automatically sync disposition and copy notes to your clipboard.'
    },
    {
      step: 4,
      title: 'AI Voice Sparring Arena (10 Personas)',
      route: '/sparring',
      tag: 'AI VOICE DOJO',
      summary: 'Practice unscripted acoustic objection handling against 10 realistic buyer personas before ever calling live accounts.',
      image: '/guide/step4-sparring.png',
      caption: 'Sparring Arena with 10 buyer personas, difficulty tiers, and real-time audio chat.',
      highlights: [
        '10 Diverse Buyer Personas: Spar with Julian Vance (BPO Directory Buyer), David M. (VP Sales), Sarah K. (BPO Agency), and hostile gatekeepers.',
        'Realistic Pushback: The AI detects tonal hesitation, pricing arguments, and directory fatigue in real time.',
        'ARM Script Assist: Live sub-600ms battlecard recommendations render on-screen as you speak.',
        'Automated Scoring: Receive instant feedback on tonality, acknowledgment, and closing commitment.'
      ],
      proTip: 'Complete at least 40 sparring runs on Day 1 to achieve muscle memory on handling the shared-lead objection.'
    },
    {
      step: 5,
      title: 'Live Monitoring (Floor Supervisor Hub)',
      route: '/monitoring',
      tag: 'SUPERVISOR AUDIO',
      summary: 'Supervisors and QA managers can listen in real time to ongoing AI sparring training sessions across all logged-in sales reps.',
      image: '/guide/step1-mission.png',
      caption: 'Live Monitoring dashboard showing online reps, active sparring sessions, and live audio waveform.',
      highlights: [
        'Active Reps Floor Grid: View all reps logged into the floor, current training status, and active duration.',
        'Live Audio Stream: Click "🎧 Listen Live" on any ongoing session to stream the rep vs. AI conversation.',
        'Real-Time Transcript: Read rolling text dialogues with color-coded objection tags and sentiment indicators.',
        'Whisper / Coach Mode: Inject instant tactical tips into the rep’s cockpit without disrupting the call.'
      ],
      proTip: 'Filter by "Active Audio Calls" to focus coaching on reps currently sparring with high-difficulty personas.'
    },
    {
      step: 6,
      title: 'Admin Control & Multi-Tenant Management',
      route: '/admin',
      tag: 'ADMIN & PROVISIONING',
      summary: 'Centralized control center for managing client BPO tenants, allocating SDR seats, toggling module permissions, and shadowing workspaces.',
      image: '/guide/step5-admin.png',
      caption: 'Admin Control showing active BPO tenants, seat allocations, and Admin Shadow Mode banner.',
      highlights: [
        'Tenants & Client Access: View all provisioned client BPOs (Apex Global BPO, Outsource Accelerator partners, etc.).',
        'Module Entitlement Toggles: 1-click toggle access for Boris Cockpit, AI Sparring, Certification Exam Gate, and Leads CRM.',
        'Admin Shadow Mode (Impersonate): Click "👁️ Impersonate" to safely view any client workspace in shadow mode.',
        'Provision Tenant Wizard: Onboard new BPOs with seat caps, plan tiers, and telephony gateway choices.'
      ],
      proTip: 'Use Admin Shadow Mode to verify a new client’s custom campaign playbooks without needing their credentials.'
    }
  ];

  const currentGuide = guideSteps.find(g => g.step === activeStep) || guideSteps[0];

  return (
    <div className="flex h-full min-h-0 flex-1 w-full bg-zinc-50/70 text-zinc-900 font-sans overflow-hidden">

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Scrollable Guide View */}
        <main className="flex-1 overflow-y-auto px-6 lg:px-12 py-8 space-y-6 max-w-7xl mx-auto w-full">
          
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                PLATFORM DOCUMENTATION
              </span>
              <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">
                User Guide & Platform Manual
              </h1>
              <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
                Step-by-step operating workflows. Master front-line calling, AI sparring, supervisor live monitoring, and admin tenant controls.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/dialer"
                className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Swords className="h-3.5 w-3.5" />
                <span>Open Cockpit</span>
              </Link>
              <Link
                href="/live-floor"
                className="px-3.5 py-2 rounded-lg bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 font-medium text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Radio className="h-3.5 w-3.5 text-zinc-600" />
                <span>Live Monitoring</span>
              </Link>
            </div>
          </div>

          {/* Sequential Step Selector Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {guideSteps.map((step) => {
              const isCurrent = activeStep === step.step;
              return (
                <button
                  key={step.step}
                  onClick={() => setActiveStep(step.step)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 text-zinc-900 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      isCurrent ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      0{step.step}
                    </span>
                    <span className="text-[10px] font-mono uppercase truncate ml-1 text-zinc-400">
                      {step.tag}
                    </span>
                  </div>
                  <h4 className={`text-xs font-semibold leading-snug line-clamp-2 ${
                    isCurrent ? 'text-white' : 'text-zinc-900'
                  }`}>
                    {step.title}
                  </h4>
                </button>
              );
            })}
          </div>

          {/* ACTIVE STEP CARD: DEEP DIVE & SCREENSHOT */}
          <div className="bg-white border border-[#222021]/10 rounded-3xl p-6 sm:p-8 shadow-2xs space-y-6">
            
            {/* Step Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222021]/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#ED1C24] text-white">
                    STEP 0{currentGuide.step} OF 06
                  </span>
                  <span className="text-xs font-mono text-[#6b6968] uppercase font-bold">
                    ROUTE: {currentGuide.route}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-[#222021] tracking-tight mt-1.5">
                  {currentGuide.title}
                </h2>
                <p className="text-xs text-[#6b6968] mt-1 leading-relaxed max-w-3xl">
                  {currentGuide.summary}
                </p>
              </div>

              <Link
                href={currentGuide.route}
                className="px-5 py-2.5 rounded-xl bg-[#222021] hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors shrink-0 cursor-pointer self-start sm:self-auto"
              >
                <span>Launch This Feature</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Main Content Grid: Left Highlights, Right Screenshot */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Key Action Checklist & Pro-Tip (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                <div className="space-y-3">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#ED1C24] block">
                    HOW TO NAVIGATE THIS STEP:
                  </span>
                  <div className="space-y-2.5">
                    {currentGuide.highlights.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-[#222021] leading-relaxed p-2.5 rounded-xl bg-[#F2F0EF]/80 border border-[#222021]/5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pro Tip Callout Box */}
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 space-y-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                    <span>💡</span>
                    <span>PRO TIP FOR BDRS & MANAGERS</span>
                  </span>
                  <p className="text-xs text-amber-950 font-medium leading-relaxed">
                    {currentGuide.proTip}
                  </p>
                </div>

                {/* Navigation Next/Prev Buttons */}
                <div className="pt-2 flex items-center gap-3">
                  {currentGuide.step > 1 && (
                    <button
                      onClick={() => setActiveStep(currentGuide.step - 1)}
                      className="px-4 py-2 rounded-xl bg-[#F2F0EF] hover:bg-[#e7e4e2] text-[#222021] text-xs font-bold transition-colors cursor-pointer"
                    >
                      &larr; Prev Step
                    </button>
                  )}
                  {currentGuide.step < 6 && (
                    <button
                      onClick={() => setActiveStep(currentGuide.step + 1)}
                      className="px-4 py-2 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      Next Step &rarr;
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Actual Application Screenshot (7 cols) */}
              <div className="lg:col-span-7 space-y-2">
                <div className="rounded-2xl border border-[#222021]/15 overflow-hidden shadow-lg bg-stone-950">
                  {/* Browser Mockup Header */}
                  <div className="px-4 py-2.5 bg-stone-900 border-b border-stone-800 flex items-center justify-between text-xs text-stone-400 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2 text-stone-300">Appointmentlyy SDR Live Interface</span>
                    </div>
                    <span>http://localhost:3000{currentGuide.route}</span>
                  </div>

                  {/* Screenshot Image */}
                  <div className="relative group">
                    <img 
                      src={currentGuide.image} 
                      alt={currentGuide.title}
                      className="w-full h-auto object-cover max-h-[460px] border-b border-stone-800"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="bg-white text-stone-950 px-3 py-1.5 rounded-xl font-bold text-xs shadow-lg">
                        Verified Production Interface
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] font-mono text-[#6b6968] text-center">
                  Figure 0{currentGuide.step}: {currentGuide.caption}
                </p>
              </div>

            </div>
          </div>

          {/* Quick FAQ / Reference Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-[#ED1C24] block">
                KEYBOARD SHORTCUTS
              </span>
              <h4 className="text-xs font-bold text-[#222021]">Instant Rebuttals</h4>
              <p className="text-xs text-[#6b6968] leading-relaxed">
                Press <kbd className="px-1.5 py-0.5 bg-[#F2F0EF] border border-[#222021]/15 rounded font-mono text-[11px] text-[#222021]">R</kbd> anytime inside the calling cockpit to immediately toggle the 11-battlecard ARM rebuttal drawer without lifting your hands from the keyboard.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-blue-600 block">
                TELEPHONY PROTOCOL
              </span>
              <h4 className="text-xs font-bold text-[#222021]">Click-to-Call Handshake</h4>
              <p className="text-xs text-[#6b6968] leading-relaxed">
                Clicking the emerald phone button triggers the system <code className="font-mono text-stone-900 bg-[#F2F0EF] px-1 rounded">tel:</code> protocol, instantly bridging the lead's direct number to your configured dialer app.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-[#222021]/10 shadow-2xs space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-emerald-600 block">
                SUPERVISOR COACHING
              </span>
              <h4 className="text-xs font-bold text-[#222021]">Live Sparring Audio</h4>
              <p className="text-xs text-[#6b6968] leading-relaxed">
                Supervisors can open <strong className="text-[#222021]">Live Monitoring</strong> to listen in real time to reps practicing with AI buyer personas, viewing sentiment and audio waveforms live.
              </p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
