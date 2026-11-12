/**
 * Cold Email Studio Engine & Frameworks
 * 
 * Built for enterprise SDRs and BDMs to write manual, high-converting cold emails
 * grounded in proven B2B sales frameworks.
 * 
 * STRICT RULES:
 * 1. ZERO EM DASHES (No "—", "–", or "--")
 * 2. ZERO EMOJIS (No emojis anywhere)
 * 3. ULTRA CONCISE: Body strictly 40 to 75 words
 * 4. ANTI-SALES CTAs: Low-friction, permission-based or no-oriented
 */

import { CadenceLeadRecord } from './cadenceMaster';
import { CsvIntelligenceSummary } from './linkedinStudio';

export interface ColdEmailFramework {
  id: string;
  name: string;
  authorOrStyle: string;
  category: string;
  description: string;
  targetWordCount: number;
  antiSalesPrinciple: string;
  promptInstruction: string;
  defaultIdeaTemplate: string;
}

export interface ColdEmailGeneratedDraft {
  id: string;
  subjectLines: {
    label: string;
    text: string;
    angle: string;
  }[];
  selectedSubjectIndex: number;
  body: string;
  structuralBreakdown: {
    triggerOrHook: string;
    tensionOrObservation: string;
    truthOrValue: string;
    ctaSentence: string;
  };
  ctaVariations: {
    label: string;
    text: string;
    style: 'Interest-Based' | 'No-Oriented' | 'Radical Transparency' | 'Permission-Video';
  }[];
  selectedCtaIndex: number;
  wordCount: number;
  readingGradeLevel: string;
  frameworkUsed: string;
  prospectTargetName?: string;
  prospectTargetCompany?: string;
  userRawIdea?: string;
  sanitizationAudit: {
    emDashesRemoved: number;
    emojisRemoved: number;
    isClean: boolean;
  };
}

export interface SendingGuidanceHint {
  bestDays: {
    day: string;
    rating: 'Optimal' | 'High' | 'Low' | 'Strategic';
    reason: string;
  }[];
  bestTimeSlots: {
    slot: string;
    timezoneNote: string;
    effectiveness: string;
  }[];
  personalAccountSafety: {
    maxDailyManualSends: number;
    recommendedStaggerMinutes: string;
    maxBounceRatePercent: number;
    rampSchedule: {
      week: string;
      dailyLimit: number;
      focus: string;
    }[];
    safetyWarning: string;
  };
}

