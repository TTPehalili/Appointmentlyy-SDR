'use client';

import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Mail,
  Send,
  Calendar,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Check,
  ShieldAlert,
  Volume2,
  Globe,
  ExternalLink,
  X,
  FileSpreadsheet,
  BarChart3,
  Users,
  Search,
  Lock,
  Zap,
  Building2,
  Briefcase,
  RotateCcw,
  FileText,
  UploadCloud,
  Lightbulb,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { Button, IconButton, PageHeader, Badge, EmptyState, Dialog, buttonClasses } from '@/components/ui';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import {
  CADENCE_TOUCHES,
  CADENCE_PHONE_SCRIPTS,
  DEMO_CADENCE_LEADS,
  CadenceLeadRecord
} from '@/lib/cadenceMaster';
import ViewFullCadenceModal from '@/components/cockpit/ViewFullCadenceModal';
import DailyActivityReportModal from '@/components/cockpit/DailyActivityReportModal';
import UploadLeadsCsvModal from '@/components/cockpit/UploadLeadsCsvModal';
import { logCadenceActivity, getDailyActivitySummary, subscribeToActivities } from '@/lib/activityStore';
import { getDispositionsSnapshot, getServerDispositionsSnapshot, subscribeToDispositions, type CallDisposition } from '@/lib/dispositionStore';
import { getOutcomeRole, getQuickOutcomeForRole, resolveOutcomeStage } from '@/lib/dispositionPipeline';
import { recordCallOutcome, getPipelineStagesSnapshot, getServerPipelineStagesSnapshot, subscribeToPipelineStages } from '@/lib/leadStore';
import { getOutcomeCodes } from '@/lib/telephony/settings';
import MoreOutcomesMenu from '@/components/cockpit/MoreOutcomesMenu';
import { useSession, isRoleAdmin } from '@/lib/session';
import { isDemoWorkspace } from '@/lib/demoMode';
import { useDemoWorkspace } from '@/lib/useDemoWorkspace';
import { AiProspectCall, type Turn as ProspectTurn } from '@/components/cockpit/AiProspectCall';
import { PracticeBanner, PracticeSummaryDialog, type PracticeSummaryData } from '@/components/cockpit/PracticeCall';
import { type PracticeSetup, buildPracticeLead, getPracticePersona } from '@/lib/practice';
import { SPARRING_PERSONAS, getPersonaVoiceByCountry } from '@/lib/personas';
import { getPresetRebuttals } from '@/lib/dialerRebuttals';
import { useTelephony } from '@/lib/telephony/useTelephony';
import ColdEmailAssistant, { type AssistantAutoStart } from '@/components/email/ColdEmailAssistant';
import type { AssistantCallContext } from '@/lib/coldEmailAssistant';
import TemplatePicker from '@/components/outreach/TemplatePicker';
import MergeFieldGaps, { unfilledMergeFields } from '@/components/outreach/MergeFieldGaps';
import {
  CallTelemetryState,
  INITIAL_TELEMETRY_STATE,
  synthesizeCrmNotes
} from '@/lib/callTelemetry';
import {
  ContactRecord,
  LeadFootprintItem,
  getStoredContacts,
  saveStoredContacts,
  addContactNote,
  recordContactTouch,
  subscribeToContacts
} from '@/lib/leadStore';
import { normalizeTenantKey } from '@/lib/icpQuotaStore';
import {
  CALLBACK_DISPOSITION,
  CallbackTask,
  createCallbackTask,
  formatCallbackConfirmation
} from '@/lib/callbackStore';
import {
  ScheduleCallbackDialog,
  ScheduleCallbackInput,
  CallbackReassignSelect,
  CallbackTaskRow,
  CallbacksPanel,
  getOrgRepRoster,
  useCallbackTasks
} from '@/components/cockpit/CallbackTasks';

/** Placeholder lead while a client workspace has no leads yet (the screen shows an empty state). */
const EMPTY_LEAD = {
  id: '',
  name: '',
  company: '',
  title: '',
  phone: '',
  email: '',
  headcount: '',
  website: '',
  linkedinUrl: '',
  cadenceDay: 1,
};

const DEMO_CALENDAR_LINK = 'https://calendly.com/bpogtm/30min';

/** The saved booking link for this workspace. Only the demo workspace falls back to the owner's own. */
function readTenantCalendarLink(): string {
  const demo = isDemoWorkspace();
  const fallback = demo ? DEMO_CALENDAR_LINK : '';
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = (localStorage.getItem('tenant_calendar_link') || '').trim();
    if (!saved) return fallback;
    if (saved.includes('emil-appointmentlyy') || saved.includes('your-team')) {
      if (demo) localStorage.setItem('tenant_calendar_link', fallback);
      return fallback;
    }
    // The owner's own link never belongs to a client workspace.
    if (!demo && saved.includes('bpogtm')) return '';
    return saved;
  } catch {
    return fallback;
  }
}

const AGENT_STATE_LABEL: Record<string, string> = {
  ready: 'Ready',
  paused: 'Paused',
  in_call: 'On call',
  wrap_up: 'Wrap-up',
  logged_out: 'Not logged in',
  unknown: 'Connecting',
};


/** The AI buyer who answers demo calls (the Julian Vance BPO director persona). */
const DEMO_PROSPECT_PERSONA =
  SPARRING_PERSONAS.find((p) => p.id === 'demo-dialer-julian') ??
  SPARRING_PERSONAS.find((p) => p.id === 'bpo-directory-buyer') ??
  SPARRING_PERSONAS[0];

/** Wall-clock time for practice call ids and durations (only called from event handlers). */
const nowMs = () => Date.now();

