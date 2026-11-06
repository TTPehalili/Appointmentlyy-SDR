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
  Check,
  ChevronRight,
  ChevronLeft,
  Download,
  Lock,
  X,
  Pencil,
  Trash2,
  SlidersHorizontal,
  RotateCcw,
} from 'lucide-react';
import { useSession, canUserReassignLeads, canUserAccessIcpBuilder } from '@/lib/session';
import {
  ContactRecord,
  IcpFolder,
  PipelineStageConfig,
  STAGE_COLOR_PALETTE,
  getStoredContacts,
  getStoredFolders,
  getStoredPipelineStages,
  updatePipelineStageConfig,
  addCustomPipelineStage,
  movePipelineStageOrder,
  deletePipelineStage,
  resetPipelineStagesToDefault,
  updateContactPipelineStage,
  getContactDealValue,
  updateContactDealValue,
  reassignContactToRep,
  addContactNote,
  exportContactsToCsv,
  canUserExportCsv,
  subscribeToContacts,
} from '@/lib/leadStore';
import {
  normalizeTenantKey,
  getTenantQuota,
  updateTenantRepsRoster,
} from '@/lib/icpQuotaStore';

/**
 * Resolve which configured Kanban stage column a contact belongs to.
 * Matches exact statusValue or label first, then intelligent keyword fallback,
 * and finally defaults to the first column.
 */
function resolveStageForContact(
  rawStatus: string | undefined,
  stages: PipelineStageConfig[]
): string {
  if (!stages || stages.length === 0) return 'New Lead';
  const s = (rawStatus || '').trim();
  const sLower = s.toLowerCase();

  // 1. Exact match on statusValue or label
  const exact = stages.find(
    (col) =>
      col.statusValue.toLowerCase() === sLower ||
      col.label.toLowerCase() === sLower
  );
  if (exact) return exact.statusValue;

  // 2. Semantic fallback for standard statuses if the user renamed labels
  if (sLower.includes('book') || sLower.includes('meeting')) {
    const found = stages.find(
      (col) =>
        col.id === 'col_booked' ||
        col.label.toLowerCase().includes('book') ||
        col.label.toLowerCase().includes('meeting') ||
        col.dealProbability >= 0.9
    );
    if (found) return found.statusValue;
  }
  if (sLower.includes('call back') || sLower.includes('callback')) {
    const found = stages.find(
      (col) =>
        col.id === 'col_callback' ||
        col.label.toLowerCase().includes('call') ||
        col.label.toLowerCase().includes('follow')
    );
    if (found) return found.statusValue;
  }
  if (sLower.includes('voicemail') || sLower.includes('vm')) {
    const found = stages.find(
      (col) =>
        col.id === 'col_voicemail' ||
        col.label.toLowerCase().includes('voicemail')
    );
    if (found) return found.statusValue;
  }
  if (sLower.includes('cadence') || sLower.includes('working')) {
    const found = stages.find(
      (col) =>
        col.id === 'col_cadence' ||
        col.label.toLowerCase().includes('cadence') ||
        col.label.toLowerCase().includes('working')
    );
    if (found) return found.statusValue;
  }
  if (sLower.includes('disqual') || sLower.includes('not interested')) {
    const found = stages.find(
      (col) =>
        col.id === 'col_disqualified' ||
        col.label.toLowerCase().includes('disqual') ||
        col.label.toLowerCase().includes('nurture')
    );
    if (found) return found.statusValue;
  }

  return stages[0].statusValue;
}

