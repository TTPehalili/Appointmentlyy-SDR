'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  FolderKanban,
  FolderPlus,
  Users,
  Download,
  Lock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  PhoneCall,
  Mail,
  Building2,
  Globe,
  SlidersHorizontal,
  Plus,
  RefreshCw,
  ArrowRight,
  CreditCard,
  KeyRound,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  Check,
  UserPlus,
} from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import GlobalTopHeader from '@/components/GlobalTopHeader';
import { useSession } from '@/lib/session';
import {
  ContactRecord,
  IcpFolder,
  getStoredContacts,
  getStoredFolders,
  createIcpFolderWithLeads,
  distributeFolderEquallyToReps,
  exportContactsToCsv,
  canUserExportCsv,
  subscribeToContacts,
} from '@/lib/leadStore';
import {
  TenantQuotaState,
  getTenantQuota,
  getAllTenantQuotas,
  getAvailablePullBalance,
  deductTenantQuota,
  creditTenantRecords,
  updateTenantRepsRoster,
  normalizeTenantKey,
  getSuperAdminMasterDataKey,
  setSuperAdminMasterDataKey,
  subscribeToQuotaStore,
} from '@/lib/icpQuotaStore';
import type { SanitizedIcpProspect } from '@/app/api/intelligence/icp/route';
import QuotaTopUpModal from './QuotaTopUpModal';

const SENIORITY_OPTIONS = ['C-Suite', 'VP', 'Director', 'Owner', 'Partner', 'Manager'];

const HEADCOUNT_OPTIONS = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '501-1,000 employees',
  '1,000+ employees',
];

const INDUSTRY_PRESETS = [
  'Outsourcing / Offshoring (BPO)',
  'Computer Software & SaaS',
  'Construction & Commercial HVAC',
  'Renewables & Solar Energy',
  'Telecommunications',
  'Financial Services & FinTech',
  'Healthcare & Medical Devices',
  'Real Estate & Property Management',
  'Logistics & Supply Chain',
  'Marketing & Advertising Agencies',
];

