'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Sparkles,
  Copy,
  Check,
  Send,
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
  Textarea,
  buttonClasses
} from '@/components/ui';
import { saveEmailToStore, getConversationThreadKey } from '@/lib/emailStore';
import {
  MANUAL_COLD_EMAIL_GUIDANCE,
  formatEmailToParagraphs,
  sanitizeColdEmail
} from '@/lib/coldEmailStudio';
import { ASSISTANT_WORD_LIMIT, AUTO_FRAMEWORK_ID, enforceWordLimit, replaceClosingLine } from '@/lib/coldEmailAssistant';
import { describeCampaign, getCampaignMessage, postText, saveCampaignMessage, type CampaignMessage } from '@/lib/campaignMessage';
import ColdEmailAssistant, { type AssistantAutoStart } from '@/components/email/ColdEmailAssistant';
import CampaignMessageCard from '@/components/outreach/CampaignMessageCard';
import { useSession } from '@/lib/session';
import { isDemoWorkspace } from '@/lib/demoMode';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';

// B2B spam trigger words list
const COMMON_SPAM_WORDS = [
  'guarantee', 'guaranteed', '100% free', 'risk-free', 'buy now',
  'cheap', 'discount', 'act now', 'limited time', 'winner', 'cash bonus',
  'miracle', 'no obligation', 'congratulations', 'pure profit', 'earn extra cash'
];

