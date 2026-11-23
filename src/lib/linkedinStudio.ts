import { CadenceLeadRecord, DEMO_CADENCE_LEADS } from './cadenceMaster';
import { isDemoWorkspace } from './demoMode';
import {
  LINKEDIN_AUDIENCE,
  getSpecPostsForWeek,
  joinCommentHashtags,
  splitPostText,
  type LinkedInPillarName,
  type LinkedInWeekday,
} from './linkedinContentSystem';

export interface VisualCardConfig {
  type: 'metric_callout' | 'comparison_grid' | 'quote_teardown' | 'process_flow';
  headline: string;
  subheadline?: string;
  metric?: string;
  metricLabel?: string;
  tag: string;
  accentColor?: string;
}

export interface LinkedInPost {
  id: string;
  episodeNumber: number;
  dayLabel: string; // e.g. "Tuesday • Episode 1"
  title: string;
  hook: string; // Scroll-stopping first 2 lines
  body: string; // Worth-reading body, under 90 words
  cta: string; // High-engagement non-salesy question
  wordCount: number;
  estimatedReadSeconds: number;
  hashtags: string[];
  imagePrompt: string; // Rich prompt for Gemini Imagen / Midjourney / Canva
  realisticPhotoPrompt?: string; // Gemini's ultra-realistic and relatable photography prompt
  realisticImageUrl?: string; // High-res photographic image URL
  alternativeImageUrl?: string; // Optional alternative image (e.g. broker devil vs client partnership)
  alternativeImageLabel?: string;
  alternativeImagePrompt?: string;
  visualCard: VisualCardConfig;
  injectedComments: string[]; // 2-3 comments for rep to post, strictly NO em dashes, NO emojis
  /** Appointmentlyy workspace only (LinkedIn Content System): the weekday pillar of the post. */
  pillar?: string;
  /** Appointmentlyy workspace only: which real detail to swap in before posting. */
  swapNote?: string;
  /** Appointmentlyy workspace only: content rules this post still breaks (from validatePost). */
  issues?: string[];
}

/**
 * Visual Generation Rules:
 * 1. Filipino Demographics Mandate: All individual SDRs, appointment setters, coaching leads, floor operators
 *    must reflect authentic Filipino Southeast Asian features in modern Manila BGC or Cebu offices.
 * 2. Foreigner Representation: Foreign (North American/European/Australian) characters are strictly reserved
 *    for depicting the collaborative peer relationship between a foreign client and Filipino offshore talent.
 * 3. Brokers & Middlemen (Devil in Disguise): Lead brokers or staffing middlemen must look arrogant, manipulative,
 *    cynical, slick suit, dark predatory chiaroscuro lighting, counting margin skims behind desks.
 */
export const IMAGE_DEMOGRAPHIC_RULES = {
  filipinoTalentMandate: 'All individual SDRs, callers, setters, team leads, QA coaches, and operations managers must be authentic Filipino professionals with Southeast Asian features in contemporary Manila BGC, Makati, or Cebu tech workspaces.',
  foreignClientCollabRule: 'Foreign / Caucasian characters are strictly reserved for depicting the collaborative peer partnership between a foreign enterprise client and Filipino offshore talent.',
  brokerDevilArchetype: 'When depicting lead brokers, commodity outsourcers, or middlemen siphoning margins, portray them as an arrogant, manipulative "devil in disguise" in a slick bespoke suit, calculating smirk, shadowy high-rise boardroom, with paperwork taking up to 60% cuts on cheap pay-per-performance tasks while completely disregarding BPO OPEX and operational control.'
};

export interface LinkedInSeries {
  seriesTitle: string;
  seriesHookRecap: string; // Continuity hook connecting to last week's series
  targetBottleneckSummary: string; // What client pain point this 3-post arc solves
  targetAudience: string;
  posts: LinkedInPost[];
}

export interface ViralCommentDraft {
  id: string;
  angle: 'Counter-Perspective' | 'Consultative Question' | 'Frontline BPO Operator' | 'Punchy 20-Word';
  comment: string; // Strictly NO em dashes, NO emojis, short
  wordCount: number;
  intent: string;
}

export interface ViralPostAnalysis {
  originalSnippet: string;
  coreThesis: string;
  commentDrafts: ViralCommentDraft[];
}

export interface CsvIntelligenceSummary {
  totalLeads: number;
  dominantHeadcount: string;
  topPainPoints: string[];
  topTechStacks: string[];
  topCompetitors: string[];
  targetDepartments: string[];
  summaryNarrative: string;
}

