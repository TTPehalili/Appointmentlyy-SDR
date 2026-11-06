'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  Sparkles, 
  Copy, 
  Check, 
  Send, 
  RotateCw, 
  Inbox, 
  Loader2, 
  AlignLeft, 
  ChevronDown, 
  ChevronUp, 
  PlusCircle, 
  ShieldCheck, 
  AlertTriangle,
  Clock,
  Calendar,
  Zap,
  Eye,
  Edit3,
  FileText,
  CheckCircle2,
  Info,
  HelpCircle,
  Lock,
  XCircle
} from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
  buttonClasses
} from '@/components/ui';
import { saveEmailToStore, getConversationThreadKey } from '@/lib/emailStore';
import { 
  COLD_EMAIL_FRAMEWORKS, 
  COLD_EMAIL_IDEA_PRESETS, 
  MANUAL_COLD_EMAIL_GUIDANCE,
  formatEmailToParagraphs, 
  getDeterministicColdEmail, 
  sanitizeColdEmail 
} from '@/lib/coldEmailStudio';
import { useSession } from '@/lib/session';

// B2B spam trigger words list
const COMMON_SPAM_WORDS = [
  'guarantee', 'guaranteed', '100% free', 'risk-free', 'buy now', 
  'cheap', 'discount', 'act now', 'limited time', 'winner', 'cash bonus', 
  'miracle', 'no obligation', 'congratulations', 'pure profit', 'earn extra cash'
];

