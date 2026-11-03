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
  SlidersHorizontal,
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
  BookOpen,
  GraduationCap,
  Play,
  Layers,
  Target,
  Compass,
  HelpCircle,
  Zap,
  Building2,
  MapPin,
  Globe,
  ExternalLink,
  Link2,
} from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import GlobalTopHeader from '@/components/GlobalTopHeader';
import { useSession, canUserReassignLeads } from '@/lib/session';
import {
  ContactRecord,
  IcpFolder,
  getStoredContacts,
  getStoredFolders,
  createIcpFolderWithLeads,
  distributeFolderEquallyToReps,
  reassignContactToRep,
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
  'Outsource Accelerator BPO & Virtual Assistant Agencies',
  'Outsourcing / Offshoring (BPO)',
  'Construction & Commercial HVAC',
  'Computer Software & SaaS',
  'Renewables & Solar Energy',
  'Telecommunications',
  'Financial Services & FinTech',
  'Healthcare & Medical Devices',
  'Real Estate & Property Management',
  'Logistics & Supply Chain',
  'Marketing & Advertising Agencies',
];

interface IcpSmartBlueprint {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  titles: string;
  excludeTitles: string;
  seniority: string[];
  industry: string;
  headcount: string;
  country: string;
  state: string;
  technologies: string;
  suggestedFolder: string;
}

const SMART_ICP_BLUEPRINTS: IcpSmartBlueprint[] = [
  {
    id: 'bp_oa_bpo',
    title: 'Outsource Accelerator BPO & VA Leaders',
    subtitle: 'CEOs, Founders & VPs at top BPOs & Virtual Assistant agencies',
    tag: 'BPO & Virtual Assistants',
    titles:
      'CEO, Founder, Co-Founder, Managing Director, Chief Operations Officer, VP of Sales, Chief Growth Officer',
    excludeTitles: 'Agent, Intern, Support, Junior',
    seniority: ['C-Suite', 'VP', 'Director', 'Owner', 'Partner'],
    industry: 'Outsource Accelerator BPO & Virtual Assistant Agencies',
    headcount: '51-200 employees',
    country: 'US, PH, AU, GB',
    state: 'Global BPO Hubs',
    technologies: 'outsourceaccelerator.com, HubSpot, Salesforce, Five9',
    suggestedFolder: 'Outsource Accelerator BPO & Virtual Assistant Leaders',
  },
  {
    id: 'bp_hvac',
    title: 'Commercial HVAC & MEP Owners',
    subtitle: 'High-ticket mechanical contractors & presidents',
    tag: 'Home & Commercial Services',
    titles: 'Owner, President, Chief Executive Officer, Managing Partner',
    excludeTitles: 'Intern, Assistant, Technician, Apprentice',
    seniority: ['C-Suite', 'Owner', 'Partner'],
    industry: 'Construction & Commercial HVAC',
    headcount: '11-50 employees',
    country: 'United States',
    state: 'Texas',
    technologies: 'ServiceTitan, QuickBooks, HubSpot',
    suggestedFolder: 'Texas Commercial HVAC Owners — Q4',
  },
  {
    id: 'bp_saas',
    title: 'B2B SaaS Founders & CROs',
    subtitle: 'Series A–B software leaders hiring outbound SDRs',
    tag: 'Software & Cloud',
    titles: 'Founder, Chief Executive Officer, Chief Revenue Officer, VP of Sales',
    excludeTitles: 'Engineer, Developer, Designer, Intern',
    seniority: ['C-Suite', 'VP', 'Owner'],
    industry: 'Computer Software & SaaS',
    headcount: '51-200 employees',
    country: 'United States',
    state: 'New York',
    technologies: 'Salesforce, HubSpot, Stripe, AWS',
    suggestedFolder: 'NY B2B SaaS Founders & VPs of Sales',
  },
  {
    id: 'bp_solar',
    title: 'Solar & Renewable Sales Directors',
    subtitle: 'Residential & commercial solar installation leaders',
    tag: 'Clean Energy',
    titles: 'Managing Director, Owner, VP of Sales, General Manager',
    excludeTitles: 'Installer, Intern, Canvasser',
    seniority: ['C-Suite', 'VP', 'Director', 'Owner'],
    industry: 'Renewables & Solar Energy',
    headcount: '11-50 employees',
    country: 'United States',
    state: 'Arizona',
    technologies: 'HubSpot, Aurora Solar, Salesforce',
    suggestedFolder: 'Arizona Solar Managing Directors',
  },
];

interface TrainingModuleItem {
  id: string;
  stepNumber: string;
  duration: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  proTip: string;
  actionLabel: string;
  targetTab: 'builder' | 'folders';
  targetWizardStep?: 1 | 2 | 3;
}

const TRAINING_MODULES: TrainingModuleItem[] = [
  {
    id: 'mod_1',
    stepNumber: 'MODULE 01',
    duration: '60 sec read',
    title: 'Pinpointing Your ICP (Zero-Cost Market Sizing)',
    summary:
      'Learn how to filter 690M+ decision-makers by Role, Seniority, Industry, and Geography without spending a single credit during exploration.',
    keyTakeaways: [
      'Market sizing & audience previews cost 0 credits—experiment with filters as much as you want.',
      'Use "1-Click Blueprints" at the top of Step 1 to auto-fill proven targeting combinations.',
      'Always keep "Direct Phone" and "Verified Work Email" checked so every lead is 100% callable on the Calling Floor.',
    ],
    proTip:
      'Combine 3–4 executive titles (e.g., Owner, CEO, President, VP Sales) and exclude junior roles (Intern, Assistant) for the highest cold-call connect rate.',
    actionLabel: 'Practice Step 1: Target Filters',
    targetTab: 'builder',
    targetWizardStep: 1,
  },
  {
    id: 'mod_2',
    stepNumber: 'MODULE 02',
    duration: '45 sec read',
    title: 'Previewing Market Depth & Avoiding Duplicate Pulls',
    summary:
      'Understand how Appointmentlyy automatically de-duplicates prospects so your workspace never pays for the same lead twice.',
    keyTakeaways: [
      'Click "Preview ICP Audience (0 Credits)" to see total matching prospects and sample rows.',
      'Keep "Auto-Exclude Previously Pulled Prospects" enabled—our engine remembers every lead your workspace has ever pulled.',
      'Verify that the sample rows match your exact buyer persona before advancing to Step 3.',
    ],
    proTip:
      'Aim for an addressable market between 1,500 and 25,000 prospects for hyper-relevant cold call scripts.',
    actionLabel: 'Go to Step 2: Market Preview',
    targetTab: 'builder',
    targetWizardStep: 2,
  },
  {
    id: 'mod_3',
    stepNumber: 'MODULE 03',
    duration: '60 sec read',
    title: 'Folder Organization & Equal Round-Robin Rep Distribution',
    summary:
      'How to save lists into named folders and split leads evenly across your SDR team in a single click.',
    keyTakeaways: [
      'Every list you pull is stored inside a named Folder (e.g., "Texas HVAC Owners — Q4") so you always know what each list contains.',
      'Check the SDR Reps you want to assign—our Round-Robin engine divides the batch equally (e.g., 200 leads ÷ 4 reps = 50 leads each).',
      'The moment you click Pull, each Rep immediately sees ONLY their assigned slice on their Calling Floor (/cockpit) and Global Contacts (/contacts).',
    ],
    proTip:
      'You can re-distribute any folder equally to a different set of reps at any time from the Saved ICP Folders tab.',
    actionLabel: 'Practice Step 3: Folder & Rep Split',
    targetTab: 'builder',
    targetWizardStep: 3,
  },
  {
    id: 'mod_4',
    stepNumber: 'MODULE 04',
    duration: '45 sec read',
    title: 'Anti-Data-Leak Security & Weekly Quota Management',
    summary:
      'How Appointmentlyy protects your lead lists from unauthorized export and how weekly allowances & Wise tap-ups work.',
    keyTakeaways: [
      'Strict Admin-Only Export Lock: SDR Reps can dial and email leads assigned to them, but CSV downloading and bulk copy-pasting are 100% blocked for Reps.',
      'Month 1 includes 8,000 verified records paced at 2,000 records/week (resetting every Monday at 12:00 AM).',
      'Need more volume? Click "+ Tap Up Quota" anytime to add +2,000 ($50), +5,000 ($75), or +10,000 ($150) records via instant Wise invoice.',
    ],
    proTip:
      'Filter Global Contacts (/contacts) by Folder Name anytime to audit call dispositions and booked meetings per list.',
    actionLabel: 'Explore Saved Folders & Security',
    targetTab: 'folders',
  },
];