export default function ColdEmailStudio() {
  const { session } = useSession();
  // The sample prospect and the pitch below are the platform owner's own: demo workspace only.
  const isDemo = useDemoWorkspace();
  const [demoAtMount] = useState<boolean>(() => isDemoWorkspace());

  // Dynamic verified sender from session
  // Demo workspace sends from the platform's verified domain. Client workspaces show the rep's own
  // name and address (their sending is paused until their email is connected in Admin › Integrations).
  const senderDisplayName = session?.repName || (isDemo ? 'Emil Halili' : 'You');
  const senderEmailRaw = session?.email || (isDemo ? 'emil@appointmentlyy.com' : '');
  const verifiedSenderEmail = !isDemo
    ? senderEmailRaw
    : senderEmailRaw.toLowerCase().endsWith('@appointmentlyy.com')
      ? senderEmailRaw
      : 'emil@appointmentlyy.com';
  const senderFrom = verifiedSenderEmail ? `${senderDisplayName} <${verifiedSenderEmail}>` : senderDisplayName;

  // Recipient / Prospect Free-Hand Inputs
  const [prospectEmail, setProspectEmailState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sdr_target_recipient_email');
      if (saved) return saved;
    }
    return isDemoWorkspace() ? 'emil@callview.ai' : '';
  });

  const isCallviewDefault = demoAtMount && prospectEmail.toLowerCase().includes('callview.ai');
  const [prospectName, setProspectName] = useState<string>(!demoAtMount ? '' : isCallviewDefault ? 'Emil Halili' : 'Julian Vance');
  const [prospectCompany, setProspectCompany] = useState<string>(!demoAtMount ? '' : isCallviewDefault ? 'Callview AI' : 'Apex Global BPO');
  const [prospectTitle, setProspectTitle] = useState<string>(!demoAtMount ? '' : isCallviewDefault ? 'Founder / CEO' : 'Director of Outbound Operations');

  // Sync stored CSV leads or URL query parameters on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const toParam = params.get('to');
        const nameParam = params.get('name');
        // 'prospectCompany', not 'company': ?company= is the workspace-onboarding param read by
        // syncSessionFromUrl, and would rename the rep's own workspace to the prospect's company.
        const companyParam = params.get('prospectCompany');
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
  const [subjectText, setSubjectText] = useState<string>(() => (isDemoWorkspace() ? 'quick question' : ''));
  const [showSubjectSuggestions, setShowSubjectSuggestions] = useState<boolean>(false);
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>(() => isDemoWorkspace() ? [
    'quick question',
    'outbound hold rate',
    'caller margin leak',
    'rookie lead burn'
  ] : ['quick question']);

  // Draft Body State
  const [editableBody, setEditableBody] = useState<string>(() => !isDemoWorkspace() ? '' :
    `Hi Emil,\n\nFollowing up after our call. Saw Callview AI is scaling outbound seats. Typically when BPO leaders scale outbound, the hidden leak is not lead volume, it is callers getting chopped on price by commodity competitors.\n\nTraditional coaching fails when reps freeze in the first 20 seconds. We feed consultative rebuttals in 150 milliseconds live on the dial.\n\nOpen to a 2-minute video showing how we insulate margins, or totally off base?`
  );

  // Writing assistant: framework (shared with the campaign message) and what it starts with.
  const [selectedFrameworkId, setSelectedFrameworkIdState] = useState<string>(() => getCampaignMessage().frameworkId || AUTO_FRAMEWORK_ID);
  const setSelectedFrameworkId = (id: string) => {
    setSelectedFrameworkIdState(id);
    saveCampaignMessage({ frameworkId: id });
  };
  // ?campaign=1 (from the LinkedIn tab) starts from the campaign message; ?mirror=linkedin mirrors the last post.
  // useSearchParams (not window.location): on client navigation the URL updates after this renders.
  const searchParams = useSearchParams();
  const [assistantStart, setAssistantStart] = useState<AssistantAutoStart | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = searchParams;
    const c = getCampaignMessage();
    if (params.get('mirror') === 'linkedin' && c.lastPost) {
      return {
        key: `mirror-${c.lastPost.at}`,
        stage: 'draft',
        idea: 'Mirror my LinkedIn post as a cold email: same angle, pain and offer.',
        sourcePost: postText(c.lastPost),
        label: 'Mirror my LinkedIn post as a cold email.',
      };
    }
    if (params.get('campaign') === '1' && describeCampaign(c)) {
      return { key: `campaign-${Date.now()}`, idea: `Write a cold email from our campaign message.\n${describeCampaign(c)}`, label: 'Use the campaign message.' };
    }
    return null;
  });
  const startFromCampaign = (c: CampaignMessage) => {
    setAssistantStart({ key: `campaign-${Date.now()}`, idea: `Write a cold email from our campaign message.\n${describeCampaign(c)}`, label: 'Use the campaign message.' });
  };

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

    // Smartly default name/company if pointing to Callview (demo workspace only)
    if (isDemo && newEmail.toLowerCase().includes('callview.ai') && (!prospectName || prospectName === 'Julian Vance')) {
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

    // Keeps the greeting, the closing question and the signature; drops middle sentences.
    text = enforceWordLimit(formatEmailToParagraphs(text).join('\n\n'), 66).body;
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

    if (isDemo && prospectEmail.trim().toLowerCase().includes('callview.ai')) {
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

      {/* Shared campaign message (mirrored by the LinkedIn tab) */}
      <CampaignMessageCard current="email" onUse={startFromCampaign} />

      {/* 3. Split editor: composer (left) and checks + writing assistant (right rail) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

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
                      onClick={() => setEditableBody(replaceClosingLine(editableBody, cta.text))}
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
                  {isDemo ? (
                    <>
                      <div>Outbound Operations, Appointmentlyy</div>
                      <div className="text-fg-tertiary">appointmentlyy.com</div>
                    </>
                  ) : (
                    session?.tenantName && <div>{session.tenantName}</div>
                  )}
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
                ) : wordCount >= ASSISTANT_WORD_LIMIT ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-fg" />
                ) : wordCount > 75 ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-tertiary" />
                )}
                <div className="min-w-0">
                  <div className="text-body text-fg"><span className="tabular-nums">{wordCount}</span> words</div>
                  <div className="text-small text-fg-tertiary">
                    {wordCountInRange
                      ? 'In the 40 to 75 word sweet spot'
                      : wordCount >= ASSISTANT_WORD_LIMIT
                        ? `Over the hard limit: keep it under ${ASSISTANT_WORD_LIMIT} words`
                        : wordCount > 75
                          ? 'Trim the copy to 75 words or fewer'
                          : 'Aim for 40 to 75 words'}
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

          {/* Writing assistant (asks, plans, then drafts from a framework) */}
          <div className="rounded-lg border border-line bg-surface shadow-xs">
            <ColdEmailAssistant
              recipient={{ name: prospectName, company: prospectCompany, title: prospectTitle }}
              sender={{ name: session?.repName || '', company: session?.tenantName || '' }}
              draft={{ subject: subjectText, body: editableBody }}
              onApply={(subject, body) => {
                setSubjectText(subject);
                setEditableBody(body);
                setSendButtonState('idle');
                setDirectSendStatus(null);
                if (subject && !subjectSuggestions.includes(subject)) setSubjectSuggestions((prev) => [subject, ...prev].slice(0, 6));
              }}
              frameworkId={selectedFrameworkId}
              onFrameworkChange={setSelectedFrameworkId}
              autoStart={assistantStart}
            />
          </div>

        </aside>
      </div>

    </div>
  );
}
