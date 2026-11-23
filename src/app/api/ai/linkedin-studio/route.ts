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
import { contentSystemPost } from '@/lib/linkedinStudio';
import {
  LINKEDIN_AUDIENCE,
  LINKEDIN_COMMENT_VOICE_RULES,
  LINKEDIN_PILLARS,
  auditStudioPost,
  buildOwnerSeriesPrompt,
  buildRetryNote,
  joinCommentHashtags,
  splitCommentHashtags,
} from '@/lib/linkedinContentSystem';
import { isLocalTestServer } from '@/lib/server/agreements/mail';

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

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];

/**
 * Where the model calls go. Test only: on a local test server (file store, no production credential
 * or Railway marker: isLocalTestServer) LINKEDIN_AI_TEST_BASE_URL may point at a loopback stand-in so
 * the regression suite can read the outgoing prompt and script the reply. Anywhere else, and for any
 * non-loopback value, it is ignored.
 */
function geminiBase(): string {
  const test = (process.env.LINKEDIN_AI_TEST_BASE_URL || '').trim();
  if (test && isLocalTestServer() && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(test)) return test;
  return GEMINI_BASE;
}

/*
 * Appointmentlyy (owner) workspace series: written by the LinkedIn Content System
 * (src/lib/linkedinContentSystem.ts). Five posts, Monday to Friday, one per pillar, three comments each.
 */
type OwnerDraft = { title: string; posts: ReturnType<typeof contentSystemPost>[] };