// =========================================================================
// BEST OF THE BEST COLD EMAIL FRAMEWORKS
// =========================================================================
export const COLD_EMAIL_FRAMEWORKS: ColdEmailFramework[] = [
  {
    id: 'braun-poke-the-bear',
    name: 'Josh Braun 4T (Poke The Bear)',
    authorOrStyle: 'Josh Braun',
    category: 'Diagnostic Tension',
    description: 'Trigger -> Tension -> Truth -> Teaser. Uncovers the hidden leak costing them margins without pitching software upfront.',
    targetWordCount: 55,
    antiSalesPrinciple: 'Never pitch software upfront. Frame the email around the hidden friction in their current workflow.',
    promptInstruction: `Use Josh Braun's Poke The Bear method.
1. Trigger: 1 sentence citing specific company or tech stack intelligence.
2. Tension: 1 sentence exposing the tension (e.g. paying full price for shared leads that competitors also call).
3. Truth: 1 sentence explaining why traditional approaches fail.
4. Teaser: Anti-sales permission question giving them an easy out.
Strict rules: Under 60 words total. Lowercase subject line under 4 words. ZERO em dashes. ZERO emojis.`,
    defaultIdeaTemplate: 'Tell a BPO operations leader that their SDRs are burning client leads because reps freeze on competitor price objections in the first 20 seconds.'
  },
  {
    id: 'radical-transparency',
    name: 'Radical Transparency / Meta-Proof',
    authorOrStyle: 'Appointmentlyy BDM playbook',
    category: 'Pattern Interrupt & Proof',
    description: 'Directly reveals that you are using Appointmentlyy right now to acquire them. Proves product capability through the interaction itself.',
    targetWordCount: 65,
    antiSalesPrinciple: 'Radical honesty disarms defensive skepticism faster than any polished script.',
    promptInstruction: `Write a radical transparency cold email from an outbound BDM.
Disarm sales pressure by stating you are actively using Appointmentlyy SDR to conduct this outreach.
Explain that if this message earned 10 seconds of their attention, their own callers can achieve the exact same engagement on client campaigns.
Strict rules: Strictly under 70 words. Zero em dashes. Zero emojis. 2-3 word subject line.`,
    defaultIdeaTemplate: 'Tell the recipient that the reason this outreach felt different is because we used Appointmentlyy to craft it, and invite them to see how their 50 reps can do the same.'
  },
  {
    id: 'allred-50-word',
    name: 'Will Allred 50-Word Frictionless',
    authorOrStyle: 'Will Allred (Lavender)',
    category: 'High-Velocity Outbound',
    description: 'Strict 3 sentences under 50 words. Mobile-first design readable in 8 seconds at a 5th-grade reading level.',
    targetWordCount: 45,
    antiSalesPrinciple: 'Every extra word reduces reply rates by 1.2%. Strip all fluff and pleasantries.',
    promptInstruction: `Write a strictly 3-sentence cold email under 50 words.
Sentence 1: Specific observation about their team size or service line.
Sentence 2: The specific problem causing drop-off or margin crush.
Sentence 3: Low friction permission-based question.
Strict rules: Word count under 50 words. Lowercase subject line 2 to 3 words. Zero em dashes. Zero emojis.`,
    defaultIdeaTemplate: 'Notice they are running 250 outbound seats and ask if rep morale is suffering from recycled shared lists.'
  },
  {
    id: 'voss-no-oriented',
    name: 'Chris Voss "No-Oriented" Email',
    authorOrStyle: 'Chris Voss (Never Split the Difference)',
    category: 'Negotiation & Disarmament',
    description: 'Uses negative constraint psychology. Prospects feel in control and protected when answering "No".',
    targetWordCount: 50,
    antiSalesPrinciple: 'Asking for a "Yes" raises buyer defenses. Asking a question where "No" means agreement produces 3x replies.',
    promptInstruction: `Write an ultra-short cold email utilizing Chris Voss No-Oriented questioning.
Begin with an honest statement disarming sales pressure: "Probably caught you at a bad time..."
Reference 1 specific detail about their operations or seat count.
Conclude with a no-oriented question: "Would it be a terrible idea to...", "Are you completely opposed to...", or "Have you given up on...".
Strict rules: Under 55 words. Zero em dashes. Zero emojis.`,
    defaultIdeaTemplate: 'Ask a VP of Operations if they have completely given up on stopping setter attrition on cold dials.'
  },
  {
    id: 'before-after-bridge',
    name: 'Before-After-Bridge (BAB)',
    authorOrStyle: 'Direct Response Classic',
    category: 'Transformation Contrast',
    description: 'Before (current bottleneck) -> After (flawless execution) -> Bridge (how we connect them in 72 hours).',
    targetWordCount: 60,
    antiSalesPrinciple: 'Keep the bridge lightweight. Never explain product features; explain the operational shortcut.',
    promptInstruction: `Write a 3-part Before-After-Bridge cold email.
Before: Current reality where reps burn leads and take 4 weeks to ramp.
After: What it looks like when new hires book qualified seats in their first 72 hours.
Bridge: A 1-sentence link inviting an operator look.
Strict rules: Under 65 words. Zero em dashes. Zero emojis.`,
    defaultIdeaTemplate: 'Compare reps fumbling for 4 weeks in classroom training vs live dials in 72 hours.'
  },
  {
    id: 'problem-agitate-solve',
    name: 'Problem-Agitate-Solve (PAS)',
    authorOrStyle: 'Dan Kennedy / Consultative',
    category: 'Executive Diagnostic',
    description: 'Problem (bad lead data) -> Agitate (paying reps to dial wrong numbers and bad-fit contacts) -> Solve (verified lists + live cockpit).',
    targetWordCount: 65,
    antiSalesPrinciple: 'Agitate the economic cost, not emotional pain. Executives care about gross margin and seat yield.',
    promptInstruction: `Write a consultative PAS cold email focused on seat economics and lead list fatigue.
Agitate the compounding cost of seat turnover.
Strict rules: Under 70 words. Zero em dashes. Zero emojis.`,
    defaultIdeaTemplate: 'Calculate how a 50-seat team loses $14,000 monthly when callers get hung up on within 15 seconds.'
  },
  {
    id: 'executive-observation',
    name: '3-Sentence Direct Observation',
    authorOrStyle: 'Operator Direct',
    category: 'Peer-to-Peer',
    description: 'Zero preamble. States an operational fact, highlights an anomaly, and poses a 5-second diagnostic question.',
    targetWordCount: 40,
    antiSalesPrinciple: 'Treat the prospect like a peer executive whose time is worth $500 an hour.',
    promptInstruction: `Write a razor-sharp 3-sentence direct observation email.
No hello pleasantries. Direct to the point.
Strict rules: Under 45 words. Zero em dashes. Zero emojis.`,
    defaultIdeaTemplate: 'Point out that their competitors are offering guaranteed qualified sits and ask how they protect client retention.'
  }
];