export default function PipelineKanbanHub() {
  const { session, role, canAccessIcp, tenantName, repName } = useSession();
  const isSuperAdmin = role === 'Super Admin';
  const canExport = canUserExportCsv(role);
  const canReassign = canUserReassignLeads(role);

  const [contacts, setContacts] = useState<ContactRecord[]>(() => getStoredContacts());
  const [folders, setFolders] = useState<IcpFolder[]>(() => getStoredFolders());
  const [stages, setStages] = useState<PipelineStageConfig[]>(() =>
    getStoredPipelineStages()
  );

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('ALL');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('ALL');

  // Inline Column Header Editing State
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingLabelInput, setEditingLabelInput] = useState('');
  const [editingSubtitleInput, setEditingSubtitleInput] = useState('');

  // Inline Card Deal Value Editing State
  const [editingDealCardId, setEditingDealCardId] = useState<string | null>(null);
  const [editingDealInput, setEditingDealInput] = useState<string>('');

  // Drawer Deal Value & New Rep Input State
  const [drawerDealInput, setDrawerDealInput] = useState<string>('');
  const [newAgentRosterInput, setNewAgentRosterInput] = useState<string>('');
  const [reassignToast, setReassignToast] = useState<string | null>(null);

  // Customize / Add Stages Modal State
  const [isStageManagerOpen, setIsStageManagerOpen] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [newStageSubtitle, setNewStageSubtitle] = useState('');
  const [newStageColorIdx, setNewStageColorIdx] = useState<number>(4); // Indigo default
  const [newStageProb, setNewStageProb] = useState<number>(50);

  // Drag & Drop State
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  // 25-Per-Page Pagination State per Kanban Column
  const [columnPageMap, setColumnPageMap] = useState<Record<string, number>>({});
  const KANBAN_PAGE_SIZE = 25;

  // Selected Lead Drawer State
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  useEffect(() => {
    const unsub = subscribeToContacts((updated) => {
      setContacts(updated);
      setFolders(getStoredFolders());
      setStages(getStoredPipelineStages());
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

  // Available Reps for Filter & Reassignment Roster
  const availableReps = useMemo(() => {
    const quota = getTenantQuota(activeTenantCode, tenantName);
    const set = new Set<string>(quota.repsRoster || []);
    scopedContacts.forEach((c) => {
      if (c.assignedRep) set.add(c.assignedRep);
    });
    return Array.from(set);
  }, [scopedContacts, activeTenantCode, tenantName]);

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
    stages.forEach((col) => {
      map[col.statusValue] = [];
    });
    filteredContacts.forEach((c) => {
      const stageVal = resolveStageForContact(c.status, stages);
      if (!map[stageVal]) map[stageVal] = [];
      map[stageVal].push(c);
    });
    return map;
  }, [filteredContacts, stages]);

  // Telemetry calculations
  const telemetry = useMemo(() => {
    const totalLeads = filteredContacts.length;
    const bookedCol =
      stages.find(
        (s) =>
          s.id === 'col_booked' ||
          s.label.toLowerCase().includes('book') ||
          s.dealProbability >= 0.9
      ) || stages[stages.length - 2];

    const bookedCards = bookedCol
      ? contactsByStage[bookedCol.statusValue] || []
      : [];
    const bookedCount = bookedCards.length;

    const warmCol = stages.find(
      (s) =>
        s.id === 'col_callback' ||
        s.label.toLowerCase().includes('call') ||
        s.label.toLowerCase().includes('warm')
    );
    const warmCallbacks = warmCol
      ? (contactsByStage[warmCol.statusValue] || []).length
      : 0;

    const inCadenceCount = stages
      .filter(
        (s) =>
          s.dealProbability > 0.1 &&
          s.dealProbability < 0.9 &&
          s.id !== warmCol?.id
      )
      .reduce(
        (sum, s) => sum + (contactsByStage[s.statusValue] || []).length,
        0
      );

    const bookedValueUsd = bookedCards.reduce(
      (sum, c) => sum + getContactDealValue(c),
      0
    );
    const weightedPipelineUsd = stages.reduce((acc, col) => {
      const colCards = contactsByStage[col.statusValue] || [];
      const colTotalValue = colCards.reduce(
        (sum, c) => sum + getContactDealValue(c),
        0
      );
      return acc + Math.round(colTotalValue * col.dealProbability);
    }, 0);

    return {
      totalLeads,
      bookedCount,
      warmCallbacks,
      inCadenceCount,
      bookedValueUsd,
      weightedPipelineUsd,
    };
  }, [filteredContacts, contactsByStage, stages]);

  const activeLead = useMemo(
    () => contacts.find((c) => c.id === activeLeadId) || null,
    [contacts, activeLeadId]
  );

  useEffect(() => {
    if (activeLead) {
      setDrawerDealInput(String(getContactDealValue(activeLead)));
    }
  }, [activeLead?.id, activeLead?.dealValue]);

  // Save Deal Value for a lead
  const handleSaveDealValue = (contactId: string, rawVal: string) => {
    const numeric = Number(String(rawVal).replace(/[^0-9.]/g, ''));
    if (isNaN(numeric) || numeric < 0) return;
    updateContactDealValue(contactId, numeric, repName || role);
    setContacts(getStoredContacts());
    setEditingDealCardId(null);
    setReassignToast(`Deal value updated to $${Math.round(numeric).toLocaleString()}`);
    setTimeout(() => setReassignToast(null), 2400);
  };

  // Reassign a lead to another Rep (Supervisor, Manager, Admin, Super Admin)
  const handleReassignLead = (contactId: string, targetRep: string) => {
    if (!canReassign || !targetRep.trim()) return;
    const updated = reassignContactToRep(
      contactId,
      targetRep.trim(),
      repName || role,
      role
    );
    if (updated) {
      setContacts(getStoredContacts());
      setFolders(getStoredFolders());
      setReassignToast(`Reassigned ${updated.name} → ${targetRep.trim()}`);
      setTimeout(() => setReassignToast(null), 2400);
    }
  };

  // Add a new Agent/Rep to the workspace roster and optionally assign active lead
  const handleAddNewAgentAndAssign = (assignLeadId?: string) => {
    const clean = newAgentRosterInput.trim();
    if (!clean || !canReassign) return;
    const quota = getTenantQuota(activeTenantCode, tenantName);
    const nextRoster = Array.from(new Set([...(quota.repsRoster || []), clean]));
    updateTenantRepsRoster(activeTenantCode, nextRoster);
    if (assignLeadId) {
      handleReassignLead(assignLeadId, clean);
    }
    setNewAgentRosterInput('');
  };

  // Move lead to stage
  const handleMoveStage = (contactId: string, targetStatus: string) => {
    updateContactPipelineStage(contactId, targetStatus, repName || 'Admin');
    setContacts(getStoredContacts());
  };

  // Inline Edit Stage Label Handlers
  const startEditingStageHeader = (col: PipelineStageConfig) => {
    setEditingStageId(col.id);
    setEditingLabelInput(col.label);
    setEditingSubtitleInput(col.subtitle);
  };

  const saveInlineStageEdit = (stageId: string) => {
    if (!editingLabelInput.trim()) {
      setEditingStageId(null);
      return;
    }
    const updated = updatePipelineStageConfig(stageId, {
      label: editingLabelInput.trim(),
      subtitle: editingSubtitleInput.trim(),
    });
    setStages([...updated]);
    setContacts(getStoredContacts());
    setEditingStageId(null);
  };

  // Add Custom Stage Handler
  const handleCreateCustomStage = () => {
    if (!newStageLabel.trim()) return;
    const palette =
      STAGE_COLOR_PALETTE[newStageColorIdx] || STAGE_COLOR_PALETTE[4];
    const updated = addCustomPipelineStage({
      label: newStageLabel.trim(),
      subtitle: newStageSubtitle.trim() || 'Custom pipeline stage',
      dotColor: palette.dotColor,
      badgeStyle: palette.badgeStyle,
      dealProbability: Math.min(100, Math.max(0, newStageProb)) / 100,
    });
    setStages([...updated]);
    setNewStageLabel('');
    setNewStageSubtitle('');
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
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-[#FAFAFA] font-sans antialiased text-zinc-900">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 flex flex-col min-h-0 px-6 py-5 space-y-4 max-w-[1600px] w-full mx-auto">
          {/* 1. TOP HEADER & PIPELINE TELEMETRY BAR */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shrink-0 shadow-2xs">
            <div className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-950 text-white text-[10px] font-mono font-semibold tracking-wider uppercase">
                    <Kanban className="w-3 h-3 text-emerald-400" />
                    <span>LIVE OUTBOUND PIPELINE</span>
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {tenantName}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                    {stages.length} Custom Stages • Click any stage title to edit label
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-950">
                  Pipeline
                </h1>
              </div>

              {/* Filter & Stage Customization Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, BPO, domain..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50/70 focus:bg-white text-xs text-zinc-900 w-48 focus:outline-none focus:border-zinc-900"
                  />
                </div>

                {/* Folder Filter */}
                <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs">
                  <FolderKanban className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="bg-transparent text-zinc-900 font-medium focus:outline-none cursor-pointer max-w-[180px] truncate"
                  >
                    <option value="ALL">
                      All ICP Folders ({scopedContacts.length})
                    </option>
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

                {/* Customize / Add Pipeline Stages Button */}
                <button
                  type="button"
                  onClick={() => setIsStageManagerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 text-xs font-semibold transition cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-700" />
                  <span>Edit &amp; Add Stages</span>
                </button>

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
                    <span>Export CSV</span>
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
                  href="/dialer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-950 text-white font-semibold text-[11px] hover:bg-zinc-800"
                >
                  <PhoneCall className="w-3 h-3 text-emerald-400" />
                  <span>Calling Floor</span>
                </Link>
              </div>
            </div>
          </div>

          {/* 2. HORIZONTAL KANBAN BOARD WITH INLINE LABEL EDITING + ADD STAGE COLUMN */}
          <div className="flex-1 min-h-0 overflow-x-auto pb-2">
            <div className="flex gap-4 h-full min-w-max">
              {stages.map((col, colIndex) => {
                const cards = contactsByStage[col.statusValue] || [];
                const colPage = columnPageMap[col.id] || 1;
                const totalColPages = Math.max(
                  1,
                  Math.ceil(cards.length / KANBAN_PAGE_SIZE)
                );
                const safeColPage = Math.min(colPage, totalColPages);
                const paginatedCards = cards.slice(
                  (safeColPage - 1) * KANBAN_PAGE_SIZE,
                  safeColPage * KANBAN_PAGE_SIZE
                );
                const isDragTarget = dragOverColumnId === col.id;
                const isEditingThisHeader = editingStageId === col.id;
                const rawStageTotal = cards.reduce(
                  (sum, c) => sum + getContactDealValue(c),
                  0
                );
                const stageValue = Math.round(
                  rawStageTotal * col.dealProbability
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
                    {/* Column Header (Supports 1-Click Inline Label & Subtitle Editing) */}
                    <div className="p-3.5 border-b border-zinc-200/80 bg-white rounded-t-2xl space-y-1.5">
                      {isEditingThisHeader ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={editingLabelInput}
                              onChange={(e) => setEditingLabelInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveInlineStageEdit(col.id);
                                if (e.key === 'Escape') setEditingStageId(null);
                              }}
                              placeholder="Stage Label..."
                              className="flex-1 px-2.5 py-1 rounded-lg border border-zinc-900 text-xs font-bold text-zinc-950 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => saveInlineStageEdit(col.id)}
                              className="p-1.5 rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 cursor-pointer"
                              title="Save stage label"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStageId(null)}
                              className="p-1.5 rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={editingSubtitleInput}
                            onChange={(e) => setEditingSubtitleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineStageEdit(col.id);
                            }}
                            placeholder="Stage description..."
                            className="w-full px-2.5 py-1 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 focus:outline-none"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => startEditingStageHeader(col)}
                              title="Click to rename stage label"
                              className="group/title flex items-center gap-2 text-left cursor-pointer min-w-0"
                            >
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${col.dotColor}`}
                              />
                              <h2 className="text-xs font-bold text-zinc-950 tracking-tight truncate group-hover/title:underline">
                                {col.label}
                              </h2>
                              <Pencil className="w-3 h-3 text-zinc-300 group-hover/title:text-zinc-700 opacity-0 group-hover/title:opacity-100 transition shrink-0" />
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
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
                          <div className="flex items-center justify-between gap-2">
                            <p
                              onClick={() => startEditingStageHeader(col)}
                              className="text-[11px] text-zinc-400 truncate cursor-pointer hover:text-zinc-600"
                            >
                              {col.subtitle}
                            </p>
                            <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                              {Math.round(col.dealProbability * 100)}%
                            </span>
                          </div>
                        </>
                      )}
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
                        paginatedCards.map((lead) => {
                          const prevCol =
                            colIndex > 0 ? stages[colIndex - 1] : null;
                          const nextCol =
                            colIndex < stages.length - 1
                              ? stages[colIndex + 1]
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
                              {/* Card Top: Name + LinkedIn + Reassignable Rep Selector */}
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

                                {/* Rep Assignment Badge or 1-Click Reassign Dropdown (Supervisor, Manager, Admin, Super Admin) */}
                                {canReassign ? (
                                  <select
                                    value={lead.assignedRep || 'Emil Halili'}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleReassignLead(lead.id, e.target.value);
                                    }}
                                    title="Reassign lead to another Rep / Agent (Supervisor, Manager, Admin, Super Admin)"
                                    className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-zinc-900 hover:text-white text-zinc-800 font-mono text-[10px] font-semibold shrink-0 cursor-pointer border border-zinc-200 transition focus:outline-none max-w-[115px] truncate"
                                  >
                                    {availableReps.map((rep) => (
                                      <option
                                        key={rep}
                                        value={rep}
                                        className="bg-white text-zinc-900"
                                      >
                                        👤 {rep}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[10px] shrink-0">
                                    {lead.assignedRep?.split(' ')[0] || 'Rep'}
                                  </span>
                                )}
                              </div>

                              {/* Editable Deal Value Badge Row */}
                              <div
                                className="flex items-center justify-between gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-[10px] font-mono text-zinc-400">
                                  Deal Value (USD)
                                </span>
                                {editingDealCardId === lead.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-mono font-bold text-zinc-500">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      step={100}
                                      autoFocus
                                      value={editingDealInput}
                                      onChange={(e) =>
                                        setEditingDealInput(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveDealValue(
                                            lead.id,
                                            editingDealInput
                                          );
                                        }
                                        if (e.key === 'Escape') {
                                          setEditingDealCardId(null);
                                        }
                                      }}
                                      className="w-20 px-1.5 py-0.5 rounded border border-zinc-900 text-[11px] font-mono font-bold text-zinc-950 focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSaveDealValue(
                                          lead.id,
                                          editingDealInput
                                        )
                                      }
                                      className="p-1 rounded bg-zinc-950 text-white hover:bg-zinc-800 cursor-pointer"
                                      title="Save Deal Value"
                                    >
                                      <Check className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingDealCardId(null)}
                                      className="p-1 rounded bg-zinc-100 text-zinc-600 hover:bg-zinc-200 cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDealCardId(lead.id);
                                      setEditingDealInput(
                                        String(getContactDealValue(lead))
                                      );
                                    }}
                                    title="Click to manually edit this lead's Deal Value ($)"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono text-[11px] font-bold transition cursor-pointer"
                                  >
                                    <span>
                                      ${getContactDealValue(lead).toLocaleString()}
                                    </span>
                                    <Pencil className="w-2.5 h-2.5 text-emerald-600" />
                                  </button>
                                )}
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
                                    href="/outreach/email"
                                    title="Open in Cold Email Studio"
                                    className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                                  >
                                    <Mail className="w-3 h-3" />
                                  </Link>
                                  <Link
                                    href="/dialer"
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

                    {/* 25-Per-Page Column Footer Pagination */}
                    {cards.length > KANBAN_PAGE_SIZE && (
                      <div className="px-3 py-2 border-t border-zinc-200/80 bg-white rounded-b-2xl flex items-center justify-between text-[11px]">
                        <button
                          type="button"
                          disabled={safeColPage <= 1}
                          onClick={() =>
                            setColumnPageMap((prev) => ({
                              ...prev,
                              [col.id]: Math.max(1, safeColPage - 1),
                            }))
                          }
                          className="px-2 py-0.5 rounded border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-semibold disabled:opacity-35 cursor-pointer"
                        >
                          &larr; Prev 25
                        </button>
                        <span className="font-mono text-zinc-500">
                          {safeColPage}/{totalColPages} ({cards.length})
                        </span>
                        <button
                          type="button"
                          disabled={safeColPage >= totalColPages}
                          onClick={() =>
                            setColumnPageMap((prev) => ({
                              ...prev,
                              [col.id]: Math.min(totalColPages, safeColPage + 1),
                            }))
                          }
                          className="px-2 py-0.5 rounded bg-zinc-950 text-white font-semibold disabled:opacity-35 cursor-pointer"
                        >
                          Next 25 &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Quick "+ Add Pipeline Stage" Column Card at the end of the board */}
              <div className="w-[270px] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsStageManagerOpen(true)}
                  className="w-full h-36 rounded-2xl border-2 border-dashed border-zinc-300 hover:border-zinc-950 bg-white/60 hover:bg-white transition flex flex-col items-center justify-center gap-2 p-4 text-center cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-xl bg-zinc-100 group-hover:bg-zinc-950 text-zinc-700 group-hover:text-white flex items-center justify-center transition">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-bold text-zinc-900">
                    + Add Pipeline Stage
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Add custom stages, edit labels, or reorder columns
                  </p>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* 3. MODAL: EDIT STAGE LABELS, REORDER & ADD CUSTOM PIPELINE STAGES */}
      {isStageManagerOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-zinc-950 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                  PIPELINE STAGE STUDIO
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  Customize Pipeline Stages &amp; Edit Labels
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const reset = resetPipelineStagesToDefault();
                    setStages([...reset]);
                  }}
                  title="Reset stages to default"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium cursor-pointer border border-zinc-800"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Defaults</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsStageManagerOpen(false)}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Section 1: Add a New Custom Stage */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-3.5">
                <div className="font-bold text-zinc-950 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span>Add a New Pipeline Stage</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Stage Name / Label
                    </label>
                    <input
                      type="text"
                      value={newStageLabel}
                      onChange={(e) => setNewStageLabel(e.target.value)}
                      placeholder="e.g. Proposal Sent, Demo Completed, Contract Out"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-950 font-medium focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Subtitle / Helper Text
                    </label>
                    <input
                      type="text"
                      value={newStageSubtitle}
                      onChange={(e) => setNewStageSubtitle(e.target.value)}
                      placeholder="e.g. Pricing proposal shared with decision maker"
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:border-zinc-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Color Indicator
                    </label>
                    <select
                      value={newStageColorIdx}
                      onChange={(e) => setNewStageColorIdx(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 font-medium focus:outline-none"
                    >
                      {STAGE_COLOR_PALETTE.map((c, idx) => (
                        <option key={c.name} value={idx}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Win Probability (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newStageProb}
                      onChange={(e) => setNewStageProb(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 font-mono focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateCustomStage}
                    disabled={!newStageLabel.trim()}
                    className="py-2 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-bold transition cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Add Stage Column</span>
                  </button>
                </div>
              </div>

              {/* Section 2: Edit Existing Stages (Rename Label, Subtitle, Color, Probability, Order, Delete) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-950">
                    Active Pipeline Stages ({stages.length})
                  </span>
                  <span className="text-zinc-400">
                    Edit any label below—leads in that stage update automatically
                  </span>
                </div>

                <div className="space-y-2">
                  {stages.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-3.5 rounded-xl border border-zinc-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        {/* Stage Color Dot Selector */}
                        <div className="sm:col-span-3 flex items-center gap-2">
                          <span
                            className={`w-3 h-3 rounded-full shrink-0 ${st.dotColor}`}
                          />
                          <select
                            value={st.dotColor}
                            onChange={(e) => {
                              const foundPalette = STAGE_COLOR_PALETTE.find(
                                (p) => p.dotColor === e.target.value
                              );
                              if (foundPalette) {
                                const updated = updatePipelineStageConfig(st.id, {
                                  label: st.label,
                                  dotColor: foundPalette.dotColor,
                                  badgeStyle: foundPalette.badgeStyle,
                                });
                                setStages([...updated]);
                              }
                            }}
                            className="px-2 py-1 rounded-lg border border-zinc-200 text-[11px] text-zinc-700 bg-zinc-50 focus:outline-none w-full"
                          >
                            {STAGE_COLOR_PALETTE.map((p) => (
                              <option key={p.dotColor} value={p.dotColor}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Editable Stage Label */}
                        <div className="sm:col-span-4">
                          <input
                            type="text"
                            value={st.label}
                            onChange={(e) => {
                              const updated = updatePipelineStageConfig(st.id, {
                                label: e.target.value,
                              });
                              setStages([...updated]);
                              setContacts(getStoredContacts());
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 font-bold text-zinc-950 focus:outline-none focus:border-zinc-950"
                            placeholder="Stage Label"
                          />
                        </div>

                        {/* Editable Subtitle */}
                        <div className="sm:col-span-3">
                          <input
                            type="text"
                            value={st.subtitle}
                            onChange={(e) => {
                              const updated = updatePipelineStageConfig(st.id, {
                                label: st.label,
                                subtitle: e.target.value,
                              });
                              setStages([...updated]);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 focus:outline-none focus:border-zinc-950"
                            placeholder="Subtitle"
                          />
                        </div>

                        {/* Win Probability */}
                        <div className="sm:col-span-2 flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(st.dealProbability * 100)}
                            onChange={(e) => {
                              const pct = Math.min(
                                100,
                                Math.max(0, Number(e.target.value) || 0)
                              );
                              const updated = updatePipelineStageConfig(st.id, {
                                label: st.label,
                                dealProbability: pct / 100,
                              });
                              setStages([...updated]);
                            }}
                            className="w-14 px-2 py-1.5 rounded-lg border border-zinc-200 font-mono text-zinc-900 text-right focus:outline-none"
                          />
                          <span className="text-zinc-400 font-mono">%</span>
                        </div>
                      </div>

                      {/* Reorder Left/Right & Delete Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            const updated = movePipelineStageOrder(st.id, 'left');
                            setStages([...updated]);
                          }}
                          title="Move column left"
                          className="p-1.5 rounded-lg border border-zinc-200 hover:border-zinc-900 text-zinc-600 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === stages.length - 1}
                          onClick={() => {
                            const updated = movePipelineStageOrder(st.id, 'right');
                            setStages([...updated]);
                          }}
                          title="Move column right"
                          className="p-1.5 rounded-lg border border-zinc-200 hover:border-zinc-900 text-zinc-600 disabled:opacity-30 cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={stages.length <= 2}
                          onClick={() => {
                            const updated = deletePipelineStage(st.id);
                            setStages([...updated]);
                            setContacts(getStoredContacts());
                          }}
                          title="Delete stage column"
                          className="p-1.5 rounded-lg border border-zinc-200 hover:border-red-500 text-zinc-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Tip: You can also click any column title directly on the Kanban board to rename it inline.
              </span>
              <button
                type="button"
                onClick={() => setIsStageManagerOpen(false)}
                className="px-5 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. SLIDE-OVER PROSPECT INSPECTOR & FOOTPRINT DRAWER */}
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
                    Assigned to{' '}
                    <strong className="text-white">{activeLead.assignedRep}</strong>
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
              {/* Stage Selector Pills (Dynamically reflects custom & renamed stages!) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-zinc-900">
                    Pipeline Kanban Stage
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsStageManagerOpen(true)}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-950 underline cursor-pointer"
                  >
                    + Customize Stages
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {stages.map((col) => {
                    const current =
                      resolveStageForContact(activeLead.status, stages) ===
                      col.statusValue;
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
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${col.dotColor}`}
                        />
                        <span className="truncate">{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deal Value ($) & Rep Reassignment Control Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 space-y-3.5">
                {/* Manual Deal Value Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-zinc-900">
                      Lead Deal Value (USD)
                    </label>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      Editable by Admin &amp; Assigned User
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-zinc-500">
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={drawerDealInput}
                        onChange={(e) => setDrawerDealInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveDealValue(activeLead.id, drawerDealInput);
                          }
                        }}
                        className="w-full pl-7 pr-3 py-2 rounded-xl border border-zinc-300 bg-white font-mono font-bold text-zinc-950 focus:outline-none focus:border-zinc-950"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveDealValue(activeLead.id, drawerDealInput)
                      }
                      className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-bold cursor-pointer shrink-0"
                    >
                      Update Value
                    </button>
                  </div>
                </div>

                {/* Lead Reassignment Selector (Supervisor, Manager, Admin, Super Admin) */}
                <div className="pt-3 border-t border-zinc-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-zinc-900">
                      Assigned SDR / Agent
                    </label>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {canReassign
                        ? `${role} Clearance: Reassign Enabled`
                        : 'Supervisor / Manager / Admin Only'}
                    </span>
                  </div>

                  {canReassign ? (
                    <div className="space-y-2">
                      <select
                        value={activeLead.assignedRep || 'Emil Halili'}
                        onChange={(e) =>
                          handleReassignLead(activeLead.id, e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white font-semibold text-zinc-950 focus:outline-none focus:border-zinc-950 cursor-pointer"
                      >
                        {availableReps.map((rep) => (
                          <option key={rep} value={rep}>
                            👤 {rep}
                          </option>
                        ))}
                      </select>

                      {/* Quick Add New Rep/User to Workspace & Assign */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newAgentRosterInput}
                          onChange={(e) =>
                            setNewAgentRosterInput(e.target.value)
                          }
                          placeholder="Or add new agent name to assign..."
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[11px] text-zinc-900 focus:outline-none focus:border-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleAddNewAgentAndAssign(activeLead.id)
                          }
                          disabled={!newAgentRosterInput.trim()}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-semibold disabled:opacity-40 cursor-pointer shrink-0"
                        >
                          + Add &amp; Assign
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-700 font-mono flex items-center justify-between">
                      <span>👤 {activeLead.assignedRep || 'Emil Halili'}</span>
                      <span className="text-[10px] text-zinc-400">
                        Switch to Supervisor/Manager/Admin to reassign
                      </span>
                    </div>
                  )}
                </div>

                {reassignToast && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[11px] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{reassignToast}</span>
                  </div>
                )}
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
                href="/dialer"
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
