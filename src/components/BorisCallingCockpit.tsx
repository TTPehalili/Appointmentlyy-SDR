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
  Sparkles,
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
  UploadCloud
} from 'lucide-react';
import Link from 'next/link';
import LinkedinIcon from '@/components/icons/LinkedinIcon';
import AppSidebar from '@/components/AppSidebar';
import GlobalTopHeader from '@/components/GlobalTopHeader';
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

export default function BorisCallingCockpit() {
  const { session, role, isAdmin, tenantName: sessionTenant, repName: sessionRep } = useSession();
  const repName = sessionRep || 'Emil Halili';
  const adminClearance = isRoleAdmin(role);

  // Tab State for Right Column: 'notes' | 'footprint'
  const [activeRightTab, setActiveRightTab] = useState<'notes' | 'footprint'>('notes');

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
      spokenText: `"Hi {{first_name}}, this is {{rep_name}} with Appointmentlyy. I know I'm catching you unannounced—do you have 30 seconds? I sent you a quick email yesterday titled 'quick question on {{company}} ramp time' about new reps burning paid client leads. Did that cross your screen, or do your reps somehow hit production on Day 3 without burning leads?"`,
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
    if (isCallingActive) {
      interval = setInterval(() => {
        setCallTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setCallTimerSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isCallingActive]);

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
  const handleSelectDisposition = (dispName: string) => {
    if (!dispName) return;
    setDisposition(dispName);
    setIsCallingActive(false);

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
      logCadenceActivity({
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
      setActivityToast(`✓ Call logged: ${dispName} • Footprint & CRM Synced`);
      setTimeout(() => setActivityToast(null), 3500);
    } catch (err) {
      console.warn('Activity logging notice:', err);
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
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 font-sans antialiased text-zinc-900">

      {/* 1. LEFT SIDEBAR */}
      <AppSidebar />

      {/* 2. MAIN APP SHELL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Header */}
        <GlobalTopHeader />

        {/* Scrollable Canvas */}
        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* TOP FLOOR HEADER & UTILITY BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-200">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                📞
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-zinc-950">
                    Calling Floor
                  </h1>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200 font-semibold">
                    {partnerName}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsDailyReportOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 text-zinc-600" />
                <span>Activity</span>
                <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-900 text-[10px] font-mono font-bold border border-zinc-200">
                  {completedActivityCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsCadenceModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-zinc-600" />
                <span>Cadence</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCalendlyModal(true)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-white/80" />
                <span>Calendly</span>
              </button>
            </div>
          </div>

          {/* ACTIVITY BANNER NOTIFICATION */}
          {activityToast && (
            <div className="p-2.5 px-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs font-bold flex items-center justify-between shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{activityToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setActivityToast(null)}
                className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 1: UNIFIED LEAD HEADER, INLINE DIALER & 1-CLICK DISPOSITIONS      */}
          {/* ========================================================================= */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">

            {/* Main Unified Lead & Dialer Row */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

              {/* LEFT: Prospect Identity + Inline Click-to-Call right next to Lead Info */}
              <div className="flex flex-wrap items-center gap-4 min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                    {customerName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-black text-zinc-950 tracking-tight truncate">
                        {customerName}
                      </h2>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 font-semibold">
                        {headcount}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">
                        #{currentLeadIndex + 1}/{leadsQueue.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-600 mt-0.5">
                      <span className="truncate">
                        {title} at <strong className="text-zinc-900 font-bold">{partnerName}</strong>
                      </span>
                      {leadWebsite && (
                        <a
                          href={leadWebsite.startsWith('http') ? leadWebsite : `https://${leadWebsite}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          <Globe className="w-3 h-3" />
                          <span>Web</span>
                        </a>
                      )}
                      {leadLinkedinUrl && (
                        <a
                          href={leadLinkedinUrl.startsWith('http') ? leadLinkedinUrl : `https://${leadLinkedinUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-[#0077b5] hover:underline flex items-center gap-0.5"
                        >
                          <LinkedinIcon className="w-3 h-3" />
                          <span>LinkedIn</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* INLINE CLICK-TO-CALL PILL (Right beside Lead Identity) */}
                <div className="flex items-center gap-1.5 pl-0 sm:pl-3 sm:border-l border-zinc-200">
                  <a
                    href={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : '#'}
                    onClick={() => {
                      if (!phone) {
                        alert('No phone number entered for this prospect.');
                        return;
                      }
                      setIsCallingActive(true);
                    }}
                    className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${isCallingActive
                        ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                    <span>{isCallingActive ? `Calling (${callTimerSeconds}s)` : 'Call'}</span>
                    <span className="font-mono text-[11px] opacity-90 border-l border-white/25 pl-2">
                      {phone || 'No Phone'}
                    </span>
                  </a>

                  {isCallingActive && (
                    <button
                      type="button"
                      onClick={() => setIsCallingActive(false)}
                      className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer shadow-xs"
                      title="Hang up"
                    >
                      <PhoneOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT: Compact Email Input + Send Invite + Prev/Next Lead */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-zinc-50 border border-zinc-200 rounded-xl p-1 gap-1">
                  <div className="relative flex items-center">
                    <Mail className="w-3.5 h-3.5 text-zinc-400 ml-2 mr-1.5 shrink-0" />
                    <input
                      type="email"
                      value={directEmail}
                      onChange={(e) => handleConfirmedEmailChange(e.target.value)}
                      placeholder="prospect@company.com"
                      className="w-44 sm:w-52 bg-transparent py-1 pr-2 text-xs font-mono font-semibold text-zinc-900 focus:outline-none"
                      title="Edit email to sync globally across Cold Email Studio, Inbox & Calendly"
                    />
                    {emailSavedToast && (
                      <Check className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenQuickEmail}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                    title="Send follow-up invite or deck"
                  >
                    <Send className="w-3 h-3" />
                    <span>Email</span>
                  </button>
                </div>

                {/* Lead Queue Navigation */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => selectLeadAtIndex((currentLeadIndex - 1 + leadsQueue.length) % leadsQueue.length)}
                    className="p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 text-xs font-medium cursor-pointer transition-colors"
                    title="Previous Lead"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToNextLead}
                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    title={`Next Lead: ${nextLeadCandidate.name}`}
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            {/* 1-CLICK CALL DISPOSITION BAR */}
            <div className="pt-2.5 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 mr-1">
                  Outcome:
                </span>
                {[
                  { label: 'Booked', value: 'Meeting Booked', activeClass: 'bg-emerald-600 text-white border-emerald-600', idleClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' },
                  { label: 'Callback', value: 'Call Back Later', activeClass: 'bg-amber-600 text-white border-amber-600', idleClass: 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50' },
                  { label: 'Voicemail', value: 'Left Voicemail', activeClass: 'bg-blue-600 text-white border-blue-600', idleClass: 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50' },
                  { label: 'No Answer', value: 'No Answer / Gatekeeper', activeClass: 'bg-zinc-800 text-white border-zinc-800', idleClass: 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50' },
                  { label: 'Referral', value: 'Referral / Update Contact', activeClass: 'bg-purple-600 text-white border-purple-600', idleClass: 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50' },
                  { label: 'Not Interested', value: 'Not Interested / Quarantine', activeClass: 'bg-rose-600 text-white border-rose-600', idleClass: 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50' },
                ].map((item) => {
                  const isSelected = disposition === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => handleSelectDisposition(item.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${isSelected ? item.activeClass : item.idleClass
                        }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {disposition && (
                <span className="text-[11px] font-mono font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
            <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4">

              {/* Top Row: Step Navigation Pills */}
              <div className="flex flex-wrap items-center justify-between pb-3 border-b border-zinc-100 gap-2">
                <div className="flex items-center gap-1 flex-wrap">
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isStepActive
                            ? 'bg-zinc-900 text-white shadow-xs'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                          }`}
                      >
                        {st.name}
                      </button>
                    );
                  })}
                </div>

                <Link
                  href="/admin/frameworks"
                  className="text-[11px] font-mono font-semibold text-[#0a66c2] hover:underline flex items-center gap-1 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200"
                  title="Upload custom sales playbook to personalize this teleprompter"
                >
                  <UploadCloud className="h-3 w-3 text-sky-600" />
                  <span>Edit Playbook</span>
                </Link>
              </div>

              {/* Instant 1-Click Rebuttal Trigger Bar (Eye-Level) */}
              <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Live Objection Rebuttals (Click to View on Teleprompter):</span>
                  </span>
                  {activeRebuttal && (
                    <button
                      type="button"
                      onClick={() => setSelectedRebuttalId(null)}
                      className="text-[11px] font-bold text-amber-900 hover:text-zinc-950 bg-white px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Back to Script</span>
                    </button>
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
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${isSelected
                            ? 'bg-amber-500 text-zinc-950 border-amber-600 shadow-xs'
                            : 'bg-white hover:bg-amber-100/70 text-zinc-800 border-amber-300/80'
                          }`}
                      >
                        🛡️ {reb.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MAIN TELEPROMPTER DISPLAY: Shows Active Rebuttal at Eye-Level OR Active Script Step */}
              {activeRebuttal ? (
                <div className="p-5 rounded-2xl bg-zinc-950 text-white font-sans space-y-4 shadow-md border-2 border-amber-500/80 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-mono text-[10px] font-black uppercase">
                        REBUTTAL • {activeRebuttal.category}
                      </span>
                      <span className="text-xs font-bold text-amber-300">
                        &ldquo;{activeRebuttal.trigger}&rdquo;
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyText(interpolate(activeRebuttal.fullSpoken), 'reb_copy')}
                        className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'reb_copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRebuttalId(null)}
                        className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <span>Resume Script</span>
                      </button>
                    </div>
                  </div>

                  {/* Large Eye-Level ARM Breakdown */}
                  <div className="space-y-3 text-base sm:text-lg leading-relaxed select-text">
                    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block mb-1">
                        1. Acknowledge
                      </span>
                      <p className="text-zinc-100">{interpolate(activeRebuttal.acknowledge)}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 block mb-1">
                        2. Respond
                      </span>
                      <p className="text-white">{interpolate(activeRebuttal.respond)}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                        3. Move (Ask for the Close)
                      </span>
                      <p className="text-emerald-100 font-semibold">{interpolate(activeRebuttal.move)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* The Spoken Script (Large, Readable, Variable-Interpolated) */}
                  <div className="p-5 rounded-2xl bg-zinc-950 text-white font-sans text-base sm:text-lg leading-relaxed shadow-xs relative">
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-zinc-800/80 text-xs">
                      <span className="font-mono font-bold text-zinc-300">
                        {activeStepData.name} — <span className="text-zinc-400 font-normal">{activeStepData.goal}</span>
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500 shrink-0 ml-2">
                        Step {currentStep}/{scriptSteps.length}
                      </span>
                    </div>

                    <p className="select-text">
                      {interpolate(activeStepData.spokenText)}
                    </p>

                    <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-400 italic">
                        💡 {activeStepData.deliveryTip}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText(interpolate(activeStepData.spokenText), `step_${currentStep}`)}
                        className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                      >
                        {copiedKey === `step_${currentStep}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* COMPACT QUALIFICATION CHECKPOINTS */}
              <div className="space-y-3">
                {currentStep === 1 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                      Quick Qualify: Role Verification
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetRole('confirmed')}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1 cursor-pointer ${roleStatus === 'confirmed'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-emerald-600'
                          }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Active Role</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetRole('promoted')}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1 cursor-pointer ${roleStatus === 'promoted'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-blue-600'
                          }`}
                      >
                        <span>New Title</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetRole('changed')}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-1 cursor-pointer ${roleStatus === 'changed'
                            ? 'bg-zinc-800 border-zinc-800 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-800'
                          }`}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Referral</span>
                      </button>
                    </div>

                    {roleStatus === 'promoted' && (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                        <input
                          type="text"
                          value={promotedTitleInput}
                          onChange={(e) => setPromotedTitleInput(e.target.value)}
                          placeholder="New title (e.g. VP Operations)"
                          className="flex-1 bg-white border border-blue-300 rounded px-2.5 py-1 text-xs text-zinc-900"
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
                          className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-bold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    )}

                    {roleStatus === 'changed' && (
                      <div className="p-2 bg-zinc-100 border border-zinc-300 rounded-lg flex items-center gap-2">
                        <input
                          type="text"
                          value={referralContactInput}
                          onChange={(e) => setReferralContactInput(e.target.value)}
                          placeholder="Referral name & contact"
                          className="flex-1 bg-white border border-zinc-300 rounded px-2.5 py-1 text-xs text-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nextTel = { ...telemetry, roleVerified: false, roleTitleStatus: `Left role / Referral: ${referralContactInput}` };
                            setTelemetry(nextTel);
                            setNotesDraft(buildNotes({ tel: nextTel, disp: 'Referral / Update Contact' }));
                          }}
                          className="px-3 py-1 rounded bg-zinc-800 text-white text-xs font-bold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                      Quick Qualify: Lead Source
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetOA(!recognizedOA)}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-between cursor-pointer ${recognizedOA
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-purple-600'
                          }`}
                      >
                        <span>Uses Lead Brokers</span>
                        {recognizedOA ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetPriceTrap(priceTrapStatus === 'confirmed' ? 'denial' : 'confirmed')}
                        className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-between cursor-pointer ${priceTrapStatus === 'confirmed'
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-red-600'
                          }`}
                      >
                        <span>Shared Lead Pain</span>
                        {priceTrapStatus === 'confirmed' ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    </div>
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
                        Quick Qualify: Core Service &amp; Pitch
                      </span>
                      <button
                        type="button"
                        onClick={handleToggleProblemFix}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1 transition-colors cursor-pointer ${telemetry.problemFixDiscussed
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-emerald-500'
                          }`}
                      >
                        <Check className="h-3 w-3" />
                        <span>Value Pitched</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {['Customer Support', 'Outbound Sales', 'Tech Support', 'Back-Office'].map((serv) => (
                        <button
                          key={serv}
                          type="button"
                          onClick={() => handleSetService(serv)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${telemetry.primaryService === serv
                              ? 'bg-zinc-900 border-zinc-900 text-white'
                              : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400'
                            }`}
                        >
                          {serv}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep === 4 && (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                      Quick Qualify: Lock Demo Slot
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Thu 2:00 PM', 'Fri 10:30 AM', 'Tue 2:00 PM'].map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleSelectSlot(slot)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${bookingSlot === slot
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-zinc-200 text-zinc-800 hover:border-emerald-500'
                            }`}
                        >
                          {slot} {bookingSlot === slot ? '✓' : ''}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleToggleAttendance}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-bold border flex items-center justify-between transition-colors cursor-pointer ${telemetry.attendanceVerified
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-zinc-200 text-zinc-800 hover:border-emerald-500'
                          }`}
                      >
                        <span>Calendar Confirmed</span>
                        {telemetry.attendanceVerified ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>

                      <input
                        type="tel"
                        value={directMobileInput}
                        onChange={(e) => handleUpdateDirectMobile(e.target.value)}
                        placeholder="SMS Mobile #"
                        className="bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs text-zinc-900 font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900"
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
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    ← Back
                  </button>

                  {currentStep < scriptSteps.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRebuttalId(null);
                        setCurrentStep(prev => Math.min(scriptSteps.length, prev + 1));
                      }}
                      className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <span>Next Step</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelectDisposition('Meeting Booked')}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Book Meeting</span>
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT: NOTES & HISTORICAL FOOTPRINT (5 cols) */}
            <div className="lg:col-span-5 space-y-3">

              {/* Tab Navigation Segmented Control */}
              <div className="flex items-center p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('notes')}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${activeRightTab === 'notes'
                      ? 'bg-white text-zinc-950 shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Notes &amp; CRM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveRightTab('footprint')}
                  className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${activeRightTab === 'footprint'
                      ? 'bg-white text-zinc-950 shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>History</span>
                  {activeContact?.footprint && activeContact.footprint.length > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-zinc-900 text-white">
                      {activeContact.footprint.length}
                    </span>
                  )}
                </button>
              </div>

              {/* TAB 1: DIRECT LEAD NOTES & LIVE CRM NOTES */}
              {activeRightTab === 'notes' && (
                <div className="space-y-3 animate-in fade-in duration-150">

                  {/* DIRECT LEAD NOTES (FOR NON-CRM CUSTOMERS) */}
                  <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">📌</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
                          Lead Notes
                        </h3>
                      </div>
                      {leadNoteSavedToast && (
                        <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1 animate-in fade-in">
                          <Check className="w-3 h-3" /> Saved!
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={leadNoteInput}
                        onChange={(e) => setLeadNoteInput(e.target.value)}
                        placeholder="Add quick note on this lead..."
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-900 font-sans"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400">
                          Rep: <strong>{repName}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={handleSaveLeadNote}
                          disabled={!leadNoteInput.trim()}
                          className="px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Note</span>
                        </button>
                      </div>
                    </div>

                    {/* Display existing notes on file */}
                    {activeContact?.leadNotes && (
                      <div className="mt-2 pt-2 border-t border-zinc-100">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                          Saved Notes:
                        </span>
                        <div className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-zinc-800 leading-relaxed font-sans whitespace-pre-wrap max-h-36 overflow-y-auto">
                          {activeContact.leadNotes}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AUTO-UPDATING CRM CALL NOTES CARD */}
                  <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">📝</span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
                          CRM Call Summary
                        </h3>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                          Auto-Sync
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResetTelemetry}
                          className="text-[11px] text-zinc-400 hover:text-zinc-700 flex items-center gap-1 cursor-pointer"
                          title="Reset qualification boxes"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(notesDraft, 'notes_copy')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${copiedKey === 'notes_copy'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                            }`}
                        >
                          {copiedKey === 'notes_copy' ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'notes_copy' ? 'Copied' : 'Copy CRM'}</span>
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={7}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 text-[11px] leading-relaxed text-zinc-900 font-mono focus:outline-none focus:bg-white focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 select-text"
                      placeholder="CRM call notes auto-populate here..."
                    />
                  </div>

                </div>
              )}

              {/* TAB 2: HISTORICAL COMMUNICATION FOOTPRINT */}
              {activeRightTab === 'footprint' && (
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-zinc-900" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-mono">
                        Touch History
                      </h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-800 font-bold border border-zinc-200">
                        {activeContact?.footprint?.length || 0}
                      </span>
                    </div>

                    <Link
                      href="/contacts"
                      className="text-[10px] font-semibold text-blue-600 hover:underline flex items-center gap-0.5"
                      title="Open full Global Contacts directory"
                    >
                      <span>All Contacts</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>

                  {/* Footprint Timeline */}
                  <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                    {activeContact?.footprint && activeContact.footprint.length > 0 ? (
                      activeContact.footprint.map((fp: LeadFootprintItem, idx: number) => {
                        let badgeColor = 'bg-zinc-100 text-zinc-700 border-zinc-200';
                        let icon = <Clock className="w-3.5 h-3.5 text-zinc-500" />;

                        if (fp.type === 'email') {
                          badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
                          icon = <Mail className="w-3.5 h-3.5 text-blue-600" />;
                        } else if (fp.type === 'call') {
                          if (fp.disposition === 'Meeting Booked') {
                            badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                          } else if (fp.disposition === 'Call Back Later') {
                            badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                          } else {
                            badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
                          }
                          icon = <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />;
                        } else if (fp.type === 'note') {
                          badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
                          icon = <FileText className="w-3.5 h-3.5 text-purple-600" />;
                        } else if (fp.type === 'linkedin') {
                          badgeColor = 'bg-sky-50 text-sky-700 border-sky-200';
                          icon = <LinkedinIcon className="w-3.5 h-3.5 text-sky-600" />;
                        }

                        return (
                          <div
                            key={fp.id || idx}
                            className="p-3 rounded-xl border border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50 transition-colors space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                {icon}
                                <span className="text-xs font-bold text-zinc-900">
                                  {fp.title}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {fp.timestamp}
                              </span>
                            </div>

                            <p className="text-xs text-zinc-700 leading-relaxed font-sans whitespace-pre-wrap">
                              {fp.summary}
                            </p>

                            <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400 font-mono">
                              <span>Rep: <strong className="text-zinc-700">{fp.repName}</strong></span>
                              {fp.disposition && (
                                <span className={`px-1.5 py-0.2 rounded font-bold border ${badgeColor}`}>
                                  {fp.disposition}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-zinc-400 space-y-1">
                        <Clock className="w-6 h-6 mx-auto opacity-40" />
                        <p className="text-xs font-medium">No history yet.</p>
                      </div>
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
      {isQuickEmailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">

            <div className="p-4 px-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-zinc-900" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Send Follow-Up Invite to {customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickEmailOpen(false)}
                className="h-7 w-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Recipient Email (Confirmed on Call)
                </label>
                <input
                  type="email"
                  value={directEmail}
                  onChange={(e) => handleConfirmedEmailChange(e.target.value)}
                  className="w-full text-xs font-mono font-semibold rounded-lg border border-zinc-300 p-2 text-zinc-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={quickEmailSubject}
                  onChange={(e) => setQuickEmailSubject(e.target.value)}
                  className="w-full text-xs rounded-lg border border-zinc-300 p-2 text-zinc-900"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block mb-1">
                  Email Message
                </label>
                <textarea
                  rows={6}
                  value={quickEmailBody}
                  onChange={(e) => setQuickEmailBody(e.target.value)}
                  className="w-full text-xs rounded-lg border border-zinc-300 p-2 text-zinc-900 resize-none font-sans"
                />
              </div>

              {quickEmailSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{quickEmailSuccess}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between">
              <a
                href={`/email?to=${encodeURIComponent(directEmail)}&name=${encodeURIComponent(customerName)}&company=${encodeURIComponent(partnerName)}&title=${encodeURIComponent(title)}`}
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 underline flex items-center gap-1"
              >
                <span>Open in Cold Email Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickEmailOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-300 text-zinc-700 font-semibold text-xs hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSendingQuickEmail}
                  onClick={handleSendQuickEmail}
                  className="px-4 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{isSendingQuickEmail ? 'Sending...' : 'Send Follow-Up'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CALENDLY EMBED MODAL                                                      */}
      {/* ========================================================================= */}
      {showCalendlyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full h-[620px] shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">
            <div className="p-4 px-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-zinc-900" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Book Screen Share for {customerName} ({partnerName})
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${tenantCalendarLink}?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(directEmail)}&a1=${encodeURIComponent(partnerName)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-mono flex items-center gap-1 transition-colors"
                  title="Open Calendly in a new tab"
                >
                  <span>New Tab</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setShowCalendlyModal(false)}
                  className="h-7 w-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 flex items-center justify-center cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white">
              <iframe
                src={`${tenantCalendarLink}?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(directEmail)}&a1=${encodeURIComponent(partnerName)}`}
                width="100%"
                height="100%"
                frameBorder="0"
                title="Customer Booking Calendar"
              />
            </div>
          </div>
        </div>
      )}

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
