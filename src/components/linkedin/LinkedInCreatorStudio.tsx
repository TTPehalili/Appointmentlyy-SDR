'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  MessageSquare,
  RotateCw,
  Upload,
  ArrowRight,
  CheckCircle,
  Pencil,
  Lightbulb,
  Calendar,
  Layers,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  Repeat2,
  MoreHorizontal
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import {
  Button,
  IconButton,
  PageHeader,
  SearchInput,
  Select,
  Tabs,
  Textarea
} from '@/components/ui';
import LinkedInVisualCard from './LinkedInVisualCard';
import { 
  LINKEDIN_FRAMEWORKS, 
  CONTINUITY_SERIES_PRESETS,
  LINKEDIN_IDEA_PRESETS,
  summarizeCsvLeads, 
  getDeterministicLinkedInSeries, 
  getDeterministicViralComments, 
  getDeterministicThreadFollowUps, 
  sanitizeTextForLinkedIn, 
  CsvIntelligenceSummary, 
  LinkedInSeries, 
  LinkedInPost, 
  ViralCommentDraft, 
  ThreadFollowUpDraft 
} from '@/lib/linkedinStudio';
import { DEMO_CADENCE_LEADS, CadenceLeadRecord } from '@/lib/cadenceMaster';
import { isDemoWorkspace } from '@/lib/demoMode';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { useSession } from '@/lib/session';
import UploadLeadsCsvModal from '@/components/cockpit/UploadLeadsCsvModal';

