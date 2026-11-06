export interface CadenceTouch {
  day: number;
  stepName: string;
  touchNumber: number;
  channel: 'Email' | 'LinkedIn' | 'Phone';
  mechanism: string;
  timingRule: string;
  subject?: string;
  body: string;
  voicemailAudio?: string;
  spokenOpener?: string;
}

export interface CadencePhoneCallConfig {
  day: number;
  phoneStepName: string;
  priorEmail: {
    touchName: string;
    daySent: string;
    subject: string;
    coreHook: string;
  };
  spokenOpenerEmailInjected: string;
  spokenVerification: string;
  voicemailScript?: string;
  reducedFrictionNote: string;
}

export const CADENCE_TOUCHES: CadenceTouch[] = [
  {
    day: 1,
    stepName: 'Initial Hook — Email #1',
    touchNumber: 1,
    channel: 'Email',
    mechanism: 'Automated background dispatch at cadence enrollment via Resend / SendGrid.',
    timingRule: 'Under 75 words; laser-focused on buyer pain point (burned client leads).',
    subject: 'quick question on {{company}} ramp time',
    body: `Hi {{first_name}},\n\nMost BPO leaders I speak with tell me their biggest headache on new outbound campaigns is the "rookie tax"—watching new hires burn through the first 500 paid client leads just trying to figure out what to say.\n\nCurious if you’re seeing that same friction at {{company}}, or do your reps somehow hit full production on Day 3 without burning leads?\n\nBest,\n{{rep_name}}`
  },
  {
    day: 1,
    stepName: 'Social Awareness — LinkedIn #1',
    touchNumber: 2,
    channel: 'LinkedIn',
    mechanism: 'Auto-queues 1-click profile link & pre-drafted zero-pitch note (Manual Rep Task).',
    timingRule: 'Same day as Email #1; zero sales pitch; under 300 characters.',
    body: `Hi {{first_name}} — noticed you're leading revenue/ops at {{company}}. We track outbound seat economics across mid-market BPOs. No pitch here; just wanted to follow your floor's growth.`
  },
  {
    day: 2,
    stepName: 'The Phone Push — Phone #1',
    touchNumber: 3,
    channel: 'Phone',
    mechanism: 'Push to Boris priority dial queue.',
    timingRule: 'First cold dial. No voicemail left on Day 2.',
    spokenOpener: `"Hi {{first_name}}, this is {{rep_name}} with Appointmentlyy. I know I'm catching you unannounced. Do you have 30 seconds? I sent you a quick email yesterday titled 'quick question on {{company}} ramp time' about new reps learning on paid client leads. Did that cross your screen?"`,
    body: `Cold Call Phone #1 (Screen 1 Opener). Follow-up to Day 1 Email #1. Injects email subject to reduce cold-call friction right off the bat.`
  },
  {
    day: 3,
    stepName: 'Voicemail Drop — Phone #2',
    touchNumber: 4,
    channel: 'Phone',
    mechanism: 'Boris Cockpit dial + 15s voicemail drop audio trigger.',
    timingRule: '15 seconds max; problem-solving; references incoming email.',
    voicemailAudio: `"Hey {{first_name}}, it's {{rep_name}} with Appointmentlyy. Quick heads up—dropping a short note in your inbox regarding how contact centers are cutting agent onboarding down to 72 hours without burning client leads. Check for an email titled '72-hour floor ramp'. Talk soon."`,
    body: `Voicemail Drop audio triggered if no answer. Prepares prospect for Email #2 arriving in 120 seconds.`
  },
  {
    day: 3,
    stepName: 'Email Synergy — Email #2',
    touchNumber: 5,
    channel: 'Email',
    mechanism: 'Dispatched exactly 120 seconds post-dial via Resend automated email.',
    timingRule: 'References voicemail drop (+15% open rate lift). Aborted if prospect answers phone.',
    subject: '72-hour floor ramp / tried you just now',
    body: `Hi {{first_name}},\n\nTried your line a moment ago. Left a quick 10-second voicemail regarding how mid-market BPOs are tackling the 3-week classroom ramp.\n\nRather than letting green reps practice on live client leads, teams are using voice AI sparring to simulate 50+ hostile customer calls on Day 1—so reps hit live production with zero hesitation on Day 3.\n\nWorth a brief conversation, or is onboarding already where you want it?\n\nBest,\n{{rep_name}}`
  },
  {
    day: 5,
    stepName: 'Social Engagement — LinkedIn #2',
    touchNumber: 6,
    channel: 'LinkedIn',
    mechanism: 'Queues manual task to engage with prospect post or share benchmark insight.',
    timingRule: '1-click resource share; zero CTA.',
    body: `{{first_name}} — saw your recent post regarding team expansion at {{company}}. We recently put together a benchmark breakdown comparing manual QA auditing (1-3% sample rate) vs automated 100% call evaluation across 500k contact center minutes. Thought you might find the data interesting: [Link to Benchmark Report]. Hope it's insightful for your floor managers!`
  },
  {
    day: 7,
    stepName: 'Value Add — Email #3',
    touchNumber: 7,
    channel: 'Email',
    mechanism: 'Automated dispatch at 9:00 AM prospect local time via Resend.',
    timingRule: 'Case study, BPO benchmark data, & 90s Loom video link.',
    subject: '100% call QA vs 2% Excel sampling (BPO benchmark)',
    body: `Hi {{first_name}},\n\nMost BPO operations heads tell us their QA team can only realistically listen to 1% to 2% of recorded dials—meaning 98% of agent compliance risks and lost sales happen in total darkness.\n\nWe recorded a quick 90-second teardown showing how a 60-seat BPO automated 100% call auditing (ARM 2.0) while giving reps live, sub-180ms rebuttal prompts on screen during calls: [Watch 90s Teardown Video: {{loom_link}}]\n\nOpen to seeing if this approach makes sense for {{company}}'s floor?\n\nBest,\n{{rep_name}}`
  },
  {
    day: 9,
    stepName: 'Shifted Phone Call — Phone #3',
    touchNumber: 8,
    channel: 'Phone',
    mechanism: 'Time-shifted dial block (8:00 AM–8:45 AM or 4:30 PM–5:15 PM prospect local time).',
    timingRule: 'Catch leadership before morning huddles or after shift change. References Day 7 video.',
    spokenOpener: `"Hi {{first_name}}, {{rep_name}} here with Appointmentlyy. I know it's early/late, so I'll be brief. Sent an email on Friday titled '100% call QA vs 2% Excel sampling' with a 90-second video showing how a 60-seat floor stopped reps from freezing mid-call. Did that video cross your screen, or did it get buried under client fires?"`,
    body: `Shifted dial window referencing the 90-second Loom benchmark video sent on Friday to establish instant familiarity.`
  },
  {
    day: 12,
    stepName: 'Pivot Angle — Email #4',
    touchNumber: 9,
    channel: 'Email',
    mechanism: 'Automated dispatch via Resend.',
    timingRule: 'Fresh low-friction question: "Not sure if on radar..." Focused on the 35% broker margin skim.',
    subject: 'broker margins vs direct client contracts',
    body: `Hi {{first_name}},\n\nNot sure if this is even on your radar right now, but several BPO CROs we work with were tired of giving away 35% of their seat margin to overseas brokers taking $6-$10/hr off the top.\n\nThey switched to a turnkey outbound engine (600M+ verified contacts + dedicated dialer lines) to sign direct US/UK enterprise clients at $24/hr billable rates with zero broker cuts.\n\nWould you be opposed to seeing how they set up that pipeline?\n\nBest,\n{{rep_name}}`
  },
  {
    day: 15,
    stepName: 'Quick Dial-In — Phone #4',
    touchNumber: 10,
    channel: 'Phone',
    mechanism: 'Push to Boris priority dial queue.',
    timingRule: 'Quick touch; negative reverse selling; move on without voicemail.',
    spokenOpener: `"Hi {{first_name}}, {{rep_name}} again with Appointmentlyy. Dropped an email in your inbox last week titled 'broker margins vs direct client contracts' about BPO CROs stopping the 35% broker margin skim. Usually when I haven't connected by now, it means one of two things: either your reps are already crushing their quotas with zero shared leads, or you're swamped. Which one is it?"`,
    body: `Negative reverse selling opener referencing the broker margin skim email sent on Day 12.`
  },
  {
    day: 19,
    stepName: 'Referral Touch — Email #5',
    touchNumber: 11,
    channel: 'Email',
    mechanism: 'Automated dispatch via Resend.',
    timingRule: '1-Page 3-Day TTP Cheat Sheet + "Who on your team handles this?".',
    subject: '3-Day TTP Cheat Sheet (+ quick question)',
    body: `Hi {{first_name}},\n\nAttached is our 1-page "3-Day Training-to-Production" framework that BPO training directors use to transition new hires from classroom roleplay to live dials in 72 hours.\n\nIf you’re not the right person looking at outbound floor efficiency, agent ramp, or direct client acquisition at {{company}}, who on your team typically owns that?\n\nBest,\n{{rep_name}}`
  },
  {
    day: 24,
    stepName: 'Final Persistence — Phone #5',
    touchNumber: 12,
    channel: 'Phone',
    mechanism: 'Final phone touchpoint on Boris dial queue.',
    timingRule: 'Voss Accusation Audit; gentle exit positioning.',
    spokenOpener: `"Hi {{first_name}}, {{rep_name}} with Appointmentlyy. Sent you our 1-page 3-Day TTP Cheat Sheet last week for transitioning reps to production in 72 hours. You're probably wondering why I haven't given up on your line yet. I promise this is my last dial—just wanted to know before I close your file: is eliminating shared leads a priority this quarter, or just bad timing?"`,
    body: `Chris Voss Accusation Audit approach referencing the 3-Day TTP framework sent on Day 19.`
  },
  {
    day: 27,
    stepName: 'Close the Loop — Email #6',
    touchNumber: 13,
    channel: 'Email',
    mechanism: 'Automated dispatch via Resend.',
    timingRule: 'Clean, graceful break-up email; closes file and sparks latent replies.',
    subject: 'closing your file at {{company}}',
    body: `Hi {{first_name}},\n\nI haven't heard back, so I'm assuming floor efficiency, ramp velocity, and direct client pipeline aren't priorities for {{company}} right now. I’m closing out your file on our end so I don't clutter your inbox.\n\nIf anything changes down the road and you'd like to see how BPOs are ramping reps in 3 days with <180ms live call assistance, you know where to find me.\n\nAll the best,\n{{rep_name}}`
  }
];

