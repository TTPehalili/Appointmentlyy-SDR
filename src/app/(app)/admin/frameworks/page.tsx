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
  Mail
} from 'lucide-react';
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
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col font-sans">

      {/* SUB-HEADER / VIEW SELECTOR */}
      <div className="bg-white border-b border-zinc-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg text-xs font-medium border border-zinc-200/60 w-fit">
            <button
              type="button"
              onClick={() => setActiveView('frameworks')}
              className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${activeView === 'frameworks'
                ? 'bg-white text-zinc-950 font-bold shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Outbound Guru Frameworks Studio</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('uploader')}
              className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${activeView === 'uploader'
                ? 'bg-white text-zinc-950 font-bold shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
                }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Playbook Document Ingestion</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
            <span>Floor Model:</span>
            <span className="font-semibold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
              Gemini 3.5 Flash
            </span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeView === 'frameworks' ? (
          <OutboundFrameworkManager />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Upload Form (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <form onSubmit={handleUpload} className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs flex flex-col gap-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
                    <UploadCloud className="h-4 w-4 text-zinc-700" />
                    Upload Framework Playbook
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    Upload sales training docs (.pdf, .docx, .md) to automatically parse into structured [A], [R], [M] entries.
                  </p>
                </div>

                {/* Campaign Select */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1 uppercase tracking-wider">
                    Target Campaign
                  </label>
                  <select
                    value={campaign}
                    onChange={(e) => setCampaign(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900/10 focus:border-zinc-400"
                  >
                    <option value="enterprise-outbound">Enterprise Outbound BDM</option>
                    <option value="bpo-accelerator">BPO Client Acquisition</option>
                    <option value="saas-discovery">SaaS Inbound SDR</option>
                  </select>
                </div>

                {/* File Drop Area */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1 uppercase tracking-wider">
                    Document File
                  </label>
                  <label className="border border-dashed border-zinc-300 hover:border-zinc-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-50/50">
                    <FileText className="h-8 w-8 text-zinc-400 mb-2" />
                    <span className="text-xs font-bold text-zinc-800">
                      {file ? file.name : 'Choose a file or drag & drop'}
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-1">
                      PDF, DOCX, TXT, or MD up to 10MB
                    </span>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Text Fallback */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1 uppercase tracking-wider">
                    Or Paste Text Directly
                  </label>
                  <textarea
                    rows={4}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste script rules, rebuttal notes, or raw objection training material here..."
                    className="w-full bg-white border border-zinc-200 rounded-lg p-2.5 text-xs text-zinc-900 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900/10 focus:border-zinc-400"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 text-white font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Parsing & Vectorizing with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Parse Document with Gemini</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right Column: Output Entries (7 cols) */}
            <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-200 gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
                    <Database className="h-4 w-4 text-zinc-700" />
                    <span>Synthesized Playbook Assets</span>
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {uploadResult
                      ? `${uploadResult.fileName} • ${uploadResult.synthesized?.companyName || 'Custom Tenant'}`
                      : 'Ready for document ingestion'}
                  </p>
                </div>

                {uploadResult && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold font-mono flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      GLOBAL SYNC ACTIVE
                    </span>
                  </div>
                )}
              </div>

              {/* Sub-Tabs for Synthesized Sections */}
              {uploadResult && (
                <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg text-xs font-medium border border-zinc-200">
                  <button
                    type="button"
                    onClick={() => setResultsSubTab('arm')}
                    className={`flex-1 py-1 px-2.5 rounded text-center transition-all ${resultsSubTab === 'arm' ? 'bg-white text-zinc-900 font-bold shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                  >
                    Objections & Rebuttals ({uploadResult.entries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsSubTab('scripts')}
                    className={`flex-1 py-1 px-2.5 rounded text-center transition-all ${resultsSubTab === 'scripts' ? 'bg-white text-zinc-900 font-bold shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                  >
                    Calling Teleprompter ({uploadResult.synthesized?.phoneScripts?.length || 4})
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsSubTab('cadence')}
                    className={`flex-1 py-1 px-2.5 rounded text-center transition-all ${resultsSubTab === 'cadence' ? 'bg-white text-zinc-900 font-bold shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                  >
                    Email Cadence ({uploadResult.synthesized?.emailCadence?.length || 3})
                  </button>
                </div>
              )}

              {uploadResult ? (
                <div className="space-y-3 overflow-y-auto max-h-[580px] pr-1">

                  {/* TAB 1: ARM REBUTTALS */}
                  {resultsSubTab === 'arm' && (
                    <div className="space-y-3">
                      {uploadResult.entries.map((entry, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col gap-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-900 px-2 py-0.5 rounded bg-zinc-200 border border-zinc-300">
                              {entry.objection_category}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Trigger: "{entry.objection_trigger}"
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex gap-2">
                              <span className="px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-800 font-black text-[10px] shrink-0 border border-zinc-300">
                                [A]
                              </span>
                              <p className="text-zinc-700 italic">"{entry.arm_acknowledge}"</p>
                            </div>

                            <div className="flex gap-2">
                              <span className="px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-800 font-black text-[10px] shrink-0 border border-zinc-300">
                                [R]
                              </span>
                              <p className="text-zinc-800 font-medium">"{entry.arm_respond}"</p>
                            </div>

                            <div className="flex gap-2">
                              <span className="px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-800 font-black text-[10px] shrink-0 border border-zinc-300">
                                [M]
                              </span>
                              <p className="text-zinc-800 font-medium">"{entry.arm_move}"</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB 2: COLD CALL TELEPROMPTER */}
                  {resultsSubTab === 'scripts' && (
                    <div className="space-y-3">
                      {(uploadResult.synthesized?.phoneScripts || []).map((script) => (
                        <div key={script.step} className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-zinc-900">{script.name}</span>
                            <span className="text-[10px] font-mono text-zinc-500">{script.goal}</span>
                          </div>
                          <p className="p-2.5 rounded bg-white border border-zinc-200 text-zinc-800 font-medium leading-relaxed">
                            {script.spokenText}
                          </p>
                          <p className="text-[11px] text-zinc-500 italic">
                            💡 Delivery Tip: {script.deliveryTip}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB 3: EMAIL CADENCE */}
                  {resultsSubTab === 'cadence' && (
                    <div className="space-y-3">
                      {(uploadResult.synthesized?.emailCadence || []).map((email) => (
                        <div key={email.touchNumber} className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-zinc-900">Day {email.day} • {email.stepName}</span>
                            <span className="text-[10px] font-mono bg-zinc-200 px-2 py-0.5 rounded text-zinc-700">Subject: {email.subject}</span>
                          </div>
                          <div className="p-2.5 rounded bg-white border border-zinc-200 text-zinc-800 whitespace-pre-line leading-relaxed font-sans">
                            {email.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quick Action Navigation Bar */}
                  <div className="pt-3 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Live in Cockpit & Sparring
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href="/dialer"
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <PhoneCall className="h-3 w-3" />
                        <span>Open Boris Cockpit</span>
                      </Link>
                      <Link
                        href="/practice"
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <Sparkles className="h-3 w-3 text-emerald-200" />
                        <span>Test Sparring</span>
                      </Link>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center text-zinc-400">
                  <FileText className="h-8 w-8 text-zinc-300 mb-2" />
                  <p className="text-xs font-semibold text-zinc-700">No document processed yet in this session</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                    Upload your company training doc, scripts, or cadence on the left. The AI will synthesize it globally across Boris Cockpit, Sparring, and Email Studio.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
