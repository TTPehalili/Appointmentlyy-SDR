/**
 * The Help center's own content (src/components/UserGuideHub.tsx renders it). It is also the ONLY material the support
 * AI may ground a how-to answer in (src/lib/server/supportAi.ts): every answer must cite these ids, and an answer
 * that cites anything else is never sent. Change the text here and both the Help page and the AI follow.
 */
export interface HelpGuideStep {
  step: number;
  title: string;
  route: string;
  tag: string;
  summary: string;
  image: string;
  caption: string;
  highlights: string[];
  proTip: string;
}

export const HELP_GUIDE_STEPS: HelpGuideStep[] = [
  {
    step: 1,
    title: 'Mission & Targets Hub',
    route: '/',
    tag: 'ABOUT & SLAS',
    summary: 'Understand core company positioning, 35+ qualified sits contractual guarantee, the 3-Day TTP ramp framework, and the Outbound ROI calculator.',
    image: '/guide/step1-mission.png',
    caption: 'The Mission & Targets Hub displaying SLAs, 600M+ data lake, and interactive ROI model.',
    highlights: [
      'Contractual 35+ Qualified Sits: Review the monthly guarantee per dedicated SDR line.',
      '3-Day TTP System: Day 1 AI Sparring (40+ drills), Day 2 Context Feed (<180ms latency), Day 3 Live Guidance.',
      'Zero-Excuses Architecture: Review the 6 software gates preventing lost deals.',
      'Interactive Outbound ROI Simulator: Test capacity, closed deals, and pipeline revenue projections.'
    ],
    proTip: 'Show this page to prospective BPO enterprise clients to prove your floor follows deterministic software gates.'
  },
  {
    step: 2,
    title: 'AI Boris Calling Cockpit & 1-Click Dialer',
    route: '/cockpit',
    tag: 'LIVE TELEPROMPTER',
    summary: 'Front-line calling teleprompter with automatic prospect variable injection, 1-click dialer auto-launch, pattern interrupt, and shared-lead diagnostic engine.',
    image: '/guide/step2-cockpit.png',
    caption: 'Lead Identity card with 1-click dialer and real-time prospect intel.',
    highlights: [
      '1-Click Click-to-Call: Click the emerald "Click to Call" button below the phone number to immediately trigger your default dialer (Dialpad, Teams, RingCentral, Phone Link, Softphone).',
      'Screen 1 (Role Verification): Confirm prospect active status (Still in Role, Promoted, Left Company).',
      'Screen 2 (Lead Source Check): Pattern interrupt on where their leads come from and how many actually connect.',
      'Screen 3 (Lead Quality & Pipeline Check): Expose the hidden cost of stale contact data, wasted dials and a thin, unpredictable pipeline.',
      'Screen 4 (Diagnostic Engine): Click target services (A to E) to dynamically generate tailored value cards.'
    ],
    proTip: 'Never break conversational pacing. Click any service tag on Screen 4 to instantly load the exact talk track.'
  },
  {
    step: 3,
    title: 'Calendar Bypass & Setting Expectations Closing',
    route: '/cockpit',
    tag: 'CALENDAR & CLOSE',
    summary: 'Direct Calendly screen share scheduling with an instant "Bypass Calendar" continue button to prevent call dead air, followed by Screen 6 zero-prep closing tracks.',
    image: '/guide/step3-closing.png',
    caption: 'Screen 6 setting expectations, zero-prep guarantee, and auto-updating CRM call notes.',
    highlights: [
      'Bypass Calendar Button: If a prospect verbally agrees to a slot, click "⚡ Continue to Setting Expectations & Closing" without waiting on the Calendly iframe form.',
      'Line 1 (Screen Share Demo): Explain that Founder Emil will share screen to show Claude AI building their private list and run a 2-minute sparring simulation.',
      'Line 2 (Zero Prep Guarantee): Clarify that Emil already pulls their company profile and competitor pricing in advance—zero preparation needed.',
      'Line 3 (Attendance & Mobile Check): Check if they will be at their laptop/desk and verify direct cell for a 10-minute heads-up SMS.',
      'Auto-Updating CRM Notes: Every button click auto-formats ready-to-paste CRM text in the right panel.'
    ],
    proTip: 'Click "Lock Meeting Booked & Copy CRM Notes" to automatically sync disposition and copy notes to your clipboard.'
  },
  {
    step: 4,
    title: 'AI Voice Sparring Arena (10 Personas)',
    route: '/sparring',
    tag: 'AI VOICE DOJO',
    summary: 'Practice unscripted acoustic objection handling against 10 realistic buyer personas before ever calling live accounts.',
    image: '/guide/step4-sparring.png',
    caption: 'Sparring Arena with 10 buyer personas, difficulty tiers, and real-time audio chat.',
    highlights: [
      '10 Diverse Buyer Personas: Spar with Julian Vance (BPO Directory Buyer), David M. (VP Sales), Sarah K. (BPO Agency), and hostile gatekeepers.',
      'Realistic Pushback: The AI detects tonal hesitation, pricing arguments, and directory fatigue in real time.',
      'ARM Script Assist: Live sub-600ms battlecard recommendations render on-screen as you speak.',
      'Automated Scoring: Receive instant feedback on tonality, acknowledgment, and closing commitment.'
    ],
    proTip: 'Complete at least 40 sparring runs on Day 1 to achieve muscle memory on handling the shared-lead objection.'
  },
  {
    step: 5,
    title: 'Live Monitoring (Floor Supervisor Hub)',
    route: '/monitoring',
    tag: 'SUPERVISOR AUDIO',
    summary: 'Supervisors and QA managers can listen in real time to ongoing AI sparring training sessions across all logged-in sales reps.',
    image: '/guide/step1-mission.png',
    caption: 'Live Monitoring dashboard showing online reps, active sparring sessions, and live audio waveform.',
    highlights: [
      'Active Reps Floor Grid: View all reps logged into the floor, current training status, and active duration.',
      'Live Audio Stream: Click "🎧 Listen Live" on any ongoing session to stream the rep vs. AI conversation.',
      'Real-Time Transcript: Read rolling text dialogues with color-coded objection tags and sentiment indicators.',
      'Whisper / Coach Mode: Inject instant tactical tips into the rep’s cockpit without disrupting the call.'
    ],
    proTip: 'Filter by "Active Audio Calls" to focus coaching on reps currently sparring with high-difficulty personas.'
  },
  {
    step: 6,
    title: 'Admin Control & Multi-Tenant Management',
    route: '/admin',
    tag: 'ADMIN & PROVISIONING',
    summary: 'Centralized control center for managing client BPO tenants, allocating SDR seats, toggling module permissions, and shadowing workspaces.',
    image: '/guide/step5-admin.png',
    caption: 'Admin Control showing active BPO tenants, seat allocations, and Admin Shadow Mode banner.',
    highlights: [
      'Tenants & Client Access: View all provisioned client BPOs (Apex Global BPO, Harbor Point BPO, etc.).',
      'Module Entitlement Toggles: 1-click toggle access for Boris Cockpit, AI Sparring, Certification Exam Gate, and Leads CRM.',
      'Admin Shadow Mode (Impersonate): Click "👁️ Impersonate" to safely view any client workspace in shadow mode.',
      'Provision Tenant Wizard: Onboard new BPOs with seat caps, plan tiers, and telephony gateway choices.'
    ],
    proTip: 'Use Admin Shadow Mode to verify a new client’s custom campaign playbooks without needing their credentials.'
  }
];

