'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  FolderKanban,
  FolderPlus,
  Users,
  Download,
  Lock,
  Sparkles,
  CheckCircle2,
  PhoneCall,
  Mail,
  SlidersHorizontal,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
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
import { useSession, canUserReassignLeads, canUserAccessIcpBuilder } from '@/lib/session';
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
  isContactAssignedTo,
} from '@/lib/leadStore';
import {
  TenantQuotaState,
  getTenantQuota,
  getAllTenantQuotas,
  getAvailablePullBalance,
  deductTenantQuota,
  updateTenantRepsRoster,
  normalizeTenantKey,
  getSuperAdminMasterDataKey,
  subscribeToQuotaStore,
} from '@/lib/icpQuotaStore';
import { can } from '@/lib/permissions';
import type { SanitizedIcpProspect, IcpPullStreamEvent } from '@/app/api/intelligence/icp/route';
import QuotaTopUpModal from './QuotaTopUpModal';
import PullProgressPanel, { type PullProgressPanelProps } from './PullProgressPanel';
import { useIcpTargetTenant } from './LeadCreditsAdmin';
import { Button, Badge, Dialog, Meter, PageHeader, buttonClasses } from '@/components/ui';
import { isDemoWorkspace } from '@/lib/demoMode';
import { useServerAuth } from '@/lib/authClient';

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

type PullStreamFinal = { success?: boolean; error?: string; prospects?: SanitizedIcpProspect[] } & Record<string, unknown>;

/**
 * Reads the NDJSON pull stream from POST /api/intelligence/icp. Calls `onProgress` for each
 * progress event and resolves with the same object the JSON path returns: the `result` body, or
 * `{ success: false, error }` for an `error` event.
 */
async function readPullStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (event: Extract<IcpPullStreamEvent, { type: 'stage' | 'found' | 'enriched' }>) => void
): Promise<PullStreamFinal> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let final: PullStreamFinal | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let evt: IcpPullStreamEvent;
    try {
      evt = JSON.parse(trimmed) as IcpPullStreamEvent;
    } catch {
      return; // ignore a malformed line rather than failing the whole pull
    }
    if (evt.type === 'result') {
      const rest: PullStreamFinal = { ...evt };
      delete rest.type;
      final = rest;
    } else if (evt.type === 'error') {
      final = { success: false, error: evt.error, status: evt.status };
    } else if (evt.type === 'stage' || evt.type === 'found' || evt.type === 'enriched') {
      onProgress(evt);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let nl = buffered.indexOf('\n');
      while (nl !== -1) {
        handleLine(buffered.slice(0, nl));
        buffered = buffered.slice(nl + 1);
        nl = buffered.indexOf('\n');
      }
    }
    buffered += decoder.decode();
    handleLine(buffered);
  } finally {
    reader.releaseLock();
  }

  if (!final) {
    throw new Error('The connection to the data cloud dropped before the list finished. Please retry.');
  }
  return final;
}

