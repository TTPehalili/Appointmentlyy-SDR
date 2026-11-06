'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LifeBuoy, 
  Search, 
  Filter, 
  Plus, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  MessageSquare, 
  Lock, 
  Sparkles, 
  RefreshCw, 
  ArrowUpRight, 
  ShieldCheck, 
  User, 
  Building2, 
  ChevronDown, 
  Mail, 
  Copy, 
  Check, 
  ExternalLink,
  Layers,
  Inbox,
  Radio,
  Eye,
  Shield,
  HelpCircle,
  CreditCard
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { TroubleTicket, TicketMessage, TicketPriority, TicketStatus, TicketCategory, TICKET_CATEGORIES } from '@/lib/ticketTypes';
import NewTicketModal from '@/components/tickets/NewTicketModal';
import { Badge, Button, EmptyState, IconButton, PageHeader } from '@/components/ui';
import QuotaTopUpModal from '@/components/icp/QuotaTopUpModal';
import { creditTenantRecords, normalizeTenantKey, WISE_PAYMENT_LINK, WISE_QR_PATH } from '@/lib/icpQuotaStore';

/**
 * perspective: when set, the desk is locked to that view and the switcher is hidden.
 * Admin › Support uses 'tenant' (customer desk); Platform Console › Support desk uses 'admin'.
 */