export interface LinkedInFramework {
  id: string;
  name: string;
  tag: string;
  description: string;
  hookPhilosophy: string;
  bodyPhilosophy: string;
  ctaPhilosophy: string;
  sampleHook: string;
}

export const LINKEDIN_FRAMEWORKS: LinkedInFramework[] = [
  {
    id: 'contrarian-truth',
    name: 'Contrarian Truth & Myth Buster',
    tag: 'HIGH VIRALITY',
    description: 'Directly challenges comfortable conventional wisdom in outbound and BPO operations that actually destroys margins.',
    hookPhilosophy: 'State the common belief in sentence 1, then invalidate it with a hard truth in sentence 2.',
    bodyPhilosophy: 'Concise 3-line contrast under 80 words. Contrast the old way vs the new reality.',
    ctaPhilosophy: 'Curiosity-driven question asking if the reader agrees or sees it differently.',
    sampleHook: 'Most BPOs think adding 20 more SDRs solves revenue slumps. It usually just burns your list 3x faster.'
  },
  {
    id: 'under-90-data-teardown',
    name: 'The Under-90-Word Data Teardown',
    tag: 'PROOF DRIVEN',
    description: 'Presents a hard, unvarnished operational metric (margin skims, call hold rates, ramp times) and explains the 1 tweak that shifted it.',
    hookPhilosophy: 'Lead with an exact, non-rounded metric that immediately establishes operational credibility.',
    bodyPhilosophy: 'Strictly under 75 words. Zero corporate jargon. Clear visual spacing with 1-line punchlines.',
    ctaPhilosophy: 'Ask what their floor or team benchmarks are for this exact metric.',
    sampleHook: 'We audited 500k contact center dials last quarter. 98% of lost deals happened in the first 40 seconds.'
  },
  {
    id: 'unspoken-blindspot',
    name: 'The Unspoken Operational Blindspot',
    tag: 'EXECUTIVE MAGNET',
    description: 'Exposes the hidden leak that BPO CROs and VP Ops are aware of privately but rarely discuss publicly.',
    hookPhilosophy: 'Label the hidden cost or uncomfortable friction that executives secretly lose sleep over.',
    bodyPhilosophy: 'Explain why smart leaders tolerate this leak and the exact operational pivot that ends it.',
    ctaPhilosophy: 'Ask how their leadership team is tackling this dilemma this quarter.',
    sampleHook: 'The biggest lie in outbound sales is that junior reps need 3 weeks of classroom roleplay before touching live dials.'
  },
  {
    id: 'frontline-floor-lesson',
    name: 'Frontline Floor Operator Lesson',
    tag: 'AUTHENTIC & RAW',
    description: 'A genuine observation from managing live dials, listening to prospect objections, and fixing sales friction.',
    hookPhilosophy: 'Drop the reader right into the middle of a real scenario from yesterday’s floor production.',
    bodyPhilosophy: 'Under 85 words. No ego, pure diagnostic value on how a specific objection was disassembled.',
    ctaPhilosophy: 'Ask fellow setters and operators how they handle this on their current campaigns.',
    sampleHook: 'Yesterday an enterprise VP said: "We already work with a BPO and hate their shared lists." Here is how we responded without pitching.'
  },
  {
    id: 'two-way-debate',
    name: 'Consultative Two-Way Debate',
    tag: 'MAX ENGAGEMENT',
    description: 'Frames a genuine strategic dilemma facing BPO leaders and invites thoughtful peer-to-peer discourse.',
    hookPhilosophy: 'Present an either/or dilemma where neither conventional answer works.',
    bodyPhilosophy: 'Frame the pros and cons in 60 words, then present the consultative middle path.',
    ctaPhilosophy: 'Invite the community to vote on option A, option B, or share their own playbook.',
    sampleHook: 'Should BPO setters be compensated on dials completed, or exclusively on qualified enterprise sits held?'
  }
];

export interface ContinuityPreset {
  id: string;
  weekNumber: number;
  title: string;
  episodesRange: string;
  recapHook: string;
  theme: string;
  nextPresetId?: string;
  nextWeekTitle?: string;
}

