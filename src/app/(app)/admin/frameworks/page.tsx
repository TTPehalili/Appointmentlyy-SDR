'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  FileText,
  Sparkles,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Database,
  RefreshCw,
  Plus,
  AlertCircle,
  PhoneCall,
  Mail,
  Lightbulb
} from 'lucide-react';
import {
  Badge,
  Button,
  buttonClasses,
  EmptyState,
  Field,
  InlineError,
  PageHeader,
  Select,
  StatusDot,
  Tabs,
  Textarea,
} from '@/components/ui';
import { ExtractedArmEntry, SynthesizedPlaybookResult } from '@/lib/parsers/armExtractor';
import OutboundFrameworkManager from '@/components/admin/OutboundFrameworkManager';

export default function AdminFrameworksPage() {
  const [activeView, setActiveView] = useState<'frameworks' | 'uploader'>('frameworks');
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [campaign, setCampaign] = useState('enterprise-outbound');
  const [isUploading, setIsUploading] = useState(false);
  const [resultsSubTab, setResultsSubTab] = useState<'arm' | 'scripts' | 'cadence'>('arm');
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    extractedCount: number;
    entries: ExtractedArmEntry[];
    fileName: string;
    synthesized?: SynthesizedPlaybookResult;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !rawText.trim()) {
      setErrorMsg('Please select a file or paste text content to parse.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      }
      if (rawText.trim()) {
        formData.append('text', rawText.trim());
      }
      formData.append('campaignId', campaign);

      const res = await fetch('/api/frameworks/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUploadResult({
          success: true,
          extractedCount: data.extractedCount,
          entries: data.entries || [],
          fileName: data.fileName || file?.name || 'Manual Input',
          synthesized: data.synthesized
        });

        if (data.synthesized) {
          try {
            if (data.synthesized.phoneScripts) {
              localStorage.setItem('tenant_phone_scripts', JSON.stringify(data.synthesized.phoneScripts));
            }
            if (data.synthesized.emailCadence) {
              localStorage.setItem('tenant_cadence_touches', JSON.stringify(data.synthesized.emailCadence));
            }
            if (data.synthesized.armEntries) {
              localStorage.setItem('tenant_arm_rebuttals', JSON.stringify(data.synthesized.armEntries));
            }
            if (data.synthesized.companyName) {
              localStorage.setItem('tenant_playbook_name', data.synthesized.companyName);
            }
            if (data.synthesized.valueProposition) {
              localStorage.setItem('tenant_value_prop', data.synthesized.valueProposition);
            }
            window.dispatchEvent(new Event('appointmentlyy_playbook_updated'));
          } catch (e) {
            console.warn('[Frameworks Page] Storage notice:', e);
          }
        }

        setFile(null);
        setRawText('');
      } else {
        setErrorMsg(data.error || 'Failed to parse and vectorize document.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };


  return (
    <div className="px-4 py-6 md:px-8">
      <PageHeader
        title="Playbooks"
        description="Manage outbound frameworks and turn training documents into scripts, rebuttals and cadences."
        meta={
          <span className="text-small text-fg-tertiary">
            Model <span className="text-fg-secondary">Gemini 3.5 Flash</span>
          </span>
        }
        tabs={
          <Tabs
            label="Playbook views"
            value={activeView}
            onChange={(v) => setActiveView(v as 'frameworks' | 'uploader')}
            items={[
              { value: 'frameworks', label: 'Outbound frameworks' },
              { value: 'uploader', label: 'Upload playbook' },
            ]}
          />
        }
      />

      {activeView === 'frameworks' ? (
        <OutboundFrameworkManager />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left column: upload form */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <form onSubmit={handleUpload} className="bg-surface border border-line rounded-lg p-5 shadow-xs flex flex-col gap-4">
              <div>
                <h2 className="text-h3 text-fg">Upload a playbook</h2>
                <p className="text-small text-fg-secondary mt-1">
                  Upload sales training docs (.pdf, .docx, .md). AI turns them into structured acknowledge, respond and move entries.
                </p>
              </div>

              {/* Campaign select */}
              <Field label="Campaign" htmlFor="playbook-campaign">
                <Select
                  id="playbook-campaign"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                >
                  <option value="enterprise-outbound">Enterprise Outbound BDM</option>
                  <option value="bpo-accelerator">BPO Client Acquisition</option>
                  <option value="saas-discovery">SaaS Inbound SDR</option>
                </Select>
              </Field>

              {/* File drop area */}
              <div className="flex flex-col gap-1.5">
                <span className="text-body-strong text-fg">Document</span>
                <label className="focus-within:shadow-[var(--focus-ring)] border border-dashed border-line-strong hover:border-fg-disabled hover:bg-subtle rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors duration-150 bg-app">
                  <FileText className="h-8 w-8 text-line-strong mb-2" aria-hidden />
                  <span className="text-body-strong text-fg">
                    {file ? file.name : 'Choose a file or drag and drop'}
                  </span>
                  <span className="text-small text-fg-tertiary mt-1">
                    PDF, DOCX, TXT or MD up to 10MB
                  </span>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.docx,.txt,.md"
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Text fallback */}
              <Field label="Or paste text" htmlFor="playbook-text">
                <Textarea
                  id="playbook-text"
                  rows={4}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste script rules, rebuttal notes, or raw objection training material here..."
                />
              </Field>

              {errorMsg && <InlineError message={errorMsg} />}

              <Button
                type="submit"
                variant="brand"
                disabled={isUploading}
                className="w-full"
                icon={
                  isUploading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )
                }
              >
                {isUploading ? 'Parsing document...' : 'Parse document'}
              </Button>
            </form>
          </div>

          {/* Right column: output entries */}
          <div className="lg:col-span-7 bg-surface border border-line rounded-lg p-5 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <h3 className="text-h3 text-fg">Generated playbook</h3>
                <p className="text-small text-fg-secondary mt-0.5">
                  {uploadResult
                    ? `${uploadResult.fileName} • ${uploadResult.synthesized?.companyName || 'Custom Tenant'}`
                    : 'Waiting for a document'}
                </p>
              </div>

              {uploadResult && (
                <Badge tone="success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  Synced everywhere
                </Badge>
              )}
            </div>

            {/* Sub-tabs for generated sections */}
            {uploadResult && (
              <Tabs
                label="Generated sections"
                value={resultsSubTab}
                onChange={(v) => setResultsSubTab(v as 'arm' | 'scripts' | 'cadence')}
                items={[
                  { value: 'arm', label: 'Objections and rebuttals', count: uploadResult.entries.length },
                  { value: 'scripts', label: 'Call scripts', count: uploadResult.synthesized?.phoneScripts?.length || 4 },
                  { value: 'cadence', label: 'Email cadence', count: uploadResult.synthesized?.emailCadence?.length || 3 },
                ]}
              />
            )}

            {uploadResult ? (
              <div className="space-y-3 overflow-y-auto max-h-[580px] pr-1">

                {/* TAB 1: ARM REBUTTALS */}
                {resultsSubTab === 'arm' && (
                  <div className="space-y-3">
                    {uploadResult.entries.map((entry, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-md bg-app border border-line flex flex-col gap-3 text-small"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-body-strong text-fg">
                            {entry.objection_category}
                          </span>
                          <span className="text-small text-fg-tertiary">
                            Trigger: "{entry.objection_trigger}"
                          </span>
                        </div>

                        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5">
                          <dt className="text-caption text-fg-tertiary pt-px">Acknowledge</dt>
                          <dd className="text-fg-secondary">"{entry.arm_acknowledge}"</dd>
                          <dt className="text-caption text-fg-tertiary pt-px">Respond</dt>
                          <dd className="text-fg">"{entry.arm_respond}"</dd>
                          <dt className="text-caption text-fg-tertiary pt-px">Move</dt>
                          <dd className="text-fg">"{entry.arm_move}"</dd>
                        </dl>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 2: COLD CALL TELEPROMPTER */}
                {resultsSubTab === 'scripts' && (
                  <div className="space-y-3">
                    {(uploadResult.synthesized?.phoneScripts || []).map((script) => (
                      <div key={script.step} className="p-4 rounded-md bg-app border border-line space-y-2 text-small">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-body-strong text-fg">{script.name}</span>
                          <span className="text-small text-fg-tertiary">{script.goal}</span>
                        </div>
                        <p className="p-3 rounded-sm bg-surface border border-line text-body text-fg">
                          {script.spokenText}
                        </p>
                        <p className="text-small text-fg-tertiary flex items-start gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-fg-secondary" aria-hidden />
                          <span>Delivery tip: {script.deliveryTip}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: EMAIL CADENCE */}
                {resultsSubTab === 'cadence' && (
                  <div className="space-y-3">
                    {(uploadResult.synthesized?.emailCadence || []).map((email) => (
                      <div key={email.touchNumber} className="p-4 rounded-md bg-app border border-line space-y-2 text-small">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-body-strong text-fg">Day {email.day} &middot; {email.stepName}</span>
                          <span className="text-small text-fg-secondary">Subject: {email.subject}</span>
                        </div>
                        <div className="p-3 rounded-sm bg-surface border border-line text-body text-fg whitespace-pre-line">
                          {email.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick action navigation bar */}
                <div className="pt-3 border-t border-line flex flex-wrap items-center justify-between gap-2">
                  <StatusDot tone="success" label="Live in the dialer and Practice" className="text-small" />
                  <div className="flex items-center gap-2">
                    <Link
                      href="/dialer"
                      className={buttonClasses('secondary', 'sm')}
                    >
                      <PhoneCall className="h-3.5 w-3.5" aria-hidden />
                      <span>Open dialer</span>
                    </Link>
                    <Link
                      href="/practice"
                      className={buttonClasses('secondary', 'sm')}
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      <span>Test in Practice</span>
                    </Link>
                  </div>
                </div>

              </div>
            ) : (
              <EmptyState
                icon={<FileText />}
                title="No document processed yet"
                description="Upload a training doc, script or cadence. AI applies it across the dialer, Practice and email."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
