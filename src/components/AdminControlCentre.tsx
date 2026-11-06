'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, 
  Plus, 
  Pencil, 
  Mail, 
  Archive, 
  Trash2, 
  ChevronDown,
  ShieldCheck,
  FileText,
  Users,
  BookOpen,
  Sliders,
  CheckCircle2,
  Clock,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  Phone,
  Copy,
  Check,
  Share2,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  X,
  Send,
  Eye,
  SlidersHorizontal,
  Lock,
  Unlock,
  Building2,
  Layers,
  KeyRound,
  UserCheck,
  ShieldAlert,
  Radio
} from 'lucide-react';
import {
  useSession,
  getStoredRolePermissions,
  saveStoredRolePermissions,
  RolePermissionMatrixItem,
  DEFAULT_ROLE_PERMISSION_MATRIX,
} from '@/lib/session';
import ByokVaultManager from './admin/ByokVaultManager';
import UniversalCrmStudio from './admin/UniversalCrmStudio';
import BillingInvoiceManager from './admin/BillingInvoiceManager';
import McpDeveloperGateway from './admin/McpDeveloperGateway';
import CallDispositionManager from './admin/CallDispositionManager';
import JobRadarManager from './admin/JobRadarManager';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  tenants: string;
  status: string;
  lastLogin: string;
}

interface AdminLead {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  techStack: string;
  outsourcer: string;
  painPoint: string;
  status: 'new' | 'contacted' | 'booked' | 'disqualified';
  assignedRep: string;
}

interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  adminEmail: string;
  plan: 'GTM Turnkey ($4,500/line)' | 'AI LMS Software ($50/rep)' | 'Qualifier Gate ($50/rep)' | 'Sandbox Trial';
  seats: number;
  seatsUsed: number;
  telephony: 'Twilio BYOT' | 'Platform Pooled SIP' | 'VICIdial Trunk' | 'WebRTC Softphone';
  status: 'Active' | 'Trial' | 'Suspended';
  modules: {
    borisCockpit: boolean;
    sparringArena: boolean;
    certificationGate: boolean;
    crmCadence: boolean;
    qaAuditing: boolean;
  };
  monthlySpend: string;
  createdDate: string;
}

export type AdminControlSection = 'jobradar' | 'tenants' | 'dispositions' | 'byok' | 'crm' | 'invoicing' | 'mcp' | 'people' | 'modules' | 'access' | 'leads' | 'reps' | 'feedback' | 'audit';