export const CONTINUITY_SERIES_PRESETS: ContinuityPreset[] = [
  {
    id: 'broker-margin-continuity',
    weekNumber: 1,
    title: 'Starts with: The pipeline that was one guy',
    episodesRange: 'Episodes 1 - 5',
    recapHook: 'Last week we exposed why letting brokers take up to a 60% cut on cheap pay-per-performance tasks while the BPO shoulders 100% of the OPEX burden keeps floors trapped in cheap profits. This week, we dismantle the middleman control trap.',
    theme: 'Taking Internal Acquisition Back: Eliminating 60% Broker Margin Skims and Taking Back Operational Sovereignty',
    nextPresetId: 'ramp-time-continuity',
    nextWeekTitle: 'Week 2: 72-Hour Rep Ramp & Voice Sparring Arc (Episodes 4-6)'
  },
  {
    id: 'ramp-time-continuity',
    weekNumber: 2,
    title: 'Starts with: Same list, same pitch, price war',
    episodesRange: 'Episodes 6 - 10',
    recapHook: 'Following up on last week\'s discussion about taking internal acquisition back from brokers: why do floors still let new reps burn 500 client accounts during 3 weeks of classroom onboarding?',
    theme: 'Eliminating the 3-Week Classroom Onboarding Tax',
    nextPresetId: 'objection-stumble-continuity',
    nextWeekTitle: 'Week 3: Sub-180ms Objection Handling Arc (Episodes 7-9)'
  },
  {
    id: 'objection-stumble-continuity',
    weekNumber: 3,
    title: 'Starts with: Too busy to prospect',
    episodesRange: 'Episodes 11 - 15',
    recapHook: 'Building on last Friday\'s 72-hour onboarding benchmark: why do telemarketers reading rigid scripts freeze within 15 seconds against North American buyers?',
    theme: 'Transforming Telemarketers into Trusted BPO Consultants',
    nextPresetId: 'pricing-retainer-continuity',
    nextWeekTitle: 'Week 4: Enterprise Retainers & $24/hr Seats Arc (Episodes 10-12)'
  },
  {
    id: 'pricing-retainer-continuity',
    weekNumber: 4,
    title: 'Starts with: Sixty percent of revenue in one email',
    episodesRange: 'Episodes 16 - 20',
    recapHook: 'Last week we mastered live objection recovery and consultative questioning. This week: the CRO\'s ultimate lever of breaking away from cheap broker pay-per-performance into direct $24/hr retainers.',
    theme: 'Direct Enterprise Pricing & 500-Seat Floor Flywheel',
    nextPresetId: 'broker-margin-continuity',
    nextWeekTitle: 'Week 1: Cycle back to Internal Acquisition Engine'
  }
];

export interface LinkedInIdeaPreset {
  id: string;
  label: string;
  idea: string;
  frameworkId?: string;
}

export const LINKEDIN_IDEA_PRESETS: LinkedInIdeaPreset[] = [
  {
    id: '60pct-broker-cut-opex',
    label: '60% Broker Cut vs 100% BPO OPEX',
    idea: 'Brokers take up to a 60% cut on cheap pay-per-performance campaigns while the BPO carries 100% of the OPEX burden. They take over operations without risking any capital. It is time to take internal acquisition back to all BPOs.',
    frameworkId: 'contrarian-truth'
  },
  {
    id: 'pay-per-performance-trap',
    label: 'Pay-Per-Performance & Control Loss',
    idea: 'Middlemen hand BPOs cheap pay-per-performance appointment setting and leadgen campaigns, then micromanage and take over floor operations. They dictate your team while taking zero liability for overhead. Why BPOs must own their direct client acquisition.',
    frameworkId: 'unspoken-blindspot'
  },
  {
    id: '17yr-bdm-perspective',
    label: '17-Year BDM Truth: End Middleman Mercy',
    idea: '17 years ago when I worked as a BDM, BPOs were trapped under the mercy of brokers. Today, startup and mid-size BPOs are still surrendering their margins and operational sovereignty. Direct internal acquisition is the only real escape.',
    frameworkId: 'frontline-floor-lesson'
  },
  {
    id: 'sovereign-valuation-debate',
    label: 'Broker Dependency vs Direct Equity',
    idea: 'Would you rather keep 40 seats filled through broker pay-per-performance contracts at razor-thin margins with zero control, or build an autonomous 2-rep internal acquisition pod and command direct $24/hr enterprise retainers?',
    frameworkId: 'two-way-debate'
  },
  {
    id: '72hr-ramp-classroom',
    label: '72-Hour Ramp vs 3-Week Classrooms',
    idea: 'Why traditional 3-week classroom SDR onboarding burns client accounts, and how live AI voice sparring transitions new hires to live dials in 72 hours.',
    frameworkId: 'under-90-data-teardown'
  },
  {
    id: 'sub-180ms-objection',
    label: 'Sub-180ms Live Objection Handling',
    idea: 'Reps lose deals in the first 20 seconds when buyers bring up competitor pricing. Real-time consultative teleprompting in 150ms prevents hesitation and closes direct enterprise contracts.',
    frameworkId: 'under-90-data-teardown'
  }
];

