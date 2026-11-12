/**
 * Outbound Writing & Cold Calling Frameworks Registry
 * Built for enterprise SDR floors to generate short, hyper-personalized,
 * anti-sales, peer-to-peer cold calls, cold emails, and LinkedIn messages using Gemini.
 * 
 * CORE PHILOSOPHY:
 * 1. Two-way consultative dialogue: 80% about the prospect's reality, <20% about the SDR.
 * 2. Consultant mindset: Diagnose leaks like a doctor, never pitch like a telemarketer.
 * 3. Grounded in CSV intelligence: Persona-specific, never one-size-fits-all.
 */

import { isDemoWorkspace } from './demoMode';
import { cleanStoredDemoText } from './demoTextCleanup';

export type OutboundChannel = 'Phone' | 'Email' | 'LinkedIn';
export type TouchType = 'Cold Call' | 'Cold Email' | 'Follow-up Email' | 'LinkedIn Connection' | 'LinkedIn InMail';

export interface OutboundFramework {
  id: string;
  name: string;
  channel: OutboundChannel;
  category: string;
  authorOrStyle: string;
  description: string;
  targetWordCount: number;
  promptInstruction: string;
  antiSalesPrinciple: string;
  exampleSnippet: string;
  isDefault?: boolean;
  isActive: boolean;
}

export interface AntiSalesCta {
  id: string;
  label: string;
  ctaText: string;
  channel: OutboundChannel | 'Both' | 'All';
  psychologyAngle: 'Permission-Based' | 'No-Oriented' | 'Disarming Disqualification' | 'Curiosity / Video' | 'Soft Conversational' | 'Pattern Interrupt' | 'Consultative Diagnostic' | 'Meta-Proof / Power-Punch';
}

export interface QualifyingQuestion {
  id: string;
  category: 'Lead Burn' | 'Competitor Friction' | 'Seat Margins' | 'Objection Drop-Off';
  question: string;
  diagnosticRationale: string;
}

export const QUALIFYING_QUESTIONS: QualifyingQuestion[] = [
  {
    id: 'qual_lead_burn',
    category: 'Lead Burn',
    question: 'When you bring on new setters, how many paid client leads do they typically burn through in their first 2 weeks before they can handle hostile objections without freezing?',
    diagnosticRationale: 'Uncovers the hidden "rookie tax" of classroom onboarding.'
  },
  {
    id: 'qual_competitor_price',
    category: 'Competitor Friction',
    question: 'When your callers reach prospects who already work with an incumbent BPO, what percentage of those dials die in the first 20 seconds on price?',
    diagnosticRationale: 'Exposes caller helplessness against commodity competitors.'
  },
  {
    id: 'qual_broker_margins',
    category: 'Seat Margins',
    question: 'Are you having to surrender 30% to 35% of your contract margins to middlemen brokers just to keep your seats filled, or do you have a direct pipeline you control?',
    diagnosticRationale: 'Attacks broker dependency directly.'
  },
  {
    id: 'qual_objection_speed',
    category: 'Objection Drop-Off',
    question: 'If your callers had instant, sub-180ms consultative rebuttals on screen during live calls, what would that do to your qualified sit rate this month?',
    diagnosticRationale: 'Makes the prospect calculate the ROI of Appointmentlyy SDR in their own head.'
  }
];