/** Straight quotes and tidy line breaks only. Dashes and bullets are left in place so the rules can catch them. */
function plainModelText(v: unknown, max: number): string {
  return (typeof v === 'string' ? v : '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, max)
    .trim();
}

/** One model reply in the tool's existing post shape, each post checked against the content rules. */
function mapOwnerDraft(parsed: any): OwnerDraft | null {
  if (!parsed || !Array.isArray(parsed.posts) || parsed.posts.length === 0) return null;
  const stamp = Date.now();
  const posts = parsed.posts.slice(0, 5).map((p: any, idx: number) => {
    const slot = LINKEDIN_PILLARS[idx];
    const comments: string[] = (Array.isArray(p?.comments) ? p.comments : []).slice(0, 5).map((c: any) => {
      // The comment text may already end with its hashtags: keep one set, at the end.
      const fromText = splitCommentHashtags(plainModelText(typeof c === 'string' ? c : c?.text, 600));
      const listed: string[] = (Array.isArray(c?.hashtags) ? c.hashtags : [])
        .filter((h: unknown): h is string => typeof h === 'string' && h.trim().length > 0)
        .slice(0, 6)
        .map((h: string) => `#${h.replace(/[#\s]/g, '').slice(0, 40)}`);
      return joinCommentHashtags({ text: fromText.text, hashtags: listed.length > 0 ? listed : fromText.hashtags });
    });
    const parts = {
      hook: plainModelText(p?.scene ?? p?.hook, 400),
      body: plainModelText(p?.body, 1500),
      cta: plainModelText(p?.ask ?? p?.cta, 300),
    };
    return contentSystemPost({
      id: `post-ep${idx + 1}-${stamp}`,
      episodeNumber: idx + 1,
      day: slot.day,
      pillar: slot.pillar,
      title: plainModelText(p?.title, 120) || slot.pillar,
      ...parts,
      comments,
      swapNote: plainModelText(p?.swap_notes ?? p?.swapNote, 300) || 'Check every name, number and detail is real before posting.',
      issues: auditStudioPost({ ...parts, injectedComments: comments }),
    });
  });
  return { title: plainModelText(parsed.seriesTitle, 120), posts };
}

/** Ask the model once (first candidate model that answers with usable JSON). Null when none does. */
async function askOwnerSeries(prompt: string, apiKey: string): Promise<{ draft: OwnerDraft; model: string } | null> {
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`${geminiBase()}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const draft = mapOwnerDraft(JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim()));
      if (draft) return { draft, model };
    } catch (modelErr) {
      console.warn(`[LinkedIn Studio] Owner series model ${model} attempt failed:`, modelErr);
    }
  }
  return null;
}

const brokenPosts = (d: OwnerDraft) => d.posts.filter((p) => (p.issues || []).length > 0);
/** A draft is complete when it has all 5 weekday posts and none breaks a rule. */
const needsRetry = (d: OwnerDraft) => d.posts.length < 5 || brokenPosts(d).length > 0;

/**
 * Write the owner-workspace series: one attempt, the rules checked on the server, and ONE retry when any
 * post breaks a rule (or a weekday is missing). Posts that still fail come back with their issues listed.
 */
async function writeOwnerSeries(prompt: string, apiKey: string): Promise<{ draft: OwnerDraft; model: string } | null> {
  const first = await askOwnerSeries(prompt, apiKey);
  if (!first || !needsRetry(first.draft)) return first;
  const problems = brokenPosts(first.draft).map((p) => ({ day: p.dayLabel.split('•')[0].trim(), issues: p.issues || [] }));
  if (first.draft.posts.length < 5) problems.push({ day: 'Whole week', issues: ['exactly 5 posts, Monday to Friday'] });
  const second = await askOwnerSeries(prompt + buildRetryNote(problems), apiKey);
  if (!second) return first;
  // Keep the better of the two: the full week first, then fewer rule-breaking posts (the retry wins a tie).
  const score = (d: OwnerDraft) => (5 - d.posts.length) * 10 + brokenPosts(d).length;
  return score(second.draft) <= score(first.draft) ? second : first;
}

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
  // Live session check (not just a signed cookie): removed members and suspended workspaces stop here.
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  try {
    const payload: LinkedInStudioPayload = await req.json();
    const { action = 'generate_series' } = payload;
    const googleApiKey = process.env.GOOGLE_API_KEY;
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
6. ${LINKEDIN_COMMENT_VOICE_RULES}

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
          const endpoint = `${geminiBase()}/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
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
5. ${LINKEDIN_COMMENT_VOICE_RULES}

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
          const endpoint = `${geminiBase()}/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
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

    // Appointmentlyy (owner) workspace: the LinkedIn Content System writes the series (5 posts, Monday to
    // Friday, one per pillar). The story and campaign text go in as fenced untrusted data, the rules are checked
    // here on the server, and a draft that breaks one is retried once. Client workspaces never take this branch.
    if (demo) {
      const author = { name: session.name || '', role: session.isPlatformAdmin ? 'founder' : session.role };
      const written = await writeOwnerSeries(buildOwnerSeriesPrompt({ author, story: userRawIdea, campaignBrief: campaignBrief(campaign) }), googleApiKey);
      if (written) {
        const ownerSeries: LinkedInSeries = {
          seriesTitle: written.draft.title || 'This week: Monday to Friday',
          seriesHookRecap: '',
          targetBottleneckSummary: 'One short true story per pillar, Monday to Friday.',
          targetAudience: LINKEDIN_AUDIENCE,
          posts: written.draft.posts,
        };
        return NextResponse.json({ source: `gemini_${written.model}`, csvSummary: summary, series: ownerSeries });
      }
      // No usable reply from any model: the built-in posts for the selected week.
      return NextResponse.json({
        source: 'deterministic_fallback',
        csvSummary: summary,
        series: getDeterministicLinkedInSeries(summary, frameworkId, presetId)
      });
    }

    // Client workspaces from here on (demo is false below; the demo-only mapping further down is no longer reached).
    const seriesPrompt = clientSeriesPrompt(userRawIdea, campaign, summary, framework, sender);

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash'
    ];

    for (const model of candidateModels) {
      try {
        const endpoint = `${geminiBase()}/v1beta/models/${model}:generateContent?key=${googleApiKey}`;
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