export default function IcpListBuilderHub() {
  const { session, role, canAccessIcp, tenantName, repName, email } = useSession();
  // Workspace setting (Admin > Branding & domains): Lead Finder progress animation style.
  const { identity } = useServerAuth();
  const pullStyle: PullProgressPanelProps['pullStyle'] =
    identity?.branding?.leadFinderAnimation === 'professional' ? 'professional' : 'playful';
  const isSuperAdmin = role === 'Super Admin';
  const canExport = canUserExportCsv(role);
  const canBuildAndDistribute = canUserReassignLeads(role);
  const canOpenAdmin = can(role, 'admin');

  // Active target tenant (Super Admin picks it in Admin > Lead credits & quota)
  const [targetTenantCode] = useIcpTargetTenant(
    isSuperAdmin,
    normalizeTenantKey(session.tenantCode || tenantName)
  );

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
  // The demo workspace shows the first module done; real workspaces start with none completed.
  const [completedModules, setCompletedModules] = useState<string[]>(() => (isDemoWorkspace() ? ['mod_1'] : []));
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

  // Top-up modal state (opens automatically when a pull exceeds the available balance)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);

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
  // The provider's own count of matching people; null until a preview ran or when it gave no total.
  const [totalMatching, setTotalMatching] = useState<number | null>(null);
  const [previewProspects, setPreviewProspects] = useState<SanitizedIcpProspect[]>([]);
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [cursorHistory, setCursorHistory] = useState<string[]>(['']); // index 0 = '' (page 1)
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<{
    byIndustry: { label: string; count: number | null; pct: number }[];
    byHeadcount: { label: string; count: number | null; pct: number }[];
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
  // Live pull progress (fed by the NDJSON stream); null when no pull is on screen.
  const [pullProgress, setPullProgress] = useState<Omit<PullProgressPanelProps, 'onDismiss' | 'className'> | null>(null);
  const pullProgressTimerRef = useRef<number | null>(null);
  const pullBannerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => {
    if (pullProgressTimerRef.current) window.clearTimeout(pullProgressTimerRef.current);
  }, []);

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
        setTotalMatching(typeof data.totalMatching === 'number' ? data.totalMatching : null);
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
      } else {
        // Say why the preview failed (provider allowance, rate limit, outage...) instead of nothing.
        setPullBanner({
          type: 'error',
          message: typeof data.error === 'string' && data.error ? data.error : 'Could not load the preview. Please try again.',
        });
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
        message: `Enriched ${data.prospect.name} (${data.prospect.title} @ ${data.prospect.company}) • Website: ${data.prospect.website || 'N/A'} • Email: ${data.prospect.email || 'no verified email'} • Phone: ${data.prospect.phone || 'none'}`,
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
        message: `Your workspace has ${balance.totalPullableNow.toLocaleString()} records available right now, which is less than the requested ${pullCount.toLocaleString()} records. Top up your quota to add records.`,
      });
      setIsTopUpModalOpen(true);
      return;
    }

    if (pullProgressTimerRef.current) {
      window.clearTimeout(pullProgressTimerRef.current);
      pullProgressTimerRef.current = null;
    }
    setPullingList(true);
    setPullBanner(null);
    // Every number on the progress panel comes from a server event; nothing is estimated.
    let livePhase: PullProgressPanelProps['phase'] = 'connecting';
    const patchProgress = (patch: Partial<Omit<PullProgressPanelProps, 'onDismiss' | 'className'>>) => {
      if (patch.phase) livePhase = patch.phase;
      setPullProgress((prev) => (prev ? { ...prev, ...patch } : prev));
    };
    const failProgress = (message: string) => {
      const failedPhase = livePhase;
      setPullProgress((prev) => (prev ? { ...prev, phase: 'error', error: message, failedPhase } : prev));
    };
    setPullProgress({
      phase: 'connecting',
      requested: pullCount,
      found: null,
      totalMatching: null,
      searchComplete: false,
      done: 0,
      total: 0,
      withEmail: 0,
      withPhone: 0,
      savedCount: null,
      folderName: folderNameInput.trim(),
      error: null,
      failedPhase: null,
      startedAt: Date.now(),
      lastLead: null,
    });

    try {
      const res = await fetch('/api/intelligence/icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'pull',
          stream: true,
          tenantCode: activeQuota.tenantCode,
          pullCount,
          // The server pages through the provider up to pullCount, but never past this balance.
          maxRecords: balance.totalPullableNow,
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

      // Streamed progress (NDJSON) when the server supports it; plain JSON otherwise (older
      // server, auth errors, proxies that strip the stream). Both end in the same `data` shape.
      const contentType = res.headers.get('content-type') || '';
      const data =
        res.body && contentType.includes('application/x-ndjson')
          ? await readPullStream(res.body, (evt) => {
              if (evt.type === 'stage') {
                patchProgress({ phase: 'searching' });
              } else if (evt.type === 'found') {
                // Large pulls arrive in batches: `count` is the running total, `planned` the
                // whole request (exact once the search is complete).
                patchProgress({
                  found: evt.count,
                  totalMatching: evt.totalMatching,
                  total: evt.planned ?? evt.count,
                  searchComplete: evt.complete ?? true,
                  ...(evt.count > 0 ? { phase: 'enriching' as const } : {}),
                });
              } else if (evt.type === 'enriched') {
                patchProgress({
                  phase: 'enriching',
                  done: evt.done,
                  total: evt.total,
                  withEmail: evt.withEmail,
                  withPhone: evt.withPhone,
                  lastLead: evt.lastLead ?? null,
                });
              }
            })
          : await res.json();

      if (!res.ok || !data.success || !Array.isArray(data.prospects)) {
        throw new Error(data.error || 'Failed to pull ICP records');
      }

      patchProgress({ phase: 'saving' });
      // Let the "Saving" step paint before the (synchronous) save below.
      await new Promise((resolve) => window.setTimeout(resolve, 50));

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
        failProgress(deduction.error || 'Quota limit reached.');
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
        // Only what the provider returned; empty fields are left out rather than guessed.
        leadNotes: [
          'ICP Cloud Verified Record',
          p.industry ? `Industry: ${p.industry}` : '',
          p.location ? `Location: ${p.location}` : '',
          p.technologies?.length ? `Tech Stack: ${p.technologies.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
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
        message: `Pulled ${pulledProspects.length} verified records into folder "${folder.name}" and distributed equally across ${targetReps.length} rep(s) (~${perRepCount} leads/rep). Synced to Global Contacts & Calling Floor.${
          typeof data.notice === 'string' && data.notice ? ` ${data.notice}` : ''
        }`,
        folderId: folder.id,
      });
      patchProgress({ phase: 'done', savedCount: pulledProspects.length, folderName: folder.name });
      // Brief success state on the panel, then hand over to the success banner above.
      pullProgressTimerRef.current = window.setTimeout(() => {
        pullProgressTimerRef.current = null;
        setPullProgress((prev) => (prev && prev.phase === 'done' ? null : prev));
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        pullBannerRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      }, 2600);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to pull list.';
      setPullBanner({
        type: 'error',
        message,
      });
      failProgress(message);
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
        return f.distributedReps.some((r) =>
          isContactAssignedTo({ assignedRep: r.repName }, { repName, email })
        );
      }
      return true;
    });
  }, [folders, activeQuota.tenantCode, isSuperAdmin, role, repName, email]);

  const getFolderContacts = (folderId: string): ContactRecord[] => {
    return contacts.filter((c) => {
      if (c.folderId !== folderId) return false;
      if (role === 'Rep') {
        return isContactAssignedTo(c, { repName, email });
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

  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {!canAccessIcp ? (
          <main className="flex-1 overflow-y-auto px-4 py-12 md:px-8 max-w-2xl w-full mx-auto flex items-center justify-center">
            <div className="bg-surface border border-line rounded-lg p-8 text-center space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-subtle border border-line flex items-center justify-center mx-auto">
                <Lock className="w-5 h-5 text-fg-secondary" />
              </div>
              <div className="space-y-1.5">
                <div className="text-caption text-fg-tertiary">
                  Restricted for your role
                </div>
                <h2 className="text-h2 text-fg">
                  Lead Finder isn&apos;t available for your role ({role})
                </h2>
                <p className="text-body text-fg-secondary max-w-md mx-auto">
                  Only workspace admins, customers and tenants can search for leads, pull lists and assign them. Reps can work the leads already assigned to them on the Calling Floor and in Contacts.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center gap-3">
                <Link href="/dialer" className={buttonClasses('primary', 'md')}>
                  Return to Calling Floor
                </Link>
                <Link href="/contacts" className={buttonClasses('secondary', 'md')}>
                  View my assigned leads
                </Link>
              </div>
            </div>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 max-w-[1440px] w-full mx-auto">
          {/* PAGE HEADER, QUOTA METER & SUB-VIEW TABS */}
          <div className="space-y-5">
            <PageHeader
              className="pb-0"
              title="Lead Finder"
              description="Find verified decision-makers and split them evenly across your reps."
              meta={
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1 min-w-[180px]">
                    <span className="text-small tabular-nums text-fg-secondary whitespace-nowrap">
                      {activeQuota.billingStage === 'month1' ? (
                        <>
                          <span className="font-medium text-fg">
                            {activeQuota.weeklyUsed.toLocaleString()}
                          </span>{' '}
                          of {activeQuota.weeklyAllowance.toLocaleString()} this week
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-fg">
                            {balance.totalPullableNow.toLocaleString()}
                          </span>{' '}
                          records available
                        </>
                      )}
                    </span>
                    {activeQuota.billingStage === 'month1' && (
                      <Meter value={weeklyPct / 100} label="Weekly allowance used" />
                    )}
                  </div>
                  {canOpenAdmin && (
                    <Link
                      href="/admin/lead-credits"
                      className="focus-ring rounded-sm text-small font-medium text-fg-secondary hover:text-fg underline decoration-line-strong underline-offset-2 whitespace-nowrap"
                    >
                      Get more
                    </Link>
                  )}
                </div>
              }
              secondaryActions={
                <Button
                  variant={activeTab === 'academy' ? 'primary' : 'ghost'}
                  icon={<GraduationCap />}
                  onClick={() => setActiveTab('academy')}
                >
                  User guide (2 min)
                </Button>
              }
            />

            <div className="text-small text-fg-secondary -mt-2">
              {activeQuota.tenantName} &middot;{' '}
              {canExport
                ? `${role}, full export access`
                : `${role}, assigned view only (CSV locked)`}
            </div>

            {/* Sub-view tabs */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-line">
              <div role="tablist" aria-label="Lead Finder views" className="flex items-center gap-5 flex-wrap">
                {(
                  [
                    { id: 'builder' as const, label: 'Guided list builder', icon: Compass, count: undefined as string | undefined },
                    { id: 'folders' as const, label: 'Saved folders', icon: FolderKanban, count: String(visibleFolders.length) },
                    { id: 'academy' as const, label: 'Training & guide', icon: BookOpen, count: `${completedModules.length}/${TRAINING_MODULES.length}` },
                  ]
                ).map((t) => {
                  const TabIcon = t.icon;
                  const selected = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(t.id)}
                      className={`focus-ring -mb-px inline-flex h-10 items-center gap-1.5 rounded-t-sm border-b-2 text-body transition-colors duration-150 cursor-pointer ${
                        selected
                          ? 'border-action text-fg font-medium'
                          : 'border-transparent text-fg-secondary hover:text-fg'
                      }`}
                    >
                      <TabIcon className="w-4 h-4 text-fg-secondary" />
                      <span>{t.label}</span>
                      {t.count !== undefined && (
                        <span className="text-caption tabular-nums text-fg-tertiary">
                          {t.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pb-2.5 text-small text-fg-tertiary">
                <span>Synced with</span>
                <Link
                  href="/contacts"
                  className="focus-ring rounded-sm text-fg-secondary hover:text-fg font-medium underline decoration-line-strong underline-offset-2"
                >
                  Contacts
                </Link>
                <span>&middot;</span>
                <Link
                  href="/dialer"
                  className="focus-ring rounded-sm text-fg-secondary hover:text-fg font-medium underline decoration-line-strong underline-offset-2"
                >
                  Calling Floor
                </Link>
              </div>
            </div>
          </div>

          {/* Feedback Banner after Pulling */}
          {pullBanner && (
            <div
              ref={pullBannerRef}
              className={`scroll-mt-4 rounded-lg p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                pullBanner.type === 'success'
                  ? 'bg-surface border-line text-fg shadow-xs'
                  : 'bg-danger-bg border-danger-fg/30 text-danger-fg'
              }`}
            >
              <div className="flex items-start gap-3 text-body">
                {pullBanner.type === 'success' ? (
                  <div className="h-6 w-6 rounded-full bg-success-bg text-success-fg flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <AlertTriangle className="w-4 h-4 text-danger-fg shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-body-strong text-fg">
                    {pullBanner.type === 'success'
                      ? 'List pulled, saved to a folder and split evenly'
                      : 'Action required'}
                  </div>
                  <div className="text-small text-fg-secondary mt-0.5">{pullBanner.message}</div>
                </div>
              </div>
              {pullBanner.type === 'success' && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<ArrowRight />}
                    onClick={() => setActiveTab('folders')}
                  >
                    Open folder
                  </Button>
                  <Link href="/dialer" className={buttonClasses('secondary', 'sm')}>
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
              {/* Wizard stepper: done steps are clickable to go back, upcoming steps are reached with Continue */}
              <ol aria-label="Progress" className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    step: 1 as const,
                    title: 'Describe your buyer',
                    desc: 'Describe them to AI, pick a blueprint, or set titles, industry and location.',
                    badge: industry,
                  },
                  {
                    step: 2 as const,
                    title: 'Preview matches (free)',
                    desc: 'Check how many people match and look at sample profiles, at no cost.',
                    badge: totalMatching === null ? '– matches' : `${totalMatching.toLocaleString()} matches`,
                  },
                  {
                    step: 3 as const,
                    title: 'Save and assign',
                    desc: 'Name the folder and split the leads evenly across your reps.',
                    badge: `${pullCount} leads ÷ ${selectedRepsForPull.length || 1} reps`,
                  },
                ].map((s) => {
                  const isCurrent = activeWizardStep === s.step;
                  const isDone = activeWizardStep > s.step;
                  return (
                    <li key={s.step} className="flex">
                    <button
                      type="button"
                      aria-current={isCurrent ? 'step' : undefined}
                      disabled={!isDone && !isCurrent}
                      onClick={() => setActiveWizardStep(s.step)}
                      className={`focus-ring w-full text-left px-4 py-3 rounded-lg border transition-colors duration-150 flex flex-col justify-between gap-1.5 ${
                        isCurrent
                          ? 'bg-surface border-action shadow-xs cursor-default'
                          : isDone
                          ? 'bg-surface border-line hover:border-line-strong hover:bg-subtle cursor-pointer'
                          : 'bg-app border-line cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-caption tabular-nums ${
                              isDone
                                ? 'border-action bg-action text-action-fg'
                                : isCurrent
                                ? 'border-action text-fg'
                                : 'border-line-strong text-fg-tertiary'
                            }`}
                          >
                            {isDone ? <Check className="w-3.5 h-3.5" /> : s.step}
                          </span>
                          <span
                            className={`text-body-strong truncate ${
                              isCurrent || isDone ? 'text-fg' : 'text-fg-tertiary'
                            }`}
                          >
                            {s.title}
                          </span>
                        </span>
                        <span className="text-caption tabular-nums text-fg-tertiary truncate max-w-[45%]">
                          {s.badge}
                        </span>
                      </div>
                      <p className="text-small text-fg-secondary">
                        {s.desc}
                      </p>
                    </button>
                    </li>
                  );
                })}
              </ol>

              {/* STEP 1: Describe your buyer */}
              {activeWizardStep === 1 && (
              <div className="space-y-6">

              {/* AI Prompt-to-ICP Builder (Gemini) */}
              <div className="bg-ink-950 text-ink-50 rounded-lg p-5 space-y-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Sparkles className="w-4 h-4 text-ink-400 self-center" />
                  <span className="text-h3 text-ink-50">
                    Describe your ideal customer
                  </span>
                  <span className="text-small text-ink-400">
                    AI fills in the filters below. Nothing is pulled or charged until you confirm.
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
 aria-label="Describe your ideal customer"                    type="text"
                    value={aiPromptInput}
                    onChange={(e) => setAiPromptInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAiPromptParse();
                    }}
                    maxLength={1000}
                    placeholder='e.g. "CEOs and founders of 50-200 seat BPOs in the Philippines and Australia, phone + verified email"'
                    className="focus-ring flex-1 h-11 px-3.5 rounded-md bg-ink-900 border border-ink-700 text-body text-ink-50 placeholder:text-ink-400"
                  />
                  <Button
                    variant="brand"
                    size="lg"
                    icon={<Sparkles />}
                    onClick={handleAiPromptParse}
                    disabled={aiParsing || !aiPromptInput.trim()}
                  >
                    {aiParsing ? 'Interpreting...' : 'Build filters with AI'}
                  </Button>
                </div>
                {aiError && (
                  <div className="flex items-center gap-1.5 text-small text-ink-50">
                    <AlertTriangle className="w-4 h-4 text-ink-400 shrink-0" />
                    {aiError}
                  </div>
                )}
                {aiInterpretation && (
                  <div className="space-y-2">
                    <div className="text-small text-ink-400">
                      <span className="text-ink-50 font-medium">
                        {aiInterpretation.source === 'gemini'
                          ? 'Gemini understood: '
                          : 'Keyword parser understood: '}
                      </span>
                      {aiInterpretation.text}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-caption">
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
                            className="px-2 py-0.5 rounded-full bg-ink-800 border border-ink-700 text-ink-50"
                          >
                            {chip}
                          </span>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCalculateMarketSize(true)}
                        disabled={sizingLoading}
                      >
                        {sizingLoading
                          ? 'Sizing market...'
                          : 'Preview matches (free)'}
                      </Button>
                      <span className="text-caption text-ink-400">
                        Review or edit the filters below first. You can adjust anything.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 1-Click Smart ICP Blueprints Strip */}
              <div className="bg-surface border border-line rounded-lg shadow-xs p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Zap className="w-4 h-4 text-fg-secondary self-center" />
                    <span className="text-h3 text-fg">
                      Or start from a blueprint
                    </span>
                    <span className="text-small text-fg-secondary">
                      Pick a proven template to fill in the filters and folder name.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('academy')}
                    className="focus-ring rounded-sm text-small font-medium text-fg-secondary hover:text-fg underline underline-offset-2 decoration-line-strong cursor-pointer"
                  >
                    New here? Read the 2-minute guide
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
                        aria-pressed={selected}
                        className={`focus-ring text-left p-3.5 rounded-lg border transition-colors duration-150 cursor-pointer flex flex-col justify-between ${
                          selected
                            ? 'bg-selected text-fg border-action'
                            : 'bg-surface text-fg border-line hover:bg-subtle hover:border-line-strong'
                        }`}
                      >
                        <div>
                          <div className="text-caption text-fg-tertiary mb-1">
                            {bp.tag}
                          </div>
                          <div className="text-body-strong text-fg">{bp.title}</div>
                          <div className="text-small mt-1 text-fg-secondary">
                            {bp.subtitle}
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-line flex items-center justify-between text-caption">
                          <span className="text-fg-tertiary">
                            {bp.country}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 ${
                              selected
                                ? 'text-fg font-medium'
                                : 'text-fg-secondary'
                            }`}
                          >
                            {selected ? <Check className="w-3.5 h-3.5" /> : null}
                            {selected ? 'Active' : 'Apply'}
                            {selected ? null : <ArrowRight className="w-3.5 h-3.5" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Instant Single LinkedIn URL Enrich Bar */}
                <div className="pt-3 border-t border-line flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-fg-secondary">
                    <Link2 className="w-4 h-4 text-fg-secondary shrink-0" />
                    <span className="text-body-strong text-fg">
                      Enrich a LinkedIn profile
                    </span>
                    <span className="text-fg-secondary">
                      Paste a profile URL to get the direct phone, work email and company website.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <input
 aria-label="LinkedIn profile URL"                      type="url"
                      value={linkedinUrlInput}
                      onChange={(e) => setLinkedinUrlInput(e.target.value)}
                      placeholder="https://www.linkedin.com/in/jane-doe"
                      className="focus-ring flex-1 md:w-80 h-8 px-3 rounded-sm border border-line-strong bg-surface text-small font-mono text-fg placeholder:text-fg-disabled"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={enrichingSingleUrl || !linkedinUrlInput.trim()}
                      onClick={handleEnrichSingleLinkedinUrl}
                    >
                      {enrichingSingleUrl ? 'Enriching...' : 'Enrich profile'}
                    </Button>
                  </div>
                </div>

                {enrichedSingleProspect && (
                  <div className="p-3.5 rounded-lg border border-line bg-subtle text-fg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-small">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body-strong text-fg">
                          {enrichedSingleProspect.name}
                        </span>
                        <span className="text-fg-secondary">
                          {enrichedSingleProspect.title} @{' '}
                          <span className="font-medium text-fg">
                            {enrichedSingleProspect.company}
                          </span>
                        </span>
                        <span className="font-mono text-fg">
                          {enrichedSingleProspect.phone || <span className="font-sans text-fg-tertiary">No phone</span>}
                        </span>
                        <span className="font-mono text-fg-secondary">
                          {enrichedSingleProspect.email || <span className="font-sans text-fg-tertiary">No verified email</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {enrichedSingleProspect.website && (
                        <a
                          href={enrichedSingleProspect.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClasses('secondary', 'sm')}
                        >
                          <Globe className="text-fg-secondary" />
                          <span>{enrichedSingleProspect.companyDomain || 'Website'}</span>
                        </a>
                      )}
                      {enrichedSingleProspect.linkedinUrl && (
                        <a
                          href={enrichedSingleProspect.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonClasses('secondary', 'sm')}
                        >
                          <ExternalLink className="text-fg-secondary" />
                          <span>LinkedIn</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

                {/* Step 1 filters: Precision ICP Parameters */}
                <div className="bg-surface rounded-lg p-6 space-y-5 border border-line shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <div>
                      <span className="text-caption text-fg-tertiary">
                        Step 1 of 3
                      </span>
                      <h2 className="text-h3 text-fg mt-0.5">
                        Buyer and company filters
                      </h2>
                    </div>
                    <span className="text-small text-fg-secondary">
                      Free to preview
                    </span>
                  </div>


                  {/* Section A: Role & Seniority */}
                  <div className="space-y-3 text-small">
                    <div className="flex items-center justify-between">
                      <label className="font-medium text-fg">
                        Job titles
                      </label>
                      <span className="text-fg-tertiary">Comma-separated</span>
                    </div>
                    <input aria-label="Job titles"
                      type="text"
                      value={titles}
                      onFocus={() => setActiveWizardStep(1)}
                      onChange={(e) => setTitles(e.target.value)}
                      className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled transition-colors duration-150"
                      placeholder="Owner, CEO, President, VP of Sales"
                    />

                    <div>
                      <label className="block font-medium text-fg mb-1">
                        Exclude titles <span className="font-normal text-fg-tertiary">(keeps out non-decision-makers)</span>
                      </label>
                      <input aria-label="Exclude titles (keeps out non-decision-makers)"
                        type="text"
                        value={excludeTitles}
                        onFocus={() => setActiveWizardStep(1)}
                        onChange={(e) => setExcludeTitles(e.target.value)}
                        className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled transition-colors duration-150"
                        placeholder="Intern, Assistant, Junior"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-fg mb-2">
                        Seniority
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
                              aria-pressed={active}
                              className={`focus-ring inline-flex items-center gap-1 h-8 px-3 rounded-full text-small font-medium border transition-colors duration-150 cursor-pointer ${
                                active
                                  ? 'bg-selected text-fg border-action'
                                  : 'bg-surface text-fg-secondary border-line hover:border-line-strong hover:text-fg'
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
                  <div className="pt-4 border-t border-line space-y-3 text-small">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-fg mb-1">
                          Industry
                        </label>
                        <select aria-label="Industry"
                          value={industry}
                          onChange={(e) => {
                            setActiveWizardStep(1);
                            setIndustry(e.target.value);
                          }}
                          className="focus-ring w-full h-9 px-2.5 rounded-sm border border-line-strong bg-surface text-body text-fg cursor-pointer"
                        >
                          {INDUSTRY_PRESETS.map((ind) => (
                            <option key={ind} value={ind}>
                              {ind}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-fg mb-1">
                          Company size
                        </label>
                        <select aria-label="Company size"
                          value={headcountRange}
                          onChange={(e) => {
                            setActiveWizardStep(1);
                            setHeadcountRange(e.target.value);
                          }}
                          className="focus-ring w-full h-9 px-2.5 rounded-sm border border-line-strong bg-surface text-body text-fg cursor-pointer"
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
                        <label className="block font-medium text-fg mb-1">
                          Country
                        </label>
                        <input aria-label="Country"
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled transition-colors duration-150"
                          placeholder="United States"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-fg mb-1">
                          State or province
                        </label>
                        <input aria-label="State or province"
                          type="text"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled transition-colors duration-150"
                          placeholder="Texas"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-fg mb-1">
                          City <span className="font-normal text-fg-tertiary">(optional)</span>
                        </label>
                        <input aria-label="City (optional)"
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled transition-colors duration-150"
                          placeholder="Austin, Dallas"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-fg mb-1">
                          Tools they use
                        </label>
                        <input aria-label="Tools they use"
                          type="text"
                          value={technologies}
                          onChange={(e) => setTechnologies(e.target.value)}
                          className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled transition-colors duration-150"
                          placeholder="HubSpot, Salesforce"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section D: Quality Guardrails */}
                  <div className="pt-4 border-t border-line space-y-2 text-small">
                    <div className="font-medium text-fg mb-1">
                      Lead quality
                    </div>
                    <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-line hover:bg-subtle cursor-pointer transition-colors duration-150">
                      <span className="text-fg">
                        Must have a direct or mobile phone
                      </span>
                      <input
                        type="checkbox"
                        checked={requirePhone}
                        onChange={(e) => setRequirePhone(e.target.checked)}
                        className="focus-ring size-4 rounded-[4px] border-line-strong accent-action cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-line hover:bg-subtle cursor-pointer transition-colors duration-150">
                      <span className="text-fg">
                        Must have a verified work email
                      </span>
                      <input
                        type="checkbox"
                        checked={requireVerifiedEmail}
                        onChange={(e) => setRequireVerifiedEmail(e.target.checked)}
                        className="focus-ring size-4 rounded-[4px] border-line-strong accent-action cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-line hover:bg-subtle cursor-pointer transition-colors duration-150">
                      <span className="text-fg">
                        Skip leads this workspace already pulled
                      </span>
                      <input
                        type="checkbox"
                        checked={excludePreviouslyPulled}
                        onChange={(e) =>
                          setExcludePreviouslyPulled(e.target.checked)
                        }
                        className="focus-ring size-4 rounded-[4px] border-line-strong accent-action cursor-pointer"
                      />
                    </label>
                  </div>

                </div>
              </div>
              )}

              {/* STEP 2: Preview matches (free) */}
              {activeWizardStep === 2 && (
                  <div className="bg-surface rounded-lg p-6 space-y-5 border border-line shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
                      <div>
                        <span className="text-caption text-fg-tertiary">
                          Step 2 of 3, free preview
                        </span>
                        <h3 className="text-h3 text-fg mt-0.5">
                          Matching people and sample profiles
                        </h3>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-kpi tabular-nums text-fg">
                          {totalMatching !== null
                            ? totalMatching.toLocaleString()
                            : previewProspects.length > 0
                            ? `${(previewPage - 1) * 25 + previewProspects.length}+`
                            : '–'}
                        </span>
                        <span className="text-small text-fg-secondary">
                          {totalMatching !== null
                            ? 'verified decision-makers'
                            : previewProspects.length > 0
                            ? 'matching (the provider gave no total)'
                            : 'matching'}
                        </span>
                      </div>
                    </div>

                    {/* Visual Breakdown Bars */}
                    {breakdowns && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-small">
                        <div className="p-3.5 rounded-lg bg-subtle border border-line space-y-2">
                          <div className="font-medium text-fg">
                            By industry
                          </div>
                          {breakdowns.byIndustry.map((item, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-fg-secondary">
                                <span className="truncate pr-2">{item.label}</span>
                                <span className="tabular-nums text-fg">
                                  {item.pct}%
                                </span>
                              </div>
                              <Meter value={item.pct / 100} label={item.label} className="h-1 bg-surface" />
                            </div>
                          ))}
                        </div>

                        <div className="p-3.5 rounded-lg bg-subtle border border-line space-y-2">
                          <div className="font-medium text-fg">
                            By company size
                          </div>
                          {breakdowns.byHeadcount.map((item, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-fg-secondary">
                                <span className="truncate pr-2">{item.label}</span>
                                <span className="tabular-nums text-fg">
                                  {item.pct}%
                                </span>
                              </div>
                              <Meter value={item.pct / 100} label={item.label} className="h-1 bg-surface" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 25-Per-Page Paginated Preview Table */}
                    <div className="border border-line rounded-lg overflow-hidden select-none">
                      <div className="bg-surface px-4 py-2.5 border-b border-line flex flex-wrap items-center justify-between gap-2 text-small">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg whitespace-nowrap">
                            Matching profiles
                          </span>
                          <span className="tabular-nums text-fg-tertiary whitespace-nowrap">
                            Page {previewPage}, {previewProspects.length} of 25 shown
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={previewPage <= 1 || sizingLoading}
                            onClick={handlePrevPreviewPage}
                          >
                            Previous 25
                          </Button>
                          <span className="tabular-nums text-fg-tertiary whitespace-nowrap">
                            Page {previewPage}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!nextCursor || sizingLoading}
                            onClick={handleNextPreviewPage}
                          >
                            Next 25
                          </Button>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-small">
                          <thead>
                            <tr className="bg-subtle border-b border-line text-caption text-fg-tertiary">
                              <th className="py-2.5 px-4 font-medium">#</th>
                              <th className="py-2.5 px-4 font-medium">
                                Decision-maker
                              </th>
                              <th className="py-2.5 px-4 font-medium">
                                Company
                              </th>
                              <th className="py-2.5 px-4 font-medium">Location</th>
                              <th className="py-2.5 px-4 font-medium text-right">
                                Verified channels
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {previewProspects.slice(0, 25).map((p, idx) => (
                              <tr key={p.id} className="hover:bg-subtle">
                                <td className="py-2.5 px-4 tabular-nums text-fg-tertiary">
                                  {(previewPage - 1) * 25 + idx + 1}
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-fg">
                                      {p.name}
                                    </span>
                                    {p.linkedinUrl && (
                                      <a
                                        href={p.linkedinUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Open ${p.name}'s LinkedIn Profile`}
                                        className="focus-ring inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-fg-secondary hover:text-fg hover:bg-subtle border border-line text-caption"
                                      >
                                        <span>in</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-fg-tertiary">{p.title}</div>
                                </td>
                                <td className="py-2.5 px-4">
                                  <div className="font-medium text-fg">
                                    {p.company}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {p.website ? (
                                      <a
                                        href={p.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="focus-ring rounded-sm inline-flex items-center gap-1 text-fg-secondary hover:text-fg text-caption underline decoration-line-strong underline-offset-2"
                                      >
                                        <Globe className="w-3 h-3 text-fg-tertiary" />
                                        <span>
                                          {p.companyDomain ||
                                            p.website.replace(/^https?:\/\//, '')}
                                        </span>
                                      </a>
                                    ) : (
                                      <span className="text-fg-tertiary">
                                        {p.headcount}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-4 text-fg-secondary">
                                  {p.location}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <Badge tone="success">
                                    <PhoneCall className="w-3 h-3" />
                                    <Mail className="w-3 h-3" />
                                    <span>Ready</span>
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Bottom Pagination Bar (25 Results Per Page) */}
                      <div className="bg-surface px-4 py-2.5 border-t border-line flex items-center justify-between text-small">
                        <span className="tabular-nums text-fg-tertiary">
                          Showing rows {(previewPage - 1) * 25 + 1} to{' '}
                          {(previewPage - 1) * 25 + previewProspects.slice(0, 25).length} (25 per page)
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={previewPage <= 1 || sizingLoading}
                            onClick={handlePrevPreviewPage}
                          >
                            Previous 25
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!nextCursor || sizingLoading}
                            onClick={handleNextPreviewPage}
                          >
                            Next 25
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

              )}

              {/* STEP 3: Save to a folder and split across reps */}
              {activeWizardStep === 3 && (
                  <div className="bg-surface rounded-lg p-6 space-y-5 border border-line shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
                      <div>
                        <span className="text-caption text-fg-tertiary">
                          Step 3 of 3
                        </span>
                        <h3 className="text-h3 text-fg mt-0.5">
                          Save to a folder and split across reps
                        </h3>
                      </div>
                      <span className="text-small tabular-nums text-fg-secondary">
                        {balance.totalPullableNow.toLocaleString()} records available
                      </span>
                    </div>

                    {canBuildAndDistribute ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-small">
                          <div className="sm:col-span-2">
                            <label className="block font-medium text-fg mb-1">
                              Folder name
                            </label>
                            <input aria-label="Folder name"
                              type="text"
                              value={folderNameInput}
                              onFocus={() => setActiveWizardStep(3)}
                              onChange={(e) => setFolderNameInput(e.target.value)}
                              className="focus-ring w-full h-9 px-3 rounded-sm border border-line-strong bg-surface text-body text-fg placeholder:text-fg-disabled"
                              placeholder="e.g. Texas Commercial HVAC Owners, Q4"
                            />
                            <p className="text-fg-tertiary mt-1">
                              Shows in Saved folders and in the Contacts folder filter.
                            </p>
                          </div>

                          <div>
                            <label className="block font-medium text-fg mb-1">
                              How many leads
                            </label>
                            <select aria-label="How many leads"
                              value={pullCount}
                              onFocus={() => setActiveWizardStep(3)}
                              onChange={(e) => setPullCount(Number(e.target.value))}
                              className="focus-ring w-full h-9 px-2.5 rounded-sm border border-line-strong bg-surface text-body tabular-nums text-fg cursor-pointer"
                            >
                              <option value={25}>25 records (1 page)</option>
                              <option value={50}>50 records (2 pages)</option>
                              <option value={100}>100 records (4 pages)</option>
                              <option value={250}>250 records</option>
                              <option value={500}>500 records</option>
                              <option value={1000}>1,000 records</option>
                            </select>
                          </div>
                        </div>

                        {/* Visual Equal Round-Robin Split Configurator */}
                        <div className="p-4 rounded-lg bg-subtle border border-line space-y-3.5 text-small">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="font-medium text-fg">
                                Reps who get this list (split evenly)
                              </div>
                              <div className="text-fg-secondary mt-0.5">
                                {selectedRepsForPull.length > 0 ? (
                                  <>
                                    Splitting <strong>{pullCount} leads</strong>{' '}
                                    equally across{' '}
                                    <strong>{selectedRepsForPull.length} reps</strong>{' '}
                                    ={' '}
                                    <strong className="text-fg tabular-nums">
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
                                className="focus-ring h-8 px-2.5 rounded-sm border border-line-strong bg-surface text-small text-fg w-36 placeholder:text-fg-disabled"
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={<UserPlus />}
                                onClick={handleAddRepToRoster}
                              >
                                Add
                              </Button>
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
                                  aria-pressed={isChecked}
                                  className={`focus-ring p-2.5 rounded-md border text-left flex items-center justify-between bg-surface transition-colors duration-150 cursor-pointer ${
                                    isChecked
                                      ? 'text-fg border-action'
                                      : 'text-fg-secondary border-line hover:border-line-strong'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={`w-4 h-4 rounded-[4px] flex items-center justify-center border shrink-0 ${
                                        isChecked
                                          ? 'bg-action border-action text-action-fg'
                                          : 'border-line-strong bg-surface'
                                      }`}
                                    >
                                      {isChecked && <Check className="w-3 h-3" />}
                                    </span>
                                    <span className="font-medium truncate">
                                      {rep}
                                    </span>
                                  </div>
                                  <span
                                    className={`tabular-nums text-small ${
                                      isChecked
                                        ? 'text-fg font-medium'
                                        : 'text-fg-tertiary'
                                    }`}
                                  >
                                    {isChecked ? `${sliceCount} leads` : 'Skipped'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="text-small text-fg-secondary flex items-center gap-1.5">
                          <Lock className="w-4 h-4 text-fg-tertiary shrink-0" />
                          <span>
                            Reps will see their assigned slice on the Calling Floor (CSV export locked).
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="p-4 rounded-lg bg-subtle border border-line text-small text-fg-secondary flex items-center gap-2">
                        <Lock className="w-4 h-4 text-fg-tertiary shrink-0" />
                        <span>
                          Your account admin pulls lists and assigns folders. Open the <span className="font-medium text-fg">Saved folders</span> tab above to call the leads assigned to you.
                        </span>
                      </div>
                    )}
                  </div>
              )}

              {/* Live pull progress, right above the Pull button the user just clicked */}
              {pullProgress && (
                <PullProgressPanel
                  {...pullProgress}
                  pullStyle={pullStyle}
                  onDismiss={pullingList ? undefined : () => setPullProgress(null)}
                />
              )}

              {/* Wizard footer: Back / Continue */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-line pt-4">
                <Button
                  variant="secondary"
                  icon={<ArrowLeft />}
                  disabled={activeWizardStep === 1}
                  onClick={() =>
                    setActiveWizardStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3) : prev))
                  }
                >
                  Back
                </Button>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-small tabular-nums text-fg-tertiary">
                    Step {activeWizardStep} of 3
                  </span>
                  {activeWizardStep === 1 && (
                    <Button
                      variant="primary"
                      disabled={sizingLoading}
                      onClick={() => handleCalculateMarketSize(true)}
                      icon={
                        <RefreshCw
                          className={sizingLoading ? 'animate-spin' : ''}
                        />
                      }
                    >
                      <span>
                        {sizingLoading
                          ? 'Counting matches...'
                          : 'Preview matches (free)'}
                      </span>
                    </Button>
                  )}
                  {activeWizardStep === 2 && (
                    <Button
                      variant="brand"
                      disabled={sizingLoading}
                      onClick={() => setActiveWizardStep(3)}
                      icon={<ArrowRight />}
                    >
                      Continue
                    </Button>
                  )}
                  {activeWizardStep === 3 && canBuildAndDistribute && (
                    <Button
                      variant="brand"
                      disabled={pullingList}
                      onClick={handlePullAndDistribute}
                      icon={<Users />}
                    >
                      <span>
                        {pullingList
                          ? `Pulling and splitting ${pullCount} leads...`
                          : `Pull ${pullCount} leads and split evenly`}
                      </span>
                    </Button>
                  )}
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
                <div className="bg-surface border border-line rounded-lg shadow-xs p-12 text-center space-y-3">
                  <FolderKanban className="w-6 h-6 text-fg-tertiary mx-auto" />
                  <div className="text-h3 text-fg">
                    No folders yet
                  </div>
                  <p className="text-body text-fg-secondary max-w-md mx-auto">
                    Use the guided list builder to pull your first verified list into a folder and split it evenly across your reps.
                  </p>
                  <Button
                    variant="primary"
                    icon={<ArrowRight />}
                    onClick={() => setActiveTab('builder')}
                  >
                    Build your first folder
                  </Button>
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
                      className="bg-surface border border-line rounded-lg overflow-hidden shadow-xs"
                    >
                      <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-h3 text-fg flex items-center gap-2">
                              <FolderKanban className="w-4 h-4 text-fg-secondary" />
                              <span>{folder.name}</span>
                            </span>
                            <span className="text-small tabular-nums text-fg-secondary">
                              {role === 'Rep'
                                ? `${folderContacts.length} assigned to you`
                                : `${folder.totalLeads} verified leads`}
                            </span>
                            {bookedCount > 0 && (
                              <Badge tone="success">
                                {bookedCount} booked
                              </Badge>
                            )}
                            <span className="text-small text-fg-tertiary">
                              Created {new Date(folder.createdAt).toLocaleDateString()}{' '}
                              by {folder.createdBy}
                            </span>
                          </div>

                          {/* Folder ICP Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 text-small">
                            <span className="text-fg-tertiary">Filters:</span>
                            {folder.filtersSummary.industry && (
                              <span className="px-2 py-0.5 rounded-sm bg-subtle text-fg-secondary">
                                {folder.filtersSummary.industry}
                              </span>
                            )}
                            {folder.filtersSummary.titles && (
                              <span className="px-2 py-0.5 rounded-sm bg-subtle text-fg-secondary">
                                {folder.filtersSummary.titles}
                              </span>
                            )}
                            {folder.filtersSummary.headcount && (
                              <span className="px-2 py-0.5 rounded-sm bg-subtle text-fg-secondary">
                                {folder.filtersSummary.headcount}
                              </span>
                            )}
                            {folder.filtersSummary.location && (
                              <span className="px-2 py-0.5 rounded-sm bg-subtle text-fg-secondary">
                                {folder.filtersSummary.location}
                              </span>
                            )}
                          </div>

                          {/* Equal Rep Distribution Breakdown */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-small text-fg-tertiary">
                              Split across {folder.distributedReps.length} reps:
                            </span>
                            {folder.distributedReps.map((slice) => (
                              <span
                                key={slice.repName}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-line text-small text-fg"
                              >
                                <Users className="w-3 h-3 text-fg-tertiary" />
                                <span>{slice.repName}:</span>
                                <span className="font-medium tabular-nums text-fg">
                                  {slice.leadCount}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Folder Actions */}
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-expanded={isExpanded}
                            icon={<Eye />}
                            onClick={() =>
                              setExpandedFolderId(isExpanded ? null : folder.id)
                            }
                          >
                            <span>
                              {isExpanded
                                ? 'Hide leads'
                                : `View leads (${folderContacts.length})`}
                            </span>
                            {isExpanded ? <ChevronUp /> : <ChevronDown />}
                          </Button>

                          {canBuildAndDistribute && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Users />}
                              onClick={() => {
                                setRedistributeFolder(folder);
                                setRedistributeReps(
                                  folder.distributedReps.map((r) => r.repName)
                                );
                              }}
                            >
                              Re-split evenly
                            </Button>
                          )}

                          {canExport ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<Download />}
                              onClick={() =>
                                exportContactsToCsv(folderContacts, folder.name)
                              }
                            >
                              Export CSV
                            </Button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-small bg-subtle border border-line text-fg-tertiary select-none">
                              <Lock className="w-4 h-4 text-fg-tertiary" />
                              <span>CSV locked (admins only)</span>
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
                            className={`border-t border-line overflow-x-auto ${
                              !canExport ? 'select-none' : ''
                            }`}
                          >
                            <table className="w-full text-left border-collapse text-small">
                              <thead>
                                <tr className="bg-subtle border-b border-line text-caption text-fg-tertiary">
                                  <th className="py-2.5 px-5 font-medium">#</th>
                                  <th className="py-2.5 px-5 font-medium">ID</th>
                                  <th className="py-2.5 px-5 font-medium">
                                    Decision-maker
                                  </th>
                                  <th className="py-2.5 px-5 font-medium">
                                    Company
                                  </th>
                                  <th className="py-2.5 px-5 font-medium">
                                    Phone and email
                                  </th>
                                  <th className="py-2.5 px-5 font-medium">
                                    Assigned rep
                                  </th>
                                  <th className="py-2.5 px-5 font-medium text-right">
                                    Calling Floor
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {pageSlice.map((lead, idx) => (
                                  <tr key={lead.id} className="hover:bg-subtle">
                                    <td className="py-3 px-5 tabular-nums text-fg-tertiary">
                                      {(safePage - 1) * PAGE_SIZE + idx + 1}
                                    </td>
                                    <td className="py-3 px-5 font-mono text-caption text-fg-tertiary">
                                      {lead.id}
                                    </td>
                                    <td className="py-3 px-5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-medium text-fg">
                                          {lead.name}
                                        </span>
                                        {lead.linkedinUrl && (
                                          <a
                                            href={lead.linkedinUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={`Open ${lead.name}'s LinkedIn Profile`}
                                            className="focus-ring inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-fg-secondary hover:text-fg hover:bg-subtle border border-line text-caption"
                                          >
                                            <span>LinkedIn</span>
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                      <div className="text-fg-tertiary">{lead.title}</div>
                                    </td>
                                    <td className="py-3 px-5">
                                      <div className="font-medium text-fg">
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
                                            className="focus-ring rounded-sm inline-flex items-center gap-1 text-fg-secondary hover:text-fg text-caption underline decoration-line-strong underline-offset-2"
                                          >
                                            <Globe className="w-3 h-3 text-fg-tertiary" />
                                            <span>
                                              {lead.website.replace(/^https?:\/\//, '')}
                                            </span>
                                          </a>
                                        ) : (
                                          <span className="text-fg-tertiary">
                                            {lead.industry || lead.headcount}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-5 font-mono text-small">
                                      <div className="text-fg">
                                        {lead.phone || <span className="font-sans text-fg-tertiary">No phone</span>}
                                      </div>
                                      <div className="text-fg-tertiary">
                                        {lead.email || <span className="font-sans">No verified email</span>}
                                      </div>
                                    </td>
                                    <td className="py-3 px-5">
                                      {canBuildAndDistribute ? (
                                        <select
                                          value={lead.assignedRep || 'Unassigned'}
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
                                          className="focus-ring h-8 px-2 rounded-sm bg-surface hover:bg-subtle border border-line-strong text-fg text-small cursor-pointer"
                                        >
                                          {Array.from(
                                            new Set([
                                              ...(activeQuota.repsRoster || []),
                                              lead.assignedRep || 'Unassigned',
                                            ])
                                          ).map((r) => (
                                            <option key={r} value={r}>
                                              {r}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="text-fg">
                                          {lead.assignedRep}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-5 text-right">
                                      <Link
                                        href="/dialer"
                                        className={buttonClasses('secondary', 'sm')}
                                      >
                                        <PhoneCall className="text-fg-secondary" />
                                        <span>Call</span>
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* 25-Per-Page Folder Footer Pagination */}
                            <div className="bg-surface px-5 py-3 border-t border-line flex items-center justify-between text-small">
                              <span className="tabular-nums text-fg-tertiary">
                                Showing {(safePage - 1) * PAGE_SIZE + 1} to{' '}
                                {(safePage - 1) * PAGE_SIZE + pageSlice.length} of{' '}
                                {folderContacts.length} leads (25 per page)
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={safePage <= 1}
                                  onClick={() =>
                                    setFolderPageMap((prev) => ({
                                      ...prev,
                                      [folder.id]: Math.max(1, safePage - 1),
                                    }))
                                  }
                                >
                                  Previous 25
                                </Button>
                                <span className="tabular-nums text-fg-secondary">
                                  Page {safePage} of {totalFolderPages}
                                </span>
                                <Button
                                  variant="secondary"
                                  size="sm"
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
                                >
                                  Next 25
                                </Button>
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
              <div className="bg-surface border border-line shadow-xs rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1 max-w-2xl">
                  <h2 className="text-h2 text-fg">
                    How to build, organise and assign lead lists
                  </h2>
                  <p className="text-body text-fg-secondary">
                    Four short modules, under 3 minutes in total: free market sizing, folders, even splits across reps, and data security.
                  </p>
                </div>

                {/* Progress Meter */}
                <div className="bg-subtle border border-line rounded-lg p-4 min-w-[220px] space-y-2">
                  <div className="flex items-center justify-between text-small">
                    <span className="text-fg-secondary">Your progress</span>
                    <span className="font-medium tabular-nums text-fg">
                      {completedModules.length} of {TRAINING_MODULES.length} done
                    </span>
                  </div>
                  <Meter
                    value={completedModules.length / TRAINING_MODULES.length}
                    label="Training progress"
                    className="bg-surface"
                  />
                  <div className="text-caption text-fg-tertiary">
                    Mark each module complete, or jump straight to practising the step.
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
                      className="bg-surface rounded-lg p-6 border border-line shadow-xs flex flex-col justify-between space-y-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-caption">
                            <span className="inline-block lowercase first-letter:uppercase text-fg-secondary">
                              {mod.stepNumber}
                            </span>
                            <span className="text-fg-tertiary">&middot;</span>
                            <span className="text-fg-tertiary">
                              {mod.duration}
                            </span>
                          </div>
                          <button
                            type="button"
                            aria-pressed={isDone}
                            onClick={() => toggleModuleComplete(mod.id)}
                            className={`focus-ring inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-small font-medium border transition-colors duration-150 cursor-pointer ${
                              isDone
                                ? 'bg-success-bg text-success-fg border-transparent'
                                : 'bg-surface text-fg-secondary border-line hover:text-fg hover:border-line-strong'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isDone ? 'Completed' : 'Mark complete'}</span>
                          </button>
                        </div>

                        <h3 className="text-h3 text-fg">
                          {mod.title}
                        </h3>
                        <p className="text-body text-fg-secondary">
                          {mod.summary}
                        </p>

                        <div className="space-y-2 pt-1">
                          {mod.keyTakeaways.map((point, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-small text-fg"
                            >
                              <span className="w-5 h-5 rounded-full bg-subtle text-fg-secondary text-caption tabular-nums flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 pt-4 border-t border-line">
                        <div className="p-3 rounded-md bg-subtle text-small text-fg-secondary">
                          <span className="font-medium text-fg">Tip:</span>{' '}
                          {mod.proTip}
                        </div>

                        <Button
                          variant="secondary"
                          className="w-full"
                          icon={<Play />}
                          onClick={() => {
                            if (!completedModules.includes(mod.id)) {
                              toggleModuleComplete(mod.id);
                            }
                            setActiveTab(mod.targetTab);
                            if (mod.targetWizardStep) {
                              setActiveWizardStep(mod.targetWizardStep);
                            }
                          }}
                        >
                          <span>{mod.actionLabel}</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Frequently Asked Questions Accordion */}
              <div className="bg-surface border border-line rounded-lg shadow-xs p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-fg-secondary" />
                  <h3 className="text-h3 text-fg">
                    Frequently asked questions
                  </h3>
                </div>

                <div className="divide-y divide-line">
                  {TRAINING_FAQS.map((faq, idx) => {
                    const isOpen = openFaqIdx === idx;
                    return (
                      <div key={idx} className="py-3.5">
                        <button
                          type="button"
                          onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                          aria-expanded={isOpen}
                          className="focus-ring rounded-sm w-full text-left flex items-center justify-between gap-4 text-body-strong text-fg cursor-pointer"
                        >
                          <span>{faq.q}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-fg-secondary shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-fg-secondary shrink-0" />
                          )}
                        </button>
                        {isOpen && (
                          <p className="mt-2 text-body text-fg-secondary pr-6">
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
        )}
      </div>

      {/* Modal: Re-Distribute Folder Equally Across X Reps */}
      <Dialog
        open={redistributeFolder !== null}
        onClose={() => setRedistributeFolder(null)}
        title="Re-split folder across reps"
        description={
          redistributeFolder ? (
            <>
              <span className="font-medium text-fg">{redistributeFolder.name}</span>{' '}
              (<span className="tabular-nums">{redistributeFolder.totalLeads}</span> leads)
            </>
          ) : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRedistributeFolder(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmRedistribute}
            >
              Split evenly now
            </Button>
          </>
        }
      >
        {redistributeFolder && (
            <div className="space-y-2 text-small">
              <div className="font-medium text-fg">
                Choose the reps to split this folder between
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
                      aria-pressed={active}
                      className={`focus-ring inline-flex items-center gap-1 h-8 px-3 rounded-full border text-small font-medium transition-colors duration-150 cursor-pointer ${
                        active
                          ? 'bg-selected text-fg border-action'
                          : 'bg-surface text-fg-secondary border-line hover:border-line-strong'
                      }`}
                    >
                      {active ? <Check className="w-3.5 h-3.5" /> : null}
                      {rep}
                    </button>
                  );
                })}
              </div>

              {redistributeReps.length > 0 && (
                <div className="p-3 rounded-md bg-subtle text-fg-secondary mt-2 tabular-nums">
                  Splitting <strong className="font-medium text-fg">{redistributeFolder.totalLeads}</strong> leads
                  evenly across <strong className="font-medium text-fg">{redistributeReps.length}</strong> rep(s) ={' '}
                  <strong className="font-medium text-fg">
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
        )}
      </Dialog>

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