export const DEFAULT_ANTI_SALES_CTAS: AntiSalesCta[] = [
  {
    id: 'cta_meta_proof_12min',
    label: '12-min Live ICP Build & Sparring (Power-Punch)',
    ctaText: "Let me do this: give me 12 minutes on Thursday. I'll share my screen, build your private verified list live, and show you the exact cockpit. If you don't see how it books you 5 more sits a week, tell me to get lost and I'll never call back. Fair?",
    channel: 'All',
    psychologyAngle: 'Meta-Proof / Power-Punch'
  },
  {
    id: 'cta_pilot_2_reps',
    label: '7-Day 2-Rep Pilot Challenge (Zero Risk)',
    ctaText: 'We don\'t need to touch your whole floor. Let me pilot this with your 2 newest reps for 7 days. If their sit rate doesn\'t jump by 25%, you owe us nothing. Are you opposed to testing that?',
    channel: 'All',
    psychologyAngle: 'Meta-Proof / Power-Punch'
  },
  {
    id: 'cta_meta_proof_email',
    label: 'Meta-Proof 12-min Screen Share (Email)',
    ctaText: 'Open to a 12-minute screen share where I build your private enriched list live, or totally off base?',
    channel: 'Email',
    psychologyAngle: 'Meta-Proof / Power-Punch'
  },
  {
    id: 'cta_consultative_benchmark',
    label: 'Consultative Diagnostic (Phone/Email)',
    ctaText: 'Does that bottleneck show up on your floor at Apex, or are your callers already converting those cleanly?',
    channel: 'All',
    psychologyAngle: 'Consultative Diagnostic'
  },
  {
    id: 'cta_permission_loom',
    label: '3-min Loom / Teardown',
    ctaText: 'Open to taking a look at a 3-minute video breakdown of how other BPOs fixed this, or totally off base?',
    channel: 'All',
    psychologyAngle: 'Permission-Based'
  },
  {
    id: 'cta_no_oriented_opposed',
    label: 'No-Oriented (Are you opposed)',
    ctaText: 'Are you completely opposed to seeing how other BPO founders protected their lead margins on shared lists?',
    channel: 'All',
    psychologyAngle: 'No-Oriented'
  },
  {
    id: 'cta_disarm_ignore',
    label: 'Disarming Out (Feel free to ignore)',
    ctaText: 'If you’re completely happy with your current list margins, feel free to ignore—otherwise, open to a 2-minute diagnostic?',
    channel: 'Email',
    psychologyAngle: 'Disarming Disqualification'
  },
  {
    id: 'cta_bad_timing',
    label: 'Bad timing check',
    ctaText: 'Is stopping rookie lead burn on your radar for next quarter, or caught you at bad timing?',
    channel: 'All',
    psychologyAngle: 'Permission-Based'
  },
  {
    id: 'cta_close_file',
    label: 'Close your file (Follow-up)',
    ctaText: 'Should I assume this isn\'t a priority and close your file, or are you still reviewing this?',
    channel: 'Email',
    psychologyAngle: 'No-Oriented'
  },
  {
    id: 'cta_linkedin_convo',
    label: 'Low-Pressure Open Question',
    ctaText: 'Curious if your floor is noticing the same objection friction with Titan BPO or if your reps are already crushing it?',
    channel: 'LinkedIn',
    psychologyAngle: 'Soft Conversational'
  },
  {
    id: 'cta_phone_hangup_or_30s',
    label: '30s or Hang Up (Phone)',
    ctaText: 'Do you want to hang up right now, or give me 25 seconds to tell you why I called and you decide?',
    channel: 'Phone',
    psychologyAngle: 'Pattern Interrupt'
  },
  {
    id: 'cta_phone_fair_enough',
    label: 'Fair Enough / Tell me to go (Phone)',
    ctaText: 'Give me 20 seconds—if none of this resonates with your floor at Apex, tell me to get lost and I never call back. Fair?',
    channel: 'Phone',
    psychologyAngle: 'Permission-Based'
  }
];

