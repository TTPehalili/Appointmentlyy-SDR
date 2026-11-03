'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Radar,
  Search,
  Building2,
  DollarSign,
  Briefcase,
  Globe,
  MapPin,
  ExternalLink,
  Sparkles,
  Phone,
  Mail,
  UserCheck,
  CheckCircle2,
  Filter,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  Send,
  Zap,
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import {
  JobSignalRecord,
  JobSignalCategory,
  JobSignalCountry,
} from '@/lib/jobRadarStore';
import { INITIAL_CURATED_JOB_SIGNALS } from '@/lib/curatedJobSignals';
import { getStoredContacts, saveStoredContacts, ContactRecord } from '@/lib/leadStore';

export default function JobRadarManager() {
  const [country, setCountry] = useState<JobSignalCountry>('ALL');
  const [category, setCategory] = useState<JobSignalCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [signals, setSignals] = useState<JobSignalRecord[]>(INITIAL_CURATED_JOB_SIGNALS);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSignal, setActiveSignal] = useState<JobSignalRecord | null>(null);
  const [pushedLeadIds, setPushedLeadIds] = useState<Set<string>>(new Set());
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<string>('Live Radar Ready');

  const fetchJobSignals = async (forceGemini: boolean = false) => {
    setIsLoading(true);
    setGeminiStatus(forceGemini ? 'Gemini AI Crawling Live Remote Job Posts...' : 'Filtering Signals...');
    try {
      const res = await fetch('/api/admin/job-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          category,
          searchQuery,
          forceFreshGemini: forceGemini,
        }),
      });
      const data = await res.json();
      if (data?.signals) {
        setSignals(data.signals);
        if (data.geminiLiveActive) {
          setGeminiStatus(`Gemini extracted ${data.totalCount} active job signals`);
        } else {
          setGeminiStatus(`Loaded ${data.totalCount} high-yield target signals`);
        }
      }
    } catch (err) {
      console.warn('[JobRadar] Fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobSignals(false);
  }, [country, category]);

  const handlePushToCallingFloor = (signal: JobSignalRecord) => {
    try {
      const existing = getStoredContacts();
      const newLead: ContactRecord = {
        id: `job_lead_${Date.now()}`,
        name: signal.decisionMaker.name,
        company: signal.companyName,
        title: signal.decisionMaker.title,
        department: 'Sales & Executive Leadership',
        email: signal.decisionMaker.email || `contact@${signal.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`,
        phone: signal.decisionMaker.phone || '+1 (555) 019-2831',
        headcount: '25-150 seats',
        website: signal.website,
        linkedinUrl: signal.decisionMaker.linkedinUrl,
        assignedRep: 'Emil Halili',
        tenantId: 'APPOINTMENTLYY',
        folderId: 'folder_job_signals',
        folderName: `Target Hires: ${signal.categoryLabel}`,
        industry: signal.country === 'AU' ? 'Australian B2B' : 'US Tech & B2B Services',
        location: signal.location,
        status: 'New Lead',
        dealValue: signal.country === 'AU' ? 8500 : 9500,
        cadenceDay: 1,
        touchNumber: 0,
        leadNotes: `Hiring Signal: Actively recruiting for ${signal.jobTitle}. Stated Budget: ${signal.budgetRange.baseSalary} (${signal.budgetRange.contractType}). Source: ${signal.sourcePlatform}. Why they need us: ${signal.whyTheyNeedUs}`,
        footprint: [
          {
            id: `fp_${Date.now()}`,
            timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            isoDate: new Date().toISOString(),
            type: 'status',
            title: 'Hiring Signal Captured via Super Admin Job Radar',
            summary: `Company has open active budget for ${signal.jobTitle}. Budget: ${signal.budgetRange.baseSalary}. Identified hiring authority: ${signal.decisionMaker.name} (${signal.decisionMaker.title}).`,
            repName: 'Emil Halili',
          },
        ],
      };

      saveStoredContacts([newLead, ...existing]);
      setPushedLeadIds((prev) => new Set(prev).add(signal.id));
      setActionToast(`Pushed "${signal.companyName}" directly to Calling Floor (/cockpit) as a Qualified Lead.`);
      setTimeout(() => setActionToast(null), 4000);
    } catch (err) {
      console.warn('[JobRadar] Failed to push lead:', err);
    }
  };

  const filteredSignals = useMemo(() => {
    if (!searchQuery.trim()) return signals;
    const q = searchQuery.toLowerCase().trim();
    return signals.filter(
      (s) =>
        s.companyName.toLowerCase().includes(q) ||
        s.jobTitle.toLowerCase().includes(q) ||
        s.jobSummary.toLowerCase().includes(q) ||
        s.techStack.some((t) => t.toLowerCase().includes(q)) ||
        s.decisionMaker.name.toLowerCase().includes(q)
    );
  }, [signals, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Tool Overview & Super Admin Exclusivity */}
      <div className="bg-zinc-950 text-white rounded-2xl p-6 border border-zinc-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Gemini Live Job Signal Radar
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                Super Admin Exclusive (Emil Halili)
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>USA &amp; Australia Active Hiring Intelligence</span>
            </h2>
            <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
              Crawl live remote job postings for companies hiring <strong>B2B Appointment Setters</strong>, <strong>AI Automation Specialists</strong>, and <strong>AI Sales Enablement Tool Builders</strong>. Extracts verified budget ranges, hiring authority contact information, and allows 1-click lead dispatch directly into your Calling Floor.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fetchJobSignals(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Scanning Postings...' : 'Run Fresh Gemini Live Search'}</span>
            </button>
          </div>
        </div>

        {/* Live Filter Bar */}
        <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Country Selector */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setCountry('ALL')}
                className={`px-3 py-1 rounded-lg transition ${
                  country === 'ALL' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🌍 All Remote (US + AU)
              </button>
              <button
                type="button"
                onClick={() => setCountry('US')}
                className={`px-3 py-1 rounded-lg transition ${
                  country === 'US' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🇺🇸 USA Remote Only
              </button>
              <button
                type="button"
                onClick={() => setCountry('AU')}
                className={`px-3 py-1 rounded-lg transition ${
                  country === 'AU' ? 'bg-zinc-800 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🇦🇺 Australia Remote Only
              </button>
            </div>

            {/* Category Dropdown */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  category === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All 3 Roles
              </button>
              <button
                type="button"
                onClick={() => setCategory('b2b_appointment_setter')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  category === 'b2b_appointment_setter' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🎯 B2B Setters
              </button>
              <button
                type="button"
                onClick={() => setCategory('ai_automation_specialist')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  category === 'ai_automation_specialist' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ⚙️ AI Automation
              </button>
              <button
                type="button"
                onClick={() => setCategory('ai_sales_enablement')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  category === 'ai_sales_enablement' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🛠️ AI Sales Enablement
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>{geminiStatus}</span>
          </div>
        </div>
      </div>

      {actionToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionToast}</span>
          </div>
          <Link
            href="/cockpit"
            className="text-xs text-emerald-700 underline font-bold hover:text-emerald-900"
          >
            Open Calling Floor &rarr;
          </Link>
        </div>
      )}

      {/* Main Results Grid / Table */}
      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs">
        {/* Search header */}
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by company, tech stack (Apollo, Make.com, HubSpot), or keyword..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
            />
          </div>

          <div className="text-xs text-zinc-500 font-mono">
            Showing <strong className="text-zinc-950 font-bold">{filteredSignals.length}</strong> active target hiring signals
          </div>
        </div>

        {/* Signals List */}
        <div className="divide-y divide-zinc-100">
          {filteredSignals.map((sig) => {
            const isPushed = pushedLeadIds.has(sig.id);
            return (
              <div
                key={sig.id}
                className="p-5 hover:bg-zinc-50/70 transition-colors space-y-3.5 group"
              >
                {/* Header row: Company, Category, Country, Source, and Stated Budget */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-zinc-950">{sig.companyName}</span>
                      <a
                        href={sig.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-900 underline underline-offset-2"
                      >
                        <span>{sig.website.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-100 text-zinc-700">
                        {sig.country === 'US' ? '🇺🇸 USA' : '🇦🇺 AU'} • {sig.workType}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {sig.categoryLabel}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-zinc-800">{sig.jobTitle}</h3>
                    <p className="text-xs text-zinc-500 max-w-3xl leading-relaxed">{sig.jobSummary}</p>
                  </div>

                  {/* Budget Highlight Card */}
                  <div className="bg-zinc-950 text-white rounded-xl p-3 shrink-0 sm:text-right min-w-[240px] space-y-1">
                    <div className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold flex items-center justify-between sm:justify-end gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Stated Budget / Comp</span>
                    </div>
                    <div className="text-base font-black tracking-tight text-white font-mono">
                      {sig.budgetRange.baseSalary}
                    </div>
                    {sig.budgetRange.oteOrBonus && (
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {sig.budgetRange.oteOrBonus}
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-500 font-mono">
                      {sig.budgetRange.contractType} • {sig.budgetRange.confidence}
                    </div>
                  </div>
                </div>

                {/* Mid row: Tech Stack & Why They Need Us */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-zinc-50/80 border border-zinc-200/80 rounded-xl p-3">
                  <div>
                    <div className="font-semibold text-zinc-700 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3 h-3 text-zinc-500" />
                      <span>Tech Stack Disclosed</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sig.techStack.map((tech) => (
                        <span
                          key={tech}
                          className="px-2 py-0.5 bg-white border border-zinc-200 text-zinc-700 rounded text-[10px] font-mono"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold text-zinc-700 text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span>Appointmentlyy Arbitrage Pitch</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 leading-normal">{sig.whyTheyNeedUs}</p>
                  </div>
                </div>

                {/* Bottom row: Best Decision-Maker to Reach & 1-Click Action */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {sig.decisionMaker.name.charAt(0)}
                    </div>
                    <div className="text-xs">
                      <div className="flex items-center gap-2">
                        <strong className="text-zinc-950 font-bold">{sig.decisionMaker.name}</strong>
                        <a
                          href={sig.decisionMaker.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-500 hover:text-zinc-900 p-0.5"
                          title="View LinkedIn Profile"
                        >
                          <LinkedinIcon className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-[11px] text-zinc-500">{sig.decisionMaker.title}</div>
                    </div>

                    <div className="hidden md:flex items-center gap-3 border-l border-zinc-200 pl-3 text-[11px] font-mono text-zinc-600">
                      {sig.decisionMaker.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-zinc-400" />
                          <span>{sig.decisionMaker.phone}</span>
                        </span>
                      )}
                      {sig.decisionMaker.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-zinc-400" />
                          <span>{sig.decisionMaker.email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isPushed}
                      onClick={() => handlePushToCallingFloor(sig)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs ${
                        isPushed
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-default'
                          : 'bg-zinc-950 hover:bg-zinc-800 text-white'
                      }`}
                    >
                      {isPushed ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Pushed to Calling Floor</span>
                        </>
                      ) : (
                        <>
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Push Lead to Calling Floor (/cockpit)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

