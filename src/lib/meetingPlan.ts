/**
 * Meeting Action Plans: shared types and API contract (browser + server safe; no Node or browser APIs).
 *
 * When a rep books a meeting, the Dialer's handoff form creates a plan. The server researches the
 * prospect (website + Google Search grounding), reads the workspace's Company profile, and writes a
 * discovery-meeting plan for the Account Executive plus an editable one-page recap for the customer.
 * Nothing is ever sent to the customer automatically.
 *
 * API (all routes need a session; the workspace always comes from the session, never the body):
 *   POST   /api/meeting-plans                 body CreateMeetingPlanInput      -> 201 { plan }   (status 'preparing'; generation runs after the response)
 *   GET    /api/meeting-plans?contactKey=...  -> { plans: MeetingPlanSummary[] }  (Rep/AE: booked by or assigned to me; Supervisor+: all)
 *   GET    /api/meeting-plans/assignees       -> { assignees: Assignee[] }       (AEs first, then everyone else)
 *   GET    /api/meeting-plans/[id]            -> { plan, brand: OnePagerBrand }  (brand from src/lib/onePagerRender.ts, for the preview)
 *   PATCH  /api/meeting-plans/[id]            body UpdateMeetingPlanInput      -> { plan }   (assignedAe: Supervisor+ only)
 *   POST   /api/meeting-plans/[id]/regenerate -> { plan }   (status back to 'preparing')
 *   POST   /api/meeting-plans/[id]/polish     body PolishOnePagerInput         -> { onePager } (not saved; the UI applies, then PATCHes)
 *   GET    /api/meeting-plans/[id]/pdf        -> application/pdf (the saved one-pager)
 *   GET    /api/tenant/profile                -> { profile: CompanyProfile | null }
 *   PUT    /api/tenant/profile                body { profile: CompanyProfileInput } -> { profile }  (Admin+)
 *   POST   /api/tenant/profile/draft          body { website }                 -> { profile: CompanyProfileInput } (Admin+, not saved)
 *   POST   /api/email/send                    gains optional `meetingPlanId`: the server renders that plan's PDF and attaches it.
 *
 * Errors: { error: string, field?: string } with 400/401/403/404/409/429/500.
 */

export type MeetingPlanStatus = 'preparing' | 'ready' | 'failed' | 'sent';

/** What the Dialer knows about the prospect at booking time (copied, so later lead edits don't change the plan). */
export interface LeadSnapshot {
  name: string;
  email: string;
  company: string;
  title?: string;
  phone?: string;
  /** Prospect company website (any form: "acme.com" or a full URL). */
  website?: string;
  /** Company LinkedIn page URL. Used only as a search hint; never fetched or scraped. */
  companyLinkedinUrl?: string;
  /** The person's LinkedIn URL. Shown to the AE; never fetched. */
  personLinkedinUrl?: string;
  industry?: string;
  location?: string;
  headcount?: string;
  /** Browser contact id, when the lead came from Contacts. */
  contactId?: string;
}

/** What happened on the call, as reviewed by the rep in the handoff form. */
export interface CallContext {
  /** The outcome the rep picked, e.g. "Meeting Booked" or "Booked: Qualified Demo". */
  outcome: string;
  /** Agreed meeting time as the rep entered it (free text or ISO). */
  meetingAt?: string;
  /** The rep's reviewed call notes. */
  notes: string;
  /** Recent call transcript lines ("Rep: ..." / "Prospect: ..."), when the call had one. */
  transcript?: string;
  /** Anything else the AE should know. */
  extraContext?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
}

/** AI research on the prospect company. Facts carry sources; guesses are worded as hypotheses. */
export interface ResearchSummary {
  /** 2-4 sentence overview an AE can read in 20 seconds. */
  overview: string;
  whatTheyDo: string;
  /** e.g. "Mid-market B2B logistics, ~200 staff, AU/NZ". "Unknown" when not found. */
  sizeAndSegment: string;
  /** Recent news, hiring, launches, funding, expansions (dated when known). */
  recentSignals: string[];
  /** What they likely care about right now, inferred from the above. */
  likelyPriorities: string[];
  /** Pain hypotheses to test in discovery (always phrased as hypotheses). */
  painHypotheses: string[];
  sources: ResearchSource[];
  /** True when the company website was read successfully. */
  websiteRead: boolean;
  /** True when Google Search grounding ran. */
  searched: boolean;
  /** Plain note on gaps, e.g. "Website could not be reached; research is from search results only." */
  limitations?: string;
}

export interface AgendaItem {
  topic: string;
  /** Why this matters to THIS customer (tie to their words, research or priorities). */
  whyItMatters: string;
  questions: string[];
  /** Which of our services / USP this topic connects to. */
  mapsTo: string;
  minutes?: number;
}

export interface DiscoveryQuestion {
  question: string;
  /** What the answer tells the AE (e.g. "Quantifies cost of the problem (Impact)"). */
  purpose: string;
}