export const CADENCE_PHONE_SCRIPTS: Record<number, CadencePhoneCallConfig> = {
  2: {
    day: 2,
    phoneStepName: 'The Phone Push — Phone #1',
    priorEmail: {
      touchName: 'Initial Hook — Email #1',
      daySent: 'Day 1 at Enrollment',
      subject: 'quick question on {{company}} ramp time',
      coreHook: 'Rookie tax: new hires burning 500 paid client leads trying to figure out what to say'
    },
    spokenOpenerEmailInjected: `"Hi {{first_name}}, this is {{rep_name}} with Appointmentlyy. I know I'm catching you unannounced. Do you have 30 seconds? I sent you a quick email yesterday titled 'quick question on {{company}} ramp time' about new reps learning on paid client leads. Did that cross your screen?"`,
    spokenVerification: `"My notes show you're still leading {{department}} as the {{title}} over at {{company}}—is that still accurate?"`,
    reducedFrictionNote: 'References yesterday\'s Email #1 subject line to transform a cold dial into a warm follow-up touchpoint.'
  },
  3: {
    day: 3,
    phoneStepName: 'Voicemail Drop — Phone #2',
    priorEmail: {
      touchName: 'Email Synergy — Email #2',
      daySent: 'Queued to send in 120s post-dial',
      subject: '72-hour floor ramp / tried you just now',
      coreHook: 'Cutting onboarding to 72 hours via voice AI sparring simulating 50+ hostile calls on Day 1'
    },
    spokenOpenerEmailInjected: `"Hi {{first_name}}, {{rep_name}} with Appointmentlyy. I was just about to shoot you a note titled '72-hour floor ramp' regarding how mid-market BPOs are cutting agent onboarding to 72 hours without burning client leads. Do you have 30 seconds before I send that over?"`,
    spokenVerification: `"I'm reaching out because you're leading {{department}} as the {{title}} at {{company}}—wanted to make sure I had the right desk before pinging your inbox."`,
    voicemailScript: `"Hey {{first_name}}, it's {{rep_name}} with Appointmentlyy. Quick heads up—dropping a short note in your inbox regarding how contact centers are cutting agent onboarding down to 72 hours without burning client leads. Check for an email titled '72-hour floor ramp'. Talk soon."`,
    reducedFrictionNote: 'Hooks the prospect with the incoming email topic before it hits their inbox, creating instant curiosity.'
  },
  9: {
    day: 9,
    phoneStepName: 'Shifted Phone Call — Phone #3',
    priorEmail: {
      touchName: 'Value Add — Email #3',
      daySent: 'Day 7 at 9:00 AM',
      subject: '100% call QA vs 2% Excel sampling (BPO benchmark)',
      coreHook: '90s Loom teardown video showing how a 60-seat floor stopped reps from freezing mid-call'
    },
    spokenOpenerEmailInjected: `"Hi {{first_name}}, {{rep_name}} here with Appointmentlyy. I know it's early/late, so I'll be brief. Sent an email on Friday titled '100% call QA vs 2% Excel sampling' with a 90-second video showing how a 60-seat floor stopped reps from freezing mid-call. Did that video cross your screen, or did it get buried under client fires?"`,
    spokenVerification: `"Reaching out directly since you run {{department}} as the {{title}} at {{company}}—wanted to see if automated 100% call auditing is on your radar this quarter?"`,
    reducedFrictionNote: 'References the 90-second Loom benchmark video sent on Friday to immediately separate this from commodity vendor dials.'
  },
  15: {
    day: 15,
    phoneStepName: 'Quick Dial-In — Phone #4',
    priorEmail: {
      touchName: 'Pivot Angle — Email #4',
      daySent: 'Day 12 via Resend',
      subject: 'broker margins vs direct client contracts',
      coreHook: '35% broker margin skim vs direct US/UK client contracts at $24/hr billable rates'
    },
    spokenOpenerEmailInjected: `"Hi {{first_name}}, {{rep_name}} again with Appointmentlyy. Dropped an email in your inbox last week titled 'broker margins vs direct client contracts' about BPO CROs stopping the 35% broker margin skim. Usually when I haven't connected by now, it means one of two things: either your reps are already crushing their quotas with zero shared leads, or you're swamped. Which one is it?"`,
    spokenVerification: `"As {{title}} leading {{department}} at {{company}}, curious if signing direct enterprise contracts without broker cuts is even an active priority right now?"`,
    reducedFrictionNote: 'Uses negative reverse selling while referencing the broker margin skim email sent on Day 12.'
  },
  24: {
    day: 24,
    phoneStepName: 'Final Persistence — Phone #5',
    priorEmail: {
      touchName: 'Referral Touch — Email #5',
      daySent: 'Day 19 via Resend',
      subject: '3-Day TTP Cheat Sheet (+ quick question)',
      coreHook: '1-page framework transitioning new hires from classroom roleplay to live dials in 72 hours'
    },
    spokenOpenerEmailInjected: `"Hi {{first_name}}, {{rep_name}} with Appointmentlyy. Sent you our 1-page 3-Day TTP Cheat Sheet last week for transitioning reps to production in 72 hours. You're probably wondering why I haven't given up on your line yet. I promise this is my last dial—just wanted to know before I close your file: is eliminating shared leads a priority this quarter, or just bad timing?"`,
    spokenVerification: `"Before I archive your profile for {{company}}—are you still the right person heading {{department}}, or should I be speaking with someone else on your leadership team?"`,
    reducedFrictionNote: 'Employs Chris Voss accusation audit referencing the 3-Day TTP Cheat Sheet email sent on Day 19.'
  }
};

