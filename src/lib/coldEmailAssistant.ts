/**
 * Cold email writing assistant: shared types, the framework catalogue it writes from, and the
 * hard length rule. Plain module: used by the chat panel and by /api/ai/cold-email-assistant.
 *
 * Flow: understand (2 to 4 questions) -> plan (framework, angle, beats, CTA) -> draft -> refine.
 * HARD RULE: the draft body stays UNDER 90 words, greeting, CTA and signature included.
 */
import { COLD_EMAIL_FRAMEWORKS, sanitizeColdEmail } from './coldEmailStudio';
import { DEFAULT_OUTBOUND_FRAMEWORKS, fillFrameworkText, type FrameworkFillValues } from './outboundFrameworks';

/** Body must be strictly below this many words. */
export const ASSISTANT_WORD_LIMIT = 90;
export const ASSISTANT_TARGET_WORDS = 80;
export const AUTO_FRAMEWORK_ID = 'auto';
export const MAX_QUESTIONS = 4;

export type AssistantStage = 'questions' | 'plan' | 'draft' | 'linkedin';

export interface AssistantQuestion {
  id: string;
  text: string;
  options: string[];
  /** Suggested answer already typed into the free-text box (editable). */
  prefill?: string;
}

export interface AssistantAnswer {
  question: string;
  answer: string;
}