/** Call outcomes on the 1-click disposition bar (also offered in the practice summary). */
const OUTCOME_OPTIONS = [
  { label: 'Booked', value: 'Meeting Booked', activeClass: 'bg-success-bg text-success-fg border-success-500/50', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
  { label: 'Callback', value: 'Call Back Later', activeClass: 'bg-warning-bg text-warning-fg border-warning-400', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
  { label: 'Voicemail', value: 'Left Voicemail', activeClass: 'bg-subtle text-fg border-fg', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
  { label: 'No answer', value: 'No Answer / Gatekeeper', activeClass: 'bg-subtle text-fg border-fg', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
  { label: 'Referral', value: 'Referral / Update Contact', activeClass: 'bg-subtle text-fg border-fg', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
  { label: 'Not interested', value: 'Not Interested / Quarantine', activeClass: 'bg-danger-bg text-danger-fg border-danger-fg/40', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
];
const QUICK_OUTCOME_VALUES = OUTCOME_OPTIONS.map(o => o.value);

/**
 * The Dialer. With `practice` set (from /practice/session) it becomes a training call in any
 * workspace: an AI buyer built from the chosen persona answers, the workspace's own script and
 * objection chips are used, and nothing is written to contacts, activity, callbacks, CRM or telephony.
 */
export default function BorisCallingCockpit({
  practice = null,
  embedded = false,
}: {
  practice?: PracticeSetup | null;
  /** Rendered inside another page (the Practice tab): no full-height shell or scroll area of its own. */
  embedded?: boolean;
} = {}) {
  const { session, role, isAdmin, tenantName: sessionTenant, repName: sessionRep } = useSession();
  const isDemo = useDemoWorkspace();
  const practicePersona = practice ? getPracticePersona(practice.personaId) : null;
  const practiceMode = Boolean(practice && practicePersona);
  const practiceLead = useMemo(() => (practicePersona ? buildPracticeLead(practicePersona) : null), [practicePersona]);
  // Who answers a simulated call: the practice persona, else the demo workspace's Julian Vance.
  const prospectPersona = practicePersona ?? DEMO_PROSPECT_PERSONA;
  const simulatedCall = isDemo || practiceMode;
  const repName = sessionRep || '';
  const PRESET_REBUTTALS = getPresetRebuttals(isDemo);
  const adminClearance = isRoleAdmin(role);

  // Tab State for Right Column: 'notes' | 'footprint' | 'callbacks'
  const [activeRightTab, setActiveRightTab] = useState<'notes' | 'footprint' | 'callbacks'>('notes');

  // Callback tasks (org-scoped). The Callback outcome opens a scheduler instead of logging straight away.
  const orgTenantCode = normalizeTenantKey(session.tenantCode || sessionTenant);
  const callbackActor = useMemo(
    () => ({ name: repName, role, tenantCode: orgTenantCode }),
    [repName, role, orgTenantCode]
  );
  const callbackTasks = useCallbackTasks(orgTenantCode);
  const [isCallbackDialogOpen, setIsCallbackDialogOpen] = useState<boolean>(false);
  const [lastCallbackId, setLastCallbackId] = useState<string | null>(null);
  const lastCallback = callbackTasks.find(t => t.id === lastCallbackId) || null;
  const myOpenCallbackCount = callbackTasks.filter(
    t => t.status === 'open' && t.assignedTo.toLowerCase() === repName.toLowerCase()
  ).length;

  // Direct Lead Notes State (For non-CRM paying clients)
  const [leadNoteInput, setLeadNoteInput] = useState<string>('');
  const [leadNoteSavedToast, setLeadNoteSavedToast] = useState<boolean>(false);

  // Queue & Leads State
  const [leadsQueue, setLeadsQueue] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const stored = getStoredContacts();
      if (stored && stored.length > 0) return stored;
    }
    return isDemoWorkspace() ? DEMO_CADENCE_LEADS : [];
  });
  const [currentLeadIndex, setCurrentLeadIndex] = useState<number>(0);

  // Active Lead Object
  const activeLead = practiceLead ?? (leadsQueue[currentLeadIndex] || (isDemo ? DEMO_CADENCE_LEADS[0] : EMPTY_LEAD));
  const hasNoLeads = !practiceMode && !isDemo && leadsQueue.length === 0;
  // Empty queue (a new workspace, or before stored leads load): no next lead to point at.
  const nextLeadCandidate: { name?: string } | null =
    leadsQueue.length > 0 ? leadsQueue[(currentLeadIndex + 1) % leadsQueue.length] ?? null : null;

  // Active Contact with live footprint & direct notes
  const activeContact = useMemo(() => {
    if (practiceLead) return activeLead;
    const contacts = getStoredContacts();
    return contacts.find(c => c.id === activeLead.id || c.email?.toLowerCase() === (activeLead.email || '').toLowerCase()) || (activeLead as any);
  }, [activeLead, leadsQueue, leadNoteSavedToast, practiceLead]);

  // Lead Fields
  const [customerName, setCustomerName] = useState<string>(activeLead.name);
  const [partnerName, setPartnerName] = useState<string>(activeLead.company);
  const [title, setTitle] = useState<string>(activeLead.title);
  const [phone, setPhone] = useState<string>(activeLead.phone);
  const [directEmail, setDirectEmail] = useState<string>(activeLead.email);
  const [headcount, setHeadcount] = useState<string>(activeLead.headcount);
  const [leadWebsite, setLeadWebsite] = useState<string>(activeLead.website || '');
  const [leadLinkedinUrl, setLeadLinkedinUrl] = useState<string>(activeLead.linkedinUrl || '');
  const [emailSavedToast, setEmailSavedToast] = useState<boolean>(false);

  // Calling & Disposition State
  const [isCallingActive, setIsCallingActive] = useState<boolean>(false);
  const [callTimerSeconds, setCallTimerSeconds] = useState<number>(0);
  // Demo workspace only: a simulated call (ringing → connected) so sales demos look like a live dial.
  const [demoCallPhase, setDemoCallPhase] = useState<'ringing' | 'connected'>('ringing');
  const demoRingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The objection chip selected when Call was pressed drives the AI prospect for that call.
  const [demoCallObjection, setDemoCallObjection] = useState<{ label: string; line: string } | null>(null);
  useEffect(() => () => {
    if (demoRingTimer.current) clearTimeout(demoRingTimer.current);
  }, []);
  // Practice mode: transcript, script steps reached and the end-of-call summary.
  const practiceTurnsRef = useRef<ProspectTurn[]>([]);
  const practiceCallStartRef = useRef<number>(0);
  const practiceObjectionIdRef = useRef<string | null>(practice?.objectionId ?? null);
  const [practiceStepsReached, setPracticeStepsReached] = useState<number[]>([]);
  const [practiceSummary, setPracticeSummary] = useState<PracticeSummaryData | null>(null);
  const [practiceSummaryOpen, setPracticeSummaryOpen] = useState<boolean>(false);
  const [disposition, setDisposition] = useState<string | null>(null);
  const [dispositionNotes, setDispositionNotes] = useState<string>('');
  const [activityToast, setActivityToast] = useState<string | null>(null);

  // Real calls through the rep's VICIdial agent session when it's set up (Admin › Phone system +
  // Settings); otherwise the original tel: link. Call state then comes from VICIdial, not a local timer.
  const telephony = useTelephony();
  const viaVicidial = !practiceMode && telephony.mode === 'vicidial';
  const callActive = viaVicidial ? telephony.agentState === 'in_call' : isCallingActive;
  const showTelephonyNotice = (message: string) => {
    setActivityToast(`VICIdial: ${message}`);
    setTimeout(() => setActivityToast(null), 5000);
  };
  const [completedActivityCount, setCompletedActivityCount] = useState<number>(0);

  // Script & Objections State
  const [currentStep, setCurrentStep] = useState<number>(1);
  // Practice: the objection chosen on the Practice page starts preselected (the rep can change it before dialing).
  const [selectedRebuttalId, setSelectedRebuttalId] = useState<string | null>(practice?.objectionId ?? null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);

  // Modals State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState<boolean>(false);
  const [isDailyReportOpen, setIsDailyReportOpen] = useState<boolean>(false);
  const [isCadenceModalOpen, setIsCadenceModalOpen] = useState<boolean>(false);
  const [showCalendlyModal, setShowCalendlyModal] = useState<boolean>(false);
  const [isQuickEmailOpen, setIsQuickEmailOpen] = useState<boolean>(false);

  // Quick Follow-up Email Composer State
  const [quickEmailSubject, setQuickEmailSubject] = useState<string>('');
  const [quickEmailBody, setQuickEmailBody] = useState<string>('');
  const [isSendingQuickEmail, setIsSendingQuickEmail] = useState<boolean>(false);
  const [quickEmailSuccess, setQuickEmailSuccess] = useState<string | null>(null);
  // AI writing assistant inside the follow-up dialog (resets every time the dialog opens).
  const [quickEmailSession, setQuickEmailSession] = useState<number>(0);
  const [quickEmailAiStart, setQuickEmailAiStart] = useState<AssistantAutoStart | null>(null);
  const [quickEmailFramework, setQuickEmailFramework] = useState<string>('auto');
  const [quickEmailCallContext, setQuickEmailCallContext] = useState<AssistantCallContext | undefined>(undefined);
  // Transcript of the last simulated (AI prospect) call, for the follow-up assistant.
  const followUpTurnsRef = useRef<ProspectTurn[]>([]);

  // The workspace's booking link (Admin > AI providers). Empty until a client workspace sets one.
  const [tenantCalendarLink, setTenantCalendarLink] = useState<string>(readTenantCalendarLink);

  // Telemetry & Customer Qualification State
  const [telemetry, setTelemetry] = useState<CallTelemetryState>(INITIAL_TELEMETRY_STATE);
  const [roleStatus, setRoleStatus] = useState<'confirmed' | 'promoted' | 'changed' | null>(null);
  const [promotedTitleInput, setPromotedTitleInput] = useState<string>('');
  const [referralContactInput, setReferralContactInput] = useState<string>('');
  const [recognizedOA, setRecognizedOA] = useState<boolean | null>(null);
  const [priceTrapStatus, setPriceTrapStatus] = useState<'confirmed' | 'denial' | null>(null);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [directMobileInput, setDirectMobileInput] = useState<string>('');
  const [customRepNotes, setCustomRepNotes] = useState<string>('');

  // Spoken Steps Definitions (Dynamically hydrated from synthesized playbook or system default)
  // The demo script is the platform owner's own pitch; client workspaces get a neutral starter.
  const DEMO_SCRIPT_STEPS = [
    {
      step: 1,
      name: '1. Opener',
      goal: 'Earn 30 seconds and tie the call to yesterday\'s email.',
      spokenText: `"Hi {{first_name}}, it's {{rep_name}} from Appointmentlyy, I emailed you yesterday about new reps burning paid leads. Got 30 seconds for the short version?"`,
      deliveryTip: 'Slow, calm, peer tone. Never apologize for calling.'
    },
    {
      step: 2,
      name: '2. Problem',
      goal: 'Surface the shared-lead, price-pressure pain in one question.',
      spokenText: `"Quick question: when your juniors call shared leads that three other BPOs got the same day, how often do they lose on price?"`,
      deliveryTip: 'Ask, then stop talking. Let them vent.'
    },
    {
      step: 3,
      name: '3. Solution',
      goal: 'One line of value: reps ready in 72 hours, live help.',
      spokenText: `"That's what we fix: new reps practice on AI buyers and are call-ready in 72 hours, with live objection help on the call. How are you ramping new hires now?"`,
      deliveryTip: 'Talk floor economics and rep confidence, not features.'
    },
    {
      step: 4,
      name: '4. Close',
      goal: 'Book 15 minutes with founder Emil.',
      spokenText: `"{{first_name}}, let's get you 15 minutes with Emil, our founder, to run this on your floor numbers. Which works better, Thursday at 2 PM or Friday morning?"`,
      deliveryTip: 'Give two times, then stay quiet.'
    }
  ];

  const NEUTRAL_SCRIPT_STEPS = [
    {
      step: 1,
      name: '1. Opener',
      goal: 'Introduce yourself and get permission to continue.',
      spokenText: `"Hi {{first_name}}, this is {{rep_name}} with {{my_company}}. I know I'm catching you out of the blue. Do you have 30 seconds for me to explain why I'm calling?"`,
      deliveryTip: 'Calm, confident, unhurried tone. Do not apologize for calling.'
    },
    {
      step: 2,
      name: '2. Problem',
      goal: 'Name the problem your offer solves and ask if it applies.',
      spokenText: `"We talk to a lot of people in roles like yours, and many tell us [the main problem you solve]. Is that something you're seeing at {{company}} right now?"`,
      deliveryTip: 'Stop talking after the question and let the prospect answer.'
    },
    {
      step: 3,
      name: '3. Solution',
      goal: 'Explain in one or two sentences how you help.',
      spokenText: `"That's where {{my_company}} comes in. [One sentence on what you do and the result your customers get.]"`,
      deliveryTip: 'Keep it short and focused on their outcome, not your features.'
    },
    {
      step: 4,
      name: '4. Close',
      goal: 'Book a short follow-up meeting.',
      spokenText: `"{{first_name}}, would it make sense to set up a short call to see if this is a fit for {{company}}? Does later this week work, or is next week better?"`,
      deliveryTip: 'Offer two time options to make scheduling easy.'
    }
  ];
  const DEFAULT_SCRIPT_STEPS = isDemo ? DEMO_SCRIPT_STEPS : NEUTRAL_SCRIPT_STEPS;

  // A playbook saved for this workspace wins; otherwise the default for this workspace.
  const [savedScriptSteps, setScriptSteps] = useState<typeof DEMO_SCRIPT_STEPS | null>(null);
  const scriptSteps = savedScriptSteps ?? DEFAULT_SCRIPT_STEPS;

  useEffect(() => {
    const loadTenantScripts = () => {
      try {
        const saved = localStorage.getItem('tenant_phone_scripts');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setScriptSteps(parsed);
          }
        }
      } catch (err) {
        console.warn('[Cockpit] Failed to load tenant phone scripts:', err);
      }
    };

    loadTenantScripts();
    window.addEventListener('storage', loadTenantScripts);
    window.addEventListener('appointmentlyy_playbook_updated', loadTenantScripts);
    return () => {
      window.removeEventListener('storage', loadTenantScripts);
      window.removeEventListener('appointmentlyy_playbook_updated', loadTenantScripts);
    };
  }, []);

  const activeStepData = scriptSteps[currentStep - 1] || scriptSteps[0];

  // Helper to construct synthesized CRM notes
  const buildNotes = (params?: {
    tel?: CallTelemetryState;
    disp?: string | null;
    cTitle?: string;
    customNotes?: string;
    cName?: string;
    pName?: string;
    cPhone?: string;
  }): string => {
    const activeTel = params?.tel || telemetry;
    const activeDisp = params?.disp !== undefined ? params.disp : disposition;
    return synthesizeCrmNotes({
      contactName: params?.cName || customerName,
      companyName: params?.pName || partnerName,
      title: params?.cTitle || title,
      department: 'Operations & BDM',
      headcount: headcount || '100+ seats',
      phone: params?.cPhone || phone,
      cadenceDay: 2,
      stepName: scriptSteps[currentStep - 1]?.name || 'Day 2 Phone Outreach',
      telemetry: activeTel,
      disposition: activeDisp,
      customRepNotes: params?.customNotes !== undefined ? params.customNotes : customRepNotes
    });
  };

  const [notesDraft, setNotesDraft] = useState<string>(() => synthesizeCrmNotes({
    contactName: activeLead.name,
    companyName: activeLead.company,
    title: activeLead.title,
    department: 'Operations & BDM',
    headcount: activeLead.headcount,
    phone: activeLead.phone,
    cadenceDay: 2,
    stepName: '1. The Opener',
    telemetry: INITIAL_TELEMETRY_STATE,
    disposition: null,
    customRepNotes: ''
  }));

  // Sync tenant calendar link from storage
  useEffect(() => {
    setTenantCalendarLink(readTenantCalendarLink());
  }, [isDemo]);

  // 1. Load Stored Leads on Mount (practice calls use the persona lead instead)
  useEffect(() => {
    if (practiceMode) return;
    try {
      const storedLeads = localStorage.getItem('sdr_active_csv_leads');
      if (storedLeads) {
        const parsed = JSON.parse(storedLeads);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLeadsQueue(parsed);
          const first = parsed[0];
          setCustomerName(first.name);
          setPartnerName(first.company);
          setTitle(first.title);
          setPhone(first.phone);
          setDirectEmail(first.email);
          setHeadcount(first.headcount);
          setLeadWebsite(first.website || '');
          setLeadLinkedinUrl(first.linkedinUrl || '');
          setNotesDraft(synthesizeCrmNotes({
            contactName: first.name,
            companyName: first.company,
            title: first.title,
            department: 'Operations & BDM',
            headcount: first.headcount,
            phone: first.phone,
            cadenceDay: 2,
            stepName: '1. The Opener',
            telemetry: INITIAL_TELEMETRY_STATE,
            disposition: null,
            customRepNotes: ''
          }));
        }
      } else {
        const savedEmail = localStorage.getItem('sdr_target_recipient_email');
        if (savedEmail && savedEmail.includes('@')) {
          setDirectEmail(savedEmail);
        }
      }
    } catch (e) {
      console.warn('Could not load stored leads in Calling Floor:', e);
    }
  }, [practiceMode]);

  // 2. Track Activities Count
  useEffect(() => {
    try {
      setCompletedActivityCount(getDailyActivitySummary().totalActivities);
    } catch { }
    const unsubscribe = subscribeToActivities(() => {
      try {
        setCompletedActivityCount(getDailyActivitySummary().totalActivities);
      } catch { }
    });
    return () => unsubscribe();
  }, []);

  // 3. Call Timer
  useEffect(() => {
    let interval: any = null;
    if (callActive) {
      interval = setInterval(() => {
        setCallTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setCallTimerSeconds(0);
    }
    return () => clearInterval(interval);
  }, [callActive]);

  // Sync Active Lead when Queue Index Changes
  const selectLeadAtIndex = (index: number) => {
    // NaN (modulo of an empty queue) or out of range: nothing to select.
    if (!Number.isInteger(index) || index < 0 || index >= leadsQueue.length || !leadsQueue[index]) return;
    setCurrentLeadIndex(index);
    const lead = leadsQueue[index];
    setCustomerName(lead.name);
    setPartnerName(lead.company);
    setTitle(lead.title);
    setPhone(lead.phone);
    setDirectEmail(lead.email);
    setHeadcount(lead.headcount);
    setLeadWebsite(lead.website || '');
    setLeadLinkedinUrl(lead.linkedinUrl || '');
    setDisposition(null);
    setLastCallbackId(null);
    setCurrentStep(1);
    setSelectedRebuttalId(null);
    setIsCallingActive(false);

    // Reset Telemetry for New Lead
    setTelemetry(INITIAL_TELEMETRY_STATE);
    setRoleStatus(null);
    setRecognizedOA(null);
    setPriceTrapStatus(null);
    setBookingSlot(null);
    setDirectMobileInput('');
    setCustomRepNotes('');
    setNotesDraft(synthesizeCrmNotes({
      contactName: lead.name,
      companyName: lead.company,
      title: lead.title,
      department: 'Operations & BDM',
      headcount: lead.headcount,
      phone: lead.phone,
      cadenceDay: lead.cadenceDay || 2,
      stepName: '1. The Opener',
      telemetry: INITIAL_TELEMETRY_STATE,
      disposition: null,
      customRepNotes: ''
    }));

    // Sync active email globally
    if (lead.email && typeof window !== 'undefined') {
      localStorage.setItem('sdr_target_recipient_email', lead.email);
    }
  };

  // Qualification Checkpoint Handlers
  const handleSetRole = (status: 'confirmed' | 'promoted' | 'changed') => {
    setRoleStatus(status);
    let nextTel: CallTelemetryState;
    if (status === 'confirmed') {
      nextTel = {
        ...telemetry,
        roleVerified: true,
        roleTitleStatus: `Verified active in role (${title})`
      };
      setTelemetry(nextTel);
      setNotesDraft(buildNotes({ tel: nextTel }));
    } else if (status === 'promoted') {
      nextTel = {
        ...telemetry,
        roleVerified: true,
        roleTitleStatus: `Promoted to ${promotedTitleInput || 'New Leadership Title'}`
      };
      setTelemetry(nextTel);
      setNotesDraft(buildNotes({ tel: nextTel }));
    } else {
      nextTel = {
        ...telemetry,
        roleVerified: false,
        roleTitleStatus: `Left role / Referral noted (${referralContactInput || 'New DM pending'})`
      };
      setTelemetry(nextTel);
      setDisposition('Referral / Update Contact');
      setNotesDraft(buildNotes({ tel: nextTel, disp: 'Referral / Update Contact' }));
    }
  };

  const handleSetOA = (val: boolean) => {
    setRecognizedOA(val);
    const nextTel = {
      ...telemetry,
      directoryDiscussed: true,
      sharedLeadComment: val
        ? 'Confirmed Outsource Accelerator awareness'
        : 'Unfamiliar with broker directories'
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel }));
  };

  const handleSetPriceTrap = (status: 'confirmed' | 'denial') => {
    setPriceTrapStatus(status);
    const nextTel = {
      ...telemetry,
      directoryDiscussed: true,
      sharedLeadConfirmed: status === 'confirmed',
      sharedLeadComment: status === 'confirmed'
        ? 'Confirmed: Competing against 3-5 BPOs on identical Outsource Accelerator lists ($8/hr price war)'
        : 'Claims lists are exclusive / defended margins'
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel }));
  };

  const handleToggleProblemFix = () => {
    const nextVal = !telemetry.problemFixDiscussed;
    const nextTel = {
      ...telemetry,
      problemFixDiscussed: nextVal
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel }));
  };

  const handleSetService = (serv: string) => {
    const nextTel = {
      ...telemetry,
      primaryService: serv
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel }));
  };

  const handleSelectSlot = (slot: string) => {
    setBookingSlot(slot);
    setDisposition('Meeting Booked');
    const nextTel = {
      ...telemetry,
      screenSharePitched: true,
      screenShareSlot: slot
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel, disp: 'Meeting Booked' }));
  };

  const handleToggleAttendance = () => {
    const nextVal = !telemetry.attendanceVerified;
    const nextTel = {
      ...telemetry,
      attendanceVerified: nextVal,
      zeroPrepConfirmed: nextVal
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel }));
  };

  const handleUpdateDirectMobile = (mob: string) => {
    setDirectMobileInput(mob);
    const nextTel = {
      ...telemetry,
      directMobileCaptured: mob
    };
    setTelemetry(nextTel);
    setNotesDraft(buildNotes({ tel: nextTel }));
  };

  const handleResetTelemetry = () => {
    setTelemetry(INITIAL_TELEMETRY_STATE);
    setRoleStatus(null);
    setRecognizedOA(null);
    setPriceTrapStatus(null);
    setBookingSlot(null);
    setDirectMobileInput('');
    setCustomRepNotes('');
    setNotesDraft(synthesizeCrmNotes({
      contactName: customerName,
      companyName: partnerName,
      title,
      department: 'Operations & BDM',
      headcount,
      phone,
      cadenceDay: 2,
      stepName: scriptSteps[currentStep - 1]?.name || '1. The Opener',
      telemetry: INITIAL_TELEMETRY_STATE,
      disposition: null,
      customRepNotes: ''
    }));
  };

  // GLOBAL EMAIL CONFIRMATION SYNC
  const handleConfirmedEmailChange = (newEmail: string) => {
    setDirectEmail(newEmail);
    setEmailSavedToast(true);
    setTimeout(() => setEmailSavedToast(false), 2500);

    if (typeof window !== 'undefined') {
      localStorage.setItem('sdr_target_recipient_email', newEmail);
    }

    if (leadsQueue.length > 0 && currentLeadIndex >= 0 && currentLeadIndex < leadsQueue.length) {
      const updatedQueue = [...leadsQueue];
      updatedQueue[currentLeadIndex] = {
        ...updatedQueue[currentLeadIndex],
        email: newEmail
      };
      setLeadsQueue(updatedQueue);
      try {
        localStorage.setItem('sdr_active_csv_leads', JSON.stringify(updatedQueue));
      } catch (e) {
        console.warn('Could not persist updated leads queue:', e);
      }
    }
  };

  // Interpolate dynamic tags into scripts and rebuttals
  const interpolate = (text: string): string => {
    if (!text) return '';
    const firstName = customerName.split(' ')[0] || 'there';
    return text
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{full_name\}\}/gi, customerName || 'there')
      .replace(/\{\{rep_name\}\}/gi, repName)
      .replace(/\{\{my_company\}\}/gi, sessionTenant || 'our team')
      .replace(/\{\{company\}\}/gi, partnerName || 'your team')
      .replace(/\{\{title\}\}/gi, title || 'Executive')
      .replace(/\{\{phone\}\}/gi, phone || '')
      .replace(/\{\{email\}\}/gi, directEmail || '')
      .replace(/\{\{headcount\}\}/gi, headcount || '50+ seats');
  };

  // Selected Rebuttal Object
  const activeRebuttal = useMemo(() => {
    if (!selectedRebuttalId) return null;
    return PRESET_REBUTTALS.find(r => r.id === selectedRebuttalId) || null;
  }, [selectedRebuttalId, PRESET_REBUTTALS]);

  // Simulated call (demo workspace and practice): ringing, then the AI prospect picks up.
  const startSimulatedCall = (rebuttal: typeof activeRebuttal = activeRebuttal) => {
    setDemoCallObjection(rebuttal ? { label: rebuttal.shortLabel, line: interpolate(rebuttal.trigger) } : null);
    setDemoCallPhase('ringing');
    setIsCallingActive(true);
    if (practiceMode) {
      // Fresh practice call: the drilled objection stays in the banner; the teleprompter starts at the opener.
      practiceObjectionIdRef.current = rebuttal?.id ?? null;
      practiceTurnsRef.current = [];
      setPracticeSummary(null);
      setPracticeSummaryOpen(false);
      setDisposition(null);
      setSelectedRebuttalId(null);
      setCurrentStep(1);
      setPracticeStepsReached([1]);
    }
    if (demoRingTimer.current) clearTimeout(demoRingTimer.current);
    demoRingTimer.current = setTimeout(() => {
      setDemoCallPhase('connected');
      setCallTimerSeconds(0);
      practiceCallStartRef.current = Date.now();
    }, 3500);
  };

  // Practice: hang up or pick an outcome. A call that connected opens the summary.
  const endPracticeCall = (outcome: string | null) => {
    if (demoRingTimer.current) clearTimeout(demoRingTimer.current);
    const connected = isCallingActive && demoCallPhase === 'connected';
    setIsCallingActive(false);
    if (connected) {
      setPracticeSummary({
        id: `practice-${nowMs()}`,
        turns: [...practiceTurnsRef.current],
        objectionLabel: demoCallObjection?.label ?? null,
        stepsReached: practiceStepsReached,
        durationSec: Math.max(0, Math.round((nowMs() - practiceCallStartRef.current) / 1000)),
        outcome,
      });
      setPracticeSummaryOpen(true);
    } else if (practiceSummary && outcome) {
      setPracticeSummary({ ...practiceSummary, outcome });
      setPracticeSummaryOpen(true);
    }
  };

  const handlePracticeOutcome = (value: string) => {
    setDisposition(value);
    setNotesDraft(buildNotes({ disp: value }));
    setPracticeSummary(prev => (prev ? { ...prev, outcome: value } : prev));
  };

  const handlePracticeTryAgain = () => {
    handleResetTelemetry();
    startSimulatedCall(PRESET_REBUTTALS.find(r => r.id === practiceObjectionIdRef.current) ?? null);
  };

  // Move the teleprompter to a script step (practice calls remember which steps were reached).
  const goToStep = (step: number) => {
    setSelectedRebuttalId(null);
    setCurrentStep(step);
    if (practiceMode && isCallingActive && demoCallPhase === 'connected') {
      setPracticeStepsReached(prev => (prev.includes(step) ? prev : [...prev, step]));
    }
  };

  // Save Direct Note on Lead Record (For Non-CRM Customers)
  const handleSaveLeadNote = () => {
    if (!leadNoteInput.trim()) return;
    if (practiceMode) {
      setActivityToast('Practice call: notes stay on this screen and are not saved to any contact.');
      setTimeout(() => setActivityToast(null), 3500);
      return;
    }
    const targetId = activeLead.id || directEmail;
    const updated = addContactNote(targetId, leadNoteInput.trim(), repName);
    setLeadNoteInput('');
    setLeadNoteSavedToast(true);
    setTimeout(() => setLeadNoteSavedToast(false), 3000);

    if (updated) {
      setLeadsQueue(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
      setActivityToast('✓ Direct lead note saved & appended to historical footprint');
      setTimeout(() => setActivityToast(null), 3000);
    }
  };

  // Call outcomes configured in Admin › Call outcomes (active ones go under "More outcomes"),
  // and the Pipeline stages each outcome moves the lead to.
  const storedDispositions = useSyncExternalStore(subscribeToDispositions, getDispositionsSnapshot, getServerDispositionsSnapshot);
  const activeDispositions = useMemo(() => storedDispositions.filter(d => d.isActive), [storedDispositions]);
  const pipelineStages = useSyncExternalStore(subscribeToPipelineStages, getPipelineStagesSnapshot, getServerPipelineStagesSnapshot);
  // The Pipeline stage the last logged outcome moved the lead to (shown next to "Logged: ...").
  const [loggedStage, setLoggedStage] = useState<{ disposition: string; label: string | null } | null>(null);
  // A configured callback-type outcome picked from "More outcomes" waits here for the scheduler.
  const [pendingCallbackOutcome, setPendingCallbackOutcome] = useState<CallDisposition | null>(null);

  // Handle Call Outcome / Disposition Selection
  const handleSelectDisposition = (
    dispName: string,
    opts?: { suppressToast?: boolean; skipTelephony?: boolean; outcome?: CallDisposition | null }
  ): string | undefined => {
    if (!dispName) return;
    if (practiceMode) {
      // Training only: no contact touch, activity log, callback, CRM or telephony write.
      setDisposition(dispName);
      setNotesDraft(buildNotes({ disp: dispName }));
      endPracticeCall(dispName);
      return;
    }
    const outcomeDef = opts?.outcome ?? { name: dispName };
    setDisposition(dispName);
    setIsCallingActive(false);
    if (viaVicidial && !opts?.skipTelephony) {
      // VICIdial codes are mapped per quick button; other outcomes use the nearest quick button's code.
      const telephonyName = getOutcomeCodes()[dispName]
        ? dispName
        : (getQuickOutcomeForRole(getOutcomeRole(outcomeDef)) ?? dispName);
      void telephony.setOutcome(telephonyName).then((r) => {
        if (!r.ok) showTelephonyNotice(r.message);
      });
    }

    const updatedNotes = buildNotes({ disp: dispName });
    setNotesDraft(updatedNotes);

    // Move the lead to the outcome's Pipeline stage (and give an unowned lead to this rep).
    const stage = resolveOutcomeStage(outcomeDef, pipelineStages);
    setLoggedStage({ disposition: dispName, label: stage?.label ?? null });
    const targetId = activeLead.id || directEmail;
    const updated = recordCallOutcome({
      contactIdOrEmail: targetId,
      disposition: dispName,
      stageStatus: stage?.statusValue ?? null,
      title: `Call Note • ${dispName}`,
      summary: updatedNotes,
      repName,
      tenantId: orgTenantCode,
      lead: {
        id: activeLead.id || undefined,
        name: customerName || activeLead.name,
        company: partnerName || activeLead.company,
        title: title || activeLead.title,
        department: activeLead.department,
        email: directEmail || activeLead.email,
        phone: phone || activeLead.phone,
        headcount: headcount || activeLead.headcount,
        website: leadWebsite,
        linkedinUrl: leadLinkedinUrl,
        cadenceDay: activeLead.cadenceDay,
        touchNumber: activeLead.touchNumber
      }
    });

    if (updated) {
      setLeadsQueue(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
    }

    // Log Cadence Activity with full synthesized CRM call notes
    try {
      const activity = logCadenceActivity({
        repName,
        prospectName: customerName,
        companyName: partnerName,
        channel: 'Phone',
        cadenceDay: activeLead.cadenceDay || 2,
        touchNumber: activeLead.touchNumber || 3,
        stepName: `Phone Call • ${dispName}`,
        disposition: dispName,
        notesSnippet: updatedNotes,
        signalsContext: activeLead.buyingSignals || [],
        website: leadWebsite,
        linkedinUrl: leadLinkedinUrl
      });
      setCompletedActivityCount(prev => prev + 1);
      if (!opts?.suppressToast) {
        setActivityToast(`✓ Call logged: ${dispName}${stage ? ` • Pipeline: ${stage.label}` : ''} • Footprint & CRM Synced`);
        setTimeout(() => setActivityToast(null), 3500);
      }
      return activity.id;
    } catch (err) {
      console.warn('Activity logging notice:', err);
    }
  };

  // Callback outcome: reps in this org, this lead's callbacks, and the scheduler confirm handler
  const callbackRoster = useMemo(
    () => getOrgRepRoster(orgTenantCode, sessionTenant, repName),
    [orgTenantCode, sessionTenant, repName]
  );
  const activeLeadKey = activeLead.id || directEmail;
  const leadCallbacks = callbackTasks
    .filter(t => t.contactId === activeLeadKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Re-read the lead from the contact store so new footprint entries show in History
  const refreshLeadFromStore = (contactId: string) => {
    const fresh = getStoredContacts().find(c => c.id === contactId || c.email?.toLowerCase() === contactId.toLowerCase());
    if (fresh) setLeadsQueue(prev => prev.map(l => l.id === fresh.id ? { ...l, ...fresh } : l));
  };

  const handleConfirmCallback = (input: ScheduleCallbackInput) => {
    const targetId = activeLead.id || directEmail;
    // Same disposition path as every other outcome (footprint, activity log, CRM notes).
    // A callback outcome picked from "More outcomes" is logged under its own name.
    const callbackOutcome = pendingCallbackOutcome;
    setPendingCallbackOutcome(null);
    const activityId = handleSelectDisposition(callbackOutcome?.name || CALLBACK_DISPOSITION, {
      suppressToast: true,
      skipTelephony: true,
      outcome: callbackOutcome
    });
    if (viaVicidial) {
      // The callback time goes to VICIdial too, so its own callback list matches ours.
      void telephony
        .setOutcome(CALLBACK_DISPOSITION, { dueAt: input.dueAt, note: input.note, userOnly: input.assignedTo === repName })
        .then((r) => {
          if (!r.ok) showTelephonyNotice(r.message);
        });
    }
    const task = createCallbackTask({
      tenantCode: orgTenantCode,
      contactId: targetId,
      contactName: customerName,
      companyName: partnerName,
      phone,
      email: directEmail,
      dueAt: input.dueAt,
      timeZone: input.timeZone,
      note: input.note,
      createdBy: repName,
      assignedTo: input.assignedTo,
      activityId
    });
    refreshLeadFromStore(targetId);
    setIsCallbackDialogOpen(false);
    setLastCallbackId(task.id);
  };

  const handleCallbackReassigned = (task: CallbackTask) => {
    refreshLeadFromStore(task.contactId);
  };

  const handleOpenCallbackLead = (task: CallbackTask) => {
    const idx = leadsQueue.findIndex(l =>
      l.id === task.contactId || (!!l.email && l.email.toLowerCase() === (task.email || task.contactId).toLowerCase())
    );
    if (idx >= 0) {
      selectLeadAtIndex(idx);
      setActiveRightTab('footprint');
    } else {
      setActivityToast(`${task.contactName} is not in your current call queue.`);
      setTimeout(() => setActivityToast(null), 3500);
    }
  };

  // Advance to Next Lead
  const handleProceedToNextLead = () => {
    const nextIndex = (currentLeadIndex + 1) % leadsQueue.length;
    selectLeadAtIndex(nextIndex);
  };

  // Copy Helper
  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Short neutral follow-up (no AI needed).
  const handleQuickEmailTemplate = () => {
    const firstName = customerName.split(' ')[0] || 'there';
    setQuickEmailSubject('following up');
    setQuickEmailBody(
      `Hi ${firstName},\n\nThanks for your time on the call just now. As discussed, here is a quick note to confirm the next step.\n\n${tenantCalendarLink ? `If it helps, you can pick a time here: ${tenantCalendarLink}` : 'Does that still work on your side?'}\n\nBest,\n${repName.split(' ')[0] || repName}`
    );
  };

  // When the open callback for this lead is due, e.g. "Friday 10:00 AM" ('' when none).
  const openCallbackWhen = () =>
    lastCallback && lastCallback.status === 'open' ? new Date(lastCallback.dueAt).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : '';

  // Merge-field values for follow-up templates: the lead, this call and the signed-in rep.
  const followUpTemplateValues = () => ({
    first_name: (customerName || '').trim().split(/\s+/)[0] || '',
    company: (partnerName || '').trim(),
    title: (title || '').trim(),
    sender_name: repName.trim().split(/\s+/)[0] || '',
    sender_company: sessionTenant || '',
    meeting_time: bookingSlot || '',
    callback_time: openCallbackWhen(),
  });
  // A template field left unfilled ({{meeting_time}}...) must never reach the prospect.
  const quickEmailGaps = unfilledMergeFields(quickEmailSubject, quickEmailBody);

  // What the follow-up assistant knows from this call.
  const buildFollowUpContext = (): AssistantCallContext => {
    const step = scriptSteps.find((s) => s.step === currentStep) || scriptSteps[currentStep - 1];
    const callbackWhen = openCallbackWhen();
    const turns = followUpTurnsRef.current.slice(-12);
    return {
      outcome: disposition || '',
      agreedTime: bookingSlot || callbackWhen,
      scriptStep: step ? `${step.name}: ${step.goal}` : '',
      objection: demoCallObjection?.label || activeRebuttal?.shortLabel || '',
      notes: [dispositionNotes, customRepNotes, leadNoteInput, activeContact?.leadNotes].map((s) => (typeof s === 'string' ? s : '').trim()).filter(Boolean).join(' | '),
      transcript: turns.map((x) => `${x.role === 'rep' ? 'Rep' : 'Prospect'}: ${x.content}`).join('\n'),
    };
  };

  // Open Quick Follow-up Email Modal
  const handleOpenQuickEmail = () => {
    // Opens with the AI assistant already asking what to send (the short template stays one click away).
    const session = quickEmailSession + 1;
    setQuickEmailSubject('');
    setQuickEmailBody('');
    setQuickEmailSuccess(null);
    setQuickEmailCallContext(buildFollowUpContext());
    setQuickEmailAiStart({
      key: `followup-${session}`,
      idea: 'Post-call follow-up: acknowledge the call, give the next steps, and end with an anti-sales CTA.',
      label: 'Help me write the follow-up for this call.',
    });
    setQuickEmailSession(session);
    setIsQuickEmailOpen(true);
  };

  // Send Quick Follow-up Email
  const handleSendQuickEmail = async () => {
    // Already sent (or sending): never dispatch the same follow-up twice.
    if (isSendingQuickEmail || quickEmailSuccess) return;
    if (quickEmailGaps.length > 0) return;
    if (!directEmail || !directEmail.includes('@')) {
      alert('Please enter a valid recipient email address.');
      return;
    }
    setIsSendingQuickEmail(true);
    setQuickEmailSuccess(null);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: directEmail,
          from: `${repName} <emil@appointmentlyy.com>`,
          subject: quickEmailSubject,
          body: quickEmailBody,
          prospectName: customerName,
          companyName: partnerName
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setQuickEmailSuccess('Email dispatched successfully via Resend!');

        const targetId = activeLead.id || directEmail;
        const updated = recordContactTouch(targetId, {
          type: 'email',
          title: `Email Dispatched: ${quickEmailSubject}`,
          summary: quickEmailBody,
          repName
        });
        if (updated) {
          setLeadsQueue(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
        }

        setTimeout(() => {
          setIsQuickEmailOpen(false);
          setQuickEmailSuccess(null);
        }, 1800);
      } else {
        alert(data.message || 'Error dispatching email.');
      }
    } catch (e: any) {
      alert('Network or dispatch error.');
    } finally {
      setIsSendingQuickEmail(false);
    }
  };



  // Embedded (Practice page tab): no page shell or own scroll area; the host page provides them.
  const CanvasTag = embedded ? 'div' : 'main';

  return (
    <div className={embedded ? 'w-full font-sans antialiased text-fg' : 'flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg'}>


      {/* 2. MAIN APP SHELL */}
      <div className={embedded ? 'flex min-w-0 flex-col' : 'flex-1 flex flex-col min-w-0 overflow-hidden'}>


        {/* Scrollable Canvas */}
        <CanvasTag className={embedded ? 'space-y-4' : 'flex-1 overflow-y-auto px-6 py-5 space-y-4'}>

          {/* TOP FLOOR HEADER & UTILITY BAR */}
          {practiceMode && practicePersona && practice ? (
            <>
              {!embedded && (
                <PageHeader
                  title="Practice call"
                  description="Your real Dialer, script and objections, with an AI buyer on the line."
                  className="pb-2"
                />
              )}
              <PracticeBanner
                embedded={embedded}
                persona={practicePersona}
                objectionLabel={(isCallingActive || practiceSummary ? demoCallObjection?.label : activeRebuttal?.shortLabel) ?? null}
                difficulty={practice.difficulty}
              />
            </>
          ) : (
          <PageHeader
            title="Calling floor"
            description={hasNoLeads ? 'No leads in your queue yet' : `Current account: ${partnerName}`}
            className="pb-2"
            secondaryActions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsDailyReportOpen(true)}
                  icon={<BarChart3 className="text-fg-secondary" />}
                >
                  <span>Activity</span>
                  <span className="rounded-sm bg-subtle px-1.5 text-caption tabular-nums leading-5 text-fg-secondary">
                    {completedActivityCount}
                  </span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsCadenceModalOpen(true)}
                  icon={<Clock className="text-fg-secondary" />}
                >
                  Cadence
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCalendlyModal(true)}
                  icon={<Calendar className="text-fg-secondary" />}
                >
                  Calendly
                </Button>
              </>
            }
          />
          )}

          {/* ACTIVITY BANNER NOTIFICATION */}
          {activityToast && (
            <div className="flex items-center justify-between rounded-lg border border-success-500/40 bg-success-bg px-3.5 py-2 text-small font-medium text-success-fg animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-success-fg" />
                <span>{activityToast}</span>
              </div>
              <IconButton
                label="Dismiss"
                size="sm"
                onClick={() => setActivityToast(null)}
                className="text-success-fg hover:bg-success-bg hover:text-success-fg"
              >
                <X />
              </IconButton>
            </div>
          )}

          {/* CALLBACK CONFIRMATION (with reassignment for the rep who scheduled it) */}
          {lastCallback && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success-500/40 bg-success-bg px-3.5 py-2 text-small font-medium text-success-fg animate-in fade-in"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-success-fg" />
                <span>{formatCallbackConfirmation(lastCallback)}</span>
              </div>
              <div className="flex items-center gap-2">
                <CallbackReassignSelect
                  task={lastCallback}
                  roster={callbackRoster}
                  actor={callbackActor}
                  onReassigned={handleCallbackReassigned}
                  className="w-56"
                />
                <Button variant="ghost" size="sm" onClick={() => setActiveRightTab('callbacks')}>
                  View callbacks
                </Button>
                <IconButton
                  label="Dismiss"
                  size="sm"
                  onClick={() => setLastCallbackId(null)}
                  className="text-success-fg hover:bg-success-bg hover:text-success-fg"
                >
                  <X />
                </IconButton>
              </div>
            </div>
          )}

          {hasNoLeads ? (
            <div className="rounded-lg border border-line bg-surface shadow-xs">
              <EmptyState
                icon={<Users />}
                title="No leads yet"
                description="Import or add leads in Contacts or Lead Finder, then come back here to start calling."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Link href="/contacts" className={buttonClasses('primary', 'sm')}>
                      Go to Contacts
                    </Link>
                    <Link href="/lead-finder" className={buttonClasses('secondary', 'sm')}>
                      Open Lead Finder
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => setIsCsvModalOpen(true)} icon={<UploadCloud />}>
                      Import CSV
                    </Button>
                  </div>
                }
              />
            </div>
          ) : (<>
          {/* ========================================================================= */}
          {/* SECTION 1: UNIFIED LEAD HEADER, INLINE DIALER & 1-CLICK DISPOSITIONS      */}
          {/* ========================================================================= */}
          <div className="bg-surface border border-line rounded-lg p-4 shadow-xs space-y-3">

            {/* Main Unified Lead & Dialer Row */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

              {/* LEFT: Prospect Identity */}
              <div className="flex flex-wrap items-center gap-4 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-subtle text-body-strong text-ink-700">
                    {customerName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="truncate text-h2 text-fg">
                        {customerName}
                      </h2>
                      <span className="text-small tabular-nums text-fg-secondary">
                        {headcount}
                      </span>
                      {practiceMode ? (
                        <Badge tone="warning">Practice lead</Badge>
                      ) : (
                      <span className="text-small tabular-nums text-fg-tertiary">
                        {currentLeadIndex + 1} of {leadsQueue.length}
                      </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-small text-fg-secondary">
                      <span className="truncate">
                        {title} at <span className="text-body-strong text-fg">{partnerName}</span>
                      </span>
                      {leadWebsite && (
                        <a
                          href={leadWebsite.startsWith('http') ? leadWebsite : `https://${leadWebsite}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring flex items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg hover:underline"
                        >
                          <Globe className="size-3.5" />
                          <span>Website</span>
                        </a>
                      )}
                      {leadLinkedinUrl && (
                        <a
                          href={leadLinkedinUrl.startsWith('http') ? leadLinkedinUrl : `https://${leadLinkedinUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="focus-ring flex items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg hover:underline"
                        >
                          <LinkedinIcon className="size-3.5" />
                          <span>LinkedIn</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: Click-to-Call + Compact Email Input + Send Invite + Prev/Next Lead */}
              <div className="flex flex-wrap items-center gap-2">
                {/* INLINE CLICK-TO-CALL (the one crimson action on this screen) */}
                <div className="flex items-center gap-2">
                  {viaVicidial ? (
                    <button
                      type="button"
                      disabled={callActive}
                      onClick={async () => {
                        if (!phone) {
                          alert('No phone number entered for this prospect.');
                          return;
                        }
                        const r = await telephony.dial(phone, activeLead.id);
                        if (!r.ok) showTelephonyNotice(r.message);
                      }}
                      className="focus-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-action-brand px-3.5 text-body font-medium text-action-brand-fg transition-colors duration-150 hover:bg-action-brand-hover disabled:cursor-default"
                    >
                      {callActive ? (
                        <span className="size-2 shrink-0 rounded-full bg-action-brand-fg animate-pulse-soft" aria-hidden />
                      ) : (
                        <PhoneCall className="size-4 shrink-0" />
                      )}
                      <span className="tabular-nums" aria-live="polite">{callActive ? `On call (${callTimerSeconds}s)` : 'Call'}</span>
                      <span className="border-l border-action-brand-fg/30 pl-2 font-mono text-small">
                        {phone || 'No phone'}
                      </span>
                    </button>
                  ) : simulatedCall ? (
                    <button
                      type="button"
                      disabled={isCallingActive}
                      onClick={() => {
                        if (!phone) {
                          alert('No phone number entered for this prospect.');
                          return;
                        }
                        startSimulatedCall();
                      }}
                      className={`focus-ring relative inline-flex h-10 cursor-pointer items-center gap-2 rounded-md px-3.5 text-body font-medium transition-colors duration-300 disabled:cursor-default ${
                        isCallingActive
                          ? 'bg-success-500 text-white'
                          : 'bg-action-brand text-action-brand-fg hover:bg-action-brand-hover'
                      }`}
                    >
                      {isCallingActive && demoCallPhase === 'ringing' && (
                        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-success-500 motion-safe:animate-ping" />
                      )}
                      {isCallingActive ? (
                        demoCallPhase === 'ringing' ? (
                          <PhoneCall className="size-4 shrink-0 motion-safe:animate-pulse-soft" />
                        ) : (
                          <span className="size-2 shrink-0 rounded-full bg-white motion-safe:animate-pulse-soft" aria-hidden />
                        )
                      ) : (
                        <PhoneCall className="size-4 shrink-0" />
                      )}
                      <span className="tabular-nums" aria-live="polite">
                        {!isCallingActive
                          ? 'Call'
                          : demoCallPhase === 'ringing'
                            ? 'Ringing…'
                            : `Connected ${String(Math.floor(callTimerSeconds / 60)).padStart(2, '0')}:${String(callTimerSeconds % 60).padStart(2, '0')}`}
                      </span>
                      <span className={`border-l pl-2 font-mono text-small ${isCallingActive ? 'border-white/30' : 'border-action-brand-fg/30'}`}>
                        {phone || 'No phone'}
                      </span>
                    </button>
                  ) : (
                  <a
                    href={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '#'}
                    onClick={() => {
                      if (!phone) {
                        alert('No phone number entered for this prospect.');
                        return;
                      }
                      setIsCallingActive(true);
                    }}
                    className="focus-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-action-brand px-3.5 text-body font-medium text-action-brand-fg transition-colors duration-150 hover:bg-action-brand-hover"
                  >
                    {isCallingActive ? (
                      <span className="size-2 shrink-0 rounded-full bg-action-brand-fg animate-pulse-soft" aria-hidden />
                    ) : (
                      <PhoneCall className="size-4 shrink-0" />
                    )}
                    <span className="tabular-nums" aria-live="polite">{isCallingActive ? `Calling (${callTimerSeconds}s)` : 'Call'}</span>
                    <span className="border-l border-action-brand-fg/30 pl-2 font-mono text-small">
                      {phone || 'No phone'}
                    </span>
                  </a>
                  )}

                  {callActive && (
                    <IconButton
                      label="Hang up"
                      variant="danger"
                      className="size-10"
                      onClick={async () => {
                        if (practiceMode) {
                          endPracticeCall(null);
                          return;
                        }
                        if (viaVicidial) {
                          const r = await telephony.hangup();
                          if (!r.ok) showTelephonyNotice(r.message);
                        }
                        if (demoRingTimer.current) clearTimeout(demoRingTimer.current);
                        setIsCallingActive(false);
                      }}
                    >
                      <PhoneOff />
                    </IconButton>
                  )}

                  {viaVicidial && (
                    <span
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-caption text-fg-secondary"
                      title={telephony.problem || `VICIdial agent ${telephony.agentUser}`}
                    >
                      <span
                        aria-hidden
                        className={`size-1.5 rounded-full ${
                          telephony.agentState === 'ready' || telephony.agentState === 'in_call'
                            ? 'bg-success-500'
                            : telephony.agentState === 'paused' || telephony.agentState === 'wrap_up'
                              ? 'bg-warning-400'
                              : 'bg-danger-700'
                        }`}
                      />
                      VICIdial · {AGENT_STATE_LABEL[telephony.agentState] ?? 'Connecting'}
                      {telephony.agentState === 'unknown' && telephony.problem ? ' (offline)' : ''}
                    </span>
                  )}
                </div>

                {!practiceMode && (<>
                <div className="flex h-9 items-center gap-1 rounded-md border border-line-strong bg-surface pr-1 focus-within:border-brand-600">
                  <div className="relative flex items-center">
                    <Mail className="ml-2.5 mr-2 size-4 shrink-0 text-fg-tertiary" />
                    <input
                      type="email"
                      value={directEmail}
                      onChange={(e) => handleConfirmedEmailChange(e.target.value)}
                      placeholder="prospect@company.com"
                      className="w-52 bg-transparent py-1 pr-2 font-mono text-small text-fg placeholder:text-fg-disabled focus:outline-none"
                      title="Edit email to sync globally across Cold Email Studio, Inbox & Calendly"
                    />
                    {emailSavedToast && (
                      <Check className="mr-1.5 size-4 shrink-0 text-success-fg" />
                    )}
                  </div>
                  <IconButton
                    label="Email prospect"
                    size="sm"
                    onClick={handleOpenQuickEmail}
                    title="Send follow-up invite or deck"
                    className="size-7"
                  >
                    <Send />
                  </IconButton>
                </div>

                {/* Lead Queue Navigation */}
                <div className="flex items-center gap-1">
                  <IconButton
                    label="Previous lead"
                    variant="secondary"
                    disabled={leadsQueue.length === 0}
                    onClick={() => selectLeadAtIndex((currentLeadIndex - 1 + leadsQueue.length) % leadsQueue.length)}
                  >
                    <ChevronLeft />
                  </IconButton>
                  <Button
                    variant="primary"
                    onClick={handleProceedToNextLead}
                    disabled={!nextLeadCandidate}
                    title={nextLeadCandidate ? `Next lead: ${nextLeadCandidate.name || 'Unnamed lead'}` : 'No more leads in your queue'}
                  >
                    <span>Next</span>
                    <ChevronRight />
                  </Button>
                </div>
                </>)}
              </div>

            </div>

            {/* DEMO WORKSPACE: an AI prospect answers the simulated call and talks through the script */}
            {simulatedCall && isCallingActive && demoCallPhase === 'connected' && (
              <div className="pb-3">
                <AiProspectCall
                  key={activeLead?.id || 'lead'}
                  personaId={prospectPersona.id}
                  voiceId={practiceMode ? getPersonaVoiceByCountry(prospectPersona, 'USA').voiceId : prospectPersona.voiceId}
                  voiceSettings={prospectPersona.voiceSettings as Record<string, unknown> | undefined}
                  prospectName={activeLead?.name || prospectPersona.name}
                  difficulty={practiceMode ? practice?.difficulty : undefined}
                  onTurnsChange={(t) => { followUpTurnsRef.current = t; if (practiceMode) practiceTurnsRef.current = t; }}
                  scriptStep={currentStep}
                  objection={demoCallObjection}
                  scriptContext={{
                    goal: activeStepData?.goal || '',
                    text: interpolate(activeStepData?.spokenText || ''),
                    tip: activeStepData?.deliveryTip || '',
                  }}
                />
              </div>
            )}

            {/* 1-CLICK CALL DISPOSITION BAR */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-caption text-fg-tertiary">
                  Outcome
                </span>
                {OUTCOME_OPTIONS.map((item) => {
                  const isSelected = disposition === item.value;
                  // Practice: Callback is just an outcome (no scheduler, no callback task).
                  const opensScheduler = item.value === CALLBACK_DISPOSITION && !practiceMode;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        if (opensScheduler) {
                          setPendingCallbackOutcome(null);
                          setIsCallbackDialogOpen(true);
                        } else {
                          handleSelectDisposition(item.value);
                        }
                      }}
                      aria-pressed={isSelected}
                      aria-haspopup={opensScheduler ? 'dialog' : undefined}
                      className={`focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${isSelected ? item.activeClass : item.idleClass
                        }`}
                    >
                      {isSelected && <Check className="size-3.5" />}
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                {/* Every other active outcome from Admin › Call outcomes, with the stage it moves the lead to */}
                <MoreOutcomesMenu
                  outcomes={activeDispositions}
                  stages={pipelineStages}
                  selected={disposition}
                  quickValues={QUICK_OUTCOME_VALUES}
                  onPick={(d, schedulesCallback) => {
                    if (schedulesCallback && !practiceMode) {
                      setPendingCallbackOutcome(d);
                      setIsCallbackDialogOpen(true);
                    } else {
                      handleSelectDisposition(d.name, { outcome: d });
                    }
                  }}
                />
              </div>

              {disposition && (
                <span className="flex items-center gap-1.5 text-small text-success-fg">
                  <CheckCircle2 className="size-4 text-success-fg" />
                  <span>
                    {practiceMode ? `Outcome: ${disposition} (practice, not logged)` : `Logged: ${disposition}`}
                    {!practiceMode && loggedStage?.disposition === disposition && loggedStage.label && (
                      <span className="text-fg-secondary"> · Pipeline: {loggedStage.label}</span>
                    )}
                  </span>
                </span>
              )}
            </div>

          </div>

          {/* ========================================================================= */}
          {/* SECTION 2: CALLING FLOOR WORKSPACE (TELEPROMPTER + EYE-LEVEL REBUTTALS)   */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

            {/* LEFT: STEP-BY-STEP SPOKEN TELEPROMPTER & EYE-LEVEL REBUTTALS (7 cols) */}
            <div className="lg:col-span-7 bg-surface border border-line rounded-lg p-5 shadow-xs space-y-4">

              {/* Top Row: Step Navigation Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex flex-wrap items-center rounded-md border border-line bg-subtle p-0.5" aria-label="Script steps">
                  {scriptSteps.map((st) => {
                    const isStepActive = !activeRebuttal && currentStep === st.step;
                    return (
                      <button
                        key={st.step}
                        type="button"
                        onClick={() => goToStep(st.step)}
                        aria-pressed={isStepActive}
                        className={`focus-ring inline-flex h-8 cursor-pointer items-center rounded-[6px] px-3 text-small font-medium transition-colors duration-150 ${isStepActive
                            ? 'bg-surface text-fg shadow-xs'
                            : 'text-fg-secondary hover:text-fg'
                          }`}
                      >
                        {st.name}
                      </button>
                    );
                  })}
                </div>

                <Link
                  href="/admin/frameworks"
                  className={buttonClasses('ghost', 'sm')}
                  title="Upload custom sales playbook to personalize this teleprompter"
                >
                  <UploadCloud />
                  <span>Edit playbook</span>
                </Link>
              </div>

              {/* Instant 1-Click Rebuttal Trigger Bar (Eye-Level) */}
              <div className="space-y-2">
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-caption text-fg-tertiary">
                    <ShieldAlert className="size-3.5 text-fg-tertiary" />
                    <span>Objections: pick one to show its rebuttal on the teleprompter</span>
                  </span>
                  {activeRebuttal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRebuttalId(null)}
                      icon={<X />}
                      className="h-7 px-2"
                    >
                      Back to script
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_REBUTTALS.map((reb) => {
                    const isSelected = selectedRebuttalId === reb.id;
                    return (
                      <button
                        key={reb.id}
                        type="button"
                        onClick={() => setSelectedRebuttalId(isSelected ? null : reb.id)}
                        aria-pressed={isSelected}
                        className={`focus-ring inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-small font-medium transition-colors duration-150 ${isSelected
                            ? 'border-transparent bg-action text-action-fg'
                            : 'border-line-strong bg-surface text-fg hover:bg-subtle'
                          }`}
                      >
                        {reb.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MAIN TELEPROMPTER DISPLAY: Shows Active Rebuttal at Eye-Level OR Active Script Step */}
              {activeRebuttal ? (
                <div className="space-y-4 rounded-lg border border-ink-800 bg-ink-950 p-5 font-sans text-ink-50 animate-in fade-in duration-150">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 pb-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex h-5 items-center rounded-sm bg-ink-800 px-1.5 text-caption text-ink-50">
                        Rebuttal: {activeRebuttal.category}
                      </span>
                      <span className="text-small text-ink-400">
                        &ldquo;{activeRebuttal.trigger}&rdquo;
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyText(interpolate(activeRebuttal.fullSpoken), 'reb_copy')}
                        className="focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-ink-800 px-3 text-small font-medium text-ink-50 transition-colors duration-150 hover:bg-ink-700"
                      >
                        {copiedKey === 'reb_copy' ? <Check className="size-4 text-success-500" /> : <Copy className="size-4" />}
                        <span>Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRebuttalId(null)}
                        className="focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-ink-50 px-3 text-small font-medium text-ink-900 transition-colors duration-150 hover:bg-ink-200"
                      >
                        <span>Resume script</span>
                      </button>
                    </div>
                  </div>

                  {/* Large Eye-Level ARM Breakdown */}
                  <div className="space-y-3 select-text text-prompter">
                    <div className="rounded-md border border-ink-800 bg-ink-900 p-3">
                      <span className="mb-1 block font-sans text-caption text-ink-400">
                        1. Acknowledge
                      </span>
                      <p className="text-ink-50">{interpolate(activeRebuttal.acknowledge)}</p>
                    </div>

                    <div className="rounded-md border border-ink-800 bg-ink-900 p-3">
                      <span className="mb-1 block font-sans text-caption text-ink-400">
                        2. Respond
                      </span>
                      <p className="text-ink-50">{interpolate(activeRebuttal.respond)}</p>
                    </div>

                    <div className="rounded-md border border-ink-800 bg-ink-900 p-3">
                      <span className="mb-1 block font-sans text-caption text-ink-400">
                        3. Move: ask for the meeting
                      </span>
                      <p className="text-ink-50 underline decoration-ai decoration-2 underline-offset-[6px]">{interpolate(activeRebuttal.move)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* The Spoken Script (Large, Readable, Variable-Interpolated) */}
                  <div className="relative rounded-lg bg-ink-950 p-5 font-sans text-ink-50">
                    <div className="mb-3 flex items-start justify-between gap-2 border-b border-ink-800 pb-3 text-small">
                      <span className="text-ink-50">
                        <span className="font-medium">{activeStepData.name}</span>
                        <span className="text-ink-400">: {activeStepData.goal}</span>
                      </span>
                      <span className="ml-2 shrink-0 text-caption tabular-nums text-ink-400">
                        Step {currentStep} of {scriptSteps.length}
                      </span>
                    </div>

                    <p className="select-text text-prompter">
                      {interpolate(activeStepData.spokenText)}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink-800 pt-3">
                      <span className="flex items-start gap-1.5 text-small text-ink-400">
                        <Lightbulb className="mt-0.5 size-4 shrink-0 text-ink-400" />
                        <span>{activeStepData.deliveryTip}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(interpolate(activeStepData.spokenText), `step_${currentStep}`)}
                        className="focus-ring inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-ink-800 px-3 text-small font-medium text-ink-50 transition-colors duration-150 hover:bg-ink-700"
                      >
                        {copiedKey === `step_${currentStep}` ? <Check className="size-4 text-success-500" /> : <Copy className="size-4" />}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* COMPACT QUALIFICATION CHECKPOINTS */}
              <div className="space-y-3">
                {currentStep === 1 && (
                  <div className="space-y-2 rounded-lg border border-line bg-app p-3">
                    <span className="block text-caption text-fg-tertiary">
                      Quick qualify: role check
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetRole('confirmed')}
                        className={`py-1.5 px-2.5 rounded-md text-small font-medium transition-colors focus-ring border flex items-center justify-center gap-1 cursor-pointer ${roleStatus === 'confirmed'
                            ? 'bg-success-bg border-success-500/50 text-success-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <Check className="size-3.5" />
                        <span>Active role</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetRole('promoted')}
                        className={`py-1.5 px-2.5 rounded-md text-small font-medium transition-colors focus-ring border flex items-center justify-center gap-1 cursor-pointer ${roleStatus === 'promoted'
                            ? 'bg-action border-transparent text-action-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <span>New title</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetRole('changed')}
                        className={`py-1.5 px-2.5 rounded-md text-small font-medium transition-colors focus-ring border flex items-center justify-center gap-1 cursor-pointer ${roleStatus === 'changed'
                            ? 'bg-action border-transparent text-action-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <X className="size-3.5" />
                        <span>Referral</span>
                      </button>
                    </div>

                    {roleStatus === 'promoted' && (
                      <div className="flex items-center gap-2 rounded-md border border-line bg-surface p-2">
                        <input
                          type="text"
                          value={promotedTitleInput}
                          onChange={(e) => setPromotedTitleInput(e.target.value)}
                          placeholder="New title (e.g. VP Operations)"
                          className="focus-ring h-8 flex-1 rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg placeholder:text-fg-disabled"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (promotedTitleInput.trim()) {
                              setTitle(promotedTitleInput.trim());
                              const nextTel = { ...telemetry, roleVerified: true, roleTitleStatus: `Promoted to ${promotedTitleInput.trim()}` };
                              setTelemetry(nextTel);
                              setNotesDraft(buildNotes({ cTitle: promotedTitleInput.trim(), tel: nextTel }));
                            }
                          }}
                          className={buttonClasses('primary', 'sm', 'cursor-pointer')}
                        >
                          Save
                        </button>
                      </div>
                    )}

                    {roleStatus === 'changed' && (
                      <div className="flex items-center gap-2 rounded-md border border-line bg-surface p-2">
                        <input
                          type="text"
                          value={referralContactInput}
                          onChange={(e) => setReferralContactInput(e.target.value)}
                          placeholder="Referral name & contact"
                          className="focus-ring h-8 flex-1 rounded-sm border border-line-strong bg-surface px-2.5 text-small text-fg placeholder:text-fg-disabled"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nextTel = { ...telemetry, roleVerified: false, roleTitleStatus: `Left role / Referral: ${referralContactInput}` };
                            setTelemetry(nextTel);
                            setNotesDraft(buildNotes({ tel: nextTel, disp: 'Referral / Update Contact' }));
                          }}
                          className={buttonClasses('primary', 'sm', 'cursor-pointer')}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 2 && isDemo && (
                  <div className="space-y-2 rounded-lg border border-line bg-app p-3">
                    <span className="block text-caption text-fg-tertiary">
                      Quick qualify: lead source
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetOA(!recognizedOA)}
                        className={`py-1.5 px-3 rounded-md text-small font-medium transition-colors focus-ring border flex items-center justify-between cursor-pointer ${recognizedOA
                            ? 'bg-action border-transparent text-action-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <span>Uses lead brokers</span>
                        {recognizedOA ? <Check className="size-3.5" /> : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetPriceTrap(priceTrapStatus === 'confirmed' ? 'denial' : 'confirmed')}
                        className={`py-1.5 px-3 rounded-md text-small font-medium transition-colors focus-ring border flex items-center justify-between cursor-pointer ${priceTrapStatus === 'confirmed'
                            ? 'bg-danger-bg border-danger-fg/40 text-danger-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <span>Shared lead pain</span>
                        {priceTrapStatus === 'confirmed' ? <Check className="size-3.5" /> : null}
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="space-y-2 rounded-lg border border-line bg-app p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-fg-tertiary">
                        Quick qualify: core service and pitch
                      </span>
                      <button
                        type="button"
                        onClick={handleToggleProblemFix}
                        className={`px-2.5 py-1 rounded-md text-small font-medium focus-ring border flex items-center gap-1 transition-colors cursor-pointer ${telemetry.problemFixDiscussed
                            ? 'bg-success-bg border-success-500/50 text-success-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <Check className="size-3.5" />
                        <span>Value pitched</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {['Customer Support', 'Outbound Sales', 'Tech Support', 'Back-Office'].map((serv) => (
                        <button
                          key={serv}
                          type="button"
                          onClick={() => handleSetService(serv)}
                          className={`py-1.5 px-2 rounded-md text-small font-medium focus-ring border transition-colors cursor-pointer ${telemetry.primaryService === serv
                              ? 'bg-action border-transparent text-action-fg'
                              : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                            }`}
                        >
                          {serv}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="space-y-2 rounded-lg border border-line bg-app p-3">
                    <span className="block text-caption text-fg-tertiary">
                      Quick qualify: lock a demo slot
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Thu 2:00 PM', 'Fri 10:30 AM', 'Tue 2:00 PM'].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleSelectSlot(slot)}
                          className={`py-1.5 px-2 rounded-md text-small font-medium focus-ring border transition-colors cursor-pointer ${bookingSlot === slot
                              ? 'bg-success-bg border-success-500/50 text-success-fg'
                              : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                            }`}
                        >
                          {slot}{bookingSlot === slot ? <Check className="ml-1 inline size-3.5 align-[-2px]" /> : null}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleToggleAttendance}
                        className={`py-1.5 px-2.5 rounded-md text-small font-medium focus-ring border flex items-center justify-between transition-colors cursor-pointer ${telemetry.attendanceVerified
                            ? 'bg-success-bg border-success-500/50 text-success-fg'
                            : 'bg-surface border-line-strong text-fg hover:bg-subtle'
                          }`}
                      >
                        <span>Calendar confirmed</span>
                        {telemetry.attendanceVerified ? <Check className="size-3.5" /> : null}
                      </button>

                      <input
                        type="tel"
                        value={directMobileInput}
                        onChange={(e) => handleUpdateDirectMobile(e.target.value)}
                        placeholder="Mobile number for SMS"
                        className="focus-ring h-8 rounded-sm border border-line-strong bg-surface px-2.5 font-mono text-small text-fg placeholder:font-sans placeholder:text-fg-disabled"
                      />
                    </div>
                  </div>
                )}

                {/* Step Navigation Footer */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={currentStep === 1}
                    onClick={() => goToStep(Math.max(1, currentStep - 1))}
                    className={buttonClasses('ghost', 'sm', 'cursor-pointer disabled:opacity-40')}
                  >
                    <ChevronLeft />
                    <span>Back</span>
                  </button>

                  {currentStep < scriptSteps.length ? (
                    <button
                      type="button"
                      onClick={() => goToStep(Math.min(scriptSteps.length, currentStep + 1))}
                      className={buttonClasses('primary', 'sm', 'cursor-pointer')}
                    >
                      <span>Next step</span>
                      <ArrowRight />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelectDisposition('Meeting Booked')}
                      className={buttonClasses('primary', 'sm', 'cursor-pointer')}
                    >
                      <Check />
                      <span>Book meeting</span>
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT: NOTES & HISTORICAL FOOTPRINT (5 cols) */}
            <div className="lg:col-span-5 space-y-3">

              {/* Tab Navigation Segmented Control (practice: notes only, nothing from real contacts) */}
              {!practiceMode && (
              <div className="flex items-center rounded-md border border-line bg-subtle p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('notes')}
                  aria-pressed={activeRightTab === 'notes'}
                  className={`focus-ring flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-2 text-small font-medium transition-colors duration-150 ${activeRightTab === 'notes'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                    }`}
                >
                  <FileText className="size-4" />
                  <span>Notes and CRM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveRightTab('footprint')}
                  aria-pressed={activeRightTab === 'footprint'}
                  className={`focus-ring flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-2 text-small font-medium transition-colors duration-150 ${activeRightTab === 'footprint'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                    }`}
                >
                  <Clock className="size-4" />
                  <span>History</span>
                  {activeContact?.footprint && activeContact.footprint.length > 0 && (
                    <span className="rounded-sm bg-ink-200 px-1.5 text-caption tabular-nums leading-5 text-fg-secondary">
                      {activeContact.footprint.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveRightTab('callbacks')}
                  aria-pressed={activeRightTab === 'callbacks'}
                  className={`focus-ring flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] px-2 text-small font-medium transition-colors duration-150 ${activeRightTab === 'callbacks'
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-fg-secondary hover:text-fg'
                    }`}
                >
                  <Calendar className="size-4" />
                  <span>Callbacks</span>
                  {myOpenCallbackCount > 0 && (
                    <span className="rounded-sm bg-ink-200 px-1.5 text-caption tabular-nums leading-5 text-fg-secondary">
                      {myOpenCallbackCount}
                    </span>
                  )}
                </button>
              </div>
              )}

              {/* TAB 3: CALLBACK TASKS (assigned to me, scheduled by me, team for admins) */}
              {activeRightTab === 'callbacks' && !practiceMode && (
                <CallbacksPanel
                  tasks={callbackTasks}
                  roster={callbackRoster}
                  actor={callbackActor}
                  isAdmin={adminClearance}
                  onOpenLead={handleOpenCallbackLead}
                />
              )}

              {/* TAB 1: DIRECT LEAD NOTES & LIVE CRM NOTES */}
              {activeRightTab === 'notes' && (
                <div className="space-y-3 animate-in fade-in duration-150">

                  {/* DIRECT LEAD NOTES (FOR NON-CRM CUSTOMERS) */}
                  <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <h3 className="text-h3 text-fg">
                        Lead notes
                      </h3>
                      {leadNoteSavedToast && (
                        <span className="flex items-center gap-1 text-small text-success-fg animate-in fade-in">
                          <Check className="size-3.5" /> Saved
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <textarea
 aria-label="Lead notes"                        rows={2}
                        value={leadNoteInput}
                        onChange={(e) => setLeadNoteInput(e.target.value)}
                        placeholder="Add quick note on this lead..."
                        className="focus-ring w-full rounded-sm border border-line-strong bg-surface p-2.5 font-sans text-body text-fg placeholder:text-fg-disabled"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-small text-fg-tertiary">
                          Rep: <span className="text-fg-secondary">{repName}</span>
                        </span>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSaveLeadNote}
                          disabled={!leadNoteInput.trim()}
                          icon={<Check />}
                        >
                          Save note
                        </Button>
                      </div>
                    </div>

                    {/* Display existing notes on file */}
                    {activeContact?.leadNotes && (
                      <div className="border-t border-line pt-3">
                        <span className="mb-1.5 block text-caption text-fg-tertiary">
                          Saved notes
                        </span>
                        <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-subtle p-2.5 font-sans text-small text-fg">
                          {activeContact.leadNotes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AUTO-UPDATING CRM CALL NOTES CARD */}
                  <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-h3 text-fg">
                          CRM call summary
                        </h3>
                        <Badge tone="success">Auto-sync</Badge>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleResetTelemetry}
                          title="Reset qualification boxes"
                          icon={<RotateCcw />}
                        >
                          Reset
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyText(notesDraft, 'notes_copy')}
                          icon={copiedKey === 'notes_copy' ? <Check className="text-success-fg" /> : <Copy />}
                        >
                          <span>{copiedKey === 'notes_copy' ? 'Copied' : 'Copy for CRM'}</span>
                        </Button>
                      </div>
                    </div>

                    <textarea
 aria-label="CRM call summary"                      rows={7}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      className="focus-ring w-full select-text rounded-sm border border-line-strong bg-surface p-2.5 font-sans text-small text-fg placeholder:text-fg-disabled"
                      placeholder="CRM call notes auto-populate here..."
                    />
                  </div>

                </div>
              )}

              {/* TAB 2: HISTORICAL COMMUNICATION FOOTPRINT */}
              {activeRightTab === 'footprint' && !practiceMode && (
                <div className="space-y-3 rounded-lg border border-line bg-surface p-4 shadow-xs animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-h3 text-fg">
                        Touch history
                      </h3>
                      <span className="rounded-sm bg-subtle px-1.5 text-caption tabular-nums leading-5 text-fg-secondary">
                        {activeContact?.footprint?.length || 0}
                      </span>
                    </div>

                    <Link
                      href="/contacts"
                      className="focus-ring flex items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg hover:underline"
                      title="Open full Global Contacts directory"
                    >
                      <span>All contacts</span>
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </div>

                  {/* This lead's callbacks (open first), reassignable by the rep who scheduled them */}
                  {leadCallbacks.length > 0 && (
                    <div className="space-y-2 border-b border-line pb-3">
                      <span className="block text-caption text-fg-tertiary">Callbacks</span>
                      {[...leadCallbacks]
                        .sort((a, b) => Number(a.status !== 'open') - Number(b.status !== 'open'))
                        .map(t => (
                          <CallbackTaskRow
                            key={t.id}
                            task={t}
                            roster={callbackRoster}
                            actor={callbackActor}
                            onReassigned={handleCallbackReassigned}
                            showContact={false}
                          />
                        ))}
                    </div>
                  )}

                  {/* Footprint Timeline */}
                  <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                    {activeContact?.footprint && activeContact.footprint.length > 0 ? (
                      activeContact.footprint.map((fp: LeadFootprintItem, idx: number) => {
                        let badgeColor = 'bg-subtle text-fg-secondary';
                        let icon = <Clock className="size-4 text-fg-secondary" />;

                        if (fp.type === 'email') {
                          badgeColor = 'bg-subtle text-fg-secondary';
                          icon = <Mail className="size-4 text-fg-secondary" />;
                        } else if (fp.type === 'call') {
                          if (fp.disposition === 'Meeting Booked') {
                            badgeColor = 'bg-success-bg text-success-fg';
                          } else if (fp.disposition === 'Call Back Later') {
                            badgeColor = 'bg-warning-bg text-warning-fg';
                          } else {
                            badgeColor = 'bg-danger-bg text-danger-fg';
                          }
                          icon = <PhoneCall className="size-4 text-fg-secondary" />;
                        } else if (fp.type === 'note') {
                          badgeColor = 'bg-subtle text-fg-secondary';
                          icon = <FileText className="size-4 text-fg-secondary" />;
                        } else if (fp.type === 'linkedin') {
                          badgeColor = 'bg-subtle text-fg-secondary';
                          icon = <LinkedinIcon className="size-4 text-fg-secondary" />;
                        }

                        return (
                          <div
                            key={fp.id || idx}
                            className="space-y-1.5 rounded-md border border-line bg-surface p-3 transition-colors duration-150 hover:bg-subtle"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                {icon}
                                <span className="text-body-strong text-fg">
                                  {fp.title}
                                </span>
                              </div>
                              <span className="text-caption tabular-nums text-fg-tertiary">
                                {fp.timestamp}
                              </span>
                            </div>

                            <p className="whitespace-pre-wrap font-sans text-small text-fg-secondary">
                              {fp.summary}
                            </p>

                            <div className="flex items-center justify-between pt-1 text-caption text-fg-tertiary">
                              <span>Rep: <span className="text-fg-secondary">{fp.repName}</span></span>
                              {fp.disposition && (
                                <span className={`inline-flex h-5 items-center rounded-sm px-1.5 text-caption ${badgeColor}`}>
                                  {fp.disposition}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyState
                        icon={<Clock />}
                        title="No history yet"
                        className="py-8"
                      />
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>

          </>)}
        </CanvasTag>
      </div>

      {practiceMode && practicePersona && practice && practiceSummary && (
        <PracticeSummaryDialog
          key={practiceSummary.id}
          open={practiceSummaryOpen}
          onClose={() => setPracticeSummaryOpen(false)}
          summary={practiceSummary}
          persona={practicePersona}
          difficulty={practice.difficulty}
          scriptSteps={scriptSteps.map(s => ({ step: s.step, name: s.name }))}
          outcomes={OUTCOME_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
          onOutcomeChange={handlePracticeOutcome}
          onTryAgain={handlePracticeTryAgain}
          embedded={embedded}
        />
      )}

      {/* ========================================================================= */}
      {/* QUICK FOLLOW-UP EMAIL COMPOSER MODAL                                      */}
      {/* ========================================================================= */}
      <Dialog
        open={isQuickEmailOpen}
        onClose={() => setIsQuickEmailOpen(false)}
        title={`Send a follow-up to ${customerName}`}
        size="xl"
        dismissible={!isSendingQuickEmail}
        bare
      >
          <div className="flex w-full flex-col">

            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-h3 text-fg">
                Send a follow-up to {customerName}
              </h3>
              <IconButton label="Close" size="sm" onClick={() => setIsQuickEmailOpen(false)}>
                <X />
              </IconButton>
            </div>

            <div className="space-y-4 p-5">
              {/* AI follow-up assistant: open on arrival, asks what to send and why, then writes subject and message */}
              <section aria-labelledby="followup-ai-title" className="overflow-hidden rounded-md border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
                  <h4 id="followup-ai-title" className="flex items-center gap-1.5 text-body-strong text-fg">
                    <Sparkles className="size-4 text-fg-secondary" aria-hidden />
                    <span>Write it with AI</span>
                  </h4>
                  {!quickEmailBody.trim() && (
                    <Button variant="ghost" size="sm" onClick={handleQuickEmailTemplate}>
                      Use a short template instead
                    </Button>
                  )}
                </div>
                <ColdEmailAssistant
                  key={quickEmailSession}
                  hideHeading
                  purpose="followup"
                  callContext={quickEmailCallContext}
                  recipient={{ name: customerName, company: partnerName, title }}
                  sender={{ name: repName, company: sessionTenant || '' }}
                  draft={{ subject: quickEmailSubject, body: quickEmailBody }}
                  onApply={(subject, body) => {
                    setQuickEmailSubject(subject);
                    setQuickEmailBody(body);
                  }}
                  frameworkId={quickEmailFramework}
                  onFrameworkChange={setQuickEmailFramework}
                  autoStart={quickEmailAiStart}
                  enableLinkedInMirror={false}
                  placeholder='Anything to add? e.g. "they asked for pricing", "keep it short"'
                  logClassName="max-h-[340px]"
                />
              </section>

              {/* Secondary: start from a team template (best match for this call's outcome first) */}
              <TemplatePicker
                id="followup-template-picker"
                label="Or use a template"
                values={followUpTemplateValues()}
                outcome={quickEmailCallContext?.outcome || disposition || ''}
                current={{ subject: quickEmailSubject, body: quickEmailBody }}
                onApply={(subject, body) => {
                  setQuickEmailSubject(subject);
                  setQuickEmailBody(body);
                }}
              />

              <div>
                <label className="mb-1.5 block text-caption text-fg-secondary">
                  Recipient email (confirmed on call)
                </label>
                <input
                  type="email"
                  value={directEmail}
                  onChange={(e) => handleConfirmedEmailChange(e.target.value)}
                  className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-3 font-mono text-small text-fg"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-caption text-fg-secondary">
                  Subject
                </label>
                <input
                  type="text"
                  value={quickEmailSubject}
                  onChange={(e) => setQuickEmailSubject(e.target.value)}
                  className="focus-ring h-9 w-full rounded-sm border border-line-strong bg-surface px-3 text-body text-fg"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-caption text-fg-secondary">
                  Message
                </label>
                <textarea
                  rows={6}
                  value={quickEmailBody}
                  onChange={(e) => setQuickEmailBody(e.target.value)}
                  className="focus-ring w-full resize-none rounded-sm border border-line-strong bg-surface p-3 font-sans text-body text-fg"
                />
              </div>

              <MergeFieldGaps
                subject={quickEmailSubject}
                body={quickEmailBody}
                values={followUpTemplateValues()}
                onFill={(subject, body) => {
                  setQuickEmailSubject(subject);
                  setQuickEmailBody(body);
                }}
              />

              {quickEmailSuccess && (
                <div className="flex items-center gap-2 rounded-md border border-success-500/40 bg-success-bg p-2.5 text-small font-medium text-success-fg">
                  <CheckCircle2 className="size-4 text-success-fg" />
                  <span>{quickEmailSuccess}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <a
                href={`/outreach/email?to=${encodeURIComponent(directEmail)}&name=${encodeURIComponent(customerName)}&prospectCompany=${encodeURIComponent(partnerName)}&title=${encodeURIComponent(title)}`}
                className="focus-ring flex items-center gap-1 rounded-sm text-small text-fg-secondary hover:text-fg hover:underline"
              >
                <span>Open in Cold Email Studio</span>
                <ExternalLink className="size-3.5" />
              </a>

              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setIsQuickEmailOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isSendingQuickEmail || !!quickEmailSuccess || !quickEmailBody.trim() || quickEmailGaps.length > 0}
                  title={quickEmailGaps.length > 0 ? `Fill ${quickEmailGaps.map((k) => `{{${k}}}`).join(', ')} before sending` : undefined}
                  onClick={handleSendQuickEmail}
                  icon={quickEmailSuccess ? <Check /> : <Send />}
                >
                  <span>{isSendingQuickEmail ? 'Sending...' : quickEmailSuccess ? 'Sent' : 'Send follow-up'}</span>
                </Button>
              </div>
            </div>

          </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* SCHEDULE CALLBACK DIALOG (opened by the Callback outcome)                 */}
      {/* ========================================================================= */}
      <ScheduleCallbackDialog
        open={isCallbackDialogOpen}
        onClose={() => setIsCallbackDialogOpen(false)}
        onConfirm={handleConfirmCallback}
        contactName={customerName}
        companyName={partnerName}
        repName={repName}
        roster={callbackRoster}
      />

      {/* ========================================================================= */}
      {/* CALENDLY EMBED MODAL                                                      */}
      {/* ========================================================================= */}
      <Dialog
        open={showCalendlyModal}
        onClose={() => setShowCalendlyModal(false)}
        title={customerName ? `Book a screen share with ${customerName} (${partnerName})` : 'Booking calendar'}
        size="lg"
        className="overflow-hidden"
        bare
      >
          <div className="flex h-[min(620px,calc(100dvh-2rem))] w-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h3 className="text-h3 text-fg">
                Book a screen share with {customerName} ({partnerName})
              </h3>
              <div className="flex items-center gap-1">
                {tenantCalendarLink && <a
                  href={`${tenantCalendarLink}?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(directEmail)}&a1=${encodeURIComponent(partnerName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses('ghost', 'sm')}
                  title="Open Calendly in a new tab"
                >
                  <span>Open in new tab</span>
                  <ExternalLink />
                </a>}
                <IconButton label="Close" size="sm" onClick={() => setShowCalendlyModal(false)}>
                  <X />
                </IconButton>
              </div>
            </div>
            <div className="flex-1 bg-surface">
              {tenantCalendarLink ? (
                <iframe
                  src={`${tenantCalendarLink}?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(directEmail)}&a1=${encodeURIComponent(partnerName)}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  title="Customer Booking Calendar"
                />
              ) : (
                <EmptyState
                  icon={<Calendar />}
                  title="Add your booking link"
                  description="Set your team's scheduling link (for example Calendly) in Admin > AI providers, and it will open here."
                  action={
                    <Link href="/admin/ai-providers" className={buttonClasses('primary', 'sm')}>
                      Set booking link
                    </Link>
                  }
                />
              )}
            </div>
          </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* CSV IMPORT MODAL                                                          */}
      {/* ========================================================================= */}
      {isCsvModalOpen && (
        <UploadLeadsCsvModal
          isOpen={isCsvModalOpen}
          onClose={() => setIsCsvModalOpen(false)}
          onLeadsImported={(imported) => {
            if (imported.length > 0) {
              setLeadsQueue(imported);
              setCurrentLeadIndex(0);
              const first = imported[0];
              setCustomerName(first.name);
              setPartnerName(first.company);
              setTitle(first.title);
              setPhone(first.phone);
              setDirectEmail(first.email);
              setHeadcount(first.headcount);
              setLeadWebsite(first.website || '');
              setLeadLinkedinUrl(first.linkedinUrl || '');
              try {
                localStorage.setItem('sdr_active_csv_leads', JSON.stringify(imported));
                if (first.email) {
                  localStorage.setItem('sdr_target_recipient_email', first.email);
                }
              } catch (e) {
                console.warn('Could not cache CSV leads in calling floor:', e);
              }
              setActivityToast(`✓ Loaded ${imported.length} leads into Calling Floor.`);
              setTimeout(() => setActivityToast(null), 3500);
            }
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* DAILY ACTIVITY REPORT MODAL                                               */}
      {/* ========================================================================= */}
      <DailyActivityReportModal
        isOpen={isDailyReportOpen}
        onClose={() => setIsDailyReportOpen(false)}
        repName={repName}
      />

      {/* ========================================================================= */}
      {/* FULL CADENCE SCHEDULE MODAL                                               */}
      {/* ========================================================================= */}
      <ViewFullCadenceModal
        isOpen={isCadenceModalOpen}
        onClose={() => setIsCadenceModalOpen(false)}
        currentDay={activeLead.cadenceDay || 2}
        contactName={customerName}
        companyName={partnerName}
        repName={repName}
      />

    </div>
  );
}