export default function TicketDeskHub({ perspective }: { perspective?: 'admin' | 'tenant' } = {}) {
  const { session, role, isAdmin, tenantName, repName, email } = useSession();

  // Mode: Floor Admin (all tickets + internal notes) vs Customer/Tenant (tenant-focused view)
  const [chosenPerspective, setViewPerspective] = useState<'admin' | 'tenant'>(isAdmin ? 'admin' : 'tenant');
  const viewPerspective = perspective ?? chosenPerspective;

  const [tickets, setTickets] = useState<TroubleTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal State
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [creditApprovedToast, setCreditApprovedToast] = useState<string | null>(null);

  // Communication Composer State
  const [replyContent, setReplyContent] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch Tickets from API
  const fetchTickets = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tickets)) {
          setTickets(data.tickets);
          if (!selectedTicketId && data.tickets.length > 0) {
            setSelectedTicketId(data.tickets[0].id);
          }
        }
      }
    } catch (err) {
      console.warn('[TicketDesk] Failed to load tickets:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(() => {
      fetchTickets();
    }, 15000); // Poll every 15s for live communication updates
    return () => clearInterval(interval);
  }, []);

  // Check URL param ?id=TKT-XXXX
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTicketId = params.get('id');
      if (urlTicketId) {
        setSelectedTicketId(urlTicketId);
      }
    }
  }, [tickets]);

  // Scroll to bottom of message timeline on change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicketId, tickets]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Perspective check: If in Tenant perspective, filter by tenant unless user is super admin testing
      if (viewPerspective === 'tenant') {
        const matchesTenant = t.tenantName.toLowerCase() === tenantName.toLowerCase() ||
          t.requesterEmail.toLowerCase() === email.toLowerCase() ||
          t.tenantCode?.toLowerCase() === session.tenantCode?.toLowerCase();
        // If tenant doesn't match and tenantName is not default appointmentlyy, keep only matching
        if (tenantName !== 'Appointmentlyy' && !matchesTenant) {
          return false;
        }
      }

      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = 
          t.id.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tenantName.toLowerCase().includes(q) ||
          t.requesterName.toLowerCase().includes(q) ||
          t.requesterEmail.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [tickets, viewPerspective, tenantName, email, session.tenantCode, statusFilter, priorityFilter, categoryFilter, searchQuery]);

  // Selected Ticket Object
  const selectedTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || filteredTickets[0] || null;
  }, [tickets, selectedTicketId, filteredTickets]);

  // Top Statistics
  const stats = useMemo(() => {
    const total = tickets.length;
    const openCount = tickets.filter(t => t.status === 'open').length;
    const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
    const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
    const urgentCount = tickets.filter(t => t.priority === 'urgent' && t.status !== 'resolved' && t.status !== 'closed').length;
    return { total, openCount, inProgressCount, resolvedCount, urgentCount };
  }, [tickets]);

  // Handle Status Update
  const handleUpdateStatus = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          updatedBy: repName || 'Emil Halili',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
      }
    } catch (err) {
      console.warn('[TicketDesk] Error updating status:', err);
    }
  };

  // Handle Priority Update
  const handleUpdatePriority = async (newPriority: TicketPriority) => {
    if (!selectedTicket) return;
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: newPriority,
          updatedBy: repName || 'Emil Halili',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
      }
    } catch (err) {
      console.warn('[TicketDesk] Error updating priority:', err);
    }
  };

  // Handle Send Reply / Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !selectedTicket) return;

    setSendingReply(true);
    try {
      const senderRole = viewPerspective === 'admin' ? 'admin' : 'customer';
      const senderName = viewPerspective === 'admin' ? (repName || 'Emil Halili') : (repName || 'Customer User');
      const senderEmail = viewPerspective === 'admin' ? 'emil@appointmentlyy.com' : (email || selectedTicket.requesterEmail);

      const res = await fetch(`/api/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName,
          senderEmail,
          senderRole,
          isInternalNote: viewPerspective === 'admin' ? isInternalNote : false,
          content: replyContent.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
        setReplyContent('');
        setIsInternalNote(false);
      }
    } catch (err) {
      console.warn('[TicketDesk] Error posting reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  // Canned Responses
  const applyCannedResponse = (text: string) => {
    setReplyContent(text);
  };

  // Copy Ticket ID
  const copyTicketId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Time format helper
  const formatTimeAgo = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    } catch {
      return 'recently';
    }
  };

  // Priority badge styling
  const getPriorityBadge = (p: TicketPriority) => {
    switch (p) {
      case 'urgent':
        return <Badge tone="danger">Urgent (P1)</Badge>;
      case 'high':
        return <Badge tone="warning">High (P2)</Badge>;
      case 'medium':
        return <Badge tone="neutral">Medium</Badge>;
      case 'low':
      default:
        return <Badge tone="neutral">Low</Badge>;
    }
  };

  // Status badge styling
  const getStatusBadge = (s: TicketStatus) => {
    switch (s) {
      case 'open':
        return <Badge tone="warning"><span className="size-1.5 rounded-full bg-warning-400" aria-hidden />Open</Badge>;
      case 'in_progress':
        return <Badge tone="neutral"><span className="size-1.5 rounded-full bg-fg" aria-hidden />In progress</Badge>;
      case 'waiting_on_customer':
        return <Badge tone="neutral"><span className="size-1.5 rounded-full bg-fg-disabled" aria-hidden />Waiting on customer</Badge>;
      case 'resolved':
        return <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden />Resolved</Badge>;
      case 'closed':
        return <Badge tone="neutral">Closed</Badge>;
    }
  };

  const selectClass =
    'focus-ring h-8 rounded-sm border border-line-strong bg-surface px-2 text-small text-fg focus:outline-none';

  return (
    <div className="flex-1 flex flex-col min-h-0 px-2 pt-3 pb-1 md:px-5">

      {/* 1. Page header */}
      <PageHeader
        className="shrink-0 pb-4"
        title={viewPerspective === 'admin' ? 'Support desk' : 'Support'}
        description={
          viewPerspective === 'admin'
            ? 'Triage tickets from every workspace, reply to customers and leave internal notes.'
            : 'Report an issue, follow its progress and talk with the Appointmentlyy support team.'
        }
        secondaryActions={
          <>
            {/* View Perspective Switcher */}
            {!perspective && (
              <div className="inline-flex rounded-md border border-line bg-subtle p-0.5">
                <button
                  onClick={() => setViewPerspective('tenant')}
                  className={`focus-ring h-8 px-3 rounded-[6px] text-small font-medium transition-colors duration-150 ${
                    viewPerspective === 'tenant'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                  title="Customer submission view"
                >
                  Customer desk
                </button>
                <button
                  onClick={() => setViewPerspective('admin')}
                  className={`focus-ring h-8 px-3 rounded-[6px] text-small font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                    viewPerspective === 'admin'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                  }`}
                  title="Full Admin Management Desk"
                >
                  <Shield className="h-3.5 w-3.5" aria-hidden />
                  <span>Admin desk</span>
                </button>
              </div>
            )}

            {/* Refresh */}
            <IconButton
              label="Refresh ticket queue"
              variant="secondary"
              onClick={() => fetchTickets(true)}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            </IconButton>

            {/* Tap Up Lead Quota Button */}
            <Button
              variant="secondary"
              onClick={() => setIsTopUpModalOpen(true)}
              icon={<CreditCard className="text-fg-secondary" />}
            >
              Top up lead quota
            </Button>
          </>
        }
        primaryAction={
          /* New Trouble Ticket Button */
          <Button
            variant={viewPerspective === 'admin' ? 'primary' : 'brand'}
            onClick={() => setIsNewTicketModalOpen(true)}
            icon={<Plus />}
          >
            New ticket
          </Button>
        }
      />

      <div className="flex-1 flex flex-col min-h-0 bg-surface rounded-lg border border-line shadow-xs overflow-hidden">

      {/* 2. Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-line bg-surface divide-x divide-line shrink-0">
        <div className="px-4 py-3">
          <div className="text-caption text-fg-tertiary">Total tickets</div>
          <div className="text-h2 text-fg tabular-nums mt-0.5">{stats.total}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-caption text-fg-tertiary flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warning-400" aria-hidden />
            <span>Open</span>
          </div>
          <div className="text-h2 text-fg tabular-nums mt-0.5">{stats.openCount}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-caption text-fg-tertiary flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-fg" aria-hidden />
            <span>In progress</span>
          </div>
          <div className="text-h2 text-fg tabular-nums mt-0.5">{stats.inProgressCount}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-caption text-fg-tertiary flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success-500" aria-hidden />
            <span>Resolved</span>
          </div>
          <div className="text-h2 text-fg tabular-nums mt-0.5">{stats.resolvedCount}</div>
        </div>
        <div className="px-4 py-3 col-span-2 sm:col-span-1">
          <div className="text-caption text-fg-tertiary">Avg first reply</div>
          <div className="text-h2 text-fg mt-0.5 flex items-baseline gap-2">
            <span className="tabular-nums">&lt; 14 mins</span>
            <span className="text-caption text-success-fg">100% SLA</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Toolbar */}
      <div className="px-4 py-2.5 border-b border-line flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 text-fg-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket ID, subject, tenant, customer..."
              className="focus-ring w-full h-8 pl-8 pr-3 rounded-sm border border-line-strong bg-surface text-small text-fg focus:outline-none placeholder:text-fg-disabled"
            />
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'open', label: 'Open' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'waiting_on_customer', label: 'Waiting' },
            { id: 'resolved', label: 'Resolved' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              aria-pressed={statusFilter === pill.id}
              className={`focus-ring h-8 px-3 rounded-full border text-small font-medium transition-colors duration-150 whitespace-nowrap ${
                statusFilter === pill.id
                  ? 'bg-selected border-brand-600/30 text-fg'
                  : 'bg-surface border-line text-fg-secondary hover:bg-subtle'
              }`}
            >
              {pill.label}
            </button>
          ))}

          {/* Priority dropdown */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
            className={selectClass}
          >
            <option value="all">Priority: All</option>
            <option value="urgent">Urgent (P1)</option>
            <option value="high">High (P2)</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* 4. Two-Column Workspace (Queue + Conversation Desk) */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT COLUMN: Ticket Queue */}
        <div className="w-full sm:w-80 md:w-96 border-r border-line flex flex-col bg-surface shrink-0 overflow-hidden">
          <div className="h-9 px-3 border-b border-line bg-subtle flex items-center justify-between text-caption text-fg-tertiary">
            <span>Queue <span className="tabular-nums">({filteredTickets.length})</span></span>
            <span className="truncate ml-2">
              {viewPerspective === 'admin' ? 'All Tenants' : tenantName}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line">
            {filteredTickets.length === 0 ? (
              <EmptyState
                className="py-12"
                icon={<Inbox />}
                title="No tickets match these filters"
                action={
                  <Button size="sm" variant="secondary" onClick={() => setIsNewTicketModalOpen(true)}>
                    Create a ticket
                  </Button>
                }
              />
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                const lastMessage = t.messages[t.messages.length - 1];
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`focus-ring w-full px-3 py-3 text-left transition-colors duration-150 flex flex-col gap-1.5 relative border-l-2 ${
                      isSelected
                        ? 'bg-selected border-l-brand-600'
                        : 'border-l-transparent hover:bg-subtle'
                    }`}
                  >
                    {/* Top Row: Ticket ID, Priority, Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-caption text-fg-secondary">{t.id}</span>
                        {getPriorityBadge(t.priority)}
                      </div>
                      <span className="text-caption text-fg-tertiary tabular-nums shrink-0">{formatTimeAgo(t.updatedAt || t.createdAt)}</span>
                    </div>

                    {/* Subject */}
                    <div className="text-body-strong text-fg line-clamp-1">
                      {t.subject}
                    </div>

                    {/* Snippet */}
                    <div className="text-small text-fg-secondary line-clamp-2">
                      {lastMessage ? lastMessage.content : t.description}
                    </div>

                    {/* Bottom Metadata */}
                    <div className="flex items-center justify-between gap-2 pt-1 text-caption text-fg-tertiary">
                      <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{t.tenantName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(t.status)}
                        <span className="flex items-center gap-1 tabular-nums">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                          <span>{t.messages.length}</span>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Ticket Conversation Desk */}
        <div className="flex-1 flex flex-col bg-surface overflow-hidden min-h-0">
          {selectedTicket ? (
            <>
              {/* Selected Ticket Header */}
              <div className="px-5 py-4 border-b border-line flex flex-col md:flex-row md:items-start justify-between gap-3 shrink-0">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => copyTicketId(selectedTicket.id)}
                      className="focus-ring h-6 px-1.5 rounded-sm font-mono text-caption bg-subtle hover:bg-line text-fg border border-line flex items-center gap-1 transition-colors"
                      title="Click to copy ticket reference"
                    >
                      <span>{selectedTicket.id}</span>
                      {copiedId ? <Check className="h-3 w-3 text-success-fg" /> : <Copy className="h-3 w-3 text-fg-tertiary" />}
                    </button>
                    {getPriorityBadge(selectedTicket.priority)}
                    {getStatusBadge(selectedTicket.status)}
                    <span className="text-caption text-fg-tertiary tabular-nums">
                      Logged {new Date(selectedTicket.createdAt).toLocaleDateString()} at {new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h2 className="text-h2 text-fg">
                    {selectedTicket.subject}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-secondary">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-fg-tertiary" aria-hidden />
                      <span>{selectedTicket.tenantName}</span>
                    </span>
                    <span className="text-fg-disabled" aria-hidden>&bull;</span>
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-fg-tertiary" aria-hidden />
                      <span>{selectedTicket.requesterName}</span>
                      <span className="text-fg-tertiary">({selectedTicket.requesterEmail})</span>
                    </span>
                    {selectedTicket.affectedUrl && (
                      <>
                        <span className="text-fg-disabled" aria-hidden>&bull;</span>
                        <span className="text-fg-tertiary">
                          Page: <span className="font-mono text-caption">{selectedTicket.affectedUrl}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status & Priority Controller Dropdowns */}
                <div className="flex items-center gap-2 shrink-0">
                  {viewPerspective === 'admin' && (
                    <>
                      {/* Priority Switcher */}
                      <select
                        value={selectedTicket.priority}
                        onChange={(e) => handleUpdatePriority(e.target.value as TicketPriority)}
                        aria-label="Ticket priority"
                        className={selectClass}
                      >
                        <option value="urgent">Urgent (P1)</option>
                        <option value="high">High (P2)</option>
                        <option value="medium">Medium (P3)</option>
                        <option value="low">Low (P4)</option>
                      </select>

                      {/* Status Switcher */}
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateStatus(e.target.value as TicketStatus)}
                        aria-label="Ticket status"
                        className={selectClass}
                      >
                        <option value="open">Status: Open</option>
                        <option value="in_progress">Status: In Progress</option>
                        <option value="waiting_on_customer">Status: Waiting</option>
                        <option value="resolved">Status: Resolved</option>
                        <option value="closed">Status: Closed</option>
                      </select>
                    </>
                  )}
                  {viewPerspective === 'tenant' && (
                    <div className="flex items-center gap-2 text-small">
                      <span className="text-fg-tertiary">Assigned to</span>
                      <span className="flex items-center gap-1.5 text-fg font-medium">
                        <ShieldCheck className="h-4 w-4 text-fg-secondary" aria-hidden />
                        <span>Emil Halili</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation Feed */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-app">

                {/* Billing / ICP Quota Tap-Up Action Card */}
                {selectedTicket.category === 'account_billing' && (
                  <div className="p-4 rounded-lg bg-surface border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 text-small">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-fg-secondary" aria-hidden />
                        <span className="text-body-strong text-fg">
                          Wise billing and quota top-up
                        </span>
                        <span className="font-mono text-caption text-fg-tertiary">@emilhalilih</span>
                      </div>
                      <p className="text-fg-secondary">
                        Complete transfer via Wise (<a href={WISE_PAYMENT_LINK} target="_blank" rel="noopener noreferrer" className="text-brand-text underline underline-offset-2 font-mono">wise.com/pay/me/emilhalilih</a>) or scan the official QR code.
                      </p>
                      {role === 'Super Admin' && (
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <span className="text-fg-tertiary">Super Admin one-click credit:</span>
                          {[2000, 5000, 10000].map((amt) => (
                            <Button
                              key={amt}
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                creditTenantRecords(
                                  normalizeTenantKey(selectedTicket.tenantCode || selectedTicket.tenantName),
                                  amt
                                );
                                handleUpdateStatus('resolved');
                                setCreditApprovedToast(`Credited +${amt.toLocaleString()} records to ${selectedTicket.tenantName}`);
                                setTimeout(() => setCreditApprovedToast(null), 3500);
                              }}
                            >
                              <span className="tabular-nums">Approve +{amt.toLocaleString()} records</span>
                            </Button>
                          ))}
                          {creditApprovedToast && (
                            <span className="text-success-fg font-medium" role="status">{creditApprovedToast}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <img
                      src={WISE_QR_PATH}
                      alt="Wise QR @emilhalilih"
                      className="w-20 h-20 object-contain rounded-md border border-line shrink-0"
                    />
                  </div>
                )}

                {/* Initial Description Card */}
                <div className="p-4 rounded-lg bg-surface border border-line shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-line">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-subtle text-fg-secondary flex items-center justify-center text-caption">
                        {selectedTicket.requesterName.charAt(0)}
                      </div>
                      <span className="text-body-strong text-fg">{selectedTicket.requesterName}</span>
                      <span className="text-caption text-fg-tertiary">Original report</span>
                    </div>
                    <span className="text-caption text-fg-tertiary tabular-nums">
                      {new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-body text-fg whitespace-pre-wrap">
                    {selectedTicket.description}
                  </div>
                  {selectedTicket.systemInfo && (
                    <div className="pt-2 text-caption text-fg-tertiary border-t border-line">
                      Client context: {selectedTicket.systemInfo.browser} &bull; {selectedTicket.systemInfo.os}
                    </div>
                  )}
                </div>

                {/* Messages Timeline */}
                {selectedTicket.messages.map((msg, index) => {
                  // Skip index 0 if it mirrors the initial description
                  if (index === 0 && msg.content === selectedTicket.description) return null;

                  if (msg.senderRole === 'system') {
                    return (
                      <div key={msg.id} className="py-1 flex items-center justify-center">
                        <span className="px-3 py-1 rounded-full text-caption bg-subtle text-fg-tertiary border border-line">
                          {msg.content} &bull; {formatTimeAgo(msg.createdAt)}
                        </span>
                      </div>
                    );
                  }

                  const isAdminMsg = msg.senderRole === 'admin';
                  const isNote = msg.isInternalNote;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col space-y-1.5 ${
                        isAdminMsg ? 'items-end' : 'items-start'
                      }`}
                    >
                      {/* Sender Info */}
                      <div className="flex items-center gap-1.5 text-caption px-1 text-fg-tertiary">
                        <span className="font-medium text-fg-secondary">{msg.senderName}</span>
                        {isAdminMsg && (
                          <span>Appointmentlyy support</span>
                        )}
                        {isNote && (
                          <Badge tone="warning">
                            <Lock className="h-3 w-3" aria-hidden />
                            <span>Internal note</span>
                          </Badge>
                        )}
                        <span aria-hidden>&bull;</span>
                        <span className="tabular-nums">{formatTimeAgo(msg.createdAt)}</span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`max-w-xl px-4 py-3 rounded-lg text-body whitespace-pre-wrap ${
                          isNote
                            ? 'bg-warning-bg border border-warning-400/50 text-fg'
                            : isAdminMsg
                            ? 'bg-subtle border border-line text-fg'
                            : 'bg-surface border border-line text-fg'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Communication Message Composer */}
              <div className="px-4 py-3 border-t border-line bg-surface shrink-0 space-y-2">

                {/* Mode Selectors & Quick Canned Chips */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {viewPerspective === 'admin' ? (
                    <div className="inline-flex rounded-md border border-line bg-subtle p-0.5">
                      <button
                        type="button"
                        onClick={() => setIsInternalNote(false)}
                        className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                          !isInternalNote
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-fg-secondary hover:text-fg'
                        }`}
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        <span>Reply to customer (emails update)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsInternalNote(true)}
                        className={`focus-ring h-7 px-2.5 rounded-[6px] text-small font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                          isInternalNote
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-fg-secondary hover:text-fg'
                        }`}
                      >
                        <Lock className="h-3.5 w-3.5" aria-hidden />
                        <span>Internal note (private)</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-small text-fg-secondary flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-fg-tertiary" aria-hidden />
                      <span>Reply to Emil Halili and the support team</span>
                    </div>
                  )}

                  {/* Canned responses */}
                  {viewPerspective === 'admin' && (
                    <div className="hidden lg:flex items-center gap-1">
                      <span className="text-caption text-fg-tertiary mr-1">Quick replies</span>
                      <button
                        type="button"
                        onClick={() => applyCannedResponse("Hi, we are actively investigating your issue and reviewing server logs.")}
                        className="focus-ring h-7 px-2.5 rounded-full border border-line bg-surface hover:bg-subtle text-caption text-fg-secondary"
                      >
                        Investigating
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCannedResponse("A fix has been deployed to your workspace. Could you please test and confirm?")}
                        className="focus-ring h-7 px-2.5 rounded-full border border-line bg-surface hover:bg-subtle text-caption text-fg-secondary"
                      >
                        Fix deployed
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCannedResponse("Issue has been fully resolved and telemetry verified. Thank you for flagging this!")}
                        className="focus-ring h-7 px-2.5 rounded-full border border-line bg-surface hover:bg-subtle text-caption text-fg-secondary"
                      >
                        Verified resolved
                      </button>
                    </div>
                  )}
                </div>

                {/* Text Area */}
                <form onSubmit={handleSendMessage} className="space-y-2">
                  <div className="relative">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      rows={3}
                      placeholder={
                        isInternalNote
                          ? "Add an internal engineering note (only visible to Appointmentlyy admins)..."
                          : viewPerspective === 'admin'
                          ? `Reply to ${selectedTicket.requesterName} (will notify ${selectedTicket.requesterEmail} via email)...`
                          : "Type your message or update for Emil Halili and the support team..."
                      }
                      className={`focus-ring w-full px-3 py-2.5 rounded-sm border text-body focus:outline-none resize-none placeholder:text-fg-disabled ${
                        isInternalNote
                          ? 'border-warning-400/60 bg-warning-bg text-fg'
                          : 'border-line-strong bg-surface text-fg'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-caption text-fg-tertiary min-w-0">
                      {isInternalNote ? (
                        <span className="text-warning-fg flex items-center gap-1">
                          <Lock className="h-3.5 w-3.5" aria-hidden />
                          <span>Private team note. Not emailed to the customer.</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" aria-hidden />
                          <span className="truncate">We will email <span className="font-medium text-fg-secondary">{selectedTicket.requesterEmail}</span></span>
                        </span>
                      )}
                    </div>

                    <Button
                      type="submit"
                      variant={isInternalNote ? 'primary' : viewPerspective === 'admin' ? 'brand' : 'primary'}
                      disabled={sendingReply || !replyContent.trim()}
                      icon={isInternalNote ? <Lock /> : <Send />}
                    >
                      {sendingReply ? 'Sending...' : isInternalNote ? 'Save internal note' : 'Send reply'}
                    </Button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <EmptyState
              className="flex-1"
              icon={<LifeBuoy />}
              title="No ticket selected"
              description="Pick a ticket from the queue to see its details and conversation."
              action={
                <Button variant="secondary" onClick={() => setIsNewTicketModalOpen(true)} icon={<Plus />}>
                  New ticket
                </Button>
              }
            />
          )}
        </div>
      </div>
      </div>

      {/* New Ticket Modal */}
      <NewTicketModal
        isOpen={isNewTicketModalOpen}
        onClose={() => setIsNewTicketModalOpen(false)}
        onTicketCreated={(newTicket) => {
          setTickets(prev => [newTicket, ...prev]);
          setSelectedTicketId(newTicket.id);
        }}
      />

      {/* Tap Up ICP Lead Quota Modal */}
      <QuotaTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => setIsTopUpModalOpen(false)}
        tenantCode={session.tenantCode || 'APEX-GLOBAL'}
        tenantName={tenantName}
        clientContactName={repName}
        clientEmail={email}
        onInvoiceGenerated={(_, newTicketId) => {
          fetchTickets(true);
          if (newTicketId) setSelectedTicketId(newTicketId);
        }}
      />
    </div>
  );
}