export interface AssistantPlan {
  frameworkId: string;
  frameworkName: string;
  why: string;
  angle: string;
  beats: string[];
  ctaType: string;
  targetWords: number;
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantCampaign {
  angle: string;
  pain: string;
  proof: string;
  offer: string;
}

export interface AssistantLinkedInPost {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  wordCount: number;
}

/** What the Dialer knows after a call (post-call follow-up). */
export interface AssistantCallContext {
  outcome?: string;
  notes?: string;
  scriptStep?: string;
  objection?: string;
  agreedTime?: string;
  transcript?: string;
}

export type AssistantPurpose = 'cold' | 'followup';

export interface AssistantRequest {
  stage: AssistantStage;
  purpose?: AssistantPurpose;
  callContext?: AssistantCallContext;
  /** The rep's original idea for this email. */
  idea: string;
  /** Latest thing the rep typed (refinement or plan change). */
  message?: string;
  history?: AssistantTurn[];
  answers?: AssistantAnswer[];
  plan?: AssistantPlan;
  currentDraft?: { subject: string; body: string };
  /** LinkedIn post to mirror as an email. */
  sourcePost?: string;
  recipient?: { name?: string; company?: string; title?: string };
  sender?: { name?: string; company?: string };
  frameworkId: string;
  campaign?: AssistantCampaign;
}

export interface AssistantResponse {
  stage: AssistantStage;
  message: string;
  framework: { id: string; name: string };
  questions?: AssistantQuestion[];
  plan?: AssistantPlan;
  subject?: string;
  body?: string;
  wordCount?: number;
  /** True when the server had to cut the draft to stay under the limit. */
  trimmed?: boolean;
  /** Angle, pain, proof and offer as used in this draft (fills an empty campaign message). */
  campaign?: AssistantCampaign;
  post?: AssistantLinkedInPost;
  source: 'gemini' | 'fallback';
}

// =========================================================================
// Framework catalogue (cold email studio list, enriched with outboundFrameworks definitions)
// =========================================================================

export interface AssistantFramework {
  id: string;
  name: string;
  author: string;
  category: string;
  description: string;
  principle: string;
  steps: string;
  example?: string;
  targetWords: number;
  bestFor: string;
}

/** Cold email studio id -> richer definition in outboundFrameworks.ts */
const OUTBOUND_MATCH: Record<string, string> = {
  'braun-poke-the-bear': 'braun_poke_bear',
  'allred-50-word': 'allred_50_word',
  'voss-no-oriented': 'voss_no_oriented',
  'founder-peer-to-peer': 'founder_peer_to_peer',
};

const BEST_FOR: Record<string, string> = {
  'braun-poke-the-bear': 'first touch where the prospect may not see the problem yet; surface a hidden tension with a diagnostic question',
  'radical-transparency': 'pattern interrupt when the outreach itself is the proof of what you sell',
  'allred-50-word': 'very short first touch or busy mobile readers; one observation, one problem, one question',
  'voss-no-oriented': 'follow-ups, re-engaging quiet prospects and busy executives; a no-oriented ask that feels safe',
  'before-after-bridge': 'when there is a clear before/after the rep can state (e.g. ramp time, follow-up after a call)',
  'problem-agitate-solve': 'when the cost of the problem is clear and the rep has real numbers',
  'executive-observation': 'senior peers who want zero preamble; three crisp sentences',
  'founder-peer-to-peer': 'founder or owner to founder; operator voice, no deck, direct peer conversation',
};

const FOUNDER = DEFAULT_OUTBOUND_FRAMEWORKS.find((f) => f.id === 'founder_peer_to_peer');

export const ASSISTANT_FRAMEWORKS: AssistantFramework[] = [
  ...COLD_EMAIL_FRAMEWORKS.map((f) => {
    const rich = DEFAULT_OUTBOUND_FRAMEWORKS.find((o) => o.id === OUTBOUND_MATCH[f.id]);
    return {
      id: f.id,
      name: f.name,
      author: f.authorOrStyle,
      category: f.category,
      description: rich?.description || f.description,
      principle: rich?.antiSalesPrinciple || f.antiSalesPrinciple,
      steps: rich?.promptInstruction || f.promptInstruction,
      example: rich?.exampleSnippet,
      targetWords: Math.min(f.targetWordCount, ASSISTANT_TARGET_WORDS),
      bestFor: BEST_FOR[f.id] || f.description,
    };
  }),
  ...(FOUNDER
    ? [{
        id: 'founder-peer-to-peer',
        name: 'Founder-to-Founder Problem Ledger',
        author: 'Founder BDM',
        category: FOUNDER.category,
        description: FOUNDER.description,
        principle: FOUNDER.antiSalesPrinciple,
        steps: FOUNDER.promptInstruction,
        example: FOUNDER.exampleSnippet,
        targetWords: FOUNDER.targetWordCount,
        bestFor: BEST_FOR['founder-peer-to-peer'],
      }]
    : []),
];

export function findAssistantFramework(id: string | undefined): AssistantFramework | undefined {
  return ASSISTANT_FRAMEWORKS.find((f) => f.id === id);
}

export function frameworkLabel(id: string | undefined): string {
  if (!id || id === AUTO_FRAMEWORK_ID) return 'Auto (best fit)';
  return findAssistantFramework(id)?.name || 'Auto (best fit)';
}

/** "use Chris Voss", "try PAS": the framework a refinement asks for, if any. */
export function detectFrameworkMention(text: string): string | undefined {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/\bvoss\b|no[- ]oriented/, 'voss-no-oriented'],
    [/\bbraun\b|poke the bear|\b4t\b/, 'braun-poke-the-bear'],
    [/\ballred\b|lavender|50[- ]word/, 'allred-50-word'],
    [/before[- ]after|\bbab\b/, 'before-after-bridge'],
    [/problem[- ]agitate|\bpas\b/, 'problem-agitate-solve'],
    [/radical transparency|meta[- ]proof/, 'radical-transparency'],
    [/founder[- ]to[- ]founder|peer[- ]to[- ]peer ledger|problem ledger/, 'founder-peer-to-peer'],
    [/direct observation|3[- ]sentence/, 'executive-observation'],
  ];
  return rules.find(([re]) => re.test(t))?.[1];
}