export default function AdminControlCentre({ section }: { section: AdminControlSection }) {
  const { role, isAdmin, updateSession } = useSession();
  // Which section to show is now chosen by the Admin / Platform Console sub-nav (redesign Phase 3).
  const activeTab = section;

  // Role Permission Matrix State with persistence & live sync
  const [rolePermissions, setRolePermissions] = useState<RolePermissionMatrixItem[]>(() =>
    getStoredRolePermissions()
  );
  const [permissionSavedToast, setPermissionSavedToast] = useState(false);

  useEffect(() => {
    setRolePermissions(getStoredRolePermissions());
  }, []);

  const handleTogglePermission = (
    toolId: string,
    roleCol: 'sdr' | 'closer' | 'manager' | 'director'
  ) => {
    setRolePermissions((prev) =>
      prev.map((item) =>
        item.id === toolId ? { ...item, [roleCol]: !item[roleCol] } : item
      )
    );
  };

  const handleSavePermissionMatrix = () => {
    saveStoredRolePermissions(rolePermissions);
    setPermissionSavedToast(true);
    setTimeout(() => setPermissionSavedToast(false), 2500);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Tenant Access & Provisioning State
  const [impersonatingTenant, setImpersonatingTenant] = useState<TenantRecord | null>(null);

  const handleSelectShadowTenant = (tenant: TenantRecord) => {
    setImpersonatingTenant(tenant);
    updateSession({ tenantName: tenant.name, tenantCode: tenant.slug });
  };

  const handleExitShadow = () => {
    setImpersonatingTenant(null);
    updateSession({ tenantName: 'Apex Global BPO', tenantCode: 'APEX-GLOBAL' });
  };

  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [tenantSearchQuery, setTenantSearchQuery] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState<'all' | 'Active' | 'Trial' | 'Suspended'>('all');

  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantAdminEmail, setNewTenantAdminEmail] = useState('');
  const [newTenantPlan, setNewTenantPlan] = useState<'GTM Turnkey ($4,500/line)' | 'AI LMS Software ($50/rep)' | 'Qualifier Gate ($50/rep)' | 'Sandbox Trial'>('GTM Turnkey ($4,500/line)');
  const [newTenantSeats, setNewTenantSeats] = useState<number>(25);
  const [newTenantTelephony, setNewTenantTelephony] = useState<'Twilio BYOT' | 'Platform Pooled SIP' | 'VICIdial Trunk' | 'WebRTC Softphone'>('Twilio BYOT');
  const [newTenantCertGate, setNewTenantCertGate] = useState<boolean>(true);

  // Master Tenants Directory
  const [tenants, setTenants] = useState<TenantRecord[]>([
    {
      id: 'ten_1',
      name: 'Apex Global BPO',
      slug: 'apex-global',
      adminEmail: 'julian.vance@apexglobal.ph',
      plan: 'GTM Turnkey ($4,500/line)',
      seats: 250,
      seatsUsed: 184,
      telephony: 'Twilio BYOT',
      status: 'Active',
      modules: {
        borisCockpit: true,
        sparringArena: true,
        certificationGate: true,
        crmCadence: true,
        qaAuditing: true
      },
      monthlySpend: '$9,000/mo',
      createdDate: 'Oct 02, 2026'
    },
    {
      id: 'ten_2',
      name: 'Outsource Accelerator Partner A',
      slug: 'oa-partner-a',
      adminEmail: 'ops@oapartner.com',
      plan: 'AI LMS Software ($50/rep)',
      seats: 60,
      seatsUsed: 42,
      telephony: 'Platform Pooled SIP',
      status: 'Active',
      modules: {
        borisCockpit: true,
        sparringArena: true,
        certificationGate: false,
        crmCadence: true,
        qaAuditing: true
      },
      monthlySpend: '$3,000/mo',
      createdDate: 'Oct 10, 2026'
    },
    {
      id: 'ten_3',
      name: 'Horizon Solar Sales Floor',
      slug: 'horizon-solar',
      adminEmail: 'rick@horizonsolar.us',
      plan: 'Qualifier Gate ($50/rep)',
      seats: 25,
      seatsUsed: 19,
      telephony: 'VICIdial Trunk',
      status: 'Active',
      modules: {
        borisCockpit: true,
        sparringArena: true,
        certificationGate: true,
        crmCadence: false,
        qaAuditing: true
      },
      monthlySpend: '$1,250/mo',
      createdDate: 'Oct 14, 2026'
    },
    {
      id: 'ten_4',
      name: 'Metro Cloud BPO Manila',
      slug: 'metro-cloud-bpo',
      adminEmail: 'contact@metrocloud.ph',
      plan: 'Sandbox Trial',
      seats: 15,
      seatsUsed: 12,
      telephony: 'WebRTC Softphone',
      status: 'Trial',
      modules: {
        borisCockpit: true,
        sparringArena: true,
        certificationGate: false,
        crmCadence: false,
        qaAuditing: false
      },
      monthlySpend: '$0 (Trial)',
      createdDate: 'Oct 18, 2026'
    }
  ]);

  // Add Person Modal state
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [newPersonRole, setNewPersonRole] = useState('Sales Rep');
  const [newPersonTenant, setNewPersonTenant] = useState('Enterprise Outbound Q4');

  const handleAddTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName || !newTenantAdminEmail) return;
    const newRecord: TenantRecord = {
      id: `ten_${Date.now()}`,
      name: newTenantName,
      slug: newTenantSlug || newTenantName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      adminEmail: newTenantAdminEmail,
      plan: newTenantPlan,
      seats: newTenantSeats || 25,
      seatsUsed: 0,
      telephony: newTenantTelephony,
      status: 'Active',
      modules: {
        borisCockpit: true,
        sparringArena: true,
        certificationGate: newTenantCertGate,
        crmCadence: true,
        qaAuditing: true
      },
      monthlySpend: newTenantPlan.includes('4,500') ? '$4,500/mo' : '$1,250/mo',
      createdDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    };
    setTenants([newRecord, ...tenants]);
    setShowAddTenantModal(false);
    setNewTenantName('');
    setNewTenantSlug('');
    setNewTenantAdminEmail('');
  };

  // People Data
  const [users, setUsers] = useState<UserRecord[]>([
    {
      id: '1',
      name: 'Emil Halili',
      email: 'emil@appointmentlyy.ai',
      role: 'Director',
      tenants: 'Global (All Tenants)',
      status: 'Active',
      lastLogin: '20/10/2026, 2:13:56 pm'
    },
    {
      id: '2',
      name: 'Alex Mercer',
      email: 'alex.mercer@appointmentlyy.ai',
      role: 'Sales Rep',
      tenants: 'Enterprise Outbound Q4',
      status: 'Active',
      lastLogin: '20/10/2026, 11:20:14 am'
    },
    {
      id: '3',
      name: 'Elena Rostova',
      email: 'elena.r@appointmentlyy.ai',
      role: 'Sales Rep',
      tenants: 'Fintech Scaleups',
      status: 'Active',
      lastLogin: '20/10/2026, 10:15:30 am'
    },
    {
      id: '4',
      name: 'Marcus Vance',
      email: 'marcus.v@appointmentlyy.ai',
      role: 'Manager',
      tenants: 'Enterprise Outbound Q4',
      status: 'Active',
      lastLogin: '19/10/2026, 4:12:10 pm'
    },
    {
      id: '5',
      name: 'Sarah Jenkins',
      email: 'sjenkins@appointmentlyy.ai',
      role: 'Sales Rep',
      tenants: 'SaaS SMB Pipeline',
      status: 'Active',
      lastLogin: '18/10/2026, 9:04:12 am'
    }
  ]);

  // Leads & Cadence CRM Data (Implemented directly in Super Admin)
  const [leads, setLeads] = useState<AdminLead[]>([
    {
      id: 'lead-1',
      name: 'Jonathan Duarte',
      company: 'OmniCloud Technologies',
      title: 'VP of Demand Generation',
      email: 'jduarte@omnicloud.io',
      phone: '+1 (415) 890-1284',
      techStack: 'HubSpot & Apollo',
      outsourcer: 'Titan BPO Solutions',
      painPoint: 'outbound hold rate and objection hesitation',
      status: 'new',
      assignedRep: 'Alex Mercer'
    },
    {
      id: 'lead-2',
      name: 'Elena Rostova',
      company: 'FinLeap Payments',
      title: 'Head of Sales Development',
      email: 'elena.rostova@finleap.com',
      phone: '+1 (212) 440-9921',
      techStack: 'Salesforce & Salesloft',
      outsourcer: 'Internal 6-person team',
      painPoint: 'rep ramp time and objection handling',
      status: 'new',
      assignedRep: 'Alex Mercer'
    },
    {
      id: 'lead-3',
      name: 'Marcus Brody',
      company: 'LogixWare Supply',
      title: 'Director of Business Development',
      email: 'mbrody@logixware.com',
      phone: '+1 (312) 555-0199',
      techStack: 'Outreach & ZoomInfo',
      outsourcer: 'Agency Partner',
      painPoint: 'qualified discovery conversions',
      status: 'contacted',
      assignedRep: 'Elena Rostova'
    },
    {
      id: 'lead-4',
      name: 'Samantha Cross',
      company: 'CyberShield Scaleup',
      title: 'VP of Marketing & Growth',
      email: 'scross@cybershield.tech',
      phone: '+1 (650) 819-3301',
      techStack: 'Apollo & Outreach',
      outsourcer: 'Burned domain previous vendor',
      painPoint: 'acoustic compliance and deliverability',
      status: 'booked',
      assignedRep: 'Alex Mercer'
    }
  ]);

  const [selectedLeadForCadence, setSelectedLeadForCadence] = useState<AdminLead | null>(leads[0]);
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvUploadSuccess, setCsvUploadSuccess] = useState(false);

  // Copy helper
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Add person handler
  const handleAddPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim() || !newPersonEmail.trim()) return;

    const newUser: UserRecord = {
      id: `${Date.now()}`,
      name: newPersonName.trim(),
      email: newPersonEmail.trim(),
      role: newPersonRole,
      tenants: newPersonTenant,
      status: 'Active',
      lastLogin: 'Just registered'
    };

    setUsers([...users, newUser]);
    setNewPersonName('');
    setNewPersonEmail('');
    setShowAddPersonModal(false);
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = `${u.name} ${u.email}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role.toLowerCase() === roleFilter.toLowerCase();
    const matchTenant = tenantFilter === 'all' || u.tenants.toLowerCase().includes(tenantFilter.toLowerCase());
    return matchSearch && matchRole && matchTenant;
  });

  const filteredLeads = leads.filter(l => 
    `${l.name} ${l.company} ${l.title} ${l.email} ${l.techStack}`.toLowerCase().includes(leadSearchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-zinc-50 font-sans antialiased text-zinc-900">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-7 shadow-sm text-center space-y-4">
              <div className="h-12 w-12 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center mx-auto">
                <Lock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-950">Admin Clearance Required</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  You are signed in as <strong>{role}</strong>. This console is restricted to BPO Floor Administrators and Sales Managers.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <Link
                  href="/dialer"
                  className="w-full py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition-colors"
                >
                  Return to Calling Floor
                </Link>
                <button
                  onClick={() => updateSession({ role: 'Super Admin' })}
                  className="w-full py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 font-medium text-xs transition-colors"
                >
                  Elevate to Admin (Testing)
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex min-w-0 flex-col gap-6">
          {/* TAB: JOB SIGNALS RADAR (Super Admin Exclusive) */}
          {activeTab === 'jobradar' && (
            <JobRadarManager />
          )}

          {/* TAB 0: TENANTS & CLIENT ACCESS */}
          {activeTab === 'tenants' && (
            <div className="space-y-6">
              {/* Filter & Actions Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:max-w-xl">
                  <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b6968]" />
                  <input
                    type="text"
                    value={tenantSearchQuery}
                    onChange={(e) => setTenantSearchQuery(e.target.value)}
                    placeholder="Search client tenant by company name, slug, or admin email..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#222021]/15 text-xs font-medium placeholder-[#6b6968] text-[#222021] shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#ED1C24] transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={tenantStatusFilter}
                    onChange={(e) => setTenantStatusFilter(e.target.value as any)}
                    className="h-11 px-3.5 rounded-xl bg-white border border-[#222021]/15 text-xs font-semibold text-[#222021] focus:outline-none shadow-2xs cursor-pointer"
                  >
                    <option value="all">All Client Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Trial">Trial</option>
                    <option value="Suspended">Suspended</option>
                  </select>

                  <button 
                    onClick={() => setShowAddTenantModal(true)}
                    className="h-11 px-4 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors shrink-0 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Provision Tenant</span>
                  </button>
                </div>
              </div>

              {/* High-Level Tenant Telemetry (4 Cards) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Active BPO Tenants</span>
                  <span className="text-2xl font-black text-[#222021] font-mono">
                    {tenants.filter(t => t.status === 'Active').length} <span className="text-xs font-normal text-[#6b6968]">/ {tenants.length} Total</span>
                  </span>
                  <p className="text-[11px] text-emerald-700 font-medium">100% SLA uptime</p>
                </div>

                <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Allocated SDR Seats</span>
                  <span className="text-2xl font-black text-[#222021] font-mono">
                    {tenants.reduce((acc, t) => acc + t.seatsUsed, 0)} <span className="text-xs font-normal text-[#6b6968]">/ {tenants.reduce((acc, t) => acc + t.seats, 0)} Cap</span>
                  </span>
                  <p className="text-[11px] text-[#6b6968]">73% Floor Utilization</p>
                </div>

                <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Telephony Trunks</span>
                  <span className="text-2xl font-black text-blue-600 font-mono">4 Gateways</span>
                  <p className="text-[11px] text-[#6b6968]">Twilio, SIP, VICIdial, WebRTC</p>
                </div>

                <div className="bg-white border border-[#222021]/10 rounded-2xl p-4 shadow-2xs space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#6b6968] block">Monthly Run Rate</span>
                  <span className="text-2xl font-black text-[#ED1C24] font-mono">$13,250</span>
                  <p className="text-[11px] text-emerald-700 font-medium">+20% vs last month</p>
                </div>
              </div>

              {/* Tenants Directory Cards */}
              <div className="space-y-4">
                {tenants
                  .filter(t => {
                    const matchQuery = t.name.toLowerCase().includes(tenantSearchQuery.toLowerCase()) || 
                                       t.slug.toLowerCase().includes(tenantSearchQuery.toLowerCase()) ||
                                       t.adminEmail.toLowerCase().includes(tenantSearchQuery.toLowerCase());
                    const matchStatus = tenantStatusFilter === 'all' || t.status === tenantStatusFilter;
                    return matchQuery && matchStatus;
                  })
                  .map((tenant) => (
                    <div 
                      key={tenant.id} 
                      className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-4 hover:border-[#222021]/25 transition-all"
                    >
                      {/* Tenant Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-[#222021] text-white flex items-center justify-center font-bold text-sm shrink-0">
                            <Building2 className="h-5 w-5 text-stone-200" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-extrabold text-[#222021]">{tenant.name}</h3>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F2F0EF] text-[#6b6968] border border-[#222021]/10">
                                {tenant.slug}
                              </span>
                            </div>
                            <p className="text-xs text-[#6b6968]">
                              Admin: <strong className="text-[#222021]">{tenant.adminEmail}</strong> &bull; Telephony: <strong className="text-[#222021]">{tenant.telephony}</strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                            tenant.status === 'Active' 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                              : tenant.status === 'Trial' 
                                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                : 'bg-red-50 text-red-800 border-red-200'
                          }`}>
                            {tenant.status.toUpperCase()}
                          </span>
                          <span className="text-xs font-mono font-bold text-[#222021] bg-[#F2F0EF] px-2.5 py-1 rounded-lg border border-[#222021]/10">
                            {tenant.plan}
                          </span>
                        </div>
                      </div>

                      {/* Seat Allocation Bar & Telemetry */}
                      <div className="bg-[#FAF9F5] p-3.5 rounded-xl border border-[#222021]/10 space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-[#6b6968]">Seat Capacity & Floor Allocation:</span>
                          <span className="font-bold text-[#222021]">
                            {tenant.seatsUsed} / {tenant.seats} Seats Occupied ({Math.round((tenant.seatsUsed / tenant.seats) * 100)}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#222021]/10 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all ${
                              tenant.status === 'Suspended' ? 'bg-stone-400' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.round((tenant.seatsUsed / tenant.seats) * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Modular Entitlements / Feature Flags (Interactive) */}
                      <div className="pt-1 border-t border-[#222021]/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-[#6b6968] block mb-1">
                            Tenant Module Entitlements:
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, borisCockpit: !t.modules.borisCockpit } } : t));
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                tenant.modules.borisCockpit 
                                  ? 'bg-red-50 text-[#ED1C24] border-[#ED1C24]/30' 
                                  : 'bg-[#F2F0EF] text-[#6b6968] border-[#222021]/10 line-through'
                              }`}
                              title="Toggle AI Boris Cockpit access"
                            >
                              AI Boris Cockpit
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, sparringArena: !t.modules.sparringArena } } : t));
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                tenant.modules.sparringArena 
                                  ? 'bg-blue-50 text-blue-800 border-blue-200' 
                                  : 'bg-[#F2F0EF] text-[#6b6968] border-[#222021]/10 line-through'
                              }`}
                              title="Toggle AI Sparring Arena access"
                            >
                              AI Sparring Arena
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, certificationGate: !t.modules.certificationGate } } : t));
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                tenant.modules.certificationGate 
                                  ? 'bg-purple-50 text-purple-800 border-purple-200' 
                                  : 'bg-[#F2F0EF] text-[#6b6968] border-[#222021]/10'
                              }`}
                              title="Enforce 80% passing certification gate"
                            >
                              {tenant.modules.certificationGate ? '✓ Cert Gate Enforced' : '○ Cert Gate Optional'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, crmCadence: !t.modules.crmCadence } } : t));
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                                tenant.modules.crmCadence 
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                  : 'bg-[#F2F0EF] text-[#6b6968] border-[#222021]/10 line-through'
                              }`}
                              title="Toggle Leads & Cadence CRM"
                            >
                              Leads CRM
                            </button>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-1 sm:pt-0">
                          <button
                            onClick={() => handleSelectShadowTenant(tenant)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Shadow this tenant's workspace"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Shadow Workspace</span>
                          </button>

                          <button
                            onClick={() => {
                              const nextStatus = tenant.status === 'Active' ? 'Suspended' : 'Active';
                              setTenants(tenants.map(t => t.id === tenant.id ? { ...t, status: nextStatus } : t));
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                              tenant.status === 'Active'
                                ? 'bg-[#F2F0EF] hover:bg-red-50 text-[#6b6968] hover:text-[#ED1C24] border-[#222021]/10 hover:border-red-200'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600'
                            }`}
                          >
                            {tenant.status === 'Active' ? 'Suspend' : 'Activate'}
                          </button>

                          <button
                            onClick={() => {
                              const extra = prompt(`Add seats for ${tenant.name} (Current: ${tenant.seats}):`, '10');
                              if (extra && !isNaN(Number(extra))) {
                                setTenants(tenants.map(t => t.id === tenant.id ? { ...t, seats: t.seats + Number(extra) } : t));
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-[#F2F0EF] hover:bg-[#e7e4e2] text-[#222021] font-semibold text-xs border border-[#222021]/10 transition-colors cursor-pointer"
                            title="Adjust seat limit"
                          >
                            + Seats
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 1: PEOPLE (User Management) */}
          {activeTab === 'people' && (
            <div className="space-y-4">
              {/* Filter Bar: [Search] [Roles] [+ Add person] */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:max-w-xl">
                  <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b6968]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search team member by name or email"
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#222021]/15 text-xs font-medium placeholder-[#6b6968] text-[#222021] shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#ED1C24] transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="h-11 px-3.5 rounded-xl bg-white border border-[#222021]/15 text-xs font-semibold text-[#222021] focus:outline-none shadow-2xs cursor-pointer"
                  >
                    <option value="all">All roles</option>
                    <option value="director">Director</option>
                    <option value="manager">Manager</option>
                    <option value="sales rep">Sales Rep</option>
                  </select>

                  <button 
                    onClick={() => setShowAddPersonModal(true)}
                    className="h-11 px-4 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add person</span>
                  </button>
                </div>
              </div>

              {/* People Table */}
              <div className="bg-white border border-[#222021]/10 rounded-2xl shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#222021]/10 bg-[#F2F0EF]/50 text-[#6b6968] font-bold">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Tenants</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Last login</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222021]/10 font-medium">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-[#F2F0EF]/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-[#222021]">{user.name}</div>
                            <div className="text-[11px] text-[#6b6968]">{user.email}</div>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-[#222021]">
                            {user.role}
                          </td>
                          <td className="py-3.5 px-4 text-[#6b6968]">
                            {user.tenants}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {user.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-[#6b6968] font-mono text-[11px]">
                            {user.lastLogin}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button title="Edit User" className="p-1.5 rounded-lg hover:bg-[#F2F0EF] text-[#6b6968] hover:text-[#222021] transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button title="Send Reset Email" className="p-1.5 rounded-lg hover:bg-[#F2F0EF] text-[#6b6968] hover:text-[#222021] transition-colors">
                                <Mail className="h-3.5 w-3.5" />
                              </button>
                              <button title="Archive User" className="p-1.5 rounded-lg hover:bg-[#F2F0EF] text-[#6b6968] hover:text-[#222021] transition-colors">
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                title="Delete User" 
                                onClick={() => setUsers(users.filter(u => u.id !== user.id))}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-[#6b6968] hover:text-[#ED1C24] transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="py-3 px-4 border-t border-[#222021]/10 bg-[#F2F0EF]/30 text-xs text-[#6b6968] flex items-center justify-between">
                  <span>Showing {filteredUsers.length} of {users.length} team members</span>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 rounded border border-[#222021]/15 bg-white text-[#6b6968] hover:text-[#222021] text-xs">Previous</button>
                    <button className="px-2 py-1 rounded border border-[#222021]/15 bg-white text-[#6b6968] hover:text-[#222021] text-xs">Next</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRAINING MODULES */}
          {activeTab === 'modules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-[#222021]">Training Curriculum Catalog</h3>
                  <p className="text-xs text-[#6b6968]">Configure competency thresholds, passing grades, and audio synthesis playbooks.</p>
                </div>
                <button className="px-4 py-2 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors">
                  <Plus className="h-4 w-4" />
                  <span>New Module</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { num: '01', title: 'Outbound Cold Calling Fundamentals', desc: 'Pattern interrupts, tonal pacing, and 20-second permission openers.', reps: '18 reps certified', pass: '80%', status: 'Published' },
                  { num: '02', title: 'AI Boris Live Calling Cockpit', desc: 'Real-time objection interception and sub-second ARM script execution.', reps: '24 reps active', pass: '85%', status: 'Published' },
                  { num: '03', title: 'AI Sparring Arena (10 Buyer Personas)', desc: 'Acoustic practice against skeptical VPs, burned directors, and gatekeepers.', reps: '15 reps certified', pass: '80%', status: 'Published' },
                  { num: '04', title: 'Enterprise Certification Gate', desc: 'Standardized 80% passing evaluation with tamper-evident digital certificates.', reps: '12 certificates issued', pass: '80%', status: 'Active Gate' },
                ].map(mod => (
                  <div key={mod.num} className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20">
                        MODULE {mod.num}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {mod.status}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-[#222021]">{mod.title}</h3>
                    <p className="text-xs text-[#6b6968] leading-relaxed">{mod.desc}</p>
                    <div className="pt-2 border-t border-[#222021]/10 flex items-center justify-between text-xs">
                      <span className="text-[#6b6968]">Min Pass: <strong className="text-[#222021]">{mod.pass}</strong></span>
                      <button className="text-xs font-bold text-[#ED1C24] hover:underline">Configure</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MODULE ACCESS */}
          {activeTab === 'access' && (
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#222021]">Role Permission Matrix</h3>
                  <p className="text-xs text-[#6b6968] mt-0.5">Control feature visibility and administrative authority across SDRs, Closers, Managers, and Directors/Admins.</p>
                </div>
                <div className="flex items-center gap-2">
                  {permissionSavedToast && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Permissions Saved &amp; Enforced Live</span>
                    </span>
                  )}
                  <button 
                    onClick={handleSavePermissionMatrix}
                    className="px-5 py-2.5 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                  >
                    Save Access Matrix
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[#222021]/10 text-xs">
                {rolePermissions.map((tool) => (
                  <div key={tool.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="max-w-md">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#222021] text-xs block">{tool.name}</span>
                        {tool.id === 'icp_builder' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 text-white font-bold">
                            NEW ACCESS GATE
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#6b6968]">{tool.desc}</span>
                    </div>
                    <div className="flex items-center gap-5 shrink-0 pt-1 sm:pt-0">
                      <label className="flex items-center gap-1.5 text-[#222021] font-semibold text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={tool.sdr}
                          onChange={() => handleTogglePermission(tool.id, 'sdr')}
                          className="accent-[#ED1C24] h-4 w-4 rounded cursor-pointer"
                        />
                        <span className={tool.sdr ? 'text-zinc-900 font-bold' : 'text-zinc-400 line-through'}>
                          SDR
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[#222021] font-semibold text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={tool.closer}
                          onChange={() => handleTogglePermission(tool.id, 'closer')}
                          className="accent-[#ED1C24] h-4 w-4 rounded cursor-pointer"
                        />
                        <span className={tool.closer ? 'text-zinc-900 font-bold' : 'text-zinc-400 line-through'}>
                          Closer
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[#222021] font-semibold text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={tool.manager}
                          onChange={() => handleTogglePermission(tool.id, 'manager')}
                          className="accent-[#ED1C24] h-4 w-4 rounded cursor-pointer"
                        />
                        <span className={tool.manager ? 'text-zinc-900 font-bold' : 'text-zinc-400 line-through'}>
                          Manager
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[#222021] font-semibold text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={tool.director}
                          onChange={() => handleTogglePermission(tool.id, 'director')}
                          className="accent-[#ED1C24] h-4 w-4 rounded cursor-pointer"
                        />
                        <span className={tool.director ? 'text-zinc-900 font-bold' : 'text-zinc-400 line-through'}>
                          Director / Admin
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                <span className="text-[11px] font-mono">
                  Admins &amp; workspace customers can untick the SDR box above to immediately restrict rep-level access.
                </span>
                <button 
                  onClick={handleSavePermissionMatrix}
                  className="px-5 py-2.5 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                >
                  Save Access Matrix
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: LEADS & CADENCE CRM (Integrated Directly Inside Super Admin) */}
          {activeTab === 'leads' && (
            <div className="space-y-6">
              
              {/* Top Banner: CSV Lead Ingestion Bench */}
              <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ED1C24]/10 text-[#ED1C24] font-bold text-[10px] uppercase font-mono mb-1.5">
                      <Sparkles className="h-3 w-3" />
                      <span>Enterprise Ingestion Engine</span>
                    </div>
                    <h3 className="text-xl font-black text-[#222021]">B2B Leads & Cadence CRM Engine</h3>
                    <p className="text-xs text-[#6b6968] mt-0.5">
                      Upload target prospect lists via CSV, automatically enrich tech stacks, and generate 7-touch multichannel cadences.
                    </p>
                  </div>

                  {/* CSV Upload Trigger */}
                  <div className="flex items-center gap-2">
                    <label className="px-4 py-2.5 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs flex items-center gap-2 shadow-2xs cursor-pointer transition-colors">
                      <UploadCloud className="h-4 w-4" />
                      <span>{isUploadingCsv ? 'Ingesting CSV...' : 'Import Lead CSV'}</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setIsUploadingCsv(true);
                            setTimeout(() => {
                              setIsUploadingCsv(false);
                              setCsvUploadSuccess(true);
                              setTimeout(() => setCsvUploadSuccess(false), 3000);
                            }, 1200);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {csvUploadSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Successfully ingested and vectorized 14 new B2B accounts into current campaign!</span>
                  </div>
                )}
              </div>

              {/* Grid: Leads Roster (7 cols) + AI Cadence Viewer (5 cols) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left: Accounts List (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="bg-white border border-[#222021]/10 rounded-2xl shadow-2xs overflow-hidden">
                    
                    {/* Search & Filter Bar */}
                    <div className="p-4 border-b border-[#222021]/10 flex items-center justify-between gap-3 bg-[#F2F0EF]/40">
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6968]" />
                        <input
                          type="text"
                          value={leadSearchTerm}
                          onChange={(e) => setLeadSearchTerm(e.target.value)}
                          placeholder="Search lead, company, or tech stack..."
                          className="w-full bg-white border border-[#222021]/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#222021] placeholder-[#6b6968] focus:outline-none focus:ring-1 focus:ring-[#ED1C24]"
                        />
                      </div>
                      <span className="text-[11px] font-mono text-[#6b6968] shrink-0 font-bold">
                        {filteredLeads.length} Accounts Loaded
                      </span>
                    </div>

                    {/* Leads Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#222021]/10 text-[#6b6968] font-bold bg-[#F2F0EF]/20">
                            <th className="py-2.5 px-3">Prospect</th>
                            <th className="py-2.5 px-3">Tech Stack</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#222021]/10">
                          {filteredLeads.map((lead) => {
                            const isSelected = selectedLeadForCadence?.id === lead.id;
                            return (
                              <tr 
                                key={lead.id}
                                onClick={() => setSelectedLeadForCadence(lead)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected ? 'bg-[#ED1C24]/10' : 'hover:bg-[#F2F0EF]/50'
                                }`}
                              >
                                <td className="py-3 px-3">
                                  <div className="font-bold text-[#222021]">{lead.name}</div>
                                  <div className="text-[11px] text-[#6b6968]">{lead.company} • {lead.title}</div>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="inline-block px-2 py-0.5 rounded bg-white border border-[#222021]/10 text-[10px] font-mono font-bold text-[#222021]">
                                    {lead.techStack}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    lead.status === 'booked' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                    lead.status === 'contacted' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                    'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}>
                                    {lead.status}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <button 
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                      isSelected ? 'bg-[#ED1C24] text-white' : 'bg-[#F2F0EF] text-[#222021] hover:bg-[#e7e4e2]'
                                    }`}
                                  >
                                    View Cadence
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: AI 7-Touch Cadence Package Viewer (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  {selectedLeadForCadence ? (
                    <div className="bg-white border border-[#222021]/10 rounded-2xl p-5 shadow-2xs space-y-4">
                      
                      {/* Cadence Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase text-[#ED1C24] block">
                            MULTICHANNEL CADENCE
                          </span>
                          <h4 className="text-base font-black text-[#222021] mt-0.5">
                            {selectedLeadForCadence.name} ({selectedLeadForCadence.company})
                          </h4>
                          <p className="text-[11px] text-[#6b6968]">
                            Assigned SDR: <strong className="text-[#222021]">{selectedLeadForCadence.assignedRep}</strong>
                          </p>
                        </div>

                        <Link
                          href="/dialer"
                          className="px-3 py-1.5 rounded-lg bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors shrink-0"
                        >
                          <Phone className="h-3 w-3" />
                          <span>Push to Cockpit</span>
                        </Link>
                      </div>

                      {/* Cadence Steps Accordion */}
                      <div className="space-y-3 text-xs">
                        
                        {/* Step 1: Cold Call Opener */}
                        <div className="p-3.5 rounded-xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#222021] text-xs flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-[#ED1C24]" />
                              <span>Day 1 — Cold Call & Pattern Interrupt</span>
                            </span>
                            <button
                              onClick={() => copyToClipboard(`Hi ${selectedLeadForCadence.name.split(' ')[0]} ... Alex from Appointmentlyy regarding outbound sales intelligence for ${selectedLeadForCadence.company}. I noticed you are running ${selectedLeadForCadence.techStack}. Do you have 20 seconds?`, 'c1')}
                              className="text-[10px] font-bold text-[#ED1C24] hover:underline flex items-center gap-1"
                            >
                              {copiedKey === 'c1' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              <span>{copiedKey === 'c1' ? 'Copied' : 'Copy Talk Track'}</span>
                            </button>
                          </div>
                          <p className="text-[#222021] text-[11px] leading-relaxed italic bg-white p-2.5 rounded-lg border border-[#222021]/10 font-sans">
                            "Hi {selectedLeadForCadence.name.split(' ')[0]} ... Alex from Appointmentlyy regarding outbound sales intelligence for {selectedLeadForCadence.company}. I noticed your floor is running {selectedLeadForCadence.techStack}."
                          </p>
                        </div>

                        {/* Step 2: Pain Point Executive Email */}
                        <div className="p-3.5 rounded-xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#222021] text-xs flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-blue-600" />
                              <span>Day 2 — Executive Pain Point Email</span>
                            </span>
                            <button
                              onClick={() => copyToClipboard(`Subject: ${selectedLeadForCadence.company} outbound objection drop-off\n\nHi ${selectedLeadForCadence.name.split(' ')[0]},\n\nMost Demand Gen leaders running ${selectedLeadForCadence.techStack} notice rep hesitation accounts for 40% of drop-off.\n\nWorth a 5-minute diagnostic next Tuesday?`, 'c2')}
                              className="text-[10px] font-bold text-[#ED1C24] hover:underline flex items-center gap-1"
                            >
                              {copiedKey === 'c2' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              <span>{copiedKey === 'c2' ? 'Copied' : 'Copy Email'}</span>
                            </button>
                          </div>
                          <div className="text-[11px] text-[#222021] bg-white p-2.5 rounded-lg border border-[#222021]/10 font-mono space-y-1">
                            <div className="text-[10px] text-[#6b6968]">Subject: {selectedLeadForCadence.company} outbound objection drop-off</div>
                            <div>Hi {selectedLeadForCadence.name.split(' ')[0]}, most demand gen teams running {selectedLeadForCadence.techStack} lose 40% of pipeline from rep objection freeze...</div>
                          </div>
                        </div>

                        {/* Step 3: LinkedIn Voice DM */}
                        <div className="p-3.5 rounded-xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#222021] text-xs flex items-center gap-1.5">
                              <Share2 className="h-3.5 w-3.5 text-purple-600" />
                              <span>Day 5 — LinkedIn Voice Note</span>
                            </span>
                            <button
                              onClick={() => copyToClipboard(`Hey ${selectedLeadForCadence.name.split(' ')[0]} - shot you a quick note on Tuesday regarding ${selectedLeadForCadence.company}'s outbound hold rates. Hope the week is wrapping up well!`, 'c3')}
                              className="text-[10px] font-bold text-[#ED1C24] hover:underline flex items-center gap-1"
                            >
                              {copiedKey === 'c3' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              <span>{copiedKey === 'c3' ? 'Copied' : 'Copy Script'}</span>
                            </button>
                          </div>
                          <p className="text-[11px] text-[#222021] bg-white p-2.5 rounded-lg border border-[#222021]/10 italic">
                            "Hey {selectedLeadForCadence.name.split(' ')[0]} - shot you a quick note regarding {selectedLeadForCadence.company}'s SDR hold rates. Hope the week wraps up well!"
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-[#222021]/10 rounded-2xl p-8 text-center text-xs text-[#6b6968]">
                      Select an account from the roster to view its multi-touch cadence.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SALES REPS (Floor Roster & Performance) */}
          {activeTab === 'reps' && (
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-[#222021]">SDR Floor Performance & Credential Roster</h3>
                  <p className="text-xs text-[#6b6968] mt-0.5">Live acoustic hold compliance, dials logged, objection win rates, and certified floor status.</p>
                </div>
                <button className="px-4 py-2 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors">
                  <Plus className="h-4 w-4" />
                  <span>Assign SDR to Campaign</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#222021]/10 text-[#6b6968] font-bold bg-[#F2F0EF]/40">
                      <th className="py-3 px-4">Sales Rep</th>
                      <th className="py-3 px-4">Campaign</th>
                      <th className="py-3 px-4">Dials Today</th>
                      <th className="py-3 px-4">Bookings</th>
                      <th className="py-3 px-4">Objection Win Rate</th>
                      <th className="py-3 px-4">Quality GPA</th>
                      <th className="py-3 px-4">Certification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222021]/10 font-medium">
                    {[
                      { name: 'Alex Mercer', camp: 'Enterprise Outbound Q4', dials: 94, booked: 6, win: '68%', gpa: '92.5%', status: 'Certified Floor Ready' },
                      { name: 'Elena Rostova', camp: 'Fintech Scaleups', dials: 82, booked: 5, win: '64%', gpa: '89.0%', status: 'Certified Floor Ready' },
                      { name: 'Marcus Brody', camp: 'Enterprise Outbound Q4', dials: 65, booked: 2, win: '42%', gpa: '78.5%', status: 'In Remediation' },
                      { name: 'Sarah Jenkins', camp: 'SaaS SMB Pipeline', dials: 88, booked: 4, win: '58%', gpa: '84.2%', status: 'Certified Floor Ready' },
                    ].map(rep => (
                      <tr key={rep.name} className="hover:bg-[#F2F0EF]/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-[#222021]">{rep.name}</td>
                        <td className="py-3 px-4 text-[#6b6968]">{rep.camp}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#222021]">{rep.dials}</td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600">{rep.booked}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#222021]">{rep.win}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-black text-[#ED1C24]">{rep.gpa}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rep.status === 'Certified Floor Ready' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-[#ED1C24] border border-red-200'
                          }`}>
                            {rep.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: REP FEEDBACK & AUDIO QA */}
          {activeTab === 'feedback' && (
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs space-y-4">
              <h3 className="text-base font-extrabold text-[#222021]">Audio QA & Conversation Auditing Logs</h3>
              <p className="text-xs text-[#6b6968]">Evaluated recordings automatically transcribed with ElevenLabs speech-to-text.</p>

              <div className="space-y-3 pt-2">
                {[
                  { rep: 'Alex Mercer', buyer: 'Samantha Cross (Director of Demand Gen)', score: 92, note: 'Superb tactical empathy when buyer cited burned domain history. Reframed acoustic compliance in 140ms.' },
                  { rep: 'Marcus Brody', buyer: 'Vikram Patel (Head of Sales Engineering)', score: 76, note: 'Hesitated on API webhook latency question. Needs remediation on technical infrastructure rubric.' }
                ].map((fb, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-[#F2F0EF] border border-[#222021]/10 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-[#222021]">{fb.rep} vs {fb.buyer}</div>
                      <span className={`font-mono font-black text-xs ${fb.score >= 80 ? 'text-emerald-600' : 'text-[#ED1C24]'}`}>
                        {fb.score}% Composite Score
                      </span>
                    </div>
                    <p className="text-[#6b6968] leading-relaxed italic">
                      "{fb.note}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="bg-white border border-[#222021]/10 rounded-2xl p-6 shadow-2xs space-y-4">
              <h3 className="text-base font-extrabold text-[#222021]">Enterprise Security & Event Audit Trail</h3>
              <p className="text-xs text-[#6b6968]">Tamper-evident logs of tenant modifications, CSV ingestion, and credential issuance.</p>

              <div className="divide-y divide-[#222021]/10 text-xs">
                {[
                  { time: '20/10/2026, 3:24 pm', actor: 'Emil Halili', action: 'Ingested 14 B2B leads via CSV into Enterprise Outbound Q4', ip: '192.168.100.10' },
                  { time: '20/10/2026, 2:15 pm', actor: 'Marcus Vance', action: 'Issued Sales Mastery Certificate #CERT-8849-BPO-Q4 to Alex Mercer', ip: '192.168.100.14' },
                  { time: '20/10/2026, 11:30 am', actor: 'System AI Boris', action: 'Automated rubric grading evaluated Session #session-179248', ip: 'internal-cluster' },
                  { time: '19/10/2026, 5:02 pm', actor: 'Emil Halili', action: 'Updated Role Permission Matrix: enabled softphone dialer for SDRs', ip: '192.168.100.10' }
                ].map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#222021] block">{item.action}</span>
                      <span className="text-[11px] text-[#6b6968]">Actor: {item.actor} • IP: {item.ip}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#6b6968]">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: BYOK AI VAULT */}
          {activeTab === 'byok' && (
            <ByokVaultManager />
          )}

          {/* TAB 9: UNIVERSAL CRM STUDIO */}
          {activeTab === 'crm' && (
            <UniversalCrmStudio />
          )}

          {/* TAB 10: BILLING & INVOICING */}
          {activeTab === 'invoicing' && (
            <BillingInvoiceManager />
          )}

          {/* TAB 12: MCP & DEVELOPER INGRESS */}
          {activeTab === 'mcp' && (
            <McpDeveloperGateway />
          )}

          {/* TAB 13: CALL DISPOSITIONS & CAMPAIGN RULES */}
          {activeTab === 'dispositions' && (
            <CallDispositionManager />
          )}
      </div>

      {/* Add Person Modal */}
      {showAddPersonModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#222021]/20 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#222021]">Add Team Member</h3>
              <button 
                onClick={() => setShowAddPersonModal(false)}
                className="text-[#6b6968] hover:text-[#222021] p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddPerson} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#6b6968] font-bold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  placeholder="e.g. Jordan Smith"
                  className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:border-[#ED1C24]"
                />
              </div>

              <div>
                <label className="block text-[#6b6968] font-bold mb-1">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={newPersonEmail}
                  onChange={(e) => setNewPersonEmail(e.target.value)}
                  placeholder="e.g. jsmith@appointmentlyy.ai"
                  className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:border-[#ED1C24]"
                />
              </div>

              <div>
                <label className="block text-[#6b6968] font-bold mb-1">System Role</label>
                <select
                  value={newPersonRole}
                  onChange={(e) => setNewPersonRole(e.target.value)}
                  className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:border-[#ED1C24]"
                >
                  <option value="Sales Rep">Sales Rep (Front-Line SDR)</option>
                  <option value="Closer">Closer (Diagnostic Lead)</option>
                  <option value="Manager">Manager (Supervisor)</option>
                  <option value="Director">Director (Super Admin)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#6b6968] font-bold mb-1">Assigned Tenant / Campaign</label>
                <select
                  value={newPersonTenant}
                  onChange={(e) => setNewPersonTenant(e.target.value)}
                  className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:border-[#ED1C24]"
                >
                  <option value="Enterprise Outbound Q4">Enterprise Outbound Q4</option>
                  <option value="Fintech Scaleups">Fintech Scaleups</option>
                  <option value="SaaS SMB Pipeline">SaaS SMB Pipeline</option>
                  <option value="Global (All Tenants)">Global (All Tenants)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPersonModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#F2F0EF] text-[#222021] font-semibold text-xs hover:bg-[#e7e4e2] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs shadow-2xs transition-colors"
                >
                  Add Person
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provision Tenant Modal */}
      {showAddTenantModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#222021]/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#222021]/10 pb-3">
              <div>
                <h3 className="text-base font-black text-[#222021]">Provision Client BPO Tenant</h3>
                <p className="text-xs text-[#6b6968]">Set up a dedicated workspace, seat limits, and telephony gateway.</p>
              </div>
              <button 
                onClick={() => setShowAddTenantModal(false)}
                className="text-[#6b6968] hover:text-[#222021] p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddTenant} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#6b6968] font-bold mb-1">Company / BPO Name</label>
                  <input
                    type="text"
                    required
                    value={newTenantName}
                    onChange={(e) => {
                      setNewTenantName(e.target.value);
                      if (!newTenantSlug) {
                        setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                      }
                    }}
                    placeholder="e.g. Apex Global BPO"
                    className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                  />
                </div>
                <div>
                  <label className="block text-[#6b6968] font-bold mb-1">Workspace Slug</label>
                  <input
                    type="text"
                    value={newTenantSlug}
                    onChange={(e) => setNewTenantSlug(e.target.value)}
                    placeholder="e.g. apex-global"
                    className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs font-mono text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#6b6968] font-bold mb-1">Primary Admin Email</label>
                <input
                  type="email"
                  required
                  value={newTenantAdminEmail}
                  onChange={(e) => setNewTenantAdminEmail(e.target.value)}
                  placeholder="e.g. operations@apexglobal.ph"
                  className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#6b6968] font-bold mb-1">Plan Offering</label>
                  <select
                    value={newTenantPlan}
                    onChange={(e) => setNewTenantPlan(e.target.value as any)}
                    className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                  >
                    <option value="GTM Turnkey ($4,500/line)">GTM Turnkey ($4,500/line)</option>
                    <option value="AI LMS Software ($50/rep)">AI LMS Software ($50/rep)</option>
                    <option value="Qualifier Gate ($50/rep)">Qualifier Gate ($50/rep)</option>
                    <option value="Sandbox Trial">Sandbox Trial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#6b6968] font-bold mb-1">Initial Seats Allocation</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={newTenantSeats}
                    onChange={(e) => setNewTenantSeats(Number(e.target.value))}
                    className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs font-mono text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#6b6968] font-bold mb-1">Telephony Mode</label>
                  <select
                    value={newTenantTelephony}
                    onChange={(e) => setNewTenantTelephony(e.target.value as any)}
                    className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                  >
                    <option value="Twilio BYOT">Twilio BYOT</option>
                    <option value="Platform Pooled SIP">Platform Pooled SIP</option>
                    <option value="VICIdial Trunk">VICIdial Trunk</option>
                    <option value="WebRTC Softphone">WebRTC Softphone</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#6b6968] font-bold mb-1">Pass Exam Gate</label>
                  <select
                    value={newTenantCertGate ? 'yes' : 'no'}
                    onChange={(e) => setNewTenantCertGate(e.target.value === 'yes')}
                    className="w-full bg-[#F2F0EF] border border-[#222021]/15 rounded-xl px-3 py-2 text-xs text-[#222021] focus:outline-none focus:bg-white focus:border-[#ED1C24]"
                  >
                    <option value="yes">Enforce 80% Cert Gate</option>
                    <option value="no">Open Floor (No Exam)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#222021]/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddTenantModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#F2F0EF] text-[#222021] font-semibold text-xs hover:bg-[#e7e4e2] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#ED1C24] hover:bg-[#d0181f] text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer"
                >
                  Provision Client Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
