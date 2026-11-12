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
  Key,
  ArrowLeft,
  Lightbulb,
  Keyboard
} from 'lucide-react';
import { Button, PageHeader, buttonClasses } from '@/components/ui';

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
        'Screen 2 (Lead Source Check): Pattern interrupt on where their leads come from and how many actually connect.',
        'Screen 3 (Lead Quality & Pipeline Check): Expose the hidden cost of stale contact data, wasted dials and a thin, unpredictable pipeline.',
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
        'Tenants & Client Access: View all provisioned client BPOs (Apex Global BPO, Harbor Point BPO, etc.).',
        'Module Entitlement Toggles: 1-click toggle access for Boris Cockpit, AI Sparring, Certification Exam Gate, and Leads CRM.',
        'Admin Shadow Mode (Impersonate): Click "👁️ Impersonate" to safely view any client workspace in shadow mode.',
        'Provision Tenant Wizard: Onboard new BPOs with seat caps, plan tiers, and telephony gateway choices.'
      ],
      proTip: 'Use Admin Shadow Mode to verify a new client’s custom campaign playbooks without needing their credentials.'
    }
  ];

  const currentGuide = guideSteps.find(g => g.step === activeStep) || guideSteps[0];

  return (
    <div className="flex h-full min-h-0 flex-1 w-full bg-app text-fg font-sans overflow-hidden">

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Scrollable Guide View */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 max-w-7xl mx-auto w-full">

          {/* Page header */}
          <PageHeader
            className="pb-0"
            title="Help center"
            description="Step-by-step guides for calling, AI practice, live monitoring and admin controls."
            secondaryActions={
              <>
                <Link href="/live-floor" className={buttonClasses('secondary', 'md')}>
                  <Radio aria-hidden />
                  <span>Live monitoring</span>
                </Link>
                <Link href="/dialer" className={buttonClasses('primary', 'md')}>
                  <Swords aria-hidden />
                  <span>Open dialer</span>
                </Link>
              </>
            }
          />

          {/* Sequential Step Selector Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {guideSteps.map((step) => {
              const isCurrent = activeStep === step.step;
              return (
                <button
                  key={step.step}
                  onClick={() => setActiveStep(step.step)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`focus-ring p-3 rounded-lg border text-left transition-colors duration-150 cursor-pointer flex flex-col gap-2 shadow-xs ${
                    isCurrent
                      ? 'bg-selected border-brand-600'
                      : 'bg-surface border-line hover:bg-subtle'
                  }`}
                >
                  <span className={`text-caption tabular-nums ${isCurrent ? 'text-brand-text' : 'text-fg-tertiary'}`}>
                    Step {step.step}
                  </span>
                  <span className="text-body-strong text-fg leading-snug line-clamp-2">
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active step card */}
          <div className="bg-surface border border-line rounded-lg p-6 shadow-xs space-y-6">

            {/* Step Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-line pb-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-caption text-fg-tertiary">
                  <span className="tabular-nums">Step {currentGuide.step} of 6</span>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{currentGuide.route}</span>
                </div>
                <h2 className="text-h2 text-fg mt-1">
                  {currentGuide.title}
                </h2>
                <p className="text-body text-fg-secondary mt-1 max-w-3xl">
                  {currentGuide.summary}
                </p>
              </div>

              <Link
                href={currentGuide.route}
                className={buttonClasses('primary', 'md', 'self-start')}
              >
                <span>Open this feature</span>
                <ArrowRight aria-hidden />
              </Link>
            </div>

            {/* Main Content Grid: Left Highlights, Right Screenshot */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

              {/* Left Column: Key Action Checklist & Pro-Tip (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                <div className="space-y-3">
                  <h3 className="text-h3 text-fg">How to use this step</h3>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {currentGuide.highlights.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 px-3 py-2.5 text-body text-fg">
                        <CheckCircle2 className="size-4 text-success-fg shrink-0 mt-0.5" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pro Tip Callout Box */}
                <div className="flex items-start gap-3 rounded-lg border border-line bg-subtle p-4">
                  <Lightbulb className="size-4 text-fg-secondary shrink-0 mt-0.5" aria-hidden />
                  <div className="space-y-1">
                    <p className="text-body-strong text-fg">Tip for reps and managers</p>
                    <p className="text-body text-fg-secondary">
                      {currentGuide.proTip}
                    </p>
                  </div>
                </div>

                {/* Navigation Next/Prev Buttons */}
                <div className="pt-1 flex items-center gap-2">
                  {currentGuide.step > 1 && (
                    <Button
                      variant="secondary"
                      onClick={() => setActiveStep(currentGuide.step - 1)}
                      icon={<ArrowLeft aria-hidden />}
                    >
                      Previous step
                    </Button>
                  )}
                  {currentGuide.step < 6 && (
                    <Button
                      variant="brand"
                      onClick={() => setActiveStep(currentGuide.step + 1)}
                    >
                      Next step
                      <ArrowRight aria-hidden />
                    </Button>
                  )}
                </div>
              </div>

              {/* Right Column: Actual Application Screenshot (7 cols) */}
              <figure className="lg:col-span-7 space-y-2">
                <div className="rounded-lg border border-line overflow-hidden bg-subtle">
                  {/* Browser Mockup Header */}
                  <div className="px-3 py-2 bg-surface border-b border-line flex items-center justify-between gap-3 text-caption text-fg-tertiary">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full bg-line-strong" />
                      <span className="size-2.5 rounded-full bg-line-strong" />
                      <span className="size-2.5 rounded-full bg-line-strong" />
                      <span className="ml-2">Appointmentlyy SDR</span>
                    </div>
                    <span className="font-mono truncate">http://localhost:3000{currentGuide.route}</span>
                  </div>

                  {/* Screenshot Image */}
                  <div className="relative group">
                    <img
                      src={currentGuide.image}
                      alt={currentGuide.title}
                      className="w-full h-auto object-cover max-h-[460px]"
                    />
                    <div className="absolute inset-0 bg-ink-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="bg-surface text-fg px-3 py-1.5 rounded-md text-small font-medium shadow-md">
                        Verified production interface
                      </span>
                    </div>
                  </div>
                </div>

                <figcaption className="text-small text-fg-tertiary text-center">
                  Figure {currentGuide.step}: {currentGuide.caption}
                </figcaption>
              </figure>

            </div>
          </div>

          {/* Quick FAQ / Reference Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-lg bg-surface border border-line shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <Keyboard className="size-4 text-fg-secondary" aria-hidden />
                <h4 className="text-h3 text-fg">Instant rebuttals</h4>
              </div>
              <p className="text-body text-fg-secondary">
                Press <kbd className="px-1.5 py-0.5 bg-subtle border border-line rounded-sm font-mono text-caption text-fg">R</kbd> anytime inside the calling cockpit to immediately toggle the 11-battlecard ARM rebuttal drawer without lifting your hands from the keyboard.
              </p>
            </div>

            <div className="p-5 rounded-lg bg-surface border border-line shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <PhoneCall className="size-4 text-fg-secondary" aria-hidden />
                <h4 className="text-h3 text-fg">Click to call</h4>
              </div>
              <p className="text-body text-fg-secondary">
                Clicking the emerald phone button triggers the system <code className="font-mono text-fg bg-subtle px-1 rounded-sm">tel:</code> protocol, instantly bridging the lead&apos;s direct number to your configured dialer app.
              </p>
            </div>

            <div className="p-5 rounded-lg bg-surface border border-line shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <Headphones className="size-4 text-fg-secondary" aria-hidden />
                <h4 className="text-h3 text-fg">Live practice audio</h4>
              </div>
              <p className="text-body text-fg-secondary">
                Supervisors can open <strong className="font-medium text-fg">Live Monitoring</strong> to listen in real time to reps practicing with AI buyer personas, viewing sentiment and audio waveforms live.
              </p>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