/** Framework definition with the recipient and sender filled in, for the prompt. */
export function frameworkBrief(f: AssistantFramework, values: FrameworkFillValues): string {
  const fill = (s: string) => fillFrameworkText(s, values);
  return [
    `Name: ${f.name} (${f.author}), ${f.category}`,
    `What it is: ${fill(f.description)}`,
    `Principle: ${fill(f.principle)}`,
    `Steps (they define the STRUCTURE only; any numbers, durations, industries, tools, competitors or pains inside them are illustrations, NOT facts about this recipient: replace them with the rep's own facts or leave them out):\n${fill(f.steps)}`,
    f.example
      ? `Example (shows rhythm and structure ONLY. Its people, companies, numbers, tools and competitors are fictional: never reuse any of them):\n"""\n${fill(f.example)}\n"""`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// =========================================================================
// Word count, subject and the hard length rule
// =========================================================================

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const SIGN_OFF = /^(best|thanks|thank you|cheers|regards|kind regards|best regards|all the best|talk soon|warmly|appreciate it)\b[^\n]{0,20}$/i;
const GREETING = /^(hi|hey|hello|dear|morning|afternoon)\b/i;

/** Lowercase, 2 to 4 words, no punctuation or clickbait. */
export function normalizeSubject(raw: string): string {
  const words = (raw || '')
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-z0-9&'\s-]/g, ' ')
    .replace(/\b(free|urgent|guaranteed|act now|limited time)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return 'quick question';
  if (words.length === 1) return `${words[0]} question`;
  return words.join(' ');
}

/** Remove pleasantries the style rules forbid, em dashes and emojis. */
export function cleanBody(raw: string): string {
  const stripped = (raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*subject:.*\n+/i, '')
    .replace(/\bI hope (this|you|your)[^.!?\n]*[.!?]\s*/gi, '')
    .replace(/\bI(?:'m| am) reaching out (because|to)[^.!?\n]*[.!?]\s*/gi, '')
    .replace(/[ \t]+\n/g, '\n');
  return sanitizeColdEmail(stripped).cleanText;
}

/** Make sure the body ends with a sign-off carrying the sender's name. */
export function ensureSignature(body: string, senderName: string): string {
  const name = senderName.trim();
  if (!name) return body.trim();
  const first = name.split(/\s+/)[0].toLowerCase();
  const lines = body.trim().split('\n').map((l) => l.trim());
  const tail = lines.slice(-3).join(' ').toLowerCase();
  if (tail.includes(first)) return body.trim();
  return `${body.trim()}\n\nBest,\n${name.split(/\s+/)[0]}`;
}

interface Parts {
  greeting: string;
  middle: string[][]; // paragraphs of sentences
  cta: string;
  signature: string;
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .replace(/\s*\n\s*/g, ' ')
    .split(/(?<=[.?!])\s+(?=["'(]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitParts(body: string): Parts {
  const paragraphs = body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let signature = '';
  // Sign-off: from the paragraph that starts with "Best," (or a lone short name line) to the end.
  for (let i = paragraphs.length - 1; i >= 1; i--) {
    const firstLine = paragraphs[i].split('\n')[0].trim();
    if (SIGN_OFF.test(firstLine)) {
      signature = paragraphs.slice(i).join('\n\n');
      paragraphs.splice(i);
      break;
    }
  }
  if (!signature && paragraphs.length > 1) {
    const last = paragraphs[paragraphs.length - 1];
    if (countWords(last) <= 4 && !/[?]/.test(last)) signature = paragraphs.pop() as string;
  }
  // A sign-off glued to the end of the last paragraph ("...? \nBest,\nEmil").
  if (!signature && paragraphs.length > 0) {
    const lines = paragraphs[paragraphs.length - 1].split('\n');
    const idx = lines.findIndex((l, i) => i > 0 && SIGN_OFF.test(l.trim()));
    if (idx > 0) {
      signature = lines.slice(idx).join('\n');
      paragraphs[paragraphs.length - 1] = lines.slice(0, idx).join('\n');
    }
  }

  let greeting = '';
  if (paragraphs.length > 1 && GREETING.test(paragraphs[0]) && countWords(paragraphs[0]) <= 5) {
    greeting = paragraphs.shift() as string;
  } else if (paragraphs.length > 0) {
    const m = paragraphs[0].match(/^((?:hi|hey|hello|dear)\s+[^,\n]{1,40},)\s*/i);
    if (m) {
      greeting = m[1];
      paragraphs[0] = paragraphs[0].slice(m[0].length);
    }
  }

  const middle = paragraphs.map(splitSentences).filter((p) => p.length > 0);
  // CTA: the last question, else the last sentence.
  let cta = '';
  for (let p = middle.length - 1; p >= 0 && !cta; p--) {
    for (let s = middle[p].length - 1; s >= 0; s--) {
      if (middle[p][s].endsWith('?')) {
        cta = middle[p][s];
        middle[p].splice(s, 1);
        break;
      }
    }
  }
  if (!cta && middle.length > 0) {
    const lastP = middle[middle.length - 1];
    cta = lastP.pop() || '';
  }
  return { greeting, middle: middle.filter((p) => p.length > 0), cta, signature };
}

function joinParts(p: Parts): string {
  return [p.greeting, ...p.middle.map((s) => s.join(' ')), p.cta, p.signature]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Deterministic last resort: drop whole sentences from the end of the middle (never the CTA or
 * the signature) until the body is under the limit; then shorten the signature, drop the greeting,
 * and only then cut words from the middle.
 */
export function enforceWordLimit(body: string, limit = ASSISTANT_WORD_LIMIT): { body: string; trimmed: boolean } {
  if (countWords(body) < limit) return { body, trimmed: false };
  const parts = splitParts(body);
  const total = () => countWords(joinParts(parts));

  // Keep the opening line and the value line (last before the CTA) longest: drop the sentences
  // between them first, from the back, then the value line, then the opener.
  while (total() >= limit) {
    const flat = parts.middle.flatMap((p, pi) => p.map((_, si) => [pi, si] as const));
    if (flat.length <= 1) break;
    const n = flat.length;
    const order = [...Array.from({ length: Math.max(0, n - 2) }, (_, k) => n - 2 - k), n - 1, 0];
    const [pi, si] = flat[order[0]];
    parts.middle[pi].splice(si, 1);
    parts.middle = parts.middle.filter((p) => p.length > 0);
  }
  if (total() >= limit && parts.signature) {
    const lines = parts.signature.split('\n').map((l) => l.trim()).filter(Boolean);
    parts.signature = lines.slice(0, 2).join('\n');
  }
  if (total() >= limit && parts.greeting) parts.greeting = '';
  if (total() >= limit && parts.middle.length > 0) {
    const fixed = countWords([parts.cta, parts.signature].join(' '));
    const room = Math.max(0, limit - 1 - fixed);
    const words = parts.middle.flat().join(' ').split(/\s+/).filter(Boolean).slice(0, room);
    parts.middle = words.length > 0 ? [[`${words.join(' ').replace(/[,;:]$/, '')}.`]] : [];
  }
  if (total() >= limit) {
    // CTA alone is too long: keep its end (the question) within the room left.
    const room = Math.max(4, limit - 1 - countWords(parts.signature));
    const words = parts.cta.split(/\s+/).filter(Boolean);
    parts.cta = words.slice(-room).join(' ');
    parts.middle = [];
  }
  return { body: joinParts(parts), trimmed: true };
}

export type OutcomeKind = 'booked' | 'callback' | 'not_interested' | 'no_connect' | 'other';

/** Map a Dialer outcome label ("Booked: Qualified Demo", "Callback Scheduled"...) to its kind. */
export function outcomeKind(outcome: string | undefined): OutcomeKind {
  const o = (outcome || '').toLowerCase();
  if (!o) return 'other';
  if (/not interested|dnc|opt-out|no budget/.test(o)) return 'not_interested';
  if (/book|meeting|demo/.test(o)) return 'booked';
  if (/callback|call back|follow-up required|send calendar|interested/.test(o)) return 'callback';
  if (/voicemail|no answer|gatekeeper|wrong number|busy/.test(o)) return 'no_connect';
  return 'other';
}

/** Text of the campaign message for prompts. */
export function campaignBrief(c: AssistantCampaign | undefined): string {
  if (!c) return 'None set.';
  const lines = [
    c.angle?.trim() && `- Angle: ${c.angle.trim()}`,
    c.pain?.trim() && `- Core pain: ${c.pain.trim()}`,
    c.proof?.trim() && `- Proof point(s): ${c.proof.trim()}`,
    c.offer?.trim() && `- Offer / CTA: ${c.offer.trim()}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : 'None set.';
}

/** Swap the email's closing question (CTA) and keep the greeting, paragraphs and signature. */
export function replaceClosingLine(body: string, cta: string): string {
  if (!body.trim()) return cta;
  const parts = splitParts(body);
  parts.cta = cta.trim();
  return joinParts(parts);
}
