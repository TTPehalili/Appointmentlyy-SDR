'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Layers, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  Copy, 
  RotateCcw, 
  Save, 
  Play, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Mail,
  PhoneCall,
  HelpCircle,
  ShieldCheck,
  Eye,
  Lightbulb,
  X
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  StatusDot,
  Textarea,
} from '@/components/ui';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { 
  DEFAULT_OUTBOUND_FRAMEWORKS, 
  DEFAULT_ANTI_SALES_CTAS, 
  OutboundFramework, 
  AntiSalesCta,
  getStoredFrameworks,
  saveStoredFrameworks,
  getStoredAntiSalesCtas,
  saveStoredAntiSalesCtas,
  OutboundChannel
} from '@/lib/outboundFrameworks';

export default function OutboundFrameworkManager() {
  const [activeTab, setActiveTab] = useState<'Phone' | 'Email' | 'LinkedIn' | 'CTAs' | 'Playground'>('Phone');
  const [frameworks, setFrameworks] = useState<OutboundFramework[]>([]);
  const [antiSalesCtas, setAntiSalesCtas] = useState<AntiSalesCta[]>([]);
  const [editingFramework, setEditingFramework] = useState<OutboundFramework | null>(null);
  const [isSavedToast, setIsSavedToast] = useState(false);

  // Playground state
  const [playgroundChannel, setPlaygroundChannel] = useState<OutboundChannel>('Phone');
  const [testLead, setTestLead] = useState({
    name: 'Julian Vance',
    company: 'Apex Global BPO',
    title: 'Managing Director & Head of Outbound',
    headcount: '250 Seats (Manila & Cebu)',
    techStack: 'Apollo.io and HubSpot CRM',
    outsourcer: 'Titan BPO Solutions',
    painPoint: 'objection drop-offs when prospects claim they already get pitched by 3 competitors on shared lists',
    website: 'apexglobalbpo.ph',
    linkedinUrl: 'linkedin.com/in/julian-vance-bpo',
    buyingSignals: ['Scaling Manila floor to 250 seats', 'Expanding CS and Outbound Sales']
  });
  const [testFrameworkId, setTestFrameworkId] = useState<string>('braun_cold_call');
  const [testCtaId, setTestCtaId] = useState<string>('cta_phone_hangup_or_30s');
  const [testCustomPrompt, setTestCustomPrompt] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    setFrameworks(getStoredFrameworks());
    setAntiSalesCtas(getStoredAntiSalesCtas());
  }, []);

  const handleToggleActive = (id: string) => {
    const updated = frameworks.map(f => f.id === id ? { ...f, isActive: !f.isActive } : f);
    setFrameworks(updated);
    saveStoredFrameworks(updated);
  };

  const handleSetDefault = (id: string, channel: OutboundChannel) => {
    const updated = frameworks.map(f => {
      if (f.channel !== channel) return f;
      return { ...f, isDefault: f.id === id };
    });
    setFrameworks(updated);
    saveStoredFrameworks(updated);
  };

  const handleSaveFramework = (fw: OutboundFramework) => {
    let updated: OutboundFramework[];
    if (frameworks.some(f => f.id === fw.id)) {
      updated = frameworks.map(f => f.id === fw.id ? fw : f);
    } else {
      updated = [...frameworks, fw];
    }
    setFrameworks(updated);
    saveStoredFrameworks(updated);
    setEditingFramework(null);
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 2500);
  };

  const handleResetToDefaults = () => {
    if (confirm('Reset all frameworks and anti-sales CTAs to system defaults?')) {
      setFrameworks(DEFAULT_OUTBOUND_FRAMEWORKS);
      saveStoredFrameworks(DEFAULT_OUTBOUND_FRAMEWORKS);
      setAntiSalesCtas(DEFAULT_ANTI_SALES_CTAS);
      saveStoredAntiSalesCtas(DEFAULT_ANTI_SALES_CTAS);
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 2500);
    }
  };

  // Run Playground Live Inference
  const handleRunTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/outbound-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: playgroundChannel,
          lead: testLead,
          frameworkId: testFrameworkId,
          antiSalesCtaId: testCtaId,
          customPromptInstruction: testCustomPrompt,
          tone: playgroundChannel === 'Phone' ? 'Natural Spoken' : 'Crisp & Direct'
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      console.error('Playground test error:', err);
    } finally {
      setIsTesting(false);
    }
  };

  const filteredFrameworks = frameworks.filter(f => f.channel === activeTab);


  return (
    <div className="space-y-6">
      {/* Toolbar: channel switch + reset */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="overflow-x-auto scrollbar-none">
          <SegmentedControl
            label="Framework library"
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'Phone' | 'Email' | 'LinkedIn' | 'CTAs' | 'Playground')}
            items={[
              {
                value: 'Phone',
                label: (
                  <>
                    <PhoneCall className="w-3.5 h-3.5" aria-hidden />
                    <span className="whitespace-nowrap">Cold call openers</span>
                    <span className="text-caption tabular-nums text-fg-tertiary">{frameworks.filter(f => f.channel === 'Phone').length}</span>
                  </>
                ),
              },
              {
                value: 'Email',
                label: (
                  <>
                    <Mail className="w-3.5 h-3.5" aria-hidden />
                    <span className="whitespace-nowrap">Cold email</span>
                    <span className="text-caption tabular-nums text-fg-tertiary">{frameworks.filter(f => f.channel === 'Email').length}</span>
                  </>
                ),
              },
              {
                value: 'LinkedIn',
                label: (
                  <>
                    <LinkedinIcon className="w-3.5 h-3.5" />
                    <span className="whitespace-nowrap">LinkedIn</span>
                    <span className="text-caption tabular-nums text-fg-tertiary">{frameworks.filter(f => f.channel === 'LinkedIn').length}</span>
                  </>
                ),
              },
              {
                value: 'CTAs',
                label: (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                    <span className="whitespace-nowrap">Anti-sales CTAs</span>
                    <span className="text-caption tabular-nums text-fg-tertiary">{antiSalesCtas.length}</span>
                  </>
                ),
              },
              {
                value: 'Playground',
                label: (
                  <>
                    <Play className="w-3.5 h-3.5" aria-hidden />
                    <span className="whitespace-nowrap">Playground</span>
                  </>
                ),
              },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          {isSavedToast && (
            <span role="status" className="text-small text-success-fg flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
              <span>Saved</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetToDefaults}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset to defaults
          </Button>
        </div>
      </div>

      {/* FRAMEWORKS LIST (Phone, Email, LinkedIn) */}
      {(activeTab === 'Phone' || activeTab === 'Email' || activeTab === 'LinkedIn') && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {filteredFrameworks.map((fw) => (
              <div
                key={fw.id}
                className="bg-surface border border-line rounded-lg p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-h3 text-fg">{fw.name}</h3>
                      {fw.isDefault && (
                        <Badge tone="neutral">Floor default</Badge>
                      )}
                    </div>
                    <p className="text-small text-fg-tertiary">{fw.authorOrStyle}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    {!fw.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(fw.id, fw.channel)}
                      >
                        Set as default
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(fw.id)}
                      aria-pressed={fw.isActive}
                      className="focus-ring inline-flex h-8 items-center rounded-md px-2 hover:bg-subtle transition-colors duration-150 cursor-pointer"
                    >
                      <StatusDot
                        tone={fw.isActive ? 'success' : 'neutral'}
                        label={fw.isActive ? 'Active' : 'Disabled'}
                        className="text-small"
                      />
                    </button>
                    <IconButton
                      label="Edit framework"
                      size="sm"
                      onClick={() => setEditingFramework(fw)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>

                <p className="text-body text-fg-secondary">
                  {fw.description}
                </p>

                {/* ANTI-SALES PRINCIPLE */}
                <div className="p-3 rounded-md bg-app border border-line space-y-1">
                  <div className="flex items-center gap-1.5 text-caption text-fg-tertiary">
                    <ShieldCheck className="w-3.5 h-3.5 text-fg-secondary" aria-hidden />
                    <span>Anti-sales constraint, about {fw.targetWordCount} words</span>
                  </div>
                  <p className="text-small text-fg-secondary">
                    {fw.antiSalesPrinciple}
                  </p>
                </div>

                {/* EXAMPLE SNIPPET */}
                <div className="space-y-1">
                  <span className="text-caption text-fg-tertiary">
                    Sample output
                  </span>
                  <div className="p-3 rounded-md bg-app border border-line text-small text-fg whitespace-pre-wrap">
                    {fw.exampleSnippet}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ANTI-SALES CTA LIBRARY */}
      {activeTab === 'CTAs' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-subtle border border-line text-body text-fg-secondary">
            <span className="text-body-strong text-fg">Why anti-sales CTAs work.</span> Defensive prospects delete emails and hang up on cold calls when pushed into a corner.
            Permission-based, no-oriented, and pattern-interrupt CTAs give prospects total freedom to decline, which disarms pressure and drastically increases conversation rates.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {antiSalesCtas.map((cta) => (
              <div
                key={cta.id}
                className="bg-surface border border-line rounded-lg p-4 shadow-xs space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-line">
                    <span className="text-body-strong text-fg">{cta.label}</span>
                    <span className="text-small text-fg-tertiary text-right shrink-0">
                      {cta.channel} &middot; {cta.psychologyAngle}
                    </span>
                  </div>
                  <p className="text-body text-fg mt-2">
                    "{cta.ctaText}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIVE GEMINI PLAYGROUND */}
      {activeTab === 'Playground' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Test Controls (5 cols) */}
          <div className="lg:col-span-5 bg-surface border border-line rounded-lg p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-h3 text-fg">Playground</h3>
              <p className="text-small text-fg-secondary">Test cold calls, emails and LinkedIn messages against a sample prospect.</p>
            </div>

            {/* CHANNEL TOGGLE */}
            <SegmentedControl
              label="Channel"
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={playgroundChannel}
              onChange={(v) => {
                const c = v as OutboundChannel;
                setPlaygroundChannel(c);
                const matching = frameworks.filter(f => f.channel === c && f.isActive);
                if (matching.length > 0) setTestFrameworkId(matching[0].id);
              }}
              items={(['Phone', 'Email', 'LinkedIn'] as OutboundChannel[]).map((c) => ({ value: c, label: c }))}
            />

            <div className="space-y-4">
              <Field label="Framework" htmlFor="pg-framework">
                <Select
                  id="pg-framework"
                  value={testFrameworkId}
                  onChange={(e) => setTestFrameworkId(e.target.value)}
                >
                  {frameworks.filter(f => f.channel === playgroundChannel).map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.authorOrStyle})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Closing angle" htmlFor="pg-cta">
                <Select
                  id="pg-cta"
                  value={testCtaId}
                  onChange={(e) => setTestCtaId(e.target.value)}
                >
                  {antiSalesCtas.filter(c => c.channel === playgroundChannel || c.channel === 'Both' || c.channel === 'All').map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.psychologyAngle})
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Extra guidance (optional)" htmlFor="pg-guidance">
                <Input
                  id="pg-guidance"
                  type="text"
                  value={testCustomPrompt}
                  onChange={(e) => setTestCustomPrompt(e.target.value)}
                  placeholder="e.g. 'Emphasize Titan BPO competitor leak' or 'Under 25 words'"
                />
              </Field>

              <div className="pt-3 border-t border-line">
                <span className="text-caption text-fg-tertiary block mb-1.5">
                  Sample prospect
                </span>
                <dl className="p-3 rounded-md bg-app border border-line text-small grid grid-cols-[88px_1fr] gap-x-3 gap-y-1">
                  <dt className="text-fg-tertiary">Lead</dt>
                  <dd className="text-fg">{testLead.name} ({testLead.title})</dd>
                  <dt className="text-fg-tertiary">Company</dt>
                  <dd className="text-fg">{testLead.company} &middot; {testLead.headcount}</dd>
                  <dt className="text-fg-tertiary">Tech stack</dt>
                  <dd className="text-fg">{testLead.techStack}</dd>
                  <dt className="text-fg-tertiary">Competitor</dt>
                  <dd className="text-fg">{testLead.outsourcer}</dd>
                  <dt className="text-fg-tertiary">Pain</dt>
                  <dd className="text-fg">{testLead.painPoint}</dd>
                </dl>
              </div>

              <Button
                variant="brand"
                onClick={handleRunTest}
                disabled={isTesting}
                className="w-full"
                icon={isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              >
                {isTesting ? 'Generating...' : 'Run test'}
              </Button>
            </div>
          </div>

          {/* RIGHT: Test Output (7 cols) */}
          <div className="lg:col-span-7 bg-surface border border-line rounded-lg p-5 shadow-xs space-y-3 min-h-[360px]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
              <span className="text-h3 text-fg">
                Output ({playgroundChannel})
              </span>
              {testResult && (
                <div className="flex items-center gap-2 text-small tabular-nums text-fg-tertiary">
                  <span>{testResult.wordCount} words</span>
                  <span aria-hidden>&middot;</span>
                  <span>~{testResult.readingTimeSec}s {playgroundChannel === 'Phone' ? 'speak' : 'read'}</span>
                  <span aria-hidden>&middot;</span>
                  <span className="text-fg-secondary">{testResult.modelUsed}</span>
                </div>
              )}
            </div>

            {isTesting && (
              <div className="space-y-2 py-2" aria-busy="true">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {!isTesting && !testResult && (
              <EmptyState
                icon={<Play />}
                title="No output yet"
                description="Choose a framework and select Run test to preview the message."
              />
            )}

            {!isTesting && testResult && (
              <div className="space-y-3 animate-in fade-in">
                {testResult.subject && (
                  <div className="flex items-center gap-2 text-body">
                    <span className="text-caption text-fg-tertiary">Subject</span>
                    <span className="text-body-strong text-fg">
                      {testResult.subject}
                    </span>
                  </div>
                )}

                <div className="p-4 rounded-md bg-app border border-line text-body text-fg whitespace-pre-wrap">
                  {testResult.body}
                </div>

                {testResult.prospectInsight && (
                  <div className="p-3 rounded-md bg-subtle border border-line text-small text-fg-secondary flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 shrink-0 text-fg-secondary" aria-hidden />
                    <span><span className="text-body-strong text-fg">Why this angle works:</span> {testResult.prospectInsight}</span>
                  </div>
                )}

                {testResult.alternativeHooks && testResult.alternativeHooks.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-caption text-fg-tertiary">
                      Alternative hooks
                    </span>
                    {testResult.alternativeHooks.map((h: string, idx: number) => (
                      <div key={idx} className="px-3 py-2 rounded-sm bg-app border border-line text-small text-fg-secondary">
                        "{h}"
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      <Dialog
        open={editingFramework !== null}
        onClose={() => setEditingFramework(null)}
        title={editingFramework ? `Edit framework: ${editingFramework.name}` : 'Edit framework'}
        size="lg"
        bare
      >
        {editingFramework && (
          <div>
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <h2 id="edit-framework-title" className="text-h2 text-fg">
                Edit framework: {editingFramework.name}
              </h2>
              <IconButton
                label="Close"
                size="sm"
                onClick={() => setEditingFramework(null)}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="space-y-4 px-6 py-5">
              <Field label="Name" htmlFor="fw-name">
                <Input
                  id="fw-name"
                  type="text"
                  value={editingFramework.name}
                  onChange={(e) => setEditingFramework({ ...editingFramework, name: e.target.value })}
                />
              </Field>

              <Field label="Description" htmlFor="fw-description">
                <Input
                  id="fw-description"
                  type="text"
                  value={editingFramework.description}
                  onChange={(e) => setEditingFramework({ ...editingFramework, description: e.target.value })}
                />
              </Field>

              <Field label="AI prompt instructions" htmlFor="fw-prompt">
                <Textarea
                  id="fw-prompt"
                  rows={6}
                  value={editingFramework.promptInstruction}
                  onChange={(e) => setEditingFramework({ ...editingFramework, promptInstruction: e.target.value })}
                  className="font-mono text-small"
                />
              </Field>

              <Field label="Anti-sales constraint" htmlFor="fw-principle">
                <Input
                  id="fw-principle"
                  type="text"
                  value={editingFramework.antiSalesPrinciple}
                  onChange={(e) => setEditingFramework({ ...editingFramework, antiSalesPrinciple: e.target.value })}
                />
              </Field>

              <Field label="Example snippet" htmlFor="fw-example">
                <Textarea
                  id="fw-example"
                  rows={3}
                  value={editingFramework.exampleSnippet}
                  onChange={(e) => setEditingFramework({ ...editingFramework, exampleSnippet: e.target.value })}
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
              <Button
                variant="secondary"
                onClick={() => setEditingFramework(null)}
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                onClick={() => handleSaveFramework(editingFramework)}
              >
                Save changes
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
