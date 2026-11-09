'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Lightbulb
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
import { getStoredDispositions, subscribeToDispositions, CallDisposition } from '@/lib/dispositionStore';
import { useSession, isRoleAdmin } from '@/lib/session';
import { useTelephony } from '@/lib/telephony/useTelephony';
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

interface ARMRebuttal {
  id: string;
  shortLabel: string;
  category: string;
  trigger: string;
  acknowledge: string;
  respond: string;
  move: string;
  fullSpoken: string;
}

const PRESET_REBUTTALS: ARMRebuttal[] = [
  {
    id: 'OBJ_SEND_EMAIL',
    shortLabel: 'Send Email / Busy',
    category: 'Brush-Off',
    trigger: 'Just send me an email / I am busy right now',
    acknowledge: '100% fair, {{first_name}}. I know I caught you in the middle of your day and want to protect your inbox.',
    respond: 'The reason I am calling instead of just blasting another email is that most BPO leaders tell us their inboxes are buried under 50 generic pitches a day. I sent you a quick 4-line note yesterday titled "quick question on {{company}} ramp time" regarding the rookie lead burn.',
    move: 'I can resend that right now, but do you have 20 seconds just to tell me: are your new reps already ramping in 72 hours without burning paid leads, or is that a bottleneck on your floor?',
    fullSpoken: '100% fair, {{first_name}}. I know I caught you in the middle of your day and want to protect your inbox. The reason I am calling instead of just blasting another email is that most BPO leaders tell us their inboxes are buried under 50 generic pitches a day. I sent you a quick 4-line note yesterday titled "quick question on {{company}} ramp time" regarding the rookie lead burn. I can resend that right now, but do you have 20 seconds just to tell me: are your new reps already ramping in 72 hours without burning paid leads, or is that a bottleneck on your floor?'
  },
  {
    id: 'OBJ_HAVE_TEAM',
    shortLabel: 'Have Internal Team',
    category: 'Internal Team',
    trigger: 'We already have an internal SDR team / agency',
    acknowledge: 'That makes total sense, {{first_name}}—most established BPOs at your scale already have experienced callers on the floor.',
    respond: 'We are definitely not here to replace your reps or pitch another agency. Our entire system sits directly inside your existing floor: feeding live objection rebuttals in 150 milliseconds and pre-sparring reps on simulated hostile buyer calls before they touch live leads.',
    move: 'Our clients use it to protect their current team from burning expensive lists. Would it hurt to see a 2-minute screen share with Emil to see how it works alongside your current dialer?',
    fullSpoken: 'That makes total sense, {{first_name}}—most established BPOs at your scale already have experienced callers on the floor. We are definitely not here to replace your reps or pitch another agency. Our entire system sits directly inside your existing floor: feeding live objection rebuttals in 150 milliseconds and pre-sparring reps on simulated hostile buyer calls before they touch live leads. Our clients use it to protect their current team from burning expensive lists. Would it hurt to see a 2-minute screen share with Emil to see how it works alongside your current dialer?'
  },
  {
    id: 'OBJ_PRICING',
    shortLabel: 'How Much / Price?',
    category: 'Pricing',
    trigger: 'How much does this cost? Just tell me the price.',
    acknowledge: 'I completely respect that, {{first_name}}—you need to know if the unit economics make sense before spending a single minute on this.',
    respond: 'Because we customize the AI sparring engine and objection cues to your exact outbound campaign scripts and seat count at {{company}}, there isn\'t a generic off-the-shelf sticker price. Everything is calibrated so the system pays for itself by saving just 2 burned deals per rep.',
    move: 'Emil can pull up your exact floor numbers in 10 minutes and show you the exact breakdown. Does Thursday at 2:00 PM work for a quick look?',
    fullSpoken: 'I completely respect that, {{first_name}}—you need to know if the unit economics make sense before spending a single minute on this. Because we customize the AI sparring engine and objection cues to your exact outbound campaign scripts and seat count at {{company}}, there isn\'t a generic off-the-shelf sticker price. Everything is calibrated so the system pays for itself by saving just 2 burned deals per rep. Emil can pull up your exact floor numbers in 10 minutes and show you the exact breakdown. Does Thursday at 2:00 PM work for a quick look?'
  },
  {
    id: 'OBJ_NO_BUDGET',
    shortLabel: 'No Budget',
    category: 'Budget',
    trigger: 'We don\'t have budget for new software right now',
    acknowledge: 'I hear you loud and clear. Running a competitive BPO means keeping margins tight and eliminating software bloat.',
    respond: 'This is not an extra software line item; it actually replaces the dollars you are already burning when junior reps fumble shared leads or get cut down on price in the first 30 seconds.',
    move: 'Let\'s take money completely off the table. Take 15 minutes with Emil—if the math doesn\'t prove an immediate 3x return on your lead spend, we shake hands and walk away. How does Tuesday morning look?',
    fullSpoken: 'I hear you loud and clear. Running a competitive BPO means keeping margins tight and eliminating software bloat. This is not an extra software line item; it actually replaces the dollars you are already burning when junior reps fumble shared leads or get cut down on price in the first 30 seconds. Let\'s take money completely off the table. Take 15 minutes with Emil—if the math doesn\'t prove an immediate 3x return on your lead spend, we shake hands and walk away. How does Tuesday morning look?'
  },
  {
    id: 'OBJ_SHARED_LEADS_OA',
    shortLabel: 'Use Lead Brokers',
    category: 'Lead Vendors',
    trigger: 'We already buy our leads from Outsource Accelerator / brokers',
    acknowledge: 'That makes total sense—they do a solid job driving inbound list volume.',
    respond: 'The hidden catch is that you are paying full price for leads that are co-brokered to 3 to 5 rival BPOs at the exact same hour. If your reps hesitate or sound like commodity telemarketers, those leads are dead on arrival.',
    move: 'We pre-train reps to win the direct contract before competitors even get past the gatekeeper. Give Emil 15 minutes to show you the live difference. How is Thursday afternoon?',
    fullSpoken: 'That makes total sense—they do a solid job driving inbound list volume. The hidden catch is that you are paying full price for leads that are co-brokered to 3 to 5 rival BPOs at the exact same hour. If your reps hesitate or sound like commodity telemarketers, those leads are dead on arrival. We pre-train reps to win the direct contract before competitors even get past the gatekeeper. Give Emil 15 minutes to show you the live difference. How is Thursday afternoon?'
  },
  {
    id: 'OBJ_HOW_DID_YOU_GET_NUMBER',
    shortLabel: 'Got My Number?',
    category: 'Compliance',
    trigger: 'How did you get my direct phone number?',
    acknowledge: 'Completely fair question, {{first_name}}—I would wonder the same thing if someone reached my desk direct.',
    respond: 'We track leadership profiles across high-growth BPOs using verified B2B intelligence engines like Apollo and LinkedIn Sales Navigator to reach heads of outbound operations directly.',
    move: 'I reached out specifically because of your team\'s recent expansion at {{company}}. Since I have you for 20 seconds, was cutting rep onboarding time even on your radar this quarter?',
    fullSpoken: 'Completely fair question, {{first_name}}—I would wonder the same thing if someone reached my desk direct. We track leadership profiles across high-growth BPOs using verified B2B intelligence engines like Apollo and LinkedIn Sales Navigator to reach heads of outbound operations directly. I reached out specifically because of your team\'s recent expansion at {{company}}. Since I have you for 20 seconds, was cutting rep onboarding time even on your radar this quarter?'
  }
];


