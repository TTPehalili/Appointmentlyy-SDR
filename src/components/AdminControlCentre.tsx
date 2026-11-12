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
  Radio,
  Ban
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
import { TenantDirectory } from './admin/TenantDirectory';
import { MembersManager } from './admin/MembersManager';
import { DEMO_LOGIN } from '@/lib/demoMode';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { WorkspaceAuditLog, WorkspaceLeadsEmpty, WorkspaceQaEmpty, WorkspaceRepRoster } from './admin/WorkspaceAdminPanels';
import {
  Badge,
  Button,
  buttonClasses,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Meter,
  PageHeader,
  SearchInput,
  Select,
  StatTile,
  StatusDot,
} from '@/components/ui';

/* Brand table styling (matches DataTable). */
const TH_ROW = 'h-9 bg-subtle';
const TH = 'px-4 text-caption font-medium text-fg-tertiary';
const TR = 'border-t border-line transition-colors duration-150 hover:bg-subtle';

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
  // Sample roster, leads, QA reviews and audit events are for the demo workspace only.
  const isDemo = useDemoWorkspace();
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
  const [pendingSuspendTenant, setPendingSuspendTenant] = useState<TenantRecord | null>(null);
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
      name: 'Harbor Point BPO',
      slug: 'harbor-point-bpo',
      adminEmail: 'ops@harborpointbpo.com',
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

  const toggleTenantStatus = (tenant: TenantRecord) => {
    const nextStatus = tenant.status === 'Active' ? 'Suspended' : 'Active';
    setTenants(tenants.map(t => t.id === tenant.id ? { ...t, status: nextStatus } : t));
  };

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
      <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app text-fg">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-surface border border-line rounded-lg p-6 shadow-xs text-center space-y-4">
              <Lock className="h-8 w-8 mx-auto text-line-strong" aria-hidden />
              <div>
                <h2 className="text-h2 text-fg">Admin access required</h2>
                <p className="text-body text-fg-secondary mt-1">
                  You are signed in as <strong className="text-body-strong text-fg">{role}</strong>. This area is for floor admins and sales managers.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <Link href="/dialer" className={buttonClasses('primary', 'md', 'w-full')}>
                  Return to calling floor
                </Link>
                {DEMO_LOGIN && (
                  <Button
                    variant="secondary"
                    onClick={() => updateSession({ role: 'Super Admin' })}
                    className="w-full"
                  >
                    Elevate to admin (testing)
                  </Button>
                )}
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

          {/* TAB 0: TENANTS & CLIENT ACCESS (real workspaces from the server; demo builds keep the sample list) */}
          {activeTab === 'tenants' && !DEMO_LOGIN && <TenantDirectory />}
          {activeTab === 'tenants' && DEMO_LOGIN && (
            <div>
              <PageHeader
                title="Tenants"
                count={tenants.length}
                description="Client workspaces, seat limits, telephony and module entitlements."
                primaryAction={
                  <Button
                    variant="brand"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setShowAddTenantModal(true)}
                  >
                    Provision tenant
                  </Button>
                }
              />

              <div className="space-y-6">
                {/* Filter bar */}
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <div className="w-full sm:max-w-md">
                    <SearchInput
                      type="text"
                      value={tenantSearchQuery}
                      onChange={(e) => setTenantSearchQuery(e.target.value)}
                      placeholder="Search by company, slug or admin email"
                      aria-label="Search tenants"
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select
                      value={tenantStatusFilter}
                      onChange={(e) => setTenantStatusFilter(e.target.value as any)}
                      aria-label="Filter by status"
                    >
                      <option value="all">All statuses</option>
                      <option value="Active">Active</option>
                      <option value="Trial">Trial</option>
                      <option value="Suspended">Suspended</option>
                    </Select>
                  </div>
                </div>

                {/* Tenant KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatTile
                    label="Active tenants"
                    value={tenants.filter(t => t.status === 'Active').length}
                    target={`${tenants.length} total`}
                    hint="100% SLA uptime"
                  />
                  <StatTile
                    label="Seats allocated"
                    value={tenants.reduce((acc, t) => acc + t.seatsUsed, 0)}
                    target={`${tenants.reduce((acc, t) => acc + t.seats, 0)} cap`}
                    hint="73% floor utilization"
                  />
                  <StatTile
                    label="Telephony trunks"
                    value="4"
                    hint="Twilio, SIP, VICIdial, WebRTC"
                  />
                  <StatTile
                    label="Monthly run rate"
                    value="$13,250"
                    delta={20}
                    hint="vs last month"
                  />
                </div>

                {/* Tenants directory */}
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
                      <Card key={tenant.id} className="p-5 space-y-4">
                        {/* Tenant header row */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-h3 text-fg">{tenant.name}</h3>
                              <span className="font-mono text-caption text-fg-tertiary">{tenant.slug}</span>
                            </div>
                            <p className="text-small text-fg-secondary mt-0.5">
                              Admin {tenant.adminEmail} &middot; {tenant.telephony} &middot; {tenant.plan}
                            </p>
                          </div>
                          <Badge
                            tone={tenant.status === 'Active' ? 'success' : tenant.status === 'Trial' ? 'warning' : 'danger'}
                          >
                            {tenant.status}
                          </Badge>
                        </div>

                        {/* Seat meter */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-small">
                            <span className="text-fg-secondary">Seats</span>
                            <span className="tabular-nums text-fg">
                              {tenant.seatsUsed} / {tenant.seats} used ({Math.round((tenant.seatsUsed / tenant.seats) * 100)}%)
                            </span>
                          </div>
                          <Meter
                            value={Math.min(100, Math.round((tenant.seatsUsed / tenant.seats) * 100)) / 100}
                            label={`${tenant.name} seats used`}
                            className={tenant.status === 'Suspended' ? 'opacity-40' : undefined}
                          />
                        </div>

                        {/* Module entitlements (toggle) */}
                        <div className="pt-4 border-t border-line flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <span className="text-caption text-fg-tertiary block mb-1.5">
                              Module entitlements
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, borisCockpit: !t.modules.borisCockpit } } : t));
                                }}
                                className={`focus-ring inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption transition-colors cursor-pointer ${
                                  tenant.modules.borisCockpit
                                    ? 'bg-subtle text-fg border-line hover:border-line-strong'
                                    : 'bg-surface text-fg-tertiary border-line line-through hover:border-line-strong'
                                }`}
                                title="Toggle AI Boris Cockpit access"
                                aria-pressed={tenant.modules.borisCockpit}
                              >
                                {tenant.modules.borisCockpit && <Check className="h-3 w-3" aria-hidden />}
                                AI Boris cockpit
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, sparringArena: !t.modules.sparringArena } } : t));
                                }}
                                className={`focus-ring inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption transition-colors cursor-pointer ${
                                  tenant.modules.sparringArena
                                    ? 'bg-subtle text-fg border-line hover:border-line-strong'
                                    : 'bg-surface text-fg-tertiary border-line line-through hover:border-line-strong'
                                }`}
                                title="Toggle AI Sparring Arena access"
                                aria-pressed={tenant.modules.sparringArena}
                              >
                                {tenant.modules.sparringArena && <Check className="h-3 w-3" aria-hidden />}
                                Practice arena
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, certificationGate: !t.modules.certificationGate } } : t));
                                }}
                                className={`focus-ring inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption transition-colors cursor-pointer ${
                                  tenant.modules.certificationGate
                                    ? 'bg-subtle text-fg border-line hover:border-line-strong'
                                    : 'bg-surface text-fg-tertiary border-line hover:border-line-strong'
                                }`}
                                title="Enforce 80% passing certification gate"
                                aria-pressed={tenant.modules.certificationGate}
                              >
                                {tenant.modules.certificationGate && <Check className="h-3 w-3" aria-hidden />}
                                {tenant.modules.certificationGate ? 'Cert gate enforced' : 'Cert gate optional'}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setTenants(tenants.map(t => t.id === tenant.id ? { ...t, modules: { ...t.modules, crmCadence: !t.modules.crmCadence } } : t));
                                }}
                                className={`focus-ring inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-caption transition-colors cursor-pointer ${
                                  tenant.modules.crmCadence
                                    ? 'bg-subtle text-fg border-line hover:border-line-strong'
                                    : 'bg-surface text-fg-tertiary border-line line-through hover:border-line-strong'
                                }`}
                                title="Toggle Leads & Cadence CRM"
                                aria-pressed={tenant.modules.crmCadence}
                              >
                                {tenant.modules.crmCadence && <Check className="h-3 w-3" aria-hidden />}
                                Leads CRM
                              </button>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<Plus className="h-3.5 w-3.5" />}
                              onClick={() => {
                                const extra = prompt(`Add seats for ${tenant.name} (Current: ${tenant.seats}):`, '10');
                                if (extra && !isNaN(Number(extra))) {
                                  setTenants(tenants.map(t => t.id === tenant.id ? { ...t, seats: t.seats + Number(extra) } : t));
                                }
                              }}
                              title="Adjust seat limit"
                            >
                              Add seats
                            </Button>

                            <Button
                              variant={tenant.status === 'Active' ? 'danger' : 'secondary'}
                              size="sm"
                              onClick={() => {
                                if (tenant.status === 'Active') {
                                  setPendingSuspendTenant(tenant);
                                } else {
                                  toggleTenantStatus(tenant);
                                }
                              }}
                            >
                              {tenant.status === 'Active' ? 'Suspend' : 'Activate'}
                            </Button>

                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Eye className="h-3.5 w-3.5" />}
                              onClick={() => handleSelectShadowTenant(tenant)}
                              title="Shadow this tenant's workspace"
                            >
                              Shadow workspace
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: PEOPLE (members of the current workspace; demo builds keep the sample list) */}
          {activeTab === 'people' && !DEMO_LOGIN && <MembersManager />}
          {activeTab === 'people' && DEMO_LOGIN && (
            <div>
              <PageHeader
                title="Members & seats"
                count={users.length}
                description="Invite people, set their role and choose which workspaces they can use."
                primaryAction={
                  <Button
                    variant="brand"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setShowAddPersonModal(true)}
                  >
                    Add person
                  </Button>
                }
              />

              <div className="space-y-4">
                {/* Filter bar */}
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <div className="w-full sm:max-w-md">
                    <SearchInput
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name or email"
                      aria-label="Search members"
                    />
                  </div>
                  <div className="w-full sm:w-44">
                    <Select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      aria-label="Filter by role"
                    >
                      <option value="all">All roles</option>
                      <option value="director">Director</option>
                      <option value="manager">Manager</option>
                      <option value="sales rep">Sales rep</option>
                    </Select>
                  </div>
                </div>

                {/* People table */}
                <div className="rounded-lg border border-line bg-surface shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-body tabular-nums">
                      <thead>
                        <tr className={TH_ROW}>
                          <th scope="col" className={TH}>Name</th>
                          <th scope="col" className={TH}>Role</th>
                          <th scope="col" className={TH}>Workspaces</th>
                          <th scope="col" className={TH}>Status</th>
                          <th scope="col" className={TH}>Last login</th>
                          <th scope="col" className={`${TH} text-right`}><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user) => (
                          <tr key={user.id} className={TR}>
                            <td className="px-4 py-2.5">
                              <div className="text-body-strong text-fg">{user.name}</div>
                              <div className="text-small text-fg-secondary">{user.email}</div>
                            </td>
                            <td className="px-4 py-2.5 text-fg">
                              {user.role}
                            </td>
                            <td className="px-4 py-2.5 text-fg-secondary">
                              {user.tenants}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusDot tone="success" label={user.status} />
                            </td>
                            <td className="px-4 py-2.5 text-small text-fg-secondary">
                              {user.lastLogin}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="inline-flex items-center gap-0.5">
                                <IconButton label="Edit User" size="sm">
                                  <Pencil className="h-4 w-4" />
                                </IconButton>
                                <IconButton label="Send Reset Email" size="sm">
                                  <Mail className="h-4 w-4" />
                                </IconButton>
                                <IconButton label="Archive User" size="sm">
                                  <Archive className="h-4 w-4" />
                                </IconButton>
                                <IconButton
                                  label="Delete User"
                                  size="sm"
                                  onClick={() => setUsers(users.filter(u => u.id !== user.id))}
                                  className="hover:bg-danger-bg hover:text-danger-fg"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-4 py-3 border-t border-line text-small text-fg-secondary flex items-center justify-between">
                    <span className="tabular-nums">Showing {filteredUsers.length} of {users.length} members</span>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm">Previous</Button>
                      <Button variant="secondary" size="sm">Next</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRAINING MODULES */}
          {activeTab === 'modules' && (
            <div>
              <PageHeader
                title="Training modules"
                description="Set passing grades and competency thresholds for each training module."
                primaryAction={
                  <Button variant="brand" icon={<Plus className="h-4 w-4" />}>
                    New module
                  </Button>
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { num: '01', title: 'Outbound Cold Calling Fundamentals', desc: 'Pattern interrupts, tonal pacing, and 20-second permission openers.', reps: '18 reps certified', pass: '80%', status: 'Published' },
                  { num: '02', title: 'AI Boris Live Calling Cockpit', desc: 'Real-time objection interception and sub-second ARM script execution.', reps: '24 reps active', pass: '85%', status: 'Published' },
                  { num: '03', title: 'AI Sparring Arena (10 Buyer Personas)', desc: 'Acoustic practice against skeptical VPs, burned directors, and gatekeepers.', reps: '15 reps certified', pass: '80%', status: 'Published' },
                  { num: '04', title: 'Enterprise Certification Gate', desc: 'Standardized 80% passing evaluation with tamper-evident digital certificates.', reps: '12 certificates issued', pass: '80%', status: 'Active Gate' },
                ].map(mod => (
                  <Card key={mod.num} className="p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-fg-tertiary tabular-nums">
                        Module {mod.num}
                      </span>
                      <Badge tone="success">{mod.status}</Badge>
                    </div>
                    <div>
                      <h3 className="text-h3 text-fg">{mod.title}</h3>
                      <p className="text-small text-fg-secondary mt-1">{mod.desc}</p>
                    </div>
                    <div className="mt-auto pt-3 border-t border-line flex items-center justify-between text-small">
                      <span className="text-fg-secondary">Pass mark <span className="text-body-strong text-fg tabular-nums">{mod.pass}</span></span>
                      <Button variant="ghost" size="sm">Configure</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MODULE ACCESS */}
          {activeTab === 'access' && (
            <div>
              <PageHeader
                title="Roles & permissions"
                description="Choose which tools each role can see and use. Changes apply after you save."
                meta={
                  permissionSavedToast ? (
                    <Badge tone="success">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
                      Permissions saved
                    </Badge>
                  ) : undefined
                }
                primaryAction={
                  <Button variant="brand" onClick={handleSavePermissionMatrix}>
                    Save permissions
                  </Button>
                }
              />

              <div className="rounded-lg border border-line bg-surface shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-body">
                    <thead>
                      <tr className={TH_ROW}>
                        <th scope="col" className={TH}>Tool</th>
                        <th scope="col" className={`${TH} w-24 text-center`}>SDR</th>
                        <th scope="col" className={`${TH} w-24 text-center`}>Closer</th>
                        <th scope="col" className={`${TH} w-24 text-center`}>Manager</th>
                        <th scope="col" className={`${TH} w-32 text-center`}>Director / admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolePermissions.map((tool) => (
                        <tr key={tool.id} className={TR}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-body-strong text-fg">{tool.name}</span>
                              {tool.id === 'icp_builder' && (
                                <Badge tone="brand">New access gate</Badge>
                              )}
                            </div>
                            <p className="text-small text-fg-secondary max-w-md">{tool.desc}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={tool.sdr}
                              onChange={() => handleTogglePermission(tool.id, 'sdr')}
                              aria-label={`${tool.name}: SDR`}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={tool.closer}
                              onChange={() => handleTogglePermission(tool.id, 'closer')}
                              aria-label={`${tool.name}: Closer`}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={tool.manager}
                              onChange={() => handleTogglePermission(tool.id, 'manager')}
                              aria-label={`${tool.name}: Manager`}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={tool.director}
                              onChange={() => handleTogglePermission(tool.id, 'director')}
                              aria-label={`${tool.name}: Director / admin`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-small text-fg-tertiary">
                    Untick SDR on a tool to remove it from reps straight away.
                  </span>
                  <Button variant="secondary" onClick={handleSavePermissionMatrix}>
                    Save permissions
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LEADS & CADENCE CRM (Integrated Directly Inside Super Admin) */}
          {activeTab === 'leads' && !isDemo && <WorkspaceLeadsEmpty />}
          {activeTab === 'leads' && isDemo && (
            <div>
              <PageHeader
                title="Leads & cadences"
                count={leads.length}
                description="Import prospect lists by CSV and review each lead's multichannel cadence."
                primaryAction={
                  <label className={buttonClasses('brand', 'md', 'cursor-pointer focus-within:shadow-[var(--focus-ring)]')}>
                    <UploadCloud className="h-4 w-4" aria-hidden />
                    <span>{isUploadingCsv ? 'Importing CSV...' : 'Import lead CSV'}</span>
                    <input
                      type="file"
                      accept=".csv"
                      className="sr-only"
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
                }
              />

              <div className="space-y-6">
                {csvUploadSuccess && (
                  <div role="status" className="px-4 py-3 rounded-md bg-success-bg border border-success-500/40 text-success-fg text-body flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    <span>Imported 14 new accounts into the current campaign.</span>
                  </div>
                )}

                {/* Grid: Leads roster (7 cols) + cadence viewer (5 cols) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left: accounts list */}
                  <div className="lg:col-span-7">
                    <div className="rounded-lg border border-line bg-surface shadow-xs overflow-hidden">
                      {/* Search bar */}
                      <div className="p-3 border-b border-line flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <SearchInput
                            type="text"
                            value={leadSearchTerm}
                            onChange={(e) => setLeadSearchTerm(e.target.value)}
                            placeholder="Search lead, company or tech stack"
                            aria-label="Search leads"
                          />
                        </div>
                        <span className="text-small text-fg-secondary shrink-0 tabular-nums">
                          {filteredLeads.length} accounts
                        </span>
                      </div>

                      {/* Leads table */}
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-body">
                          <thead>
                            <tr className={TH_ROW}>
                              <th scope="col" className={TH}>Prospect</th>
                              <th scope="col" className={TH}>Tech stack</th>
                              <th scope="col" className={TH}>Status</th>
                              <th scope="col" className={`${TH} text-right`}><span className="sr-only">Action</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLeads.map((lead) => {
                              const isSelected = selectedLeadForCadence?.id === lead.id;
                              return (
                                <tr
                                  key={lead.id}
                                  onClick={() => setSelectedLeadForCadence(lead)}
                                  className={`border-t border-line cursor-pointer transition-colors duration-150 ${
                                    isSelected ? 'bg-selected' : 'hover:bg-subtle'
                                  }`}
                                >
                                  <td className="px-4 py-2.5">
                                    <div className="text-body-strong text-fg">{lead.name}</div>
                                    <div className="text-small text-fg-secondary">{lead.company} &middot; {lead.title}</div>
                                  </td>
                                  <td className="px-4 py-2.5 text-small text-fg-secondary">
                                    {lead.techStack}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <Badge
                                      tone={lead.status === 'booked' ? 'success' : lead.status === 'contacted' ? 'neutral' : 'warning'}
                                      className="capitalize"
                                    >
                                      {lead.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <Button variant={isSelected ? 'primary' : 'secondary'} size="sm">
                                      View cadence
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Right: cadence package viewer */}
                  <div className="lg:col-span-5">
                    {selectedLeadForCadence ? (
                      <Card className="p-5 space-y-4">
                        {/* Cadence header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-caption text-fg-tertiary block">
                              Multichannel cadence
                            </span>
                            <h4 className="text-h3 text-fg mt-0.5">
                              {selectedLeadForCadence.name} ({selectedLeadForCadence.company})
                            </h4>
                            <p className="text-small text-fg-secondary">
                              Assigned rep: <span className="text-fg">{selectedLeadForCadence.assignedRep}</span>
                            </p>
                          </div>

                          <Link
                            href="/dialer"
                            className={buttonClasses('primary', 'sm', 'shrink-0')}
                          >
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                            <span>Send to dialer</span>
                          </Link>
                        </div>

                        {/* Cadence steps */}
                        <div className="space-y-3">
                          {/* Step 1: Cold call opener */}
                          <div className="p-3.5 rounded-md bg-subtle border border-line space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-body-strong text-fg flex items-center gap-1.5">
                                <Phone className="h-4 w-4 text-fg-secondary" aria-hidden />
                                <span>Day 1: Cold call and pattern interrupt</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={copiedKey === 'c1' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                onClick={() => copyToClipboard(`Hi ${selectedLeadForCadence.name.split(' ')[0]} ... Alex from Appointmentlyy regarding outbound sales intelligence for ${selectedLeadForCadence.company}. I noticed you are running ${selectedLeadForCadence.techStack}. Do you have 20 seconds?`, 'c1')}
                              >
                                {copiedKey === 'c1' ? 'Copied' : 'Copy talk track'}
                              </Button>
                            </div>
                            <p className="text-small text-fg bg-surface p-2.5 rounded-sm border border-line">
                              "Hi {selectedLeadForCadence.name.split(' ')[0]} ... Alex from Appointmentlyy regarding outbound sales intelligence for {selectedLeadForCadence.company}. I noticed your floor is running {selectedLeadForCadence.techStack}."
                            </p>
                          </div>

                          {/* Step 2: Pain point email */}
                          <div className="p-3.5 rounded-md bg-subtle border border-line space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-body-strong text-fg flex items-center gap-1.5">
                                <Mail className="h-4 w-4 text-fg-secondary" aria-hidden />
                                <span>Day 2: Pain point email</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={copiedKey === 'c2' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                onClick={() => copyToClipboard(`Subject: ${selectedLeadForCadence.company} outbound objection drop-off\n\nHi ${selectedLeadForCadence.name.split(' ')[0]},\n\nMost Demand Gen leaders running ${selectedLeadForCadence.techStack} notice rep hesitation accounts for 40% of drop-off.\n\nWorth a 5-minute diagnostic next Tuesday?`, 'c2')}
                              >
                                {copiedKey === 'c2' ? 'Copied' : 'Copy email'}
                              </Button>
                            </div>
                            <div className="text-small text-fg bg-surface p-2.5 rounded-sm border border-line space-y-1">
                              <div className="text-fg-secondary">Subject: {selectedLeadForCadence.company} outbound objection drop-off</div>
                              <div>Hi {selectedLeadForCadence.name.split(' ')[0]}, most demand gen teams running {selectedLeadForCadence.techStack} lose 40% of pipeline from rep objection freeze...</div>
                            </div>
                          </div>

                          {/* Step 3: LinkedIn voice note */}
                          <div className="p-3.5 rounded-md bg-subtle border border-line space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-body-strong text-fg flex items-center gap-1.5">
                                <Share2 className="h-4 w-4 text-fg-secondary" aria-hidden />
                                <span>Day 5: LinkedIn voice note</span>
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={copiedKey === 'c3' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                onClick={() => copyToClipboard(`Hey ${selectedLeadForCadence.name.split(' ')[0]} - shot you a quick note on Tuesday regarding ${selectedLeadForCadence.company}'s outbound hold rates. Hope the week is wrapping up well!`, 'c3')}
                              >
                                {copiedKey === 'c3' ? 'Copied' : 'Copy script'}
                              </Button>
                            </div>
                            <p className="text-small text-fg bg-surface p-2.5 rounded-sm border border-line">
                              "Hey {selectedLeadForCadence.name.split(' ')[0]} - shot you a quick note regarding {selectedLeadForCadence.company}'s SDR hold rates. Hope the week wraps up well!"
                            </p>
                          </div>
                        </div>
                      </Card>
                    ) : (
                      <Card>
                        <EmptyState
                          icon={<Users />}
                          title="No lead selected"
                          description="Select an account from the list to view its cadence."
                        />
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SALES REPS (Floor Roster & Performance) */}
          {activeTab === 'reps' && !isDemo && <WorkspaceRepRoster />}
          {activeTab === 'reps' && isDemo && (
            <div>
              <PageHeader
                title="Rep roster"
                description="Today's dials, bookings, objection win rate and certification for each rep."
                primaryAction={
                  <Button variant="brand" icon={<Plus className="h-4 w-4" />}>
                    Assign rep to campaign
                  </Button>
                }
              />

              <div className="rounded-lg border border-line bg-surface shadow-xs overflow-x-auto">
                <table className="w-full border-collapse text-left text-body tabular-nums">
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={TH}>Rep</th>
                      <th scope="col" className={TH}>Campaign</th>
                      <th scope="col" className={`${TH} text-right`}>Dials today</th>
                      <th scope="col" className={`${TH} text-right`}>Bookings</th>
                      <th scope="col" className={`${TH} text-right`}>Objection win rate</th>
                      <th scope="col" className={`${TH} text-right`}>Quality score</th>
                      <th scope="col" className={TH}>Certification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Alex Mercer', camp: 'Enterprise Outbound Q4', dials: 94, booked: 6, win: '68%', gpa: '92.5%', status: 'Certified Floor Ready' },
                      { name: 'Elena Rostova', camp: 'Fintech Scaleups', dials: 82, booked: 5, win: '64%', gpa: '89.0%', status: 'Certified Floor Ready' },
                      { name: 'Marcus Brody', camp: 'Enterprise Outbound Q4', dials: 65, booked: 2, win: '42%', gpa: '78.5%', status: 'In Remediation' },
                      { name: 'Sarah Jenkins', camp: 'SaaS SMB Pipeline', dials: 88, booked: 4, win: '58%', gpa: '84.2%', status: 'Certified Floor Ready' },
                    ].map(rep => (
                      <tr key={rep.name} className={TR}>
                        <td className="px-4 py-3 text-body-strong text-fg">{rep.name}</td>
                        <td className="px-4 py-3 text-fg-secondary">{rep.camp}</td>
                        <td className="px-4 py-3 text-right text-fg">{rep.dials}</td>
                        <td className="px-4 py-3 text-right text-success-fg">{rep.booked}</td>
                        <td className="px-4 py-3 text-right text-fg">{rep.win}</td>
                        <td className="px-4 py-3 text-right text-fg">{rep.gpa}</td>
                        <td className="px-4 py-3">
                          <StatusDot
                            tone={rep.status === 'Certified Floor Ready' ? 'success' : 'danger'}
                            label={rep.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: REP FEEDBACK & AUDIO QA */}
          {activeTab === 'feedback' && !isDemo && <WorkspaceQaEmpty />}
          {activeTab === 'feedback' && isDemo && (
            <div>
              <PageHeader
                title="Call QA reviews"
                description="Scored calls with transcripts and coaching notes."
              />

              <div className="space-y-3">
                {[
                  { rep: 'Alex Mercer', buyer: 'Samantha Cross (Director of Demand Gen)', score: 92, note: 'Superb tactical empathy when buyer cited burned domain history. Reframed acoustic compliance in 140ms.' },
                  { rep: 'Marcus Brody', buyer: 'Vikram Patel (Head of Sales Engineering)', score: 76, note: 'Hesitated on API webhook latency question. Needs remediation on technical infrastructure rubric.' }
                ].map((fb, idx) => (
                  <Card key={idx} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-body-strong text-fg">{fb.rep} vs {fb.buyer}</div>
                      <Badge tone={fb.score >= 80 ? 'success' : 'danger'}>
                        {fb.score}% score
                      </Badge>
                    </div>
                    <p className="text-body text-fg-secondary">
                      "{fb.note}"
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: AUDIT LOG */}
          {activeTab === 'audit' && !isDemo && <WorkspaceAuditLog />}
          {activeTab === 'audit' && isDemo && (
            <div>
              <PageHeader
                title="Audit log"
                description="A tamper-evident record of tenant changes, CSV imports and certificates issued."
              />

              <div className="rounded-lg border border-line bg-surface shadow-xs overflow-x-auto">
                <table className="w-full border-collapse text-left text-body">
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={TH}>Event</th>
                      <th scope="col" className={TH}>Actor</th>
                      <th scope="col" className={TH}>IP address</th>
                      <th scope="col" className={`${TH} text-right`}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { time: '20/10/2026, 3:24 pm', actor: 'Emil Halili', action: 'Ingested 14 B2B leads via CSV into Enterprise Outbound Q4', ip: '192.168.100.10' },
                      { time: '20/10/2026, 2:15 pm', actor: 'Marcus Vance', action: 'Issued Sales Mastery Certificate #CERT-8849-BPO-Q4 to Alex Mercer', ip: '192.168.100.14' },
                      { time: '20/10/2026, 11:30 am', actor: 'System AI Boris', action: 'Automated rubric grading evaluated Session #session-179248', ip: 'internal-cluster' },
                      { time: '19/10/2026, 5:02 pm', actor: 'Emil Halili', action: 'Updated Role Permission Matrix: enabled softphone dialer for SDRs', ip: '192.168.100.10' }
                    ].map((item, idx) => (
                      <tr key={idx} className={TR}>
                        <td className="px-4 py-3 text-fg">{item.action}</td>
                        <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{item.actor}</td>
                        <td className="px-4 py-3 font-mono text-small text-fg-secondary whitespace-nowrap">{item.ip}</td>
                        <td className="px-4 py-3 text-right text-small tabular-nums text-fg-secondary whitespace-nowrap">{item.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
      <Dialog open={showAddPersonModal} onClose={() => setShowAddPersonModal(false)} title="Add person" size="md" bare className="max-w-md">
          <div>
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <div>
                <h2 id="add-person-title" className="text-h2 text-fg">Add person</h2>
                <p className="text-small text-fg-secondary mt-0.5">They&apos;ll get an invite to the workspace you choose.</p>
              </div>
              <IconButton label="Close" size="sm" onClick={() => setShowAddPersonModal(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <form onSubmit={handleAddPerson}>
              <div className="space-y-4 px-6 py-5">
                <Field label="Full name" htmlFor="add-person-name">
                  <Input
                    id="add-person-name"
                    type="text"
                    required
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    placeholder="e.g. Jordan Smith"
                  />
                </Field>

                <Field label="Work email" htmlFor="add-person-email">
                  <Input
                    id="add-person-email"
                    type="email"
                    required
                    value={newPersonEmail}
                    onChange={(e) => setNewPersonEmail(e.target.value)}
                    placeholder="e.g. jsmith@appointmentlyy.ai"
                  />
                </Field>

                <Field label="Role" htmlFor="add-person-role">
                  <Select
                    id="add-person-role"
                    value={newPersonRole}
                    onChange={(e) => setNewPersonRole(e.target.value)}
                  >
                    <option value="Sales Rep">Sales rep (front-line SDR)</option>
                    <option value="Closer">Closer (diagnostic lead)</option>
                    <option value="Manager">Manager (supervisor)</option>
                    <option value="Director">Director (super admin)</option>
                  </Select>
                </Field>

                <Field label="Workspace or campaign" htmlFor="add-person-tenant">
                  <Select
                    id="add-person-tenant"
                    value={newPersonTenant}
                    onChange={(e) => setNewPersonTenant(e.target.value)}
                  >
                    <option value="Enterprise Outbound Q4">Enterprise Outbound Q4</option>
                    <option value="Fintech Scaleups">Fintech Scaleups</option>
                    <option value="SaaS SMB Pipeline">SaaS SMB Pipeline</option>
                    <option value="Global (All Tenants)">Global (All Tenants)</option>
                  </Select>
                </Field>
              </div>

              <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowAddPersonModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand">
                  Add person
                </Button>
              </div>
            </form>
          </div>
      </Dialog>

      {/* Provision Tenant Modal */}
      <Dialog open={showAddTenantModal} onClose={() => setShowAddTenantModal(false)} title="Provision tenant" size="md" bare>
          <div>
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <div>
                <h2 id="provision-tenant-title" className="text-h2 text-fg">Provision tenant</h2>
                <p className="text-small text-fg-secondary mt-0.5">Set up a dedicated workspace, seat limit and telephony gateway.</p>
              </div>
              <IconButton label="Close" size="sm" onClick={() => setShowAddTenantModal(false)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <form onSubmit={handleAddTenant}>
              <div className="space-y-4 px-6 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Company name" htmlFor="tenant-name">
                    <Input
                      id="tenant-name"
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
                    />
                  </Field>
                  <Field label="Workspace slug" htmlFor="tenant-slug">
                    <Input
                      id="tenant-slug"
                      type="text"
                      mono
                      value={newTenantSlug}
                      onChange={(e) => setNewTenantSlug(e.target.value)}
                      placeholder="e.g. apex-global"
                    />
                  </Field>
                </div>

                <Field label="Admin email" htmlFor="tenant-admin-email">
                  <Input
                    id="tenant-admin-email"
                    type="email"
                    required
                    value={newTenantAdminEmail}
                    onChange={(e) => setNewTenantAdminEmail(e.target.value)}
                    placeholder="e.g. operations@apexglobal.ph"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plan" htmlFor="tenant-plan">
                    <Select
                      id="tenant-plan"
                      value={newTenantPlan}
                      onChange={(e) => setNewTenantPlan(e.target.value as any)}
                    >
                      <option value="GTM Turnkey ($4,500/line)">GTM Turnkey ($4,500/line)</option>
                      <option value="AI LMS Software ($50/rep)">AI LMS Software ($50/rep)</option>
                      <option value="Qualifier Gate ($50/rep)">Qualifier Gate ($50/rep)</option>
                      <option value="Sandbox Trial">Sandbox Trial</option>
                    </Select>
                  </Field>
                  <Field label="Seats" htmlFor="tenant-seats">
                    <Input
                      id="tenant-seats"
                      type="number"
                      min="1"
                      max="1000"
                      value={newTenantSeats}
                      onChange={(e) => setNewTenantSeats(Number(e.target.value))}
                      className="tabular-nums"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Telephony" htmlFor="tenant-telephony">
                    <Select
                      id="tenant-telephony"
                      value={newTenantTelephony}
                      onChange={(e) => setNewTenantTelephony(e.target.value as any)}
                    >
                      <option value="Twilio BYOT">Twilio BYOT</option>
                      <option value="Platform Pooled SIP">Platform Pooled SIP</option>
                      <option value="VICIdial Trunk">VICIdial Trunk</option>
                      <option value="WebRTC Softphone">WebRTC Softphone</option>
                    </Select>
                  </Field>
                  <Field label="Certification gate" htmlFor="tenant-cert-gate">
                    <Select
                      id="tenant-cert-gate"
                      value={newTenantCertGate ? 'yes' : 'no'}
                      onChange={(e) => setNewTenantCertGate(e.target.value === 'yes')}
                    >
                      <option value="yes">Require 80% pass</option>
                      <option value="no">Open floor (no exam)</option>
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowAddTenantModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand">
                  Provision tenant
                </Button>
              </div>
            </form>
          </div>
      </Dialog>

      <ConfirmDialog
        open={pendingSuspendTenant !== null}
        onClose={() => setPendingSuspendTenant(null)}
        onConfirm={() => {
          if (pendingSuspendTenant) toggleTenantStatus(pendingSuspendTenant);
        }}
        title={`Suspend ${pendingSuspendTenant?.name ?? 'tenant'}?`}
        description="The workspace is marked suspended until you reactivate it."
        confirmLabel="Suspend"
        icon={<Ban className="h-4 w-4" />}
      />
    </div>
  );
}