export const DEFAULT_OUTBOUND_FRAMEWORKS: OutboundFramework[] = [
  // ==========================================
  // --- B2B COLD CALLING GURU FRAMEWORKS ---
  // ==========================================
  {
    id: 'braun_cold_call',
    name: 'Josh Braun 20-Second Poke-The-Bear',
    channel: 'Phone',
    category: 'Pattern Interrupt & Permission',
    authorOrStyle: 'Josh Braun',
    description: 'Two-way dialogue opener. Acknowledges catching them out of the blue, uncovers the tension in 15 seconds, and asks a diagnostic question to get the prospect talking.',
    targetWordCount: 48,
    antiSalesPrinciple: 'Act as a diagnostic consultant. Speak <15 seconds, then immediately hand the microphone to the prospect with a provocative question.',
    promptInstruction: `Write an elite live cold calling spoken teleprompter script for an outbound SDR calling an executive.
CRITICAL RULE: TWO-WAY CONSULTATIVE DIALOGUE. Speak 80% about their reality, <20% about yourself. Never pitch software.
1. GREETING & PERMISSION: "Hey {{first_name}}, know I caught you out of the blue. Have you got 20 seconds for me to tell you why I called, and you can tell me if it makes sense?"
2. OBSERVATION & TENSION (From CSV): Reference their company ({{company}}), floor size ({{headcount}}), and tech stack ({{tech_stack}}). Uncover the tension (paying full price for shared lists while callers freeze when prospects mention {{outsourcer}}).
3. TWO-WAY DIAGNOSTIC QUESTION: "Does that bottleneck show up on your floor, or are your callers already converting those cleanly?"
Strict rules: Must sound completely natural, spoken, and calm. Strictly 40-55 words. Takes <18 seconds to speak aloud.`,
    exampleSnippet: `Hey Julian, know I caught you out of the blue. Have you got 20 seconds for me to tell you why I called, and you can tell me if it makes sense?\n\nI noticed Apex runs 250 outbound seats with Apollo and HubSpot. Most leaders tell us their biggest margin leak is callers getting shopped the second a prospect mentions Titan BPO. Does that happen on your floor, or are your callers already converting those cleanly?`,
    isDefault: true,
    isActive: true
  },
  {
    id: 'cegelski_farrokh_30mpc',
    name: 'Armand Farrokh & Nick Cegelski (30MPC)',
    channel: 'Phone',
    category: 'Interruption & Problem-Led',
    authorOrStyle: '30 Minutes to President\'s Club',
    description: 'Directly acknowledges being an interruption. Gives prospect the option to hang up or give 30 seconds, then hits a sharp problem hypothesis.',
    targetWordCount: 45,
    antiSalesPrinciple: 'Acknowledge the elephant in the room: cold calls are interruptions. Offering them the choice to hang up eliminates resistance instantly.',
    promptInstruction: `Write an Armand Farrokh & Nick Cegelski (30MPC) style cold call opener.
1. "Hey {{first_name}}, Nick with Appointmentlyy. I know I'm an interruption—do you want to hang up right now or give me 30 seconds to tell you why your floor at {{company}} came across my desk?"
2. If they stay on: "Typically when BPO directors run {{headcount}} with {{tech_stack}}, their reps waste 35% of dials fumbling price objections against {{outsourcer}}."
3. Disarming ask: "Are you seeing that on your floor, or is outbound already hitting quota?"
Max 50 words. Spoken cadence.`,
    exampleSnippet: `Julian, I know I'm an interruption—do you want to hang up right now, or give me 30 seconds to tell you why your floor at Apex came across my desk?\n\nTypically when directors run 250 seats with Apollo, callers waste 35% of dials fumbling price objections against Titan BPO. Are you seeing that, or is outbound already crushing quota?`,
    isActive: true
  },
  {
    id: 'voss_cold_call',
    name: 'Chris Voss Tactical Empathy & No-Oriented',
    channel: 'Phone',
    category: 'Tactical Empathy & Disarmament',
    authorOrStyle: 'Chris Voss (Never Split the Difference)',
    description: 'Labels their busy state upfront, uses negative constraint psychology, and asks a no-oriented question that makes them feel safe.',
    targetWordCount: 50,
    antiSalesPrinciple: 'Asking for a "Yes" feels like a trap. When a prospect says "No", they feel safe, in control, and willing to listen.',
    promptInstruction: `Write a Chris Voss cold call script applying tactical empathy.
1. "Julian, I'm sure you're in the middle of ten things managing operations at {{company}}."
2. "Would it be ridiculous if I took 20 seconds to explain why I called, and if it's not relevant, you tell me to get lost?"
3. State the core observation: "Most BPOs tell us buying more broker leads doesn't fix reps getting cut down on price."
4. No-oriented wrap: "Have you completely given up on stopping rookie lead burn, or is that worth a 2-minute diagnostic?"
Max 55 words.`,
    exampleSnippet: `Julian, I'm sure you're in the middle of ten things managing 250 seats at Apex.\n\nWould it be ridiculous if I took 20 seconds to explain why I called, and if it's completely irrelevant, you tell me to get lost?\n\nCurious if you’ve completely given up on stopping reps from getting shopped against Titan BPO, or is protecting seat margins still on your radar?`,
    isActive: true
  },
  {
    id: 'dennehy_brutal_honesty',
    name: 'Benjamin Dennehy Brutal Honesty Opener',
    channel: 'Phone',
    category: 'Self-Deprecating Pattern Interrupt',
    authorOrStyle: 'Benjamin Dennehy',
    description: 'Radically transparent cold call. Tells the prospect outright that this is a cold call and gives them permission to hang up if it sounds stupid.',
    targetWordCount: 45,
    antiSalesPrinciple: 'Salespeople hide behind fake rapport. Stating the raw truth disarms executive skepticism instantly.',
    promptInstruction: `Write a Benjamin Dennehy cold call script with radical self-deprecating honesty.
1. "Julian, look—this is 100% a cold call. You don't know me from Adam."
2. "Feel free to hang up on me in 20 seconds if I say anything stupid. Can I have 20 seconds to tell you why I called?"
3. Problem hypothesis: "I speak with BPO founders managing 250 seats who are sick of paying full price for shared leads that 3 other agencies are calling at the exact same time."
4. Question: "Is that a headache for you at Apex, or do you have that completely solved?"
Max 50 words.`,
    exampleSnippet: `Julian, look—this is 100% a cold call. You don't know me from Adam.\n\nFeel free to hang up on me in 20 seconds if I say anything stupid. Can I have 20 seconds?\n\nI speak with BPO directors managing 250 seats who are sick of paying full price for shared leads that 3 other competitors are dialing at the exact same minute. Is that a headache at Apex, or do you have that solved?`,
    isActive: true
  },
  {
    id: 'ingram_pattern_interrupt',
    name: 'Morgan J Ingram Pattern Interrupt',
    channel: 'Phone',
    category: 'Relevance & Curiosity',
    authorOrStyle: 'Morgan J Ingram',
    description: 'Interrupts the typical sales pattern by stating the reason for call immediately and verifying relevance before pitching.',
    targetWordCount: 50,
    antiSalesPrinciple: 'Prospects hate beating around the bush. Give the reason for the call in sentence one, then ask a relevant diagnostic question.',
    promptInstruction: `Write a Morgan J Ingram style cold call opener.
1. "Hey {{first_name}}, reason for my call is I noticed {{company}} is scaling CS and outbound sales across {{headcount}}."
2. "Before I jump into anything, typically leaders in your shoes tell us their callers hit a wall when prospects bring up {{outsourcer}}."
3. "Does rep objection drop-off on shared lists ring a bell on your floor, or are your callers already converting those?"
Max 50 words.`,
    exampleSnippet: `Hey Julian, reason for my call is I noticed Apex is scaling outbound across 250 seats with Apollo. Before I jump into anything, typically leaders in your shoes tell us their callers hit a wall when prospects bring up Titan BPO. Does rep objection hesitation ring a bell on your floor, or is that not an issue?`,
    isActive: true
  },
  {
    id: 'barrows_executive_story',
    name: 'John Barrows Executive Relevance',
    channel: 'Phone',
    category: 'Executive Diagnostic',
    authorOrStyle: 'John Barrows',
    description: 'Ties the outreach directly to their executive role, industry peers, and business impact.',
    targetWordCount: 55,
    antiSalesPrinciple: 'Executives only care about three things: increasing revenue, reducing costs, or mitigating risk. Speak to business impact.',
    promptInstruction: `Write a John Barrows executive cold call opener.
Focus directly on the prospect's role and company (from the lead fields).
Reference the risk of seat margin erosion when running 250 outbound seats on shared broker lists.
Ask for a 20-second window to benchmark their caller qualification rate against similar BPOs.
Max 60 words.`,
    exampleSnippet: `Julian, reason for my call is specific to your role managing outbound operations at Apex. When running 250 seats on shared lists, every caller who fumbles a price objection erodes seat margins. We engineered an AI copilot that gives callers sub-second live rebuttals. Could I take 20 seconds to show you how we benchmark caller hold-rates?`,
    isActive: true
  },

  // ==========================================
  // --- COLD EMAIL FRAMEWORKS ---
  // ==========================================
  {
    id: 'braun_poke_bear',
    name: "Josh Braun 4T (Poke The Bear)",
    channel: 'Email',
    category: 'Peer-to-Peer Consultation',
    authorOrStyle: 'Josh Braun',
    description: 'Trigger -> Tension -> Truth -> Teaser. Disarms defensive executives by validating why they haven’t solved this bottleneck yet.',
    targetWordCount: 55,
    antiSalesPrinciple: 'Never pitch software upfront. Frame the conversation around the hidden leak costing them margins. Aim for a 2-way diagnostic reply.',
    promptInstruction: `Write an ultra-short cold email using Josh Braun's Poke The Bear method.
1. TRIGGER: 1-sentence observation about their company/tech/headcount without sounding robotic.
2. TENSION: 1 sentence uncovering the tension (e.g. paying full price for shared leads that 3-5 competitors also bought).
3. TRUTH: 1 sentence on why traditional training or buying more leads fails when reps fumble the first 30 seconds.
4. TEASER: An anti-sales, permission-based closing question.
Strict rules: Max 60 words total. Lowercase subject line under 4 words. No "I hope this email finds you well", no "reaching out because", no calendar links. Focus 80% on their operation, <20% on you.`,
    exampleSnippet: `Subject: apex lead burn\n\nHi Julian,\n\nSaw your team is running 250 seats with Apollo and HubSpot. Typically when BPO leaders scale outbound, the hidden leak isn't lead volume—it's reps getting chopped on price by cheaper Manila competitors.\n\nOpen to a 3-minute video showing how we insulate rep margins, or totally off base?`,
    isDefault: true,
    isActive: true
  },
  {
    id: 'allred_50_word',
    name: 'Will Allred 50-Word Frictionless',
    channel: 'Email',
    category: 'High-Velocity Outbound',
    authorOrStyle: 'Will Allred (Lavender)',
    description: 'Strict 3-sentence email under 50 words. Mobile-first design readable in 8 seconds.',
    targetWordCount: 45,
    antiSalesPrinciple: 'Every extra word reduces response rate by 1.2%. Keep reading grade level at 5th grade.',
    promptInstruction: `Write a 3-sentence, strictly under 50-word cold email.
Sentence 1: Specific observation about their team/service line from CSV.
Sentence 2: The specific problem causing drop-off or margin crush.
Sentence 3: Low-friction permission-based question.
Strict rules: Total word count strictly under 50 words. Subject line strictly 2-3 words lowercase. Zero fluff.`,
    exampleSnippet: `Subject: quick question\n\nHi Julian,\n\nNoticed Apex Global is expanding outbound CS and sales across 250 seats. Most leaders we talk to mention shared directory lists burn rep morale when prospects claim they already spoke to 3 other BPOs.\n\nWorth a 2-minute look at how Boris AI fixes that live, or bad timing?`,
    isActive: true
  },
  {
    id: 'voss_no_oriented',
    name: 'Chris Voss "No-Oriented" Email',
    channel: 'Email',
    category: 'Negotiation & Disarmament',
    authorOrStyle: 'Chris Voss (Never Split the Difference)',
    description: 'Uses negative constraint psychology. Prospects feel protected and in control when they say "No".',
    targetWordCount: 50,
    antiSalesPrinciple: 'Asking for a "Yes" raises buyer defenses. Asking a question where "No" means agreement produces 3x reply rates.',
    promptInstruction: `Write an ultra-short cold email utilizing Chris Voss's "No-Oriented" questioning technique.
Begin with an honest statement disarming sales pressure: "Probably caught you at a bad time..." or "You might already have this completely handled..."
Reference 1 specific detail from their CSV profile.
Conclude with a no-oriented question: "Are you completely opposed to...", "Would it be a terrible idea to...", or "Have you given up on...".
Max 55 words.`,
    exampleSnippet: `Subject: bad timing?\n\nJulian - probably caught you at a bad time as you manage 250 seats at Apex.\n\nCurious if you’ve completely given up on stopping reps from getting shopped against offshore broker rates, or would you be open to a 2-minute overview on how we protect margins?`,
    isActive: true
  },
  {
    id: 'founder_peer_to_peer',
    name: 'Founder-to-Founder Problem Ledger',
    channel: 'Email',
    category: 'Executive Diagnostic',
    authorOrStyle: 'Emil (Founder BDM)',
    description: 'Written from a 17-year BDM veteran perspective. Discusses seat economics and ROI without vendor jargon.',
    targetWordCount: 65,
    antiSalesPrinciple: 'Speak operator-to-operator. Never sound like a junior SDR reading a sequence template.',
    promptInstruction: `Write an operator-to-operator cold email from Emil, a 17-year outbound BDM veteran, to an executive.
Frame the issue around seat gross margin and lead list economics.
Mention that buying more list data doesn't fix caller conversion when reps freeze on competitor price objections.
Offer a direct peer conversation without a pitch deck.
Max 70 words.`,
    exampleSnippet: `Subject: apex seat margins\n\nJulian,\n\nRunning 250 outbound seats means every rep dialing stale contacts and wrong numbers burns gross margin fast. Most BPOs keep buying more leads, but the bottleneck is list quality and callers getting cut down the second a prospect mentions Titan BPO.\n\nOpen to a peer-to-peer screen share Thursday to show how we solve that in 2 minutes?`,
    isActive: true
  },

  // ==========================================
  // --- LINKEDIN OUTBOUND FRAMEWORKS ---
  // ==========================================
  {
    id: 'welsh_1to1_connection',
    name: 'Justin Welsh 1-to-1 Connection Note',
    channel: 'LinkedIn',
    category: 'Connection Invite',
    authorOrStyle: 'Justin Welsh',
    description: 'Under 200 characters. Specific compliment or observation on their company with zero sales pitch.',
    targetWordCount: 30,
    antiSalesPrinciple: 'Pitching in a connection request triggers instant decline and spam flagging. Only seek connection.',
    promptInstruction: `Write a personalized LinkedIn connection note strictly UNDER 220 characters.
Acknowledge their exact role and company. Mention their seat scale or outbound focus.
Do NOT pitch any product, service, or demo.
End with a genuine compliment or warm open question.`,
    exampleSnippet: `Hi Julian - impressed seeing Apex Global scale to 250 seats across Manila. Curious how your outbound team is tackling lead qualification this quarter. Would love to follow your work here!`,
    isDefault: true,
    isActive: true
  },
  {
    id: 'linkedin_inmail_teardown',
    name: 'Friction Teardown InMail',
    channel: 'LinkedIn',
    category: 'InMail / Direct Message',
    authorOrStyle: 'Modern Outbound Lab',
    description: '2 short paragraphs highlighting one specific friction point from their tech stack and offering a 90-second custom video.',
    targetWordCount: 55,
    antiSalesPrinciple: 'Offer high value with zero commitment. Let them request the video before asking for a call.',
    promptInstruction: `Write a short 2-paragraph LinkedIn InMail strictly under 60 words.
Paragraph 1: Point out how teams running their tech stack (e.g. Apollo/HubSpot) encounter objection drop-off on cold dials.
Paragraph 2: Offer to send a 90-second video teardown showing the exact rebuttal fix, asking if they are open to receiving it.
Anti-sales CTA: "Mind if I send the 90-sec Loom over here, or too busy right now?"`,
    exampleSnippet: `Julian - saw you're heading outbound at Apex. A lot of BPOs running Apollo/HubSpot tell us callers waste 40% of dials fumbling price objections.\n\nWe recorded a 90-second teardown showing how AI gives callers live rebuttals on screen. Mind if I drop the link here, or too busy right now?`,
    isActive: true
  },
  {
    id: 'linkedin_no_pitch_question',
    name: 'Zero-Pitch Curiosity Question',
    channel: 'LinkedIn',
    category: 'InMail / Direct Message',
    authorOrStyle: 'Conversational Sales',
    description: '1 to 2 sentences asking a candid question about their market friction. Starts an authentic dialogue.',
    targetWordCount: 35,
    antiSalesPrinciple: 'The objective of message #1 is solely to start a conversation, not book a demo.',
    promptInstruction: `Write a 2-sentence conversational LinkedIn message under 40 words.
Ask an authentic, candid question about whether their reps struggle with the common industry pain point.
Strictly no pitch, no links, no calendar invites.`,
    exampleSnippet: `Hey Julian, quick question—how much of the list your reps at Apex dial actually connects, or do bounced emails and wrong numbers eat most of the shift?`,
    isActive: true
  }
];