/** The three quick-reference cards under the guide (plain text of the cards UserGuideHub renders). */
export const HELP_FAQ_CARDS: { id: string; title: string; body: string }[] = [
  {
    id: 'help-faq-rebuttals',
    title: 'Instant rebuttals',
    body: 'Press R anytime inside the calling cockpit to immediately toggle the 11-battlecard ARM rebuttal drawer without lifting your hands from the keyboard.',
  },
  {
    id: 'help-faq-click-to-call',
    title: 'Click to call',
    body: "Clicking the emerald phone button triggers the system tel: protocol, instantly bridging the lead's direct number to your configured dialer app.",
  },
  {
    id: 'help-faq-live-practice',
    title: 'Live practice audio',
    body: 'Supervisors can open Live Monitoring to listen in real time to reps practicing with AI buyer personas, viewing sentiment and audio waveforms live.',
  },
];

export interface HelpArticle {
  id: string;
  title: string;
  text: string;
}

/** Every Help center article as plain text, with a stable id (help-step-1 ... help-step-6, help-faq-*). */
export function helpArticles(): HelpArticle[] {
  return [
    ...HELP_GUIDE_STEPS.map((s) => ({
      id: `help-step-${s.step}`,
      title: s.title,
      text: [`Page: ${s.route}`, s.summary, ...s.highlights.map((h) => `- ${h}`), `Tip: ${s.proTip}`].join('\n'),
    })),
    ...HELP_FAQ_CARDS.map((c) => ({ id: c.id, title: c.title, text: c.body })),
  ];
}

export const HELP_ARTICLE_IDS: ReadonlySet<string> = new Set(helpArticles().map((a) => a.id));
export const helpArticleTitle = (id: string): string => helpArticles().find((a) => a.id === id)?.title ?? '';
