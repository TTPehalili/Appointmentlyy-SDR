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
import { useSession, isRoleAdmin } from '@/lib/session';
import { 
  ContactRecord, 
  IcpFolder,
  LeadFootprintItem, 
  getStoredContacts, 
  getStoredFolders,
  saveStoredContacts, 
  addContactNote, 
  exportContactsToCsv, 
  canUserExportCsv,
  subscribeToContacts 
} from '@/lib/leadStore';
import UploadLeadsCsvModal from '@/components/cockpit/UploadLeadsCsvModal';

export default function GlobalContactsManager() {
  const { session, role, isAdmin, tenantName, repName } = useSession();
  const adminClearance = isRoleAdmin(role);
  const canExportCsv = canUserExportCsv(role);

  const [contacts, setContacts] = useState<ContactRecord[]>(() => getStoredContacts());
  const [folders, setFolders] = useState<IcpFolder[]>(() => getStoredFolders());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('all');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);
  
  // New Note State inside Detail Drawer
  const [newNoteInput, setNewNoteInput] = useState('');
  const [noteSavedToast, setNoteSavedToast] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 25 Results Per Page Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 25;

  // Subscribe to real-time updates
  useEffect(() => {
    setContacts(getStoredContacts());
    setFolders(getStoredFolders());
    const unsubscribe = subscribeToContacts((updated) => {
      setContacts(updated);
      setFolders(getStoredFolders());
      if (selectedContact) {
        const fresh = updated.find(c => c.id === selectedContact.id);
        if (fresh) setSelectedContact(fresh);
      }
    });
    return () => unsubscribe();
  }, [selectedContact?.id]);

  // Distinct Reps for filter dropdown
  const uniqueReps = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach(c => {
      if (c.assignedRep) set.add(c.assignedRep);
    });
    return Array.from(set);
  }, [contacts]);

  // Filtered Contacts (Enforcing Strict Rep Visibility & Anti-Leak Rules)
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      // 1. Strict Rep-level isolation: Reps ONLY see leads explicitly distributed/assigned to them
      if (role === 'Rep') {
        if (!contact.assignedRep || contact.assignedRep.toLowerCase() !== repName.toLowerCase()) {
          return false;
        }
      }

      // 2. Folder filter
      if (selectedFolderFilter !== 'all' && contact.folderId !== selectedFolderFilter) {
        return false;
      }

      // 3. Rep filter (Admin only)
      if (adminClearance && selectedRepFilter !== 'all' && contact.assignedRep !== selectedRepFilter) {
        return false;
      }

      // 4. Status filter
      if (selectedStatus !== 'all' && contact.status.toLowerCase() !== selectedStatus.toLowerCase()) {
        return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = contact.name.toLowerCase().includes(q);
        const matchCompany = contact.company.toLowerCase().includes(q);
        const matchEmail = contact.email.toLowerCase().includes(q);
        const matchPhone = contact.phone.toLowerCase().includes(q);
        const matchTitle = contact.title.toLowerCase().includes(q);
        const matchFolder = (contact.folderName || '').toLowerCase().includes(q);
        if (!matchName && !matchCompany && !matchEmail && !matchPhone && !matchTitle && !matchFolder) {
          return false;
        }
      }

      return true;
    });
  }, [contacts, searchQuery, selectedStatus, selectedRepFilter, selectedFolderFilter, adminClearance, role, repName]);

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
              <Link
                href="/icp-builder"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>ICP List Builder &amp; Folders</span>
              </Link>

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
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by prospect name, company, email, phone, title, or folder..."
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

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none cursor-pointer hover:bg-zinc-100 transition-colors"
              >
                <option value="all">All Statuses</option>
                <option value="New Lead">New Lead</option>
                <option value="In Cadence">In Cadence</option>
                <option value="Meeting Booked">Meeting Booked</option>
                <option value="Call Back Later">Call Back Later</option>
                <option value="Left Voicemail">Left Voicemail</option>
                <option value="Disqualified">Disqualified</option>
              </select>

              {/* Rep Filter (Admin only) */}
              {adminClearance && uniqueReps.length > 1 && (
                <select
                  value={selectedRepFilter}
                  onChange={(e) => setSelectedRepFilter(e.target.value)}
                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700 focus:outline-none cursor-pointer hover:bg-zinc-100 transition-colors"
                >
                  <option value="all">All Assigned Reps</option>
                  {uniqueReps.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Contacts Table View (With Anti-Copy Protection for Non-Admins) */}
          <div className={`bg-white border border-zinc-200 rounded-2xl shadow-xs overflow-hidden ${!canExportCsv ? 'select-none' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-mono text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-4 font-bold">Contact & Role</th>
                    <th className="py-3 px-4 font-bold">Company & Scale</th>
                    <th className="py-3 px-4 font-bold">Direct Channels</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold">Assigned Rep</th>
                    <th className="py-3 px-4 font-bold">Footprint / Touches</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-zinc-400">
                        <Users className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
                        <p className="text-xs font-medium">No matching contacts found.</p>
                        <p className="text-[11px] text-zinc-400">Try adjusting your search query or filters.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedContacts.map((c) => {
                      const touchCount = c.footprint ? c.footprint.length : 0;
                      const latestTouch = c.footprint && c.footprint.length > 0 ? c.footprint[0] : null;

                      return (
                        <tr 
                          key={c.id} 
                          onClick={() => setSelectedContact(c)}
                          className="hover:bg-zinc-50/80 transition-colors cursor-pointer group"
                        >
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

                          {/* 4. Status Badge */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${getStatusBadge(c.status)}`}>
                              {c.status}
                            </span>
                          </td>

                          {/* 5. Assigned Rep */}
                          <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-600">
                            {c.assignedRep || 'Emil Halili'}
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
                    <span className="text-[10px] text-zinc-400 block">Assigned SDR:</span>
                    <span className="font-mono text-zinc-800 font-semibold">{selectedContact.assignedRep || 'Emil Halili'}</span>
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
