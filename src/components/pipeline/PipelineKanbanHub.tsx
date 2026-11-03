'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Kanban,
  Search,
  PhoneCall,
  Mail,
  Globe,
  ExternalLink,
  FolderKanban,
  Users,
  Plus,
  CheckCircle2,
  Clock,
  MessageSquare,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Download,
  Lock,
  Sparkles,
  X,
  Building2,
  MapPin,
  Filter,
} from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import GlobalTopHeader from '@/components/GlobalTopHeader';
import { useSession } from '@/lib/session';
import {
  ContactRecord,
  IcpFolder,
  getStoredContacts,
  getStoredFolders,
  updateContactPipelineStage,
  addContactNote,
  exportContactsToCsv,
  canUserExportCsv,
  subscribeToContacts,
} from '@/lib/leadStore';
import { normalizeTenantKey } from '@/lib/icpQuotaStore';

export interface PipelineColumnConfig {
  id: string;
  statusValue: string;
  label: string;
  subtitle: string;
  dotColor: string;
  badgeStyle: string;
  dealProbability: number; // Used to estimate weighted pipeline value ($3,500 avg deal value)
}

const PIPELINE_COLUMNS: PipelineColumnConfig[] = [
  {
    id: 'col_new',
    statusValue: 'New Lead',
    label: 'New Lead',
    subtitle: 'Pulled from ICP Cloud • Awaiting Touch #1',
    dotColor: 'bg-zinc-400',
    badgeStyle: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    dealProbability: 0.1,
  },
  {
    id: 'col_cadence',
    statusValue: 'In Cadence',
    label: 'In Cadence',
    subtitle: 'Active multi-channel outbound sequence',
    dotColor: 'bg-sky-500',
    badgeStyle: 'bg-sky-50 text-sky-800 border-sky-200',
    dealProbability: 0.25,
  },
  {
    id: 'col_voicemail',
    statusValue: 'Left Voicemail',
    label: 'Left Voicemail',
    subtitle: 'Voicemail dropped • Follow-up queued',
    dotColor: 'bg-amber-500',
    badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200',
    dealProbability: 0.3,
  },
  {
    id: 'col_callback',
    statusValue: 'Call Back Later',
    label: 'Call Back Later',
    subtitle: 'Warm connect • Scheduled callback window',
    dotColor: 'bg-violet-500',
    badgeStyle: 'bg-violet-50 text-violet-800 border-violet-200',
    dealProbability: 0.55,
  },
  {
    id: 'col_booked',
    statusValue: 'Meeting Booked',
    label: 'Meeting Booked',
    subtitle: 'Qualified calendar invite confirmed',
    dotColor: 'bg-emerald-500',
    badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dealProbability: 1.0,
  },
  {
    id: 'col_disqualified',
    statusValue: 'Disqualified',
    label: 'Disqualified / Nurture',
    subtitle: 'Not a fit right now or paused',
    dotColor: 'bg-zinc-300',
    badgeStyle: 'bg-zinc-100 text-zinc-500 border-zinc-200',
    dealProbability: 0,
  },
];

const EST_DEAL_VALUE_USD = 3500;

function mapStatusToColumnValue(rawStatus?: string): string {
  const s = (rawStatus || '').trim().toLowerCase();
  if (s.includes('book') || s.includes('meeting')) return 'Meeting Booked';
  if (s.includes('call back') || s.includes('callback') || s.includes('follow'))
    return 'Call Back Later';
  if (s.includes('voicemail') || s.includes('vm')) return 'Left Voicemail';
  if (s.includes('cadence') || s.includes('working') || s.includes('contacted'))
    return 'In Cadence';
  if (s.includes('disqual') || s.includes('not interested') || s.includes('dnc'))
    return 'Disqualified';
  return 'New Lead';
}