const TRAINING_FAQS = [
  {
    q: 'Does clicking "Preview ICP Audience" deduct from my 2,000 weekly allowance?',
    a: 'No. Market sizing and previewing sample rows cost 0 records. Records are only deducted when you click "Pull & Distribute List" in Step 3 to unlock full direct phone numbers and verified emails.',
  },
  {
    q: 'Where do the leads go after I pull a list into a folder?',
    a: 'They are saved inside the "Saved ICP Folders" tab right here in this tool, AND they automatically sync to Global Contacts (/contacts) and each assigned Rep’s Calling Floor (/cockpit).',
  },
  {
    q: 'Can my SDR Reps download or steal the CSV lists distributed to them?',
    a: 'Never. Appointmentlyy enforces a 5-layer anti-leak lock: Reps only see the slice of leads assigned to them, bulk table copying is disabled, and CSV exporting is strictly locked to Account Administrators.',
  },
  {
    q: 'What happens if I pull a list using the same filters next week—will I get duplicates?',
    a: 'No. As long as "Auto-Exclude Previously Pulled Prospects" is checked, our cloud engine tracks every prospect ID your workspace has ever claimed and excludes them automatically.',
  },
];

export default function IcpListBuilderHub() {
  const { session, role, tenantName, repName, email } = useSession();
  const isSuperAdmin = role === 'Super Admin';
  const canExport = canUserExportCsv(role);
  const canBuildAndDistribute = canUserReassignLeads(role);

  // Active target tenant
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

  // Main Navigation Tabs: 'builder' | 'folders' | 'academy'
  const [activeTab, setActiveTab] = useState<'builder' | 'folders' | 'academy'>('builder');

  // Guided Stepper inside Builder (1: Define ICP, 2: Preview Market, 3: Folder & Equal Split)
  const [activeWizardStep, setActiveWizardStep] = useState<1 | 2 | 3>(1);

  // Training Academy state
  const [completedModules, setCompletedModules] = useState<string[]>(['mod_1']);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  // Contacts & Folders state
  const [contacts, setContacts] = useState<ContactRecord[]>(() => getStoredContacts());
  const [folders, setFolders] = useState<IcpFolder[]>(() => getStoredFolders());
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(
    'folder_oa_bpo_va_live'
  );

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

  // ICP Filter state (Defaulted to Outsource Accelerator BPO & Virtual Assistant Leaders)
  const [activeBlueprintId, setActiveBlueprintId] = useState<string>('bp_oa_bpo');
  const [titles, setTitles] = useState(
    'CEO, Founder, Co-Founder, Managing Director, Chief Operations Officer, VP of Sales, Chief Growth Officer'
  );
  const [excludeTitles, setExcludeTitles] = useState(
    'Agent, Intern, Support, Junior'
  );
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>([
    'C-Suite',
    'VP',
    'Director',
    'Owner',
    'Partner',
  ]);
  const [department, setDepartment] = useState('Executive & Revenue Leadership');
  const [industry, setIndustry] = useState(
    'Outsource Accelerator BPO & Virtual Assistant Agencies'
  );
  const [headcountRange, setHeadcountRange] = useState('51-200 employees');
  const [country, setCountry] = useState('US, PH, AU, GB');
  const [state, setState] = useState('Global BPO Hubs');
  const [city, setCity] = useState('');
  const [technologies, setTechnologies] = useState(
    'outsourceaccelerator.com, HubSpot, Salesforce, Five9'
  );
  const [requirePhone, setRequirePhone] = useState(true);
  const [requireVerifiedEmail, setRequireVerifiedEmail] = useState(true);
  const [excludePreviouslyPulled, setExcludePreviouslyPulled] = useState(true);

  // AI Prompt-to-ICP state
  const [aiPromptInput, setAiPromptInput] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInterpretation, setAiInterpretation] = useState<{
    text: string;
    source: 'gemini' | 'keyword';
  } | null>(null);

  // Instant Single LinkedIn URL Enrichment Bar state
  const [linkedinUrlInput, setLinkedinUrlInput] = useState('');
  const [enrichingSingleUrl, setEnrichingSingleUrl] = useState(false);
  const [enrichedSingleProspect, setEnrichedSingleProspect] =
    useState<SanitizedIcpProspect | null>(null);

  // Live Market Sizing & Preview state (with 25-per-page cursor pagination)
  const [sizingLoading, setSizingLoading] = useState(false);
  const [totalMatching, setTotalMatching] = useState<number>(12600);
  const [previewProspects, setPreviewProspects] = useState<SanitizedIcpProspect[]>([]);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [cursorHistory, setCursorHistory] = useState<string[]>(['']); // index 0 = '' (page 1)
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<{
    byIndustry: { label: string; count: number; pct: number }[];
    byHeadcount: { label: string; count: number; pct: number }[];
  } | null>(null);

  // Saved Folder 25-per-page pagination map (folderId -> pageNumber)
  const [folderPageMap, setFolderPageMap] = useState<Record<string, number>>({});

  // Pull & Folder Distribution state
  const [folderNameInput, setFolderNameInput] = useState(
    'Outsource Accelerator BPO & Virtual Assistant Leaders'
  );
  const [pullCount, setPullCount] = useState<number>(25);
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
    handleCalculateMarketSize(false);
  }, []);

  const applySmartBlueprint = (bp: IcpSmartBlueprint) => {
    setActiveBlueprintId(bp.id);
    setTitles(bp.titles);
    setExcludeTitles(bp.excludeTitles);
    setSelectedSeniorities(bp.seniority);
    setIndustry(bp.industry);
    setHeadcountRange(bp.headcount);
    setCountry(bp.country);
    setState(bp.state);
    setTechnologies(bp.technologies);
    setFolderNameInput(bp.suggestedFolder);
  };

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
    const updatedRoster = Array.from(
      new Set([...(activeQuota.repsRoster || []), clean])
    );
    updateTenantRepsRoster(activeQuota.tenantCode, updatedRoster);
    setAllQuotas(getAllTenantQuotas());
    setSelectedRepsForPull((prev) => Array.from(new Set([...prev, clean])));
    if (redistributeFolder) {
      setRedistributeReps((prev) => Array.from(new Set([...prev, clean])));
    }
    setNewRepInput('');
  };

  // AI Prompt -> Filters (Gemini). Fills filters only; user reviews before any credits are spent.
  const handleAiPromptParse = async () => {
    if (!aiPromptInput.trim() || aiParsing) return;
    setAiParsing(true);
    setAiError(null);
    try {
      const res = await fetch('/api/intelligence/icp/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPromptInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not interpret that prompt.');
      }
      const f = data.filters;
      setActiveBlueprintId('');
      setTitles(f.titles);
      setExcludeTitles(f.excludeTitles);
      setSelectedSeniorities(f.seniority);
      if (f.industry) setIndustry(f.industry);
      setHeadcountRange(f.headcountRange);
      setCountry(f.country);
      setState(f.state);
      setCity(f.city);
      setTechnologies(f.technologies);
      setRequirePhone(f.requirePhone);
      setRequireVerifiedEmail(f.requireVerifiedEmail);
      if (f.suggestedFolderName) setFolderNameInput(f.suggestedFolderName);
      setAiInterpretation({
        text: f.interpretation,
        source: f.source,
      });
    } catch (err: unknown) {
      setAiError(
        err instanceof Error ? err.message : 'Could not interpret that prompt.'
      );
    } finally {
      setAiParsing(false);
    }
  };

  // Free Market Sizing (0 credits) with 25-per-page cursor pagination
  const handleCalculateMarketSize = async (
    advanceStep = true,
    targetPage = 1,
    cursorToken = ''
  ) => {
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
          cursor: cursorToken || undefined,
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
        setPreviewPage(targetPage);
        setNextCursor(data.nextCursor || null);
        if (targetPage === 1) {
          setCursorHistory(['']);
        }
        if (advanceStep) {
          setActiveWizardStep(2);
        }
      }
    } catch (err) {
      console.error('[ICP Builder] Market sizing error:', err);
    } finally {
      setSizingLoading(false);
    }
  };

  const handleNextPreviewPage = () => {
    if (!nextCursor || sizingLoading) return;
    const nextPageNum = previewPage + 1;
    setCursorHistory((prev) => {
      const copy = [...prev];
      copy[nextPageNum - 1] = nextCursor;
      return copy;
    });
    handleCalculateMarketSize(false, nextPageNum, nextCursor);
  };

  const handlePrevPreviewPage = () => {
    if (previewPage <= 1 || sizingLoading) return;
    const prevPageNum = previewPage - 1;
    const prevCursor = cursorHistory[prevPageNum - 1] || '';
    handleCalculateMarketSize(false, prevPageNum, prevCursor);
  };

  // Single LinkedIn URL Instant Enrichment (POST /v1/enrich)
  const handleEnrichSingleLinkedinUrl = async () => {
    if (!linkedinUrlInput.trim()) return;
    setEnrichingSingleUrl(true);
    setPullBanner(null);
    try {
      const res = await fetch('/api/intelligence/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'enrich_url',
          tenantCode: activeQuota.tenantCode,
          linkedinUrlToEnrich: linkedinUrlInput.trim(),
          masterKeyOverride: getSuperAdminMasterDataKey(),
          filters: { industry, country },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.prospect) {
        throw new Error(data.error || 'Could not enrich that LinkedIn profile.');
      }
      setEnrichedSingleProspect(data.prospect);
      setPreviewProspects((prev) => [
        data.prospect,
        ...prev.filter((x) => x.id !== data.prospect.id),
      ]);
      setPullBanner({
        type: 'success',
        message: `Enriched ${data.prospect.name} (${data.prospect.title} @ ${data.prospect.company}) • Website: ${data.prospect.website || 'N/A'} • Email: ${data.prospect.email} • Phone: ${data.prospect.phone}`,
      });
    } catch (err: unknown) {
      setPullBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Could not enrich that LinkedIn URL.',
      });
    } finally {
      setEnrichingSingleUrl(false);
    }
  };

  // Pull & Enrich Leads -> Save to Folder -> Distribute Equally to Selected Reps
  const handlePullAndDistribute = async () => {
    if (!canBuildAndDistribute) return;
    if (!folderNameInput.trim()) {
      setPullBanner({
        type: 'error',
        message:
          'Please enter a Folder Name in Step 3 so your team knows what this list contains.',
      });
      return;
    }

    if (pullCount > balance.totalPullableNow) {
      setPullBanner({
        type: 'error',
        message: `Your workspace has ${balance.totalPullableNow.toLocaleString()} records available right now, which is less than the requested ${pullCount.toLocaleString()} records. Click "+ Tap Up Quota" to add records.`,
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

      const deduction = deductTenantQuota(
        activeQuota.tenantCode,
        pulledProspects.length
      );
      if (!deduction.success) {
        setPullBanner({
          type: 'error',
          message: deduction.error || 'Quota limit reached.',
        });
        setPullingList(false);
        return;
      }

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
        leadNotes: `ICP Cloud Verified Record • Industry: ${p.industry} • Location: ${
          p.location
        }${
          p.technologies?.length
            ? ` • Tech Stack: ${p.technologies.join(', ')}`
            : ''
        }`,
        footprint: [],
      }));

      const targetReps =
        selectedRepsForPull.length > 0
          ? selectedRepsForPull
          : [repName || 'Admin'];

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
        message: `Pulled ${pulledProspects.length} verified records into folder "${folder.name}" and distributed equally across ${targetReps.length} rep(s) (~${perRepCount} leads/rep). Synced to Global Contacts & Calling Floor.`,
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

  // Filtered folders for active tenant
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

  const toggleModuleComplete = (id: string) => {
    setCompletedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
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
            (activeQuota.monthlyBaseUsed / activeQuota.monthlyIncludedAllowance) *
              100
          )
        )
      : 100;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAFAFA] font-sans antialiased text-zinc-900">
      <AppSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GlobalTopHeader />

        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-[1440px] w-full mx-auto">
          {/* 1. SUPER ADMIN PROVISIONING BAR */}
          {isSuperAdmin && (
            <div className="bg-zinc-950 text-white rounded-2xl px-5 py-3.5 border border-zinc-800/80 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-white text-zinc-950 text-[10px] font-mono font-bold uppercase tracking-widest">
                    Super Admin Mode
                  </span>
                  <span className="text-xs text-zinc-400">
                    Active Client Workspace:
                  </span>
                  <select
                    value={targetTenantCode}
                    onChange={(e) => setTargetTenantCode(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-semibold text-white focus:outline-none cursor-pointer"
                  >
                    {Object.values(allQuotas).map((q) => (
                      <option key={q.tenantCode} value={q.tenantCode}>
                        {q.tenantName} ({q.tenantCode}) &bull;{' '}
                        {q.billingStage === 'month1'
                          ? 'Month 1 (2k/wk Included)'
                          : 'Month 2+ ($249 BYOK + Volume)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const nextStage =
                        activeQuota.billingStage === 'month1'
                          ? 'month2+'
                          : 'month1';
                      creditTenantRecords(activeQuota.tenantCode, 0, {
                        setBillingStage: nextStage,
                        resetMonth1: nextStage === 'month1',
                      });
                      setAllQuotas(getAllTenantQuotas());
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-800 cursor-pointer"
                  >
                    Stage:{' '}
                    <strong className="text-white">
                      {activeQuota.billingStage === 'month1'
                        ? 'Month 1 (Free 8k)'
                        : 'Month 2+ (Paid Packs)'}
                    </strong>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      creditTenantRecords(activeQuota.tenantCode, 2000);
                      setAllQuotas(getAllTenantQuotas());
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 text-xs font-semibold cursor-pointer"
                  >
                    + Credit 2,000 Records
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMasterKeyPanel(!showMasterKeyPanel)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 border border-zinc-800 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Master Engine Key</span>
                  </button>
                </div>
              </div>

              {showMasterKeyPanel && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-zinc-400">
                    <strong className="text-white">
                      Master Data Engine API Key:
                    </strong>{' '}
                    100% hidden on the server. Powers all client workspaces via{' '}
                    <code className="text-zinc-200">/api/intelligence/icp</code>.
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={masterKeyInput}
                      onChange={(e) => setMasterKeyInput(e.target.value)}
                      placeholder="Paste master x-api-key..."
                      className="w-64 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white font-mono focus:outline-none"
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
                      {masterKeySavedToast ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. ULTRA-MINIMALIST EDITORIAL HERO & TELEMETRY STRIP */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shadow-2xs">
            {/* Top Bar */}
            <div className="p-6 pb-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-b border-zinc-100">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-950 text-white text-[11px] font-mono font-medium tracking-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>APPOINTMENTLYY DATA CLOUD</span>
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    {activeQuota.tenantName}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                    {canExport
                      ? `${role} • Full Export Access`
                      : `${role} • Assigned View Only (CSV Locked)`}
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
                  ICP List Builder &amp; Folder Studio
                </h1>
                <p className="text-xs text-zinc-500 max-w-2xl">
                  Follow the 3-step guided workflow below to pinpoint verified decision-makers, organize campaigns into folders, and distribute leads equally across your SDR floor.
                </p>
              </div>

              {/* Right Quick Actions */}
              <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('academy')}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    activeTab === 'academy'
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 text-zinc-500" />
                  <span>Interactive User Guide (2 Min)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsTopUpModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-950 text-white hover:bg-zinc-800 transition cursor-pointer shadow-2xs"
                >
                  <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tap Up Quota</span>
                </button>
              </div>
            </div>

            {/* Minimalist 3-Column Usage vs. Allowance Telemetry Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-zinc-100 bg-zinc-50/40">
              {/* Column 1: Weekly Pace */}
              <div className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium">
                    Weekly Allowance
                  </span>
                  <span className="font-mono text-zinc-500">
                    {activeQuota.billingStage === 'month1'
                      ? `Week ${activeQuota.currentWeekNumber} of 4 • Resets Mon`
                      : 'Month 2+ Paid Volume'}
                  </span>
                </div>
                {activeQuota.billingStage === 'month1' ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
                        {activeQuota.weeklyUsed.toLocaleString()}{' '}
                        <span className="text-xs font-normal text-zinc-400">
                          / {activeQuota.weeklyAllowance.toLocaleString()}
                        </span>
                      </span>
                      <span className="text-xs font-mono text-zinc-600">
                        {balance.weeklyRemaining.toLocaleString()} remaining
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-200/80 overflow-hidden">
                      <div
                        className="h-full bg-zinc-950 rounded-full transition-all duration-300"
                        style={{ width: `${weeklyPct}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-zinc-500 pt-1">
                    $249/mo BYOK active. Pulls deduct from your Tap-Up Balance.
                  </div>
                )}
              </div>

              {/* Column 2: Month 1 Base Pool */}
              <div className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-medium">
                    Month 1 Included Pool
                  </span>
                  <span className="font-mono text-zinc-500">
                    4 Wks × 2,000
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
                    {activeQuota.monthlyBaseUsed.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">
                      / 8,000
                    </span>
                  </span>
                  <span className="text-xs font-mono text-zinc-600">
                    {balance.monthlyBaseRemaining.toLocaleString()} left
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-200/80 overflow-hidden">
                  <div
                    className="h-full bg-zinc-600 rounded-full transition-all duration-300"
                    style={{ width: `${monthlyPct}%` }}
                  />
                </div>
              </div>

              {/* Column 3: Total Available Now + Bonus Credits */}
              <div className="px-6 py-4 flex items-center justify-between gap-4 bg-white">
                <div className="space-y-1">
                  <div className="text-xs text-zinc-400 font-medium flex items-center gap-2">
                    <span>Available to Pull Now</span>
                    {balance.bonusRemaining > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px]">
                        +{balance.bonusRemaining.toLocaleString()} bonus
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-semibold font-mono tracking-tight text-zinc-950">
                    {balance.totalPullableNow.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-zinc-400">
                      records
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTopUpModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-900 text-xs font-semibold text-zinc-900 transition cursor-pointer shrink-0"
                >
                  + Add Volume
                </button>
              </div>
            </div>

            {/* Bottom Navigation Bar */}
            <div className="px-6 py-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('builder')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'builder'
                      ? 'bg-zinc-950 text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Guided List Builder</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('folders')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'folders'
                      ? 'bg-zinc-950 text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>Saved ICP Folders</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                      activeTab === 'folders'
                        ? 'bg-zinc-800 text-white'
                        : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {visibleFolders.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('academy')}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'academy'
                      ? 'bg-zinc-950 text-white'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Training &amp; User Guide</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px]">
                    {completedModules.length}/{TRAINING_MODULES.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span>Synced with</span>
                <Link
                  href="/contacts"
                  className="text-zinc-700 hover:text-zinc-950 font-medium underline decoration-zinc-300"
                >
                  Global Contacts
                </Link>
                <span>&bull;</span>
                <Link
                  href="/cockpit"
                  className="text-zinc-700 hover:text-zinc-950 font-medium underline decoration-zinc-300"
                >
                  Calling Floor
                </Link>
              </div>
            </div>
          </div>

          {/* Feedback Banner after Pulling */}
          {pullBanner && (
            <div
              className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                pullBanner.type === 'success'
                  ? 'bg-white border-zinc-900 text-zinc-900 shadow-xs'
                  : 'bg-red-50 border-red-200 text-red-950'
              }`}
            >
              <div className="flex items-start gap-3 text-xs">
                {pullBanner.type === 'success' ? (
                  <div className="h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-zinc-950">
                    {pullBanner.type === 'success'
                      ? 'List Pulled, Saved to Folder & Distributed Equally'
                      : 'Action Required'}
                  </div>
                  <div className="text-zinc-600 mt-0.5">{pullBanner.message}</div>
                </div>
              </div>
              {pullBanner.type === 'success' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('folders')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-950 text-white hover:bg-zinc-800 cursor-pointer"
                  >
                    Open Folder &rarr;
                  </button>
                  <Link
                    href="/cockpit"
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                  >
                    Go to Calling Floor
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 1: GUIDED 3-STEP ICP LIST BUILDER
          ===================================================================== */}
          {activeTab === 'builder' && (
            <div className="space-y-6">
              {/* Interactive 3-Step Progress Track */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    step: 1 as const,
                    title: 'Step 01 — Define Your ICP',
                    desc: 'Pick a 1-click blueprint or customize titles, industry & location.',
                    badge: industry,
                  },
                  {
                    step: 2 as const,
                    title: 'Step 02 — Preview Market (Free)',
                    desc: 'Verify total addressable market & sample verified profiles at 0 cost.',
                    badge: `${totalMatching.toLocaleString()} matches`,
                  },
                  {
                    step: 3 as const,
                    title: 'Step 03 — Name Folder & Split to Reps',
                    desc: 'Save into a clean folder and distribute equally across your SDRs.',
                    badge: `${pullCount} leads ÷ ${selectedRepsForPull.length || 1} reps`,
                  },
                ].map((s) => {
                  const isCurrent = activeWizardStep === s.step;
                  const isDone = activeWizardStep > s.step;
                  return (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => setActiveWizardStep(s.step)}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isCurrent
                          ? 'bg-zinc-950 text-white border-zinc-950 shadow-sm'
                          : 'bg-white text-zinc-900 border-zinc-200/90 hover:border-zinc-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold tracking-tight ${
                            isCurrent ? 'text-white' : 'text-zinc-900'
                          }`}
                        >
                          {s.title}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                            isCurrent
                              ? 'bg-zinc-800 text-emerald-400'
                              : isDone
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {s.badge}
                        </span>
                      </div>
                      <p
                        className={`text-xs leading-relaxed ${
                          isCurrent ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                      >
                        {s.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* AI Prompt-to-ICP Builder (Gemini) */}
              <div className="bg-zinc-950 text-white rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold">
                    Describe your ideal customer (AI)
                  </span>
                  <span className="text-xs text-zinc-400">
                    AI fills the filters below. Nothing is pulled or charged until you confirm.
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={aiPromptInput}
                    onChange={(e) => setAiPromptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAiPromptParse();
                    }}
                    maxLength={1000}
                    placeholder='e.g. "CEOs and founders of 50-200 seat BPOs in the Philippines and Australia, phone + verified email"'
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={handleAiPromptParse}
                    disabled={aiParsing || !aiPromptInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 text-xs font-bold cursor-pointer shrink-0"
                  >
                    {aiParsing ? 'Interpreting...' : 'Build Filters with AI'}
                  </button>
                </div>
                {aiError && (
                  <div className="text-xs text-red-400">{aiError}</div>
                )}
                {aiInterpretation && (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-300 leading-relaxed">
                      <span className="text-emerald-400 font-semibold">
                        {aiInterpretation.source === 'gemini'
                          ? 'Gemini understood: '
                          : 'Keyword parser understood: '}
                      </span>
                      {aiInterpretation.text}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {[
                        titles && `Titles: ${titles}`,
                        industry && `Industry: ${industry}`,
                        `Size: ${headcountRange}`,
                        country && `Location: ${[country, state, city].filter(Boolean).join(', ')}`,
                        `Seniority: ${selectedSeniorities.join(', ')}`,
                        requirePhone && 'Direct phone',
                        requireVerifiedEmail && 'Verified email',
                      ]
                        .filter(Boolean)
                        .map((chip, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-200"
                          >
                            {chip}
                          </span>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCalculateMarketSize(true)}
                        disabled={sizingLoading}
                        className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        {sizingLoading
                          ? 'Sizing market...'
                          : 'Preview Audience (0 credits)'}
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        Review or edit the filters below first. You can adjust anything.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 1-Click Smart ICP Blueprints Strip */}
              <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-zinc-900" />
                    <span className="text-xs font-bold text-zinc-950">
                      Quick Start: 1-Click Proven ICP Blueprints
                    </span>
                    <span className="text-xs text-zinc-400">
                      (Click any template to auto-configure filters &amp; folder name)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('academy')}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-950 underline cursor-pointer"
                  >
                    New here? Read the 2-minute guide &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {SMART_ICP_BLUEPRINTS.map((bp) => {
                    const selected = activeBlueprintId === bp.id;
                    return (
                      <button
                        key={bp.id}
                        type="button"
                        onClick={() => applySmartBlueprint(bp)}
                        className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                          selected
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : 'bg-zinc-50/70 text-zinc-900 border-zinc-200/80 hover:bg-white hover:border-zinc-400'
                        }`}
                      >
                        <div>
                          <div
                            className={`text-[10px] font-mono uppercase tracking-wider mb-1 ${
                              selected ? 'text-zinc-400' : 'text-zinc-400'
                            }`}
                          >
                            {bp.tag}
                          </div>
                          <div className="text-xs font-bold">{bp.title}</div>
                          <div
                            className={`text-xs mt-1 leading-snug ${
                              selected ? 'text-zinc-300' : 'text-zinc-500'
                            }`}
                          >
                            {bp.subtitle}
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-zinc-200/20 flex items-center justify-between text-[11px] font-mono">
                          <span className={selected ? 'text-zinc-400' : 'text-zinc-500'}>
                            {bp.country}
                          </span>
                          <span
                            className={
                              selected
                                ? 'text-emerald-400 font-semibold'
                                : 'text-zinc-700'
                            }
                          >
                            {selected ? '✓ Active' : 'Apply →'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Instant Single LinkedIn URL Enrich Bar */}
                <div className="pt-3 border-t border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    <Link2 className="w-3.5 h-3.5 text-zinc-900 shrink-0" />
                    <span className="font-semibold text-zinc-900">
                      Instant LinkedIn Profile Enrich:
                    </span>
                    <span className="text-zinc-500">
                      Paste any LinkedIn profile URL to unlock direct phone, verified work email &amp; company website
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <input
                      type="url"
                      value={linkedinUrlInput}
                      onChange={(e) => setLinkedinUrlInput(e.target.value)}
                      placeholder="https://www.linkedin.com/in/derek-gallimore"
                      className="flex-1 md:w-80 px-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50/70 focus:bg-white text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
                    />
                    <button
                      type="button"
                      disabled={enrichingSingleUrl || !linkedinUrlInput.trim()}
                      onClick={handleEnrichSingleLinkedinUrl}
                      className="px-3.5 py-1.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {enrichingSingleUrl ? 'Enriching...' : 'Enrich Profile →'}
                    </button>
                  </div>
                </div>

                {enrichedSingleProspect && (
                  <div className="p-3.5 rounded-xl bg-zinc-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">
                          {enrichedSingleProspect.name}
                        </span>
                        <span className="text-zinc-400">
                          {enrichedSingleProspect.title} @{' '}
                          <strong className="text-zinc-200">
                            {enrichedSingleProspect.company}
                          </strong>
                        </span>
                        <span className="font-mono text-emerald-400">
                          {enrichedSingleProspect.phone}
                        </span>
                        <span className="font-mono text-zinc-300">
                          {enrichedSingleProspect.email}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {enrichedSingleProspect.website && (
                        <a
                          href={enrichedSingleProspect.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-[11px]"
                        >
                          <Globe className="w-3 h-3 text-emerald-400" />
                          <span>{enrichedSingleProspect.companyDomain || 'Website'}</span>
                        </a>
                      )}
                      {enrichedSingleProspect.linkedinUrl && (
                        <a
                          href={enrichedSingleProspect.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-[11px]"
                        >
                          <ExternalLink className="w-3 h-3 text-sky-400" />
                          <span>LinkedIn</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* MAIN WORKSPACE GRID: LEFT = STEP 1 FILTERS, RIGHT = STEP 2 PREVIEW + STEP 3 FOLDER & EQUAL DISTRIBUTION */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT 5 COLS: Step 01 — Precision ICP Parameters */}
                <div
                  className={`lg:col-span-5 bg-white rounded-2xl p-6 space-y-5 border transition ${
                    activeWizardStep === 1
                      ? 'border-zinc-900 ring-1 ring-zinc-900/5 shadow-xs'
                      : 'border-zinc-200/90'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                        Step 01 of 03
                      </span>
                      <h2 className="text-sm font-bold text-zinc-950 mt-0.5">
                        Target Buyer Persona &amp; Firmographics
                      </h2>
                    </div>
                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                      0 Credits to Size
                    </span>
                  </div>

                  {/* Section A: Role & Seniority */}
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-zinc-900">
                        Decision-Maker Job Titles
                      </label>
                      <span className="text-zinc-400">Comma-separated</span>
                    </div>
                    <input
                      type="text"
                      value={titles}
                      onFocus={() => setActiveWizardStep(1)}
                      onChange={(e) => setTitles(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 transition"
                      placeholder="Owner, CEO, President, VP of Sales"
                    />

                    <div>
                      <label className="block font-medium text-zinc-500 mb-1">
                        Exclude Titles (Keep out non-decision makers)
                      </label>
                      <input
                        type="text"
                        value={excludeTitles}
                        onFocus={() => setActiveWizardStep(1)}
                        onChange={(e) => setExcludeTitles(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 bg-zinc-50/30 focus:bg-white text-zinc-700 focus:outline-none focus:border-zinc-900 transition"
                        placeholder="Intern, Assistant, Junior"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-900 mb-2">
                        Seniority Levels
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {SENIORITY_OPTIONS.map((sen) => {
                          const active = selectedSeniorities.includes(sen);
                          return (
                            <button
                              key={sen}
                              type="button"
                              onClick={() => {
                                setActiveWizardStep(1);
                                toggleSeniority(sen);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                                active
                                  ? 'bg-zinc-950 text-white border-zinc-950'
                                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                              }`}
                            >
                              {sen}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Section B: Company Industry & Size */}
                  <div className="pt-4 border-t border-zinc-100 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-zinc-900 mb-1">
                          Industry Vertical
                        </label>
                        <select
                          value={industry}
                          onChange={(e) => {
                            setActiveWizardStep(1);
                            setIndustry(e.target.value);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:border-zinc-900"
                        >
                          {INDUSTRY_PRESETS.map((ind) => (
                            <option key={ind} value={ind}>
                              {ind}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-zinc-900 mb-1">
                          Company Headcount
                        </label>
                        <select
                          value={headcountRange}
                          onChange={(e) => {
                            setActiveWizardStep(1);
                            setHeadcountRange(e.target.value);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:border-zinc-900"
                        >
                          {HEADCOUNT_OPTIONS.map((hc) => (
                            <option key={hc} value={hc}>
                              {hc}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Section C: Geography & Tech Stack */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-zinc-900 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white text-zinc-900"
                          placeholder="United States"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-zinc-900 mb-1">
                          State / Province
                        </label>
                        <input
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white text-zinc-900"
                          placeholder="Texas"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-zinc-600 mb-1">
                          City (Optional)
                        </label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white text-zinc-900"
                          placeholder="Austin, Dallas"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-zinc-600 mb-1">
                          Tech Stack Signals
                        </label>
                        <input
                          type="text"
                          value={technologies}
                          onChange={(e) => setTechnologies(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50/50 focus:bg-white text-zinc-900"
                          placeholder="HubSpot, Salesforce"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section D: Quality Guardrails */}
                  <div className="pt-4 border-t border-zinc-100 space-y-2 text-xs">
                    <div className="font-semibold text-zinc-900 mb-1">
                      Calling Floor &amp; Email Quality Gates
                    </div>
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 cursor-pointer">
                      <span className="text-zinc-700 font-medium">
                        Require Callable Direct / Mobile Phone
                      </span>
                      <input
                        type="checkbox"
                        checked={requirePhone}
                        onChange={(e) => setRequirePhone(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 cursor-pointer">
                      <span className="text-zinc-700 font-medium">
                        Require Verified Work Email
                      </span>
                      <input
                        type="checkbox"
                        checked={requireVerifiedEmail}
                        onChange={(e) => setRequireVerifiedEmail(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 cursor-pointer">
                      <span className="text-zinc-700 font-medium">
                        Exclude Previously Pulled Workspace Leads
                      </span>
                      <input
                        type="checkbox"
                        checked={excludePreviouslyPulled}
                        onChange={(e) =>
                          setExcludePreviouslyPulled(e.target.checked)
                        }
                        className="rounded border-zinc-300"
                      />
                    </label>
                  </div>

                  {/* Step 1 Action CTA */}
                  <button
                    type="button"
                    disabled={sizingLoading}
                    onClick={() => handleCalculateMarketSize(true)}
                    className="w-full py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${sizingLoading ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {sizingLoading
                        ? 'Calculating Addressable Market...'
                        : 'Step 2: Calculate Market Size & Preview (0 Credits) →'}
                    </span>
                  </button>
                </div>

                {/* RIGHT 7 COLS: Step 02 (Market Sizing & Preview) + Step 03 (Folder & Equal Rep Distribution) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* STEP 02 CARD: Live Market Sizing & Breakdown */}
                  <div
                    className={`bg-white rounded-2xl p-6 space-y-5 border transition ${
                      activeWizardStep === 2
                        ? 'border-zinc-900 ring-1 ring-zinc-900/5 shadow-xs'
                        : 'border-zinc-200/90'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                          Step 02 of 03 &bull; Free Market Sizing
                        </span>
                        <h3 className="text-sm font-bold text-zinc-950 mt-0.5">
                          Verified Addressable Market &amp; Sample Preview
                        </h3>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-mono font-bold text-zinc-950">
                          {totalMatching.toLocaleString()}
                        </span>
                        <span className="text-xs text-zinc-500">
                          verified decision-makers
                        </span>
                      </div>
                    </div>

                    {/* Visual Breakdown Bars */}
                    {breakdowns && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60 space-y-2">
                          <div className="font-semibold text-zinc-700">
                            Distribution by Vertical
                          </div>
                          {breakdowns.byIndustry.map((item, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-zinc-600">
                                <span className="truncate pr-2">{item.label}</span>
                                <span className="font-mono text-zinc-900">
                                  {item.pct}%
                                </span>
                              </div>
                              <div className="w-full h-1 rounded-full bg-zinc-200">
                                <div
                                  className="h-full bg-zinc-900 rounded-full"
                                  style={{ width: `${item.pct}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="p-3.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60 space-y-2">
                          <div className="font-semibold text-zinc-700">
                            Distribution by Headcount
                          </div>
                          {breakdowns.byHeadcount.map((item, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-zinc-600">
                                <span className="truncate pr-2">{item.label}</span>
                                <span className="font-mono text-zinc-900">
                                  {item.pct}%
                                </span>
                              </div>
                              <div className="w-full h-1 rounded-full bg-zinc-200">
                                <div
                                  className="h-full bg-zinc-900 rounded-full"
                                  style={{ width: `${item.pct}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 25-Per-Page Paginated Preview Table */}
                    <div className="border border-zinc-200/80 rounded-xl overflow-hidden select-none">
                      <div className="bg-zinc-50 px-4 py-2.5 border-b border-zinc-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-700">
                            Matching Profiles — Page {previewPage} ({previewProspects.length} of 25 per page)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={previewPage <= 1 || sizingLoading}
                            onClick={handlePrevPreviewPage}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            &larr; Prev 25
                          </button>
                          <span className="font-mono text-zinc-500">
                            Page {previewPage}
                          </span>
                          <button
                            type="button"
                            disabled={!nextCursor || sizingLoading}
                            onClick={handleNextPreviewPage}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            Next 25 &rarr;
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveWizardStep(3)}
                            className="ml-2 font-semibold text-zinc-950 hover:underline cursor-pointer"
                          >
                            Proceed to Step 3 &darr;
                          </button>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-zinc-100 text-zinc-400 font-normal">
                              <th className="py-2.5 px-4 font-normal">#</th>
                              <th className="py-2.5 px-4 font-normal">
                                Decision Maker &amp; LinkedIn
                              </th>
                              <th className="py-2.5 px-4 font-normal">
                                Company &amp; Website
                              </th>
                              <th className="py-2.5 px-4 font-normal">Location</th>
                              <th className="py-2.5 px-4 font-normal text-right">
                                Verified Channels
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {previewProspects.slice(0, 25).map((p, idx) => (
                              <tr key={p.id} className="hover:bg-zinc-50/60">
                                <td className="py-2.5 px-4 font-mono text-zinc-400">
                                  {(previewPage - 1) * 25 + idx + 1}
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-zinc-900">
                                      {p.name}
                                    </span>
                                    {p.linkedinUrl && (
                                      <a
                                        href={p.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Open ${p.name}'s LinkedIn Profile`}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-mono text-[10px]"
                                      >
                                        <span>in</span>
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-zinc-500">{p.title}</div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="font-medium text-zinc-800">
                                    {p.company}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {p.website ? (
                                      <a
                                        href={p.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-950 font-mono text-[11px] underline decoration-zinc-300"
                                      >
                                        <Globe className="w-3 h-3 text-zinc-400" />
                                        <span>
                                          {p.companyDomain ||
                                            p.website.replace(/^https?:\/\//, '')}
                                        </span>
                                      </a>
                                    ) : (
                                      <span className="text-zinc-400 font-mono">
                                        {p.headcount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-zinc-600">
                                  {p.location}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <PhoneCall className="w-3 h-3" />
                                    <Mail className="w-3 h-3" />
                                    <span>Ready</span>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Bottom Pagination Bar (25 Results Per Page) */}
                      <div className="bg-zinc-50 px-4 py-2.5 border-t border-zinc-200/80 flex items-center justify-between text-xs">
                        <span className="text-zinc-500 font-mono">
                          Showing rows {(previewPage - 1) * 25 + 1}–
                          {(previewPage - 1) * 25 + previewProspects.slice(0, 25).length} (25 per page)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={previewPage <= 1 || sizingLoading}
                            onClick={handlePrevPreviewPage}
                            className="px-3 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            &larr; Previous 25
                          </button>
                          <button
                            type="button"
                            disabled={!nextCursor || sizingLoading}
                            onClick={handleNextPreviewPage}
                            className="px-3 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            Next 25 Results &rarr;
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 03 CARD: Name Folder & Equal Round-Robin Rep Distribution */}
                  <div
                    className={`bg-white rounded-2xl p-6 space-y-5 border transition ${
                      activeWizardStep === 3
                        ? 'border-zinc-950 ring-1 ring-zinc-950/10 shadow-sm'
                        : 'border-zinc-200/90'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-100">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                          Step 03 of 03 &bull; Folder &amp; Equal Team Split
                        </span>
                        <h3 className="text-sm font-bold text-zinc-950 mt-0.5">
                          Save to Named Folder &amp; Distribute Equally Across X Reps
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-zinc-500">
                        {balance.totalPullableNow.toLocaleString()} records available
                      </span>
                    </div>

                    {canBuildAndDistribute ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-zinc-900 mb-1.5">
                              1. Name Your Campaign Folder
                            </label>
                            <input
                              type="text"
                              value={folderNameInput}
                              onFocus={() => setActiveWizardStep(3)}
                              onChange={(e) => setFolderNameInput(e.target.value)}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-zinc-900 font-medium focus:outline-none focus:border-zinc-950"
                              placeholder="e.g. Texas Commercial HVAC Owners — Q4"
                            />
                            <p className="text-zinc-400 mt-1">
                              Appears in Saved ICP Folders and in the Global Contacts folder filter.
                            </p>
                          </div>

                          <div>
                            <label className="block font-semibold text-zinc-900 mb-1.5">
                              2. Batch Size to Pull
                            </label>
                            <select
                              value={pullCount}
                              onFocus={() => setActiveWizardStep(3)}
                              onChange={(e) => setPullCount(Number(e.target.value))}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-zinc-950 font-mono font-bold bg-white focus:outline-none focus:border-zinc-950"
                            >
                              <option value={25}>25 Records (1 Page)</option>
                              <option value={50}>50 Records (2 Pages)</option>
                              <option value={100}>100 Records (4 Pages)</option>
                              <option value={250}>250 Records</option>
                              <option value={500}>500 Records</option>
                              <option value={1000}>1,000 Records</option>
                            </select>
                          </div>
                        </div>

                        {/* Visual Equal Round-Robin Split Configurator */}
                        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3.5 text-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-zinc-950">
                                3. Select SDR Reps for Equal Round-Robin Distribution
                              </div>
                              <div className="text-zinc-500 mt-0.5">
                                {selectedRepsForPull.length > 0 ? (
                                  <>
                                    Splitting <strong>{pullCount} leads</strong>{' '}
                                    equally across{' '}
                                    <strong>{selectedRepsForPull.length} reps</strong>{' '}
                                    ={' '}
                                    <strong className="text-zinc-950 font-mono">
                                      ~
                                      {Math.floor(
                                        pullCount / selectedRepsForPull.length
                                      )}{' '}
                                      leads per rep
                                    </strong>
                                  </>
                                ) : (
                                  'Select at least 1 rep to receive this folder'
                                )}
                              </div>
                            </div>

                            {/* Add Rep to Roster */}
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={newRepInput}
                                onChange={(e) => setNewRepInput(e.target.value)}
                                placeholder="Add rep name..."
                                className="px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs text-zinc-900 w-36 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={handleAddRepToRoster}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-950 text-white font-semibold cursor-pointer"
                              >
                                <UserPlus className="w-3 h-3" />
                                <span>Add</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(activeQuota.repsRoster || []).map((rep) => {
                              const isChecked = selectedRepsForPull.includes(rep);
                              const sliceCount =
                                isChecked && selectedRepsForPull.length > 0
                                  ? Math.floor(
                                      pullCount / selectedRepsForPull.length
                                    )
                                  : 0;
                              return (
                                <button
                                  key={rep}
                                  type="button"
                                  onClick={() => toggleRepForPull(rep)}
                                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                                    isChecked
                                      ? 'bg-zinc-950 text-white border-zinc-950'
                                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                        isChecked
                                          ? 'bg-emerald-500 border-emerald-500 text-white'
                                          : 'border-zinc-300'
                                      }`}
                                    >
                                      {isChecked && <Check className="w-3 h-3" />}
                                    </span>
                                    <span className="font-medium truncate">
                                      {rep}
                                    </span>
                                  </div>
                                  <span
                                    className={`font-mono text-xs px-2 py-0.5 rounded ${
                                      isChecked
                                        ? 'bg-zinc-800 text-emerald-400 font-semibold'
                                        : 'text-zinc-400'
                                    }`}
                                  >
                                    {isChecked ? `${sliceCount} leads` : 'Skipped'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Final Pull CTA */}
                        <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span>
                              Reps will see their assigned slice on the Calling Floor (CSV export locked).
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={pullingList}
                            onClick={handlePullAndDistribute}
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {pullingList
                                ? `Pulling & Distributing ${pullCount} Leads...`
                                : `Pull ${pullCount} Verified Leads & Distribute Equally`}
                            </span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span>
                          List pulling and folder distribution are managed by your Account Administrator. Open the <strong>Saved ICP Folders</strong> tab above to dial leads assigned to you.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              TAB 2: SAVED ICP FOLDERS & EQUAL REP DISTRIBUTION
          ===================================================================== */}
          {activeTab === 'folders' && (
            <div className="space-y-4">
              {visibleFolders.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3">
                  <FolderKanban className="w-8 h-8 text-zinc-400 mx-auto" />
                  <div className="text-sm font-bold text-zinc-950">
                    No ICP Folders Created Yet
                  </div>
                  <p className="text-xs text-zinc-500 max-w-md mx-auto">
                    Use the Guided List Builder tab to pull your first verified list into a named folder and split it equally across your reps.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('builder')}
                    className="px-4 py-2 rounded-xl bg-zinc-950 text-white text-xs font-semibold cursor-pointer"
                  >
                    Build Your First Folder &rarr;
                  </button>
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
                      className="bg-white border border-zinc-200/90 rounded-2xl overflow-hidden shadow-2xs"
                    >
                      <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="px-3 py-1 rounded-lg bg-zinc-950 text-white text-xs font-bold flex items-center gap-2">
                              <FolderKanban className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{folder.name}</span>
                            </span>
                            <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-900">
                              {role === 'Rep'
                                ? `${folderContacts.length} Assigned to You`
                                : `${folder.totalLeads} Verified Leads`}
                            </span>
                            {bookedCount > 0 && (
                              <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {bookedCount} Booked
                              </span>
                            )}
                            <span className="text-xs text-zinc-400">
                              Created {new Date(folder.createdAt).toLocaleDateString()}{' '}
                              by {folder.createdBy}
                            </span>
                          </div>

                          {/* Folder ICP Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-zinc-400">ICP Contents:</span>
                            {folder.filtersSummary.industry && (
                              <span className="px-2 py-0.5 rounded bg-zinc-50 text-zinc-700 border border-zinc-200/80">
                                {folder.filtersSummary.industry}
                              </span>
                            )}
                            {folder.filtersSummary.titles && (
                              <span className="px-2 py-0.5 rounded bg-zinc-50 text-zinc-700 border border-zinc-200/80">
                                {folder.filtersSummary.titles}
                              </span>
                            )}
                            {folder.filtersSummary.headcount && (
                              <span className="px-2 py-0.5 rounded bg-zinc-50 text-zinc-700 border border-zinc-200/80">
                                {folder.filtersSummary.headcount}
                              </span>
                            )}
                            {folder.filtersSummary.location && (
                              <span className="px-2 py-0.5 rounded bg-zinc-50 text-zinc-700 border border-zinc-200/80">
                                {folder.filtersSummary.location}
                              </span>
                            )}
                          </div>

                          {/* Equal Rep Distribution Breakdown */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-xs text-zinc-400">
                              Equal Rep Split ({folder.distributedReps.length} Reps):
                            </span>
                            {folder.distributedReps.map((slice) => (
                              <span
                                key={slice.repName}
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-50 border border-zinc-200 text-xs text-zinc-800"
                              >
                                <Users className="w-3 h-3 text-zinc-400" />
                                <span>{slice.repName}:</span>
                                <strong className="font-mono text-zinc-950">
                                  {slice.leadCount}
                                </strong>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Folder Actions */}
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFolderId(isExpanded ? null : folder.id)
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>
                              {isExpanded
                                ? 'Hide Leads'
                                : `Inspect Leads (${folderContacts.length})`}
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-zinc-300 text-zinc-800 hover:bg-zinc-50 transition cursor-pointer"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>Re-Distribute Equally</span>
                            </button>
                          )}

                          {canExport ? (
                            <button
                              type="button"
                              onClick={() =>
                                exportContactsToCsv(folderContacts, folder.name)
                              }
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-950 text-white hover:bg-zinc-800 transition cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Export CSV</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-100 border border-zinc-200 text-zinc-500 select-none">
                              <Lock className="w-3.5 h-3.5 text-zinc-400" />
                              <span>CSV Locked (Admin Only)</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {isExpanded && (() => {
                        const PAGE_SIZE = 25;
                        const currentFolderPage = folderPageMap[folder.id] || 1;
                        const totalFolderPages = Math.max(
                          1,
                          Math.ceil(folderContacts.length / PAGE_SIZE)
                        );
                        const safePage = Math.min(
                          currentFolderPage,
                          totalFolderPages
                        );
                        const pageSlice = folderContacts.slice(
                          (safePage - 1) * PAGE_SIZE,
                          safePage * PAGE_SIZE
                        );

                        return (
                          <div
                            className={`border-t border-zinc-100 overflow-x-auto ${
                              !canExport ? 'select-none' : ''
                            }`}
                          >
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-zinc-50/70 border-b border-zinc-100 text-zinc-400 font-normal">
                                  <th className="py-2.5 px-5 font-normal">#</th>
                                  <th className="py-2.5 px-5 font-normal">ID</th>
                                  <th className="py-2.5 px-5 font-normal">
                                    Decision Maker &amp; LinkedIn
                                  </th>
                                  <th className="py-2.5 px-5 font-normal">
                                    Company &amp; Website
                                  </th>
                                  <th className="py-2.5 px-5 font-normal">
                                    Direct Phone &amp; Email
                                  </th>
                                  <th className="py-2.5 px-5 font-normal">
                                    Assigned Rep
                                  </th>
                                  <th className="py-2.5 px-5 font-normal text-right">
                                    Calling Floor
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {pageSlice.map((lead, idx) => (
                                  <tr key={lead.id} className="hover:bg-zinc-50/60">
                                    <td className="py-3 px-5 font-mono text-zinc-400">
                                      {(safePage - 1) * PAGE_SIZE + idx + 1}
                                    </td>
                                    <td className="py-3 px-5 font-mono text-zinc-400">
                                      {lead.id}
                                    </td>
                                    <td className="py-3 px-5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-zinc-900">
                                          {lead.name}
                                        </span>
                                        {lead.linkedinUrl && (
                                          <a
                                            href={lead.linkedinUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={`Open ${lead.name}'s LinkedIn Profile`}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-mono text-[10px]"
                                          >
                                            <span>LinkedIn</span>
                                            <ExternalLink className="w-2.5 h-2.5" />
                                          </a>
                                        )}
                                      </div>
                                      <div className="text-zinc-500">{lead.title}</div>
                                    </td>
                                    <td className="py-3 px-5">
                                      <div className="font-medium text-zinc-800">
                                        {lead.company}
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {lead.website ? (
                                          <a
                                            href={
                                              lead.website.startsWith('http')
                                                ? lead.website
                                                : `https://${lead.website}`
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-950 font-mono text-[11px] underline decoration-zinc-300"
                                          >
                                            <Globe className="w-3 h-3 text-zinc-400" />
                                            <span>
                                              {lead.website.replace(/^https?:\/\//, '')}
                                            </span>
                                          </a>
                                        ) : (
                                          <span className="text-zinc-400">
                                            {lead.industry || lead.headcount}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-5 font-mono">
                                      <div className="text-zinc-900 font-medium">
                                        {lead.phone}
                                      </div>
                                      <div className="text-zinc-500">{lead.email}</div>
                                    </td>
                                    <td className="py-3 px-5">
                                      {canBuildAndDistribute ? (
                                        <select
                                          value={lead.assignedRep || 'Emil Halili'}
                                          onChange={(e) => {
                                            reassignContactToRep(
                                              lead.id,
                                              e.target.value,
                                              repName || role,
                                              role
                                            );
                                            setContacts(getStoredContacts());
                                            setFolders(getStoredFolders());
                                          }}
                                          className="px-2.5 py-1 rounded-md bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 font-semibold text-xs cursor-pointer focus:outline-none focus:border-zinc-900"
                                        >
                                          {Array.from(
                                            new Set([
                                              ...(activeQuota.repsRoster || []),
                                              lead.assignedRep || 'Emil Halili',
                                            ])
                                          ).map((r) => (
                                            <option key={r} value={r}>
                                              👤 {r}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="px-2.5 py-0.5 rounded-md bg-zinc-100 text-zinc-800 font-medium">
                                          {lead.assignedRep}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-5 text-right">
                                      <Link
                                        href="/cockpit"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 text-white font-semibold hover:bg-zinc-800"
                                      >
                                        <PhoneCall className="w-3 h-3 text-emerald-400" />
                                        <span>Dial Now</span>
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* 25-Per-Page Folder Footer Pagination */}
                            <div className="bg-zinc-50/80 px-5 py-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                              <span className="text-zinc-500 font-mono">
                                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                                {(safePage - 1) * PAGE_SIZE + pageSlice.length} of{' '}
                                {folderContacts.length} leads (25 per page)
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={safePage <= 1}
                                  onClick={() =>
                                    setFolderPageMap((prev) => ({
                                      ...prev,
                                      [folder.id]: Math.max(1, safePage - 1),
                                    }))
                                  }
                                  className="px-3 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold disabled:opacity-40 cursor-pointer"
                                >
                                  &larr; Prev 25
                                </button>
                                <span className="font-mono text-zinc-600">
                                  Page {safePage} of {totalFolderPages}
                                </span>
                                <button
                                  type="button"
                                  disabled={safePage >= totalFolderPages}
                                  onClick={() =>
                                    setFolderPageMap((prev) => ({
                                      ...prev,
                                      [folder.id]: Math.min(
                                        totalFolderPages,
                                        safePage + 1
                                      ),
                                    }))
                                  }
                                  className="px-3 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white font-semibold disabled:opacity-40 cursor-pointer"
                                >
                                  Next 25 &rarr;
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* =====================================================================
              TAB 3: BUILT-IN INTERACTIVE TRAINING MODULE & USER GUIDE
          ===================================================================== */}
          {activeTab === 'academy' && (
            <div className="space-y-6">
              {/* Academy Header Banner */}
              <div className="bg-zinc-950 text-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-zinc-800 text-emerald-400 text-xs font-mono">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>SELF-SERVE ONBOARDING ACADEMY</span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">
                    How to Build, Organize &amp; Distribute High-Converting ICP Lists
                  </h2>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Complete these 4 short walkthrough modules (under 3 minutes total) to master zero-cost market sizing, folder organization, equal round-robin rep distribution, and data security.
                  </p>
                </div>

                {/* Progress Meter */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 min-w-[220px] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Training Progress</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {completedModules.length} / {TRAINING_MODULES.length} Completed
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{
                        width: `${
                          (completedModules.length / TRAINING_MODULES.length) * 100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="text-xs text-zinc-500">
                    Click &ldquo;Mark Complete&rdquo; or &ldquo;Practice Step&rdquo; on each module below.
                  </div>
                </div>
              </div>

              {/* 4 Interactive Step-by-Step Training Modules */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {TRAINING_MODULES.map((mod) => {
                  const isDone = completedModules.includes(mod.id);
                  return (
                    <div
                      key={mod.id}
                      className={`bg-white rounded-2xl p-6 border transition flex flex-col justify-between space-y-5 ${
                        isDone ? 'border-zinc-300' : 'border-zinc-200/90'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded bg-zinc-950 text-white font-mono text-[10px] font-bold">
                              {mod.stepNumber}
                            </span>
                            <span className="text-xs font-mono text-zinc-400">
                              {mod.duration}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleModuleComplete(mod.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                              isDone
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:text-zinc-900'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isDone ? 'Completed' : 'Mark Complete'}</span>
                          </button>
                        </div>

                        <h3 className="text-base font-bold text-zinc-950">
                          {mod.title}
                        </h3>
                        <p className="text-xs text-zinc-600 leading-relaxed">
                          {mod.summary}
                        </p>

                        <div className="space-y-2 pt-1">
                          {mod.keyTakeaways.map((point, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-xs text-zinc-700"
                            >
                              <span className="w-4 h-4 rounded-full bg-zinc-100 text-zinc-900 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>
                              <span className="leading-relaxed">{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 pt-4 border-t border-zinc-100">
                        <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60 text-xs text-zinc-600">
                          <strong className="text-zinc-900">Pro Tip:</strong>{' '}
                          {mod.proTip}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!completedModules.includes(mod.id)) {
                              toggleModuleComplete(mod.id);
                            }
                            setActiveTab(mod.targetTab);
                            if (mod.targetWizardStep) {
                              setActiveWizardStep(mod.targetWizardStep);
                            }
                          }}
                          className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{mod.actionLabel} &rarr;</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Frequently Asked Questions Accordion */}
              <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-zinc-900" />
                  <h3 className="text-sm font-bold text-zinc-950">
                    Frequently Asked Questions (Quick Reference)
                  </h3>
                </div>

                <div className="divide-y divide-zinc-100">
                  {TRAINING_FAQS.map((faq, idx) => {
                    const isOpen = openFaqIdx === idx;
                    return (
                      <div key={idx} className="py-3.5">
                        <button
                          type="button"
                          onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                          className="w-full text-left flex items-center justify-between gap-4 text-xs font-semibold text-zinc-900 cursor-pointer"
                        >
                          <span>{faq.q}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <p className="mt-2 text-xs text-zinc-600 leading-relaxed pr-6">
                            {faq.a}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
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
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-medium mt-2">
                  Splitting <strong>{redistributeFolder.totalLeads}</strong> leads
                  equally across <strong>{redistributeReps.length}</strong> rep(s) ={' '}
                  <strong>
                    ~
                    {Math.floor(
                      redistributeFolder.totalLeads / redistributeReps.length
                    )}{' '}
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

      {/* Modal: Tap Up Quota (+2k/$50, +5k/$75, +10k/$150) */}
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