export default function IcpListBuilderHub() {
  const { session, role, tenantName, repName, email } = useSession();
  const isSuperAdmin = role === 'Super Admin';
  const canExport = canUserExportCsv(role);
  const canBuildAndDistribute = role === 'Super Admin' || role === 'Admin' || role === 'Manager';

  // Active target tenant (Super Admin can provision for any client; Tenant users are scoped to their own tenant)
  const [targetTenantCode, setTargetTenantCode] = useState<string>(() =>
    normalizeTenantKey(session.tenantCode || tenantName)
  );

  useEffect(() => {
    if (!isSuperAdmin) {
      setTargetTenantCode(normalizeTenantKey(session.tenantCode || tenantName));
    }
  }, [session.tenantCode, tenantName, isSuperAdmin]);

  const [allQuotas, setAllQuotas] = useState<Record<string, TenantQuotaState>>(() =>
    getAllTenantQuotas()
  );
  const activeQuota = useMemo(
    () => allQuotas[targetTenantCode] || getTenantQuota(targetTenantCode, tenantName),
    [allQuotas, targetTenantCode, tenantName]
  );
  const balance = useMemo(() => getAvailablePullBalance(activeQuota), [activeQuota]);

  // Tabs: 'builder' vs 'folders'
  const [activeTab, setActiveTab] = useState<'builder' | 'folders'>('builder');

  // Contacts & Folders state
  const [contacts, setContacts] = useState<ContactRecord[]>(() => getStoredContacts());
  const [folders, setFolders] = useState<IcpFolder[]>(() => getStoredFolders());
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  // Redistribute modal state
  const [redistributeFolder, setRedistributeFolder] = useState<IcpFolder | null>(null);
  const [redistributeReps, setRedistributeReps] = useState<string[]>([]);
  const [newRepInput, setNewRepInput] = useState('');

  // Top-up modal state
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);

  // Super Admin Master Key drawer
  const [showMasterKeyPanel, setShowMasterKeyPanel] = useState(false);
  const [masterKeyInput, setMasterKeyInput] = useState(() => getSuperAdminMasterDataKey());
  const [masterKeySavedToast, setMasterKeySavedToast] = useState(false);

  // ICP Filter state
  const [titles, setTitles] = useState('Chief Executive Officer, Owner, VP of Operations, Director of Sales');
  const [excludeTitles, setExcludeTitles] = useState('Intern, Assistant, Junior');
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([
    'C-Suite',
    'VP',
    'Director',
    'Owner',
  ]);
  const [department, setDepartment] = useState('Executive & Revenue Leadership');
  const [industry, setIndustry] = useState('Construction & Commercial HVAC');
  const [headcountRange, setHeadcountRange] = useState('11-50 employees');
  const [country, setCountry] = useState('United States');
  const [state, setState] = useState('Texas');
  const [city, setCity] = useState('');
  const [technologies, setTechnologies] = useState('HubSpot, Salesforce');
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireVerifiedEmail, setRequireVerifiedEmail] = useState(true);
  const [excludePreviouslyPulled, setExcludePreviouslyPulled] = useState(true);

  // Live Market Sizing & Preview state
  const [sizingLoading, setSizingLoading] = useState(false);
  const [totalMatching, setTotalMatching] = useState<number>(18420);
  const [previewProspects, setPreviewProspects] = useState<SanitizedIcpProspect[]>([]);
  const [breakdowns, setBreakdowns] = useState<{
    byIndustry: { label: string; count: number; pct: number }[];
    byHeadcount: { label: string; count: number; pct: number }[];
  } | null>(null);

  // Pull & Folder Distribution state
  const [folderNameInput, setFolderNameInput] = useState('Texas Commercial HVAC Owners — Q4');
  const [pullCount, setPullCount] = useState<number>(50);
  const [selectedRepsForPull, setSelectedRepsForPull] = useState<string[]>([]);
  const [pullingList, setPullingList] = useState(false);
  const [pullBanner, setPullBanner] = useState<{
    type: 'success' | 'error';
    message: string;
    folderId?: string;
  } | null>(null);

  // Sync selected reps when active tenant changes
  useEffect(() => {
    if (activeQuota?.repsRoster?.length) {
      setSelectedRepsForPull(activeQuota.repsRoster);
    }
  }, [activeQuota.tenantCode]);

  // Subscribe to store updates
  useEffect(() => {
    const unsubContacts = subscribeToContacts((updated) => {
      setContacts(updated);
      setFolders(getStoredFolders());
    });
    const unsubQuota = subscribeToQuotaStore(() => {
      setAllQuotas(getAllTenantQuotas());
    });
    return () => {
      unsubContacts();
      unsubQuota();
    };
  }, []);

  // Run initial free market sizing on mount
  useEffect(() => {
    handleCalculateMarketSize();
  }, []);

  const toggleSeniority = (item: string) => {
    setSelectedSeniorities((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const toggleRepForPull = (rep: string) => {
    setSelectedRepsForPull((prev) =>
      prev.includes(rep) ? prev.filter((r) => r !== rep) : [...prev, rep]
    );
  };

  const handleAddRepToRoster = () => {
    if (!newRepInput.trim()) return;
    const clean = newRepInput.trim();
    const updatedRoster = Array.from(new Set([...(activeQuota.repsRoster || []), clean]));
    updateTenantRepsRoster(activeQuota.tenantCode, updatedRoster);
    setAllQuotas(getAllTenantQuotas());
    setSelectedRepsForPull((prev) => Array.from(new Set([...prev, clean])));
    if (redistributeFolder) {
      setRedistributeReps((prev) => Array.from(new Set([...prev, clean])));
    }
    setNewRepInput('');
  };

  // Free Market Sizing (0 credits)
  const handleCalculateMarketSize = async () => {
    setSizingLoading(true);
    setPullBanner(null);
    try {
      const res = await fetch('/api/intelligence/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'size',
          tenantCode: activeQuota.tenantCode,
          pullCount: 25,
          masterKeyOverride: getSuperAdminMasterDataKey(),
          filters: {
            titles,
            excludeTitles,
            seniority: selectedSeniorities,
            department,
            industry,
            headcountRange,
            country,
            state,
            city,
            technologies,
            requirePhone,
            requireVerifiedEmail,
            excludePreviouslyPulled,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTotalMatching(data.totalMatching || 0);
        setPreviewProspects(data.prospects || []);
        setBreakdowns(data.breakdowns || null);
      }
    } catch (err) {
      console.error('[ICP Builder] Market sizing error:', err);
    } finally {
      setSizingLoading(false);
    }
  };

  // Pull & Enrich Leads -> Save to Folder -> Distribute Equally to Selected Reps
  const handlePullAndDistribute = async () => {
    if (!canBuildAndDistribute) return;
    if (!folderNameInput.trim()) {
      setPullBanner({
        type: 'error',
        message: 'Please enter a Folder Name so your team knows what this list contains.',
      });
      return;
    }

    if (pullCount > balance.totalPullableNow) {
      setPullBanner({
        type: 'error',
        message: `Your workspace has ${balance.totalPullableNow.toLocaleString()} records available right now, which is less than the requested ${pullCount.toLocaleString()} records. Click "+ Tap Up Lead Quota" above to add records immediately.`,
      });
      setIsTopUpModalOpen(true);
      return;
    }

    setPullingList(true);
    setPullBanner(null);

    try {
      const res = await fetch('/api/intelligence/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'pull',
          tenantCode: activeQuota.tenantCode,
          pullCount,
          masterKeyOverride: getSuperAdminMasterDataKey(),
          filters: {
            titles,
            excludeTitles,
            seniority: selectedSeniorities,
            department,
            industry,
            headcountRange,
            country,
            state,
            city,
            technologies,
            requirePhone,
            requireVerifiedEmail,
            excludePreviouslyPulled,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.prospects)) {
        throw new Error(data.error || 'Failed to pull ICP records');
      }

      const pulledProspects: SanitizedIcpProspect[] = data.prospects;

      // Deduct from tenant quota
      const deduction = deductTenantQuota(activeQuota.tenantCode, pulledProspects.length);
      if (!deduction.success) {
        setPullBanner({
          type: 'error',
          message: deduction.error || 'Quota limit reached.',
        });
        setPullingList(false);
        return;
      }

      // Convert to ContactRecord items and save inside the named ICP Folder with Equal Rep Distribution
      const mappedLeads = pulledProspects.map((p) => ({
        id: p.id,
        name: p.name,
        company: p.company,
        title: p.title,
        department: p.department,
        email: p.email,
        phone: p.phone,
        headcount: p.headcount,
        industry: p.industry,
        location: p.location,
        website: p.website,
        linkedinUrl: p.linkedinUrl,
        tenantId: activeQuota.tenantCode,
        status: 'New Lead',
        cadenceDay: 1,
        touchNumber: 0,
        leadNotes: `ICP Cloud Verified Record • Industry: ${p.industry} • Location: ${p.location}${
          p.technologies?.length ? ` • Tech Stack: ${p.technologies.join(', ')}` : ''
        }`,
        footprint: [],
      }));

      const targetReps =
        selectedRepsForPull.length > 0 ? selectedRepsForPull : [repName || 'Admin'];

      const { folder } = createIcpFolderWithLeads({
        folderName: folderNameInput.trim(),
        tenantCode: activeQuota.tenantCode,
        tenantName: activeQuota.tenantName,
        createdBy: repName || 'Admin',
        filtersSummary: {
          titles,
          seniority: selectedSeniorities.join(', '),
          industry,
          headcount: headcountRange,
          location: [city, state, country].filter(Boolean).join(', '),
          technologies,
        },
        newLeads: mappedLeads,
        selectedReps: targetReps,
      });

      setAllQuotas(getAllTenantQuotas());
      setContacts(getStoredContacts());
      setFolders(getStoredFolders());
      setExpandedFolderId(folder.id);

      const perRepCount = Math.floor(pulledProspects.length / targetReps.length);
      setPullBanner({
        type: 'success',
        message: `Successfully pulled ${pulledProspects.length} verified records into folder "${folder.name}" and distributed equally across ${targetReps.length} rep(s) (~${perRepCount} leads/rep). Synced to Global Contacts & Calling Floor!`,
        folderId: folder.id,
      });
    } catch (err: unknown) {
      setPullBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to pull list.',
      });
    } finally {
      setPullingList(false);
    }
  };

  // Filtered folders for active tenant (and for Reps, only folders where they have assigned leads)
  const visibleFolders = useMemo(() => {
    return folders.filter((f) => {
      const sameTenant =
        normalizeTenantKey(f.tenantCode) === activeQuota.tenantCode ||
        isSuperAdmin;
      if (!sameTenant) return false;
      if (role === 'Rep') {
        return f.distributedReps.some(
          (r) => r.repName.toLowerCase() === repName.toLowerCase()
        );
      }
      return true;
    });
  }, [folders, activeQuota.tenantCode, isSuperAdmin, role, repName]);

  // Helper to get contacts inside a folder (respecting Rep isolation!)
  const getFolderContacts = (folderId: string): ContactRecord[] => {
    return contacts.filter((c) => {
      if (c.folderId !== folderId) return false;
      if (role === 'Rep') {
        return c.assignedRep?.toLowerCase() === repName.toLowerCase();
      }
      return true;
    });
  };

  const handleConfirmRedistribute = () => {
    if (!redistributeFolder || redistributeReps.length === 0) return;
    distributeFolderEquallyToReps(
      redistributeFolder.id,
      redistributeReps,
      repName || 'Admin'
    );
    setContacts(getStoredContacts());
    setFolders(getStoredFolders());
    setRedistributeFolder(null);
  };

  const weeklyPct =
    activeQuota.weeklyAllowance > 0
      ? Math.min(
          100,
          Math.round((activeQuota.weeklyUsed / activeQuota.weeklyAllowance) * 100)
        )
      : 100;

  const monthlyPct =
    activeQuota.monthlyIncludedAllowance > 0
      ? Math.min(
          100,
          Math.round(
            (activeQuota.monthlyBaseUsed / activeQuota.monthlyIncludedAllowance) * 100
          )
        )
      : 100;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 font-sans antialiased text-zinc-900">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GlobalTopHeader />

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 1. SUPER ADMIN PROVISIONING & MASTER CONTROL BAR (Super Admin Only) */}
          {isSuperAdmin && (
            <div className="bg-zinc-950 text-white rounded-xl p-4 border border-zinc-800 shadow-xs space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded bg-red-600 text-white text-xs font-bold uppercase tracking-wider">
                    Super Admin Control
                  </span>
                  <span className="text-xs text-zinc-300">
                    Provisioning ICP Lists &amp; Quota for Client Workspace:
                  </span>
                  <select
                    value={targetTenantCode}
                    onChange={(e) => setTargetTenantCode(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-bold text-emerald-400 focus:outline-none cursor-pointer"
                  >
                    {Object.values(allQuotas).map((q) => (
                      <option key={q.tenantCode} value={q.tenantCode}>
                        {q.tenantName} ({q.tenantCode}) —{' '}
                        {q.billingStage === 'month1'
                          ? 'Month 1 (8k Free / 2k wk)'
                          : 'Month 2+ ($249 BYOK + Paid Volume)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const nextStage =
                        activeQuota.billingStage === 'month1' ? 'month2+' : 'month1';
                      creditTenantRecords(activeQuota.tenantCode, 0, {
                        setBillingStage: nextStage,
                        resetMonth1: nextStage === 'month1',
                      });
                      setAllQuotas(getAllTenantQuotas());
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 cursor-pointer"
                    title="Toggle tenant between Month 1 (Free 8k = 2k/wk) and Month 2+ ($249 BYOK + Paid Packs)"
                  >
                    Cycle:{' '}
                    <strong className="text-white">
                      {activeQuota.billingStage === 'month1'
                        ? 'Month 1 (2k/wk Included)'
                        : 'Month 2+ (Paid Volume Only)'}
                    </strong>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      creditTenantRecords(activeQuota.tenantCode, 2000);
                      setAllQuotas(getAllTenantQuotas());
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                  >
                    + Credit 2,000 Bonus Records
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMasterKeyPanel(!showMasterKeyPanel)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 border border-zinc-700 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>Master API Key</span>
                  </button>
                </div>
              </div>

              {showMasterKeyPanel && (
                <div className="pt-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-zinc-400">
                    <strong className="text-white">
                      Stealth Upstream Master Key ($97/mo Solo Key):
                    </strong>{' '}
                    Hidden 100% from all clients. Powers all 5+ client workspaces via{' '}
                    <code className="text-emerald-400">/api/intelligence/icp</code>.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={masterKeyInput}
                      onChange={(e) => setMasterKeyInput(e.target.value)}
                      placeholder="Paste master x-api-key (or set LEADOCEAN_API_KEY in .env)"
                      className="w-72 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSuperAdminMasterDataKey(masterKeyInput);
                        setMasterKeySavedToast(true);
                        setTimeout(() => setMasterKeySavedToast(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-bold cursor-pointer"
                    >
                      {masterKeySavedToast ? '✓ Saved' : 'Save Key'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. HEADER & WEEKLY / MONTHLY USAGE VS. ALLOWANCE TELEMETRY HUD */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="h-8 w-8 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold text-sm">
                    <FolderKanban className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-zinc-950">
                    Appointmentlyy ICP List Builder
                  </h1>
                  <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200">
                    {activeQuota.tenantName}
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-md border flex items-center gap-1 ${
                      canExport
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {canExport ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{role} &bull; Full List &amp; CSV Clearance</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{role} &bull; Assigned Leads Only (CSV Export Locked)</span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Search 690M+ verified B2B decision-makers, organize lists into dedicated folders, and distribute leads equally across your SDR reps.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsTopUpModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 transition shadow-xs cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+ Tap Up Lead Quota ($50 / $75 / $150)</span>
                </button>
              </div>
            </div>

            {/* 3-Card Usage vs. Allowance HUD */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Weekly Allowance */}
              <div className="bg-zinc-50/80 border border-zinc-200/80 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-zinc-500">
                    Weekly Allowance (Rolling 7-Day)
                  </span>
                  <span className="font-mono font-semibold text-zinc-700">
                    {activeQuota.billingStage === 'month1'
                      ? `Week ${activeQuota.currentWeekNumber} of 4`
                      : 'Month 2+ Mode'}
                  </span>
                </div>
                {activeQuota.billingStage === 'month1' ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <div className="text-lg font-mono font-bold text-zinc-950">
                        {activeQuota.weeklyUsed.toLocaleString()}{' '}
                        <span className="text-xs font-normal text-zinc-500">
                          / {activeQuota.weeklyAllowance.toLocaleString()} used
                        </span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-emerald-700">
                        {balance.weeklyRemaining.toLocaleString()} left this week
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className="h-full bg-zinc-900 rounded-full transition-all"
                        style={{ width: `${weeklyPct}%` }}
                      />
                    </div>
                    <div className="text-xs text-zinc-500">
                      2,000 records/week included in Month 1 &bull; Resets Monday 12:00 AM
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-zinc-900">
                      Month 2+ ($249/mo BYOK Platform Plan)
                    </div>
                    <p className="text-xs text-zinc-500">
                      Complimentary Month 1 (8k) completed. Pulls draw from your selected paid ICP Volume Pack on the right.
                    </p>
                  </>
                )}
              </div>

              {/* Card 2: Monthly Base Usage (8,000 Month 1 Bonus) */}
              <div className="bg-zinc-50/80 border border-zinc-200/80 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-zinc-500">
                    Month 1 Included Pool (4 Wks × 2k)
                  </span>
                  <span className="font-mono text-zinc-500">8,000 Cap</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-lg font-mono font-bold text-zinc-950">
                    {activeQuota.monthlyBaseUsed.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-500">
                      / 8,000 used
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-600">
                    {balance.monthlyBaseRemaining.toLocaleString()} remaining
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${monthlyPct}%` }}
                  />
                </div>
                <div className="text-xs text-zinc-500">
                  Included with $2,500 Month 1 Setup &bull; Month 2+ uses paid volume packs
                </div>
              </div>

              {/* Card 3: Bonus Top-Up Credits & Total Available Now */}
              <div className="bg-zinc-950 text-white rounded-xl p-4 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-zinc-400">
                    Total Pullable Right Now
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs">
                    +{balance.bonusRemaining.toLocaleString()} Tap-Up Credits
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-mono font-extrabold text-white">
                    {balance.totalPullableNow.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">
                      verified records
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTopUpModalOpen(true)}
                    className="text-xs font-semibold text-emerald-400 hover:underline cursor-pointer"
                  >
                    Tap Up &rarr;
                  </button>
                </div>
                <div className="text-xs text-zinc-400">
                  Add +2k ($50), +5k ($75), or +10k ($150) anytime via instant Wise invoice.
                </div>
              </div>
            </div>

            {/* Sub-Navigation Tabs: Build New ICP List vs. Saved ICP Folders */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('builder')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'builder'
                      ? 'bg-zinc-950 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>1. Search &amp; Build ICP List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('folders')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    activeTab === 'folders'
                      ? 'bg-zinc-950 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>2. Saved ICP Folders ({visibleFolders.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>
                  All pulled lists automatically sync to{' '}
                  <Link href="/contacts" className="font-semibold text-zinc-900 underline">
                    Global Contacts
                  </Link>{' '}
                  &amp;{' '}
                  <Link href="/cockpit" className="font-semibold text-zinc-900 underline">
                    Calling Floor
                  </Link>
                </span>
              </div>
            </div>
          </div>

          {/* Banner Alert after Pulling a List */}
          {pullBanner && (
            <div
              className={`rounded-xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                pullBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-red-50 border-red-200 text-red-950'
              }`}
            >
              <div className="flex items-start gap-2.5 text-xs">
                {pullBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span className="font-medium leading-relaxed">{pullBanner.message}</span>
              </div>
              {pullBanner.type === 'success' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('folders')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    Open Folder View &rarr;
                  </button>
                  <Link
                    href="/contacts"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                  >
                    View in Global Contacts
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* TAB 1: SEARCH & BUILD NEW ICP LIST */}
          {activeTab === 'builder' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* LEFT 4 COLS: ICP Precision Filter Panel */}
              <div className="lg:col-span-4 bg-white border border-zinc-200 rounded-2xl p-5 shadow-2xs space-y-4 h-fit">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-zinc-700" />
                    <h2 className="text-sm font-bold text-zinc-950">
                      ICP Targeting Parameters
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Free Sizing (0 Credits)
                  </span>
                </div>

                {/* Job Titles */}
                <div className="space-y-2.5 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Target Job Titles (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={titles}
                      onChange={(e) => setTitles(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-zinc-900"
                      placeholder="CEO, Owner, VP Sales, Managing Director"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Exclude Titles
                    </label>
                    <input
                      type="text"
                      value={excludeTitles}
                      onChange={(e) => setExcludeTitles(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 focus:outline-none focus:border-zinc-900"
                      placeholder="Intern, Assistant, Student"
                    />
                  </div>

                  {/* Seniority Pills */}
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1.5">
                      Decision-Maker Seniority
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {SENIORITY_OPTIONS.map((sen) => {
                        const active = selectedSeniorities.includes(sen);
                        return (
                          <button
                            key={sen}
                            type="button"
                            onClick={() => toggleSeniority(sen)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition cursor-pointer ${
                              active
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                            }`}
                          >
                            {sen}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Industry */}
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Target Industry / Vertical
                    </label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 bg-white focus:outline-none focus:border-zinc-900"
                    >
                      {INDUSTRY_PRESETS.map((ind) => (
                        <option key={ind} value={ind}>
                          {ind}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Company Headcount */}
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Employee Headcount Range
                    </label>
                    <select
                      value={headcountRange}
                      onChange={(e) => setHeadcountRange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 bg-white focus:outline-none focus:border-zinc-900"
                    >
                      {HEADCOUNT_OPTIONS.map((hc) => (
                        <option key={hc} value={hc}>
                          {hc}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Geography */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Country
                      </label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-900"
                        placeholder="United States"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        State / Region
                      </label>
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-900"
                        placeholder="Texas"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        City (Optional)
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-900"
                        placeholder="Austin, Dallas"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Tech Stack Signals
                      </label>
                      <input
                        type="text"
                        value={technologies}
                        onChange={(e) => setTechnologies(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-900"
                        placeholder="HubSpot, Salesforce"
                      />
                    </div>
                  </div>

                  {/* SDR Readiness Checkboxes */}
                  <div className="pt-2 border-t border-zinc-100 space-y-2">
                    <div className="font-semibold text-zinc-700">
                      Dialer &amp; Cold Email Readiness
                    </div>
                    <label className="flex items-center gap-2 text-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requirePhone}
                        onChange={(e) => setRequirePhone(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <span>Must include Direct / Mobile Phone Number</span>
                    </label>
                    <label className="flex items-center gap-2 text-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requireVerifiedEmail}
                        onChange={(e) => setRequireVerifiedEmail(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <span>Must include Verified Work Email</span>
                    </label>
                    <label className="flex items-center gap-2 text-zinc-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={excludePreviouslyPulled}
                        onChange={(e) => setExcludePreviouslyPulled(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <span>Auto-Exclude Previously Pulled Prospects</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={sizingLoading}
                    onClick={handleCalculateMarketSize}
                    className="w-full mt-2 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${sizingLoading ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {sizingLoading
                        ? 'Sizing Addressable Market...'
                        : 'Preview ICP Audience (0 Credits)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* RIGHT 8 COLS: Market Breakdown + Folder Creation & Equal Rep Distribution + Preview Table */}
              <div className="lg:col-span-8 space-y-5">
                {/* 1. Folder Save & Equal Rep Distribution Box */}
                <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <FolderPlus className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-sm font-bold text-zinc-950">
                          Pull List into Dedicated Folder &amp; Distribute Equally to Reps
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Total Matching Verified Audience:{' '}
                        <strong className="font-mono text-zinc-950">
                          {totalMatching.toLocaleString()} Decision-Makers
                        </strong>{' '}
                        with callable direct phones &amp; verified emails.
                      </p>
                    </div>
                  </div>

                  {canBuildAndDistribute ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-zinc-700 mb-1">
                            Folder Name (Saved in ICP Folders &amp; Global Contacts Filter)
                          </label>
                          <input
                            type="text"
                            value={folderNameInput}
                            onChange={(e) => setFolderNameInput(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-medium focus:outline-none focus:border-zinc-900"
                            placeholder="e.g. Q4 Texas Commercial HVAC Owners"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-zinc-700 mb-1">
                            Records to Pull Now
                          </label>
                          <select
                            value={pullCount}
                            onChange={(e) => setPullCount(Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-mono font-bold bg-white focus:outline-none focus:border-zinc-900"
                          >
                            <option value={20}>20 Verified Records</option>
                            <option value={50}>50 Verified Records</option>
                            <option value={100}>100 Verified Records</option>
                            <option value={250}>250 Verified Records</option>
                            <option value={500}>500 Verified Records</option>
                            <option value={1000}>1,000 Verified Records</option>
                          </select>
                        </div>
                      </div>

                      {/* Equal Rep Distribution Selector */}
                      <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-3.5 space-y-2.5 text-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-zinc-900">
                              Distribute Equally Across Selected SDR Reps (Round-Robin):
                            </span>
                            <span className="text-zinc-500 ml-2">
                              {selectedRepsForPull.length > 0
                                ? `${pullCount} records ÷ ${
                                    selectedRepsForPull.length
                                  } reps = ~${Math.floor(
                                    pullCount / selectedRepsForPull.length
                                  )} records per rep`
                                : 'Select at least 1 rep'}
                            </span>
                          </div>

                          {/* Quick Add Rep to Account Roster */}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newRepInput}
                              onChange={(e) => setNewRepInput(e.target.value)}
                              placeholder="Add rep name..."
                              className="px-2.5 py-1 rounded-md border border-zinc-300 bg-white text-xs text-zinc-900 w-36"
                            />
                            <button
                              type="button"
                              onClick={handleAddRepToRoster}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 text-white font-semibold cursor-pointer"
                            >
                              <UserPlus className="w-3 h-3" />
                              <span>Add Rep</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {(activeQuota.repsRoster || []).map((rep) => {
                            const isChecked = selectedRepsForPull.includes(rep);
                            const sliceCount =
                              isChecked && selectedRepsForPull.length > 0
                                ? Math.floor(pullCount / selectedRepsForPull.length)
                                : 0;
                            return (
                              <button
                                key={rep}
                                type="button"
                                onClick={() => toggleRepForPull(rep)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                                  isChecked
                                    ? 'bg-zinc-950 text-white border-zinc-950'
                                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                                }`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                                    isChecked
                                      ? 'bg-emerald-500 border-emerald-500 text-white'
                                      : 'border-zinc-300'
                                  }`}
                                >
                                  {isChecked && <Check className="w-2.5 h-2.5" />}
                                </span>
                                <span>{rep}</span>
                                {isChecked && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400">
                                    {sliceCount} leads
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="text-xs text-zinc-500">
                          Deducts <strong>{pullCount}</strong> records from{' '}
                          <strong>{activeQuota.tenantName}</strong>&apos;s allowance (
                          {balance.totalPullableNow.toLocaleString()} available).
                        </div>
                        <button
                          type="button"
                          disabled={pullingList}
                          onClick={handlePullAndDistribute}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            {pullingList
                              ? `Pulling & Distributing ${pullCount} Records...`
                              : `Pull ${pullCount} Verified Leads to Folder & Distribute to ${
                                  selectedRepsForPull.length || 1
                                } Rep(s)`}
                          </span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-4 text-xs text-zinc-600 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
                      <span>
                        Pulling new lists and distributing folders is managed by your Account Administrator. Switch to the <strong>Saved ICP Folders</strong> tab to view leads assigned to you.
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Preview Table */}
                <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">
                        Live Audience Preview ({previewProspects.length} Sample Rows of{' '}
                        {totalMatching.toLocaleString()})
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Direct dial numbers and verified work emails unlock automatically when pulled into a folder.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto select-none">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                          <th className="py-2.5 px-4">Decision Maker</th>
                          <th className="py-2.5 px-4">Company &amp; Headcount</th>
                          <th className="py-2.5 px-4">Industry &amp; Location</th>
                          <th className="py-2.5 px-4">Verified Channels</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs">
                        {previewProspects.slice(0, 12).map((p) => (
                          <tr key={p.id} className="hover:bg-zinc-50/70">
                            <td className="py-3 px-4">
                              <div className="font-bold text-zinc-900">{p.name}</div>
                              <div className="text-zinc-500">{p.title}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-zinc-800">{p.company}</div>
                              <div className="text-zinc-400 font-mono">{p.headcount}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-zinc-700">{p.industry}</div>
                              <div className="text-zinc-400">{p.location}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-mono">
                                  <PhoneCall className="w-3 h-3" />
                                  <span>{p.phone}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 text-blue-700 font-mono">
                                  <Mail className="w-3 h-3" />
                                  <span>{p.email}</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SAVED ICP FOLDERS & EQUAL REP DISTRIBUTION */}
          {activeTab === 'folders' && (
            <div className="space-y-4">
              {visibleFolders.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-3">
                  <FolderKanban className="w-8 h-8 text-zinc-400 mx-auto" />
                  <div className="text-sm font-bold text-zinc-900">
                    No ICP List Folders Yet
                  </div>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto">
                    Use the Search &amp; Build ICP List tab to pull your first verified list into a named folder and distribute it equally across your SDR reps.
                  </p>
                </div>
              ) : (
                visibleFolders.map((folder) => {
                  const folderContacts = getFolderContacts(folder.id);
                  const isExpanded = expandedFolderId === folder.id;
                  const bookedCount = folderContacts.filter((c) =>
                    c.status.toLowerCase().includes('book')
                  ).length;

                  return (
                    <div
                      key={folder.id}
                      className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs"
                    >
                      {/* Folder Header Card */}
                      <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="px-2.5 py-1 rounded-lg bg-zinc-950 text-white text-xs font-bold flex items-center gap-1.5">
                              <FolderKanban className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{folder.name}</span>
                            </span>
                            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {role === 'Rep'
                                ? `${folderContacts.length} Assigned to You`
                                : `${folder.totalLeads} Total Verified Leads`}
                            </span>
                            {bookedCount > 0 && (
                              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                {bookedCount} Meetings Booked
                              </span>
                            )}
                            <span className="text-xs text-zinc-400">
                              Created {new Date(folder.createdAt).toLocaleDateString()} by{' '}
                              {folder.createdBy}
                            </span>
                          </div>

                          {/* What this Folder Contains (ICP Summary Tags) */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-semibold text-zinc-500">
                              Folder Contents:
                            </span>
                            {folder.filtersSummary.industry && (
                              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                                Industry: {folder.filtersSummary.industry}
                              </span>
                            )}
                            {folder.filtersSummary.titles && (
                              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                                Titles: {folder.filtersSummary.titles}
                              </span>
                            )}
                            {folder.filtersSummary.headcount && (
                              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                                Size: {folder.filtersSummary.headcount}
                              </span>
                            )}
                            {folder.filtersSummary.location && (
                              <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                                Geo: {folder.filtersSummary.location}
                              </span>
                            )}
                          </div>

                          {/* Equal Rep Distribution Pills */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="text-xs font-semibold text-zinc-500">
                              Equal Rep Split ({folder.distributedReps.length} Reps):
                            </span>
                            {folder.distributedReps.map((slice) => (
                              <span
                                key={slice.repName}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-800"
                              >
                                <Users className="w-3 h-3 text-zinc-400" />
                                <span className="font-medium">{slice.repName}:</span>
                                <strong className="font-mono text-zinc-950">
                                  {slice.leadCount} leads
                                </strong>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Folder Actions (Role-Gated Anti-Leak Guardrail) */}
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFolderId(isExpanded ? null : folder.id)
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>
                              {isExpanded
                                ? 'Hide Folder Leads'
                                : `View Leads (${folderContacts.length})`}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {canBuildAndDistribute && (
                            <button
                              type="button"
                              onClick={() => {
                                setRedistributeFolder(folder);
                                setRedistributeReps(
                                  folder.distributedReps.map((r) => r.repName)
                                );
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-zinc-300 text-zinc-800 hover:bg-zinc-50 transition cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Distribute Equally to X Reps</span>
                            </button>
                          )}

                          {/* Strict Admin-Only CSV Export Guardrail */}
                          {canExport ? (
                            <button
                              type="button"
                              onClick={() =>
                                exportContactsToCsv(folderContacts, folder.name)
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 transition cursor-pointer"
                              title="Admin-Only: Download this folder as CSV"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Export Folder CSV</span>
                            </button>
                          ) : (
                            <div
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-100 border border-zinc-200 text-zinc-500 select-none"
                              title="Security Guardrail: Reps cannot download CSV lists"
                            >
                              <Lock className="w-3.5 h-3.5 text-zinc-400" />
                              <span>CSV Download Locked (Admin Only)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded Folder Leads Table (With Anti-Copy Protection for Reps) */}
                      {isExpanded && (
                        <div
                          className={`border-t border-zinc-200 overflow-x-auto ${
                            !canExport ? 'select-none' : ''
                          }`}
                        >
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                                <th className="py-2.5 px-4">Lead ID</th>
                                <th className="py-2.5 px-4">Prospect &amp; Role</th>
                                <th className="py-2.5 px-4">Company</th>
                                <th className="py-2.5 px-4">Direct Phone &amp; Verified Email</th>
                                <th className="py-2.5 px-4">Assigned Rep</th>
                                <th className="py-2.5 px-4 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 text-xs">
                              {folderContacts.map((lead) => (
                                <tr key={lead.id} className="hover:bg-zinc-50/70">
                                  <td className="py-3 px-4 font-mono text-zinc-500">
                                    {lead.id}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-zinc-900">
                                      {lead.name}
                                    </div>
                                    <div className="text-zinc-500">{lead.title}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-zinc-800">
                                      {lead.company}
                                    </div>
                                    <div className="text-zinc-400">
                                      {lead.industry || lead.headcount}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-mono">
                                    <div className="text-emerald-700 font-semibold">
                                      {lead.phone}
                                    </div>
                                    <div className="text-zinc-600">{lead.email}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-medium text-zinc-800">
                                      {lead.assignedRep}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <Link
                                      href="/cockpit"
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 text-white font-semibold hover:bg-zinc-800"
                                    >
                                      <PhoneCall className="w-3 h-3 text-emerald-400" />
                                      <span>Dial on Floor</span>
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modal: Re-Distribute Folder Equally Across X Reps */}
      {redistributeFolder && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-sm font-bold text-zinc-950">
                  Equal Round-Robin Rep Distribution
                </h3>
                <p className="text-xs text-zinc-500">
                  Folder: <strong>{redistributeFolder.name}</strong> (
                  {redistributeFolder.totalLeads} total leads)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRedistributeFolder(null)}
                className="text-xs text-zinc-400 hover:text-zinc-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-zinc-700">
                Select SDR Reps to Split This Folder Equally:
              </div>
              <div className="flex flex-wrap gap-2">
                {(activeQuota.repsRoster || []).map((rep) => {
                  const active = redistributeReps.includes(rep);
                  return (
                    <button
                      key={rep}
                      type="button"
                      onClick={() =>
                        setRedistributeReps((prev) =>
                          prev.includes(rep)
                            ? prev.filter((r) => r !== rep)
                            : [...prev, rep]
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg border font-medium cursor-pointer ${
                        active
                          ? 'bg-zinc-950 text-white border-zinc-950'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      {active ? '✓ ' : ''}
                      {rep}
                    </button>
                  );
                })}
              </div>

              {redistributeReps.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium mt-2">
                  Splitting <strong>{redistributeFolder.totalLeads}</strong> leads
                  equally across <strong>{redistributeReps.length}</strong> rep(s) ={' '}
                  <strong>
                    ~{Math.floor(redistributeFolder.totalLeads / redistributeReps.length)}{' '}
                    leads per rep
                  </strong>
                  .
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRedistributeFolder(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-zinc-200 text-zinc-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRedistribute}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-zinc-950 text-white hover:bg-zinc-800 cursor-pointer"
              >
                Distribute Equally Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tap Up Quota (+2k/$50, +5k/$75, +10k/$150) + Minimalist Invoice + Wise Link/QR */}
      <QuotaTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => setIsTopUpModalOpen(false)}
        tenantCode={activeQuota.tenantCode}
        tenantName={activeQuota.tenantName}
        clientContactName={repName || activeQuota.adminName}
        clientEmail={email || activeQuota.adminEmail}
      />
    </div>
  );
}