export type TouchpointStatus = 'active' | 'completed' | 'locked';

export function getTouchpointStatus(touchDay: number, currentCadenceDay: number): TouchpointStatus {
  if (touchDay === currentCadenceDay) return 'active';
  if (touchDay < currentCadenceDay) return 'completed';
  return 'locked';
}

export interface CadenceLeadRecord {
  id: string;
  name: string;
  company: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  headcount: string;
  website?: string;
  linkedinUrl?: string;
  techStack?: string;
  painPoint?: string;
  outsourcer?: string;
  buyingSignals?: string[];
  customVariables?: Record<string, string>;
  cadenceDay: number;
  touchNumber: number;
  isCarryOver: boolean;
  carryOverReason?: string;
  statusBadge: string;
}

export const DEMO_CADENCE_LEADS: CadenceLeadRecord[] = [
  {
    id: 'lead_fresh_d2',
    name: 'Julian Vance',
    company: 'Apex Global BPO',
    title: 'Director of Outbound Operations',
    department: 'Outbound Appointment Setting Floor',
    email: 'julian@apexglobalbpo.com',
    phone: '+1 (415) 890-2341',
    headcount: '65 seats',
    website: 'https://apexglobalbpo.ph',
    linkedinUrl: 'https://www.linkedin.com/in/julian-vance-bpo',
    techStack: 'HubSpot & Apollo.io',
    painPoint: 'outbound hold rate and objection hesitation on shared lead lists',
    outsourcer: 'Titan BPO Solutions',
    buyingSignals: [
      'Hiring 15 Outbound SDRs (Manila & Cebu)',
      'Tech Stack: HubSpot CRM + Apollo.io Power Dialer',
      'Recent News: Expanding into US Healthcare & FinTech appointment setting',
      'Current Problem: 30% show-up drop-off from junior rep objection stumbling'
    ],
    customVariables: {
      'Lead Source': 'Directory Intake (Outsource Accelerator)',
      'Target Geography': 'US & Canada Enterprise',
      'Average Deal Size': '$45,000 ARR',
      'Incumbent Dialer': 'Apollo / Twilio BYOT'
    },
    cadenceDay: 2,
    touchNumber: 3,
    isCarryOver: false,
    statusBadge: 'Fresh Intake • Day 2 Phone Push'
  },
  {
    id: 'lead_carryover_d9',
    name: 'Marcus Brody',
    company: 'Nexus Call Solutions',
    title: 'VP of Contact Center Ops',
    department: 'Enterprise Lead Gen',
    email: 'mbrody@nexuscall.com',
    phone: '+1 (312) 555-0198',
    headcount: '120 seats',
    website: 'https://nexuscallsolutions.com',
    linkedinUrl: 'https://www.linkedin.com/in/marcus-brody-cx',
    techStack: 'Salesforce & Outreach.io',
    painPoint: 'rep ramp time and objection handling drop-offs',
    outsourcer: 'Agency Partner BPO',
    buyingSignals: [
      'Migrated outbound telephony from legacy VICIdial to Twilio SIP',
      'Open Job Postings: 8 Senior Outbound BDRs',
      'LinkedIn Post: Emphasizing live AI coaching to reduce ramp time from 6 weeks to 10 days'
    ],
    customVariables: {
      'Campaign': 'Enterprise Outbound Q4',
      'Seat Quota Target': '4 Bookings/day/rep',
      'Current Hold Rate': '54%'
    },
    cadenceDay: 9,
    touchNumber: 8,
    isCarryOver: true,
    carryOverReason: 'Scheduled Follow-up from Last Week (Email #3 Sent Friday)',
    statusBadge: 'Prior-Week Carry-Over • Day 9 Shifted Dial'
  },
  {
    id: 'lead_carryover_d15',
    name: 'Elena Rostova',
    company: 'ClearDial Telephony',
    title: 'Chief Revenue Officer',
    department: 'Sales & Client Retention',
    email: 'elena@cleardial.io',
    phone: '+1 (646) 772-9102',
    headcount: '45 seats',
    website: 'https://cleardial.io',
    linkedinUrl: 'https://www.linkedin.com/in/elena-rostova-sales',
    techStack: 'Salesloft & ZoomInfo',
    painPoint: 'qualified discovery conversions and broker margin squeeze',
    outsourcer: 'Internal 6-person SDR Team',
    buyingSignals: [
      'Attended Outsource Accelerator Global Summit',
      'Publicly criticized $8/hr rate erosion on commoditized voice calls',
      'Actively piloting AI copilots for cold call objection reversal'
    ],
    customVariables: {
      'Pilot Budget': '$12,000 allocated for Q4 AI tool enablement',
      'CRM': 'Salesforce Enterprise'
    },
    cadenceDay: 15,
    touchNumber: 10,
    isCarryOver: true,
    carryOverReason: 'Rescheduled Callback from Previous Week (Discuss Broker Margins)',
    statusBadge: 'Prior-Week Carry-Over • Day 15 Reverse Sell'
  },
  {
    id: 'lead_fresh_d1',
    name: 'David Chen',
    company: 'OmniBPO Worldwide',
    title: 'Managing Director',
    department: 'BPO Delivery & Workforce',
    email: 'dchen@omnibpo.com',
    phone: '+1 (212) 449-3381',
    headcount: '210 seats',
    website: 'https://omnibpo.com',
    linkedinUrl: 'https://www.linkedin.com/in/david-chen-bpo',
    techStack: 'Apollo & Outreach',
    painPoint: 'acoustic compliance and deliverability on cold dials',
    outsourcer: 'Burned domain previous vendor',
    buyingSignals: [
      'Seeking AI training software for 200+ agents',
      'Evaluating LMS certification gates before letting reps take live calls',
      'High turnover on outbound phone reps (34% quarterly churn)'
    ],
    customVariables: {
      'Floor Locations': 'Cebu IT Park & Clark Freeport Zone',
      'Average Talk Time': '42 seconds (Early Hangup Problem)'
    },
    cadenceDay: 1,
    touchNumber: 1,
    isCarryOver: false,
    statusBadge: 'Fresh Intake • Day 1 Email #1'
  }
];

