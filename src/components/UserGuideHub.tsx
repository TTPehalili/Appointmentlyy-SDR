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
import { MyReports } from '@/components/support/MyReports';
import { HELP_GUIDE_STEPS } from '@/lib/helpContent';

export default function UserGuideHub() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [searchFilter, setSearchFilter] = useState('');

  const guideSteps = HELP_GUIDE_STEPS;

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

          {/* Report a problem + the person's own reports and the conversation with support. */}
          <MyReports />

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
                      ? 'bg-selected-soft border-selected ring-1 ring-selected'
                      : 'bg-surface border-line hover:bg-subtle'
                  }`}
                >
                  <span className={`text-caption tabular-nums ${isCurrent ? 'text-selected-soft-fg' : 'text-fg-tertiary'}`}>
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
