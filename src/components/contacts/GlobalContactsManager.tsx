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
  Calendar, 
  ShieldCheck, 
  Lock, 
  ExternalLink, 
  Filter, 
  X, 
  FileText, 
  MessageSquare, 
  Check, 
  Copy, 
  ChevronRight, 
  PlusCircle, 
  Send,
  FolderKanban
} from 'lucide-react';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import AppSidebar from '@/components/AppSidebar';
import GlobalTopHeader from '@/components/GlobalTopHeader';
import { useSession, isRoleAdmin, canUserReassignLeads, canUserAccessIcpBuilder } from '@/lib/session';
import { 
  ContactRecord, 
  IcpFolder,
  PipelineStageConfig,
  LeadFootprintItem, 
  getStoredContacts, 
  getStoredFolders,
  getStoredPipelineStages,
  saveStoredContacts, 
  addContactNote, 
  updateContactPipelineStage,
  getContactDealValue,
  updateContactDealValue,
  reassignContactToRep,
  bulkReassignContactsToReps,
  exportContactsToCsv, 
  canUserExportCsv,
  subscribeToContacts 
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
      if (role === 'Rep') {
        if (
          !contact.assignedRep ||
          contact.assignedRep.toLowerCase() !== repName.toLowerCase()
        ) {
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

  // Status color helper
  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('meeting') || s.includes('booked')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (s.includes('call back') || s.includes('callback')) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    if (s.includes('voicemail')) {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    if (s.includes('disqualified') || s.includes('dnc') || s.includes('not interested')) {
      return 'bg-zinc-100 text-zinc-600 border-zinc-200';
    }
    return 'bg-purple-50 text-purple-800 border-purple-200';
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 font-sans antialiased text-zinc-900">
      
      {/* 1. SIDEBAR */}
      <AppSidebar />

      {/* 2. MAIN APP CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Header */}
        <GlobalTopHeader />

        {/* Scrollable Directory Content */}
        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          
          {/* Header & Role Clearance Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-200">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  <Users className="w-4 h-4 text-emerald-400" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-950">
                  Global Contacts Directory
                </h1>
                <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                  {tenantName} &bull; {filteredContacts.length} Contacts
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                  adminClearance ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                }`}>
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>{role} Level</span>
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Unified multi-touch lead database with built-in notes and historical communication footprints.
              </p>
            </div>

            {/* Role-Gated Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {canAccessIcp ? (
                <Link
                  href="/icp-builder"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>ICP List Builder &amp; Folders</span>
                </Link>
              ) : (
                <div
                  title="ICP List Builder is restricted to Admin/Customers by your organization."
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 text-zinc-400 border border-dashed border-zinc-300 cursor-not-allowed select-none opacity-60"
                >
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>ICP List Builder (Admin Only)</span>
                </div>
              )}

              {canExportCsv ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsCsvModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-zinc-300 text-zinc-800 hover:bg-zinc-100 transition-colors shadow-2xs cursor-pointer"
                    title="Upload CSV leads into active directory (Admin only)"
                  >
                    <Upload className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Import CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportContactsToCsv(filteredContacts)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
                    title="Export filtered directory to RFC 4180 CSV (Admin only)"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export CSV ({filteredContacts.length})</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 border border-zinc-200 text-zinc-500 select-none">
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>CSV Download Locked (Admin Only)</span>
                </div>
              )}
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by prospect name, company, email, phone, title, status, or folder..."
                  className="w-full pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Dropdowns */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* ICP Folder Filter */}
                <select
                  value={selectedFolderFilter}
                  onChange={(e) => setSelectedFolderFilter(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer hover:bg-zinc-100 transition-colors"
                >
                  <option value="all">📁 All ICP Folders ({folders.length})</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name} ({f.totalLeads})
                    </option>
                  ))}
                </select>

                {/* Status Filter Dropdown (Dynamically synced with all Pipeline Stages & Contact Statuses) */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer hover:bg-zinc-100 transition-colors"
                >
                  <option value="all">
                    🎯 All Statuses ({baseContactsBeforeStatus.length})
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
                    className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none cursor-pointer hover:bg-zinc-100 transition-colors"
                  >
                    <option value="all">All Assigned Reps</option>
                    {uniqueReps.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* 1-Click Interactive Status Filter Pills Bar */}
            <div className="pt-2.5 border-t border-zinc-100 flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-[11px] font-mono text-zinc-400 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>Filter by Status:</span>
              </span>

              <button
                type="button"
                onClick={() => setSelectedStatus('all')}
                className={`px-3 py-1 rounded-full font-semibold text-xs border transition cursor-pointer flex items-center gap-1.5 ${
                  selectedStatus === 'all'
                    ? 'bg-zinc-950 text-white border-zinc-950 shadow-2xs'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                <span>All Contacts</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedStatus === 'all'
                      ? 'bg-zinc-800 text-emerald-400'
                      : 'bg-zinc-200/80 text-zinc-700'
                  }`}
                >
                  {baseContactsBeforeStatus.length}
                </span>
              </button>

              {availableStatusesWithCounts.map(({ status, count }) => {
                const isActive =
                  selectedStatus.toLowerCase() === status.toLowerCase();
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setSelectedStatus(isActive ? 'all' : status)
                    }
                    className={`px-3 py-1 rounded-full font-semibold text-xs border transition cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-zinc-950 text-white border-zinc-950 shadow-2xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-900'
                    }`}
                  >
                    <span>{status}</span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? 'bg-zinc-800 text-emerald-400'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Toast Banner */}
          {actionBanner && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionBanner(null)}
                className="text-emerald-700 hover:text-emerald-950 font-mono text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Bulk Lead Reassignment Command Bar (Supervisor, Manager, Admin, Super Admin) */}
          {canReassign && (
            <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-zinc-950 text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                  Lead Assignment Console ({role})
                </span>
                <span className="text-zinc-600">
                  {selectedLeadIds.length > 0 ? (
                    <>
                      <strong className="text-zinc-950">
                        {selectedLeadIds.length} lead(s)
                      </strong>{' '}
                      selected for reassignment
                    </>
                  ) : (
                    'Select leads using the table checkboxes or use any row dropdown to reassign leads to another rep.'
                  )}
                </span>
                {selectedLeadIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds([])}
                    className="text-zinc-400 hover:text-zinc-900 underline cursor-pointer"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={bulkTargetRep}
                  onChange={(e) => setBulkTargetRep(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-300 bg-zinc-50 text-zinc-900 font-semibold focus:outline-none cursor-pointer"
                >
                  {uniqueReps.map((r) => (
                    <option key={r} value={r}>
                      Assign to: 👤 {r}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={selectedLeadIds.length === 0}
                  onClick={() => handleBulkReassign('single')}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white font-bold transition cursor-pointer"
                >
                  Reassign Selected ({selectedLeadIds.length})
                </button>

                <button
                  type="button"
                  disabled={selectedLeadIds.length === 0}
                  onClick={() => handleBulkReassign('equal_split')}
                  className="px-3 py-1.5 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40 text-zinc-800 font-semibold transition cursor-pointer"
                  title="Split selected leads equally across all workspace reps"
                >
                  Split Equally ({uniqueReps.length} Reps)
                </button>

                {/* Quick Add New Rep/Agent */}
                <div className="flex items-center gap-1 pl-2 border-l border-zinc-200">
                  <input
                    type="text"
                    value={newAgentNameInput}
                    onChange={(e) => setNewAgentNameInput(e.target.value)}
                    placeholder="+ New rep name..."
                    className="px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 w-36 focus:outline-none focus:bg-white focus:border-zinc-900"
                  />
                  <button
                    type="button"
                    disabled={!newAgentNameInput.trim()}
                    onClick={() => handleAddAgentToRoster()}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold cursor-pointer"
                  >
                    + Add Rep
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Contacts Table View (With Anti-Copy Protection for Non-Admins) */}
          <div className={`bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden ${!canExportCsv ? 'select-none' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                    {canReassign && (
                      <th className="py-3 pl-4 pr-1 w-8">
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
                          className="rounded border-zinc-300 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-3 px-4 font-bold">Contact &amp; Role</th>
                    <th className="py-3 px-4 font-bold">Company &amp; Scale</th>
                    <th className="py-3 px-4 font-bold">Direct Channels</th>
                    <th className="py-3 px-4 font-bold">Deal Value ($)</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold">Assigned Rep</th>
                    <th className="py-3 px-4 font-bold">Footprint / Touches</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={canReassign ? 9 : 8} className="text-center py-12 text-zinc-400">
                        <Users className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
                        <p className="text-xs font-medium">No matching contacts found.</p>
                        <p className="text-[11px] text-zinc-400">Try adjusting your search query or filters.</p>
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
                          className={`hover:bg-zinc-50/80 transition-colors cursor-pointer group ${
                            isRowSelected ? 'bg-emerald-50/30' : ''
                          }`}
                        >
                          {/* Checkbox for Bulk Reassignment */}
                          {canReassign && (
                            <td
                              className="py-3.5 pl-4 pr-1"
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
                                className="rounded border-zinc-300 cursor-pointer"
                              />
                            </td>
                          )}

                          {/* 1. Contact & Role */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                {c.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-zinc-950 block truncate group-hover:text-blue-600 transition-colors">
                                  {c.name}
                                </span>
                                <span className="text-[11px] text-zinc-500 truncate block">
                                  {c.title}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Company & Scale */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-zinc-900 block truncate">
                              {c.company}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 block">
                              👥 {c.headcount || '50+ seats'}
                            </span>
                          </td>

                          {/* 3. Direct Channels */}
                          <td className="py-3.5 px-4 font-mono text-[11px]">
                            <div className="space-y-0.5">
                              <span className="text-zinc-900 block truncate">
                                📞 {c.phone}
                              </span>
                              <span className="text-zinc-500 block truncate">
                                ✉️ {c.email}
                              </span>
                            </div>
                          </td>

                          {/* 4. Editable Deal Value ($) */}
                          <td
                            className="py-3.5 px-4 font-mono text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {editingRowDealId === c.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-zinc-400 font-bold">$</span>
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
                                  className="w-20 px-1.5 py-0.5 rounded border border-zinc-900 text-xs font-mono font-bold text-zinc-950 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveDealValue(c.id, editingRowDealVal)
                                  }
                                  className="p-1 rounded bg-zinc-950 text-white hover:bg-zinc-800 cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
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
                                className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] cursor-pointer transition"
                              >
                                ${getContactDealValue(c).toLocaleString()} ✎
                              </button>
                            )}
                          </td>

                          {/* 5. Interactive Status Selector Badge */}
                          <td
                            className="py-3.5 px-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={c.status || 'New Lead'}
                              onChange={(e) =>
                                handleStatusChange(c.id, e.target.value)
                              }
                              className={`px-2.5 py-1 rounded-full font-bold text-[10px] border cursor-pointer focus:outline-none ${getStatusBadge(
                                c.status
                              )}`}
                            >
                              {availableStatusesWithCounts.map((item) => (
                                <option
                                  key={item.status}
                                  value={item.status}
                                  className="bg-white text-zinc-900 font-semibold"
                                >
                                  {item.status}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* 6. Assigned Rep (Inline Reassignment Dropdown for Supervisor, Manager, Admin, Super Admin) */}
                          <td
                            className="py-3.5 px-4 font-mono text-[11px] text-zinc-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canReassign ? (
                              <select
                                value={c.assignedRep || 'Emil Halili'}
                                onChange={(e) =>
                                  handleSingleReassign(c.id, e.target.value)
                                }
                                className="px-2.5 py-1 rounded-lg bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 font-semibold text-[11px] cursor-pointer focus:outline-none focus:border-zinc-900"
                              >
                                {uniqueReps.map((r) => (
                                  <option key={r} value={r}>
                                    👤 {r}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span>{c.assignedRep || 'Emil Halili'}</span>
                            )}
                          </td>

                          {/* 6. Communication Footprint */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-zinc-100 font-mono text-[10px] font-bold text-zinc-700">
                                {touchCount} {touchCount === 1 ? 'touch' : 'touches'}
                              </span>
                              {latestTouch && (
                                <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[130px]" title={latestTouch.title}>
                                  &bull; {latestTouch.title}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 7. Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <Link
                                href={`/cockpit`}
                                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-900 hover:text-white text-zinc-700 transition-colors cursor-pointer"
                                title="Open in Calling Floor"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                              </Link>
                              <Link
                                href={`/email?to=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}&company=${encodeURIComponent(c.company)}`}
                                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-900 hover:text-white text-zinc-700 transition-colors cursor-pointer"
                                title="Draft Cold Email"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => setSelectedContact(c)}
                                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors cursor-pointer"
                                title="View Complete History & Notes"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
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
              <div className="bg-zinc-50 px-5 py-3 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="font-mono text-zinc-500">
                  Showing {(safeCurrentPage - 1) * PAGE_SIZE + 1}–
                  {(safeCurrentPage - 1) * PAGE_SIZE + paginatedContacts.length} of{' '}
                  {filteredContacts.length.toLocaleString()} contacts (25 per page)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    &larr; Prev 25
                  </button>
                  <span className="font-mono text-zinc-600">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="px-3 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white font-semibold disabled:opacity-40 cursor-pointer"
                  >
                    Next 25 &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. CONTACT DETAIL & HISTORICAL FOOTPRINT DRAWER                           */}
      {/* ========================================================================= */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl border-l border-zinc-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-zinc-950 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {selectedContact.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-zinc-950 tracking-tight truncate">
                    {selectedContact.name}
                  </h2>
                  <p className="text-xs text-zinc-500 truncate">
                    {selectedContact.title} &bull; <strong className="text-zinc-900 font-bold">{selectedContact.company}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedContact(null)}
                className="h-8 w-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
              
              {/* Quick Actions Strip */}
              <div className="flex items-center gap-2">
                <Link
                  href="/cockpit"
                  className="flex-1 py-2 px-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Dial in Cockpit</span>
                </Link>

                <Link
                  href={`/email?to=${encodeURIComponent(selectedContact.email)}&name=${encodeURIComponent(selectedContact.name)}&company=${encodeURIComponent(selectedContact.company)}`}
                  className="flex-1 py-2 px-3 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Draft Email</span>
                </Link>
              </div>

              {/* Prospect Dossier Grid */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                  CONTACT SPECIFICATIONS
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Direct Phone:</span>
                    <span className="font-mono font-bold text-zinc-900">{selectedContact.phone}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Verified Email:</span>
                    <span className="font-mono font-bold text-zinc-900 truncate block">{selectedContact.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Floor Scale:</span>
                    <span className="text-zinc-800 font-semibold">{selectedContact.headcount || '65 seats'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block">Deal Value (USD):</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="font-mono font-bold text-zinc-500">$</span>
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
                        className="w-24 px-2 py-0.5 rounded border border-zinc-300 bg-white font-mono font-bold text-zinc-950 text-xs focus:outline-none focus:border-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleSaveDealValue(selectedContact.id, drawerDealVal)
                        }
                        className="px-2 py-0.5 rounded bg-zinc-950 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 pt-1.5 border-t border-zinc-200/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[10px] text-zinc-400 block mb-1">
                        Contact Pipeline Status:
                      </span>
                      <select
                        value={selectedContact.status || 'New Lead'}
                        onChange={(e) =>
                          handleStatusChange(selectedContact.id, e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white font-mono text-xs font-bold text-zinc-900 cursor-pointer focus:outline-none focus:border-zinc-950"
                      >
                        {availableStatusesWithCounts.map((item) => (
                          <option key={item.status} value={item.status}>
                            🎯 {item.status}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-zinc-400 block mb-1">
                        Assigned SDR / Agent ({canReassign ? `${role} Reassign` : 'Read-Only'}):
                      </span>
                      {canReassign ? (
                        <select
                          value={selectedContact.assignedRep || 'Emil Halili'}
                          onChange={(e) =>
                            handleSingleReassign(selectedContact.id, e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white font-mono text-xs font-bold text-zinc-900 cursor-pointer focus:outline-none focus:border-zinc-950"
                        >
                          {uniqueReps.map((r) => (
                            <option key={r} value={r}>
                              👤 {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-mono text-zinc-800 font-semibold block py-1">
                          👤 {selectedContact.assignedRep || 'Emil Halili'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-zinc-200">
                  {selectedContact.website && (
                    <a
                      href={selectedContact.website.startsWith('http') ? selectedContact.website : `https://${selectedContact.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" />
                      <span>{selectedContact.website.replace(/^https?:\/\//, '')} ↗</span>
                    </a>
                  )}
                  {selectedContact.linkedinUrl && (
                    <a
                      href={selectedContact.linkedinUrl.startsWith('http') ? selectedContact.linkedinUrl : `https://${selectedContact.linkedinUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#0077b5] hover:underline flex items-center gap-1 ml-auto"
                    >
                      <LinkedinIcon className="w-3 h-3" />
                      <span>LinkedIn Profile ↗</span>
                    </a>
                  )}
                </div>
              </div>

              {/* DIRECT LEAD NOTES SECTION (FOR CLIENTS WITHOUT CRM) */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-zinc-900" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
                      Direct Notes on Lead
                    </h3>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Essential for non-CRM workflows
                  </span>
                </div>

                {/* Add Note Input */}
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={newNoteInput}
                    onChange={(e) => setNewNoteInput(e.target.value)}
                    placeholder="Type an operational note on this lead (e.g. 'Confirmed budget discussion with Julian for Q4')..."
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl p-2.5 text-xs text-zinc-900 focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium"
                  />
                  <div className="flex items-center justify-between">
                    {noteSavedToast ? (
                      <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Note saved & added to footprint!
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400">
                        Notes permanently attach to lead profile & CSV exports.
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={!newNoteInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Save Note</span>
                    </button>
                  </div>
                </div>

                {/* Existing Persistent Notes */}
                {selectedContact.leadNotes && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-zinc-900 text-xs leading-relaxed whitespace-pre-wrap select-text">
                    <span className="text-[10px] font-mono font-bold text-amber-900 block mb-1">
                      CURRENT LEAD NOTES SUMMARY:
                    </span>
                    {selectedContact.leadNotes}
                  </div>
                )}
              </div>

              {/* HISTORICAL COMMUNICATION FOOTPRINT TIMELINE */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-200">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
                      Communication Footprint History
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                    {selectedContact.footprint ? selectedContact.footprint.length : 0} Events
                  </span>
                </div>

                {/* Footprint Timeline Items */}
                <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
                  {!selectedContact.footprint || selectedContact.footprint.length === 0 ? (
                    <p className="text-zinc-400 text-xs italic pl-7">No communication footprint recorded yet.</p>
                  ) : (
                    selectedContact.footprint.map((fp, i) => (
                      <div key={fp.id || i} className="relative pl-7 space-y-1">
                        {/* Timeline Node Icon */}
                        <div className={`absolute left-1 top-0.5 h-4 w-4 rounded-full border-2 border-white flex items-center justify-center text-[9px] shadow-2xs ${
                          fp.type === 'call' ? 'bg-purple-600 text-white' :
                          fp.type === 'email' ? 'bg-blue-600 text-white' :
                          fp.type === 'linkedin' ? 'bg-sky-600 text-white' :
                          fp.type === 'status' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-white'
                        }`}>
                          {fp.type === 'call' ? '📞' : fp.type === 'email' ? '✉️' : fp.type === 'linkedin' ? 'in' : '📝'}
                        </div>

                        <div className="p-3 bg-zinc-50 border border-zinc-200/90 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-bold text-zinc-950 text-xs flex items-center gap-1.5">
                              <span>{fp.title}</span>
                              {fp.disposition && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                                  {fp.disposition}
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {fp.timestamp}
                            </span>
                          </div>

                          <p className="text-zinc-700 text-xs leading-relaxed whitespace-pre-wrap select-text">
                            {fp.summary}
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-1 border-t border-zinc-200/60">
                            <span>Logged by: <strong>{fp.repName}</strong></span>
                            <button
                              type="button"
                              onClick={() => copyText(fp.summary, fp.id)}
                              className="text-zinc-500 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === fp.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedKey === fp.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal (Restricted to Admins) */}
      {isCsvModalOpen && (
        <UploadLeadsCsvModal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          onLeadsImported={(newLeads) => {
            // Merge into global contacts
            const merged = [...newLeads.map((l, i) => ({
              id: l.id || `lead_import_${Date.now()}_${i}`,
              name: l.name,
              company: l.company,
              title: l.title,
              department: l.department || 'Outbound Operations',
              email: l.email,
              phone: l.phone,
              headcount: l.headcount || '50+ seats',
              website: l.website || '',
              linkedinUrl: l.linkedinUrl || '',
              assignedRep: repName,
              tenantId: 'APEX',
              status: 'New Lead',
              cadenceDay: 1,
              touchNumber: 1,
              leadNotes: `Imported via CSV on ${new Date().toLocaleDateString()}`,
              footprint: [
                {
                  id: `fp_init_${Date.now()}_${i}`,
                  timestamp: `${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
                  isoDate: new Date().toISOString(),
                  type: 'status' as const,
                  title: 'Lead Imported via CSV',
                  summary: 'Enrolled into tenant pipeline.',
                  repName
                }
              ]
            })), ...contacts];
            saveStoredContacts(merged);
            setContacts(merged);
          }}
        />
      )}

    </div>
  );
}