// =========================================================================
// PRESET USER IDEAS (FOR QUICK 1-CLICK TESTING IN THE IDEA BOX)
// =========================================================================
export interface ColdEmailIdeaPreset {
  id: string;
  label: string;
  targetAudience: string;
  rawIdea: string;
  recommendedFrameworkId: string;
}

export const COLD_EMAIL_IDEA_PRESETS: ColdEmailIdeaPreset[] = [
  {
    id: 'shared-leads-leak',
    label: 'Shared Lead Margin Leaks',
    targetAudience: 'BPO Operations Director / CEO',
    rawIdea: 'I want to tell a BPO owner that their 250 SDRs are wasting 4 hours a day on dead leads from shared broker lists where competitors already called 5 times. I want to invite them to see how we qualify leads live without buying more bloated Apollo lists.',
    recommendedFrameworkId: 'braun-poke-the-bear'
  },
  {
    id: 'radical-meta-proof',
    label: 'Radical Transparency / Meta-Proof',
    targetAudience: 'VP of Sales / Agency Founder',
    rawIdea: 'I want to be completely transparent that I used Appointmentlyy SDR right now on this cold email, and prove that if it got their attention in 10 seconds, it will do the exact same thing for their 50 callers on client campaigns.',
    recommendedFrameworkId: 'radical-transparency'
  },
  {
    id: 'foreign-client-fear',
    label: 'Foreign Client: No Script Robots',
    targetAudience: 'US/AUS Founder Outsourcing to Manila',
    rawIdea: 'I want to reach a foreign client outsourcing to the Philippines who is terrified of getting robotic callers who sound scripted. I want to show them our reps speak naturally and handle live pushback within 72 hours of floor ramp.',
    recommendedFrameworkId: 'before-after-bridge'
  },
  {
    id: 'objection-speed',
    label: 'Sub-180ms Live Objection Handling',
    targetAudience: 'Head of Outbound / Inside Sales',
    rawIdea: 'I want to address the fact that junior callers freeze the moment a prospect mentions price or an incumbent vendor. We feed real-time consultative rebuttals in 150ms from our live cockpit so the call never derails.',
    recommendedFrameworkId: 'voss-no-oriented'
  },
  {
    id: 'seat-retention-burn',
    label: 'Rep Burnout & Attrition',
    targetAudience: 'Call Center Director',
    rawIdea: 'Reps quit within 60 days because cold calling on fatigued lists is soul-crushing. When reps have live conversational AI coaching them on every objection, booking rate doubles and attrition drops.',
    recommendedFrameworkId: 'allred-50-word'
  }
];