/**
 * Strips all emojis and replaces em dashes to satisfy strict anti-bot prompt rules
 */
export function sanitizeTextForLinkedIn(text: string): string {
  if (!text) return '';
  // 1. Remove all em dashes and en dashes
  let clean = text
    .replace(/—/g, ', ')
    .replace(/–/g, ', ')
    .replace(/\s*--\s*/g, ', ');

  // 2. Remove all emojis
  clean = clean.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    ''
  );

  // 3. Clean up double spaces or awkward punctuation
  clean = clean
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .trim();

  return clean;
}

/**
 * Summarizes the active CSV leads dataset to extract aggregate intelligence
 */
export function summarizeCsvLeads(leads?: CadenceLeadRecord[]): CsvIntelligenceSummary {
  // Sample leads stand in only in the demo workspace; client workspaces summarise their own (or none).
  const dataset = leads && leads.length > 0 ? leads : isDemoWorkspace() ? DEMO_CADENCE_LEADS : [];
  const totalLeads = dataset.length;

  // Extract pain points
  const painPointCounts: Record<string, number> = {};
  const techCounts: Record<string, number> = {};
  const competitorCounts: Record<string, number> = {};
  const headcountCounts: Record<string, number> = {};
  const deptCounts: Record<string, number> = {};

  dataset.forEach(l => {
    // Pain point
    const pain = (l.painPoint || 'shared lead list fatigue and margin skims').toLowerCase();
    painPointCounts[pain] = (painPointCounts[pain] || 0) + 1;

    // Tech
    const tech = l.techStack || 'Apollo.io and HubSpot CRM';
    techCounts[tech] = (techCounts[tech] || 0) + 1;

    // Competitor
    const comp = l.outsourcer || 'Titan BPO Solutions';
    competitorCounts[comp] = (competitorCounts[comp] || 0) + 1;

    // Headcount
    const hc = l.headcount || '50-100 seats';
    headcountCounts[hc] = (headcountCounts[hc] || 0) + 1;

    // Department
    const dept = l.department || 'Outbound Operations';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const topPainPoints = Object.entries(painPointCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const topTechStacks = Object.entries(techCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const topCompetitors = Object.entries(competitorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const topHeadcounts = Object.entries(headcountCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const dominantHeadcount = topHeadcounts[0] || '50-250 Seats';

  const narrative = totalLeads === 0
    ? 'No leads uploaded yet. Upload a CSV of target accounts to see their common pain points, tools and competitors here.'
    : `Across ${totalLeads} active target accounts, the primary bottleneck is ${topPainPoints[0] || 'objection drop-offs and broker margin pressure'}. Most accounts operate on ${dominantHeadcount} floors utilizing ${topTechStacks[0] || 'Apollo and HubSpot'}, with incumbent friction centered around ${topCompetitors[0] || 'commodity outsourcers'}.`;

  return {
    totalLeads,
    dominantHeadcount,
    topPainPoints: topPainPoints.length > 0 ? topPainPoints : ['Shared lead list fatigue', 'Junior rep objection stumbling', '35% broker margin skims'],
    topTechStacks: topTechStacks.length > 0 ? topTechStacks : ['Apollo.io & HubSpot', 'Salesforce & Outreach'],
    topCompetitors: topCompetitors.length > 0 ? topCompetitors : ['commodity outsourcers', 'in-house teams'],
    targetDepartments: Object.keys(deptCounts).slice(0, 3),
    summaryNarrative: narrative
  };
}

/** Stock photo and prompt for a pillar (the photo studio's own files; no figures in the prompts). */
const PILLAR_PHOTOS = {
  broker: {
    url: '/images/linkedin/broker-middleman-devil.jpg',
    label: 'The middleman trap',
    prompt: 'A cinematic 35mm editorial photograph of a corporate campaign broker and middleman: an arrogant man in his late 40s in an expensive dark charcoal suit, leaning back in a leather armchair in a shadowy boardroom, steepled hands, a calculating smirk over a stack of contracts. Dramatic chiaroscuro lighting.',
  },
  floor: {
    url: '/images/linkedin/script-discard-sparring.jpg',
    label: 'Live call with AI copilot',
    prompt: 'Authentic candid 35mm photojournalism in a modern Manila BGC outbound center: an articulate young Filipino male SDR wearing an ergonomic headset, engaged in a live consultative call with on-screen prompts. A crumpled paper script sits discarded on the desk. Warm natural daylight.',
  },
  coach: {
    url: '/images/linkedin/episode-2-realistic.jpg',
    label: 'Coach mentorship',
    prompt: 'A candid, authentic 35mm photograph in a modern Manila BPO office: a Filipino male team leader and sales coach mentoring a young female Filipino SDR over a laptop screen. Warm daylight, natural unposed expressions.',
  },
  partner: {
    url: '/images/linkedin/direct-partnership-equity.jpg',
    label: 'Direct client partnership',
    prompt: 'A candid 35mm photograph of a direct client relationship: a senior North American client executive and an articulate Filipino female BPO operations director working as equal partners beside a glass whiteboard. Warm golden hour sunlight, respectful peer-to-peer partnership.',
  },
} as const;

const PILLAR_PHOTO_PLAN: Record<LinkedInPillarName, [keyof typeof PILLAR_PHOTOS, keyof typeof PILLAR_PHOTOS]> = {
  'Pipeline Fragility': ['partner', 'floor'],
  'BD Bottlenecks': ['floor', 'coach'],
  'AI + Human in the Loop': ['floor', 'partner'],
  'Broker Trap': ['broker', 'partner'],
  'Training & Development': ['coach', 'floor'],
};

/**
 * One post of the Appointmentlyy LinkedIn Content System in the tool's post shape: hook = Scene,
 * body = Snag to Punchline, cta = the closing question, no hashtags on the post, and the 3 comments
 * each ending with their 3 hashtags. Used for the built-in posts and for what the AI writes.
 */
export function contentSystemPost(input: {
  id: string;
  episodeNumber: number;
  day: LinkedInWeekday;
  pillar: LinkedInPillarName;
  title: string;
  hook: string;
  body: string;
  cta: string;
  comments: string[];
  swapNote?: string;
  issues?: string[];
}): LinkedInPost {
  const [main, alt] = PILLAR_PHOTO_PLAN[input.pillar] || PILLAR_PHOTO_PLAN['Pipeline Fragility'];
  const wordCount = `${input.hook} ${input.body} ${input.cta}`.trim().split(/\s+/).filter(Boolean).length;
  return {
    id: input.id,
    episodeNumber: input.episodeNumber,
    dayLabel: `${input.day} • Episode ${input.episodeNumber}`,
    title: input.title,
    hook: input.hook,
    body: input.body,
    cta: input.cta,
    wordCount,
    estimatedReadSeconds: Math.ceil((wordCount / 200) * 60),
    hashtags: [],
    imagePrompt: `Clean minimalist editorial graphic card on a dark graphite background with crisp typography. Headline: "${input.title}". Theme: ${input.pillar}. No clutter, no statistics.`,
    realisticPhotoPrompt: PILLAR_PHOTOS[main].prompt,
    realisticImageUrl: PILLAR_PHOTOS[main].url,
    alternativeImageUrl: PILLAR_PHOTOS[alt].url,
    alternativeImageLabel: PILLAR_PHOTOS[alt].label,
    alternativeImagePrompt: PILLAR_PHOTOS[alt].prompt,
    visualCard: {
      type: 'quote_teardown',
      headline: input.title,
      subheadline: input.pillar,
      metric: input.day,
      metricLabel: input.pillar,
      tag: `${input.day.toUpperCase()} • ${input.pillar.toUpperCase()}`,
    },
    injectedComments: input.comments,
    pillar: input.pillar,
    swapNote: input.swapNote || '',
    ...(input.issues && input.issues.length > 0 ? { issues: input.issues } : {}),
  };
}

/**
 * The built-in series (shown before generating, and whenever the AI is unavailable): the
 * Appointmentlyy LinkedIn Content System's 20 posts, 5 per week, Monday to Friday. The week comes
 * from the continuity preset (week 1 to 4). Each post carries its swap note.
 */
export function getDeterministicLinkedInSeries(
  summary: CsvIntelligenceSummary,
  frameworkId: string = 'contrarian-truth',
  presetId: string = 'broker-margin-continuity'
): LinkedInSeries {
  const preset = CONTINUITY_SERIES_PRESETS.find(p => p.id === presetId) || CONTINUITY_SERIES_PRESETS[0];
  const week = preset.weekNumber;
  return {
    seriesTitle: `Appointmentlyy LinkedIn Content System: Week ${week} (Monday to Friday)`,
    seriesHookRecap: '',
    targetBottleneckSummary: 'One short true story per pillar: Pipeline Fragility, BD Bottlenecks, AI + Human in the Loop, Broker Trap, Training & Development.',
    targetAudience: LINKEDIN_AUDIENCE,
    posts: getSpecPostsForWeek(week).map((p, idx) => {
      const parts = splitPostText(p.post);
      return contentSystemPost({
        id: `post-${p.id}`,
        episodeNumber: (week - 1) * 5 + idx + 1,
        day: p.day,
        pillar: p.pillar,
        title: p.title,
        hook: parts.hook,
        body: parts.body,
        cta: parts.cta,
        comments: p.comments.map(joinCommentHashtags),
        swapNote: p.swap_notes,
      });
    }),
  };
}

/**
 * Deterministic fallback for viral post engagement comments
 * Strictly NO em dashes, NO emojis, shorter comments
 */
export function getDeterministicViralComments(viralPostText: string): ViralCommentDraft[] {
  const snippet = viralPostText.slice(0, 100);

  return [
    {
      id: 'viral-cmt-1',
      angle: 'Counter-Perspective',
      comment: 'Interesting take, but in BPO operations the real margin killer is middleman broker dependency. Brokers take a 60% cut on cheap pay-per-performance while the BPO carries 100% of the OPEX burden. Direct acquisition always beats broker scraps.',
      wordCount: 36,
      intent: 'Challenges conventional wisdom respectfully with operational reality.'
    },
    {
      id: 'viral-cmt-2',
      angle: 'Consultative Question',
      comment: 'Curious how this aligns with your seat economics. When we audit contact centers, outsourced campaigns with middlemen yield less than 15% net after seat OPEX. What is your floor benchmark for direct vs brokered revenue?',
      wordCount: 34,
      intent: 'Prompts the creator and other executives to reply by asking a sharp operational question.'
    },
    {
      id: 'viral-cmt-3',
      angle: 'Frontline BPO Operator',
      comment: 'Spot on. On our outbound floors, once we built an internal acquisition pod and bypassed brokers, agent retention jumped and seat rates climbed to $24/hr. Owning acquisition changes everything.',
      wordCount: 30,
      intent: 'Shares verified frontline experience without promoting or selling.'
    },
    {
      id: 'viral-cmt-4',
      angle: 'Punchy 20-Word',
      comment: 'Brokers do not pay for your floor OPEX. When BPOs own their internal acquisition, they own their destiny.',
      wordCount: 18,
      intent: 'Under 20 words. Clean, punchy agreement that gets pinned by the author.'
    }
  ];
}

export interface ThreadFollowUpDraft {
  id: string;
  stage: 'Deepen Dialogue' | 'Nuanced Counter' | 'Relationship Bridge to DM';
  reply: string; // Strictly NO em dashes, NO emojis, short
  wordCount: number;
  strategicGoal: string;
}

/**
 * Deterministic fallback for continuing a LinkedIn comment thread with an author or prospect
 * Strictly NO em dashes, NO emojis, shorter comments
 */
export function getDeterministicThreadFollowUps(authorReplyText: string): ThreadFollowUpDraft[] {
  return [
    {
      id: 'thread-reply-1',
      stage: 'Deepen Dialogue',
      reply: 'Fair point on that distinction. We noticed that when BPOs stop relying on broker campaigns and run direct internal acquisition, client retention triples. Have you tested direct client outreach recently?',
      wordCount: 31,
      strategicGoal: 'Validates their reply while introducing a specific operational test.'
    },
    {
      id: 'thread-reply-2',
      stage: 'Nuanced Counter',
      reply: 'Completely agree on quality. The dilemma most founders face is carrying 100% OPEX while brokers take 60% of the cut. How does your floor protect seat margins on performance deals?',
      wordCount: 29,
      strategicGoal: 'Keeps the public dialogue thought-provoking and positions you as an operational peer.'
    },
    {
      id: 'thread-reply-3',
      stage: 'Relationship Bridge to DM',
      reply: 'Appreciate the thoughtful exchange on this. Sent you a connection request so we can stay in touch as the BPO outbound landscape evolves.',
      wordCount: 23,
      strategicGoal: 'Natural, zero-pressure invitation to connect and transition into direct messaging.'
    }
  ];
}