/**
 * The example snippets and CTAs are written around the demo workspace's sample prospect.
 * Client workspaces see the same templates with placeholders instead of that prospect.
 */
const PLACEHOLDER_SWAPS: [RegExp, string][] = [
  [/Nick with Appointmentlyy/g, '[Your name] with [Your company]'],
  [/Emil \(Founder BDM\)/g, 'Founder BDM'],
  [/from Emil, a 17-year outbound BDM veteran,/g, 'from a veteran outbound BDM'],
  [/Julian Vance/g, '[Prospect name]'],
  [/Julian/g, '[First name]'],
  [/Apex Global BPO/g, '[Company]'],
  [/Apex Global/g, '[Company]'],
  [/Apex/g, '[Company]'],
  [/apex/g, '[company]'],
];

function withPlaceholders<T>(value: T): T {
  const swap = (text: string) => PLACEHOLDER_SWAPS.reduce((t, [re, to]) => t.replace(re, to), text);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return swap(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

export interface FrameworkFillValues {
  firstName?: string;
  fullName?: string;
  company?: string;
  title?: string;
  senderName?: string;
  senderCompany?: string;
}

/**
 * Turn a framework's text (written around the demo prospect, with {{placeholders}}) into text
 * about the real recipient and sender. Values that aren't known stay as a readable marker so a
 * model never fills them with invented facts.
 */
export function fillFrameworkText(text: string, v: FrameworkFillValues): string {
  const or = (value: string | undefined, marker: string) => (value && value.trim() ? value.trim() : marker);
  const first = or(v.firstName || v.fullName?.split(/\s+/)[0], '[first name]');
  const tokens: Record<string, string> = {
    first_name: first,
    name: or(v.fullName, first),
    company: or(v.company, '[their company]'),
    title: or(v.title, '[their role]'),
    sender_name: or(v.senderName, '[your name]'),
    sender_company: or(v.senderCompany, '[your company]'),
  };
  return PLACEHOLDER_SWAPS.reduce((t, [re, to]) => t.replace(re, to), text)
    .replace(/\[Your name\]/g, tokens.sender_name)
    .replace(/\[Your company\]/g, tokens.sender_company)
    .replace(/\[Prospect name\]/g, tokens.name)
    .replace(/\[First name\]/g, tokens.first_name)
    .replace(/\[Company\]|\[company\]/g, tokens.company)
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => tokens[key.toLowerCase()] ?? `[${key.replace(/_/g, ' ')}: not provided]`);
}

/** Default frameworks for the current workspace (sample prospect only in the demo workspace). */
export function getDefaultOutboundFrameworks(): OutboundFramework[] {
  return isDemoWorkspace() ? DEFAULT_OUTBOUND_FRAMEWORKS : withPlaceholders(DEFAULT_OUTBOUND_FRAMEWORKS);
}

/** Default anti-sales CTAs for the current workspace. */
export function getDefaultAntiSalesCtas(): AntiSalesCta[] {
  return isDemoWorkspace() ? DEFAULT_ANTI_SALES_CTAS : withPlaceholders(DEFAULT_ANTI_SALES_CTAS);
}

// Helper to load frameworks from localStorage (with fallback to defaults)
export function getStoredFrameworks(): OutboundFramework[] {
  if (typeof window === 'undefined') return DEFAULT_OUTBOUND_FRAMEWORKS;
  try {
    const raw = localStorage.getItem('appointmentlyy_outbound_frameworks');
    if (!raw) return getDefaultOutboundFrameworks();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return cleanStoredDemoText('appointmentlyy_outbound_frameworks', parsed as OutboundFramework[], getDefaultOutboundFrameworks(), !isDemoWorkspace());
    }
    return getDefaultOutboundFrameworks();
  } catch {
    return getDefaultOutboundFrameworks();
  }
}

// Helper to save frameworks into localStorage
export function saveStoredFrameworks(frameworks: OutboundFramework[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('appointmentlyy_outbound_frameworks', JSON.stringify(frameworks));
  } catch (err) {
    console.error('Failed to save frameworks:', err);
  }
}

// Helper to load anti-sales CTAs
export function getStoredAntiSalesCtas(): AntiSalesCta[] {
  if (typeof window === 'undefined') return DEFAULT_ANTI_SALES_CTAS;
  try {
    const raw = localStorage.getItem('appointmentlyy_anti_sales_ctas');
    if (!raw) return getDefaultAntiSalesCtas();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return cleanStoredDemoText('appointmentlyy_anti_sales_ctas', parsed as AntiSalesCta[], getDefaultAntiSalesCtas(), !isDemoWorkspace());
    }
    return getDefaultAntiSalesCtas();
  } catch {
    return getDefaultAntiSalesCtas();
  }
}

// Helper to save anti-sales CTAs
export function saveStoredAntiSalesCtas(ctas: AntiSalesCta[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('appointmentlyy_anti_sales_ctas', JSON.stringify(ctas));
  } catch (err) {
    console.error('Failed to save anti-sales CTAs:', err);
  }
}
