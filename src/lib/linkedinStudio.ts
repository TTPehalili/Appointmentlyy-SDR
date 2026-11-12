import { CadenceLeadRecord, DEMO_CADENCE_LEADS } from './cadenceMaster';
import { isDemoWorkspace } from './demoMode';

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
    title: 'The 60% Broker Skim & OPEX Exploitation Arc',
    episodesRange: 'Episodes 1 - 3',
    recapHook: 'Last week we exposed why letting brokers take up to a 60% cut on cheap pay-per-performance tasks while the BPO shoulders 100% of the OPEX burden keeps floors trapped in cheap profits. This week, we dismantle the middleman control trap.',
    theme: 'Taking Internal Acquisition Back: Eliminating 60% Broker Margin Skims and Taking Back Operational Sovereignty',
    nextPresetId: 'ramp-time-continuity',
    nextWeekTitle: 'Week 2: 72-Hour Rep Ramp & Voice Sparring Arc (Episodes 4-6)'
  },
  {
    id: 'ramp-time-continuity',
    weekNumber: 2,
    title: '72-Hour Rep Ramp & Voice Sparring Arc',
    episodesRange: 'Episodes 4 - 6',
    recapHook: 'Following up on last week\'s discussion about taking internal acquisition back from brokers: why do floors still let new reps burn 500 client accounts during 3 weeks of classroom onboarding?',
    theme: 'Eliminating the 3-Week Classroom Onboarding Tax',
    nextPresetId: 'objection-stumble-continuity',
    nextWeekTitle: 'Week 3: Sub-180ms Objection Handling Arc (Episodes 7-9)'
  },
  {
    id: 'objection-stumble-continuity',
    weekNumber: 3,
    title: 'Sub-180ms Objection Handling Arc',
    episodesRange: 'Episodes 7 - 9',
    recapHook: 'Building on last Friday\'s 72-hour onboarding benchmark: why do telemarketers reading rigid scripts freeze within 15 seconds against North American buyers?',
    theme: 'Transforming Telemarketers into Trusted BPO Consultants',
    nextPresetId: 'pricing-retainer-continuity',
    nextWeekTitle: 'Week 4: Enterprise Retainers & $24/hr Seats Arc (Episodes 10-12)'
  },
  {
    id: 'pricing-retainer-continuity',
    weekNumber: 4,
    title: 'Enterprise Retainers & $24/hr Seats Arc',
    episodesRange: 'Episodes 10 - 12',
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

/**
 * Deterministic fallback generator for 3-part LinkedIn Series
 */
export function getDeterministicLinkedInSeries(
  summary: CsvIntelligenceSummary,
  frameworkId: string = 'contrarian-truth',
  presetId: string = 'broker-margin-continuity'
): LinkedInSeries {
  const preset = CONTINUITY_SERIES_PRESETS.find(p => p.id === presetId) || CONTINUITY_SERIES_PRESETS[0];
  const primaryPain = summary.topPainPoints[0] || 'shared lead list fatigue and margin skims';

  // WEEK 2: 72-Hour Rep Ramp & Voice Sparring Arc (Episodes 4 - 6)
  if (preset.id === 'ramp-time-continuity') {
    return {
      seriesTitle: `The Autonomous BPO Outbound Series: Week 2 (Episodes 4-6)`,
      seriesHookRecap: preset.recapHook,
      targetBottleneckSummary: `Grounded in ${summary.totalLeads} accounts: Eliminating the 3-week classroom onboarding tax on ${summary.dominantHeadcount} floors.`,
      targetAudience: `BPO Operations Leaders, Training Directors & Head of Floor Production`,
      posts: [
        {
          id: 'post-ep4',
          episodeNumber: 4,
          dayLabel: 'Tuesday • Episode 4',
          title: 'The Classroom Trap: Why 3 Weeks of PDF Scripts Kills Sales Hunger',
          hook: `The single biggest hidden expense in outbound is not dialer software.\nIt is paying junior reps for 3 weeks to read static PDF scripts without touching live dials.`,
          body: `By the time new hires finish classroom theory, their natural enthusiasm is replaced by script anxiety.\n\nOn modern floors, reps run sub-180ms voice AI sparring on Day 1. By Day 3, they handle hostile buyer objections with complete composure.\n\nYou do not build muscle reading exercise books. You build it on the floor.`,
          cta: `Curious: what is your current floor benchmark for an SDR to book their first verified client sit?`,
          wordCount: 72,
          estimatedReadSeconds: 19,
          hashtags: ['#SalesEnablement', '#SDRTraining', '#BPOLeadership', '#ContactCenter', '#OutboundSales'],
          imagePrompt: `Minimalist split comparison diagram on dark zinc backdrop: Left side labeled "3 Weeks Classroom Theory (500 Leads Burned)", Right side labeled "72-Hour Voice AI Sparring (Production Ready Day 3)". Clean Swiss typography.`,
          realisticPhotoPrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling. Dual screens display "LIVE OBJECTION TELEPROMPTER CUES - 150ms LATENCY" and real-time prospect telemetry. On the desk next to him, a crumpled static PDF script sits discarded in a recycling bin, symbolizing the transition from rigid scripts to agile voice sparring. Modern glass architecture, warm natural daylight, Kodak Portra 400 aesthetic, authentic Filipino BPO setting.`,
          realisticImageUrl: '/images/linkedin/script-discard-sparring.jpg',
          alternativeImageUrl: '/images/linkedin/episode-2-realistic.jpg',
          alternativeImageLabel: '🇵🇭 Coach Mentorship',
          alternativeImagePrompt: `A candid, authentic 35mm photograph in a modern Manila BPO office: A smart Filipino male team leader and sales coach with authentic Southeast Asian features mentoring a young female Filipino SDR over a laptop screen, reviewing an objection playbook. Warm daylight, modern contemporary startup office, natural unposed expressions.`,
          visualCard: {
            type: 'process_flow',
            headline: 'Classroom Theory vs 72-Hour Voice Sparring',
            subheadline: 'Eliminating the 3-week rookie tax before live dials',
            metric: '72 hrs',
            metricLabel: 'Ramp time to live production',
            tag: 'EPISODE 04 • THE ONBOARDING TRAP'
          },
          injectedComments: [
            'Paying junior reps for 3 weeks of classroom roleplay is pure executive cowardice. You are not training them. You are subsidizing caller anxiety while burning payroll. Agree or disagree?',
            'If an SDR cannot survive hostile objection drills after 72 hours of voice sparring, a 60-page PDF script will not save them. Why do BPO managers still cling to obsolete classroom theory?',
            'Controversial take: 80% of sales trainers in BPO are teaching 2012 script techniques that buyers hang up on in 4 seconds. How old is the cold calling guide your floor uses today?'
          ]
        },
        {
          id: 'post-ep5',
          episodeNumber: 5,
          dayLabel: 'Thursday • Episode 5',
          title: '40 Hostile Objection Drills Before Lunch',
          hook: `Confidence isn't an innate personality trait in sales.\nIt is the repetition of surviving hostile brush-offs until fear disappears.`,
          body: `Before our reps touch a single live enterprise account, they complete 40 AI sparring drills simulating cynical CFOs, gatekeepers, and price objections.\n\nWhen live prospects say "we already have an outsourcer," our reps do not stumble. They consultatively disarm the objection in under 150 milliseconds.\n\nRepetition creates composure.`,
          cta: `Does your team conduct daily objection sparring, or do reps practice on your active paying clients?`,
          wordCount: 68,
          estimatedReadSeconds: 18,
          hashtags: ['#SalesCoaching', '#InsideSales', '#SDRLife', '#BPOOperations', '#SalesManagement'],
          imagePrompt: `Editorial data card on dark charcoal background showing a live repetition counter: 40 AI drills completed, 150ms response latency, 94% objection composure score. Minimalist high-tech aesthetic.`,
          realisticPhotoPrompt: `A candid, authentic 35mm photograph in a modern Manila BPO office: A smart Filipino male team leader and sales coach with authentic Southeast Asian features mentoring a young female Filipino SDR over a laptop screen, reviewing an objection playbook. Warm daylight, modern contemporary startup office, natural unposed expressions.`,
          realisticImageUrl: '/images/linkedin/episode-2-realistic.jpg',
          alternativeImageUrl: '/images/linkedin/script-discard-sparring.jpg',
          alternativeImageLabel: '⚡ Scriptless Teleprompter',
          alternativeImagePrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling with real-time teleprompter cues.`,
          visualCard: {
            type: 'metric_callout',
            headline: 'Hostile Repetition Sparring Protocol',
            subheadline: 'Simulating 40 hostile calls before touching live client leads',
            metric: '40x',
            metricLabel: 'Simulated objection reps on Day 1',
            tag: 'EPISODE 05 • THE PROTOCOL'
          },
          injectedComments: [
            'Reps do not burn out from dialing volume. They burn out from humiliating objection freezes because management refused to spar them first. The blame belongs on leadership, not the rep.',
            'Allowing rookie SDRs to practice on live client leads should be considered operational malpractice. Why are BPO clients paying retainers for your floor to make rookie mistakes?',
            'How many live sales opportunities did your team burn this week because a caller stammered on "send me an email"? Let us hear the honest numbers from floor managers.'
          ]
        },
        {
          id: 'post-ep6',
          episodeNumber: 6,
          dayLabel: 'Friday • Episode 6',
          title: 'The 72-Hour Production Metric & Series Bridge',
          hook: `Next Tuesday we dive into sub-180ms live call teleprompting.\nBefore we do, here is the metric that separates elite BPOs from commodity call centers:`,
          body: `If your new hire onboarding takes longer than 72 hours to reach production readiness, you are subsidizing rep hesitation.\n\nLive AI teleprompters remove the memorization hurdle. Reps focus 100% of their mental bandwidth on listening, tone, and pacing.\n\nSpeed to production is your strongest competitive moat.`,
          cta: `What would happen to your seat gross margins if ramp time dropped from 21 days to 3 days?`,
          wordCount: 71,
          estimatedReadSeconds: 19,
          hashtags: ['#BPOStrategy', '#RevenueOperations', '#SalesLeadership', '#ContactCenter', '#OutboundStrategy'],
          imagePrompt: `High-resolution comparison chart comparing 21-day traditional ramp cost curve against 3-day AI-assisted ramp revenue curve on graphite backdrop.`,
          realisticPhotoPrompt: `A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive in a tailored navy blazer and a distinguished, articulate Filipino female BPO operations director collaborating as equal strategic partners by a glass whiteboard. Sunlight streaming into the room, respectful peer-to-peer partnership.`,
          realisticImageUrl: '/images/linkedin/direct-partnership-equity.jpg',
          alternativeImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
          alternativeImageLabel: 'The Middleman Trap (Devil in Disguise)',
          alternativeImagePrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, wearing a calculating, cynical smirk over contracts marked with 35% margin fees.`,
          visualCard: {
            type: 'comparison_grid',
            headline: '21-Day Classroom Ramp vs 72-Hour AI Sparring',
            subheadline: 'Measuring lead burn reduction and revenue velocity',
            metric: '85%',
            metricLabel: 'Reduction in onboarding lead burn',
            tag: 'EPISODE 06 • THE BENCHMARK'
          },
          injectedComments: [
            'A 21-day onboarding ramp is nothing more than a tax on management incompetence. Any floor taking over 72 hours to get an SDR production-ready is burning capital. Who disagrees?',
            'How much payroll is your agency secretly burning each month on reps who are terrified of picking up the phone? Why does leadership tolerate this silent margin killer?',
            'Real talk: Fast ramp time is the only moat left in outsourcing. If your competitors train reps in 3 days while you take a month, your floor is already obsolete. Thoughts?'
          ]
        }
      ]
    };
  }

  // WEEK 3: Sub-180ms Objection Handling Arc (Episodes 7 - 9)
  if (preset.id === 'objection-stumble-continuity') {
    return {
      seriesTitle: `The Autonomous BPO Outbound Series: Week 3 (Episodes 7-9)`,
      seriesHookRecap: preset.recapHook,
      targetBottleneckSummary: `Grounded in ${summary.totalLeads} accounts: Eliminating caller freeze and disarming gatekeepers across ${summary.dominantHeadcount} floors.`,
      targetAudience: `BPO Operations Leaders, Quality Assurance Managers & Sales Directors`,
      posts: [
        {
          id: 'post-ep7',
          episodeNumber: 7,
          dayLabel: 'Tuesday • Episode 7',
          title: 'The 150-Millisecond Freeze: Why Scripts Cause Hang-Ups',
          hook: `98% of lost sales calls fail in the first 40 seconds.\nAnd 90% of those failures happen because the rep froze for 2 seconds.`,
          body: `When a prospect says "we already have a vendor," junior reps hesitate. That silence screams "telemarketer reading a script."\n\nWhen consultative rebuttals pop onto the screen in 150 milliseconds, the hesitation vanishes. The caller responds like an operational peer.\n\nPacing dictates respect.`,
          cta: `How do your team leads monitor rep hesitation during the crucial first 30 seconds of a call?`,
          wordCount: 65,
          estimatedReadSeconds: 17,
          hashtags: ['#SalesDevelopment', '#ObjectionHandling', '#BPOOperations', '#ColdCalling', '#InsideSales'],
          imagePrompt: `Minimalist acoustic waveform visual comparing a 2-second awkward hesitation pause versus a crisp 150ms consultative response on sleek dark graphite card.`,
          realisticPhotoPrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling. Dual screens display "LIVE OBJECTION TELEPROMPTER CUES - 150ms LATENCY" and real-time prospect telemetry.`,
          realisticImageUrl: '/images/linkedin/script-discard-sparring.jpg',
          alternativeImageUrl: '/images/linkedin/episode-2-realistic.jpg',
          alternativeImageLabel: '🇵🇭 Coach Mentorship',
          alternativeImagePrompt: `A candid 35mm photograph in a Manila BPO office: A smart Filipino male team leader explaining the permission opener on a glass whiteboard to two junior callers who are nodding in agreement.`,
          visualCard: {
            type: 'metric_callout',
            headline: 'The 150ms Objection Recovery Threshold',
            subheadline: 'Eliminating dead air that triggers prospect hang-ups',
            metric: '150 ms',
            metricLabel: 'Target consultative rebuttal latency',
            tag: 'EPISODE 07 • LATENCY'
          },
          injectedComments: [
            'That two-second silence when a buyer objects is where deals go to die. It instantly screams scripted telemarketer to any intelligent executive. Agree or disagree?',
            'Static scripts belong in a museum. If your reps do not have real-time objection cues in under 180ms, you are setting them up for failure. Why does management still print binders?',
            'Be honest: How many times has your QA lead docked points from a rep for going off-script when the rep actually had a real human conversation? QA is killing your conversion.'
          ]
        },
        {
          id: 'post-ep8',
          episodeNumber: 8,
          dayLabel: 'Thursday • Episode 8',
          title: 'Dissecting the Permission Opener: Zero Pushiness',
          hook: `The worst way to open a cold call is asking "How are you doing today?"\nThe prospect knows you do not care, and their guard instantly shoots up.`,
          body: `We tested 12 distinct opener styles across 100k dials.\n\nThe highest-converting opener was direct and disarming: "Jordan, you were not expecting my call. Can I tell you why I reached out in 20 seconds, and you decide if we hang up?"\n\nRespecting prospect autonomy removes 90% of initial hostility.`,
          cta: `What is your floor's current go-to opening line for cold outbound dials?`,
          wordCount: 67,
          estimatedReadSeconds: 18,
          hashtags: ['#ColdCalling', '#SalesSkills', '#BPOLeadership', '#OutboundStrategy', '#SalesEnablement'],
          imagePrompt: `Clean editorial breakdown of the 20-Second Permission Opener framework with visual callout brackets on dark zinc backdrop.`,
          realisticPhotoPrompt: `A candid 35mm photograph in a Manila BPO office: A smart Filipino male team leader explaining the permission opener on a glass whiteboard to two junior callers who are nodding in agreement.`,
          realisticImageUrl: '/images/linkedin/episode-2-realistic.jpg',
          alternativeImageUrl: '/images/linkedin/script-discard-sparring.jpg',
          alternativeImageLabel: '⚡ Scriptless Teleprompter',
          alternativeImagePrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling.`,
          visualCard: {
            type: 'process_flow',
            headline: 'The 20-Second Permission Opener',
            subheadline: 'Eliminating defensiveness by granting prospect permission to hang up',
            metric: '90%',
            metricLabel: 'Reduction in instant hostile hang-ups',
            tag: 'EPISODE 08 • THE OPENER'
          },
          injectedComments: [
            'Opening a cold dial with "How are you today?" is an insult to the prospect intelligence. Everyone knows you do not care. Stop doing it.',
            'Giving a prospect full permission to hang up in the first 20 seconds separates sovereign consultants from desperate callers. Why are most floor managers terrified to mandate this?',
            'If your SDRs sound like telemarketers, it is because your opening script sounds like a hostage negotiation. Who has the courage to rewrite their openers this week?'
          ]
        },
        {
          id: 'post-ep9',
          episodeNumber: 9,
          dayLabel: 'Friday • Episode 9',
          title: 'Direct Contracts vs Broker Lists & Series Bridge',
          hook: `Next week we break down direct enterprise seat pricing retainers.\nHere is why you will never command $24/hr using third-party broker lists:`,
          body: `Brokers sell the identical lead list to five competing agencies. By dial three, the prospect is exhausted and hostile.\n\nWhen you build your own private enriched pipeline, your reps are the only voice reaching that decision-maker that month.\n\nExclusivity creates enterprise pricing power.`,
          cta: `Are your reps dialing exclusive enriched datasets right now, or shared vendor databases?`,
          wordCount: 69,
          estimatedReadSeconds: 18,
          hashtags: ['#BPOStrategy', '#DealEconomics', '#RevenueGrowth', '#OutsourcingLeadership', '#ClientAcquisition'],
          imagePrompt: `High-resolution executive card comparing Commodity Shared Directory versus Private Enriched Pipeline on dark charcoal background.`,
          realisticPhotoPrompt: `A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive in a tailored navy blazer and a distinguished, articulate Filipino female BPO operations director collaborating as equal strategic partners by a glass whiteboard.`,
          realisticImageUrl: '/images/linkedin/direct-partnership-equity.jpg',
          alternativeImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
          alternativeImageLabel: 'The Middleman Trap (Devil in Disguise)',
          alternativeImagePrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker depicted as a devil in disguise: Arrogant, manipulative man in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom with contracts marked 35% margin fees.`,
          visualCard: {
            type: 'comparison_grid',
            headline: 'Shared Directory Fatigue vs Exclusive Pipeline',
            subheadline: 'Why proprietary data enables premium billable rates',
            metric: '$24/hr',
            metricLabel: 'Enterprise billable rate on exclusive pipeline',
            tag: 'EPISODE 09 • THE BRIDGE'
          },
          injectedComments: [
            'Brokers resell the exact same exhausted Apollo list to five competing agencies. You are literally paying to have your reps abused on the phone by angry gatekeepers. Agree or disagree?',
            'Exclusivity is the only reason direct enterprise clients pay $24/hr. If you are dialing recycled broker data, you deserve commodity margins. Drop your thoughts below.',
            'Question for sales leaders: When was the last time a broker gave you a lead list that had not already been called by 10 other offshore agencies that same month?'
          ]
        }
      ]
    };
  }

  // WEEK 4: Enterprise Retainers & $24/hr Pricing Arc (Episodes 10 - 12)
  if (preset.id === 'pricing-retainer-continuity') {
    return {
      seriesTitle: `The Autonomous BPO Outbound Series: Week 4 (Episodes 10-12)`,
      seriesHookRecap: preset.recapHook,
      targetBottleneckSummary: `Grounded in ${summary.totalLeads} accounts: Breaking free from low-rate commodity bids into direct $24/hr enterprise retainers.`,
      targetAudience: `BPO Founders, Managing Directors, CROs & Outbound Operations Leaders`,
      posts: [
        {
          id: 'post-ep10',
          episodeNumber: 10,
          dayLabel: 'Tuesday • Episode 10',
          title: 'The Commodity Rate Trap: Escaping Margin Compression',
          hook: `Competing on low hourly rates is a race to the bottom that you win by losing.\nHere is what happens when you sell seats at rock-bottom hourly rates:`,
          body: `You are forced to hire unvetted reps, pay minimum wages, and tolerate 60% quarterly agent churn.\n\nWhen BPOs build an autonomous internal acquisition engine, they bypass middleman brokers and sign direct US clients at $22 to $25 per billable hour.\n\nPrice is not determined by geography. It is determined by pipeline control.`,
          cta: `Are your managing directors defending rock-bottom bids today, or commanding $22+/hr on direct contracts?`,
          wordCount: 73,
          estimatedReadSeconds: 20,
          hashtags: ['#BPOOperations', '#ExecutiveLeadership', '#DealEconomics', '#RevenueGrowth', '#OutboundSales'],
          imagePrompt: `Minimalist margin comparison infographic comparing low-rate commodity seat margins with 60% churn versus $24/hr direct retainers with 12-month retention.`,
          realisticPhotoPrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 35% margin fees.`,
          realisticImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
          alternativeImageUrl: '/images/linkedin/direct-partnership-equity.jpg',
          alternativeImageLabel: '🤝 Direct Contract Equity',
          alternativeImagePrompt: `A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive collaborating with an articulate Filipino female BPO operations director.`,
          visualCard: {
            type: 'metric_callout',
            headline: 'The Commodity Rate Trap vs Direct Retainers',
            subheadline: 'Escaping margin compression by owning your acquisition engine',
            metric: '$24/hr',
            metricLabel: 'Direct enterprise contract rate',
            tag: 'EPISODE 10 • THE MARGIN TRAP'
          },
          injectedComments: [
            'Selling seats at rock-bottom rates is a race to the bottom that you win by going bankrupt. You cannot retain tier-one talent on broker commodity crumbs. Who is ready to stop competing on price?',
            'If your floor has a 60% quarterly rep turnover, stop blaming the recruiters. Your rock-bottom billable rates are the disease. Thoughts on this?',
            'The moment an agency accepts a rock-bottom rate from a broker, they become an accessory to wage compression. When will BPO owners demand direct enterprise value?'
          ]
        },
        {
          id: 'post-ep11',
          episodeNumber: 11,
          dayLabel: 'Thursday • Episode 11',
          title: 'Building a Direct Client Acquisition Engine in Manila',
          hook: `Why do world-class delivery floors in Manila still rely on US brokers for deals?\nBecause they never built their own outbound muscle.`,
          body: `The BPOs scaling to 500+ seats in 2026 do not wait for broker RFP crumbs.\n\nThey run dedicated internal pods using private enriched ICP lists, 150ms objection cockpits, and multi-touch cadences. They book their own qualified enterprise sits.\n\nWhen you control acquisition, you control your valuation.`,
          cta: `What is stopping your floor from running a dedicated 2-rep internal acquisition pod this quarter?`,
          wordCount: 71,
          estimatedReadSeconds: 19,
          hashtags: ['#BPOStrategy', '#BusinessDevelopment', '#InsideSales', '#SalesLeadership', '#ManilaBusiness'],
          imagePrompt: `Editorial diagram showing the Autonomous BDM Pod flywheel: Private ICP -> Voice Sparring -> 150ms Live Teleprompter -> Direct Client Contracts.`,
          realisticPhotoPrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling with live teleprompter cues.`,
          realisticImageUrl: '/images/linkedin/script-discard-sparring.jpg',
          alternativeImageUrl: '/images/linkedin/episode-2-realistic.jpg',
          alternativeImageLabel: '🇵🇭 Team Leader Mentorship',
          alternativeImagePrompt: `A candid 35mm photograph in a vibrant Manila tech hub office showing a Filipino sales coaching session with modern glass partitions and laptop analytics.`,
          visualCard: {
            type: 'process_flow',
            headline: 'The Autonomous Internal Acquisition Pod',
            subheadline: 'Deploying 2 dedicated reps to generate direct enterprise contracts',
            metric: '500 seats',
            metricLabel: 'Scale milestone achieved without middlemen',
            tag: 'EPISODE 11 • THE POD MODEL'
          },
          injectedComments: [
            'Philippine delivery floors are world-class, yet founders still beg US middlemen for deals. Build a two-rep internal acquisition pod and take your sovereignty back. Agree or disagree?',
            'Why let an American broker charge the client $35/hr and pay you $12? Cut them out and negotiate direct. What is actually stopping your agency?',
            'If two internal SDRs can generate $50k in monthly pipeline for clients, why are you not using them to generate pipeline for your own BPO? Answer that honestly.'
          ]
        },
        {
          id: 'post-ep12',
          episodeNumber: 12,
          dayLabel: 'Friday • Episode 12',
          title: 'The 500-Seat Floor Valuation Shift: Scaling Without Middlemen',
          hook: `Brokered seats are temporary revenue.\nDirect enterprise contracts are enterprise equity value.`,
          body: `Private equity and enterprise buyers discount BPOs that depend on broker lead feeds by 40% because contracts can vanish overnight.\n\nWhen you own direct client relationships backed by verified SDR production metrics, your multiple doubles.\n\nThe ultimate goal of outbound is not just filling seats next week. It is building an unassailable BPO business.`,
          cta: `Would you rather hold 50 brokered seats at high churn, or 30 direct client seats with 2-year retainers?`,
          wordCount: 73,
          estimatedReadSeconds: 20,
          hashtags: ['#BPOValuation', '#PrivateEquity', '#MergersAndAcquisitions', '#OutsourcingLeadership', '#ScaleStrategy'],
          imagePrompt: `Executive valuation multiple chart on dark charcoal background: Brokered Floor (3x multiple) vs Direct Pipeline Floor (7x multiple).`,
          realisticPhotoPrompt: `A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive in a tailored navy blazer and a distinguished, articulate Filipino female BPO operations director collaborating as equal strategic partners by a glass whiteboard reviewing outbound seat economics.`,
          realisticImageUrl: '/images/linkedin/direct-partnership-equity.jpg',
          alternativeImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
          alternativeImageLabel: 'The Middleman Trap (Devil in Disguise)',
          alternativeImagePrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker depicted as a devil in disguise: Arrogant, manipulative man in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom.`,
          visualCard: {
            type: 'comparison_grid',
            headline: 'Brokered Floor Revenue vs Direct Contract Equity',
            subheadline: 'How direct pipeline ownership doubles BPO enterprise multiple',
            metric: '2.5x',
            metricLabel: 'Enterprise valuation multiple expansion',
            tag: 'EPISODE 12 • THE VALUATION SHIFT'
          },
          injectedComments: [
            'Brokered revenue is worthless to private equity investors. If middlemen can cancel your campaigns tomorrow, your BPO has zero enterprise multiple. Agree or disagree?',
            'A 50-seat floor on direct client contracts is worth triple a 200-seat floor surviving on broker subcontract crumbs. Change my mind in the comments.',
            'To every BPO founder reading this: If your agency cannot acquire its own clients, you do not own an enterprise. You own a temp agency with computers. Let us hear your pushback.'
          ]
        }
      ]
    };
  }

  // DEFAULT: WEEK 1: The 60% Broker Skim & OPEX Exploitation Arc (Episodes 1 - 3)
  return {
    seriesTitle: `The Autonomous BPO Outbound Series: Week 1 (Episodes 1-3)`,
    seriesHookRecap: preset.recapHook,
    targetBottleneckSummary: `Grounded in ${summary.totalLeads} accounts: Eliminating 60% broker margin skims and taking back operational sovereignty across ${summary.dominantHeadcount} floors.`,
    targetAudience: `BPO Founders, Managing Directors, CROs & Outbound Operations Leaders`,
    posts: [
      {
        id: 'post-ep1',
        episodeNumber: 1,
        dayLabel: 'Tuesday • Episode 1',
        title: 'The 60% Broker Skim: Who Really Carries Your OPEX?',
        hook: `Brokers love offering cheap pay-per-performance campaigns to BPOs.\nWhat they never mention is that they take home up to a 60% cut while you carry 100% of the OPEX burden.`,
        body: `Think about your monthly floor expenses: fiber, workstations, software seats, supervisor salaries, agent benefits, and attrition.\n\nThe middleman risks zero capital. They collect the majority of the margin, take over control of your operations, and leave you with razor-thin profits.\n\nIt is time to take internal acquisition back to all BPOs.`,
        cta: `What percentage of your floor revenue is currently trapped under broker or third-party middleman contracts?`,
        wordCount: 71,
        estimatedReadSeconds: 19,
        hashtags: ['#BPOOperations', '#ClientAcquisition', '#SalesDevelopment', '#OutboundStrategy', '#DealEconomics'],
        imagePrompt: `Minimalist high-contrast dark graphite infographic showing a 2-way split diagram: Left side labeled "The 60% Broker Skim & 100% BPO OPEX Burden", Right side labeled "Internal Acquisition Engine (100% Retained Margin)". Clean Swiss typography, zero clutter, 4k editorial graphic.`,
        realisticPhotoPrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 60% broker cut and cheap pay-per-performance terms. Dramatic chiaroscuro lighting with subtle crimson rim light, psychological thriller tone, zero corporate cheer.`,
        realisticImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
        alternativeImageUrl: '/images/linkedin/script-discard-sparring.jpg',
        alternativeImageLabel: '⚡ Direct Outbound Engine',
        alternativeImagePrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling. Dual screens display "LIVE OBJECTION TELEPROMPTER CUES - 150ms LATENCY" and real-time prospect telemetry. On the desk next to him, a crumpled static PDF script sits discarded in a recycling bin, symbolizing the transition from rigid scripts to agile voice sparring. Modern glass architecture, warm natural daylight, Kodak Portra 400 aesthetic, authentic Filipino BPO setting.`,
        visualCard: {
          type: 'metric_callout',
          headline: 'The 60% Broker Skim vs 100% BPO OPEX Burden',
          subheadline: 'Middlemen take 60% cuts while BPOs shoulder 100% of operational risk',
          metric: '60%',
          metricLabel: 'Cut taken by brokers on outsourced campaigns',
          tag: 'EPISODE 01 • THE 60% SKIM'
        },
        injectedComments: [
          'Unpopular truth: If your BPO relies on broker pay-per-performance deals, you do not own a real business. You own a rented boiler room subsidizing a middleman margin. Agree or disagree?',
          'Brokers take home 60% while you carry 100% of the rent, workstations, and HMOs. At what point does accepting pay-per-performance become self-inflicted exploitation? Drop your thoughts below.',
          'I already hear brokers screaming: "we absorb the sales risk." Really? When campaigns fail, who pays the agent severance and lease penalties? You or the BPO? Let us hear the defense.'
        ]
      },
      {
        id: 'post-ep2',
        episodeNumber: 2,
        dayLabel: 'Thursday • Episode 2',
        title: 'The Pay-Per-Performance Trap: Reclaiming Operational Sovereignty',
        hook: `When a broker hands you a cheap pay-per-performance campaign, they are not your partner.\nThey are a middleman taking over control of your floor operations without risking a single dollar of overhead.`,
        body: `Brokers dictate your metrics, demand uncompensated overtime, and withhold client contact, all while keeping 50% to 60% of the contract value.\n\nWhen BPOs deploy their own internal outbound pod, they deal directly with North American and European enterprise decision-makers.\n\nControl your acquisition, and you control your operations.`,
        cta: `Have you ever had a broker try to dictate your floor processes while paying rock-bottom performance rates?`,
        wordCount: 70,
        estimatedReadSeconds: 19,
        hashtags: ['#BPOLeadership', '#OperationalSovereignty', '#OutsourcingStrategy', '#ContactCenter', '#DealEconomics'],
        imagePrompt: `Clean modern editorial diagram on dark zinc backdrop showing the comparison: Broker Control Model (High OPEX Burden, 60% Skim, Zero Control) vs Sovereign Acquisition Model (Direct Contracts, Full Control, $24/hr Seats). Modern tech aesthetic, sleek data points, 8k resolution.`,
        realisticPhotoPrompt: `Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling. Dual screens display "LIVE OBJECTION TELEPROMPTER CUES - 150ms LATENCY" and real-time prospect telemetry. On the desk next to him, a crumpled static PDF script sits discarded in a recycling bin, symbolizing the transition from rigid scripts to agile voice sparring. Modern glass architecture, warm natural daylight, Kodak Portra 400 aesthetic, authentic Filipino BPO setting.`,
        realisticImageUrl: '/images/linkedin/script-discard-sparring.jpg',
        alternativeImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
        alternativeImageLabel: '⚠️ The Middleman Trap',
        alternativeImagePrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 60% margin fees.`,
        visualCard: {
          type: 'process_flow',
          headline: 'The Pay-Per-Performance Trap vs Sovereign Operations',
          subheadline: 'Reclaiming floor control from predatory middleman campaigns',
          metric: '100%',
          metricLabel: 'BPO OPEX burden carried vs 0% broker risk',
          tag: 'EPISODE 02 • THE CONTROL TRAP'
        },
        injectedComments: [
          'Pay-per-performance is the biggest legal scam in outsourcing. It forces the BPO to carry 100% of the operational overhead while the middleman collects risk-free cash. Prove me wrong.',
          'The moment a broker dictates your floor KPIs while refusing to introduce you to the actual client, they stole your company sovereignty. Why do so many agency owners tolerate this?',
          'Hard question for BPO founders: If your primary broker walked away tomorrow, would your floor survive 60 days? If the answer is no, you are a subcontractor, not an agency owner.'
        ]
      },
      {
        id: 'post-ep3',
        episodeNumber: 3,
        dayLabel: 'Friday • Episode 3',
        title: 'Taking Internal Acquisition Back: 17 Years of Middleman Mercy Ends Now',
        hook: `17 years ago as a BDM, I watched BPOs slave away on cheap broker deals.\nToday, too many startup to mid-sized BPOs are still at the mercy of middlemen.`,
        body: `Brokers will tell you that finding direct US enterprise clients is too hard and that you should stick to delivery.\n\nThat is how they protect their 60% cut. The reality? With a modern autonomous outbound engine, two Filipino SDRs can generate all the direct enterprise sits your floor needs.\n\nOwn the pipeline. Keep the equity.`,
        cta: `Would you rather run 30 brokered seats at cheap margins, or 15 direct enterprise seats at $24/hr with 100% control?`,
        wordCount: 74,
        estimatedReadSeconds: 20,
        hashtags: ['#BPOStrategy', '#BusinessDevelopment', '#RevenueGrowth', '#OutsourcingLeadership', '#DealEconomics'],
        imagePrompt: `High-resolution executive comparison card comparing two margin models on dark charcoal background: Model A (Broker Skim) vs Model B (Direct Contract Margin). Clean geometric design, crisp white and gold typography.`,
        realisticPhotoPrompt: `A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive in a tailored navy blazer and a distinguished, articulate Filipino female BPO operations director collaborating as equal strategic partners. They stand beside a transparent glass architectural whiteboard displaying "DIRECT SEAT CONTRACT ECONOMICS • 100% EQUITY RETENTION • REVENUE VELOCITY". Authentic warm golden hour sunlight, Kodak Portra 800 tone, respectful peer-to-peer partnership, zero generic stock poses.`,
        realisticImageUrl: '/images/linkedin/direct-partnership-equity.jpg',
        alternativeImageUrl: '/images/linkedin/broker-middleman-devil.jpg',
        alternativeImageLabel: '⚠️ The Middleman Trap (Devil in Disguise)',
        alternativeImagePrompt: `A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 60% margin fees. Dramatic chiaroscuro lighting, subtle devilish amber and crimson rim light, psychological thriller tone.`,
        visualCard: {
          type: 'comparison_grid',
          headline: 'Broker Dependency vs Direct Pipeline Ownership',
          subheadline: 'Comparing billable rates and margin retention',
          metric: '$24/hr',
          metricLabel: 'Direct enterprise contract billable rate',
          tag: 'EPISODE 03 • THE BRIDGE'
        },
        injectedComments: [
          'Unfiltered reality: BPO owners love to complain about low margins and predatory brokers, yet refuse to invest in a 2-person internal SDR pod. The broker dependency is 100% self-inflicted.',
          'Would love an honest answer from agency leaders: Why surrender 60% of your deal equity to a middleman when two trained Filipino callers can land direct $24/hr retainers? What holds you back?',
          'Brokers want BPOs to believe direct enterprise acquisition is impossible for offshore teams. They preach this myth to protect their skim. Who on your leadership team still buys into this lie?'
        ]
      }
    ]
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

