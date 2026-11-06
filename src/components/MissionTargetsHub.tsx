'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PageHeader, Badge, Card, StatTile, buttonClasses } from '@/components/ui';
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
      badgeColor: 'bg-success-50 text-success-700 border-success-500/40'
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
      badgeColor: 'bg-subtle text-fg border-line'
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
      badgeColor: 'bg-subtle text-fg border-line'
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
      badgeColor: 'bg-danger-50 text-danger-700 border-danger-700/30'
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
      badgeColor: 'bg-warning-50 text-warning-700 border-warning-400/50'
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
      badgeColor: 'bg-success-50 text-success-700 border-success-500/40'
    }
  ];


  return (
    <div className="flex h-full min-h-0 flex-1 w-full bg-app text-fg font-sans overflow-hidden">

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Scrollable Mission & Targets Canvas */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-10 max-w-7xl mx-auto w-full">

          {/* PAGE HEADER: MISSION & CORE POSITIONING */}
          <PageHeader
            className="pb-0"
            title="Fill your seats with high-ticket clients"
            description="Get new reps booking meetings in 3 days, handle objections with confidence and win enterprise contracts."
            secondaryActions={
              <>
                <Link href="/admin" className={buttonClasses('ghost', 'md')}>
                  <ShieldCheck />
                  <span>Admin control</span>
                </Link>
                <Link href="/practice" className={buttonClasses('secondary', 'md')}>
                  <Headphones className="text-fg-secondary" />
                  <span>Practice with AI buyers (10 personas)</span>
                </Link>
              </>
            }
            primaryAction={
              <Link href="/dialer" className={buttonClasses('brand', 'md')}>
                <PhoneCall />
                <span>Start calling</span>
                <ArrowRight />
              </Link>
            }
          />

          {/* KEY OPERATIONAL TARGETS & CONTRACTUAL SLAS */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-h2 text-fg">Performance targets</h2>
                <p className="text-small text-fg-secondary">The benchmarks we commit to in every contract.</p>
              </div>
              <Badge tone="success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Contractual guarantee
              </Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatTile label="Meetings per rep" value="35+" hint="Per rep, per month" />
              <StatTile label="Verified contacts" value="600M+" hint="B2B contact database" />
              <StatTile label="Rep ramp time" value="3 days" hint="Training to live calls" />
              <StatTile label="Lead details load" value="<180ms" hint="Instant on-screen context" />
              <StatTile label="Valid phone lines" value="99.2%" hint="Checked against do-not-call lists" />
              <StatTile label="Calls scored" value="100%" hint="Every call scored automatically" />
            </div>
          </section>

          {/* THE 3-DAY TRAINING-TO-PRODUCTION (TTP) FLOOR SYSTEM */}
          <section className="space-y-4">
            <div>
              <h2 className="text-h2 text-fg">From new hire to live calls in 3 days</h2>
              <p className="text-small text-fg-secondary">
                From day-1 hire to hitting quota on the phone in 72 hours, without account executives stepping in.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="h-7 w-7 rounded-full bg-subtle text-fg-secondary text-caption tabular-nums flex items-center justify-center mb-3">
                    1
                  </div>
                  <h3 className="text-h3 text-fg">Day 1: AI roleplay practice</h3>
                  <p className="text-small text-fg-secondary mt-1.5">
                    New reps spar with realistic, hostile AI customer personas (burned VPs, skeptical directors, gatekeepers). Reps master tone and pacing before ever touching a live prospect.
                  </p>
                </div>
                <div className="pt-3 border-t border-line flex items-center justify-between text-small">
                  <span className="text-fg-secondary">Day 1 benchmark</span>
                  <span className="text-body-strong text-fg tabular-nums">40+ practice calls</span>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="h-7 w-7 rounded-full bg-subtle text-fg-secondary text-caption tabular-nums flex items-center justify-center mb-3">
                    2
                  </div>
                  <h3 className="text-h3 text-fg">Day 2: Lead details on screen</h3>
                  <p className="text-small text-fg-secondary mt-1.5">
                    When a call connects, the prospect&apos;s full history, past notes and account research appear on screen instantly and reliably.
                  </p>
                </div>
                <div className="pt-3 border-t border-line flex items-center justify-between text-small">
                  <span className="text-fg-secondary">Day 2 benchmark</span>
                  <span className="text-body-strong text-fg tabular-nums">Loads in under 180 ms</span>
                </div>
              </Card>

              <Card className="p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="h-7 w-7 rounded-full bg-subtle text-fg-secondary text-caption tabular-nums flex items-center justify-center mb-3">
                    3
                  </div>
                  <h3 className="text-h3 text-fg">Day 3: Live calls with guidance</h3>
                  <p className="text-small text-fg-secondary mt-1.5">
                    Reps dial live prospects with live talking points and objection solutions displayed on screen. 100% of calls are scored automatically with QA analytics.
                  </p>
                </div>
                <div className="pt-3 border-t border-line flex items-center justify-between text-small">
                  <span className="text-fg-secondary">Day 3 benchmark</span>
                  <span className="text-body-strong text-fg tabular-nums">100% of calls scored</span>
                </div>
              </Card>
            </div>
          </section>

          {/* ZERO-EXCUSES ARCHITECTURE (6 DETERMINISTIC GATES) */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-h2 text-fg">No more excuses not to convert</h2>
                <p className="text-small text-fg-secondary">Six safeguards built into the software.</p>
              </div>
              <span className="text-small text-fg-tertiary">6 built-in safeguards</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gates.map((g) => {
                const IconComponent = g.icon;
                const isSelected = selectedGate === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => setSelectedGate(isSelected ? null : g.id)}
                    className={`p-5 rounded-lg border bg-surface transition-colors cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-brand-600 bg-selected shadow-xs'
                        : 'border-line hover:border-line-strong shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-caption text-fg-tertiary">
                          Excuse {g.num} &middot; {g.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-caption text-success-fg">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Solved
                        </span>
                      </div>

                      <p className="text-small italic text-fg-secondary mb-4">
                        {g.excuse}
                      </p>

                      <div className="flex items-start gap-3">
                        <IconComponent className="h-4 w-4 shrink-0 mt-0.5 text-fg-secondary" />
                        <div>
                          <h3 className="text-body-strong text-fg">{g.solutionTitle}</h3>
                          <p className="text-small text-fg-secondary mt-0.5">{g.solutionDesc}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-small">
                      <span className="text-fg-tertiary">Safeguard</span>
                      <span className="text-body-strong text-fg tabular-nums">{g.guardrail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* INTERACTIVE CAPACITY & ROI CALCULATOR */}
          <Card as="section" className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-line pb-4">
              <div>
                <h2 className="text-h2 text-fg">Estimate your outbound return</h2>
                <p className="text-small text-fg-secondary">Adjust the sliders to see projected meetings and revenue.</p>
              </div>
              <Badge tone="success" className="self-start">35+ meetings per rep guaranteed</Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Sliders (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* 1. Dedicated SDR Lines */}
                <div className="p-4 rounded-lg bg-subtle border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-body-strong text-fg">SDR seats</label>
                    <span className="text-body-strong tabular-nums text-fg">
                      {sdrLines} seats ({sdrLines * 35} meetings/mo)
                    </span>
                  </div>
                  <input aria-label="SDR seats"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={sdrLines}
                    onChange={(e) => setSdrLines(Number(e.target.value))}
                    className="w-full accent-brand-600 cursor-pointer focus-ring"
                  />
                  <div className="flex justify-between text-caption tabular-nums text-fg-tertiary">
                    <span>1 seat (35 meetings)</span>
                    <span>5 seats (175 meetings)</span>
                    <span>10 seats (350 meetings)</span>
                  </div>
                </div>

                {/* 2. Average Deal ACV */}
                <div className="p-4 rounded-lg bg-subtle border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-body-strong text-fg">Average deal value per year</label>
                    <span className="text-body-strong tabular-nums text-fg">
                      ${dealAcv.toLocaleString()}
                    </span>
                  </div>
                  <input aria-label="Average deal value per year"
                    type="range"
                    min="2500"
                    max="50000"
                    step="2500"
                    value={dealAcv}
                    onChange={(e) => setDealAcv(Number(e.target.value))}
                    className="w-full accent-brand-600 cursor-pointer focus-ring"
                  />
                  <div className="flex justify-between text-caption tabular-nums text-fg-tertiary">
                    <span>$2,500</span>
                    <span>$25,000</span>
                    <span>$50,000+</span>
                  </div>
                </div>

                {/* 3. Demo to Close Rate */}
                <div className="p-4 rounded-lg bg-subtle border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-body-strong text-fg">Demo-to-close rate</label>
                    <span className="text-body-strong tabular-nums text-fg">
                      {closeRate}%
                    </span>
                  </div>
                  <input aria-label="Demo-to-close rate"
                    type="range"
                    min="10"
                    max="35"
                    step="5"
                    value={closeRate}
                    onChange={(e) => setCloseRate(Number(e.target.value))}
                    className="w-full accent-brand-600 cursor-pointer focus-ring"
                  />
                  <div className="flex justify-between text-caption tabular-nums text-fg-tertiary">
                    <span>10% (conservative)</span>
                    <span>20% (target)</span>
                    <span>35% (top tier)</span>
                  </div>
                </div>
              </div>

              {/* Live Output Card (5 cols) */}
              <div className="lg:col-span-5 rounded-lg bg-surface border border-line p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <h3 className="text-h3 text-fg">Projection</h3>
                  <Badge tone="success">Guaranteed</Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-body text-fg-secondary">Guaranteed qualified meetings</span>
                      <p className="text-small text-fg-tertiary">35+ per seat, per contract</p>
                    </div>
                    <span className="text-kpi tabular-nums text-fg">
                      {guaranteedSits}+ <span className="text-small font-normal text-fg-tertiary">/ mo</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-line pt-3">
                    <span className="text-body text-fg-secondary">Projected closed deals</span>
                    <span className="text-h2 tabular-nums text-fg">
                      ~{projectedDeals} <span className="text-small font-normal text-fg-tertiary">deals/mo</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-line pt-3">
                    <div>
                      <span className="text-body text-fg-secondary">Projected pipeline revenue</span>
                      <p className="text-small text-fg-tertiary">Based on ${dealAcv.toLocaleString()} average deal value</p>
                    </div>
                    <span className="text-kpi tabular-nums text-success-fg">
                      ${pipelineRevenue.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-md bg-subtle flex items-center justify-between">
                    <span className="text-body-strong text-fg">Estimated return</span>
                    <span className="text-h2 tabular-nums text-fg">
                      {netRoi}x <span className="text-small font-normal text-fg-tertiary">ROI</span>
                    </span>
                  </div>

                  <p className="text-small text-fg-secondary">
                    Savings vs. hiring in-house SDRs: <strong className="text-body-strong text-fg tabular-nums">${inHouseSavings.toLocaleString()}/mo</strong>
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* TWO HIGH-PERFORMANCE VERTICALS & PRODUCT TIERS */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Primary Vertical: BPO Contact Centers */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">Primary focus (70%)</span>
                <span className="text-small text-fg-tertiary">High-volume floors</span>
              </div>

              <div>
                <h3 className="text-h3 text-fg">BPO contact centers</h3>
                <p className="text-small text-fg-secondary mt-1">
                  For contact centers and outbound agencies booking meetings for B2B tech, SaaS, and professional services. Direct dials to VPs and Directors resulting in <strong className="text-fg">35+ qualified demos per line every month</strong>.
                </p>
              </div>

              <dl className="divide-y divide-line rounded-md border border-line text-small">
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-fg-secondary">Meetings per rep</dt>
                  <dd className="text-body-strong text-fg tabular-nums">35+ sits / rep / mo</dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-fg-secondary">Lead research</dt>
                  <dd className="text-body-strong text-fg">Proprietary Neural Core</dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-fg-secondary">Rep ramp time</dt>
                  <dd className="text-body-strong text-fg">3 days</dd>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-fg-secondary">Works with</dt>
                  <dd className="text-body-strong text-fg">Aircall, VICIdial, HubSpot</dd>
                </div>
              </dl>
            </Card>

            {/* Secondary Vertical: High-Ticket Home Services */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-caption text-fg-tertiary">Secondary focus (30%)</span>
                <span className="text-small text-fg-tertiary">Solar, roofing, HVAC</span>
              </div>

              <div>
                <h3 className="text-h3 text-fg">High-ticket home services</h3>
                <p className="text-small text-fg-secondary mt-1">
                  For residential solar, roofing, and HVAC outbound teams. Reps cannot book an appointment unless all <strong className="text-fg">6 non-negotiable qualifiers</strong> are checked and verified.
                </p>
              </div>

              <div className="rounded-md border border-line p-3 space-y-2">
                <span className="text-caption text-fg-tertiary block">
                  6 required qualifiers
                </span>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-small text-fg">
                  <li>Q1: Power Bill $450+/qtr</li>
                  <li>Q2: Dual Owners Present</li>
                  <li>Q3: Age &lt; 65</li>
                  <li>Q4: 3+ Yrs at Address</li>
                  <li>Q5: Stable Employment</li>
                  <li>Q6: Roof Feasibility</li>
                </ul>
              </div>
            </Card>
          </section>

        </main>
      </div>
    </div>
  );
}
