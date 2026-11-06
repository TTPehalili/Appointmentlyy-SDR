'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Copy, 
  Check, 
  ArrowRight, 
  RefreshCw, 
  Layers, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  PhoneCall,
  Mail,
  RotateCcw,
  FileText,
  Lightbulb
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { Button } from '@/components/ui';
import { 
  DEFAULT_OUTBOUND_FRAMEWORKS, 
  DEFAULT_ANTI_SALES_CTAS, 
  OutboundFramework, 
  AntiSalesCta,
  getStoredFrameworks,
  getStoredAntiSalesCtas,
  OutboundChannel
} from '@/lib/outboundFrameworks';

interface AiOutboundCopilotProps {
  channel: OutboundChannel;
  touchType?: string;
  lead: {
    name: string;
    company: string;
    title: string;
    department?: string;
    headcount?: string;
    phone?: string;
    email?: string;
    website?: string;
    linkedinUrl?: string;
    techStack?: string;
    painPoint?: string;
    outsourcer?: string;
    buyingSignals?: string[];
    customVariables?: Record<string, string>;
  };
  currentSubject?: string;
  currentBody?: string;
  onApplyCopy: (subject: string, body: string) => void;
  onResetOriginal?: () => void;
}

export default function AiOutboundCopilot({
  channel,
  touchType = 'Outreach',
  lead,
  currentSubject = '',
  currentBody = '',
  onApplyCopy,
  onResetOriginal
}: AiOutboundCopilotProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [frameworks, setFrameworks] = useState<OutboundFramework[]>([]);
  const [antiSalesCtas, setAntiSalesCtas] = useState<AntiSalesCta[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('');
  const [selectedCtaId, setSelectedCtaId] = useState<string>('');
  const [customRepInstruction, setCustomRepInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appliedToast, setAppliedToast] = useState(false);

  // Generated state
  const [generatedResult, setGeneratedResult] = useState<{
    subject: string;
    body: string;
    wordCount: number;
    charCount: number;
    readingTimeSec: number;
    frameworkUsed: string;
    antiSalesCtaUsed: string;
    prospectInsight: string;
    alternativeHooks: string[];
    modelUsed: string;
  } | null>(null);

  // Load active frameworks and CTAs filtered by active channel
  useEffect(() => {
    const allFw = getStoredFrameworks();
    const filtered = allFw.filter(f => f.channel === channel && f.isActive);
    setFrameworks(filtered);
    if (filtered.length > 0) {
      const def = filtered.find(f => f.isDefault) || filtered[0];
      setSelectedFrameworkId(def.id);
    }

    const allCtas = getStoredAntiSalesCtas();
    const ctasFiltered = allCtas.filter(c => c.channel === channel || c.channel === 'Both' || c.channel === 'All');
    setAntiSalesCtas(ctasFiltered);
    if (ctasFiltered.length > 0) {
      setSelectedCtaId(ctasFiltered[0].id);
    }
  }, [channel]);

  // When user changes framework dropdown, trigger generation or reset
  const handleFrameworkChange = (newFwId: string) => {
    setSelectedFrameworkId(newFwId);
  };

  // Generate / Rewrite handler
  const handleGenerate = async (overrideInstruction?: string) => {
    setIsGenerating(true);
    setAppliedToast(false);
    try {
      const instructionToUse = overrideInstruction !== undefined ? overrideInstruction : customRepInstruction;

      const res = await fetch('/api/ai/outbound-writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          touchType,
          lead,
          frameworkId: selectedFrameworkId,
          antiSalesCtaId: selectedCtaId,
          customPromptInstruction: instructionToUse,
          tone: channel === 'Phone' ? 'Natural Spoken' : 'Crisp & Direct'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedResult({
          subject: data.subject || '',
          body: data.body || '',
          wordCount: data.wordCount || 0,
          charCount: data.charCount || 0,
          readingTimeSec: data.readingTimeSec || 0,
          frameworkUsed: data.frameworkUsed || '',
          antiSalesCtaUsed: data.antiSalesCtaUsed || '',
          prospectInsight: data.prospectInsight || '',
          alternativeHooks: data.alternativeHooks || [],
          modelUsed: data.modelUsed || 'Gemini 3.5'
        });
      } else {
        console.error('Failed to generate copy');
      }
    } catch (err) {
      console.error('Error generating outbound copy:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Approve & Insert
  const handleApprove = () => {
    if (!generatedResult) return;
    onApplyCopy(generatedResult.subject, generatedResult.body);
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 3000);
  };

  // Copy to clipboard
  const handleCopy = () => {
    if (!generatedResult) return;
    const fullText = channel === 'Email' && generatedResult.subject
      ? `Subject: ${generatedResult.subject}\n\n${generatedResult.body}`
      : generatedResult.body;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Swap opening hook
  const handleSwapHook = (newHook: string) => {
    if (!generatedResult) return;
    const lines = generatedResult.body.split('\n\n');
    if (lines.length > 0) {
      lines[0] = newHook;
      const updatedBody = lines.join('\n\n');
      setGeneratedResult(prev => prev ? { ...prev, body: updatedBody } : null);
    }
  };

  const channelIcon = channel === 'Phone' ? <PhoneCall className="w-3.5 h-3.5" /> : channel === 'Email' ? <Mail className="w-3.5 h-3.5" /> : <LinkedinIcon className="w-3.5 h-3.5" />;

  const channelLabel = channel === 'Phone' ? 'Cold Call Guru Teleprompter' : channel === 'Email' ? 'Cold Email Framework' : 'LinkedIn Outbound';

  const quickTweaks = channel === 'Phone' ? [
    { label: 'Brutal Honesty', prompt: 'Make it radically honest and self-deprecating. Tell prospect they can hang up.' },
    { label: 'Shorter (<15s)', prompt: 'Make it strictly under 30 words so it takes less than 15 seconds to say aloud.' },
    { label: 'Poke Competitor', prompt: `Directly mention hesitation against ${lead.outsourcer || 'Titan BPO'} on price.` },
    { label: 'Tactical Empathy', prompt: 'Acknowledge they are in the middle of ten things before asking for 20 seconds.' }
  ] : [
    { label: 'Under 40 words', prompt: 'Make it strictly under 40 words. Absolute minimalism.' },
    { label: 'More casual', prompt: 'Make it more casual and conversational like a quick note.' },
    { label: 'Founder-to-Founder', prompt: 'Rewrite in an operator-to-operator tone discussing seat gross margins.' },
    { label: 'Sharpen Anti-Sales CTA', prompt: 'Make the closing CTA completely disarming so the prospect feels 100% free to say no.' }
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
      {/* HEADER / TOGGLE */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer select-none items-center justify-between border-b border-line px-4 py-3 transition-colors duration-150 hover:bg-subtle"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-fg-secondary" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-h3 text-fg">
                AI writing copilot
              </span>
              <span className="flex items-center gap-1 text-caption text-fg-tertiary">
                {channelIcon}
                <span>{channelLabel}</span>
              </span>
            </div>
            <p className="text-caption text-fg-tertiary">
              Uses your lead data, saved frameworks and soft closing lines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {generatedResult && (
            <span className="text-caption tabular-nums text-fg-tertiary">
              {generatedResult.wordCount} words · ~{generatedResult.readingTimeSec}s {channel === 'Phone' ? 'speak' : 'read'}
            </span>
          )}
          <button
            type="button"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            className="focus-ring rounded-sm p-0.5 text-fg-tertiary hover:text-fg"
          >
            {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {/* EXPANDED CONTENT */}
      {isOpen && (
        <div className="space-y-3 p-4">
          {/* CSV KNOWLEDGE SIGNALS BAR */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-app p-2 text-caption text-fg-secondary">
            <span className="flex items-center gap-1 text-fg">
              <FileText className="size-3.5 text-fg-secondary" />
              <span>Lead data:</span>
            </span>
            <span>Floor: <span className="text-fg">{lead.headcount || '50+ Seats'}</span></span>
            <span>Tech: <span className="text-fg">{lead.techStack || 'Apollo/HubSpot'}</span></span>
            <span>Competitor: <span className="text-fg">{lead.outsourcer || 'Incumbent BPO'}</span></span>
            {lead.painPoint && (
              <span className="max-w-xs truncate">
                Friction: <span className="text-fg">{lead.painPoint}</span>
              </span>
            )}
            {lead.website && (
              <span>Web: <span className="font-mono text-fg">{lead.website}</span></span>
            )}
          </div>

          {/* DROPDOWN OPTIONS TO CHOOSE FROM */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-caption text-fg-secondary">
                Framework ({frameworks.length} available)
              </label>
              <select
                value={selectedFrameworkId}
                onChange={(e) => handleFrameworkChange(e.target.value)}
                className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg"
              >
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.name} ({fw.authorOrStyle})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-caption text-fg-secondary">
                Closing angle
              </label>
              <select
                value={selectedCtaId}
                onChange={(e) => setSelectedCtaId(e.target.value)}
                className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg"
              >
                {antiSalesCtas.map((cta) => (
                  <option key={cta.id} value={cta.id}>
                    {cta.label} ({cta.psychologyAngle})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* CUSTOM REP INSTRUCTION INPUT & GENERATE / REWRITE BUTTON */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customRepInstruction}
              onChange={(e) => setCustomRepInstruction(e.target.value)}
              placeholder="Any direction? For example: mention the Manila expansion, or keep it under 20 words"
              className="focus-ring h-9 flex-1 rounded-sm border border-line-strong bg-surface px-3 text-small text-fg placeholder:text-fg-disabled"
            />
            <Button
              variant="primary"
              size="md"
              onClick={() => handleGenerate()}
              loading={isGenerating}
              icon={isGenerating ? undefined : <Sparkles />}
            >
              {isGenerating ? (
                <span>Writing...</span>
              ) : (
                <span>{generatedResult ? 'Write another version' : 'Write with AI'}</span>
              )}
            </Button>
          </div>

          {/* QUICK REWRITE TWEAK CHIPS */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-caption text-fg-tertiary">Quick tweaks:</span>
            {quickTweaks.map((qt, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  setCustomRepInstruction(qt.prompt);
                  handleGenerate(qt.prompt);
                }}
                className="focus-ring inline-flex h-7 cursor-pointer items-center rounded-full border border-line-strong bg-surface px-2.5 text-caption text-fg transition-colors duration-150 hover:bg-subtle disabled:opacity-50"
              >
                {qt.label}
              </button>
            ))}
          </div>

          {/* RESULT CARD & APPROVE WORKFLOW */}
          {generatedResult && (
            <div className="mt-2.5 space-y-3 rounded-md border border-line bg-app p-4 animate-in fade-in">
              {/* METADATA */}
              <div className="flex items-center justify-between border-b border-line pb-2 text-caption text-fg-tertiary">
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-fg">
                    {generatedResult.frameworkUsed}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{generatedResult.wordCount} words</span>
                  <span aria-hidden>·</span>
                  <span>~{generatedResult.readingTimeSec}s {channel === 'Phone' ? 'spoken' : 'read'}</span>
                </div>
                <span>
                  via {generatedResult.modelUsed}
                </span>
              </div>

              {/* EMAIL SUBJECT (if email) */}
              {channel === 'Email' && generatedResult.subject && (
                <div className="flex items-center gap-2 text-small">
                  <span className="text-caption text-fg-tertiary">Subject</span>
                  <span className="text-body-strong text-fg">
                    {generatedResult.subject}
                  </span>
                </div>
              )}

              {/* SCRIPT / MESSAGE BODY */}
              <div className="whitespace-pre-wrap rounded-md border border-line bg-surface p-3 text-body text-fg">
                {generatedResult.body}
              </div>

              {/* PROSPECT INSIGHT ANGLE */}
              {generatedResult.prospectInsight && (
                <div className="flex items-start gap-1.5 rounded-md border border-line bg-subtle p-2 text-small text-fg-secondary">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-fg-secondary" />
                  <span>
                    <span className="text-fg">Why this should land:</span> {generatedResult.prospectInsight}
                  </span>
                </div>
              )}

              {/* ALTERNATIVE HOOKS */}
              {generatedResult.alternativeHooks.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-caption text-fg-tertiary">
                    Swap the opening line
                  </span>
                  <div className="space-y-1">
                    {generatedResult.alternativeHooks.map((hook, hIdx) => (
                      <button
                        key={hIdx}
                        type="button"
                        onClick={() => handleSwapHook(hook)}
                        className="focus-ring group flex w-full cursor-pointer items-center justify-between rounded-sm border border-line bg-surface p-2 text-left text-small text-fg transition-colors duration-150 hover:bg-subtle"
                      >
                        <span className="truncate pr-2">&quot;{hook}&quot;</span>
                        <span className="shrink-0 text-caption text-fg-tertiary group-hover:text-fg">
                          Use this line
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* APPROVE & REWRITE WORKFLOW BUTTONS */}
              <div className="flex flex-col justify-between gap-2 border-t border-line pt-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApprove}
                    icon={<Check />}
                  >
                    <span>Apply to {channel === 'Phone' ? 'teleprompter' : channel === 'Email' ? 'email composer' : 'LinkedIn'}</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleGenerate()}
                    disabled={isGenerating}
                    icon={<RefreshCw className={isGenerating ? 'animate-spin' : ''} />}
                  >
                    Write another
                  </Button>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    icon={copied ? <Check className="text-success-fg" /> : <Copy />}
                  >
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </Button>

                  {onResetOriginal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onResetOriginal}
                      icon={<RotateCcw />}
                    >
                      Revert to default
                    </Button>
                  )}
                </div>
              </div>

              {appliedToast && (
                <div className="flex items-center gap-1.5 rounded-md border border-success-500/40 bg-success-bg p-2 text-small font-medium text-success-fg animate-in fade-in">
                  <CheckCircle2 className="size-4 shrink-0 text-success-fg" />
                  <span>Applied to the {channel === 'Phone' ? 'active teleprompter' : 'message composer'}.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
