import { NextRequest, NextResponse } from 'next/server';
import { 
  LINKEDIN_FRAMEWORKS, 
  CONTINUITY_SERIES_PRESETS,
  summarizeCsvLeads, 
  getDeterministicLinkedInSeries, 
  getDeterministicViralComments,
  getDeterministicThreadFollowUps,
  sanitizeTextForLinkedIn,
  CsvIntelligenceSummary,
  LinkedInSeries,
  ViralCommentDraft,
  ThreadFollowUpDraft
} from '@/lib/linkedinStudio';
import { CadenceLeadRecord } from '@/lib/cadenceMaster';
import { getServerSession } from '@/lib/server/session';
import { isDemoSession } from '@/lib/demoMode';
import { sanitizeColdEmail } from '@/lib/coldEmailStudio';
import { campaignBrief, type AssistantCampaign } from '@/lib/coldEmailAssistant';

interface LinkedInStudioPayload {
  action: 'generate_series' | 'generate_viral_comment' | 'generate_thread_reply';
  // For generate_series
  leads?: CadenceLeadRecord[];
  csvSummary?: CsvIntelligenceSummary;
  frameworkId?: string;
  presetId?: string;
  customTopicInstruction?: string;
  // For generate_viral_comment
  viralPostText?: string;
  commentAngle?: string;
  // For generate_thread_reply
  myPreviousComment?: string;
  authorReplyText?: string;
  /** Shared Outreach campaign message: posts and cold emails mirror it. */
  campaign?: Partial<AssistantCampaign>;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');

function readCampaign(raw: unknown): AssistantCampaign {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { angle: clip(o.angle, 400), pain: clip(o.pain, 400), proof: clip(o.proof, 400), offer: clip(o.offer, 400) };
}

/** Keeps line breaks (LinkedIn posts are short lines), strips em dashes and emojis. */
function cleanPostText(v: unknown): string {
  return sanitizeColdEmail(typeof v === 'string' ? v : '').cleanText;
}

const NO_AI = { error: 'The writing model is unavailable right now. Try again in a moment.' };

/*
 * Client workspaces: the prompts below are written around the rep's own angle and campaign
 * message. The demo workspace keeps the platform owner's BPO point of view further down.
 */
function clientIdentity(sender: { name: string; company: string }) {
  return `${sender.name || 'a B2B professional'}${sender.company ? ` at ${sender.company}` : ''}`;
}

function clientViralPrompt(post: string, campaign: AssistantCampaign, sender: { name: string; company: string }) {
  return `You help ${clientIdentity(sender)} comment on LinkedIn posts in a way that builds genuine authority with their buyers.

THE POST:
---
<<${post.trim().slice(0, 1500)}>>
---

THE REP'S CAMPAIGN MESSAGE (their point of view; stay consistent with it, but never pitch):
${campaignBrief(campaign)}

Write 4 comment drafts the rep can post themselves.
RULES: no em dashes, no emojis, 18 to 42 words each, sound like a thoughtful peer with real experience, never pitch a product, never invent statistics, customers or results.
Angles, in this order:
1. "Counter-Perspective": respectfully challenge one assumption in the post.
2. "Consultative Question": a sharp question that makes the author want to reply.
3. "Frontline BPO Operator": a short practical observation from doing the work (use that exact angle label).
4. "Punchy 20-Word": under 25 words, cuts through the noise.

Return strictly a JSON array of objects with keys "angle", "comment", "intent". No markdown.`;
}

function clientThreadPrompt(post: string, mine: string, reply: string, campaign: AssistantCampaign, sender: { name: string; company: string }) {
  return `You help ${clientIdentity(sender)} continue a public LinkedIn comment thread and build a real relationship.

- Original post: <<${post.trim().slice(0, 600)}>>
- The rep's previous comment: <<${mine.trim().slice(0, 400)}>>
- The author or prospect replied: <<${reply.trim().slice(0, 500)}>>

The rep's point of view (stay consistent, never pitch):
${campaignBrief(campaign)}

Write 3 follow-up replies. RULES: no em dashes, no emojis, 18 to 38 words each, peer tone, no pitching, no invented statistics.
Stages, in this order: "Deepen Dialogue" (validate and add a specific perspective), "Nuanced Counter" (explore a trade-off or ask how they handle it), "Relationship Bridge to DM" (warm, natural invitation to connect).

Return strictly a JSON array of objects with keys "stage", "reply", "strategicGoal". No markdown.`;
}

function clientSeriesPrompt(
  idea: string,
  campaign: AssistantCampaign,
  summary: CsvIntelligenceSummary,
  framework: (typeof LINKEDIN_FRAMEWORKS)[number],
  sender: { name: string; company: string },
) {
  const data = summary.totalLeads > 0
    ? `- ${summary.totalLeads} target accounts uploaded. Common pain points: ${summary.topPainPoints.join(', ')}. Tools: ${summary.topTechStacks.join(', ')}. Incumbents: ${summary.topCompetitors.join(', ')}.`
    : '- No prospect data uploaded.';
  return `You are a LinkedIn ghostwriter for ${clientIdentity(sender)}. Write a 3-post weekly series (Tuesday, Thursday, Friday) for their buyers.

THE REP'S ANGLE / IDEA (the anchor of the whole series):
---
${idea || '(not given: build the series on the campaign message)'}
---

CAMPAIGN MESSAGE (the rep's cold emails mirror these posts, so use the same angle, pain, proof, offer and terminology):
${campaignBrief(campaign)}

PROSPECT DATA:
${data}

FRAMEWORK: ${framework.name} [${framework.tag}] (structure only: its examples mention BPOs and outbound floors; ignore those specifics and write for the rep's own audience)
- ${framework.description}
- Hook: ${framework.hookPhilosophy}
- Body: ${framework.bodyPhilosophy}
- CTA: ${framework.ctaPhilosophy}

EPISODES: 1 = the problem or insight, 2 = the practical how, 3 = an open question or dilemma that invites debate.

RULES:
- Posts, not pitches: share an insight, a lesson or a short story. Soft CTA question that invites comments. Never "DM me", links or "book a call".
- NEVER invent statistics, percentages, durations, customers, results or prices. Use numbers only if they appear above, exactly as given, written as digits.
- Hook: 1 or 2 short lines. Body: under 90 words in short lines with blank lines between. No em dashes, no emojis.
- 3 to 5 relevant hashtags.
- injectedComments: 3 thoughtful comments (18 to 38 words) the author posts under their own post to keep the discussion going. Bold opinions are fine; no selling.
- imagePrompt: a clean editorial graphic card on a dark background about the post's idea.
- visualCard.metric: only a number that appears in the facts above, otherwise an empty string.

Return strictly this JSON (no markdown):
{"seriesTitle": "...", "seriesHookRecap": "...", "targetBottleneckSummary": "...", "targetAudience": "...",
 "posts": [{"episodeNumber": 1, "dayLabel": "Tuesday • Episode 1", "title": "...", "hook": "...", "body": "...", "cta": "...", "hashtags": ["#..."], "imagePrompt": "...",
   "visualCard": {"type": "metric_callout", "headline": "...", "subheadline": "...", "metric": "", "metricLabel": "", "tag": "EPISODE 01"},
   "injectedComments": ["...", "...", "..."]}]}`;
}

export async function POST(req: NextRequest) {
  try {
    const payload: LinkedInStudioPayload = await req.json();
    const { action = 'generate_series' } = payload;
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const session = await getServerSession(req);
    // The demo workspace keeps the platform owner's BPO point of view and sample fallbacks.
    const demo = isDemoSession(session);
    const campaign = readCampaign(payload.campaign);
    const sender = { name: session?.name || '', company: session?.identity.tenant.name || '' };

    // ACTION 1: VIRAL POST ENGAGEMENT COMMENT GENERATION
    if (action === 'generate_viral_comment') {
      const { viralPostText = '', commentAngle = 'All' } = payload;

      if (!viralPostText || viralPostText.trim().length < 15) {
        return NextResponse.json(
          { error: 'Please provide the viral post content (at least 15 characters).' },
          { status: 400 }
        );
      }

      if (!googleApiKey && !demo) return NextResponse.json(NO_AI, { status: 503 });
      if (!googleApiKey) {
        const fallbackComments = getDeterministicViralComments(viralPostText).map(c => ({
          ...c,
          comment: sanitizeTextForLinkedIn(c.comment)
        }));
        return NextResponse.json({
          source: 'deterministic_fallback',
          commentDrafts: fallbackComments
        });
      }

      const prompt = !demo ? clientViralPrompt(viralPostText, campaign, sender) : `You are an elite B2B Business Development Manager (BDM) and Outbound Sales Leader for an enterprise BPO with 17 years of frontline experience.
You know the real battlefield of BPO operations: predatory brokers pocketing 60% margin cuts on cheap pay-per-performance campaigns while BPOs carry 100% of the OPEX burden, loss of operational control, and the paramount importance of taking internal client acquisition back to all BPOs.

A prospect, buyer, or industry influencer posted the following viral post on LinkedIn:

---
"""${viralPostText.trim().slice(0, 1500)}"""
---

Your task is to write 3 to 4 distinct, high-leverage comment drafts that the SDR or BDM can copy and paste manually to build genuine authority, earn executive impressions, and initiate conversations with decision makers.

MANDATORY RULES (CRITICAL VIOLATION IF BROKEN):
1. ZERO EM DASHES: Do NOT use em dashes ("—" or "–" or "--"). Use commas, periods, or clean short sentences instead.
2. ZERO EMOJIS: Do NOT use a single emoji anywhere. Not one.
3. SHORT AND PUNCHY: Keep comments between 18 and 42 words maximum. No bloated paragraphs.
4. AUTHENTIC OPERATOR TONE: Sound like a sharp, thoughtful operator with genuine floor experience, NOT an AI bot, telemarketer, or sycophant.
5. NO PITCHING: Never pitch Appointmentlyy or any product. Provide pure perspective, consultative inquiry, or frontline BPO observations.

Provide exactly 4 comment angles:
1. "Counter-Perspective": Respectfully challenges an assumption in the post using operational reality, BPO floor economics, or broker dependency traps.
2. "Consultative Question": Asks an intellectual question about their operational benchmarks or seat economics that compels the author to reply.
3. "Frontline BPO Operator": Shares a quick real-world observation from the calling floor, client campaigns, or internal acquisition.
4. "Punchy 20-Word": A razor-sharp, under-25-word thought that immediately cuts through noise.

OUTPUT FORMAT:
Return strictly a valid JSON array of objects with keys: "angle", "comment", "intent".
Example JSON format:
[
  {
    "angle": "Counter-Perspective",
    "comment": "Interesting point, but in outbound BPO operations the real margin killer is broker dependency. When middlemen take 60% cuts, BPOs subsidize their agency. Direct acquisition always wins.",
    "intent": "Challenges conventional wisdom using operational reality."
  }
]
Output ONLY valid JSON. No markdown ticks, no preamble.`;

      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash'
      ];

      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.65,
                maxOutputTokens: 800
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsedArray = JSON.parse(cleanedJson);

            if (Array.isArray(parsedArray) && parsedArray.length > 0) {
              const sanitizedDrafts: ViralCommentDraft[] = parsedArray.map((item: any, idx: number) => {
                const cleanComment = sanitizeTextForLinkedIn(item.comment || '');
                const wordCount = cleanComment.split(/\s+/).filter(Boolean).length;
                return {
                  id: `viral-cmt-${Date.now()}-${idx}`,
                  angle: item.angle || 'Frontline BPO Operator',
                  comment: cleanComment,
                  wordCount,
                  intent: item.intent || 'Builds authentic engagement'
                };
              });

              return NextResponse.json({
                source: `gemini_${model}`,
                commentDrafts: sanitizedDrafts
              });
            }
          }
        } catch (modelErr) {
          console.warn(`[LinkedIn Studio] Viral comment model ${model} attempt failed:`, modelErr);
        }
      }

      // If all Gemini calls fail, use deterministic fallback (demo workspace only)
      if (!demo) return NextResponse.json(NO_AI, { status: 503 });
      const fallback = getDeterministicViralComments(viralPostText).map(c => ({
        ...c,
        comment: sanitizeTextForLinkedIn(c.comment)
      }));
      return NextResponse.json({
        source: 'deterministic_fallback',
        commentDrafts: fallback
      });
    }

    // ACTION 2: THREAD REPLY / RELATIONSHIP BUILDER COPILOT
    if (action === 'generate_thread_reply') {
      const { 
        viralPostText = '', 
        myPreviousComment = '', 
        authorReplyText = '' 
      } = payload;

      if (!authorReplyText || authorReplyText.trim().length < 5) {
        return NextResponse.json(
          { error: 'Please provide what the author or prospect replied with.' },
          { status: 400 }
        );
      }

      if (!googleApiKey && !demo) return NextResponse.json(NO_AI, { status: 503 });
      if (!googleApiKey) {
        const fallback = getDeterministicThreadFollowUps(authorReplyText).map(r => ({
          ...r,
          reply: sanitizeTextForLinkedIn(r.reply)
        }));
        return NextResponse.json({
          source: 'deterministic_fallback',
          threadFollowUps: fallback
        });
      }

      const threadPrompt = !demo ? clientThreadPrompt(viralPostText, myPreviousComment, authorReplyText, campaign, sender) : `You are an elite B2B Business Development Manager (BDM) on LinkedIn engaging in a high-value public comment thread.
CONTEXT OF THE THREAD:
- Original Viral Post: """${viralPostText.trim().slice(0, 600)}"""
- Your Previous Comment: """${myPreviousComment.trim().slice(0, 400)}"""
- Author or Prospect Just Replied: """${authorReplyText.trim().slice(0, 500)}"""

YOUR MISSION:
Draft 3 distinct follow-up replies that:
1. Continue the thread naturally and display consultative thought leadership and BPO operational acumen.
2. Build a genuine peer-to-peer relationship without pitching or being defensive.
3. Keep the conversation engaging so more followers and prospects read your POV.

MANDATORY RULES:
1. ZERO EM DASHES: Do NOT use "—" or "–" or "--". Use commas, periods, or clean short clauses.
2. ZERO EMOJIS: Do NOT use any emojis.
3. SHORTER COMMENTS: Strictly between 18 and 38 words maximum.
4. AUTHENTIC OPERATOR TONE: Sound like a sharp operational peer, not a generic AI bot or telemarketer.

Provide 3 stages:
1. "Deepen Dialogue": Validates their reply thoughtfully while offering a specific operational perspective.
2. "Nuanced Counter": Respectfully explores a trade-off (e.g. OPEX burden, direct retention) or asking how their team structures the solution.
3. "Relationship Bridge to DM": A warm, natural close to the public thread inviting them to connect.

OUTPUT FORMAT:
Return strictly a valid JSON array of objects with keys: "stage", "reply", "strategicGoal".
Example format:
[
  {
    "stage": "Deepen Dialogue",
    "reply": "Fair point on that distinction. We noticed that when BPOs run direct client acquisition rather than brokered campaigns, retention doubles. Have you tested varying your outreach channels?",
    "strategicGoal": "Validates their reply while introducing a specific operational test."
  }
]
Output ONLY valid JSON. No markdown ticks, no preamble.`;

      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash'
      ];

      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: threadPrompt }] }],
              generationConfig: {
                temperature: 0.65,
                maxOutputTokens: 800
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsedArray = JSON.parse(cleanedJson);

            if (Array.isArray(parsedArray) && parsedArray.length > 0) {
              const sanitizedReplies: ThreadFollowUpDraft[] = parsedArray.map((item: any, idx: number) => {
                const cleanReply = sanitizeTextForLinkedIn(item.reply || '');
                const wordCount = cleanReply.split(/\s+/).filter(Boolean).length;
                return {
                  id: `thread-reply-${Date.now()}-${idx}`,
                  stage: item.stage || 'Deepen Dialogue',
                  reply: cleanReply,
                  wordCount,
                  strategicGoal: item.strategicGoal || 'Deepens engagement'
                };
              });

              return NextResponse.json({
                source: `gemini_${model}`,
                threadFollowUps: sanitizedReplies
              });
            }
          }
        } catch (modelErr) {
          console.warn(`[LinkedIn Studio] Thread reply model ${model} attempt failed:`, modelErr);
        }
      }

      if (!demo) return NextResponse.json(NO_AI, { status: 503 });
      const fallback = getDeterministicThreadFollowUps(authorReplyText).map(r => ({
        ...r,
        reply: sanitizeTextForLinkedIn(r.reply)
      }));
      return NextResponse.json({
        source: 'deterministic_fallback',
        threadFollowUps: fallback
      });
    }

    // ACTION 3: 3-POST SEQUENTIAL LINKEDIN SERIES ARC GENERATION
    const { 
      leads, 
      frameworkId = 'contrarian-truth',
      presetId = 'broker-margin-continuity',
      customTopicInstruction = ''
    } = payload;

    // Summarize CSV leads dataset or use precomputed summary
    const summary: CsvIntelligenceSummary = payload.csvSummary || summarizeCsvLeads(leads);
    const framework = LINKEDIN_FRAMEWORKS.find(f => f.id === frameworkId) || LINKEDIN_FRAMEWORKS[0];
    const preset = CONTINUITY_SERIES_PRESETS.find(p => p.id === presetId) || CONTINUITY_SERIES_PRESETS[0];

    const userRawIdea = (customTopicInstruction || '').trim();

    if (!googleApiKey && !demo) return NextResponse.json(NO_AI, { status: 503 });
    if (!googleApiKey) {
      const fallbackSeries = getDeterministicLinkedInSeries(summary, frameworkId, presetId);
      return NextResponse.json({
        source: 'deterministic_fallback',
        csvSummary: summary,
        series: fallbackSeries
      });
    }

    const seriesPrompt = !demo ? clientSeriesPrompt(userRawIdea, campaign, summary, framework, sender) : `You are a world-class B2B LinkedIn Thought Leadership strategist and 17-year veteran BDM specializing in BPO Operations, Outbound Client Acquisition, and Enterprise Appointment Setting.
You are designing a high-retention, 3-Post Sequential LinkedIn Series for a BPO Business Development Manager (BDM), Founder, or Head of Floor Operations.

=============================================================================
CRITICAL STEP 1: DEEP ANALYSIS OF THE END USER'S IDEA BOX (USER RAW INPUT)
=============================================================================
The user typed the following raw thought, experience, or strategic direction into the Idea Box:
"""
${userRawIdea || 'Brokers take up to a 60% cut on cheap pay-per-performance campaigns while the BPO carries 100% of the OPEX burden. They take over control of operations without risking any capital. It is time to take internal acquisition back to all BPOs.'}
"""

YOU MUST ACCURATELY READ AND DEEPLY ANALYZE THIS USER INPUT:
1. CORE THESIS EXTRACTION: What is the exact argument, observation, friction, or operational reality the user is asserting?
2. OPERATIONAL NUANCE & NUMBERS: Pull out all specific figures, pain points, or historical context mentioned (e.g., 60% broker cut, 100% BPO OPEX burden, cheap pay-per-performance, loss of operational control, 17-year BDM problem, taking internal acquisition back).
3. ARCHITECTURAL THROUGH-LINE: The entire 3-post series MUST be directly constructed around this specific idea. Do NOT ignore the user's idea. Do NOT output generic canned outbound advice. The user's idea is the primary anchor of the 3-post arc.

=============================================================================
CRITICAL STEP 2: FOUNDATIONAL BPO INDUSTRY POINT OF VIEW (POV) & SELLING POINT
=============================================================================
As an experienced BDM who has seen the industry from the trenches for 17 years, you understand the real BPO battlefield:
- THE MIDDLEMAN / BROKER TRAP: Brokers supply BPOs with campaigns or outsourced tasks on cheap pay-per-performance or low commodity rates (for sales-driven outbound, appointment setting, lead gen, and non-sales BPO tasks).
- THE 60% MARGIN SKIM: Brokers pocket up to 60% of the total client contract value.
- TAKEOVER OF CONTROL: Brokers micromanage and take over control of the BPO's floor operations, imposing harsh penalties and dictating floor rules, while hiding the end client relationship.
- TOTAL DISREGARD FOR BPO OPEX: Brokers do NOT care about the BPO's OPEX (rent, workstations, high-speed fiber, hardware, software licenses, agent healthcare, benefits, supervisor salaries, recruitment, attrition). The broker risks zero capital. The BPO carries 100% of the operational risk and cost burden in exchange for razor-thin, cheap profits.
- 17-YEAR HISTORICAL PERSPECTIVE: This predatory cycle has trapped BPO startups and mid-size agencies for over 17 years since the BDM days 17 years ago.
- THE CORE RALLYING CRY & SELLING POINT OF OUR LINKEDIN POSTS:
  "IT IS TIME TO TAKE INTERNAL ACQUISITION BACK TO ALL BPOS."
  When a BPO builds its own autonomous internal client acquisition engine, it bypasses middlemen, deals directly with North American and European enterprise clients, commands $22-$25+/hr direct retainers, retains 100% operational sovereignty and margin, and doubles enterprise valuation.

=============================================================================
CRITICAL STEP 3: ACCURATE FRAMEWORK EXECUTION (${framework.name.toUpperCase()})
=============================================================================
You must strictly incorporate the structure and philosophy of the selected writing framework:
- Framework Name: ${framework.name} [${framework.tag}]
- Description: ${framework.description}
- Hook Architecture: ${framework.hookPhilosophy}
- Body Architecture: ${framework.bodyPhilosophy}
- CTA Architecture: ${framework.ctaPhilosophy}

Every post's Hook, Body, and CTA must rigorously follow these exact architectural guidelines:
- HOOK (First 2 Lines): Scroll-stopping before "see more". First line states the common belief or comfortable setup; second line drops the hammer with operational truth based on the user's idea and framework.
- BODY: Strictly under 90 words per post. Use short 1-2 sentence paragraphs with clean line breaks. High retention readability. Razor-sharp operational diagnostic clarity. Zero corporate fluff.
- CTA: A non-salesy, high-engagement open question that forces executives, founders, and operators to debate their own floor reality in the comments. Never say "DM me" or "link in bio".

=============================================================================
DATASET & CONTINUITY CONTEXT:
=============================================================================
- Grounded Accounts Analyzed: ${summary.totalLeads} accounts
- Dominant Floor Size: ${summary.dominantHeadcount}
- Target Account Pain Points: ${summary.topPainPoints.join(', ')}
- Dominant Tech Stacks: ${summary.topTechStacks.join(', ')}
- Incumbent Competitors: ${summary.topCompetitors.join(', ')}
- Series Theme: ${preset.theme}
- Campaign message (the rep's cold emails mirror these posts: keep the same angle, pain, proof, offer and terminology; never invent numbers):
${campaignBrief(campaign)}
- Continuity Hook Connecting to Last Drop: "${preset.recapHook}"

=============================================================================
EPISODIC CONTINUITY FOR THE 3 POSTS:
=============================================================================
- Episode 1 (Tuesday): The Bottleneck Unveiled (Presents the hidden trap, unmasks the 60% broker skim / OPEX exploitation / user's specific idea, and challenges conventional assumptions).
- Episode 2 (Thursday): The Tactical Playbook (Breaks down the operational fix, how to regain operational sovereignty, and deploy an internal acquisition pod without burning client leads).
- Episode 3 (Friday): The Debate & Series Bridge (Presents a high-stakes executive dilemma between broker dependency vs direct enterprise retainers, invites community debate, and bridges to next week's drop).

=============================================================================
MANDATORY RULES:
=============================================================================
1. ZERO EM DASHES: Do NOT use em dashes ("—" or "–" or "--"). Use commas, periods, or clean short clauses instead.
2. ZERO EMOJIS: Do NOT use a single emoji anywhere in the post body, hooks, CTAs, or comments.
3. BODY LENGTH: Strictly under 90 words per post body.
4. INJECTED DISCUSSION COMMENTS (MUST BE BOLD, CONTROVERSIAL & ENGAGEMENT-IGNITING):
   The primary purpose of injected comments is to provide the creator with follow-up comment injections to post directly beneath their own post immediately after publishing. This continues the engagement, provokes strong reactions, and compels readers (BPO founders, CROs, brokers, and floor directors) to comment their thoughts.
   - THEY MUST BE BOLD, CONTROVERSIAL, AND UNAPOLOGETIC.
   - Strictly NO polite, bland corporate PR platitudes or timid questions.
   - MUST GENERATE EXACTLY 3 DISTINCT ENGAGEMENT-IGNITING COMMENTS:
     * Comment 1 (The Sacred Cow Sledgehammer / Bold Truth Bomb): An unapologetic stance that exposes an uncomfortable truth about broker exploitation, OPEX subsidization, or operational delusions. End with a provocative challenge like "Agree or disagree?" or "Prove me wrong." (e.g. "Unpopular truth: If your BPO relies on broker pay-per-performance deals, you do not own a real business. You own a rented boiler room subsidizing a middleman margin. Agree or disagree?")
     * Comment 2 (The Direct Executive Call-Out / Controversial Debate Flame): A spicy challenge or polarizing question that forces founders, brokers, and ops leaders to defend their position, reveal their floor realities, or confess their frustration in the comments. (e.g. "Brokers take home 60% while you carry 100% of the rent, workstations, and HMOs. At what point does accepting pay-per-performance become self-inflicted exploitation? Drop your thoughts below.")
     * Comment 3 (The Devil's Advocate / Excuse-Shredder): Anticipates the typical defensive excuse (e.g. "brokers absorb the sales risk" or "classroom training builds culture") and dismantles it aggressively, daring commenters to push back or defend the broker model. (e.g. "I already hear brokers screaming: 'we absorb the sales risk.' Really? When campaigns fail, who pays the agent severance and lease penalties? You or the BPO? Let us hear the defense.")
   - MANDATORY RESTRICTIONS:
     * Strictly ZERO EM DASHES (no "—", "–", or "--").
     * Strictly ZERO EMOJIS (no icons or smileys).
     * Keep each comment punchy (between 18 and 38 words).
5. HASHTAGS: Exactly 4 to 5 hyper-targeted hashtags (e.g. #BPOOperations #ClientAcquisition #DealEconomics #OperationalSovereignty #OutboundStrategy).
6. GEMINI IMAGE GENERATION PROMPT: Clean minimalist editorial visual or infographic card on dark graphite/zinc backdrop with crisp typography and metric callout.
7. GEMINI REALISTIC & RELATABLE PHOTO PROMPT (STRICT TOPIC & POV ALIGNMENT):
   - Episode 1 / Broker Posts: Depict an arrogant, manipulative lead broker as a "devil in disguise" in an expensive dark charcoal bespoke suit with a crimson silk pocket square, steepled hands, calculating cynical smirk in a shadowy high-rise boardroom, over contracts stamped with 60% broker cut and cheap pay-per-performance terms, dramatic chiaroscuro lighting.
   - Episode 2 / Sparring / Teleprompter Posts: Authentic young Filipino male SDR wearing an ergonomic headset in a high-tech Manila BGC outbound center, intensely engaged in live consultative calling with real-time teleprompter cues and discarded static PDF script.
   - Episode 3 / Direct Equity / Client Posts: Collaborative peer partnership between a senior North American client executive and an articulate Filipino female BPO operations director analyzing direct seat contract economics ($24/hr direct retainer, 100% equity retention) by a transparent glass architectural whiteboard in Manila.
   - Demographic Mandate: Frontline SDRs, callers, team leads, and operations managers MUST be explicitly described as authentic Filipino professionals with Southeast Asian features in Manila or Cebu tech offices. Foreign characters strictly reserved for showing client partnership.

OUTPUT FORMAT:
Return strictly a valid JSON object with the following schema:
{
  "seriesTitle": "The Autonomous BPO Outbound Series: Part 1-3",
  "seriesHookRecap": "Recap connecting to last week's discussions",
  "targetBottleneckSummary": "1-sentence summary of the core pain point addressed",
  "targetAudience": "BPO Founders, CROs, and Outbound Operations Directors",
  "posts": [
    {
      "episodeNumber": 1,
      "dayLabel": "Tuesday • Episode 1",
      "title": "Episode 1 Title",
      "hook": "Scroll-stopping first 2 lines",
      "body": "Post body under 90 words with clean line breaks",
      "cta": "Engaging closing question",
      "hashtags": ["#BPOOperations", "#ClientAcquisition"],
      "imagePrompt": "Detailed prompt for Gemini / Imagen graphic generation",
      "realisticPhotoPrompt": "Detailed candid 35mm photo prompt resonating with the specific topic (e.g. predatory broker devil in disguise with 60% margin contracts, scriptless teleprompter SDR, or client equity partnership)",
      "visualCard": {
        "type": "metric_callout",
        "headline": "Short punchy card title",
        "subheadline": "Context line",
        "metric": "60%",
        "metricLabel": "Description of metric",
        "tag": "EPISODE 01 • THE BOTTLENECK"
      },
      "injectedComments": [
        "Comment 1 under 35 words: bold provocative truth bomb ending in a challenge, no em dashes, no emojis",
        "Comment 2 under 35 words: controversial executive call-out compelling readers to comment thoughts, no em dashes, no emojis",
        "Comment 3 under 35 words: spicy devil advocate shredding common excuses and daring pushback, no em dashes, no emojis"
      ]
    }
  ]
}
Output ONLY valid JSON. No markdown ticks, no preamble.`;

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash'
    ];

    for (const model of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: seriesPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2500
            }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanedJson);

          if (parsed && Array.isArray(parsed.posts) && parsed.posts.length > 0) {
            // Sanitize each post and its comments
            const sanitizedPosts = parsed.posts.map((p: any, idx: number) => {
              const cleanComments = (p.injectedComments || []).map((c: string) => sanitizeTextForLinkedIn(c));
              const wordCount = (p.body || '').split(/\s+/).filter(Boolean).length;
              const episodeNum = (idx % 3) + 1;
              
              // Intelligent POV analysis from post content and generated prompt
              const fullText = `${p.title || ''} ${p.hook || ''} ${p.body || ''} ${p.cta || ''}`.toLowerCase();
              const promptLower = (p.realisticPhotoPrompt || '').toLowerCase();

              const isBrokerTopic = /broker|middleman|devil|skim|subcontractor|renting|recycled shared|margin drain|commodity|commission|60%|opex|pay per performance|cheap profits/.test(fullText) || /broker|middleman|devil|suit|predatory|boardroom|60%/.test(promptLower);
              const isScriptTopic = /script|sparring|teleprompt|classroom|ramp|objection|drill|freeze|150ms|180ms|hesitation|rookie/.test(fullText) || /sparring|teleprompter|headset|script|discard/.test(promptLower);
              const isEquityTopic = /client|equity|valuation|direct contract|enterprise|partnership|retainer|investor|multiple|\$24/.test(fullText) || /client|partnership|director|whiteboard/.test(promptLower);

              let assignedImageUrl = '/images/linkedin/broker-middleman-devil.jpg';
              let assignedPrompt = p.realisticPhotoPrompt;
              let alternativeImageUrl = '/images/linkedin/script-discard-sparring.jpg';
              let alternativeImageLabel = '⚡ Direct Outbound Engine';
              let alternativeImagePrompt = 'Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling with real-time teleprompter cues.';

              if (isBrokerTopic || idx === 0) {
                assignedImageUrl = '/images/linkedin/broker-middleman-devil.jpg';
                if (!assignedPrompt || (!assignedPrompt.toLowerCase().includes('broker') && !assignedPrompt.toLowerCase().includes('suit'))) {
                  assignedPrompt = 'A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 60% broker cut and cheap pay-per-performance terms. Chiaroscuro dramatic lighting with subtle crimson rim light.';
                }
                alternativeImageUrl = '/images/linkedin/script-discard-sparring.jpg';
                alternativeImageLabel = '⚡ Direct Outbound Engine';
                alternativeImagePrompt = 'Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling with real-time teleprompter cues.';
              } else if (isScriptTopic || idx === 1) {
                assignedImageUrl = '/images/linkedin/script-discard-sparring.jpg';
                if (!assignedPrompt || (!assignedPrompt.toLowerCase().includes('script') && !assignedPrompt.toLowerCase().includes('teleprompt') && !assignedPrompt.toLowerCase().includes('headset'))) {
                  assignedPrompt = 'Authentic candid 35mm photojournalism in a high-tech Manila BGC outbound center: An articulate young Filipino male SDR wearing an ergonomic headset, intensely engaged in live consultative calling. Dual screens display "LIVE OBJECTION TELEPROMPTER CUES - 150ms LATENCY" and real-time prospect telemetry. On the desk next to him, a crumpled static PDF script sits discarded in a recycling bin, symbolizing the transition from rigid scripts to agile voice sparring.';
                }
                alternativeImageUrl = '/images/linkedin/broker-middleman-devil.jpg';
                alternativeImageLabel = '⚠️ The Middleman Trap (60% Skim & OPEX Drain)';
                alternativeImagePrompt = 'A cinematic 35mm editorial photograph of a predatory corporate lead broker and middleman depicted as a devil in disguise: An arrogant, manipulative man in his late 40s in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom, steepled hands, wearing a calculating cynical smirk over contracts stamped with 60% margin fees.';
              } else {
                assignedImageUrl = '/images/linkedin/direct-partnership-equity.jpg';
                if (!assignedPrompt || (!assignedPrompt.toLowerCase().includes('client') && !assignedPrompt.toLowerCase().includes('partnership'))) {
                  assignedPrompt = 'A candid 35mm photograph showing the direct relationship between a foreign enterprise client and Filipino offshore talent: A senior North American client executive in a tailored navy blazer and a distinguished, articulate Filipino female BPO operations director collaborating as equal strategic partners. They stand beside a transparent glass architectural whiteboard displaying "DIRECT SEAT CONTRACT ECONOMICS • 100% EQUITY RETENTION • REVENUE VELOCITY". Authentic warm golden hour sunlight, Kodak Portra 800 tone.';
                }
                alternativeImageUrl = '/images/linkedin/broker-middleman-devil.jpg';
                alternativeImageLabel = '⚠️ The Middleman Trap (Devil in Disguise)';
                alternativeImagePrompt = 'A cinematic 35mm editorial photograph of a predatory corporate lead broker depicted as a devil in disguise: Arrogant, manipulative man in an expensive dark charcoal suit with a crimson silk pocket square, leaning back in a leather armchair in a shadowy penthouse boardroom with contracts marked 60% margin fees.';
              }

              if (!demo) {
                return {
                  id: `post-ep${idx + 1}-${Date.now()}`,
                  episodeNumber: p.episodeNumber || (idx + 1),
                  dayLabel: p.dayLabel || (idx === 0 ? 'Tuesday • Episode 1' : idx === 1 ? 'Thursday • Episode 2' : 'Friday • Episode 3'),
                  title: cleanPostText(p.title) || `Episode ${idx + 1}`,
                  hook: cleanPostText(p.hook),
                  body: cleanPostText(p.body),
                  cta: cleanPostText(p.cta),
                  wordCount,
                  estimatedReadSeconds: Math.ceil((wordCount / 200) * 60),
                  hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 5) : [],
                  imagePrompt: p.imagePrompt || '',
                  realisticPhotoPrompt: p.realisticPhotoPrompt || '',
                  visualCard: {
                    type: p.visualCard?.type || 'metric_callout',
                    headline: p.visualCard?.headline || p.title || `Episode ${idx + 1}`,
                    subheadline: p.visualCard?.subheadline || '',
                    metric: p.visualCard?.metric || '',
                    metricLabel: p.visualCard?.metricLabel || '',
                    tag: p.visualCard?.tag || `EPISODE 0${idx + 1}`
                  },
                  injectedComments: cleanComments
                };
              }

              return {
                id: `post-ep${idx + 1}-${Date.now()}`,
                episodeNumber: p.episodeNumber || (idx + 1),
                dayLabel: p.dayLabel || (idx === 0 ? 'Tuesday • Episode 1' : idx === 1 ? 'Thursday • Episode 2' : 'Friday • Episode 3'),
                title: p.title || `Episode ${idx + 1}`,
                hook: p.hook || '',
                body: p.body || '',
                cta: p.cta || '',
                wordCount,
                estimatedReadSeconds: Math.ceil((wordCount / 200) * 60),
                hashtags: Array.isArray(p.hashtags) ? p.hashtags : ['#BPOOperations', '#ClientAcquisition', '#SalesDevelopment'],
                imagePrompt: p.imagePrompt || 'Minimalist dark graphite BPO metric infographic with Swiss typography',
                realisticPhotoPrompt: assignedPrompt,
                realisticImageUrl: assignedImageUrl,
                alternativeImageUrl,
                alternativeImageLabel,
                alternativeImagePrompt,
                visualCard: {
                  type: p.visualCard?.type || 'metric_callout',
                  headline: p.visualCard?.headline || p.title || 'Operational Metric',
                  subheadline: p.visualCard?.subheadline || 'Key takeaway for outbound leaders',
                  metric: p.visualCard?.metric || '60%',
                  metricLabel: p.visualCard?.metricLabel || 'Broker margin skim vs BPO OPEX burden',
                  tag: p.visualCard?.tag || `EPISODE 0${idx + 1}`
                },
                injectedComments: cleanComments.length >= 2 ? cleanComments : [
                  'Unpopular truth: If your BPO relies on broker pay-per-performance deals, you do not own a real business. You own a rented boiler room subsidizing a middleman margin. Agree or disagree?',
                  'Brokers take home 60% while you carry 100% of the rent, workstations, and HMOs. At what point does accepting pay-per-performance become self-inflicted exploitation? Drop your thoughts below.',
                  'I already hear brokers screaming: "we absorb the sales risk." Really? When campaigns fail, who pays the agent severance and lease penalties? You or the BPO? Let us hear the defense.'
                ]
              };
            });

            const seriesResult: LinkedInSeries = !demo ? {
              seriesTitle: parsed.seriesTitle || 'Your 3-post series',
              seriesHookRecap: parsed.seriesHookRecap || '',
              targetBottleneckSummary: parsed.targetBottleneckSummary || '',
              targetAudience: parsed.targetAudience || '',
              posts: sanitizedPosts
            } : {
              seriesTitle: parsed.seriesTitle || 'The Autonomous BPO Outbound Series: Part 1-3',
              seriesHookRecap: parsed.seriesHookRecap || preset.recapHook,
              targetBottleneckSummary: parsed.targetBottleneckSummary || `Targeting ${summary.topPainPoints[0]} across ${summary.dominantHeadcount} floors`,
              targetAudience: parsed.targetAudience || 'BPO Founders and Outbound Operations Directors',
              posts: sanitizedPosts
            };

            return NextResponse.json({
              source: `gemini_${model}`,
              csvSummary: summary,
              series: seriesResult
            });
          }
        }
      } catch (modelErr) {
        console.warn(`[LinkedIn Studio] Series model ${model} attempt failed:`, modelErr);
      }
    }

    // Fallback if all attempts fail (sample series in the demo workspace only)
    if (!demo) return NextResponse.json(NO_AI, { status: 503 });
    const fallbackSeries = getDeterministicLinkedInSeries(summary, frameworkId, presetId);
    return NextResponse.json({
      source: 'deterministic_fallback',
      csvSummary: summary,
      series: fallbackSeries
    });

  } catch (error: any) {
    console.error('[API LinkedIn Studio Fatal Error]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error in LinkedIn Studio API' },
      { status: 500 }
    );
  }
}
