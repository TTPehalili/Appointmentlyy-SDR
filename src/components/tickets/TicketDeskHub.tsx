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
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wider">Urgent (P1)</span>;
      case 'high':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-wider">High (P2)</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-wider">Medium</span>;
      case 'low':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 uppercase tracking-wider">Low</span>;
    }
  };

  // Status badge styling
  const getStatusBadge = (s: TicketStatus) => {
    switch (s) {
      case 'open':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />Open</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />In Progress</span>;
      case 'waiting_on_customer':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 border border-purple-200">Waiting on Customer</span>;
      case 'resolved':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" />Resolved</span>;
      case 'closed':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">Closed</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
      
      {/* 1. Header Bar with Stats & Quick Actions */}
      <div className="p-4 border-b border-zinc-200 bg-zinc-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold shadow-xs">
            <LifeBuoy className="h-5 w-5 text-rose-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-zinc-900 tracking-tight">Support & Trouble Tickets</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                SDR Enterprise SLA
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Submit issues, track incident resolution, and communicate live with Emil Halili & core engineering
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Perspective Switcher */}
          {!perspective && (
          <div className="flex items-center bg-zinc-200/70 p-0.5 rounded-lg border border-zinc-300/60 text-xs">
            <button
              onClick={() => setViewPerspective('tenant')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                viewPerspective === 'tenant'
                  ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
              title="Customer submission view"
            >
              Customer Desk
            </button>
            <button
              onClick={() => setViewPerspective('admin')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1 ${
                viewPerspective === 'admin'
                  ? 'bg-zinc-900 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
              title="Full Admin Management Desk"
            >
              <Shield className="h-3 w-3" />
              <span>Emil Desk (Admin)</span>
            </button>
          </div>
          )}

          {/* Refresh */}
          <button
            onClick={() => fetchTickets(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 transition-colors"
            title="Refresh ticket queue"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Tap Up Lead Quota Button */}
          <button
            onClick={() => setIsTopUpModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
            <span>Tap Up ICP Lead Quota</span>
          </button>

          {/* New Trouble Ticket Button */}
          <button
            onClick={() => setIsNewTicketModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Trouble Ticket</span>
          </button>
        </div>
      </div>

      {/* 2. Stat KPI Cards Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-zinc-200 bg-white text-xs divide-x divide-zinc-100 shrink-0">
        <div className="p-3 px-4">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Total Tickets</div>
          <div className="text-lg font-bold text-zinc-900 mt-0.5">{stats.total}</div>
        </div>
        <div className="p-3 px-4">
          <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>Open Triage</span>
          </div>
          <div className="text-lg font-bold text-amber-600 mt-0.5">{stats.openCount}</div>
        </div>
        <div className="p-3 px-4">
          <div className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            <span>In Progress</span>
          </div>
          <div className="text-lg font-bold text-sky-600 mt-0.5">{stats.inProgressCount}</div>
        </div>
        <div className="p-3 px-4">
          <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>Resolved</span>
          </div>
          <div className="text-lg font-bold text-emerald-600 mt-0.5">{stats.resolvedCount}</div>
        </div>
        <div className="p-3 px-4 col-span-2 sm:col-span-1 bg-zinc-50/50">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Avg First Reply</div>
          <div className="text-base font-bold text-zinc-900 mt-0.5 flex items-center gap-1">
            <span>&lt; 14 mins</span>
            <span className="text-[10px] font-mono text-emerald-600 font-normal">100% SLA</span>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Toolbar */}
      <div className="p-2.5 px-4 bg-zinc-50/50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket ID, subject, tenant, customer..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400"
            />
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs">
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
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                statusFilter === pill.id
                  ? 'bg-zinc-900 text-white font-semibold'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {pill.label}
            </button>
          ))}

          {/* Priority dropdown */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-zinc-200 bg-white text-[11px] text-zinc-700 font-medium focus:outline-none"
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
        <div className="w-full sm:w-80 md:w-96 border-r border-zinc-200 flex flex-col bg-zinc-50/40 shrink-0 overflow-hidden">
          <div className="p-2.5 px-3 border-b border-zinc-200/80 bg-zinc-100/50 flex items-center justify-between text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            <span>Ticket Queue ({filteredTickets.length})</span>
            <span className="text-[10px] font-mono text-zinc-400">
              {viewPerspective === 'admin' ? 'All Tenants' : tenantName}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 flex flex-col items-center justify-center space-y-2">
                <Inbox className="h-8 w-8 text-zinc-300" />
                <p>No trouble tickets match criteria.</p>
                <button
                  onClick={() => setIsNewTicketModalOpen(true)}
                  className="text-rose-600 hover:underline font-semibold"
                >
                  Create trouble ticket
                </button>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                const lastMessage = t.messages[t.messages.length - 1];
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`w-full p-3 text-left transition-all flex flex-col gap-1.5 relative ${
                      isSelected
                        ? 'bg-white border-l-4 border-l-rose-600 shadow-xs'
                        : 'hover:bg-zinc-100/80'
                    }`}
                  >
                    {/* Top Row: Ticket ID, Priority, Status */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[11px] text-zinc-900">{t.id}</span>
                        {getPriorityBadge(t.priority)}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">{formatTimeAgo(t.updatedAt || t.createdAt)}</span>
                    </div>

                    {/* Subject */}
                    <div className="font-semibold text-xs text-zinc-900 line-clamp-1">
                      {t.subject}
                    </div>

                    {/* Snippet */}
                    <div className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                      {lastMessage ? lastMessage.content : t.description}
                    </div>

                    {/* Bottom Metadata */}
                    <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400">
                      <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                        <Building2 className="h-3 w-3 text-zinc-400 shrink-0" />
                        <span className="truncate text-zinc-700 font-medium">{t.tenantName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(t.status)}
                        <span className="flex items-center gap-0.5 text-zinc-400 font-mono">
                          <MessageSquare className="h-3 w-3" />
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
        <div className="flex-1 flex flex-col bg-white overflow-hidden min-h-0">
          {selectedTicket ? (
            <>
              {/* Selected Ticket Header */}
              <div className="p-4 border-b border-zinc-200 bg-zinc-50/40 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => copyTicketId(selectedTicket.id)}
                      className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 flex items-center gap-1 transition-colors"
                      title="Click to copy ticket reference"
                    >
                      <span>{selectedTicket.id}</span>
                      {copiedId ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-zinc-400" />}
                    </button>
                    {getPriorityBadge(selectedTicket.priority)}
                    {getStatusBadge(selectedTicket.status)}
                    <span className="text-xs text-zinc-400 font-mono">
                      Logged {new Date(selectedTicket.createdAt).toLocaleDateString()} at {new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-zinc-900 tracking-tight leading-snug">
                    {selectedTicket.subject}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1 font-medium text-zinc-700">
                      <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{selectedTicket.tenantName}</span>
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{selectedTicket.requesterName}</span>
                      <span className="text-zinc-400">({selectedTicket.requesterEmail})</span>
                    </span>
                    {selectedTicket.affectedUrl && (
                      <>
                        <span>&bull;</span>
                        <span className="font-mono text-[11px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">
                          Route: {selectedTicket.affectedUrl}
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
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-semibold text-zinc-800 shadow-2xs focus:outline-none"
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
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-xs font-semibold text-zinc-800 shadow-2xs focus:outline-none"
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 font-medium">Assigned Engineer:</span>
                      <span className="px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-900 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-rose-600" />
                        <span>Emil Halili</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation Feed */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50/20">

                {/* Billing / ICP Quota Tap-Up Action Card */}
                {selectedTicket.category === 'account_billing' && (
                  <div className="p-4 rounded-xl bg-zinc-950 text-white border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                          WISE BILLING &amp; QUOTA PROVISIONING
                        </span>
                        <span className="font-mono text-zinc-400">@emilhalilih</span>
                      </div>
                      <p className="text-zinc-300">
                        Complete transfer via Wise (<a href={WISE_PAYMENT_LINK} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline font-mono">wise.com/pay/me/emilhalilih</a>) or scan the official QR code.
                      </p>
                      {role === 'Super Admin' && (
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <span className="text-zinc-400 font-semibold">Super Admin 1-Click Credit:</span>
                          {[2000, 5000, 10000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => {
                                creditTenantRecords(
                                  normalizeTenantKey(selectedTicket.tenantCode || selectedTicket.tenantName),
                                  amt
                                );
                                handleUpdateStatus('resolved');
                                setCreditApprovedToast(`Credited +${amt.toLocaleString()} records to ${selectedTicket.tenantName}`);
                                setTimeout(() => setCreditApprovedToast(null), 3500);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                            >
                              Approve +{amt.toLocaleString()} Records
                            </button>
                          ))}
                          {creditApprovedToast && (
                            <span className="text-emerald-400 font-bold">{creditApprovedToast}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <img
                      src={WISE_QR_PATH}
                      alt="Wise QR @emilhalilih"
                      className="w-20 h-20 object-contain rounded-lg border border-zinc-700 shrink-0"
                    />
                  </div>
                )}

                {/* Initial Description Card */}
                <div className="p-4 rounded-xl bg-white border border-zinc-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-zinc-100 text-zinc-700 flex items-center justify-center font-bold text-xs">
                        {selectedTicket.requesterName.charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-zinc-900">{selectedTicket.requesterName}</span>
                      <span className="text-[10px] text-zinc-400 font-mono">Original Issue Report</span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {new Date(selectedTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-800 leading-relaxed whitespace-pre-wrap">
                    {selectedTicket.description}
                  </div>
                  {selectedTicket.systemInfo && (
                    <div className="pt-2 text-[10px] font-mono text-zinc-400 border-t border-zinc-100">
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
                        <span className="px-3 py-1 rounded-full text-[10px] font-mono font-medium bg-zinc-100 text-zinc-500 border border-zinc-200">
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
                      <div className="flex items-center gap-1.5 text-[11px] px-1 text-zinc-400">
                        <span className="font-semibold text-zinc-700">{msg.senderName}</span>
                        {isAdminMsg && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-zinc-900 text-white uppercase tracking-wider">
                            Appointmentlyy Core
                          </span>
                        )}
                        {isNote && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500 text-white uppercase tracking-wider flex items-center gap-0.5">
                            <Lock className="h-2.5 w-2.5" />
                            <span>Internal Note</span>
                          </span>
                        )}
                        <span>&bull;</span>
                        <span className="font-mono text-[10px]">{formatTimeAgo(msg.createdAt)}</span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`max-w-xl p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap shadow-xs ${
                          isNote
                            ? 'bg-amber-50 border border-amber-200 text-amber-950 font-medium ring-1 ring-amber-200/50'
                            : isAdminMsg
                            ? 'bg-zinc-900 text-white rounded-br-xs'
                            : 'bg-white border border-zinc-200 text-zinc-900 rounded-bl-xs'
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
              <div className="p-3 sm:p-4 border-t border-zinc-200 bg-white shrink-0 space-y-2">
                
                {/* Mode Selectors & Quick Canned Chips */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  {viewPerspective === 'admin' ? (
                    <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
                      <button
                        type="button"
                        onClick={() => setIsInternalNote(false)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                          !isInternalNote
                            ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <Mail className="h-3 w-3 text-rose-600" />
                        <span>Reply to Customer (Emails Update)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsInternalNote(true)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                          isInternalNote
                            ? 'bg-amber-500 text-white font-semibold shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <Lock className="h-3 w-3" />
                        <span>Internal Note (Private)</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Post response or clarification directly to Emil Halili:</span>
                    </div>
                  )}

                  {/* Canned responses */}
                  {viewPerspective === 'admin' && (
                    <div className="hidden lg:flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => applyCannedResponse("Hi, we are actively investigating your issue and reviewing server logs.")}
                        className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[10px]"
                      >
                        + Investigating
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCannedResponse("A fix has been deployed to your workspace. Could you please test and confirm?")}
                        className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[10px]"
                      >
                        + Fix Deployed
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCannedResponse("Issue has been fully resolved and telemetry verified. Thank you for flagging this!")}
                        className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-[10px]"
                      >
                        + Verified Resolved
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
                      className={`w-full p-3 rounded-xl border text-xs focus:outline-none focus:ring-1 resize-none leading-relaxed ${
                        isInternalNote
                          ? 'border-amber-300 bg-amber-50/40 text-amber-950 focus:ring-amber-500 placeholder:text-amber-700/60'
                          : 'border-zinc-200 bg-zinc-50/50 text-zinc-900 focus:ring-zinc-900 placeholder:text-zinc-400'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-zinc-400">
                      {isInternalNote ? (
                        <span className="text-amber-700 font-medium flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          <span>Private internal team note &bull; Not emailed to customer</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-zinc-500">
                          <Mail className="h-3 w-3 text-zinc-400" />
                          <span>Notification will be dispatched to <strong>{selectedTicket.requesterEmail}</strong></span>
                        </span>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={sendingReply || !replyContent.trim()}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-40 ${
                        isInternalNote
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                      }`}
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{sendingReply ? 'Sending...' : isInternalNote ? 'Save Internal Note' : 'Send Reply'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-zinc-400 space-y-3">
              <LifeBuoy className="h-12 w-12 text-zinc-300" />
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-zinc-700">No Trouble Ticket Selected</h3>
                <p>Select a ticket from the left queue to view details and communication timeline.</p>
              </div>
              <button
                onClick={() => setIsNewTicketModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-semibold text-xs hover:bg-zinc-800 transition-colors"
              >
                Create New Ticket
              </button>
            </div>
          )}
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