// =========================================================================
// STRATEGIC GUIDANCE: BEST SENDING DAYS, TIMES & PERSONAL ACCOUNT LIMITS
// =========================================================================
export const MANUAL_COLD_EMAIL_GUIDANCE: SendingGuidanceHint = {
  bestDays: [
    {
      day: 'Tuesday',
      rating: 'Optimal',
      reason: 'Highest open rate and response velocity of the week. Executives have cleared Monday fires and are focused on operational priorities.'
    },
    {
      day: 'Wednesday',
      rating: 'Optimal',
      reason: 'Peak mid-week productivity window. Calendar is structured and decision-makers actively review short diagnostic peer emails.'
    },
    {
      day: 'Thursday',
      rating: 'High',
      reason: 'Strong response day before Friday wind-down. High reply rates between 8:30 AM and 11:00 AM.'
    },
    {
      day: 'Sunday Evening',
      rating: 'Strategic',
      reason: '6:30 PM - 8:30 PM (Recipient Local Time). Executives clean out inboxes and map their week before Monday morning chaos begins.'
    },
    {
      day: 'Monday',
      rating: 'Low',
      reason: 'Inbox triage day. Cold emails get buried under internal executive catch-up, board updates, and weekend ticket queues.'
    },
    {
      day: 'Friday Afternoon',
      rating: 'Low',
      reason: 'Mental checkout and early finishes. Emails sent after 1:00 PM get pushed to Monday and frequently get deleted in mass bulk-clear.'
    }
  ],
  bestTimeSlots: [
    {
      slot: '8:15 AM - 10:00 AM',
      timezoneNote: 'Recipient Local Time',
      effectiveness: '3.4x higher open rate. Caught during first coffee desk arrival before back-to-back meetings commence.'
    },
    {
      slot: '1:30 PM - 2:30 PM',
      timezoneNote: 'Recipient Local Time',
      effectiveness: 'Post-lunch desk check. Executives scan through quick 45-word emails before starting afternoon task blocks.'
    },
    {
      slot: '6:30 PM - 8:00 PM (Sunday)',
      timezoneNote: 'Recipient Local Time',
      effectiveness: 'Low noise window. Zero vendor competition in the inbox, leading to first-read status on Monday morning.'
    }
  ],
  personalAccountSafety: {
    maxDailyManualSends: 40, // 30 - 50 safe zone
    recommendedStaggerMinutes: '2 to 4 minutes between manual sends',
    maxBounceRatePercent: 2,
    rampSchedule: [
      { week: 'Week 1', dailyLimit: 10, focus: 'Verify SPF/DKIM/DMARC and warm domain' },
      { week: 'Week 2', dailyLimit: 20, focus: 'Target high-fit CSV leads with tailored first lines' },
      { week: 'Week 3', dailyLimit: 35, focus: 'Maintain >30% open rate and <1% bounce rate' },
      { week: 'Week 4+', dailyLimit: 45, focus: 'Steady-state manual sending ceiling (Never exceed 50)' }
    ],
    safetyWarning: 'Sending over 50 cold emails per day on a personal Google Workspace or Microsoft 365 mailbox triggers machine-learning spam telemetry algorithms. Stagger each manual email by at least 2 minutes and keep copy strictly personalized.'
  }
};

// =========================================================================
// STRICT SANITIZER (ENFORCES ZERO EM DASHES AND ZERO EMOJIS)
// =========================================================================
export function sanitizeColdEmail(text: string): { cleanText: string; emDashesCount: number; emojisCount: number } {
  if (!text) return { cleanText: '', emDashesCount: 0, emojisCount: 0 };

  // 1. Detect and strip emojis
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{200D}\u{FE0F}]/gu;
  const emojiMatches = text.match(emojiRegex);
  const emojisCount = emojiMatches ? emojiMatches.length : 0;
  let cleanText = text.replace(emojiRegex, '');

  // 2. Detect and strip em dashes, en dashes, and double hyphens
  const emDashRegex = /[—–]|(?<=\s)--(?:(?=\s)|$)|(?<=\w)--(?:(?=\w)|$)/g;
  const emDashMatches = cleanText.match(emDashRegex);
  const emDashesCount = emDashMatches ? emDashMatches.length : 0;
  
  // Replace em dashes cleanly with comma or period without collapsing newlines
  cleanText = cleanText
    .replace(/[ \t]*[—–][ \t]*/g, ', ')
    .replace(/[ \t]*--[ \t]*/g, ', ')
    .replace(/,[ \t]*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,?!])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    cleanText,
    emDashesCount,
    emojisCount
  };
}