export interface ObjectionPrep {
  objection: string;
  response: string;
}

/** The AE's plan for the discovery meeting. */
export interface ActionPlan {
  callSummary: {
    /** 3-5 sentence recap of the rep <-> prospect call. */
    recap: string;
    keyPoints: string[];
    /** Short verbatim-ish prospect statements worth repeating back. */
    prospectQuotes: string[];
    /** What was agreed on the call (the booked meeting and its purpose). */
    agreedNextStep: string;
  };
  /** One paragraph version of the research for the plan page. */
  researchSummary: string;
  /** The single outcome the AE should leave the meeting with. */
  meetingGoal: string;
  agenda: AgendaItem[];
  discoveryQuestions: DiscoveryQuestion[];
  likelyObjections: ObjectionPrep[];
  /** Risks, unknowns and info to confirm early (budget, authority, timing, incumbent...). */
  risks: string[];
  /** What should happen after the meeting if it goes well. */
  proposedNextSteps: string[];
}

/** Copy of the customer-facing one-page recap. Editable by the AE; rendered to PDF. */
export interface OnePagerCopy {
  headline: string;
  subheadline: string;
  /** "What we heard": the customer's situation in their terms. 2-4 bullets. */
  whatWeHeard: string[];
  /** "Why it matters for {company}". 2-3 bullets. */
  whyItMatters: string[];
  /** "Agreed next steps". 2-4 steps. */
  nextSteps: { step: string; when?: string }[];
  /** "How we can help". Exactly 3 is ideal. */
  howWeHelp: { title: string; detail: string }[];
  /** Soft, no-pressure call to action. */
  cta: string;
}

/** The workspace's own company: what every plan sells. */
export interface CompanyProfileInput {
  website: string;
  /** One-paragraph description of the company. */
  summary: string;
  services: string[];
  /** Unique selling proposition in one or two sentences. */
  usp: string;
  proofPoints: string[];
  /** Who they sell to. */
  idealCustomers: string;
  /** The core offer / how engagements start. */
  offer: string;
}

export interface CompanyProfile extends CompanyProfileInput {
  updatedAt: string;
  updatedBy: string;
}

export interface MeetingPlan {
  id: string;
  tenantCode: string;
  /** Lowercased prospect email, or the contact id when there is no email. */
  contactKey: string;
  lead: LeadSnapshot;
  call: CallContext;
  /** Email + display name of the rep who booked. */
  bookedBy: string;
  bookedByName: string;
  /** Email + display name of the Account Executive running the meeting. */
  assignedAe: string;
  assignedAeName: string;
  status: MeetingPlanStatus;
  research: ResearchSummary | null;
  plan: ActionPlan | null;
  onePager: OnePagerCopy | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MeetingPlanSummary = Pick<
  MeetingPlan,
  'id' | 'contactKey' | 'status' | 'bookedBy' | 'bookedByName' | 'assignedAe' | 'assignedAeName' | 'sentAt' | 'createdAt' | 'updatedAt' | 'error'
> & {
  lead: Pick<LeadSnapshot, 'name' | 'email' | 'company' | 'title' | 'website'>;
  meetingAt?: string;
};

export interface CreateMeetingPlanInput {
  lead: LeadSnapshot;
  call: CallContext;
  /** AE email. Omitted = the booking rep. Must be an active member of the workspace. */
  assignedAe?: string;
}

export interface UpdateMeetingPlanInput {
  plan?: ActionPlan;
  onePager?: OnePagerCopy;
  /** Supervisor+ only. */
  assignedAe?: string;
  /** Mark as sent (set by the email dialog after a successful send). */
  status?: 'sent';
}

export interface PolishOnePagerInput {
  onePager: OnePagerCopy;
  /** e.g. "shorter", "more consultative", "mention the 30-day pilot". */
  instruction: string;
}

export interface Assignee {
  email: string;
  name: string;
  role: string;
}

/** Field limits shared by the UI and the server validators. */
export const MEETING_PLAN_LIMITS = {
  notes: 6000,
  transcript: 8000,
  extraContext: 2000,
  shortText: 300,
  longText: 2000,
  listItems: 12,
  instruction: 500,
} as const;

/** Max items per list (the server drops extras on save; editors should stop "Add" at these). */
export const MEETING_PLAN_LIST_CAPS = {
  agenda: 8,
  agendaQuestions: 5,
  whatWeHeard: 4,
  whyItMatters: 3,
  nextSteps: 4,
  howWeHelp: 4,
} as const;

/** Stable key for a prospect: lowercased email, else the contact id. */
export function meetingContactKey(lead: Pick<LeadSnapshot, 'email' | 'contactId'>): string {
  const email = (lead.email || '').trim().toLowerCase();
  if (email) return email;
  return (lead.contactId || '').trim();
}

export const MEETING_STATUS_LABEL: Record<MeetingPlanStatus, string> = {
  preparing: 'Preparing…',
  ready: 'Ready',
  failed: 'Needs retry',
  sent: 'Sent',
};