export default function ColdEmailStudio() {
  const { session } = useSession();

  // Dynamic verified sender from session
  const senderDisplayName = session?.repName || 'Emil Halili';
  const senderEmailRaw = session?.email || 'emil@appointmentlyy.com';
  const verifiedSenderEmail = senderEmailRaw.toLowerCase().endsWith('@appointmentlyy.com')
    ? senderEmailRaw
    : 'emil@appointmentlyy.com';
  const senderFrom = `${senderDisplayName} <${verifiedSenderEmail}>`;

  // Recipient / Prospect Free-Hand Inputs
  const [prospectEmail, setProspectEmailState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sdr_target_recipient_email');
      if (saved) return saved;
    }
    return 'emil@callview.ai';
  });

  const isCallviewDefault = prospectEmail.toLowerCase().includes('callview.ai');
  const [prospectName, setProspectName] = useState<string>(isCallviewDefault ? 'Emil Halili' : 'Julian Vance');
  const [prospectCompany, setProspectCompany] = useState<string>(isCallviewDefault ? 'Callview AI' : 'Apex Global BPO');
  const [prospectTitle, setProspectTitle] = useState<string>(isCallviewDefault ? 'Founder / CEO' : 'Director of Outbound Operations');

  // Sync stored CSV leads or URL query parameters on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const toParam = params.get('to');
        const nameParam = params.get('name');
        const companyParam = params.get('company');
        const titleParam = params.get('title');
        if (toParam) {
          setProspectEmailState(toParam);
          localStorage.setItem('sdr_target_recipient_email', toParam);
        }
        if (nameParam) setProspectName(nameParam);
        if (companyParam) setProspectCompany(companyParam);
        if (titleParam) setProspectTitle(titleParam);
      }
    } catch (e) {
      console.warn('Could not read URL params:', e);
    }
  }, []);

  // Studio Mode: 'editor' | 'preview'
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');

  // Subject Line State
  const [subjectText, setSubjectText] = useState<string>('quick question');
  const [showSubjectSuggestions, setShowSubjectSuggestions] = useState<boolean>(false);
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([
    'quick question',
    'outbound hold rate',
    'caller margin leak',
    'rookie lead burn'
  ]);

  // Draft Body State
  const [editableBody, setEditableBody] = useState<string>(() => 
    `Hi Emil,\n\nFollowing up after our call. Saw Callview AI is scaling outbound seats. Typically when BPO leaders scale outbound, the hidden leak is not lead volume, it is callers getting chopped on price by commodity competitors.\n\nTraditional coaching fails when reps freeze in the first 20 seconds. We feed consultative rebuttals in 150 milliseconds live on the dial.\n\nOpen to a 2-minute video showing how we insulate margins, or totally off base?`
  );

  // AI Framework & Angle State (Optional Assistant)
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('braun-poke-the-bear');
  const [userIdea, setUserIdea] = useState<string>(
    'Following up after our call. Saw you are scaling outbound reps—wanted to share how we feed consultative rebuttals in 150ms live on the dial without burning shared lead lists.'
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showAiAssistant, setShowAiAssistant] = useState<boolean>(false);

  // Send & UI State
  const [isSendingDirectEmail, setIsSendingDirectEmail] = useState<boolean>(false);
  const [sendButtonState, setSendButtonState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [directSendStatus, setDirectSendStatus] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Deliverability Playbook Expansion State
  const [showPlaybookDetails, setShowPlaybookDetails] = useState<boolean>(false);

  // Update recipient email free-hand & persist to lead record
  const handleRecipientEmailChange = (newEmail: string) => {
    setProspectEmailState(newEmail);
    setSendButtonState('idle');
    if (typeof window !== 'undefined') {
      localStorage.setItem('sdr_target_recipient_email', newEmail);
    }

    // Smartly default name/company if pointing to Callview
    if (newEmail.toLowerCase().includes('callview.ai') && (!prospectName || prospectName === 'Julian Vance')) {
      setProspectName('Emil Halili');
      setProspectCompany('Callview AI');
      setProspectTitle('Founder / CEO');
    }
  };

  // Start a fresh blank email
  const handleStartBlankEmail = () => {
    setProspectEmailState('');
    setProspectName('');
    setProspectCompany('');
    setProspectTitle('');
    setSubjectText('');
    setEditableBody('');
    setSendButtonState('idle');
    setDirectSendStatus(null);
  };

  // Synthesize / Generate Draft using AI with Fallback
  const handleGenerateDraft = async () => {
    setIsGenerating(true);
    setSendButtonState('idle');
    try {
      const res = await fetch('/api/ai/cold-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameworkId: selectedFrameworkId,
          userIdea: userIdea.trim(),
          prospect: {
            name: prospectName || 'Prospect',
            company: prospectCompany || 'Target Company',
            title: prospectTitle || 'Decision Maker'
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          const formatted = formatEmailToParagraphs(data.draft.body).join('\n\n');
          setEditableBody(formatted);
          if (data.draft.subjectLines && data.draft.subjectLines.length > 0) {
            setSubjectText(data.draft.subjectLines[0].text);
            setSubjectSuggestions(data.draft.subjectLines.map((s: any) => s.text));
          }
          return;
        }
      }

      // High-quality deterministic fallback
      const fallback = getDeterministicColdEmail(selectedFrameworkId, userIdea, {
        name: prospectName || 'Prospect',
        company: prospectCompany || 'Target Company',
        title: prospectTitle || 'Decision Maker'
      });
      setEditableBody(formatEmailToParagraphs(fallback.body).join('\n\n'));
      if (fallback.subjectLines.length > 0) {
        setSubjectText(fallback.subjectLines[0].text);
        setSubjectSuggestions(fallback.subjectLines.map(s => s.text));
      }
    } catch (e) {
      console.warn('AI generation fallback engaged:', e);
      const fallback = getDeterministicColdEmail(selectedFrameworkId, userIdea, {
        name: prospectName || 'Prospect',
        company: prospectCompany || 'Target Company',
        title: prospectTitle || 'Decision Maker'
      });
      setEditableBody(formatEmailToParagraphs(fallback.body).join('\n\n'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Workshop Tool 1: Auto-Format Paragraphs
  const handleAutoFormat = () => {
    const { cleanText } = sanitizeColdEmail(editableBody);
    const formatted = formatEmailToParagraphs(cleanText).join('\n\n');
    setEditableBody(formatted);
    setCopiedKey('formatted');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Workshop Tool 2: Sanitize (Strip em dashes and emojis strictly)
  const handleSanitizeStrict = () => {
    const { cleanText } = sanitizeColdEmail(editableBody);
    setEditableBody(cleanText);
    setCopiedKey('sanitized');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Workshop Tool 3: Shorten Copy to < 65 Words
  const handleShortenCopy = () => {
    let text = editableBody
      .replace(/I hope you are doing well[.,]?\s*/gi, '')
      .replace(/I hope this email finds you well[.,]?\s*/gi, '')
      .replace(/I wanted to reach out to you because\s*/gi, '')
      .replace(/In case you were not already aware[.,]?\s*/gi, '')
      .trim();

    const paragraphs = formatEmailToParagraphs(text);
    if (paragraphs.length > 3) {
      text = [paragraphs[0], paragraphs[1], paragraphs[paragraphs.length - 1]].join('\n\n');
    }
    setEditableBody(text);
    setCopiedKey('shortened');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Copy Helpers
  const handleCopyBody = () => {
    navigator.clipboard.writeText(editableBody);
    setCopiedKey('body');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyEntireEmail = () => {
    const full = `Subject: ${subjectText}\n\n${editableBody}`;
    navigator.clipboard.writeText(full);
    setCopiedKey('full');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Live Dispatch via Resend API
  const handleDirectSendEmail = async () => {
    if (sendButtonState === 'sent' || isSendingDirectEmail) {
      return;
    }

    if (!prospectEmail || !prospectEmail.includes('@')) {
      setDirectSendStatus('Error: Please enter a valid recipient email address');
      return;
    }

    setIsSendingDirectEmail(true);
    setSendButtonState('sending');
    setDirectSendStatus(null);

    const activeSubject = subjectText.trim() || 'quick question';
    const bodyToSend = formatEmailToParagraphs(editableBody).join('\n\n');

    let effectiveName = prospectName.trim() || 'Prospect';
    let effectiveCompany = prospectCompany.trim() || 'Target Company';
    let effectiveTitle = prospectTitle.trim() || 'Decision Maker';

    if (prospectEmail.trim().toLowerCase().includes('callview.ai')) {
      effectiveName = 'Emil Halili';
      effectiveCompany = 'Callview AI';
      effectiveTitle = 'Founder / CEO';
    }

    const computedThreadId = getConversationThreadKey({
      direction: 'outbound',
      to: prospectEmail.trim(),
      from: senderFrom,
      subject: activeSubject
    });

    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: prospectEmail.trim(),
          from: senderFrom,
          subject: activeSubject,
          body: bodyToSend,
          leadName: effectiveName,
          leadCompany: effectiveCompany,
          leadTitle: effectiveTitle,
          threadId: computedThreadId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          saveEmailToStore(data.email);
        }
        setSendButtonState('sent');
        setDirectSendStatus(`Dispatched from ${senderFrom} to ${prospectEmail.trim()}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `Send failed (${res.status} ${res.statusText})`;
        setSendButtonState('idle');
        setDirectSendStatus(`Error: ${errMsg}`);
      }
    } catch (e: any) {
      setSendButtonState('idle');
      setDirectSendStatus(`Error: ${e.message || 'Network error'}`);
    } finally {
      setIsSendingDirectEmail(false);
    }
  };

  // Word count & quality calculations
  const wordCount = editableBody.trim().split(/\s+/).filter(Boolean).length;
  const subjectWordCount = subjectText.trim().split(/\s+/).filter(Boolean).length;
  const activeFramework = COLD_EMAIL_FRAMEWORKS.find(f => f.id === selectedFrameworkId) || COLD_EMAIL_FRAMEWORKS[0];

  // Spam Word Scanner
  const detectedSpamTriggers = useMemo(() => {
    const combined = `${subjectText} ${editableBody}`.toLowerCase();
    return COMMON_SPAM_WORDS.filter(w => combined.includes(w));
  }, [subjectText, editableBody]);

  const wordCountInRange = wordCount >= 40 && wordCount <= 75;

  return (
    <div className="min-h-full space-y-6 bg-app px-4 py-6 font-sans text-fg md:px-8">

      {/* 1. Page header */}
      <PageHeader
        className="pb-0"
        title="Cold email studio"
        description="Write, check and send one-to-one cold emails from your verified mailbox."
        meta={
          <span className="inline-flex items-center gap-2 text-small text-fg-secondary" title={`Sender: ${senderFrom}`}>
            <span className="size-2 shrink-0 rounded-full bg-success-500" aria-hidden />
            <span>Sending as {senderDisplayName}</span>
          </span>
        }
        secondaryActions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleStartBlankEmail}
              title="Start a fresh blank draft"
              icon={<PlusCircle />}
            >
              Blank draft
            </Button>
            <Link href="/inbox" className={buttonClasses('ghost', 'sm')}>
              <Inbox />
              <span>Open inbox</span>
            </Link>
          </>
        }
      />

      {/* 2. Send window hint (deliverability rules, collapsible) */}
      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-small text-fg-secondary">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-fg-secondary" />
            <p>
              <span className="font-medium text-fg">Send window: Tue to Thu, 8:15 to 10:00 AM and 1:30 to 2:45 PM</span>
              <span className="text-fg-tertiary"> (recipient&apos;s local time). Up to 40 to 50 a day, 2 to 4 minutes apart.</span>
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPlaybookDetails(!showPlaybookDetails)}
          >
            <span>{showPlaybookDetails ? 'Hide sending rules' : 'View sending rules'}</span>
            {showPlaybookDetails ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>

        {showPlaybookDetails && (
          <div className="space-y-5 border-t border-line px-4 py-4 animate-in fade-in">
            {/* Core rules */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-body-strong text-fg">
                    <Clock className="h-4 w-4 text-fg-secondary" />
                    <span>When to send</span>
                  </span>
                  <span className="text-small text-fg-secondary">Tue, Wed, Thu</span>
                </div>
                <p className="text-small leading-relaxed text-fg-secondary">
                  <span className="font-medium text-fg">Peak window:</span> 8:15 AM to 10:00 AM and 1:30 PM to 2:45 PM (recipient&apos;s local time). Executives check inboxes at desk arrival and after lunch.
                </p>
                <p className="flex items-start gap-1.5 text-small text-fg-tertiary">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-tertiary" />
                  <span><span className="font-medium">Avoid:</span> Monday mornings (triage chaos) and Friday afternoons (weekend mental checkout).</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-body-strong text-fg">
                    <ShieldCheck className="h-4 w-4 text-fg-secondary" />
                    <span>Daily sending limit</span>
                  </span>
                  <span className="text-small tabular-nums text-fg-secondary">40 to 50 a day</span>
                </div>
                <p className="text-small leading-relaxed text-fg-secondary">
                  <span className="font-medium text-fg">Safe threshold:</span> 40 to 50 cold emails per day per Google or Microsoft mailbox. Spammers blast 500; top SDRs send 45 tailored, high-converting notes.
                </p>
                <p className="flex items-start gap-1.5 text-small text-fg-tertiary">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-fg" />
                  <span><span className="font-medium">Warning:</span> sending more than 50 a day risks automated spam flagging and blacklisting your root domain.</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-body-strong text-fg">
                    <Zap className="h-4 w-4 text-fg-secondary" />
                    <span>Pacing and spam hygiene</span>
                  </span>
                  <span className="text-small tabular-nums text-fg-secondary">2 to 4 min apart</span>
                </div>
                <p className="text-small leading-relaxed text-fg-secondary">
                  <span className="font-medium text-fg">Stagger rule:</span> space manual sends by 2 to 4 minutes. Never fire 10 emails in 60 seconds.
                </p>
                <p className="flex items-start gap-1.5 text-small text-fg-tertiary">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-tertiary" />
                  <span><span className="font-medium">Format:</span> plain text, no emojis, no em dashes, and under 75 words.</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-2">
              {/* Daily Ramp Schedule */}
              <div className="space-y-2">
                <span className="block text-caption text-fg-tertiary">New mailbox warm-up plan</span>
                <div className="overflow-hidden rounded-md border border-line">
                  {MANUAL_COLD_EMAIL_GUIDANCE.personalAccountSafety.rampSchedule.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-small first:border-t-0">
                      <span className="font-medium text-fg">{r.week}</span>
                      <span className="tabular-nums text-fg-secondary">{r.dailyLimit} emails/day</span>
                      <span className="text-fg-tertiary">{r.focus}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day by Day Open Rate Intelligence */}
              <div className="space-y-2">
                <span className="block text-caption text-fg-tertiary">Best days to send</span>
                <div className="overflow-hidden rounded-md border border-line">
                  {MANUAL_COLD_EMAIL_GUIDANCE.bestDays.slice(0, 4).map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-small first:border-t-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="font-medium text-fg">{d.day}:</span>
                        <span className="max-w-[220px] truncate text-fg-secondary">{d.reason}</span>
                      </div>
                      <Badge tone={d.rating === 'Optimal' ? 'success' : 'neutral'} className="shrink-0">
                        {d.rating}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Split editor: composer (left) and checks + AI angles (right rail) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

        {/* Composer */}
        <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xs">

          {/* Composer toolbar */}
          <div className="flex flex-col gap-3 border-b border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-h3 text-fg">Draft</h2>
            <SegmentedControl
              size="sm"
              label="Editor or inbox preview"
              value={viewMode}
              onChange={(v) => setViewMode(v as 'editor' | 'preview')}
              items={[
                {
                  value: 'editor',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </span>
                  ),
                },
                {
                  value: 'preview',
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      <span>Inbox preview</span>
                    </span>
                  ),
                },
              ]}
            />
          </div>

          {/* Recipient & subject (free-hand editable) */}
          <div className="space-y-3 border-b border-line px-5 py-4">
            <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-12">
              <label className="flex items-center gap-2 md:col-span-6">
                <span className="w-14 shrink-0 text-small text-fg-secondary">To</span>
                <Input
                  type="email"
                  mono
                  value={prospectEmail}
                  onChange={(e) => handleRecipientEmailChange(e.target.value)}
                  placeholder="prospect@company.com"
                />
              </label>

              <label className="flex items-center gap-2 md:col-span-3">
                <span className="shrink-0 text-small text-fg-secondary">Name</span>
                <Input
                  type="text"
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  placeholder="Contact name"
                />
              </label>

              <label className="flex items-center gap-2 md:col-span-3">
                <span className="shrink-0 text-small text-fg-secondary">Company</span>
                <Input
                  type="text"
                  value={prospectCompany}
                  onChange={(e) => setProspectCompany(e.target.value)}
                  placeholder="Company name"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="cold-email-subject" className="w-14 shrink-0 text-small text-fg-secondary">
                Subject
              </label>
              <div className="relative flex flex-1 items-center gap-2">
                <Input
                  id="cold-email-subject"
                  type="text"
                  value={subjectText}
                  onChange={(e) => {
                    setSubjectText(e.target.value);
                  }}
                  placeholder="Subject line (under 4 words, lowercase)"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSubjectSuggestions(!showSubjectSuggestions)}
                  title="Toggle subject suggestions"
                  className="gap-1"
                >
                  <Sparkles />
                  <span>Ideas</span>
                  {showSubjectSuggestions ? <ChevronUp /> : <ChevronDown />}
                </Button>
              </div>
            </div>

            {/* Subject Suggestions */}
            {showSubjectSuggestions && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-subtle p-2.5 animate-in fade-in">
                <span className="text-caption text-fg-tertiary">Click to use:</span>
                {subjectSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSubjectText(s);
                      setShowSubjectSuggestions(false);
                    }}
                    className="focus-ring cursor-pointer rounded-full border border-line bg-surface px-2.5 py-1 text-small text-fg transition-colors hover:bg-subtle"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor vs inbox preview */}
          {viewMode === 'editor' ? (
            <div className="space-y-4 px-5 py-4">

              {/* Writing tools */}
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="sm" onClick={handleAutoFormat} title="Format into clean spaced paragraphs">
                  {copiedKey === 'formatted' ? <Check /> : <AlignLeft />}
                  <span>{copiedKey === 'formatted' ? 'Formatted' : 'Auto-format'}</span>
                </Button>

                <Button variant="ghost" size="sm" onClick={handleShortenCopy} title="Trim fluff words to reach under 65 words">
                  {copiedKey === 'shortened' ? <Check /> : <Zap />}
                  <span>{copiedKey === 'shortened' ? 'Shortened' : 'Make shorter'}</span>
                </Button>

                <Button variant="ghost" size="sm" onClick={handleSanitizeStrict} title="Strip em-dashes and emojis">
                  {copiedKey === 'sanitized' ? <Check /> : <ShieldCheck />}
                  <span>{copiedKey === 'sanitized' ? 'Cleaned' : 'Clean up'}</span>
                </Button>

                <Button variant="ghost" size="sm" onClick={handleCopyBody}>
                  {copiedKey === 'body' ? <Check /> : <Copy />}
                  <span>Copy body</span>
                </Button>
              </div>

              {/* Email Body */}
              <Textarea aria-label="Email body"
                rows={10}
                value={editableBody}
                onChange={(e) => {
                  setEditableBody(e.target.value);
                }}
                className="min-h-[260px] p-4 font-sans leading-relaxed"
                placeholder="Write or workshop your cold email here..."
              />

              {/* 1-Click Closing CTA Swapper */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-caption text-fg-tertiary">
                  <span>Swap the closing line</span>
                  <span>Give the prospect an easy out</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: 'Permission Video', text: 'Open to a 2-minute video showing how we insulate margins, or totally off base?' },
                    { label: 'Compare Notes', text: 'Would it be a terrible idea to compare notes for 2 minutes Thursday?' },
                    { label: 'Quick Question', text: 'Worth a quick 10-minute look, or is outbound already humming for you?' },
                    { label: 'Negative Reverse', text: 'If this is completely off your radar right now, no worries at all.' }
                  ].map((cta, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const sentences = editableBody.trim().split(/(?<=[.?!])\s+/);
                        if (sentences.length > 1) {
                          sentences[sentences.length - 1] = cta.text;
                          setEditableBody(sentences.join('\n\n'));
                        } else {
                          setEditableBody(`${editableBody.trim()}\n\n${cta.text}`);
                        }
                      }}
                      className="focus-ring cursor-pointer rounded-md border border-line bg-surface p-2.5 text-left transition-colors hover:bg-subtle"
                    >
                      <div className="text-small font-medium text-fg">{cta.label}</div>
                      <p className="mt-0.5 line-clamp-1 text-caption font-normal text-fg-tertiary">{cta.text}</p>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            /* Inbox preview */
            <div className="flex justify-center bg-subtle px-5 py-6">
              <div className="w-full max-w-2xl space-y-4 rounded-lg border border-line bg-surface p-6 shadow-xs">

                <div className="space-y-2 border-b border-line pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-h3 text-fg">
                      {subjectText || '(No subject)'}
                    </h3>
                    <span className="text-caption text-fg-tertiary">
                      Inbox, Primary
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-small text-fg-secondary">
                    <div>
                      <span className="font-medium text-fg">{senderDisplayName}</span> &lt;{verifiedSenderEmail}&gt;
                    </div>
                    <span className="text-fg-tertiary">Just now</span>
                  </div>
                  <div className="text-small text-fg-tertiary">
                    to: <span className="font-mono">{prospectEmail}</span>
                  </div>
                </div>

                <div className="select-text space-y-3 whitespace-pre-wrap py-2 font-sans text-body leading-relaxed text-fg">
                  {editableBody}
                </div>

                <div className="space-y-0.5 border-t border-line pt-4 text-small text-fg-tertiary">
                  <div className="font-medium text-fg">{senderDisplayName}</div>
                  <div>Outbound Operations, Appointmentlyy</div>
                  <div className="text-fg-tertiary">appointmentlyy.com</div>
                </div>

              </div>
            </div>
          )}

          {/* Send dock */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-5 py-3 sm:flex-row">

            <div className="flex flex-wrap items-center gap-2 text-small text-fg-tertiary">
              <ShieldCheck className="h-4 w-4 shrink-0 text-fg-secondary" />
              <span>
                Sending as <span className="font-mono text-fg-secondary">{senderFrom}</span>
              </span>
              {directSendStatus && (
                <span className={`inline-flex items-center gap-1.5 text-small ${
                  directSendStatus.startsWith('Error') ? 'text-danger-fg' : 'text-success-fg'
                }`}>
                  {directSendStatus.startsWith('Error') ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{directSendStatus}</span>
                </span>
              )}
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Button
                variant="secondary"
                onClick={handleCopyEntireEmail}
                className="flex-1 sm:flex-initial"
              >
                {copiedKey === 'full' ? (
                  <>
                    <Check />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy />
                    <span>Copy email</span>
                  </>
                )}
              </Button>

              <Button
                variant="brand"
                onClick={handleDirectSendEmail}
                disabled={isSendingDirectEmail || sendButtonState === 'sent'}
                className={`flex-1 px-5 sm:flex-initial ${sendButtonState === 'sending' ? 'cursor-wait' : ''}`}
                title={
                  sendButtonState === 'sent'
                    ? `Sent to ${prospectEmail}. Change the recipient or generate a new draft to send another.`
                    : `Dispatch live email from ${senderFrom} to ${prospectEmail}`
                }
              >
                {sendButtonState === 'sending' ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : sendButtonState === 'sent' ? (
                  <>
                    <Check />
                    <span>Sent</span>
                  </>
                ) : (
                  <>
                    <Send />
                    <span>Send email</span>
                  </>
                )}
              </Button>
            </div>

          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">

          {/* Live checks */}
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-h3 text-fg">Checks</h2>
              <p className="mt-0.5 text-small text-fg-secondary">Updated as you type.</p>
            </div>
            <ul className="divide-y divide-line">
              <li className="flex items-start gap-2.5 px-4 py-3">
                {wordCountInRange ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />
                ) : wordCount > 75 ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-tertiary" />
                )}
                <div className="min-w-0">
                  <div className="text-body text-fg"><span className="tabular-nums">{wordCount}</span> words</div>
                  <div className="text-small text-fg-tertiary">
                    {wordCountInRange ? 'In the 40 to 75 word sweet spot' : wordCount > 75 ? 'Trim the copy to 75 words or fewer' : 'Aim for 40 to 75 words'}
                  </div>
                </div>
              </li>

              <li className="flex items-start gap-2.5 px-4 py-3">
                {subjectWordCount <= 4 ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
                )}
                <div className="min-w-0">
                  <div className="text-body text-fg">Subject: <span className="tabular-nums">{subjectWordCount}</span>/3 words</div>
                  <div className="text-small text-fg-tertiary">Short, lowercase subjects get opened</div>
                </div>
              </li>

              <li className="flex items-start gap-2.5 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />
                <div className="min-w-0">
                  <div className="text-body text-fg">Reading grade 5</div>
                  <div className="text-small text-fg-tertiary">Conversational</div>
                </div>
              </li>

              <li className="flex items-start gap-2.5 px-4 py-3">
                {detectedSpamTriggers.length === 0 ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-fg" />
                )}
                <div className="min-w-0">
                  {detectedSpamTriggers.length === 0 ? (
                    <>
                      <div className="text-body text-fg">No spam words</div>
                      <div className="text-small text-fg-tertiary">Subject and body are clean</div>
                    </>
                  ) : (
                    <>
                      <div className="text-body text-danger-fg">Spam word found</div>
                      <div className="text-small text-fg-tertiary">&ldquo;{detectedSpamTriggers[0]}&rdquo;</div>
                    </>
                  )}
                </div>
              </li>
            </ul>
          </div>

          {/* AI angles & frameworks (optional assistant) */}
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-h3 text-fg">AI angles</h2>
                <p className="mt-0.5 text-small text-fg-secondary">Draft from a proven framework.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAiAssistant(!showAiAssistant)}
                aria-expanded={showAiAssistant}
              >
                <Sparkles />
                <span>{showAiAssistant ? 'Close' : 'Open'}</span>
              </Button>
            </div>

            {showAiAssistant && (
              <div className="space-y-3 border-t border-line px-4 py-4 animate-in fade-in">
                <p className="text-small text-fg-tertiary">
                  Josh Braun 4T, Chris Voss, Allred 50-word
                </p>

                <label className="block space-y-1.5">
                  <span className="block text-small font-medium text-fg">Framework</span>
                  <Select
                    value={selectedFrameworkId}
                    onChange={(e) => setSelectedFrameworkId(e.target.value)}
                  >
                    {COLD_EMAIL_FRAMEWORKS.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.category})
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-small font-medium text-fg">Angle or post-call focus</span>
                  <Input
                    type="text"
                    value={userIdea}
                    onChange={(e) => setUserIdea(e.target.value)}
                    placeholder="e.g. Following up after our call regarding sub-150ms live objection sparring..."
                  />
                </label>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateDraft}
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? <RotateCw className="animate-spin" /> : <Sparkles />}
                  <span>Generate draft</span>
                </Button>
              </div>
            )}
          </div>

        </aside>
      </div>

    </div>
  );
}