/**
 * Automatically segments an email body into clean, spaced paragraphs.
 * If the email is a single squashed run-on sentence, it separates greeting,
 * problem observation, value prop, and call-to-action with double newlines.
 */
export function formatEmailToParagraphs(rawBody: string): string[] {
  if (!rawBody) return [];

  // If already formatted with double newlines, use them
  if (/\n\s*\n/.test(rawBody.trim())) {
    return rawBody
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean);
  }

  // If already formatted with single newlines, use them
  const lines = rawBody.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }

  // If completely squashed into 1 run-on string with no newlines:
  let text = rawBody.trim();

  // 1. Separate greeting: "Hi Name," or "Hey Name," or "Hello Name,"
  text = text.replace(/^((?:Hi|Hey|Hello|Dear)\s+[^,]+,)\s*/i, '$1\n\n');

  // 2. Separate observation sentence if preceded by greeting
  text = text.replace(/([.?!])\s+(Typically|Most leaders|Notice|Saw\s)/i, '$1\n\n$2');

  // 3. Separate middle paragraph / value prop
  text = text.replace(/([.?!])\s+(Traditional coaching|Our live cockpit|Our system|We feed|Top BPOs|Curious if)/i, '$1\n\n$2');

  // 4. Separate CTA / closing question
  text = text.replace(/([.?!])\s+(Open to|Would it be|Worth a|Are you|Could we|Have you|If this)/i, '$1\n\n$2');

  // 5. Separate sign-offs
  text = text.replace(/([.?!])\s+(Best,|Regards,|Thanks,|Cheers,|Sincerely,)\s*/i, '$1\n\n$2\n');

  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

// =========================================================================
// STRICT SUBJECT LINE HELPER (ENFORCES MAXIMUM OF 3 WORDS ONLY)
// =========================================================================
export function enforceMaxThreeWords(text: string): string {
  if (!text) return 'quick question';
  const clean = text
    .toLowerCase()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{200D}\u{FE0F}]/gu, '')
    .replace(/[—–]/g, ' ')
    .replace(/[^\w\s?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 0) return 'quick question';
  return words.slice(0, 3).join(' ');
}

/**
 * Generates 3 suggested subject lines based on the end user's idea,
 * strictly enforcing the maximum 3 words rule.
 */
