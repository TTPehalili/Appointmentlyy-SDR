'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  Download,
  Upload,
  PhoneCall,
  Mail,
  Globe,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Lock,
  ExternalLink,
  X,
  FileText,
  Check,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Pencil,
  UserPlus,
  FolderKanban
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  buttonClasses,
  Drawer,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
} from '@/components/ui';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import { useSession, isRoleAdmin, canUserReassignLeads, canUserAccessIcpBuilder } from '@/lib/session';
import { 
  ContactRecord, 
  IcpFolder,
  PipelineStageConfig,
  LeadFootprintItem, 
  getStoredContacts, 
  getStoredFolders,
  getStoredPipelineStages,
  addContactNote,
  updateContactPipelineStage,
  getContactDealValue,
  updateContactDealValue,
  reassignContactToRep,
  bulkReassignContactsToReps,
  exportContactsToCsv, 
  canUserExportCsv,
  subscribeToContacts,
  isContactAssignedTo
} from '@/lib/leadStore';
import {
  normalizeTenantKey,
  getTenantQuota,
  updateTenantRepsRoster,
} from '@/lib/icpQuotaStore';
import UploadLeadsCsvModal from '@/components/cockpit/UploadLeadsCsvModal';

export default function GlobalContactsManager() {
  const { session, role, isAdmin, canAccessIcp, tenantName, repName } = useSession();
  const adminClearance = isRoleAdmin(role);
  const canReassign = canUserReassignLeads(role);
  const canExportCsv = canUserExportCsv(role);

  const [contacts, setContacts] = useState<ContactRecord[]>(() => getStoredContacts());
  const [folders, setFolders] = useState<IcpFolder[]>(() => getStoredFolders());
  const [pipelineStages, setPipelineStages] = useState<PipelineStageConfig[]>(() =>
    getStoredPipelineStages()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  
  // Multi-Select & Bulk Reassignment State (Supervisor, Manager, Admin, Super Admin)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkTargetRep, setBulkTargetRep] = useState<string>('');
  const [newAgentNameInput, setNewAgentNameInput] = useState<string>('');
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  // Deal Value Editing State
  const [editingRowDealId, setEditingRowDealId] = useState<string | null>(null);
  const [editingRowDealVal, setEditingRowDealVal] = useState<string>('');
  const [drawerDealVal, setDrawerDealVal] = useState<string>('');

  // New Note State inside Detail Drawer
  const [newNoteInput, setNewNoteInput] = useState('');
  const [noteSavedToast, setNoteSavedToast] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 25 Results Per Page Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 25;

  const activeTenantCode = useMemo(
    () => normalizeTenantKey(session.tenantCode || tenantName),
    [session.tenantCode, tenantName]
  );

  // Subscribe to real-time updates
  useEffect(() => {
    setContacts(getStoredContacts());
    setFolders(getStoredFolders());
    setPipelineStages(getStoredPipelineStages());
    const unsubscribe = subscribeToContacts((updated) => {
      setContacts(updated);
      setFolders(getStoredFolders());
      setPipelineStages(getStoredPipelineStages());
      if (selectedContact) {
        const fresh = updated.find(c => c.id === selectedContact.id);
        if (fresh) setSelectedContact(fresh);
      }
    });
    return () => unsubscribe();
  }, [selectedContact?.id]);

  useEffect(() => {
    if (selectedContact) {
      setDrawerDealVal(String(getContactDealValue(selectedContact)));
    }
  }, [selectedContact?.id, selectedContact?.dealValue]);

  // Distinct Reps for filter & reassignment dropdowns (includes tenant roster + any rep on contacts)
  const uniqueReps = useMemo(() => {
    const quota = getTenantQuota(activeTenantCode, tenantName);
    const set = new Set<string>(quota.repsRoster || []);
    contacts.forEach(c => {
      if (c.assignedRep) set.add(c.assignedRep);
    });
    return Array.from(set);
  }, [contacts, activeTenantCode, tenantName]);

  useEffect(() => {
    if (!bulkTargetRep && uniqueReps.length > 0) {
      setBulkTargetRep(uniqueReps[0]);
    }
  }, [uniqueReps, bulkTargetRep]);

  // Single-lead Reassign Handler
  const handleSingleReassign = (contactId: string, newRep: string) => {
    if (!canReassign || !newRep.trim()) return;
    const updated = reassignContactToRep(
      contactId,
      newRep.trim(),
      repName || role,
      role
    );
    if (updated) {
      setContacts(getStoredContacts());
      setFolders(getStoredFolders());
      if (selectedContact?.id === contactId) {
        setSelectedContact(updated);
      }
      setActionBanner(`Reassigned ${updated.name} → ${newRep.trim()}`);
      setTimeout(() => setActionBanner(null), 2600);
    }
  };

  // Bulk Reassign Selected Leads to 1 Rep or Split Equally Across All Roster Reps
  const handleBulkReassign = (mode: 'single' | 'equal_split') => {
    if (!canReassign || selectedLeadIds.length === 0) return;
    const targets =
      mode === 'equal_split' ? uniqueReps : [bulkTargetRep || uniqueReps[0]];
    const count = bulkReassignContactsToReps(
      selectedLeadIds,
      targets,
      repName || role,
      role
    );
    if (count > 0) {
      setContacts(getStoredContacts());
      setFolders(getStoredFolders());
      setSelectedLeadIds([]);
      setActionBanner(
        mode === 'equal_split'
          ? `Split ${count} leads equally across ${targets.length} reps (${targets.join(', ')})`
          : `Reassigned ${count} selected leads → ${targets[0]}`
      );
      setTimeout(() => setActionBanner(null), 3200);
    }
  };

  // Add a New Agent/User to the Workspace Roster
  const handleAddAgentToRoster = (assignContactId?: string) => {
    const clean = newAgentNameInput.trim();
    if (!clean || !canReassign) return;
    const quota = getTenantQuota(activeTenantCode, tenantName);
    const updatedRoster = Array.from(
      new Set([...(quota.repsRoster || []), clean])
    );
    updateTenantRepsRoster(activeTenantCode, updatedRoster);
    setBulkTargetRep(clean);
    if (assignContactId) {
      handleSingleReassign(assignContactId, clean);
    } else if (selectedLeadIds.length > 0) {
      const count = bulkReassignContactsToReps(
        selectedLeadIds,
        [clean],
        repName || role,
        role
      );
      setContacts(getStoredContacts());
      setFolders(getStoredFolders());
      setSelectedLeadIds([]);
      setActionBanner(`Added ${clean} & assigned ${count} selected leads`);
      setTimeout(() => setActionBanner(null), 3000);
    } else {
      setActionBanner(`Added ${clean} to workspace agent roster`);
      setTimeout(() => setActionBanner(null), 2500);
    }
    setNewAgentNameInput('');
  };

  // Save Deal Value for a Lead
  const handleSaveDealValue = (contactId: string, rawVal: string) => {
    const num = Number(String(rawVal).replace(/[^0-9.]/g, ''));
    if (isNaN(num) || num < 0) return;
    const updated = updateContactDealValue(contactId, num, repName || role);
    if (updated) {
      setContacts(getStoredContacts());
      if (selectedContact?.id === contactId) {
        setSelectedContact(updated);
      }
      setEditingRowDealId(null);
      setActionBanner(
        `Updated Deal Value for ${updated.name} → $${Math.round(num).toLocaleString()}`
      );
      setTimeout(() => setActionBanner(null), 2500);
    }
  };

  // Base Contacts (Filtered by Role, Folder, Rep, and Search — before Status filter so Status Pill counts stay accurate)
  const baseContactsBeforeStatus = useMemo(() => {
    return contacts.filter((contact) => {
      // 1. Strict Rep-level isolation: Reps ONLY see leads explicitly distributed/assigned to them
      // (matched by display name or email, case-insensitive, like the Pipeline)
      if (role === 'Rep') {
        if (!isContactAssignedTo(contact, { repName, email: session.email })) {
          return false;
        }
      }

      // 2. Folder filter
      if (
        selectedFolderFilter !== 'all' &&
        contact.folderId !== selectedFolderFilter
      ) {
        return false;
      }

      // 3. Rep filter (Admin only)
      if (
        adminClearance &&
        selectedRepFilter !== 'all' &&
        contact.assignedRep !== selectedRepFilter
      ) {
        return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = contact.name.toLowerCase().includes(q);
        const matchCompany = contact.company.toLowerCase().includes(q);
        const matchEmail = contact.email.toLowerCase().includes(q);
        const matchPhone = contact.phone.toLowerCase().includes(q);
        const matchTitle = contact.title.toLowerCase().includes(q);
        const matchFolder = (contact.folderName || '')
          .toLowerCase()
          .includes(q);
        const matchStatus = (contact.status || '').toLowerCase().includes(q);
        if (
          !matchName &&
          !matchCompany &&
          !matchEmail &&
          !matchPhone &&
          !matchTitle &&
          !matchFolder &&
          !matchStatus
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    contacts,
    searchQuery,
    selectedRepFilter,
    selectedFolderFilter,
    adminClearance,
    role,
    repName,
    session.email,
  ]);

  // All Available Status Options (Combines configured Pipeline Kanban stages + any status present on contacts)
  const availableStatusesWithCounts = useMemo(() => {
    const countsMap = new Map<string, number>();

    // Seed with configured Pipeline Kanban stages in order
    pipelineStages.forEach((st) => {
      countsMap.set(st.statusValue, 0);
    });

    // Also ensure standard statuses exist
    [
      'New Lead',
      'In Cadence',
      'Call Back Later',
      'Left Voicemail',
      'Meeting Booked',
      'Disqualified',
    ].forEach((std) => {
      if (!countsMap.has(std)) countsMap.set(std, 0);
    });

    baseContactsBeforeStatus.forEach((c) => {
      const s = (c.status || 'New Lead').trim();
      countsMap.set(s, (countsMap.get(s) || 0) + 1);
    });

    return Array.from(countsMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));
  }, [pipelineStages, baseContactsBeforeStatus]);

  // Filtered Contacts (Applies selectedStatus on top of baseContactsBeforeStatus)
  const filteredContacts = useMemo(() => {
    if (selectedStatus === 'all') return baseContactsBeforeStatus;
    return baseContactsBeforeStatus.filter(
      (c) => (c.status || '').toLowerCase() === selectedStatus.toLowerCase()
    );
  }, [baseContactsBeforeStatus, selectedStatus]);

  // Update a contact's Status inline
  const handleStatusChange = (contactId: string, nextStatus: string) => {
    if (!nextStatus) return;
    const updated = updateContactPipelineStage(
      contactId,
      nextStatus,
      repName || role
    );
    if (updated) {
      setContacts(getStoredContacts());
      if (selectedContact?.id === contactId) {
        setSelectedContact(updated);
      }
      setActionBanner(`Updated ${updated.name} status → ${nextStatus}`);
      setTimeout(() => setActionBanner(null), 2500);
    }
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStatus, selectedRepFilter, selectedFolderFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedContacts = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredContacts.slice(start, start + PAGE_SIZE);
  }, [filteredContacts, safeCurrentPage]);

  // Copy helper
  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Add Direct Note on Lead
  const handleSaveNote = () => {
    if (!selectedContact || !newNoteInput.trim()) return;
    const updated = addContactNote(selectedContact.id, newNoteInput.trim(), repName);
    if (updated) {
      setSelectedContact(updated);
      setNewNoteInput('');
      setNoteSavedToast(true);
      setTimeout(() => setNoteSavedToast(false), 2500);
    }
  };

  // Status dot color helper
  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('meeting') || s.includes('booked')) {
      return 'bg-success-500';
    }
    if (s.includes('call back') || s.includes('callback')) {
      return 'bg-warning-400';
    }
    if (s.includes('voicemail')) {
      return 'bg-fg-tertiary';
    }
    if (s.includes('disqualified') || s.includes('dnc') || s.includes('not interested')) {
      return 'bg-danger-fg';
    }
    return 'bg-fg-disabled';
  };

  const filterSelectClass =
    'focus-ring h-9 w-auto max-w-[220px] truncate rounded-sm border border-line-strong bg-surface px-3 text-body text-fg cursor-pointer hover:border-fg-disabled transition-colors';
  const rowIconLinkClass = buttonClasses('ghost', 'sm', 'size-8 px-0');

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">


      {/* 2. MAIN APP CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">


        {/* Scrollable Directory Content */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-4">

          {/* Header */}
          <PageHeader
            className="pb-2"
            title="Contacts"
            count={filteredContacts.length}
            description={`Every lead in ${tenantName}, with notes and touch history.`}
            meta={
              <span className="inline-flex items-center gap-1.5 text-small text-fg-tertiary">
                <ShieldCheck className="size-4 text-fg-tertiary" aria-hidden />
                {role} access
              </span>
            }
            secondaryActions={
              <>
                {canAccessIcp ? (
                  <Link href="/lead-finder" className={buttonClasses('secondary', 'md')}>
                    <FolderKanban className="size-4 text-fg-secondary" aria-hidden />
                    <span>Lead finder</span>
                  </Link>
                ) : (
                  <div
                    title="ICP List Builder is restricted to Admin/Customers by your organization."
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-3 text-body text-fg-disabled cursor-not-allowed select-none"
                  >
                    <Lock className="size-4" aria-hidden />
                    <span>Lead finder (admin only)</span>
                  </div>
                )}

                {canExportCsv && (
                  <Button
                    variant="secondary"
                    onClick={() => exportContactsToCsv(filteredContacts)}
                    title="Export filtered directory to RFC 4180 CSV (Admin only)"
                    icon={<Download className="text-fg-secondary" />}
                  >
                    Export ({filteredContacts.length})
                  </Button>
                )}
              </>
            }
            primaryAction={
              canExportCsv ? (
                <Button
                  variant="brand"
                  onClick={() => setIsCsvModalOpen(true)}
                  title="Upload CSV leads into active directory (Admin only)"
                  icon={<Upload />}
                >
                  Import CSV
                </Button>
              ) : (
                <div className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-body text-fg-tertiary select-none">
                  <Lock className="size-4 text-fg-disabled" aria-hidden />
                  <span>CSV download locked (admin only)</span>
                </div>
              )
            }
          />

          {/* Search & Filter Toolbar */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-tertiary" />
                <input
 aria-label="Search contacts"                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, company, email, phone, title, status or folder"
                  className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface pl-9 pr-9 text-body text-fg placeholder:text-fg-disabled hover:border-fg-disabled transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-tertiary hover:text-fg"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Filter Dropdowns */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* ICP Folder Filter */}
                <select
                  value={selectedFolderFilter}
                  onChange={(e) => setSelectedFolderFilter(e.target.value)}
                  aria-label="Folder"
                  className={filterSelectClass}
                >
                  <option value="all">All folders ({folders.length})</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.totalLeads})
                    </option>
                  ))}
                </select>

                {/* Status Filter Dropdown (Dynamically synced with all Pipeline Stages & Contact Statuses) */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  aria-label="Status"
                  className={filterSelectClass}
                >
                  <option value="all">
                    All statuses ({baseContactsBeforeStatus.length})
                  </option>
                  {availableStatusesWithCounts.map((item) => (
                    <option key={item.status} value={item.status}>
                      {item.status} ({item.count})
                    </option>
                  ))}
                </select>

                {/* Rep Filter (Admin only) */}
                {adminClearance && uniqueReps.length > 1 && (
                  <select
                    value={selectedRepFilter}
                    onChange={(e) => setSelectedRepFilter(e.target.value)}
                    aria-label="Owner"
                    className={filterSelectClass}
                  >
                    <option value="all">All owners</option>
                    {uniqueReps.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* 1-Click Interactive Status Filter Chips */}
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter by status">
              <FilterChip
                label="All"
                value={String(baseContactsBeforeStatus.length)}
                active={selectedStatus === 'all'}
                onClick={() => setSelectedStatus('all')}
              />

              {availableStatusesWithCounts.map(({ status, count }) => {
                const isActive =
                  selectedStatus.toLowerCase() === status.toLowerCase();
                return (
                  <FilterChip
                    key={status}
                    label={status}
                    value={String(count)}
                    active={isActive}
                    onClick={() =>
                      setSelectedStatus(isActive ? 'all' : status)
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Action Toast Banner */}
          {actionBanner && (
            <div className="px-4 py-2.5 rounded-lg bg-success-bg border border-success-500/30 text-success-fg text-body flex items-center justify-between gap-3" role="status">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{actionBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                aria-label="Dismiss"
                className="focus-ring rounded-sm p-1 text-success-fg hover:bg-surface/60 cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Bulk Lead Reassignment Command Bar (Supervisor, Manager, Admin, Super Admin) */}
          {canReassign && (
            <div className="bg-surface border border-line rounded-lg px-4 py-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-body-strong text-fg">
                  Lead assignment
                </span>
                <span className="text-small text-fg-tertiary">({role})</span>
                <span className="text-small text-fg-secondary">
                  {selectedLeadIds.length > 0 ? (
                    <>
                      <strong className="font-semibold text-fg tabular-nums">
                        {selectedLeadIds.length} lead(s)
                      </strong>{' '}
                      selected
                    </>
                  ) : (
                    'Select leads with the checkboxes, or use a row owner menu to reassign one lead.'
                  )}
                </span>
                {selectedLeadIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds([])}
                    className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg underline underline-offset-2 cursor-pointer"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={bulkTargetRep}
                  onChange={(e) => setBulkTargetRep(e.target.value)}
                  aria-label="Assign to"
                  className="focus-ring h-8 rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg cursor-pointer"
                >
                  {uniqueReps.map((r) => (
                    <option key={r} value={r}>
                      Assign to {r}
                    </option>
                  ))}
                </select>

                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedLeadIds.length === 0}
                  onClick={() => handleBulkReassign('single')}
                >
                  Reassign selected ({selectedLeadIds.length})
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedLeadIds.length === 0}
                  onClick={() => handleBulkReassign('equal_split')}
                  title="Split selected leads equally across all workspace reps"
                >
                  Split evenly ({uniqueReps.length} reps)
                </Button>

                {/* Quick Add New Rep/Agent */}
                <div className="flex items-center gap-1.5 pl-2 border-l border-line">
                  <input
                    type="text"
                    value={newAgentNameInput}
                    onChange={(e) => setNewAgentNameInput(e.target.value)}
                    placeholder="New rep name"
                    aria-label="New rep name"
                    className="focus-ring h-8 w-36 rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg placeholder:text-fg-disabled"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!newAgentNameInput.trim()}
                    onClick={() => handleAddAgentToRoster()}
                    icon={<UserPlus className="text-fg-secondary" />}
                  >
                    Add rep
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Contacts Table View (With Anti-Copy Protection for Non-Admins) */}
          <div className={`bg-surface border border-line rounded-lg shadow-xs overflow-hidden ${!canExportCsv ? 'select-none' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-body">
                <thead>
                  <tr className="bg-subtle text-caption text-fg-tertiary whitespace-nowrap">
                    {canReassign && (
                      <th className="h-10 pl-4 pr-1 w-8">
                        <input
                          type="checkbox"
                          checked={
                            paginatedContacts.length > 0 &&
                            paginatedContacts.every((c) =>
                              selectedLeadIds.includes(c.id)
                            )
                          }
                          onChange={(e) => {
                            const pageIds = paginatedContacts.map((c) => c.id);
                            if (e.target.checked) {
                              setSelectedLeadIds((prev) =>
                                Array.from(new Set([...prev, ...pageIds]))
                              );
                            } else {
                              setSelectedLeadIds((prev) =>
                                prev.filter((id) => !pageIds.includes(id))
                              );
                            }
                          }}
                          title="Select all 25 leads on this page"
                          className="focus-ring size-4 rounded-[4px] border-line-strong accent-ink-900 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="h-10 px-3 font-medium">Name</th>
                    <th className="h-10 px-3 font-medium">Company</th>
                    <th className="hidden 2xl:table-cell h-10 px-3 font-medium">Phone and email</th>
                    <th className="h-10 px-3 font-medium text-right">Value</th>
                    <th className="h-10 px-3 font-medium">Status</th>
                    <th className="h-10 px-3 font-medium">Owner</th>
                    <th className="h-10 px-3 font-medium">Last touch</th>
                    <th className="h-10 px-3 font-medium text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length === 0 ? (
                    <tr className="border-t border-line">
                      <td colSpan={canReassign ? 9 : 8} className="py-12">
                        <EmptyState
                          icon={<Users />}
                          title="No matching contacts"
                          description="Try a different search or clear a filter."
                        />
                      </td>
                    </tr>
                  ) : (
                    paginatedContacts.map((c) => {
                      const touchCount = c.footprint ? c.footprint.length : 0;
                      const latestTouch = c.footprint && c.footprint.length > 0 ? c.footprint[0] : null;
                      const isRowSelected = selectedLeadIds.includes(c.id);

                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedContact(c)}
                          className={`h-12 border-t border-line transition-colors duration-150 cursor-pointer group ${
                            isRowSelected ? 'bg-selected' : 'hover:bg-subtle'
                          }`}
                        >
                          {/* Checkbox for Bulk Reassignment */}
                          {canReassign && (
                            <td
                              className="py-1.5 pl-4 pr-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isRowSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLeadIds((prev) => [...prev, c.id]);
                                  } else {
                                    setSelectedLeadIds((prev) =>
                                      prev.filter((id) => id !== c.id)
                                    );
                                  }
                                }}
                                aria-label={`Select ${c.name}`}
                                className="focus-ring size-4 rounded-[4px] border-line-strong accent-ink-900 cursor-pointer"
                              />
                            </td>
                          )}

                          {/* 1. Contact & Role */}
                          <td className="py-1.5 px-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.name} />
                              <div className="min-w-0 max-w-[220px]">
                                <span className="text-body-strong text-fg block truncate">
                                  {c.name}
                                </span>
                                <span className="text-small text-fg-tertiary truncate block">
                                  {c.title}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Company & Scale */}
                          <td className="py-1.5 px-3">
                            <span className="text-body text-fg block truncate max-w-[180px]">
                              {c.company}
                            </span>
                            <span className="text-small text-fg-tertiary block">
                              {c.headcount || '50+ seats'}
                            </span>
                          </td>

                          {/* 3. Direct Channels */}
                          <td className="hidden 2xl:table-cell py-1.5 px-3">
                            <div className="max-w-[200px]">
                              <span className="font-mono text-small text-fg block truncate">
                                {c.phone}
                              </span>
                              <span className="font-mono text-small text-fg-tertiary block truncate">
                                {c.email}
                              </span>
                            </div>
                          </td>

                          {/* 4. Editable Deal Value ($) */}
                          <td
                            className="py-1.5 px-3 text-right tabular-nums"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {editingRowDealId === c.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-fg-tertiary">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={100}
                                  autoFocus
                                  value={editingRowDealVal}
                                  onChange={(e) =>
                                    setEditingRowDealVal(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveDealValue(c.id, editingRowDealVal);
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingRowDealId(null);
                                    }
                                  }}
                                  aria-label="Deal value"
                                  className="focus-ring h-8 w-24 rounded-sm border border-line-strong bg-surface px-2 text-right text-body tabular-nums text-fg"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveDealValue(c.id, editingRowDealVal)
                                  }
                                  aria-label="Save deal value"
                                  className="focus-ring inline-flex size-8 items-center justify-center rounded-md bg-action text-action-fg hover:bg-action-hover cursor-pointer"
                                >
                                  <Check className="size-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRowDealId(c.id);
                                  setEditingRowDealVal(
                                    String(getContactDealValue(c))
                                  );
                                }}
                                title="Click to manually edit Deal Value ($)"
                                className="focus-ring group/val inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-body-strong tabular-nums text-fg hover:bg-surface hover:ring-1 hover:ring-line-strong cursor-pointer transition"
                              >
                                <Pencil className="size-3.5 text-fg-tertiary opacity-0 group-hover/val:opacity-100 transition-opacity" aria-hidden />
                                ${getContactDealValue(c).toLocaleString()}
                              </button>
                            )}
                          </td>

                          {/* 5. Interactive Status Selector (dot + label look) */}
                          <td
                            className="py-1.5 px-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="relative inline-flex items-center">
                              <span
                                aria-hidden
                                className={`pointer-events-none absolute left-2 size-2 rounded-full ${getStatusBadge(c.status)}`}
                              />
                              <select
                                value={c.status || 'New Lead'}
                                onChange={(e) =>
                                  handleStatusChange(c.id, e.target.value)
                                }
                                aria-label={`Status for ${c.name}`}
                                className="focus-ring h-8 appearance-none rounded-sm border border-transparent bg-transparent pl-6 pr-7 text-body text-fg cursor-pointer hover:border-line-strong hover:bg-surface transition-colors"
                              >
                                {availableStatusesWithCounts.map((item) => (
                                  <option
                                    key={item.status}
                                    value={item.status}
                                    className="bg-surface text-fg"
                                  >
                                    {item.status}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-fg-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </td>

                          {/* 6. Assigned Rep (Inline Reassignment Dropdown for Supervisor, Manager, Admin, Super Admin) */}
                          <td
                            className="py-1.5 px-3 text-body text-fg-secondary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canReassign ? (
                              <div className="relative inline-flex items-center">
                                <select
                                  value={c.assignedRep || 'Unassigned'}
                                  onChange={(e) =>
                                    handleSingleReassign(c.id, e.target.value)
                                  }
                                  aria-label={`Owner for ${c.name}`}
                                  className="focus-ring h-8 appearance-none rounded-sm border border-transparent bg-transparent pl-2 pr-7 text-body text-fg-secondary cursor-pointer hover:border-line-strong hover:bg-surface hover:text-fg transition-colors"
                                >
                                  {!c.assignedRep && <option value="Unassigned" disabled>Unassigned</option>}
                                  {uniqueReps.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-fg-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            ) : (
                              <span>{c.assignedRep || 'Unassigned'}</span>
                            )}
                          </td>

                          {/* 6. Communication Footprint */}
                          <td className="py-1.5 px-3">
                            <div className="min-w-0">
                              <span className="block whitespace-nowrap text-small text-fg-secondary tabular-nums">
                                {touchCount} {touchCount === 1 ? 'touch' : 'touches'}
                              </span>
                              {latestTouch && (
                                <span className="block text-small text-fg-tertiary truncate max-w-[140px]" title={latestTouch.title}>
                                  {latestTouch.title}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 7. Actions */}
                          <td className="py-1.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/dialer`}
                                className={rowIconLinkClass}
                                title="Open in Calling Floor"
                                aria-label={`Call ${c.name}`}
                              >
                                <PhoneCall className="size-4" />
                              </Link>
                              <Link
                                href={`/outreach/email?to=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}&prospectCompany=${encodeURIComponent(c.company)}`}
                                className={rowIconLinkClass}
                                title="Draft Cold Email"
                                aria-label={`Email ${c.name}`}
                              >
                                <Mail className="size-4" />
                              </Link>
                              <IconButton
                                size="sm"
                                onClick={() => setSelectedContact(c)}
                                label="View history and notes"
                                className="cursor-pointer"
                              >
                                <ChevronRight className="size-4" />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 25 Results Per Page Footer Bar */}
            {filteredContacts.length > 0 && (
              <div className="px-4 py-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-small">
                <span className="text-fg-tertiary tabular-nums">
                  Showing {(safeCurrentPage - 1) * PAGE_SIZE + 1}–
                  {(safeCurrentPage - 1) * PAGE_SIZE + paginatedContacts.length} of{' '}
                  {filteredContacts.length.toLocaleString()} contacts
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    icon={<ChevronLeft />}
                  >
                    Previous
                  </Button>
                  <span className="text-fg-secondary tabular-nums">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    Next
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. CONTACT DETAIL & HISTORICAL FOOTPRINT DRAWER                           */}
      {/* ========================================================================= */}
      <Drawer
        open={!!selectedContact}
        onClose={() => setSelectedContact(null)}
        label={selectedContact ? selectedContact.name : 'Contact details'}
        bare
      >
        {selectedContact && (
          <div className="flex h-full flex-col overflow-hidden">

            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={selectedContact.name} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-h2 text-fg truncate">
                    {selectedContact.name}
                  </h2>
                  <p className="text-small text-fg-secondary truncate">
                    {selectedContact.title} at <span className="text-fg">{selectedContact.company}</span>
                  </p>
                </div>
              </div>

              <IconButton
                onClick={() => setSelectedContact(null)}
                label="Close"
                className="cursor-pointer"
              >
                <X className="size-4" />
              </IconButton>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-body">

              {/* Quick Actions Strip */}
              <div className="flex items-center gap-2">
                <Link
                  href="/dialer"
                  className={buttonClasses('primary', 'md', 'flex-1')}
                >
                  <PhoneCall className="size-4" aria-hidden />
                  <span>Call</span>
                </Link>

                <Link
                  href={`/outreach/email?to=${encodeURIComponent(selectedContact.email)}&name=${encodeURIComponent(selectedContact.name)}&prospectCompany=${encodeURIComponent(selectedContact.company)}`}
                  className={buttonClasses('secondary', 'md', 'flex-1')}
                >
                  <Mail className="size-4 text-fg-secondary" aria-hidden />
                  <span>Draft email</span>
                </Link>
              </div>

              {/* Prospect Dossier Grid */}
              <section className="rounded-lg border border-line p-4 space-y-3">
                <h3 className="text-h3 text-fg">Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-caption text-fg-tertiary block">Phone</span>
                    <span className="font-mono text-small text-fg">{selectedContact.phone}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-caption text-fg-tertiary block">Email</span>
                    <span className="font-mono text-small text-fg truncate block">{selectedContact.email}</span>
                  </div>
                  <div>
                    <span className="text-caption text-fg-tertiary block">Seats</span>
                    <span className="text-body text-fg">{selectedContact.headcount || '65 seats'}</span>
                  </div>
                  <div>
                    <span className="text-caption text-fg-tertiary block">Deal value (USD)</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-fg-tertiary">$</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={drawerDealVal}
                        onChange={(e) => setDrawerDealVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveDealValue(selectedContact.id, drawerDealVal);
                          }
                        }}
                        aria-label="Deal value"
                        className="focus-ring h-8 w-24 rounded-sm border border-line-strong bg-surface px-2 text-body tabular-nums text-fg"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleSaveDealValue(selectedContact.id, drawerDealVal)
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="col-span-2 pt-3 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-caption text-fg-tertiary block mb-1">
                        Status
                      </span>
                      <select
                        value={selectedContact.status || 'New Lead'}
                        onChange={(e) =>
                          handleStatusChange(selectedContact.id, e.target.value)
                        }
                        className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-body text-fg cursor-pointer"
                      >
                        {availableStatusesWithCounts.map((item) => (
                          <option key={item.status} value={item.status}>
                            {item.status}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div>
                      <span className="text-caption text-fg-tertiary block mb-1">
                        Owner{canReassign ? '' : ' (read only)'}
                      </span>
                      {canReassign ? (
                        <select
                          value={selectedContact.assignedRep || 'Unassigned'}
                          onChange={(e) =>
                            handleSingleReassign(selectedContact.id, e.target.value)
                          }
                          aria-label="Owner"
                          className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-body text-fg cursor-pointer"
                        >
                          {!selectedContact.assignedRep && <option value="Unassigned" disabled>Unassigned</option>}
                          {uniqueReps.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-body text-fg block py-1.5">
                          {selectedContact.assignedRep || 'Unassigned'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {(selectedContact.website || selectedContact.linkedinUrl) && (
                <div className="flex items-center gap-3 pt-3 border-t border-line">
                  {selectedContact.website && (
                    <a
                      href={selectedContact.website.startsWith('http') ? selectedContact.website : `https://${selectedContact.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg hover:underline flex items-center gap-1.5"
                    >
                      <Globe className="size-3.5" aria-hidden />
                      <span>{selectedContact.website.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  {selectedContact.linkedinUrl && (
                    <a
                      href={selectedContact.linkedinUrl.startsWith('http') ? selectedContact.linkedinUrl : `https://${selectedContact.linkedinUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring rounded-sm text-small text-fg-secondary hover:text-fg hover:underline flex items-center gap-1.5 ml-auto"
                    >
                      <LinkedinIcon className="size-3.5" />
                      <span>LinkedIn profile</span>
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                </div>
                )}
              </section>

              {/* DIRECT LEAD NOTES SECTION (FOR CLIENTS WITHOUT CRM) */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-fg-secondary" aria-hidden />
                    <h3 className="text-h3 text-fg">
                      Notes
                    </h3>
                  </div>
                  <span className="text-small text-fg-tertiary">
                    Saved on the lead, no CRM needed
                  </span>
                </div>

                {/* Add Note Input */}
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={newNoteInput}
                    onChange={(e) => setNewNoteInput(e.target.value)}
                    placeholder="Type an operational note on this lead (e.g. 'Confirmed budget discussion for Q4')..."
                    aria-label="New note"
                    className="focus-ring w-full rounded-sm border border-line-strong bg-surface px-3 py-2 text-body text-fg placeholder:text-fg-disabled"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {noteSavedToast ? (
                      <span className="text-small text-success-fg flex items-center gap-1" role="status">
                        <Check className="size-4" /> Note saved and added to activity
                      </span>
                    ) : (
                      <span className="text-small text-fg-tertiary">
                        Notes stay on the lead and in CSV exports.
                      </span>
                    )}

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={!newNoteInput.trim()}
                      icon={<PlusCircle />}
                    >
                      Save note
                    </Button>
                  </div>
                </div>

                {/* Existing Persistent Notes */}
                {selectedContact.leadNotes && (
                  <div className="p-3 bg-subtle border border-line rounded-lg text-fg text-body whitespace-pre-wrap select-text">
                    <span className="text-caption text-fg-tertiary block mb-1">
                      Current notes
                    </span>
                    {selectedContact.leadNotes}
                  </div>
                )}
              </section>

              {/* HISTORICAL COMMUNICATION FOOTPRINT TIMELINE */}
              <section className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-fg-secondary" aria-hidden />
                    <h3 className="text-h3 text-fg">
                      Activity
                    </h3>
                  </div>
                  <Badge>
                    {selectedContact.footprint ? selectedContact.footprint.length : 0} events
                  </Badge>
                </div>

                {/* Footprint Timeline Items */}
                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-line">
                  {!selectedContact.footprint || selectedContact.footprint.length === 0 ? (
                    <p className="text-fg-tertiary text-small pl-8">No activity recorded yet.</p>
                  ) : (
                    selectedContact.footprint.map((fp, i) => (
                      <div key={fp.id || i} className="relative pl-8 space-y-1">
                        {/* Timeline Node Icon */}
                        <div className={`absolute left-0.5 top-2 size-5 rounded-full border border-line bg-surface flex items-center justify-center ${
                          fp.type === 'status' ? 'text-success-fg' : 'text-fg-secondary'
                        }`}>
                          {fp.type === 'call' ? <PhoneCall className="size-3" /> : fp.type === 'email' ? <Mail className="size-3" /> : fp.type === 'linkedin' ? <LinkedinIcon className="size-3" /> : <FileText className="size-3" />}
                        </div>

                        <div className="p-3 border border-line rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="text-body-strong text-fg flex items-center gap-1.5">
                              <span>{fp.title}</span>
                              {fp.disposition && (
                                <Badge tone="success">
                                  {fp.disposition}
                                </Badge>
                              )}
                            </span>
                            <span className="text-caption text-fg-tertiary tabular-nums">
                              {fp.timestamp}
                            </span>
                          </div>

                          <p className="text-fg-secondary text-body whitespace-pre-wrap select-text">
                            {fp.summary}
                          </p>

                          <div className="flex items-center justify-between text-caption text-fg-tertiary pt-1.5 border-t border-line">
                            <span>Logged by <span className="text-fg-secondary">{fp.repName}</span></span>
                            <button
                              type="button"
                              onClick={() => copyText(fp.summary, fp.id)}
                              className="focus-ring rounded-sm text-fg-tertiary hover:text-fg flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === fp.id ? <Check className="size-3 text-success-fg" /> : <Copy className="size-3" />}
                              <span>{copiedKey === fp.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

            </div>
          </div>
        )}
      </Drawer>

      {/* CSV Import Modal (Restricted to Admins) */}
      {isCsvModalOpen && (
        <UploadLeadsCsvModal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          onLeadsImported={() => {
            // The modal already saved the leads to Contacts (this workspace, owned by the importer),
            // so they're in the Pipeline too; just show them here.
            setContacts(getStoredContacts());
          }}
        />
      )}

    </div>
  );
}
