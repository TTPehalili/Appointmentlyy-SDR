'use client';

import React, { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  PhoneCall,
  Mail,
  Globe,
  ExternalLink,
  FolderKanban,
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
  UserPlus,
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import {
  Avatar,
  Badge,
  Button,
  buttonClasses,
  Dialog,
  Drawer,
  EmptyState,
  IconButton,
  Menu,
  PageHeader,
  SegmentedControl,
  type MenuItem,
} from '@/components/ui';
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
import { stageDotClass, stagePaletteLabel } from '@/lib/stageColors';
import {
  normalizeTenantKey,
  getTenantQuota,
  updateTenantRepsRoster,
} from '@/lib/icpQuotaStore';

/** Board / table view choice, persisted in localStorage (board is the default). */
type PipelineView = 'board' | 'table';
const PIPELINE_VIEW_KEY = 'appy_pipeline_view';
const pipelineViewListeners = new Set<() => void>();

function subscribePipelineView(onChange: () => void) {
  pipelineViewListeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    pipelineViewListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getPipelineViewSnapshot(): PipelineView {
  try {
    return localStorage.getItem(PIPELINE_VIEW_KEY) === 'table' ? 'table' : 'board';
  } catch {
    return 'board';
  }
}

function setPipelineView(next: PipelineView) {
  try {
    localStorage.setItem(PIPELINE_VIEW_KEY, next);
  } catch {
    // Storage unavailable: the choice simply won't persist.
  }
  pipelineViewListeners.forEach((fn) => fn());
}

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
  const router = useRouter();
  const view = useSyncExternalStore(
    subscribePipelineView,
    getPipelineViewSnapshot,
    (): PipelineView => 'board'
  );

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

  // Card / row overflow menu: Call, Email, Move to any other stage, Reassign
  const buildLeadMenuItems = (lead: ContactRecord): (MenuItem | 'divider')[] => {
    const items: (MenuItem | 'divider')[] = [
      { label: 'Call', icon: <PhoneCall />, onSelect: () => router.push('/dialer') },
      { label: 'Email', icon: <Mail />, onSelect: () => router.push('/outreach/email') },
    ];
    const currentStage = resolveStageForContact(lead.status, stages);
    const otherStages = stages.filter((s) => s.statusValue !== currentStage);
    if (otherStages.length > 0) {
      items.push('divider');
      otherStages.forEach((s) =>
        items.push({
          label: `Move to ${s.label}`,
          icon: (
            <span className="flex size-4 items-center justify-center">
              <span className={`size-2 rounded-full ${stageDotClass(s.dotColor)}`} />
            </span>
          ),
          onSelect: () => handleMoveStage(lead.id, s.statusValue),
        })
      );
    }
    if (canReassign) {
      const currentRep = lead.assignedRep || 'Emil Halili';
      const otherReps = availableReps.filter((rep) => rep !== currentRep);
      if (otherReps.length > 0) {
        items.push('divider');
        otherReps.forEach((rep) =>
          items.push({
            label: `Reassign to ${rep}`,
            icon: <UserPlus />,
            onSelect: () => handleReassignLead(lead.id, rep),
          })
        );
      }
    }
    return items;
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

  const filterSelectClass =
    'focus-ring h-9 w-auto max-w-[220px] truncate rounded-sm border border-line-strong bg-surface px-3 text-body text-fg cursor-pointer hover:border-fg-disabled transition-colors';
  const fieldClass =
    'focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-fg placeholder:text-fg-disabled';

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <main className="flex-1 flex flex-col min-h-0 px-4 py-6 md:px-8 space-y-4 w-full">
          {/* 1. TOP HEADER & PIPELINE SUMMARY */}
          <div className="shrink-0 space-y-4">
            <PageHeader
              className="pb-0"
              title="Pipeline"
              count={telemetry.totalLeads}
              description={`${tenantName}: ${stages.length} stages. Click a stage name to rename it.`}
              secondaryActions={
                <>
                  <SegmentedControl
                    label="View"
                    value={view}
                    onChange={(v) => setPipelineView(v === 'table' ? 'table' : 'board')}
                    items={[
                      { value: 'board', label: 'Board' },
                      { value: 'table', label: 'Table' },
                    ]}
                  />

                  {/* Customize / Add Pipeline Stages Button */}
                  <Button
                    variant="secondary"
                    onClick={() => setIsStageManagerOpen(true)}
                    icon={<SlidersHorizontal className="text-fg-secondary" />}
                  >
                    Edit stages
                  </Button>

                  {/* Export or Lock */}
                  {canExport ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        exportContactsToCsv(filteredContacts, 'pipeline_kanban_export')
                      }
                      icon={<Download className="text-fg-secondary" />}
                    >
                      Export CSV
                    </Button>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-body text-fg-tertiary select-none">
                      <Lock className="size-4 text-fg-disabled" aria-hidden />
                      <span>CSV locked</span>
                    </span>
                  )}
                </>
              }
              primaryAction={
                <Link href="/dialer" className={buttonClasses('brand', 'md')}>
                  <PhoneCall className="size-4" aria-hidden />
                  <span>Start calling</span>
                </Link>
              }
            />

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none size-4 text-fg-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, company or domain"
                  className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface pl-9 pr-3 text-body text-fg placeholder:text-fg-disabled hover:border-fg-disabled transition-colors"
                />
              </div>

              {/* Folder Filter */}
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                aria-label="Folder"
                className={filterSelectClass}
              >
                <option value="ALL">
                  All folders ({scopedContacts.length})
                </option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>

              {/* Rep Filter (for Admins/Managers) */}
              {role !== 'Rep' && (
                <select
                  value={selectedRepFilter}
                  onChange={(e) => setSelectedRepFilter(e.target.value)}
                  aria-label="Owner"
                  className={filterSelectClass}
                >
                  <option value="ALL">All owners</option>
                  {availableReps.map((rep) => (
                    <option key={rep} value={rep}>
                      {rep}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Pipeline summary strip (plain stats) */}
            <dl className="flex flex-wrap items-end gap-x-10 gap-y-3 border-y border-line py-3">
              <div>
                <dt className="text-small text-fg-tertiary">Total pipeline</dt>
                <dd className="mt-0.5 text-h2 text-fg tabular-nums">
                  {telemetry.totalLeads.toLocaleString()}{' '}
                  <span className="text-small font-normal text-fg-tertiary">prospects</span>
                </dd>
              </div>

              <div>
                <dt className="text-small text-fg-tertiary">In cadence</dt>
                <dd className="mt-0.5 text-h2 text-fg tabular-nums">
                  {telemetry.inCadenceCount.toLocaleString()}{' '}
                  <span className="text-small font-normal text-fg-tertiary">
                    working, {telemetry.warmCallbacks} callbacks
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-small text-fg-tertiary">Meetings booked</dt>
                <dd className="mt-0.5 text-h2 text-fg tabular-nums">
                  {telemetry.bookedCount.toLocaleString()}{' '}
                  <span className="text-small font-normal text-success-fg">
                    ${telemetry.bookedValueUsd.toLocaleString()} booked
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-small text-fg-tertiary">
                  Weighted value
                </dt>
                <dd className="mt-0.5 text-h2 text-fg tabular-nums">
                  ${telemetry.weightedPipelineUsd.toLocaleString()}{' '}
                  <span className="text-small font-normal text-fg-tertiary">est. ARR</span>
                </dd>
              </div>
            </dl>
          </div>

          {/* 2. HORIZONTAL KANBAN BOARD WITH INLINE LABEL EDITING + ADD STAGE COLUMN */}
          {view === 'board' ? (
          <div className="flex-1 min-h-0 overflow-x-auto pb-2">
            <div className="flex gap-3 h-full min-w-max">
              {stages.map((col) => {
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
                    className={`w-[280px] shrink-0 flex flex-col rounded-lg border transition-colors duration-150 ${
                      isDragTarget
                        ? 'bg-selected border-line-strong'
                        : 'bg-subtle/60 border-line'
                    }`}
                  >
                    {/* Column Header (Supports 1-Click Inline Label & Subtitle Editing) */}
                    <div className="px-3 py-2.5 border-b border-line space-y-0.5">
                      {isEditingThisHeader ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              autoFocus
                              value={editingLabelInput}
                              onChange={(e) => setEditingLabelInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveInlineStageEdit(col.id);
                                if (e.key === 'Escape') setEditingStageId(null);
                              }}
                              placeholder="Stage name"
                              className="focus-ring h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-2.5 text-body text-fg"
                            />
                            <IconButton
                              size="sm"
                              variant="primary"
                              onClick={() => saveInlineStageEdit(col.id)}
                              label="Save stage label"
                              className="cursor-pointer"
                            >
                              <Check className="size-4" />
                            </IconButton>
                            <IconButton
                              size="sm"
                              onClick={() => setEditingStageId(null)}
                              label="Cancel"
                              className="cursor-pointer"
                            >
                              <X className="size-4" />
                            </IconButton>
                          </div>
                          <input
                            type="text"
                            value={editingSubtitleInput}
                            onChange={(e) => setEditingSubtitleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineStageEdit(col.id);
                            }}
                            placeholder="Stage description"
                            className="focus-ring h-8 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg-secondary"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => startEditingStageHeader(col)}
                              title="Click to rename stage label"
                              className="focus-ring group/title flex items-center gap-2 rounded-sm text-left cursor-pointer min-w-0"
                            >
                              <span
                                className={`size-2 rounded-full shrink-0 ${stageDotClass(col.dotColor)}`}
                              />
                              <h2 className="text-body-strong text-fg truncate">
                                {col.label}
                              </h2>
                              <span className="text-small text-fg-tertiary tabular-nums">
                                {cards.length}
                              </span>
                              <Pencil className="size-3.5 text-fg-tertiary opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
                            </button>

                            {stageValue > 0 && (
                              <span className="text-small text-fg-secondary tabular-nums shrink-0">
                                ${stageValue.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p
                              onClick={() => startEditingStageHeader(col)}
                              className="text-caption text-fg-tertiary truncate cursor-pointer hover:text-fg-secondary"
                            >
                              {col.subtitle}
                            </p>
                            <span className="text-caption text-fg-tertiary tabular-nums shrink-0" title="Win probability">
                              {Math.round(col.dealProbability * 100)}%
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Cards Container */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {cards.length === 0 ? (
                        <div className="h-28 rounded-lg border border-dashed border-line-strong flex flex-col items-center justify-center p-4 text-center text-small text-fg-tertiary">
                          <span>Drag a card here</span>
                          <span className="text-caption mt-0.5">
                            to move to {col.label}
                          </span>
                        </div>
                      ) : (
                        paginatedCards.map((lead) => {
                          return (
                            <div
                              key={lead.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, lead.id)}
                              onClick={() => setActiveLeadId(lead.id)}
                              className={`group bg-surface rounded-lg p-3 border border-line hover:border-line-strong shadow-xs transition-colors duration-150 cursor-grab active:cursor-grabbing space-y-2 ${
                                !canExport ? 'select-none' : ''
                              }`}
                            >
                              {/* Card Top: Name + LinkedIn + Reassignable Rep Selector */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-body-strong text-fg truncate">
                                      {lead.name}
                                    </span>
                                    {lead.linkedinUrl && (
                                      <a
                                        href={lead.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Open LinkedIn Profile"
                                        aria-label="Open LinkedIn profile"
                                        className="focus-ring rounded-sm text-fg-tertiary hover:text-fg shrink-0"
                                      >
                                        <LinkedinIcon className="size-3.5" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-small text-fg-tertiary truncate">
                                    {lead.title}
                                  </div>
                                </div>

                                {/* Owner + overflow menu (Call, Email, Move to, Reassign) */}
                                <div className="flex shrink-0 items-center gap-1">
                                  <span className="text-caption text-fg-secondary">
                                    {lead.assignedRep?.split(' ')[0] || 'Rep'}
                                  </span>
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="-my-1 -mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100"
                                  >
                                    <Menu
                                      label={`Actions for ${lead.name}`}
                                      items={buildLeadMenuItems(lead)}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Company + Website */}
                              <div className="flex items-center justify-between gap-2 text-small">
                                <span className="text-fg-secondary truncate">
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
                                    className="focus-ring inline-flex min-w-0 items-center gap-1 rounded-sm text-caption text-fg-tertiary hover:text-fg hover:underline shrink"
                                  >
                                    <Globe className="size-3 shrink-0" aria-hidden />
                                    <span className="truncate">
                                      {lead.website
                                        .replace(/^https?:\/\//, '')
                                        .replace(/\/.*$/, '')}
                                    </span>
                                  </a>
                                )}
                              </div>

                              {/* Editable Deal Value + Day in cadence */}
                              <div
                                className="flex items-center justify-between gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {editingDealCardId === lead.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-small text-fg-tertiary">
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
                                      aria-label="Deal value"
                                      className="focus-ring h-7 w-20 rounded-sm border border-line-strong bg-surface px-1.5 text-small tabular-nums text-fg"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSaveDealValue(
                                          lead.id,
                                          editingDealInput
                                        )
                                      }
                                      className="focus-ring inline-flex size-7 items-center justify-center rounded-md bg-action text-action-fg hover:bg-action-hover cursor-pointer"
                                      title="Save Deal Value"
                                    >
                                      <Check className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingDealCardId(null)}
                                      className="focus-ring inline-flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-subtle cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="size-3.5" />
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
                                    className="focus-ring group/val -ml-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-body-strong tabular-nums text-fg hover:bg-subtle transition-colors cursor-pointer"
                                  >
                                    <span>
                                      ${getContactDealValue(lead).toLocaleString()}
                                    </span>
                                    <Pencil className="size-3 text-fg-tertiary opacity-0 group-hover/val:opacity-100 transition-opacity" />
                                  </button>
                                )}
                                <Badge>Day {lead.cadenceDay || 1}</Badge>
                              </div>

                              {/* Phone + Folder */}
                              <div className="flex items-center justify-between gap-2 text-caption text-fg-tertiary">
                                <span className="font-mono shrink-0">{lead.phone}</span>
                                {lead.folderName && (
                                  <span className="flex min-w-0 items-center gap-1">
                                    <FolderKanban className="size-3 shrink-0" aria-hidden />
                                    <span className="truncate">{lead.folderName}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* 25-Per-Page Column Footer Pagination */}
                    {cards.length > KANBAN_PAGE_SIZE && (
                      <div className="px-2 py-1.5 border-t border-line flex items-center justify-between text-caption">
                        <button
                          type="button"
                          disabled={safeColPage <= 1}
                          onClick={() =>
                            setColumnPageMap((prev) => ({
                              ...prev,
                              [col.id]: Math.max(1, safeColPage - 1),
                            }))
                          }
                          className="focus-ring inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-fg-secondary hover:bg-surface hover:text-fg disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="size-3.5" />
                          Previous
                        </button>
                        <span className="text-fg-tertiary tabular-nums">
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
                          className="focus-ring inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-fg-secondary hover:bg-surface hover:text-fg disabled:opacity-40 cursor-pointer"
                        >
                          Next
                          <ChevronRight className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Quick "+ Add Pipeline Stage" Column Card at the end of the board */}
              <div className="w-[240px] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsStageManagerOpen(true)}
                  className="focus-ring w-full h-28 rounded-lg border border-dashed border-line-strong hover:bg-surface transition-colors flex flex-col items-center justify-center gap-1.5 p-4 text-center cursor-pointer"
                >
                  <Plus className="size-4 text-fg-secondary" />
                  <div className="text-body-strong text-fg">
                    Add stage
                  </div>
                  <p className="text-caption text-fg-tertiary">
                    Add, rename or reorder stages
                  </p>
                </button>
              </div>
            </div>
          </div>
          ) : (
          /* 2b. TABLE VIEW: one row per lead across all stages (same filters/search) */
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-line bg-surface shadow-xs">
            <table className="w-full border-collapse text-left text-body">
              <thead className="sticky top-0 z-10">
                <tr className="bg-subtle text-caption text-fg-tertiary whitespace-nowrap">
                  <th className="h-10 px-4 font-medium">Name</th>
                  <th className="h-10 px-3 font-medium">Company</th>
                  <th className="h-10 px-3 font-medium">Stage</th>
                  <th className="h-10 px-3 font-medium">Owner</th>
                  <th className="h-10 px-3 font-medium text-right">Value</th>
                  <th className="h-10 px-3 font-medium">Day in cadence</th>
                  <th className="h-10 px-3 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.length === 0 ? (
                  <tr className="border-t border-line">
                    <td colSpan={7} className="py-12">
                      <EmptyState
                        icon={<FolderKanban />}
                        title="No matching leads"
                        description="Try a different search or clear a filter."
                      />
                    </td>
                  </tr>
                ) : (
                  stages.flatMap((col) =>
                    (contactsByStage[col.statusValue] || []).map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => setActiveLeadId(lead.id)}
                        className={`h-12 border-t border-line hover:bg-subtle cursor-pointer transition-colors duration-150 ${
                          !canExport ? 'select-none' : ''
                        }`}
                      >
                        <td className="py-1.5 px-4">
                          <span className="block max-w-[240px] truncate text-body-strong text-fg">
                            {lead.name}
                          </span>
                          <span className="block max-w-[240px] truncate text-small text-fg-tertiary">
                            {lead.title}
                          </span>
                        </td>
                        <td className="py-1.5 px-3">
                          <span className="block max-w-[200px] truncate text-fg-secondary">
                            {lead.company}
                          </span>
                        </td>
                        <td className="py-1.5 px-3">
                          <span className="inline-flex items-center gap-2 whitespace-nowrap text-fg">
                            <span
                              className={`size-2 rounded-full shrink-0 ${stageDotClass(col.dotColor)}`}
                            />
                            {col.label}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap text-fg-secondary">
                          {lead.assignedRep || 'Unassigned'}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-fg">
                          ${getContactDealValue(lead).toLocaleString()}
                        </td>
                        <td className="py-1.5 px-3 whitespace-nowrap tabular-nums text-fg-secondary">
                          Day {lead.cadenceDay || 1}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <div
                            className="inline-flex"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Menu
                              label={`Actions for ${lead.name}`}
                              items={buildLeadMenuItems(lead)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>
          </div>
          )}
        </main>
      </div>

      {/* 3. MODAL: EDIT STAGE LABELS, REORDER & ADD CUSTOM PIPELINE STAGES */}
      <Dialog
        open={isStageManagerOpen}
        onClose={() => setIsStageManagerOpen(false)}
        title="Edit pipeline stages"
        size="lg"
        bare
      >
          <div className="flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-line flex items-start justify-between gap-4">
              <div>
                <h3 className="text-h2 text-fg">
                  Edit pipeline stages
                </h3>
                <p className="text-small text-fg-secondary mt-0.5">
                  Add, rename, reorder or remove the columns on your board.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const reset = resetPipelineStagesToDefault();
                    setStages([...reset]);
                  }}
                  title="Reset stages to default"
                  icon={<RotateCcw />}
                >
                  Reset defaults
                </Button>
                <IconButton
                  size="sm"
                  onClick={() => setIsStageManagerOpen(false)}
                  label="Close"
                  className="cursor-pointer"
                >
                  <X className="size-4" />
                </IconButton>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-body">
              {/* Section 1: Add a New Custom Stage */}
              <section className="p-4 rounded-lg border border-line space-y-3">
                <h4 className="text-h3 text-fg">
                  Add a stage
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-small font-medium text-fg-secondary mb-1">
                      Stage name
                    </label>
                    <input
                      type="text"
                      value={newStageLabel}
                      onChange={(e) => setNewStageLabel(e.target.value)}
                      placeholder="e.g. Proposal Sent, Demo Completed, Contract Out"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="block text-small font-medium text-fg-secondary mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newStageSubtitle}
                      onChange={(e) => setNewStageSubtitle(e.target.value)}
                      placeholder="e.g. Pricing proposal shared with decision maker"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-small font-medium text-fg-secondary mb-1">
                      Color
                    </label>
                    <select
                      value={newStageColorIdx}
                      onChange={(e) => setNewStageColorIdx(Number(e.target.value))}
                      className={`${fieldClass} cursor-pointer`}
                    >
                      {STAGE_COLOR_PALETTE.map((c, idx) => (
                        <option key={c.name} value={idx}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-small font-medium text-fg-secondary mb-1">
                      Win probability (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newStageProb}
                      onChange={(e) => setNewStageProb(Number(e.target.value))}
                      className={`${fieldClass} tabular-nums`}
                    />
                  </div>

                  <Button
                    variant="primary"
                    onClick={handleCreateCustomStage}
                    disabled={!newStageLabel.trim()}
                    icon={<Plus />}
                  >
                    Add stage
                  </Button>
                </div>
              </section>

              {/* Section 2: Edit Existing Stages (Rename Label, Subtitle, Color, Probability, Order, Delete) */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-h3 text-fg">
                    Stages <span className="text-small font-normal text-fg-tertiary tabular-nums">({stages.length})</span>
                  </h4>
                  <span className="text-small text-fg-tertiary">
                    Rename a stage and its leads update automatically.
                  </span>
                </div>

                <div className="space-y-2">
                  {stages.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-3 rounded-lg border border-line bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        {/* Stage Color Dot Selector */}
                        <div className="sm:col-span-3 flex items-center gap-2">
                          <span
                            className={`size-2.5 rounded-full shrink-0 ${stageDotClass(st.dotColor)}`}
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
                            aria-label="Color"
                            className="focus-ring h-8 w-full rounded-sm border border-line-strong bg-surface px-2 text-small text-fg cursor-pointer"
                          >
                            {STAGE_COLOR_PALETTE.map((p) => (
                              <option key={p.dotColor} value={p.dotColor}>
                                {stagePaletteLabel(p.name)}
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
                            aria-label="Stage name"
                            className="focus-ring h-8 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-body-strong text-fg"
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
                            aria-label="Stage description"
                            className="focus-ring h-8 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg-secondary"
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
                            aria-label="Win probability"
                            className="focus-ring h-8 w-14 rounded-sm border border-line-strong bg-surface px-2 text-right text-small tabular-nums text-fg"
                          />
                          <span className="text-small text-fg-tertiary">%</span>
                        </div>
                      </div>

                      {/* Reorder Left/Right & Delete Controls */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <IconButton
                          size="sm"
                          disabled={idx === 0}
                          onClick={() => {
                            const updated = movePipelineStageOrder(st.id, 'left');
                            setStages([...updated]);
                          }}
                          label="Move column left"
                          className="cursor-pointer disabled:opacity-30"
                        >
                          <ChevronLeft className="size-4" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          disabled={idx === stages.length - 1}
                          onClick={() => {
                            const updated = movePipelineStageOrder(st.id, 'right');
                            setStages([...updated]);
                          }}
                          label="Move column right"
                          className="cursor-pointer disabled:opacity-30"
                        >
                          <ChevronRight className="size-4" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          disabled={stages.length <= 2}
                          onClick={() => {
                            const updated = deletePipelineStage(st.id);
                            setStages([...updated]);
                            setContacts(getStoredContacts());
                          }}
                          label="Delete stage column"
                          className="cursor-pointer hover:text-danger-fg hover:bg-danger-bg disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-line flex items-center justify-between gap-3">
              <span className="text-small text-fg-tertiary">
                Tip: click a column name on the board to rename it inline.
              </span>
              <Button
                variant="secondary"
                onClick={() => setIsStageManagerOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
      </Dialog>

      {/* 4. SLIDE-OVER PROSPECT INSPECTOR & FOOTPRINT DRAWER */}
      <Drawer
        open={!!activeLead}
        onClose={() => setActiveLeadId(null)}
        label={activeLead ? activeLead.name : 'Lead details'}
        bare
      >
        {activeLead && (
          <div className="flex h-full flex-col justify-between overflow-hidden">
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <Avatar name={activeLead.name} size="lg" />
                <div className="min-w-0 space-y-0.5">
                  <h2 className="text-h2 text-fg truncate">{activeLead.name}</h2>
                  <p className="text-small text-fg-secondary truncate">
                    {activeLead.title} at <span className="text-fg">{activeLead.company}</span>
                  </p>
                  <div className="flex items-center gap-2 text-caption text-fg-tertiary">
                    <span className="font-mono">
                      {activeLead.id}
                    </span>
                    <span>
                      Owner{' '}
                      <span className="text-fg-secondary">{activeLead.assignedRep}</span>
                    </span>
                  </div>
                </div>
              </div>
              <IconButton
                onClick={() => setActiveLeadId(null)}
                label="Close"
                className="cursor-pointer"
              >
                <X className="size-4" />
              </IconButton>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-body">
              {/* Stage Selector Pills (Dynamically reflects custom & renamed stages!) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-h3 text-fg">
                    Stage
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsStageManagerOpen(true)}
                    className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg underline underline-offset-2 cursor-pointer"
                  >
                    Edit stages
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
                        aria-pressed={current}
                        className={`focus-ring h-9 px-2.5 rounded-md border text-left text-small transition-colors cursor-pointer flex items-center gap-2 ${
                          current
                            ? 'bg-subtle text-fg border-action font-medium'
                            : 'bg-surface text-fg-secondary border-line-strong hover:text-fg'
                        }`}
                      >
                        <span
                          className={`size-2 rounded-full shrink-0 ${stageDotClass(col.dotColor)}`}
                        />
                        <span className="truncate">{col.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Deal Value ($) & Rep Reassignment Control Card */}
              <section className="p-4 rounded-lg border border-line space-y-4">
                {/* Manual Deal Value Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-small font-medium text-fg">
                      Deal value (USD)
                    </label>
                    <span className="text-caption text-fg-tertiary">
                      Admins and the owner can edit
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary">
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
                        aria-label="Deal value"
                        className={`${fieldClass} pl-7 tabular-nums`}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        handleSaveDealValue(activeLead.id, drawerDealInput)
                      }
                      className="shrink-0"
                    >
                      Update value
                    </Button>
                  </div>
                </div>

                {/* Lead Reassignment Selector (Supervisor, Manager, Admin, Super Admin) */}
                <div className="pt-4 border-t border-line space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-small font-medium text-fg">
                      Owner
                    </label>
                    <span className="text-caption text-fg-tertiary">
                      {canReassign
                        ? `${role} can reassign`
                        : 'Supervisor, manager or admin only'}
                    </span>
                  </div>

                  {canReassign ? (
                    <div className="space-y-2">
                      <select
                        value={activeLead.assignedRep || 'Emil Halili'}
                        onChange={(e) =>
                          handleReassignLead(activeLead.id, e.target.value)
                        }
                        aria-label="Owner"
                        className={`${fieldClass} cursor-pointer`}
                      >
                        {availableReps.map((rep) => (
                          <option key={rep} value={rep}>
                            {rep}
                          </option>
                        ))}
                      </select>

                      {/* Quick Add New Rep/User to Workspace & Assign */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newAgentRosterInput}
                          onChange={(e) =>
                            setNewAgentRosterInput(e.target.value)
                          }
                          placeholder="Or add a new rep and assign"
                          aria-label="New rep name"
                          className="focus-ring h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg placeholder:text-fg-disabled"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleAddNewAgentAndAssign(activeLead.id)
                          }
                          disabled={!newAgentRosterInput.trim()}
                          icon={<UserPlus className="text-fg-secondary" />}
                          className="shrink-0"
                        >
                          Add and assign
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-md bg-subtle border border-line flex items-center justify-between gap-2">
                      <span className="text-body text-fg">{activeLead.assignedRep || 'Emil Halili'}</span>
                      <span className="text-caption text-fg-tertiary">
                        Ask a supervisor, manager or admin to reassign
                      </span>
                    </div>
                  )}
                </div>

                {reassignToast && (
                  <div className="px-3 py-2 rounded-md bg-success-bg text-success-fg text-small flex items-center gap-1.5" role="status">
                    <Check className="size-4" />
                    <span>{reassignToast}</span>
                  </div>
                )}
              </section>

              {/* Direct Contact & Links Card */}
              <section className="p-4 rounded-lg border border-line space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-small text-fg-tertiary">Phone</span>
                  <span className="font-mono text-small text-fg">
                    {activeLead.phone}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-small text-fg-tertiary">Email</span>
                  <span className="font-mono text-small text-fg truncate">{activeLead.email}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-small text-fg-tertiary">Website</span>
                  {activeLead.website ? (
                    <a
                      href={
                        activeLead.website.startsWith('http')
                          ? activeLead.website
                          : `https://${activeLead.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring inline-flex min-w-0 items-center gap-1 rounded-sm text-small text-fg hover:underline"
                    >
                      <Globe className="size-3.5 shrink-0 text-fg-secondary" aria-hidden />
                      <span className="truncate">{activeLead.website}</span>
                    </a>
                  ) : (
                    <span className="text-small text-fg-disabled">N/A</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-small text-fg-tertiary">LinkedIn</span>
                  {activeLead.linkedinUrl ? (
                    <a
                      href={activeLead.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring inline-flex items-center gap-1 rounded-sm text-small text-fg hover:underline"
                    >
                      <span>Open profile</span>
                      <ExternalLink className="size-3.5 text-fg-secondary" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-small text-fg-disabled">N/A</span>
                  )}
                </div>
                {activeLead.folderName && (
                  <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-line">
                    <span className="text-small text-fg-tertiary">Source list</span>
                    <span className="text-small text-fg">
                      {activeLead.folderName}
                    </span>
                  </div>
                )}
              </section>

              {/* Add Pipeline Note */}
              <section className="space-y-2">
                <label className="block text-h3 text-fg">
                  Log a note
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Add a qualification note or next steps"
                    aria-label="Note"
                    className={`${fieldClass} flex-1`}
                  />
                  <Button
                    variant="secondary"
                    onClick={handleSaveLeadNote}
                  >
                    Save
                  </Button>
                </div>
                {activeLead.leadNotes && (
                  <div className="p-3 rounded-lg bg-subtle text-fg-secondary text-body whitespace-pre-line">
                    {activeLead.leadNotes}
                  </div>
                )}
              </section>

              {/* Historical Activity Footprint */}
              <section className="space-y-2.5">
                <h3 className="text-h3 text-fg">
                  Activity <span className="text-small font-normal text-fg-tertiary tabular-nums">({activeLead.footprint?.length || 0})</span>
                </h3>
                <div className="space-y-2">
                  {(activeLead.footprint || []).map((fp) => (
                    <div
                      key={fp.id}
                      className="p-3 rounded-lg border border-line bg-surface space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-small font-medium text-fg">{fp.title}</span>
                        <span className="text-caption text-fg-tertiary tabular-nums shrink-0">
                          {fp.timestamp}
                        </span>
                      </div>
                      <p className="text-small text-fg-secondary">{fp.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Drawer Footer */}
            <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-2">
              <Link
                href="/contacts"
                className={buttonClasses('secondary', 'md')}
              >
                Open in contacts
              </Link>
              <Link
                href="/dialer"
                className={buttonClasses('primary', 'md')}
              >
                <PhoneCall className="size-4" aria-hidden />
                <span>Open dialer</span>
              </Link>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