export default function PipelineKanbanHub() {
  const { session, role, tenantName, repName } = useSession();
  const isSuperAdmin = role === 'Super Admin';
  const canExport = canUserExportCsv(role);

  const [contacts, setContacts] = useState<ContactRecord[]>(() => getStoredContacts());
  const [folders, setFolders] = useState<IcpFolder[]>(() => getStoredFolders());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('ALL');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('ALL');

  // Drag & Drop State
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // Selected Lead Drawer State
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  useEffect(() => {
    const unsub = subscribeToContacts((updated) => {
      setContacts(updated);
      setFolders(getStoredFolders());
    });
    return () => unsub();
  }, []);

  const activeTenantCode = useMemo(
    () => normalizeTenantKey(session.tenantCode || tenantName),
    [session.tenantCode, tenantName]
  );

  // Role & Tenant-scoped leads (Reps strictly only see leads assigned to them)
  const scopedContacts = useMemo(() => {
    return contacts.filter((c) => {
      const sameTenant =
        isSuperAdmin ||
        !c.tenantId ||
        normalizeTenantKey(c.tenantId) === activeTenantCode;
      if (!sameTenant) return false;

      if (role === 'Rep') {
        return (c.assignedRep || '').toLowerCase() === repName.toLowerCase();
      }
      return true;
    });
  }, [contacts, isSuperAdmin, activeTenantCode, role, repName]);

  // Available Reps for Filter
  const availableReps = useMemo(() => {
    const set = new Set<string>();
    scopedContacts.forEach((c) => {
      if (c.assignedRep) set.add(c.assignedRep);
    });
    return Array.from(set);
  }, [scopedContacts]);

  // Filtered Contacts
  const filteredContacts = useMemo(() => {
    return scopedContacts.filter((c) => {
      if (selectedFolderId !== 'ALL' && c.folderId !== selectedFolderId) {
        return false;
      }
      if (selectedRepFilter !== 'ALL' && c.assignedRep !== selectedRepFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.industry || '').toLowerCase().includes(q) ||
          (c.location || '').toLowerCase().includes(q) ||
          (c.folderName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [scopedContacts, selectedFolderId, selectedRepFilter, searchQuery]);

  // Group contacts by Kanban stage
  const contactsByStage = useMemo(() => {
    const map: Record<string, ContactRecord[]> = {};
    PIPELINE_COLUMNS.forEach((col) => {
      map[col.statusValue] = [];
    });
    filteredContacts.forEach((c) => {
      const stage = mapStatusToColumnValue(c.status);
      if (!map[stage]) map[stage] = [];
      map[stage].push(c);
    });
    return map;
  }, [filteredContacts]);

  // Telemetry calculations
  const telemetry = useMemo(() => {
    const totalLeads = filteredContacts.length;
    const bookedCount = (contactsByStage['Meeting Booked'] || []).length;
    const warmCallbacks = (contactsByStage['Call Back Later'] || []).length;
    const inCadenceCount =
      (contactsByStage['In Cadence'] || []).length +
      (contactsByStage['Left Voicemail'] || []).length;
    const bookedValueUsd = bookedCount * EST_DEAL_VALUE_USD;
    const weightedPipelineUsd = PIPELINE_COLUMNS.reduce((acc, col) => {
      const count = (contactsByStage[col.statusValue] || []).length;
      return acc + Math.round(count * EST_DEAL_VALUE_USD * col.dealProbability);
    }, 0);

    return {
      totalLeads,
      bookedCount,
      warmCallbacks,
      inCadenceCount,
      bookedValueUsd,
      weightedPipelineUsd,
    };
  }, [filteredContacts, contactsByStage]);

  const activeLead = useMemo(
    () => contacts.find((c) => c.id === activeLeadId) || null,
    [contacts, activeLeadId]
  );

  // Move lead to stage
  const handleMoveStage = (contactId: string, targetStatus: string) => {
    updateContactPipelineStage(contactId, targetStatus, repName || 'Admin');
    setContacts(getStoredContacts());
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumnId !== colId) {
      setDragOverColumnId(colId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatusValue: string) => {
    e.preventDefault();
    const droppedId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (droppedId) {
      handleMoveStage(droppedId, targetStatusValue);
    }
    setDraggedLeadId(null);
    setDragOverColumnId(null);
  };

  const handleSaveLeadNote = () => {
    if (!activeLead || !noteInput.trim()) return;
    addContactNote(activeLead.id, noteInput.trim(), repName || 'Admin');
    setContacts(getStoredContacts());
    setNoteInput('');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAFAFA] font-sans antialiased text-zinc-900">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GlobalTopHeader />

        <main className="flex-1 flex flex-col min-h-0 px-6 py-5 space-y-4 max-w-[1600px] w-full mx-auto">
          {/* 1. TOP HEADER & PIPELINE TELEMETRY BAR */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shrink-0 shadow-2xs">
            <div className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-950 text-white text-[10px] font-mono font-semibold tracking-wider uppercase">
                    <Kanban className="w-3 h-3 text-emerald-400" />
                    <span>LIVE OUTBOUND PIPELINE KANBAN</span>
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {tenantName}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                    {role === 'Rep'
                      ? `Rep View • Assigned Leads Only (${repName})`
                      : `${role} • Full Workspace Pipeline`}
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-950">
                  Pipeline Dashboard &amp; Deal Stage Board
                </h1>
              </div>

              {/* Filter & Action Controls */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, BPO, domain..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50/70 focus:bg-white text-xs text-zinc-900 w-52 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                {/* Folder Filter */}
                <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs">
                  <FolderKanban className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="bg-transparent text-zinc-900 font-medium focus:outline-none cursor-pointer max-w-[190px] truncate"
                  >
                    <option value="ALL">All ICP Folders ({scopedContacts.length})</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rep Filter (for Admins/Managers) */}
                {role !== 'Rep' && (
                  <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs">
                    <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <select
                      value={selectedRepFilter}
                      onChange={(e) => setSelectedRepFilter(e.target.value)}
                      className="bg-transparent text-zinc-900 font-medium focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All SDR Reps</option>
                      {availableReps.map((rep) => (
                        <option key={rep} value={rep}>
                          {rep}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Export or Lock */}
                {canExport ? (
                  <button
                    type="button"
                    onClick={() =>
                      exportContactsToCsv(filteredContacts, 'pipeline_kanban_export')
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export Pipeline CSV</span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-500 text-xs select-none">
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span>CSV Locked</span>
                  </span>
                )}
              </div>
            </div>

            {/* 4-Column Pipeline KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100 bg-zinc-50/40 text-xs">
              <div className="px-6 py-3 flex items-center justify-between">
                <div>
                  <div className="text-zinc-400 font-medium">Total Active Pipeline</div>
                  <div className="text-lg font-bold font-mono text-zinc-950 mt-0.5">
                    {telemetry.totalLeads.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">prospects</span>
                  </div>
                </div>
                <Link
                  href="/icp-builder"
                  className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 hover:border-zinc-900 text-zinc-900 font-semibold text-[11px]"
                >
                  + Pull ICP List
                </Link>
              </div>

              <div className="px-6 py-3 flex items-center justify-between">
                <div>
                  <div className="text-zinc-400 font-medium">In Active Cadence</div>
                  <div className="text-lg font-bold font-mono text-zinc-950 mt-0.5">
                    {telemetry.inCadenceCount.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">working</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono text-[11px]">
                  {telemetry.warmCallbacks} Warm Callbacks
                </span>
              </div>

              <div className="px-6 py-3 flex items-center justify-between">
                <div>
                  <div className="text-zinc-400 font-medium">Meetings Booked</div>
                  <div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                    {telemetry.bookedCount.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">confirmed</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-semibold text-[11px]">
                  ${telemetry.bookedValueUsd.toLocaleString()} Booked
                </span>
              </div>

              <div className="px-6 py-3 flex items-center justify-between bg-white">
                <div>
                  <div className="text-zinc-400 font-medium">
                    Weighted Pipeline Value
                  </div>
                  <div className="text-lg font-bold font-mono text-zinc-950 mt-0.5">
                    ${telemetry.weightedPipelineUsd.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">est. ARR</span>
                  </div>
                </div>
                <Link
                  href="/cockpit"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-950 text-white font-semibold text-[11px] hover:bg-zinc-800"
                >
                  <PhoneCall className="w-3 h-3 text-emerald-400" />
                  <span>Calling Floor</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 2. HORIZONTAL KANBAN BOARD */}
          <div className="flex-1 min-h-0 overflow-x-auto pb-2">
            <div className="flex gap-4 h-full min-w-max">
              {PIPELINE_COLUMNS.map((col, colIndex) => {
                const cards = contactsByStage[col.statusValue] || [];
                const isDragTarget = dragOverColumnId === col.id;
                const stageValue = Math.round(
                  cards.length * EST_DEAL_VALUE_USD * col.dealProbability
                );

                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => handleDragOver(e, col.id)}
                    onDragLeave={() => setDragOverColumnId(null)}
                    onDrop={(e) => handleDrop(e, col.statusValue)}
                    className={`w-[305px] shrink-0 flex flex-col rounded-2xl border transition-all ${
                      isDragTarget
                        ? 'bg-zinc-100/90 border-zinc-950 ring-2 ring-zinc-950/10'
                        : 'bg-zinc-100/60 border-zinc-200/90'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="p-3.5 border-b border-zinc-200/80 bg-white rounded-t-2xl space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${col.dotColor}`}
                          />
                          <h2 className="text-xs font-bold text-zinc-950 tracking-tight">
                            {col.label}
                          </h2>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {stageValue > 0 && (
                            <span className="text-[10px] font-mono text-zinc-400">
                              ${stageValue.toLocaleString()}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-zinc-950 text-white font-mono text-[10px] font-bold">
                            {cards.length}
                          </span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {col.subtitle}
                      </p>
                    </div>

                    {/* Cards Container */}
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                      {cards.length === 0 ? (
                        <div className="h-36 rounded-xl border border-dashed border-zinc-300/80 flex flex-col items-center justify-center p-4 text-center text-xs text-zinc-400">
                          <span>Drag a prospect card here</span>
                          <span className="text-[11px] text-zinc-400 mt-0.5">
                            to move to {col.label}
                          </span>
                        </div>
                      ) : (
                        cards.map((lead) => {
                          const prevCol =
                            colIndex > 0 ? PIPELINE_COLUMNS[colIndex - 1] : null;
                          const nextCol =
                            colIndex < PIPELINE_COLUMNS.length - 1
                              ? PIPELINE_COLUMNS[colIndex + 1]
                              : null;

                          return (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, lead.id)}
                              onClick={() => setActiveLeadId(lead.id)}
                              className={`group bg-white rounded-xl p-3.5 border border-zinc-200/90 hover:border-zinc-900 shadow-2xs transition cursor-grab active:cursor-grabbing space-y-2.5 ${
                                !canExport ? 'select-none' : ''
                              }`}
                            >
                              {/* Card Top: Name + LinkedIn + Rep */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-zinc-950 truncate">
                                      {lead.name}
                                    </span>
                                    {lead.linkedinUrl && (
                                      <a
                                        href={lead.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Open LinkedIn Profile"
                                        className="px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-mono text-[10px] shrink-0"
                                      >
                                        in
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                                    {lead.title}
                                  </div>
                                </div>

                                <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[10px] shrink-0">
                                  {lead.assignedRep?.split(' ')[0] || 'Rep'}
                                </span>
                              </div>

                              {/* Company + Website */}
                              <div className="p-2 rounded-lg bg-zinc-50/80 border border-zinc-100 space-y-1">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-zinc-900 truncate">
                                    {lead.company}
                                  </span>
                                  {lead.website && (
                                    <a
                                      href={
                                        lead.website.startsWith('http')
                                          ? lead.website
                                          : `https://${lead.website}`
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-950 underline shrink-0"
                                    >
                                      <Globe className="w-2.5 h-2.5 text-zinc-400" />
                                      <span>
                                        {lead.website
                                          .replace(/^https?:\/\//, '')
                                          .replace(/\/.*$/, '')}
                                      </span>
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                                  <span className="truncate">{lead.phone}</span>
                                  <span>Day {lead.cadenceDay || 1}</span>
                                </div>
                              </div>

                              {/* Folder Tag if present */}
                              {lead.folderName && (
                                <div className="flex items-center gap-1 text-[10px] text-zinc-500 truncate">
                                  <FolderKanban className="w-3 h-3 text-zinc-400 shrink-0" />
                                  <span className="truncate">{lead.folderName}</span>
                                </div>
                              )}

                              {/* Bottom Quick Actions: Move Left / Dial / Email / Move Right */}
                              <div
                                className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1">
                                  {prevCol && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleMoveStage(lead.id, prevCol.statusValue)
                                      }
                                      title={`Move back to ${prevCol.label}`}
                                      className="p-1 rounded-md border border-zinc-200 hover:border-zinc-900 text-zinc-600 hover:text-zinc-950 cursor-pointer"
                                    >
                                      <ChevronLeft className="w-3 h-3" />
                                    </button>
                                  )}
                                  {nextCol && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleMoveStage(lead.id, nextCol.statusValue)
                                      }
                                      title={`Advance to ${nextCol.label}`}
                                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-zinc-200 hover:border-zinc-900 text-[10px] font-semibold text-zinc-700 hover:text-zinc-950 cursor-pointer"
                                    >
                                      <span>Next Stage</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  <Link
                                    href="/email"
                                    title="Open in Cold Email Studio"
                                    className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                                  >
                                    <Mail className="w-3 h-3" />
                                  </Link>
                                  <Link
                                    href="/cockpit"
                                    title="Dial on Calling Floor"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white text-[10px] font-semibold"
                                  >
                                    <PhoneCall className="w-2.5 h-2.5 text-emerald-400" />
                                    <span>Dial</span>
                                  </Link>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* 3. SLIDE-OVER PROSPECT INSPECTOR & FOOTPRINT DRAWER */}
      {activeLead && (
        <div className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl border-l border-zinc-200 flex flex-col justify-between overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 bg-zinc-950 text-white flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-mono text-[10px]">
                    {activeLead.id}
                  </span>
                  <span className="text-xs text-zinc-400">
                    Assigned to <strong className="text-white">{activeLead.assignedRep}</strong>
                  </span>
                </div>
                <h2 className="text-lg font-bold">{activeLead.name}</h2>
                <p className="text-xs text-zinc-300">
                  {activeLead.title} at <strong>{activeLead.company}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLeadId(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Stage Selector Pills */}
              <div className="space-y-2">
                <label className="block font-bold text-zinc-900">
                  Pipeline Kanban Stage
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PIPELINE_COLUMNS.map((col) => {
                    const current =
                      mapStatusToColumnValue(activeLead.status) === col.statusValue;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() =>
                          handleMoveStage(activeLead.id, col.statusValue)
                        }
                        className={`px-2.5 py-2 rounded-xl border text-left font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                          current
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                        <span className="truncate">{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Direct Contact & Links Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Direct / Mobile Phone</span>
                  <span className="font-mono font-bold text-zinc-950">
                    {activeLead.phone}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Verified Work Email</span>
                  <span className="font-mono text-zinc-900">{activeLead.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Company Website</span>
                  {activeLead.website ? (
                    <a
                      href={
                        activeLead.website.startsWith('http')
                          ? activeLead.website
                          : `https://${activeLead.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-zinc-900 underline"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{activeLead.website}</span>
                    </a>
                  ) : (
                    <span className="text-zinc-400">N/A</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">LinkedIn Profile</span>
                  {activeLead.linkedinUrl ? (
                    <a
                      href={activeLead.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-sky-700 underline"
                    >
                      <span>Open LinkedIn Profile</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-zinc-400">N/A</span>
                  )}
                </div>
                {activeLead.folderName && (
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60">
                    <span className="text-zinc-500">ICP Source Folder</span>
                    <span className="font-medium text-zinc-900">
                      {activeLead.folderName}
                    </span>
                  </div>
                )}
              </div>

              {/* Add Pipeline Note */}
              <div className="space-y-2">
                <label className="block font-bold text-zinc-900">
                  Log Deal / Call Note
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Add qualification note or next steps..."
                    className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={handleSaveLeadNote}
                    className="px-4 py-2 rounded-xl bg-zinc-950 text-white font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                </div>
                {activeLead.leadNotes && (
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/70 text-zinc-700 whitespace-pre-line leading-relaxed">
                    {activeLead.leadNotes}
                  </div>
                )}
              </div>

              {/* Historical Activity Footprint */}
              <div className="space-y-2.5">
                <div className="font-bold text-zinc-900">
                  Activity &amp; Stage Footprint ({activeLead.footprint?.length || 0})
                </div>
                <div className="space-y-2">
                  {(activeLead.footprint || []).map((fp) => (
                    <div
                      key={fp.id}
                      className="p-3 rounded-xl border border-zinc-200/80 bg-white space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-zinc-900">{fp.title}</span>
                        <span className="font-mono text-zinc-400">
                          {fp.timestamp}
                        </span>
                      </div>
                      <p className="text-zinc-600 leading-relaxed">{fp.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2">
              <Link
                href="/contacts"
                className="px-4 py-2.5 rounded-xl border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
              >
                Open in Global Contacts
              </Link>
              <Link
                href="/cockpit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 text-white text-xs font-bold hover:bg-zinc-800"
              >
                <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                <span>Launch Calling Floor</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