export default function LinkedInCreatorStudio() {
  const [activeTab, setActiveTab] = useState<'series' | 'viral' | 'dossier'>('series');

  // The sample leads and the author profile are the platform owner's: demo workspace only.
  const isDemo = useDemoWorkspace();
  const { repName, tenantName } = useSession();
  const authorName = isDemo ? 'Emil Halili' : repName || 'You';
  const authorHeadline = isDemo
    ? 'CEO & Founder at Appointmentlyy | AI Outbound & BPO Systems'
    : tenantName;
  const authorInitials = authorName.split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase();

  // Leads & CSV Intelligence State
  const [leads, setLeads] = useState<CadenceLeadRecord[]>(() => (isDemoWorkspace() ? DEMO_CADENCE_LEADS : []));
  const [csvSummary, setCsvSummary] = useState<CsvIntelligenceSummary>(() => summarizeCsvLeads(isDemoWorkspace() ? DEMO_CADENCE_LEADS : []));
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvSearchTerm, setCsvSearchTerm] = useState('');

  // Series Generation State
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('contrarian-truth');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('broker-margin-continuity');
  const [customTopic, setCustomTopic] = useState<string>(
    'Brokers take up to a 60% cut on cheap pay-per-performance campaigns while the BPO carries 100% of the OPEX burden. They take over operations without risking any capital. It is time to take internal acquisition back to all BPOs.'
  );
  const [isGeneratingSeries, setIsGeneratingSeries] = useState(false);
  const [seriesData, setSeriesData] = useState<LinkedInSeries>(() => 
    getDeterministicLinkedInSeries(summarizeCsvLeads(isDemoWorkspace() ? DEMO_CADENCE_LEADS : []), 'contrarian-truth', 'broker-margin-continuity')
  );

  // Active Episode Focus State (0 = Ep 1 Tuesday, 1 = Ep 2 Thursday, 2 = Ep 3 Friday)
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState<number>(0);

  // Post Draft Inline Editing State
  const [editingPostIds, setEditingPostIds] = useState<Record<string, boolean>>({});

  // Show Comments & Visual Toggles inside the LinkedIn Feed Post
  const [showInjectedComments, setShowInjectedComments] = useState<boolean>(true);
  const [showVisualStudio, setShowVisualStudio] = useState<boolean>(false);

  const currentPreset = CONTINUITY_SERIES_PRESETS.find(p => p.id === selectedPresetId) || CONTINUITY_SERIES_PRESETS[0];
  const activeFramework = LINKEDIN_FRAMEWORKS.find(f => f.id === selectedFrameworkId) || LINKEDIN_FRAMEWORKS[0];

  // Viral Post Comment State
  const [viralPostInput, setViralPostInput] = useState<string>(
    `Unpopular opinion: Cold outreach is dying. Buyers are overwhelmed with automated AI sequences and template spam. If your BDRs are still sending 100 emails and dials a day, you are burning your brand reputation for a 0.2% reply rate. In 2025, inbound content and peer referrals are the only channels that convert enterprise deals.`
  );
  const [selectedAngle, setSelectedAngle] = useState<string>('All');
  const [isGeneratingComments, setIsGeneratingComments] = useState(false);
  const [viralComments, setViralComments] = useState<ViralCommentDraft[]>(() => 
    getDeterministicViralComments(viralPostInput)
  );

  // Thread Conversation Accelerator State
  const [authorReplyInput, setAuthorReplyInput] = useState<string>(
    'Fair point, but in our experience enterprise buyers ignore cold outreach completely unless they already recognize the brand.'
  );
  const [previousCommentInput, setPreviousCommentInput] = useState<string>(
    'Interesting take, but in BPO operations we usually see the opposite. Activity numbers mean nothing if the list has already been fatigued by three other agencies. List exclusivity beats call volume every time.'
  );
  const [isGeneratingThreadReplies, setIsGeneratingThreadReplies] = useState(false);
  const [threadReplies, setThreadReplies] = useState<ThreadFollowUpDraft[]>(() => 
    getDeterministicThreadFollowUps('Fair point, but in our experience enterprise buyers ignore cold outreach completely unless they already recognize the brand.')
  );

  // Copy Feedback State
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load cached CSV leads from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sdr_active_csv_leads');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLeads(parsed);
          setCsvSummary(summarizeCsvLeads(parsed));
        }
      }
    } catch (e) {
      console.warn('Failed to load cached CSV leads:', e);
    }
  }, []);

  // Keyboard shortcut listener: Ctrl+Enter (or Cmd+Enter) to generate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (activeTab === 'series') {
          handleGenerateSeries();
        } else if (activeTab === 'viral') {
          handleGenerateViralComments();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, customTopic, selectedFrameworkId, selectedPresetId, viralPostInput, selectedAngle]);

  const handleLeadsImported = (imported: CadenceLeadRecord[]) => {
    setLeads(imported);
    const newSummary = summarizeCsvLeads(imported);
    setCsvSummary(newSummary);
    try {
      localStorage.setItem('sdr_active_csv_leads', JSON.stringify(imported));
    } catch (e) {
      console.warn('Failed to cache leads:', e);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Switch Week / Continuity Arc
  const handleSelectWeekPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const updated = getDeterministicLinkedInSeries(csvSummary, selectedFrameworkId, presetId);
    setSeriesData(updated);
    setActiveEpisodeIdx(0);
  };

  // Toggle Edit Mode for a post card
  const toggleEditMode = (postId: string) => {
    setEditingPostIds(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }));
  };

  // Update post field directly
  const handleUpdatePostField = (postId: string, field: 'hook' | 'body' | 'cta' | 'hashtags' | 'injectedComments', value: any) => {
    setSeriesData(prev => {
      const updatedPosts = prev.posts.map(p => {
        if (p.id === postId) {
          const updated = { ...p, [field]: value };
          const hookText = field === 'hook' ? value : p.hook;
          const bodyText = field === 'body' ? value : p.body;
          const ctaText = field === 'cta' ? value : p.cta;
          updated.wordCount = `${hookText} ${bodyText} ${ctaText}`.trim().split(/\s+/).filter(Boolean).length;
          return updated;
        }
        return p;
      });
      return { ...prev, posts: updatedPosts };
    });
  };

  // Sanitize post (remove em dashes and emojis)
  const handleCleanPost = (postId: string) => {
    setSeriesData(prev => {
      const updatedPosts = prev.posts.map(p => {
        if (p.id === postId) {
          const cleanHook = sanitizeTextForLinkedIn(p.hook);
          const cleanBody = sanitizeTextForLinkedIn(p.body);
          const cleanCta = sanitizeTextForLinkedIn(p.cta);
          const cleanComments = (p.injectedComments || []).map(c => sanitizeTextForLinkedIn(c));
          return {
            ...p,
            hook: cleanHook,
            body: cleanBody,
            cta: cleanCta,
            injectedComments: cleanComments,
            wordCount: `${cleanHook} ${cleanBody} ${cleanCta}`.trim().split(/\s+/).filter(Boolean).length
          };
        }
        return p;
      });
      return { ...prev, posts: updatedPosts };
    });
    setCopiedKey(`cleaned-${postId}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Generate 3-Post Series via Gemini
  const handleGenerateSeries = async (presetOverride?: string) => {
    const presetIdToUse = presetOverride || selectedPresetId;
    if (presetOverride) {
      setSelectedPresetId(presetOverride);
    }
    setIsGeneratingSeries(true);
    try {
      const res = await fetch('/api/ai/linkedin-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_series',
          leads,
          csvSummary,
          frameworkId: selectedFrameworkId,
          presetId: presetIdToUse,
          customTopicInstruction: customTopic
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.series) {
          setSeriesData(data.series);
          setActiveEpisodeIdx(0);
          return;
        }
      }
      const fallback = getDeterministicLinkedInSeries(csvSummary, selectedFrameworkId, presetIdToUse);
      setSeriesData(fallback);
      setActiveEpisodeIdx(0);
    } catch (err) {
      console.error('Error generating series:', err);
      const fallback = getDeterministicLinkedInSeries(csvSummary, selectedFrameworkId, presetIdToUse);
      setSeriesData(fallback);
      setActiveEpisodeIdx(0);
    } finally {
      setIsGeneratingSeries(false);
    }
  };

  // Generate Viral Post Comments via Gemini
  const handleGenerateViralComments = async () => {
    if (!viralPostInput.trim()) return;
    setIsGeneratingComments(true);
    try {
      const res = await fetch('/api/ai/linkedin-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_viral_comment',
          viralPostText: viralPostInput,
          commentAngle: selectedAngle
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.commentDrafts)) {
          setViralComments(data.commentDrafts);
        }
      } else {
        setViralComments(getDeterministicViralComments(viralPostInput));
      }
    } catch (err) {
      console.error('Error generating viral comments:', err);
      setViralComments(getDeterministicViralComments(viralPostInput));
    } finally {
      setIsGeneratingComments(false);
    }
  };

  // Generate Thread Follow-Ups via Gemini
  const handleGenerateThreadReplies = async () => {
    if (!authorReplyInput.trim()) return;
    setIsGeneratingThreadReplies(true);
    try {
      const res = await fetch('/api/ai/linkedin-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_thread_reply',
          viralPostText: viralPostInput,
          myPreviousComment: previousCommentInput,
          authorReplyText: authorReplyInput
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.threadFollowUps)) {
          setThreadReplies(data.threadFollowUps);
        }
      } else {
        setThreadReplies(getDeterministicThreadFollowUps(authorReplyInput));
      }
    } catch (err) {
      console.error('Error generating thread replies:', err);
      setThreadReplies(getDeterministicThreadFollowUps(authorReplyInput));
    } finally {
      setIsGeneratingThreadReplies(false);
    }
  };

  // Active post in the LinkedIn feed
  const activePost: LinkedInPost = seriesData.posts[activeEpisodeIdx] || seriesData.posts[0];
  const fullPostText = `${activePost.hook}\n\n${activePost.body}\n\n${activePost.cta}\n\n${activePost.hashtags.join(' ')}`;

  // Filtered CSV leads for Dossier view
  const filteredLeads = leads.filter(l => {
    if (!csvSearchTerm.trim()) return true;
    const term = csvSearchTerm.toLowerCase();
    return (
      (l.name && l.name.toLowerCase().includes(term)) ||
      (l.company && l.company.toLowerCase().includes(term)) ||
      (l.title && l.title.toLowerCase().includes(term)) ||
      (l.painPoint && l.painPoint.toLowerCase().includes(term))
    );
  });

  return (
    <div className="min-h-full bg-app px-4 py-6 font-sans text-fg md:px-8">

      {/* 1. Page header + sub-view tabs */}
      <PageHeader
        title="LinkedIn studio"
        description="Plan a weekly post series from your prospect data, then copy each post to LinkedIn."
        secondaryActions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCsvModalOpen(true)}
            title="Upload CSV leads"
          >
            <Upload />
            <span className="hidden sm:inline">Upload CSV</span>
            <span className="text-fg-secondary">{csvSummary.dominantHeadcount}</span>
          </Button>
        }
        tabs={
          <Tabs
            label="LinkedIn studio views"
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'series' | 'viral' | 'dossier')}
            items={[
              { value: 'series', label: 'Post series' },
              { value: 'viral', label: 'Comment copilot' },
              { value: 'dossier', label: 'CSV intel', count: leads.length },
            ]}
          />
        }
      />

      {/* ========================================================================= */}
      {/* TAB 1: POST SERIES (editor left, series and episode planner right)       */}
      {/* ========================================================================= */}
      {activeTab === 'series' && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">

          {/* Post editor and preview (8 cols) */}
          <div className="space-y-4 lg:col-span-8">

            {/* Episode switcher and post actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-small text-fg-secondary">Episode</span>
                <div className="inline-flex rounded-md border border-line bg-subtle p-0.5">
                  {seriesData.posts.map((p, idx) => {
                    const isSelected = activeEpisodeIdx === idx;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActiveEpisodeIdx(idx)}
                        aria-pressed={isSelected}
                        className={`focus-ring flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-small transition-colors ${
                          isSelected
                            ? 'bg-surface font-medium text-fg shadow-xs'
                            : 'text-fg-secondary hover:text-fg'
                        }`}
                      >
                        <span>{p.dayLabel.split('•')[0].trim()}</span>
                        <span className="tabular-nums text-fg-tertiary">{p.episodeNumber}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCleanPost(activePost.id)}
                  title="Verify 0 em-dashes and 0 emojis"
                >
                  {copiedKey === `cleaned-${activePost.id}` ? <Check /> : <ShieldCheck />}
                  <span>{copiedKey === `cleaned-${activePost.id}` ? 'Cleaned' : 'Audit rules'}</span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => toggleEditMode(activePost.id)}
                  aria-pressed={!!editingPostIds[activePost.id]}
                  className={editingPostIds[activePost.id] ? 'bg-selected' : ''}
                >
                  <Pencil />
                  <span>{editingPostIds[activePost.id] ? 'Done' : 'Edit post'}</span>
                </Button>

                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => copyToClipboard(fullPostText, `copy-main-${activePost.id}`)}
                >
                  {copiedKey === `copy-main-${activePost.id}` ? (
                    <>
                      <Check />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy />
                      <span>Copy for LinkedIn</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Post preview card */}
            <div className="overflow-hidden rounded-lg border border-line bg-surface text-left shadow-xs">

              {/* Author */}
              <div className="flex items-start justify-between px-5 pb-2 pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-subtle text-small font-medium text-fg-secondary">
                    {isDemo ? (
                      <img
                        src="/images/emil-halili.gif"
                        alt={authorName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span aria-hidden>{authorInitials}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-body-strong text-fg">{authorName}</div>
                    {authorHeadline && (
                      <p className="line-clamp-1 text-small text-fg-secondary">
                        {authorHeadline}
                      </p>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 text-caption text-fg-tertiary">
                      <LinkedinIcon className="h-3 w-3 fill-current text-fg-tertiary" />
                      <span>Post preview, episode {activePost.episodeNumber}</span>
                    </div>
                  </div>
                </div>

                <IconButton label="More options" size="sm">
                  <MoreHorizontal />
                </IconButton>
              </div>

              {/* Post content */}
              <div className="px-5 py-3 text-body text-fg">
                {editingPostIds[activePost.id] ? (
                  /* Inline edit mode */
                  <div className="space-y-3 rounded-md border border-line bg-subtle p-4">
                    <label className="block space-y-1.5">
                      <span className="block text-small font-medium text-fg">Hook (first 2 lines)</span>
                      <Textarea
                        rows={2}
                        value={activePost.hook}
                        onChange={(e) => handleUpdatePostField(activePost.id, 'hook', e.target.value)}
                        className="min-h-0 font-medium"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="block text-small font-medium text-fg">Body (under 90 words)</span>
                      <Textarea
                        rows={5}
                        value={activePost.body}
                        onChange={(e) => handleUpdatePostField(activePost.id, 'body', e.target.value)}
                        className="min-h-0 leading-relaxed"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="block text-small font-medium text-fg">Closing question</span>
                      <Textarea
                        rows={2}
                        value={activePost.cta}
                        onChange={(e) => handleUpdatePostField(activePost.id, 'cta', e.target.value)}
                        className="min-h-0"
                      />
                    </label>
                    <div className="flex justify-end">
                      <Button variant="primary" size="sm" onClick={() => toggleEditMode(activePost.id)}>
                        <Check />
                        <span>Done editing</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Post preview */
                  <div className="space-y-3 whitespace-pre-line font-sans">
                    <div className="text-h3 text-fg">
                      {activePost.hook}
                    </div>

                    <div className="text-body leading-relaxed text-fg">
                      {activePost.body}
                    </div>

                    <div className="text-body font-medium text-fg">
                      {activePost.cta}
                    </div>

                    <div className="space-x-1.5 pt-1 text-small text-fg-secondary">
                      {activePost.hashtags.map((tag, tIdx) => (
                        <span key={tIdx}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Media attachment */}
              <div className="mt-2 border-t border-line">
                <div className="flex items-center justify-between gap-3 px-5 py-2">
                  <span className="flex items-center gap-1.5 text-small text-fg-secondary">
                    <Layers className="h-4 w-4 text-fg-secondary" />
                    <span>Image: {showVisualStudio ? 'photo and prompt studio' : 'graphic card preview'}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowVisualStudio(!showVisualStudio)}
                  >
                    <span>{showVisualStudio ? 'Hide photo and prompt studio' : 'Open photo and prompt studio'}</span>
                    {showVisualStudio ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </div>

                {showVisualStudio ? (
                  <div className="border-t border-line p-4">
                    <LinkedInVisualCard
                      visualConfig={activePost.visualCard}
                      imagePrompt={activePost.imagePrompt}
                      realisticPhotoPrompt={activePost.realisticPhotoPrompt}
                      realisticImageUrl={activePost.realisticImageUrl}
                      alternativeImageUrl={activePost.alternativeImageUrl}
                      alternativeImageLabel={activePost.alternativeImageLabel}
                      alternativeImagePrompt={activePost.alternativeImagePrompt}
                      episodeNumber={activePost.episodeNumber}
                      postTitle={activePost.title}
                      postHook={activePost.hook}
                      postBody={activePost.body}
                    />
                  </div>
                ) : (
                  /* Compact graphic card preview (the image itself is dark) */
                  <div className="relative flex min-h-[160px] items-center justify-center overflow-hidden bg-inverse p-4 text-ink-50">
                    <div className="max-w-md space-y-1.5 p-3 text-center">
                      <span className="block text-caption text-ink-400">
                        {activePost.visualCard?.tag || `EPISODE ${activePost.episodeNumber}`}
                      </span>
                      <h4 className="text-h3 text-ink-50">
                        {activePost.visualCard?.headline || activePost.title}
                      </h4>
                      <p className="line-clamp-2 text-small text-ink-400">
                        {activePost.visualCard?.subheadline || activePost.hook}
                      </p>
                      {activePost.visualCard?.metric && (
                        <div className="pt-1 text-h2 tabular-nums text-ink-50">
                          {activePost.visualCard.metric}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Post action row */}
              <div className="grid grid-cols-4 gap-1 border-t border-line px-2 py-1">
                <Button variant="ghost" size="sm">
                  <ThumbsUp />
                  <span>Like</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInjectedComments(!showInjectedComments)}
                  aria-expanded={showInjectedComments}
                  className="text-fg"
                >
                  <MessageSquare />
                  <span>Comment (3)</span>
                </Button>
                <Button variant="ghost" size="sm">
                  <Repeat2 />
                  <span>Repost</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(fullPostText, `copy-btn-${activePost.id}`)}
                  className="text-fg"
                >
                  {copiedKey === `copy-btn-${activePost.id}` ? <Check /> : <Copy />}
                  <span>{copiedKey === `copy-btn-${activePost.id}` ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>

              {/* Author comments to post right after publishing */}
              {showInjectedComments && (
                <div className="space-y-3 border-t border-line px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-body-strong text-fg">
                      <MessageSquare className="h-4 w-4 text-fg-secondary" />
                      <span>Your first comments: post right after publishing</span>
                    </span>
                    <span className="text-small text-fg-tertiary">
                      No emojis or em dashes
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {activePost.injectedComments.map((comment, cIdx) => (
                      <div key={cIdx} className="flex items-start gap-2.5">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-subtle text-caption font-medium text-fg-secondary">
                          {isDemo ? (
                            <img
                              src="/images/emil-halili.gif"
                              alt={authorName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span aria-hidden>{authorInitials}</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-1 rounded-lg border border-line bg-subtle p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-small font-medium text-fg">{authorName}</span>
                              <span className="text-caption text-fg-tertiary">Author</span>
                            </div>
                            <span className="text-caption text-fg-tertiary">
                              {cIdx === 0 ? 'Comment 1 (Sacred Cow)' : cIdx === 1 ? 'Comment 2 (Debate Flame)' : 'Comment 3 (Excuse Shredder)'}
                            </span>
                          </div>
                          <p className="text-small leading-snug text-fg">
                            {comment}
                          </p>
                          <div className="flex justify-end pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(comment, `feed-cmt-${cIdx}`)}
                              className="h-7 px-2"
                            >
                              {copiedKey === `feed-cmt-${cIdx}` ? <Check /> : <Copy />}
                              <span>{copiedKey === `feed-cmt-${cIdx}` ? 'Copied' : 'Copy comment'}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Series and episode planner (4 cols) */}
          <aside className="space-y-4 lg:col-span-4">

            {/* Series summary */}
            <div className="rounded-lg border border-line bg-surface p-4 text-left shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3 text-fg">Series plan</h2>
                <span className="text-small tabular-nums text-fg-secondary">
                  Week {currentPreset.weekNumber} of 4
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-small">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">Audience</dt>
                  <dd className="text-right text-fg">BPO Founders &amp; CROs</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">Cadence</dt>
                  <dd className="text-right text-fg">Tue, Thu, Fri</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-secondary">This week</dt>
                  <dd className="text-right tabular-nums text-fg">{currentPreset.episodesRange}</dd>
                </div>
              </dl>
            </div>

            {/* 4-week series */}
            <div className="space-y-3 rounded-lg border border-line bg-surface p-4 text-left shadow-xs">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-fg-secondary" />
                <h2 className="text-h3 text-fg">4-week series</h2>
              </div>

              <div className="space-y-1.5">
                {CONTINUITY_SERIES_PRESETS.map((p) => {
                  const isSelected = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectWeekPreset(p.id)}
                      aria-pressed={isSelected}
                      className={`focus-ring w-full cursor-pointer rounded-md border px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? 'border-line-strong bg-selected text-fg'
                          : 'border-line bg-surface text-fg hover:bg-subtle'
                      }`}
                    >
                      <div className="flex items-center justify-between text-caption text-fg-tertiary">
                        <span>Week {p.weekNumber}</span>
                        <span className="tabular-nums">{p.episodesRange}</span>
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-small font-medium">
                        {p.title.replace(/^Week \d+:\s*/, '')}
                      </div>
                    </button>
                  );
                })}
              </div>

              {currentPreset.nextPresetId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSelectWeekPreset(currentPreset.nextPresetId!)}
                  className="w-full"
                >
                  <span>Advance to week {((currentPreset.weekNumber) % 4) + 1}</span>
                  <ArrowRight />
                </Button>
              )}
            </div>

            {/* Framework & idea box */}
            <div className="space-y-4 rounded-lg border border-line bg-surface p-4 text-left shadow-xs">
              <label className="block space-y-1.5">
                <span className="block text-small font-medium text-fg">Writing framework</span>
                <Select
                  value={selectedFrameworkId}
                  onChange={(e) => setSelectedFrameworkId(e.target.value)}
                >
                  {LINKEDIN_FRAMEWORKS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} [{f.tag}]
                    </option>
                  ))}
                </Select>
              </label>

              <div className="space-y-1.5">
                <label htmlFor="linkedin-idea-box" className="block text-small font-medium text-fg">
                  Your angle
                </label>
                <Textarea
                  id="linkedin-idea-box"
                  rows={3}
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="Type your raw thought, experience, or observation here..."
                  className="resize-none text-small leading-relaxed"
                />

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {LINKEDIN_IDEA_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setCustomTopic(preset.idea);
                        if (preset.frameworkId) setSelectedFrameworkId(preset.frameworkId);
                      }}
                      className="focus-ring inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-caption text-fg-secondary transition-colors hover:bg-subtle hover:text-fg"
                    >
                      <Lightbulb className="h-3 w-3" />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => handleGenerateSeries()}
                disabled={isGeneratingSeries}
                className="w-full"
              >
                {isGeneratingSeries ? (
                  <>
                    <RotateCw className="animate-spin" />
                    <span>Writing series...</span>
                  </>
                ) : (
                  <>
                    <Sparkles />
                    <span>Write 3-post series</span>
                  </>
                )}
              </Button>
            </div>

          </aside>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: VIRAL COMMENT COPILOT                                              */}
      {/* ========================================================================= */}
      {activeTab === 'viral' && (
        <div className="mx-auto max-w-5xl space-y-4">

          {/* Post input */}
          <div className="space-y-3 rounded-lg border border-line bg-surface p-5 text-left shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-h3 text-fg">Comment copilot</h2>
                <p className="mt-0.5 max-w-[80ch] text-small text-fg-secondary">
                  Paste a popular post from an influencer, buyer or competitor. AI drafts short, thoughtful comments you can post on LinkedIn yourself.
                </p>
              </div>
              <span className="text-small text-fg-tertiary">
                Under 42 words, no emojis or em dashes
              </span>
            </div>

            <Textarea
              rows={4}
              value={viralPostInput}
              onChange={(e) => setViralPostInput(e.target.value)}
              placeholder="Paste viral LinkedIn post text here..."
              className="resize-none leading-relaxed"
            />

            <div className="flex flex-col justify-between gap-3 pt-1 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-small text-fg-secondary">Angle</span>
                {['All', 'Counter-Perspective', 'Consultative Question', 'Frontline Operator', 'Punchy 20-Word'].map((angle) => (
                  <button
                    key={angle}
                    type="button"
                    onClick={() => setSelectedAngle(angle)}
                    aria-pressed={selectedAngle === angle}
                    className={`focus-ring cursor-pointer rounded-full border px-2.5 py-1 text-small transition-colors ${
                      selectedAngle === angle
                        ? 'border-action bg-action text-action-fg'
                        : 'border-line bg-surface text-fg-secondary hover:bg-subtle hover:text-fg'
                    }`}
                  >
                    {angle}
                  </button>
                ))}
              </div>

              <Button
                variant="brand"
                onClick={handleGenerateViralComments}
                disabled={isGeneratingComments || !viralPostInput.trim()}
              >
                {isGeneratingComments ? (
                  <>
                    <RotateCw className="animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles />
                    <span>Draft comments</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Drafted comments */}
          <div className="grid grid-cols-1 gap-3 text-left md:grid-cols-2">
            {viralComments.map((draft) => (
              <div
                key={draft.id}
                className="flex flex-col justify-between space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-strong text-fg">
                      {draft.angle}
                    </span>
                    <span className="text-small tabular-nums text-fg-tertiary">
                      {draft.wordCount} words
                    </span>
                  </div>

                  <p className="rounded-md border border-line bg-subtle p-3 text-small leading-relaxed text-fg">
                    &ldquo;{draft.comment}&rdquo;
                  </p>

                  <p className="text-small text-fg-secondary">
                    Intent: {draft.intent}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-line pt-3">
                  <span className="flex items-center gap-1 text-small text-fg-tertiary">
                    <CheckCircle className="h-3.5 w-3.5 text-success-fg" />
                    No emojis or em dashes
                  </span>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(draft.comment, draft.id)}
                  >
                    {copiedKey === draft.id ? (
                      <>
                        <Check />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy />
                        <span>Copy comment</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Thread follow-ups */}
          <div className="space-y-3 rounded-lg border border-line bg-surface p-5 text-left shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-h3 text-fg">
                  Thread follow-ups
                </h3>
                <p className="mt-0.5 text-small text-fg-secondary">
                  When the author or prospect replies, draft 3 follow-up replies to build rapport.
                </p>
              </div>
              <span className="text-small text-fg-tertiary">
                Under 35 words, no emojis
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="block text-small font-medium text-fg">Your first comment</span>
                <Textarea
                  rows={2}
                  value={previousCommentInput}
                  onChange={(e) => setPreviousCommentInput(e.target.value)}
                  className="min-h-0 resize-none text-small"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-small font-medium text-fg">Author&apos;s reply</span>
                <Textarea
                  rows={2}
                  value={authorReplyInput}
                  onChange={(e) => setAuthorReplyInput(e.target.value)}
                  className="min-h-0 resize-none text-small"
                />
              </label>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="secondary"
                onClick={handleGenerateThreadReplies}
                disabled={isGeneratingThreadReplies || !authorReplyInput.trim()}
              >
                {isGeneratingThreadReplies ? (
                  <>
                    <RotateCw className="animate-spin" />
                    <span>Drafting follow-ups...</span>
                  </>
                ) : (
                  <>
                    <Sparkles />
                    <span>Draft follow-ups</span>
                  </>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-3">
              {threadReplies.map((r) => (
                <div key={r.id} className="flex flex-col justify-between space-y-2 rounded-md border border-line bg-subtle p-3">
                  <div>
                    <div className="flex justify-between gap-2 text-small">
                      <span className="font-medium text-fg">{r.stage}</span>
                      <span className="tabular-nums text-fg-tertiary">{r.wordCount} words</span>
                    </div>
                    <p className="mt-1 text-small leading-snug text-fg">&ldquo;{r.reply}&rdquo;</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-2 text-small">
                    <span className="text-fg-secondary">{r.strategicGoal}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(r.reply, r.id)}
                      className="h-7 px-2"
                    >
                      {copiedKey === r.id ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CSV PROSPECT INTELLIGENCE                                           */}
      {/* ========================================================================= */}
      {activeTab === 'dossier' && (
        <div className="mx-auto max-w-5xl space-y-4 text-left">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
              <span className="text-caption text-fg-tertiary">Accounts analyzed</span>
              <div className="mt-1 text-kpi tabular-nums text-fg">{csvSummary.totalLeads}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
              <span className="text-caption text-fg-tertiary">Main segment</span>
              <div className="mt-1 text-body-strong text-fg">{csvSummary.dominantHeadcount}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
              <span className="text-caption text-fg-tertiary">Top pain point</span>
              <div className="mt-1 line-clamp-1 text-body-strong text-fg">{csvSummary.topPainPoints[0]}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface p-4 shadow-xs">
              <span className="text-caption text-fg-tertiary">Main competitor</span>
              <div className="mt-1 text-body-strong text-fg">{csvSummary.topCompetitors[0]}</div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-h3 text-fg">
                Target accounts <span className="text-small font-normal tabular-nums text-fg-tertiary">{leads.length}</span>
              </h3>
              <div className="w-64">
                <SearchInput
                  value={csvSearchTerm}
                  onChange={(e) => setCsvSearchTerm(e.target.value)}
                  placeholder="Search leads..."
                  className="h-8"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-left text-small">
                <thead className="bg-subtle text-caption text-fg-tertiary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Seats</th>
                    <th className="px-3 py-2 font-medium">Pain point</th>
                    <th className="px-3 py-2 font-medium">Tech</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.slice(0, 10).map((l, idx) => (
                    <tr key={idx} className="border-t border-line hover:bg-subtle">
                      <td className="px-3 py-2.5 font-medium text-fg">
                        {l.name}
                        <div className="text-caption font-normal text-fg-tertiary">{l.title}</div>
                      </td>
                      <td className="px-3 py-2.5 text-fg">{l.company}</td>
                      <td className="px-3 py-2.5 tabular-nums text-fg-secondary">{l.headcount}</td>
                      <td className="px-3 py-2.5 text-fg-secondary">{l.painPoint}</td>
                      <td className="px-3 py-2.5 text-fg-secondary">{l.techStack}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      <UploadLeadsCsvModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onLeadsImported={handleLeadsImported}
      />

    </div>
  );
}
