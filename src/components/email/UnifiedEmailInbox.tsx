'use client';

import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  Mail,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCw,
  Sparkles,
  Building,
  Check,
  AlertTriangle,
  Trash2,
  CalendarDays,
  DollarSign,
  MessageSquareReply,
  X
} from 'lucide-react';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  IconButton,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Textarea
} from '@/components/ui';
import { 
  EmailMessage, 
  getStoredEmails, 
  saveEmailToStore, 
  deleteEmailById, 
  deleteThreadById, 
  clearAllEmails, 
  resetToInitialSeeds,
  getConversationThreadKey,
  extractCleanEmailAddress
} from '@/lib/emailStore';
import { useSession } from '@/lib/session';

export default function UnifiedEmailInbox() {
  const { session } = useSession();
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'inbound' | 'outbound' | 'unread'>('all');
  
  // Dynamic sender based on authenticated session
  const senderDisplayName = session?.repName || 'Emil Halili';
  const senderEmailRaw = session?.email || 'emil@appointmentlyy.com';
  const verifiedSenderEmail = senderEmailRaw.toLowerCase().endsWith('@appointmentlyy.com')
    ? senderEmailRaw
    : 'emil@appointmentlyy.com';
  const senderFrom = `${senderDisplayName} <${verifiedSenderEmail}>`;

  // Compose / Reply State
  const [replyText, setReplyText] = useState<string>('');
  const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
  const [sendSuccessKey, setSendSuccessKey] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [showConfirmDeleteThread, setShowConfirmDeleteThread] = useState<boolean>(false);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState<boolean>(false);
  const [isSyncingInbound, setIsSyncingInbound] = useState<boolean>(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);
  const [showIngestModal, setShowIngestModal] = useState<boolean>(false);
  const [ingestBody, setIngestBody] = useState<string>('');

  // Sync inbound replies from Resend receiving API
  const handleSyncInbound = async () => {
    setIsSyncingInbound(true);
    try {
      const res = await fetch('/api/email/inbound');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.emails) && data.emails.length > 0) {
          let updated = getStoredEmails();
          let countAdded = 0;
          let changed = false;
          for (const item of data.emails) {
            const existingIdx = updated.findIndex(m => m.id === item.id);
            if (existingIdx === -1) {
              updated = saveEmailToStore(item);
              countAdded++;
            } else if (
              updated[existingIdx].threadId !== item.threadId || 
              updated[existingIdx].leadName !== item.leadName ||
              updated[existingIdx].leadCompany !== item.leadCompany
            ) {
              updated[existingIdx] = { ...updated[existingIdx], ...item };
              changed = true;
            }
          }
          if (changed) {
            localStorage.setItem('sdr_unified_inbox_emails', JSON.stringify(updated));
            setEmails(updated);
          } else if (countAdded > 0) {
            setEmails(updated);
          }

          if (countAdded > 0) {
            setLastSyncStatus(`+${countAdded} new reply`);
            setTimeout(() => setLastSyncStatus(null), 4000);
          } else {
            setLastSyncStatus('Synced');
            setTimeout(() => setLastSyncStatus(null), 2500);
          }
        } else {
          setLastSyncStatus('Up to date');
          setTimeout(() => setLastSyncStatus(null), 2500);
        }
      }
    } catch (e) {
      console.warn('Sync failed:', e);
      setLastSyncStatus('Sync error');
    } finally {
      setIsSyncingInbound(false);
    }
  };

  // Load emails from localStorage or initial seeds & start live inbound sync
  useEffect(() => {
    const loaded = getStoredEmails();
    setEmails(loaded);
    if (loaded.length > 0 && !selectedThreadId) {
      setSelectedThreadId(getConversationThreadKey(loaded[0]));
    }
    handleSyncInbound();
    const interval = setInterval(handleSyncInbound, 12000);
    return () => clearInterval(interval);
  }, []);

  // Filtered emails list
  const filteredEmails = emails.filter((email) => {
    // Filter by tab
    if (activeFilter === 'inbound' && email.direction !== 'inbound') return false;
    if (activeFilter === 'outbound' && email.direction !== 'outbound') return false;
    if (activeFilter === 'unread' && email.read !== false) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = email.leadName.toLowerCase().includes(q);
      const matchCompany = email.leadCompany.toLowerCase().includes(q);
      const matchSubject = email.subject.toLowerCase().includes(q);
      const matchBody = email.body.toLowerCase().includes(q);
      return matchName || matchCompany || matchSubject || matchBody;
    }
    return true;
  });

  // Group emails by canonical conversation thread key
  const threadMap = new Map<string, EmailMessage[]>();
  emails.forEach(email => {
    const threadKey = getConversationThreadKey(email);
    const list = threadMap.get(threadKey) || [];
    list.push({ ...email, threadId: threadKey });
    threadMap.set(threadKey, list);
  });

  // Distinct thread summaries for left rail
  const threadSummaries: { threadId: string; latestEmail: EmailMessage; messageCount: number }[] = [];
  const seenThreads = new Set<string>();

  filteredEmails.forEach(email => {
    const threadKey = getConversationThreadKey(email);
    if (!seenThreads.has(threadKey)) {
      seenThreads.add(threadKey);
      const allInThread = (threadMap.get(threadKey) || []).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      threadSummaries.push({
        threadId: threadKey,
        latestEmail: allInThread[0],
        messageCount: allInThread.length
      });
    }
  });

  // Active thread messages sorted chronologically (oldest to newest)
  const activeThreadMessages = (threadMap.get(selectedThreadId) || []).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const activeThreadLead = activeThreadMessages[0] || emails[0];

  // Send Reply Handler
  const handleSendReply = async () => {
    if (isSendingReply || !replyText.trim() || !activeThreadLead) return;
    setIsSendingReply(true);
    setReplyError(null);
    try {
      const targetTo = extractCleanEmailAddress(
        activeThreadLead.direction === 'inbound' ? activeThreadLead.from : activeThreadLead.to
      );
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetTo,
          from: senderFrom,
          subject: activeThreadLead.subject.startsWith('Re:') ? activeThreadLead.subject : `Re: ${activeThreadLead.subject}`,
          body: replyText.trim(),
          leadName: activeThreadLead.leadName,
          leadCompany: activeThreadLead.leadCompany,
          leadTitle: activeThreadLead.leadTitle,
          threadId: selectedThreadId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.email) {
          const updated = saveEmailToStore(data.email);
          setEmails(updated);
          setReplyText('');
          setSendSuccessKey('reply_sent');
          setTimeout(() => setSendSuccessKey(null), 4000);
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setReplyError(errData.error || 'Failed to dispatch reply via Resend');
        return;
      }
    } catch (e: any) {
      setReplyError(e.message || 'Network error');
      return;
    } finally {
      setIsSendingReply(false);
      setTimeout(() => setReplyError(null), 6000);
    }
  };

  // Delete a single email message
  const handleDeleteMessage = (id: string) => {
    const updated = deleteEmailById(id);
    setEmails(updated);
    
    // Check if the current thread still has messages left
    const remainingInThread = updated.filter(m => m.threadId === selectedThreadId);
    if (remainingInThread.length === 0) {
      const nextThread = updated[0]?.threadId || '';
      setSelectedThreadId(nextThread);
    }
  };

  // Delete entire conversation thread
  const handleConfirmDeleteThread = () => {
    if (!selectedThreadId) return;
    const updated = deleteThreadById(selectedThreadId);
    setEmails(updated);
    setShowConfirmDeleteThread(false);
    
    // Switch to first remaining thread or empty
    const nextThread = updated[0]?.threadId || '';
    setSelectedThreadId(nextThread);
  };

  // Clear all stored emails
  const handleConfirmClearAll = () => {
    const updated = clearAllEmails();
    setEmails(updated);
    setSelectedThreadId('');
    setShowConfirmClearAll(false);
  };

  // Reset demo emails
  const handleResetSeeds = () => {
    const updated = resetToInitialSeeds();
    setEmails(updated);
    if (updated.length > 0) {
      setSelectedThreadId(updated[0].threadId);
    }
  };

  // Ingest custom lead reply into active thread
  const handleIngestReply = async (presetText?: string) => {
    const textToIngest = presetText || ingestBody;
    if (!textToIngest.trim() || !activeThreadLead) return;

    const fromAddress = activeThreadLead.direction === 'inbound' 
      ? activeThreadLead.from 
      : activeThreadLead.to;

    const leadName = activeThreadLead.leadName;
    const leadCompany = activeThreadLead.leadCompany;

    try {
      const res = await fetch('/api/email/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress,
          to: 'emil@appointmentlyy.com',
          subject: activeThreadLead.subject.startsWith('Re:') ? activeThreadLead.subject : `Re: ${activeThreadLead.subject}`,
          body: textToIngest.trim(),
          leadName: leadName,
          leadCompany: leadCompany,
          threadId: selectedThreadId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          const updated = saveEmailToStore(data.message);
          setEmails(updated);
          setShowIngestModal(false);
          setIngestBody('');
        }
      }
    } catch (e) {
      console.error('Ingest reply error:', e);
    }
  };

  // AI Quick Reply Presets
  const handleApplyAiReplyPreset = (presetType: 'demo' | 'objection' | 'pricing') => {
    const signOff = `Best,\n${senderDisplayName}`;
    if (presetType === 'demo') {
      setReplyText(
        `Hi ${activeThreadLead.leadName.split(' ')[0]},\n\nGlad this resonated. I just uploaded the 2-minute unscripted rebuttal video here: https://appointmentlyy.com/demo/sparring-150ms\n\nWould Thursday 2:00 PM or 3:30 PM EST work best for a quick 15-minute screen share with you and your floor QA lead? I'll show live objection telemetry on your exact campaign.\n\n${signOff}`
      );
    } else if (presetType === 'pricing') {
      setReplyText(
        `Hi ${activeThreadLead.leadName.split(' ')[0]},\n\nFor a 50-seat floor on Salesforce and Twilio, we run on a direct per-seat model ($85/seat/month) that pays for itself on day 3 when reps stop burning accounts.\n\nAre you free for 10 minutes Wednesday morning to look at the exact ROI calculator for your seat count?\n\n${signOff}`
      );
    } else {
      setReplyText(
        `Hi ${activeThreadLead.leadName.split(' ')[0]},\n\nFair question on sounding robotic—that is why traditional static scripts fail. Our system is an agile situational teleprompter that detects the prospect's exact objection in 150ms and displays consultative reframes, so reps sound like peer partners rather than script readers.\n\nWorth a 10-minute look, or are you guys set for this quarter?\n\n${signOff}`
      );
    }
  };

  const formatTimeAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return 'recent';
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col text-fg">

      {/* ========================================================================= */}
      {/* 1. PAGE HEADER                                                            */}
      {/* ========================================================================= */}
      <PageHeader
        className="shrink-0 pb-4"
        title="Inbox"
        description="Replies and sent emails from your verified mailbox, grouped by conversation."
        meta={
          <span className="inline-flex items-center gap-2 text-small text-fg-secondary" title={`Live sender: ${senderFrom}`}>
            <span className="size-2 shrink-0 rounded-full bg-success-500" aria-hidden />
            <span className="font-mono">{verifiedSenderEmail}</span>
          </span>
        }
        secondaryActions={
          <>
            {/* Live inbound sync from Resend */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSyncInbound}
              disabled={isSyncingInbound}
              title="Sync incoming email replies live from Resend Inbound (reply@estuegai.resend.app)"
            >
              <RotateCw className={isSyncingInbound ? 'animate-spin' : ''} />
              <span>{isSyncingInbound ? 'Syncing...' : (lastSyncStatus || 'Sync replies')}</span>
            </Button>

            {/* Clear all */}
            {emails.length > 0 && (
              <IconButton
                label="Clear all stored emails"
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirmClearAll(true)}
              >
                <Trash2 />
              </IconButton>
            )}
            <ConfirmDialog
              open={showConfirmClearAll && emails.length > 0}
              onClose={() => setShowConfirmClearAll(false)}
              onConfirm={handleConfirmClearAll}
              title={`Clear all ${emails.length} emails?`}
              description="This removes every stored email from this device."
              confirmLabel="Clear"
              icon={<Trash2 />}
            />
          </>
        }
      />

      {/* ========================================================================= */}
      {/* 2. THREE PANES: threads, conversation, contact                            */}
      {/* ========================================================================= */}
      <div className="flex min-h-0 flex-1 divide-x divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">

        {/* ======================================================================= */}
        {/* LEFT PANE: THREAD LIST                                                  */}
        {/* ======================================================================= */}
        <div className="flex w-72 shrink-0 flex-col sm:w-[360px]">
          <div className="shrink-0 space-y-2 border-b border-line p-3">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter emails..."
              className="h-8 text-small"
            />
            <SegmentedControl
              size="sm"
              label="Filter threads"
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as 'all' | 'inbound' | 'outbound' | 'unread')}
              className="w-full [&>*]:flex-1"
              items={[
                { value: 'all', label: <span className="tabular-nums">All ({emails.length})</span> },
                {
                  value: 'inbound',
                  label: (
                    <span className="flex items-center justify-center gap-1">
                      <ArrowDownLeft className="h-3.5 w-3.5" />
                      <span>Replies</span>
                    </span>
                  ),
                },
                {
                  value: 'outbound',
                  label: (
                    <span className="flex items-center justify-center gap-1">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span>Sent</span>
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {threadSummaries.length === 0 ? (
              <div className="space-y-2 p-6 text-center">
                <Mail className="mx-auto h-5 w-5 text-fg-tertiary" />
                <p className="text-small text-fg-secondary">No messages match your filter.</p>
              </div>
            ) : (
              threadSummaries.map(({ threadId, latestEmail, messageCount }) => {
                const isSelected = selectedThreadId === threadId;
                const hasUnreadInbound = latestEmail.direction === 'inbound' && latestEmail.read === false;

                return (
                  <div
                    key={threadId}
                    onClick={() => setSelectedThreadId(threadId)}
                    className={`cursor-pointer space-y-0.5 border-b border-l-2 border-b-line px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-l-action bg-selected'
                        : 'border-l-transparent hover:bg-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {hasUnreadInbound && (
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-action" aria-label="Unread" />
                        )}
                        <span className={`truncate text-body ${hasUnreadInbound ? 'font-semibold text-fg' : 'font-medium text-fg'}`}>
                          {latestEmail.leadName}
                        </span>
                      </div>

                      <span className="shrink-0 text-caption font-normal tabular-nums text-fg-tertiary">
                        {formatTimeAgo(latestEmail.timestamp)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-small text-fg">
                      {latestEmail.direction === 'inbound' ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-fg-tertiary" aria-label="Reply" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-fg-tertiary" aria-label="Sent" />
                      )}
                      <span className="truncate">{latestEmail.subject}</span>
                    </div>

                    <p className="truncate text-small leading-snug text-fg-tertiary">
                      {latestEmail.body}
                    </p>

                    <div className="flex items-center justify-between pt-0.5 text-caption font-normal text-fg-tertiary">
                      <span className="max-w-[180px] truncate">
                        {latestEmail.leadCompany}
                      </span>
                      <span className="tabular-nums">
                        {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ======================================================================= */}
        {/* CENTER PANE: CONVERSATION & REPLY                                       */}
        {/* ======================================================================= */}
        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">

          {activeThreadLead ? (
            <>
              {/* Conversation header */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={activeThreadLead.leadName} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-body-strong text-fg">{activeThreadLead.leadName}</span>
                      <span className="truncate text-small text-fg-tertiary">{activeThreadLead.leadCompany}</span>
                    </div>
                    <p className="truncate font-mono text-small text-fg-tertiary">
                      {activeThreadLead.direction === 'inbound' ? activeThreadLead.from : activeThreadLead.to}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowIngestModal(true)}
                    title="Ingest / paste a lead reply into this thread"
                  >
                    <ArrowDownLeft />
                    <span>Add a reply</span>
                  </Button>

                  {showConfirmDeleteThread ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in">
                      <span className="text-small text-danger-fg">Delete thread?</span>
                      <Button variant="danger" size="sm" onClick={handleConfirmDeleteThread}>
                        <Trash2 />
                        <span>Delete</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowConfirmDeleteThread(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowConfirmDeleteThread(true)}
                      title="Delete this conversation thread"
                    >
                      <Trash2 />
                      <span>Delete</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Threaded messages */}
              <div className="flex-1 space-y-3 overflow-y-auto bg-app px-5 py-4">
                {activeThreadMessages.map((msg) => {
                  const isInbound = msg.direction === 'inbound';
                  return (
                    <div
                      key={msg.id}
                      className={`space-y-2 rounded-lg border border-line p-4 text-left ${
                        isInbound ? 'bg-surface shadow-xs' : 'bg-subtle'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          {isInbound ? (
                            <ArrowDownLeft className="h-4 w-4 shrink-0 text-fg-secondary" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-secondary" />
                          )}
                          <span className="shrink-0 text-small text-fg-secondary">
                            {isInbound ? 'Reply from' : 'Sent by'}
                          </span>
                          <span className="truncate text-body-strong text-fg">
                            {msg.from}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-small tabular-nums text-fg-tertiary">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <IconButton
                            label="Delete this message"
                            size="sm"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="size-7 text-fg-tertiary hover:text-danger-fg"
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </div>

                      <div className="text-body-strong text-fg">
                        {msg.subject}
                      </div>

                      <div className="whitespace-pre-line text-body leading-relaxed text-fg">
                        {msg.body}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-caption font-normal text-fg-tertiary">
                        <span>{msg.provider === 'resend_live' ? 'Resend Live' : 'Sandbox'}</span>
                        <span>{msg.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply composer */}
              <div className="shrink-0 space-y-2 border-t border-line px-5 py-3">
                {/* Copilot chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1 text-small text-fg-secondary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Copilot</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApplyAiReplyPreset('demo')}
                    className="focus-ring inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-small text-fg transition-colors hover:bg-subtle"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-fg-secondary" />
                    Book demo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyAiReplyPreset('pricing')}
                    className="focus-ring inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-small text-fg transition-colors hover:bg-subtle"
                  >
                    <DollarSign className="h-3.5 w-3.5 text-fg-secondary" />
                    Pricing
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyAiReplyPreset('objection')}
                    className="focus-ring inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-small text-fg transition-colors hover:bg-subtle"
                  >
                    <MessageSquareReply className="h-3.5 w-3.5 text-fg-secondary" />
                    Handle objection
                  </button>
                </div>

                <Textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply, or pick a Copilot suggestion above"
                  className="min-h-0 resize-none font-sans leading-relaxed"
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 truncate text-small text-fg-tertiary">
                    {sendSuccessKey === 'reply_sent' ? (
                      <span className="flex items-center gap-1 text-success-fg">
                        <Check className="h-3.5 w-3.5" />
                        Reply sent via Resend
                      </span>
                    ) : replyError ? (
                      <span className="flex items-center gap-1 text-danger-fg">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Error: {replyError}
                      </span>
                    ) : (
                      <span className="truncate">
                        From <span className="font-mono text-fg-secondary">{verifiedSenderEmail}</span> to <span className="text-fg-secondary">{activeThreadLead.leadName}</span>
                      </span>
                    )}
                  </div>

                  <Button
                    variant="brand"
                    onClick={handleSendReply}
                    disabled={isSendingReply || !replyText.trim()}
                  >
                    {isSendingReply ? (
                      <>
                        <RotateCw className="animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : sendSuccessKey === 'reply_sent' && !replyText.trim() ? (
                      <>
                        <Check />
                        <span>Sent</span>
                      </>
                    ) : (
                      <>
                        <Send />
                        <span>Send reply</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              className="flex-1"
              icon={<Inbox />}
              title="Inbox is clear"
              description="All emails and threads have been removed."
              action={
                <Button variant="secondary" size="sm" onClick={handleResetSeeds}>
                  Restore demo threads
                </Button>
              }
            />
          )}

        </div>

        {/* ======================================================================= */}
        {/* RIGHT PANE: CONTACT CONTEXT (wide screens)                              */}
        {/* ======================================================================= */}
        {activeThreadLead && (
          <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto xl:flex">
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar name={activeThreadLead.leadName} size="lg" />
                <div className="min-w-0">
                  <div className="truncate text-body-strong text-fg">{activeThreadLead.leadName}</div>
                  {activeThreadLead.leadTitle && (
                    <div className="truncate text-small text-fg-secondary">{activeThreadLead.leadTitle}</div>
                  )}
                </div>
              </div>

              <dl className="space-y-3 text-small">
                <div>
                  <dt className="text-caption text-fg-tertiary">Company</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-fg">
                    <Building className="h-3.5 w-3.5 text-fg-secondary" />
                    <span className="truncate">{activeThreadLead.leadCompany}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-fg-tertiary">Email</dt>
                  <dd className="mt-0.5 break-all font-mono text-fg">
                    {activeThreadLead.direction === 'inbound' ? activeThreadLead.from : activeThreadLead.to}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-fg-tertiary">Messages in thread</dt>
                  <dd className="mt-0.5 tabular-nums text-fg">{activeThreadMessages.length}</dd>
                </div>
                <div>
                  <dt className="text-caption text-fg-tertiary">Thread ID</dt>
                  <dd className="mt-0.5 break-all font-mono text-caption font-normal text-fg-secondary">{selectedThreadId}</dd>
                </div>
              </dl>
            </div>
          </aside>
        )}

      </div>

      {/* Add (ingest) inbound reply modal */}
      <Dialog
        open={showIngestModal && !!activeThreadLead}
        onClose={() => setShowIngestModal(false)}
        title="Add a lead reply"
        size="md"
        bare
      >
        {activeThreadLead && (
          <div className="w-full space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-h2 text-fg">
                  Add a lead reply
                </h3>
                <p className="mt-0.5 truncate text-small text-fg-secondary">
                  From <span className="font-mono">{activeThreadLead.direction === 'inbound' ? activeThreadLead.from : activeThreadLead.to}</span>
                </p>
              </div>
              <IconButton label="Close" size="sm" onClick={() => setShowIngestModal(false)}>
                <X />
              </IconButton>
            </div>

            {/* Quick presets */}
            <div className="space-y-2">
              <span className="block text-small font-medium text-fg">
                Add a sample reply in one click
              </span>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handleIngestReply("Hey Emil,\n\nSaw your email. Send over that 2-minute video. If it looks solid, I'm open to a 15-minute screen share with my floor QA lead Thursday.\n\nBest,\n" + activeThreadLead.leadName)}
                  className="focus-ring rounded-md border border-line bg-surface p-3 text-left transition-colors hover:bg-subtle"
                >
                  <span className="block text-small font-medium text-fg">Positive, ready for video</span>
                  <span className="block text-small text-fg-secondary">&ldquo;Send over that 2-minute video. Open to a 15-minute screen share Thursday.&rdquo;</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleIngestReply("Hi Emil,\n\nFair question on price. We are currently locked into an annual contract with another vendor. What is the typical seat cost for a 50-seat team?\n\nBest,\n" + activeThreadLead.leadName)}
                  className="focus-ring rounded-md border border-line bg-surface p-3 text-left transition-colors hover:bg-subtle"
                >
                  <span className="block text-small font-medium text-fg">Price and competitor lock-in</span>
                  <span className="block text-small text-fg-secondary">&ldquo;What is the typical seat cost for a 50-seat team?&rdquo;</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleIngestReply("Hey Emil,\n\nWe just restructured our outbound floor. Bad timing right now, please ping me back in Q1.\n\n" + activeThreadLead.leadName)}
                  className="focus-ring rounded-md border border-line bg-surface p-3 text-left transition-colors hover:bg-subtle"
                >
                  <span className="block text-small font-medium text-fg">Bad timing</span>
                  <span className="block text-small text-fg-secondary">&ldquo;Bad timing right now, please ping me back in Q1.&rdquo;</span>
                </button>
              </div>
            </div>

            {/* Custom paste */}
            <div className="space-y-1.5 border-t border-line pt-4">
              <label htmlFor="ingest-reply-body" className="block text-small font-medium text-fg">
                Or paste a reply (from Gmail or Callview AI)
              </label>
              <Textarea
                id="ingest-reply-body"
                rows={3}
                value={ingestBody}
                onChange={(e) => setIngestBody(e.target.value)}
                placeholder="Paste the reply body you sent from Callview AI email here..."
                className="min-h-0 resize-none font-sans leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setShowIngestModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleIngestReply()}
                disabled={!ingestBody.trim()}
              >
                <ArrowDownLeft />
                <span>Add to thread</span>
              </Button>
            </div>
          </div>
        )}
      </Dialog>

    </div>
  );
}