export function suggestSubjectLinesFromIdea(
  idea: string,
  targetProspect?: { name?: string; company?: string; title?: string }
): { label: string; text: string; angle: string }[] {
  const shortCompany = (targetProspect?.company || '')
    .replace(/BPO|Solutions|Inc|LLC|Corp|Group|Services/gi, '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase() || 'team';

  const lowerIdea = (idea || '').toLowerCase().trim();

  // Angle 1: Derived from user's idea (Friction Hook)
  let variation1 = `${shortCompany} lead burn`;
  if (lowerIdea.includes('broker') || lowerIdea.includes('middleman') || lowerIdea.includes('margin')) {
    variation1 = 'broker margin leak';
  } else if (lowerIdea.includes('ramp') || lowerIdea.includes('rookie') || lowerIdea.includes('onboard')) {
    variation1 = 'rookie ramp time';
  } else if (lowerIdea.includes('hesitation') || lowerIdea.includes('freeze') || lowerIdea.includes('stumble')) {
    variation1 = 'caller freeze rate';
  } else if (lowerIdea.includes('seat') || lowerIdea.includes('floor') || lowerIdea.includes('scale')) {
    variation1 = `${shortCompany} seat scale`;
  } else if (lowerIdea.includes('script') || lowerIdea.includes('teleprompt')) {
    variation1 = 'scriptless caller test';
  } else if (lowerIdea.length > 0) {
    variation1 = enforceMaxThreeWords(lowerIdea);
  }

  // Angle 2: Low-Friction / Casual Internal Note
  let variation2 = 'quick question';
  if (lowerIdea.includes('direct') || lowerIdea.includes('contract')) {
    variation2 = 'direct contract question';
  } else if (lowerIdea.includes('time') || lowerIdea.includes('bad')) {
    variation2 = 'bad timing?';
  } else if (lowerIdea.includes('video') || lowerIdea.includes('demo')) {
    variation2 = 'quick 2min video?';
  } else {
    variation2 = 'quick question';
  }

  // Angle 3: Seat Economics / Metric Focus
  let variation3 = `${shortCompany} conversion leak`;
  if (lowerIdea.includes('apollo') || lowerIdea.includes('hubspot') || lowerIdea.includes('stack')) {
    variation3 = `${shortCompany} apollo list`;
  } else if (lowerIdea.includes('churn') || lowerIdea.includes('attrition') || lowerIdea.includes('burnout')) {
    variation3 = 'setter churn leak';
  } else if (lowerIdea.includes('objection') || lowerIdea.includes('sparring')) {
    variation3 = 'objection win rate';
  } else {
    variation3 = `${shortCompany} seat margins`;
  }

  return [
    {
      label: 'Friction Hook',
      text: enforceMaxThreeWords(variation1),
      angle: 'Based on your idea • Max 3 words'
    },
    {
      label: 'Low Friction',
      text: enforceMaxThreeWords(variation2),
      angle: 'Casual internal peer note'
    },
    {
      label: 'Seat Economics',
      text: enforceMaxThreeWords(variation3),
      angle: 'Account & metric observation'
    }
  ];
}

// =========================================================================
// DETERMINISTIC COLD EMAIL GENERATOR (FOR IMMEDIATE OFFLINE & INSTANT UI)
// =========================================================================
export function getDeterministicColdEmail(
  frameworkId: string,
  userIdea?: string,
  targetProspect?: { name?: string; company?: string; title?: string }
): ColdEmailGeneratedDraft {
  const name = targetProspect?.name?.split(' ')[0] || 'there';
  const company = targetProspect?.company || 'your team';
  const shortCompany = (targetProspect?.company || '')
    .replace(/BPO|Solutions|Inc|LLC|Corp|Group|Services/gi, '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase() || 'team';
  const idea = userIdea || 'I want to reach out to an operations leader whose SDRs are burning client leads because reps freeze on competitor price objections.';

  if (frameworkId === 'radical-transparency') {
    const rawBody = `${name}, can I be transparent for 10 seconds? The reason this email felt different from the last five vendor pitches in your inbox is because I am using Appointmentlyy right now.

Our system helped me research ${company} and synthesize this message in 150 milliseconds.

If this earned 10 seconds of your attention, would you be open to a 2-minute look at how your own reps can do the same on client campaigns?`;

    const { cleanText, emDashesCount, emojisCount } = sanitizeColdEmail(rawBody);

    return {
      id: 'draft-rt-default',
      subjectLines: [
        { label: 'Radical Transparency', text: enforceMaxThreeWords('10 seconds transparency'), angle: 'Disarming pattern interrupt' },
        { label: 'Direct Operational', text: enforceMaxThreeWords(`${shortCompany} rep conversion`), angle: 'Executive curiosity' },
        { label: 'No-Pressure', text: 'quick question', angle: 'Low friction lowercase' }
      ],
      selectedSubjectIndex: 0,
      body: cleanText,
      structuralBreakdown: {
        triggerOrHook: `${name}, can I be transparent for 10 seconds?`,
        tensionOrObservation: 'The reason this email felt different is because I am using Appointmentlyy right now to craft it.',
        truthOrValue: `Our system researched ${company} and synthesized this message in 150 milliseconds.`,
        ctaSentence: 'If this earned 10 seconds of your attention, would you be open to a 2-minute look?'
      },
      ctaVariations: [
        { label: 'Radical Proof', text: 'If this earned 10 seconds of your attention, would you be open to a 2-minute look at how your own reps can do the same?', style: 'Radical Transparency' },
        { label: 'No-Oriented', text: 'Would it be a terrible idea to take a 2-minute look Thursday, or is this completely off base?', style: 'No-Oriented' },
        { label: 'Permission-Video', text: 'Open to a 90-second screen recording showing how this works on live dials?', style: 'Permission-Video' }
      ],
      selectedCtaIndex: 0,
      wordCount: cleanText.split(/\s+/).filter(Boolean).length,
      readingGradeLevel: '5th Grade',
      frameworkUsed: 'Radical Transparency / Meta-Proof',
      prospectTargetName: name,
      prospectTargetCompany: company,
      userRawIdea: idea,
      sanitizationAudit: {
        emDashesRemoved: emDashesCount,
        emojisRemoved: emojisCount,
        isClean: true
      }
    };
  }

  if (frameworkId === 'allred-50-word') {
    const rawBody = `Hi ${name},

Noticed ${company} is expanding outbound calling across the floor. Most leaders mention shared broker lists burn rep morale when prospects claim they already spoke to three competitors.

Worth a 2-minute look at how we fix that live, or bad timing?`;

    const { cleanText, emDashesCount, emojisCount } = sanitizeColdEmail(rawBody);

    return {
      id: 'draft-allred-default',
      subjectLines: [
        { label: 'Lavender 2-Word', text: 'quick question', angle: 'Frictionless lowercase' },
        { label: 'Specific Target', text: enforceMaxThreeWords(`${shortCompany} callers`), angle: 'Direct observation' },
        { label: 'Timing Check', text: 'bad timing?', angle: 'No-oriented' }
      ],
      selectedSubjectIndex: 0,
      body: cleanText,
      structuralBreakdown: {
        triggerOrHook: `Noticed ${company} is expanding outbound calling across the floor.`,
        tensionOrObservation: 'Most leaders mention shared broker lists burn rep morale when prospects claim they already spoke to three competitors.',
        truthOrValue: 'Our live cockpit feeds reps the exact consultative rebuttal in 150 milliseconds.',
        ctaSentence: 'Worth a 2-minute look at how we fix that live, or bad timing?'
      },
      ctaVariations: [
        { label: 'Frictionless', text: 'Worth a 2-minute look at how we fix that live, or bad timing?', style: 'Interest-Based' },
        { label: 'No-Oriented', text: 'Are you completely opposed to seeing a 2-minute breakdown Thursday?', style: 'No-Oriented' },
        { label: 'Diagnostic', text: 'Open to comparing notes on how other BPOs insulate caller margins?', style: 'Permission-Video' }
      ],
      selectedCtaIndex: 0,
      wordCount: cleanText.split(/\s+/).filter(Boolean).length,
      readingGradeLevel: '4th Grade',
      frameworkUsed: 'Will Allred 50-Word Frictionless',
      prospectTargetName: name,
      prospectTargetCompany: company,
      userRawIdea: idea,
      sanitizationAudit: {
        emDashesRemoved: emDashesCount,
        emojisRemoved: emojisCount,
        isClean: true
      }
    };
  }

  if (frameworkId === 'voss-no-oriented') {
    const rawBody = `${name}, probably caught you at a bad time as you manage outbound operations at ${company}.

Curious if you have completely given up on stopping reps from getting shopped on price against offshore brokers, or would you be open to a 2-minute overview on how we protect margins?`;

    const { cleanText, emDashesCount, emojisCount } = sanitizeColdEmail(rawBody);

    return {
      id: 'draft-voss-default',
      subjectLines: [
        { label: 'No-Oriented', text: 'bad timing?', angle: 'Negative constraint psychology' },
        { label: 'Protection', text: enforceMaxThreeWords(`${shortCompany} seat margins`), angle: 'Peer diagnostic' },
        { label: 'Direct', text: 'completely off base?', angle: 'Low defense posture' }
      ],
      selectedSubjectIndex: 0,
      body: cleanText,
      structuralBreakdown: {
        triggerOrHook: `${name}, probably caught you at a bad time as you manage outbound operations at ${company}.`,
        tensionOrObservation: 'Curious if you have completely given up on stopping reps from getting shopped on price.',
        truthOrValue: 'Top BPOs use live AI sparring to ramp setters in 72 hours instead of 4 weeks.',
        ctaSentence: 'Would it be a terrible idea to take a 2-minute look Thursday?'
      },
      ctaVariations: [
        { label: 'Classic Voss', text: 'Would it be a terrible idea to take a 2-minute look Thursday, or is this completely off base?', style: 'No-Oriented' },
        { label: 'Opposed Question', text: 'Are you completely opposed to a 90-second screen share showing how this works?', style: 'No-Oriented' },
        { label: 'Giving Up', text: 'Have you given up on insulating caller margins on competitive bids?', style: 'No-Oriented' }
      ],
      selectedCtaIndex: 0,
      wordCount: cleanText.split(/\s+/).filter(Boolean).length,
      readingGradeLevel: '5th Grade',
      frameworkUsed: 'Chris Voss No-Oriented Email',
      prospectTargetName: name,
      prospectTargetCompany: company,
      userRawIdea: idea,
      sanitizationAudit: {
        emDashesRemoved: emDashesCount,
        emojisRemoved: emojisCount,
        isClean: true
      }
    };
  }

  // Default: Josh Braun 4T (Poke The Bear)
  const rawBody = `Hi ${name},

Saw ${company} is scaling outbound seats. Typically when BPO leaders scale outbound, the hidden leak is not lead volume, it is callers getting chopped on price by commodity competitors.

Traditional coaching fails when reps freeze in the first 20 seconds. We feed consultative rebuttals in 150 milliseconds live on the dial.

Open to a 2-minute video showing how we insulate margins, or totally off base?`;

  const { cleanText, emDashesCount, emojisCount } = sanitizeColdEmail(rawBody);

  return {
    id: 'draft-braun-default',
    subjectLines: [
      { label: 'Friction Hook', text: enforceMaxThreeWords(`${shortCompany} lead burn`), angle: 'Uncovers hidden leak' },
      { label: 'Low Friction', text: 'quick question', angle: 'Under 3 words lowercase' },
      { label: 'Seat Economics', text: 'caller conversion leak', angle: 'Operational focus' }
    ],
    selectedSubjectIndex: 0,
    body: cleanText,
    structuralBreakdown: {
      triggerOrHook: `Saw ${company} is scaling outbound seats.`,
      tensionOrObservation: 'Typically when BPO leaders scale outbound, the hidden leak is callers getting chopped on price.',
      truthOrValue: 'Traditional coaching fails when reps freeze in the first 20 seconds. We feed consultative rebuttals in 150ms live.',
      ctaSentence: 'Open to a 2-minute video showing how we insulate margins, or totally off base?'
    },
    ctaVariations: [
      { label: 'Permission Video', text: 'Open to a 2-minute video showing how we insulate margins, or totally off base?', style: 'Permission-Video' },
      { label: 'No-Oriented', text: 'Would it be a terrible idea to compare notes for 2 minutes Thursday?', style: 'No-Oriented' },
      { label: 'Interest-Based', text: 'Worth a quick look, or is outbound conversion already solved at your floor?', style: 'Interest-Based' }
    ],
    selectedCtaIndex: 0,
    wordCount: cleanText.split(/\s+/).filter(Boolean).length,
    readingGradeLevel: '5th Grade',
    frameworkUsed: 'Josh Braun 4T (Poke The Bear)',
    prospectTargetName: name,
    prospectTargetCompany: company,
    userRawIdea: idea,
    sanitizationAudit: {
      emDashesRemoved: emDashesCount,
      emojisRemoved: emojisCount,
      isClean: true
    }
  };
}