const AGENT_STATE_LABEL: Record<string, string> = {
  ready: 'Ready',
  paused: 'Paused',
  in_call: 'On call',
  wrap_up: 'Wrap-up',
  logged_out: 'Not logged in',
  unknown: 'Connecting',
};

export default function BorisCallingCockpit() {
  const { session, role, isAdmin, tenantName: sessionTenant, repName: sessionRep } = useSession();
  const repName = sessionRep || 'Emil Halili';
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
    return DEMO_CADENCE_LEADS;
  });
  const [currentLeadIndex, setCurrentLeadIndex] = useState<number>(0);

  // Active Lead Object
  const activeLead = leadsQueue[currentLeadIndex] || DEMO_CADENCE_LEADS[0];
  const nextLeadCandidate = leadsQueue[(currentLeadIndex + 1) % leadsQueue.length];

  // Active Contact with live footprint & direct notes
  const activeContact = useMemo(() => {
    const contacts = getStoredContacts();
    return contacts.find(c => c.id === activeLead.id || c.email?.toLowerCase() === (activeLead.email || '').toLowerCase()) || (activeLead as any);
  }, [activeLead, leadsQueue, leadNoteSavedToast]);

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
  const [disposition, setDisposition] = useState<string | null>(null);
  const [dispositionNotes, setDispositionNotes] = useState<string>('');
  const [activityToast, setActivityToast] = useState<string | null>(null);

  // Real calls through the rep's VICIdial agent session when it's set up (Admin › Phone system +
  // Settings); otherwise the original tel: link. Call state then comes from VICIdial, not a local timer.
  const telephony = useTelephony();
  const viaVicidial = telephony.mode === 'vicidial';
  const callActive = viaVicidial ? telephony.agentState === 'in_call' : isCallingActive;
  const showTelephonyNotice = (message: string) => {
    setActivityToast(`VICIdial: ${message}`);
    setTimeout(() => setActivityToast(null), 5000);
  };
  const [completedActivityCount, setCompletedActivityCount] = useState<number>(0);

  // Script & Objections State
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedRebuttalId, setSelectedRebuttalId] = useState<string | null>(null);
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

  // Tenant Custom Production Calendar Link (Canonical: https://calendly.com/bpogtm/30min)
  const [tenantCalendarLink, setTenantCalendarLink] = useState<string>(() => {
    const globalDefault = 'https://calendly.com/bpogtm/30min';
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tenant_calendar_link');
      if (saved && saved.trim()) {
        if (saved.includes('emil-appointmentlyy') || saved.includes('your-team')) {
          localStorage.setItem('tenant_calendar_link', globalDefault);
          return globalDefault;
        }
        return saved.trim();
      }
    }
    return globalDefault;
  });

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
  const DEFAULT_SCRIPT_STEPS = [
    {
      step: 1,
      name: '1. Opener',
      goal: 'Get permission & reference yesterday\'s email to immediately eliminate cold call resistance.',
      spokenText: `"Hi {{first_name}}, this is {{rep_name}} with Appointmentlyy. I know I'm catching you unannounced. Do you have 30 seconds? I sent you a quick email yesterday titled 'quick question on {{company}} ramp time' about new reps learning on paid client leads. Did that cross your screen?"`,
      deliveryTip: 'Calm, confident, unhurried peer-to-peer tone. Do not apologize for calling.'
    },
    {
      step: 2,
      name: '2. Problem',
      goal: 'Expose the commodity broker trap: 3-5 rival BPOs pitching the exact same lead list.',
      spokenText: `"Most BPO operations leaders we speak with tell us their biggest leak is buying shared leads from Outsource Accelerator or brokers, only to find out 3 to 5 rival BPOs got the identical list 10 minutes earlier. Junior reps stumble in the first 20 seconds and get chopped down on price. Are your callers dealing with that same price pressure right now?"`,
      deliveryTip: 'Stop talking immediately after the question. Let the prospect vent about their lead quality.'
    },
    {
      step: 3,
      name: '3. Solution',
      goal: 'Position private enriched lists + 150ms live objection sparring.',
      spokenText: `"That's exactly why we built Appointmentlyy. Instead of letting reps practice on live, expensive client leads, we feed real-time consultative rebuttals in 150 milliseconds live on the dial, and spar them against hostile AI buyer personas before Day 1. It cuts ramp time from 4 weeks down to 72 hours."`,
      deliveryTip: 'Keep it focused on floor economics and rep confidence—not technical jargon.'
    },
    {
      step: 4,
      name: '4. Close',
      goal: 'Lock a 15-20 min executive screen share with Founder Emil.',
      spokenText: `"{{first_name}}, I want to show you how our BPO client acquisition engine works in a 15-minute screen share with Emil, our founder. No generic pitch deck, just live numbers on your floor scale and how BPOs are eliminating the rookie lead tax. How does Thursday at 2:00 PM look, or does Friday morning work better?"`,
      deliveryTip: 'Offer a binary time choice (Thursday 2pm vs Friday morning) to make scheduling effortless.'
    }
  ];

  const [scriptSteps, setScriptSteps] = useState(DEFAULT_SCRIPT_STEPS);

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
    contactName: 'Julian Vance',
    companyName: 'Apex Global BPO',
    title: 'Director of Outbound Operations',
    department: 'Operations & BDM',
    headcount: '250 Seats',
    phone: '+63 917 555 0192',
    cadenceDay: 2,
    stepName: '1. The Opener',
    telemetry: INITIAL_TELEMETRY_STATE,
    disposition: null,
    customRepNotes: ''
  }));

  // Sync tenant calendar link from storage
  useEffect(() => {
    try {
      const globalDefault = 'https://calendly.com/bpogtm/30min';
      const savedLink = localStorage.getItem('tenant_calendar_link');
      if (savedLink && savedLink.trim()) {
        if (savedLink.includes('emil-appointmentlyy') || savedLink.includes('your-team')) {
          localStorage.setItem('tenant_calendar_link', globalDefault);
          setTenantCalendarLink(globalDefault);
        } else {
          setTenantCalendarLink(savedLink.trim());
        }
      } else {
        setTenantCalendarLink(globalDefault);
      }
    } catch { }
  }, []);

  // 1. Load Stored Leads on Mount
  useEffect(() => {
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
  }, []);

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
    if (index < 0 || index >= leadsQueue.length) return;
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
      .replace(/\{\{rep_name\}\}/gi, repName || 'Emil')
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
  }, [selectedRebuttalId]);

  // Save Direct Note on Lead Record (For Non-CRM Customers)
  const handleSaveLeadNote = () => {
    if (!leadNoteInput.trim()) return;
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

  // Handle Call Outcome / Disposition Selection
  const handleSelectDisposition = (
    dispName: string,
    opts?: { suppressToast?: boolean; skipTelephony?: boolean }
  ): string | undefined => {
    if (!dispName) return;
    setDisposition(dispName);
    setIsCallingActive(false);
    if (viaVicidial && !opts?.skipTelephony) {
      void telephony.setOutcome(dispName).then((r) => {
        if (!r.ok) showTelephonyNotice(r.message);
      });
    }

    const updatedNotes = buildNotes({ disp: dispName });
    setNotesDraft(updatedNotes);

    const targetId = activeLead.id || directEmail;
    const updated = recordContactTouch(targetId, {
      type: 'call',
      title: `Call Note • ${dispName}`,
      summary: updatedNotes,
      repName,
      disposition: dispName
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
        setActivityToast(`✓ Call logged: ${dispName} • Footprint & CRM Synced`);
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
    // Same disposition path as every other outcome (footprint, activity log, CRM notes)
    const activityId = handleSelectDisposition(CALLBACK_DISPOSITION, { suppressToast: true, skipTelephony: true });
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

  // Open Quick Follow-up Email Modal
  const handleOpenQuickEmail = () => {
    const firstName = customerName.split(' ')[0] || 'there';
    setQuickEmailSubject(`quick follow up from our call / ${partnerName}`);
    setQuickEmailBody(
      `Hi ${firstName},\n\nGreat speaking with you just now. As discussed, here is the executive overview on cutting rep ramp time to 72 hours with <150ms live call assistance.\n\nHere is the link to lock in the 15-minute screen share: ${tenantCalendarLink}\n\nBest,\n${repName}`
    );
    setQuickEmailSuccess(null);
    setIsQuickEmailOpen(true);
  };

  // Send Quick Follow-up Email
  const handleSendQuickEmail = async () => {
    // Already sent (or sending): never dispatch the same follow-up twice.
    if (isSendingQuickEmail || quickEmailSuccess) return;
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



  return (
    <div className="flex h-full min-h-0 flex-1 w-full overflow-hidden bg-app font-sans antialiased text-fg">


      {/* 2. MAIN APP SHELL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">


        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* TOP FLOOR HEADER & UTILITY BAR */}
          <PageHeader
            title="Calling floor"
            description={`Current account: ${partnerName}`}
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
                      <span className="text-small tabular-nums text-fg-tertiary">
                        {currentLeadIndex + 1} of {leadsQueue.length}
                      </span>
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
                        if (viaVicidial) {
                          const r = await telephony.hangup();
                          if (!r.ok) showTelephonyNotice(r.message);
                        }
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
                    onClick={() => selectLeadAtIndex((currentLeadIndex - 1 + leadsQueue.length) % leadsQueue.length)}
                  >
                    <ChevronLeft />
                  </IconButton>
                  <Button
                    variant="primary"
                    onClick={handleProceedToNextLead}
                    title={`Next lead: ${nextLeadCandidate.name}`}
                  >
                    <span>Next</span>
                    <ChevronRight />
                  </Button>
                </div>
              </div>

            </div>

            {/* 1-CLICK CALL DISPOSITION BAR */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-caption text-fg-tertiary">
                  Outcome
                </span>
                {[
                  { label: 'Booked', value: 'Meeting Booked', activeClass: 'bg-success-bg text-success-fg border-success-500/50', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
                  { label: 'Callback', value: 'Call Back Later', activeClass: 'bg-warning-bg text-warning-fg border-warning-400', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
                  { label: 'Voicemail', value: 'Left Voicemail', activeClass: 'bg-subtle text-fg border-fg', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
                  { label: 'No answer', value: 'No Answer / Gatekeeper', activeClass: 'bg-subtle text-fg border-fg', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
                  { label: 'Referral', value: 'Referral / Update Contact', activeClass: 'bg-subtle text-fg border-fg', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
                  { label: 'Not interested', value: 'Not Interested / Quarantine', activeClass: 'bg-danger-bg text-danger-fg border-danger-fg/40', idleClass: 'bg-surface text-fg border-line-strong hover:bg-subtle' },
                ].map((item) => {
                  const isSelected = disposition === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => item.value === CALLBACK_DISPOSITION ? setIsCallbackDialogOpen(true) : handleSelectDisposition(item.value)}
                      aria-pressed={isSelected}
                      aria-haspopup={item.value === CALLBACK_DISPOSITION ? 'dialog' : undefined}
                      className={`focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${isSelected ? item.activeClass : item.idleClass
                        }`}
                    >
                      {isSelected && <Check className="size-3.5" />}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {disposition && (
                <span className="flex items-center gap-1.5 text-small text-success-fg">
                  <CheckCircle2 className="size-4 text-success-fg" />
                  <span>Logged: {disposition}</span>
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
                        onClick={() => {
                          setSelectedRebuttalId(null);
                          setCurrentStep(st.step);
                        }}
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

                {currentStep === 2 && (
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
                    onClick={() => {
                      setSelectedRebuttalId(null);
                      setCurrentStep(prev => Math.max(1, prev - 1));
                    }}
                    className={buttonClasses('ghost', 'sm', 'cursor-pointer disabled:opacity-40')}
                  >
                    <ChevronLeft />
                    <span>Back</span>
                  </button>

                  {currentStep < scriptSteps.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRebuttalId(null);
                        setCurrentStep(prev => Math.min(scriptSteps.length, prev + 1));
                      }}
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

              {/* Tab Navigation Segmented Control */}
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

              {/* TAB 3: CALLBACK TASKS (assigned to me, scheduled by me, team for admins) */}
              {activeRightTab === 'callbacks' && (
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
              {activeRightTab === 'footprint' && (
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

        </main>
      </div>

      {/* ========================================================================= */}
      {/* QUICK FOLLOW-UP EMAIL COMPOSER MODAL                                      */}
      {/* ========================================================================= */}
      <Dialog
        open={isQuickEmailOpen}
        onClose={() => setIsQuickEmailOpen(false)}
        title={`Send a follow-up to ${customerName}`}
        size="md"
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
                  disabled={isSendingQuickEmail || !!quickEmailSuccess}
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
        title={`Book a screen share with ${customerName} (${partnerName})`}
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
                <a
                  href={`${tenantCalendarLink}?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(directEmail)}&a1=${encodeURIComponent(partnerName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses('ghost', 'sm')}
                  title="Open Calendly in a new tab"
                >
                  <span>Open in new tab</span>
                  <ExternalLink />
                </a>
                <IconButton label="Close" size="sm" onClick={() => setShowCalendlyModal(false)}>
                  <X />
                </IconButton>
              </div>
            </div>
            <div className="flex-1 bg-surface">
              <iframe
                src={`${tenantCalendarLink}?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(directEmail)}&a1=${encodeURIComponent(partnerName)}`}
                width="100%"
                height="100%"
                frameBorder="0"
                title="Customer Booking Calendar"
              />
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
