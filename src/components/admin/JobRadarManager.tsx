'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Phone, Mail, CheckCircle2, RefreshCw, SlidersHorizontal, Zap } from 'lucide-react';
import { Avatar, Button, Card, PageHeader, SearchInput, SegmentedControl, StatusDot } from '@/components/ui';
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
      <PageHeader
        title="Job signals radar"
        description="US and Australian companies hiring setters and AI roles, with budget and hiring contact."
        secondaryActions={
          <span className="text-small text-fg-tertiary">Super Admin only</span>
        }
        primaryAction={
          <Button
            variant="brand"
            onClick={() => fetchJobSignals(true)}
            disabled={isLoading}
            icon={<RefreshCw className={isLoading ? 'animate-spin' : ''} />}
          >
            {isLoading ? 'Scanning postings...' : 'Run live search'}
          </Button>
        }
      />

      {/* Live Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Country Selector */}
          <SegmentedControl
            label="Country"
            size="sm"
            value={country}
            onChange={(v) => setCountry(v as JobSignalCountry)}
            items={[
              { value: 'ALL', label: 'All remote (US + AU)' },
              { value: 'US', label: 'USA remote' },
              { value: 'AU', label: 'Australia remote' },
            ]}
          />

          {/* Category Dropdown */}
          <SegmentedControl
            label="Role"
            size="sm"
            value={category}
            onChange={(v) => setCategory(v as JobSignalCategory | 'all')}
            items={[
              { value: 'all', label: 'All 3 roles' },
              { value: 'b2b_appointment_setter', label: 'B2B setters' },
              { value: 'ai_automation_specialist', label: 'AI automation' },
              { value: 'ai_sales_enablement', label: 'AI sales enablement' },
            ]}
          />
        </div>

        <StatusDot
          tone={isLoading ? 'warning' : 'success'}
          live={isLoading}
          label={<span className="text-small text-fg-secondary">{geminiStatus}</span>}
        />
      </div>

      {actionToast && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-success-fg/20 bg-success-bg p-3 text-small text-success-fg animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{actionToast}</span>
          </div>
          <Link
            href="/dialer"
            className="focus-ring shrink-0 rounded-sm text-small font-medium text-success-fg underline underline-offset-2"
          >
            Open dialer &rarr;
          </Link>
        </div>
      )}

      {/* Main Results Grid / Table */}
      <Card className="overflow-hidden">
        {/* Search header */}
        <div className="flex flex-col justify-between gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
          <div className="max-w-md flex-1">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by company, tech stack (Apollo, Make.com, HubSpot) or keyword"
            />
          </div>

          <div className="text-small text-fg-secondary">
            <span className="tabular-nums text-body-strong text-fg">{filteredSignals.length}</span> hiring signals
          </div>
        </div>

        {/* Signals List */}
        <div className="divide-y divide-line">
          {filteredSignals.map((sig) => {
            const isPushed = pushedLeadIds.has(sig.id);
            return (
              <div
                key={sig.id}
                className="group space-y-4 p-5 transition-colors hover:bg-subtle"
              >
                {/* Header row: Company, Category, Country, Source, and Stated Budget */}
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-h3 text-fg">{sig.companyName}</span>
                      <a
                        href={sig.website}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring inline-flex items-center gap-1 rounded-sm text-small text-fg-tertiary underline underline-offset-2 hover:text-fg"
                      >
                        <span>{sig.website.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <span className="text-small text-fg-secondary">
                        {sig.country === 'US' ? 'USA' : 'AU'} · {sig.workType} · {sig.categoryLabel}
                      </span>
                    </div>

                    <h4 className="text-body-strong text-fg">{sig.jobTitle}</h4>
                    <p className="max-w-3xl text-small text-fg-secondary">{sig.jobSummary}</p>
                  </div>

                  {/* Budget Highlight Card */}
                  <div className="min-w-[240px] shrink-0 space-y-0.5 rounded-md border border-line bg-surface p-3 sm:text-right">
                    <div className="text-caption text-fg-tertiary">Stated budget</div>
                    <div className="text-h3 tabular-nums text-fg">
                      {sig.budgetRange.baseSalary}
                    </div>
                    {sig.budgetRange.oteOrBonus && (
                      <div className="text-small text-fg-secondary">
                        {sig.budgetRange.oteOrBonus}
                      </div>
                    )}
                    <div className="text-small text-fg-tertiary">
                      {sig.budgetRange.contractType} · {sig.budgetRange.confidence}
                    </div>
                  </div>
                </div>

                {/* Mid row: Tech Stack & Why They Need Us */}
                <div className="grid grid-cols-1 gap-4 rounded-md bg-subtle p-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption text-fg-tertiary">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Tech stack</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sig.techStack.map((tech) => (
                        <span
                          key={tech}
                          className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-caption text-fg-secondary"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption text-fg-tertiary">
                      <Zap className="h-3.5 w-3.5" />
                      <span>Why they need us</span>
                    </div>
                    <p className="text-small text-fg-secondary">{sig.whyTheyNeedUs}</p>
                  </div>
                </div>

                {/* Bottom row: Best Decision-Maker to Reach & 1-Click Action */}
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <Avatar name={sig.decisionMaker.name} size="md" />
                    <div className="text-small">
                      <div className="flex items-center gap-2">
                        <span className="text-body-strong text-fg">{sig.decisionMaker.name}</span>
                        <a
                          href={sig.decisionMaker.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring rounded-sm p-0.5 text-fg-tertiary hover:text-fg"
                          title="View LinkedIn Profile"
                        >
                          <LinkedinIcon className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <div className="text-fg-secondary">{sig.decisionMaker.title}</div>
                    </div>

                    <div className="hidden items-center gap-3 border-l border-line pl-3 font-mono text-small text-fg-secondary md:flex">
                      {sig.decisionMaker.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-fg-tertiary" />
                          <span>{sig.decisionMaker.phone}</span>
                        </span>
                      )}
                      {sig.decisionMaker.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-fg-tertiary" />
                          <span>{sig.decisionMaker.email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isPushed ? (
                      <Button size="sm" variant="ghost" disabled className="text-success-fg disabled:opacity-100" icon={<CheckCircle2 />}>
                        Added to dialer
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => handlePushToCallingFloor(sig)} icon={<Phone />}>
                        Add to dialer
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

