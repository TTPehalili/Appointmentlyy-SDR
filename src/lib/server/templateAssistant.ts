/**
 * The writing assistant's 'template' purpose (used by /api/ai/cold-email-assistant): reusable
 * library copy written with {{merge_fields}} instead of one prospect's details. Same flow and rules
 * as cold emails (questions -> plan -> draft, framework-aware, anti-sales, under 90 words), and it
 * can draft a whole sequence (several emails plus a breakup) as separate templates in a campaign.
 */
import { sanitizeColdEmail } from '@/lib/coldEmailStudio';
import {
  ASSISTANT_FRAMEWORKS,
  ASSISTANT_STYLE_RULES,
  ASSISTANT_TARGET_WORDS,
  ASSISTANT_WORD_LIMIT,
  AUTO_FRAMEWORK_ID,
  MAX_QUESTIONS,
  MAX_SEQUENCE_BEATS,
  campaignBrief,
  cleanBody,
  countWords,
  detectFrameworkMention,
  enforceWordLimit,
  ensureSignature,
  findAssistantFramework,
  frameworkBrief,
  outcomeKind,
  type AssistantFramework,
  type AssistantPlan,
  type AssistantQuestion,
  type AssistantRequest,
  type AssistantResponse,
  type AssistantSequenceEmail,
  type AssistantTemplateKind,
  type OutcomeKind,
} from '@/lib/coldEmailAssistant';

type Json = Record<string, unknown>;
/** The route's model call (Gemini with fallbacks), passed in so this module stays prompt-only. */
export type AskModel = (prompt: string, temperature?: number) => Promise<Json | null>;

const KINDS: AssistantTemplateKind[] = ['cold', 'followup', 'sequence', 'breakup', 'reply'];
export const parseTemplateKind = (v: unknown): AssistantTemplateKind | undefined =>
  KINDS.includes(v as AssistantTemplateKind) ? (v as AssistantTemplateKind) : undefined;

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const fw = (f: AssistantFramework) => ({ id: f.id, name: f.name });
const AUTO = { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' };

const SENDER_TOKEN = '{{sender_name}}';
const MERGE_VALUES = {
  firstName: '{{first_name}}',
  fullName: '{{first_name}}',
  company: '{{company}}',
  title: '{{title}}',
  senderName: SENDER_TOKEN,
  senderCompany: '{{sender_company}}',
};

// ---------------------------------------------------------------------------
// What is being drafted
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };

export interface SequenceSpec {
  /** Regular emails before the breakup. */
  emails: number;
  breakup: boolean;
}

/** "3-step cold sequence", "4 emails + breakup", "sequence without a breakup". */
export function detectSequence(text: string): SequenceSpec | null {
  const t = text.toLowerCase();
  const m = t.match(/\b(\d|two|three|four|five|six)[\s-]*(step|email|touch|part|mail)s?\b/);
  const count = m ? (NUMBER_WORDS[m[1]] ?? Number(m[1])) : 0;
  const isSeq =
    /\bsequence|\bcadence|\bdrip\b/.test(t) ||
    (count >= 2 && /step|touch|part/.test(m?.[2] || '')) ||
    (count >= 2 && /break ?-?up/.test(t));
  if (!isSeq) return null;
  const n = count >= 1 ? count : 3;
  const noBreakup = /\bno break ?-?up|without (?:a )?break ?-?up/.test(t);
  const includesBreakup = /includ\w* (?:a |the )?break ?-?up/.test(t);
  const emails = Math.max(1, Math.min(5, includesBreakup ? n - 1 : n));
  return { emails, breakup: !noBreakup };
}

function ideaText(r: AssistantRequest) {
  return `${r.idea} ${r.message || ''} ${(r.answers || []).map((a) => a.answer).join(' ')}`;
}

function sequenceSpec(r: AssistantRequest): SequenceSpec | null {
  if (r.currentSequence && r.currentSequence.length > 1) {
    const breakups = r.currentSequence.filter((e) => e.purpose === 'breakup').length;
    return { emails: Math.max(1, r.currentSequence.length - breakups), breakup: breakups > 0 };
  }
  const detected = detectSequence(ideaText(r));
  if (detected) return detected;
  if (r.templateKind === 'sequence') return { emails: 3, breakup: true };
  // A plan with several "Email n" beats came from a sequence plan.
  const planEmails = (r.plan?.beats || []).filter((b) => /^(email \d|breakup)/i.test(b));
  if (planEmails.length > 1) {
    const breakup = planEmails.some((b) => /^breakup/i.test(b));
    return { emails: planEmails.length - (breakup ? 1 : 0), breakup };
  }
  return null;
}

function singleKind(r: AssistantRequest): AssistantTemplateKind {
  const t = ideaText(r).toLowerCase();
  if (/\bbreak ?-?up\b|last email|final email|closing the loop/.test(t)) return 'breakup';
  if (/follow[\s-]?up|after (?:the|a|our) call|post[\s-]call|\bbooked\b|callback|call back|not interested/.test(t)) return 'followup';
  if (/\breply\b|\brespond|answer (?:a|their) question|when they ask/.test(t)) return 'reply';
  if (r.templateKind && r.templateKind !== 'sequence') return r.templateKind;
  return 'cold';
}

function templateOutcome(r: AssistantRequest): OutcomeKind {
  const t = ideaText(r).toLowerCase();
  if (/not interested|no thanks|said no/.test(t)) return 'not_interested';
  if (/\bbooked\b|meeting (?:is )?(?:set|booked)|confirm(?:ing)? (?:the )?meeting|demo booked/.test(t)) return 'booked';
  if (/callback|call back|call them back/.test(t)) return 'callback';
  if (/voicemail|no answer|gatekeeper/.test(t)) return 'no_connect';
  return outcomeKind('');
}

const OUTCOME_TAG: Partial<Record<OutcomeKind, string>> = {
  booked: 'Booked',
  callback: 'Callback',
  not_interested: 'Not interested',
  no_connect: 'No answer',
};

// ---------------------------------------------------------------------------
// Prompt pieces
// ---------------------------------------------------------------------------

const TEMPLATE_RULES = `THIS IS A REUSABLE TEMPLATE for the team's library, not an email to one person. Many reps will send it to many prospects.
- Write for the AUDIENCE described in the idea and answers (industry, role, situation). Never name a specific person, company, customer or product that the rep did not give.
- Personalise ONLY with these merge fields, typed exactly like this with double curly braces: {{first_name}}, {{company}}, {{title}}, {{sender_name}}, {{sender_company}}. Use {{meeting_time}} only in a follow-up for a booked meeting and {{callback_time}} only in a follow-up for a callback. Never invent other merge fields and never use [brackets].
- Greeting: "Hi {{first_name}}," on its own line. Sign-off: "Best,\\n{{sender_name}}". Use {{company}} at least once where it reads naturally.
- Merge fields count as one word each.`;

function kindRule(kind: AssistantTemplateKind, outcome: OutcomeKind): string {
  switch (kind) {
    case 'followup':
      if (outcome === 'booked') return 'TEMPLATE TYPE: post-call follow-up for a BOOKED meeting. Thank them for the call, confirm the meeting is set for {{meeting_time}} and that the calendar invite is on its way, one line on what you will cover and why it matters. CTA softly confirms (e.g. "Anyone else worth adding to the invite?").';
      if (outcome === 'callback') return 'TEMPLATE TYPE: post-call follow-up for a CALLBACK. Thank them, confirm you will call back {{callback_time}}, give ONE useful point for their world. CTA is a light question (e.g. "Anything you want me to bring to that call?").';
      if (outcome === 'not_interested') return 'TEMPLATE TYPE: post-call follow-up after NOT INTERESTED. Gracious and brief, no pitch, leave the door softly open. CTA is a soft door-open question (e.g. "Mind if I check back next quarter?").';
      if (outcome === 'no_connect') return 'TEMPLATE TYPE: follow-up after a call that did not connect (voicemail or no answer): you tried to reach them, one line on why, one low-pressure question.';
      return 'TEMPLATE TYPE: post-call follow-up. A quick thank-you for the call, one line of next steps, one low-pressure question. Do not invent what was discussed.';
    case 'breakup':
      return 'TEMPLATE TYPE: breakup email (the last email of a sequence that got no reply). Short, warm, no guilt. Assume it is not a priority, leave the door open, end with one no-oriented question (e.g. "Have you given up on fixing X?").';
    case 'reply':
      return 'TEMPLATE TYPE: reply to a common prospect question or objection named in the idea. Answer it plainly and honestly in one or two sentences without inventing prices or facts, then one low-pressure question.';
    case 'sequence':
    case 'cold':
    default:
      return 'TEMPLATE TYPE: cold first touch.';
  }
}

function contextBlock(r: AssistantRequest): string {
  const lines = [
    `REP'S IDEA FOR THE TEMPLATE: "${r.idea || '(none yet)'}"`,
    `CAMPAIGN MESSAGE (stay consistent with it: same terminology, same pain, same proof, numbers only as given):\n${campaignBrief(r.campaign)}`,
  ];
  if (r.answers && r.answers.length > 0) {
    lines.push(`REP'S ANSWERS TO YOUR QUESTIONS:\n${r.answers.map((a) => `- ${a.question} -> ${a.answer}`).join('\n')}`);
  }
  if (r.history && r.history.length > 0) {
    lines.push(`CONVERSATION SO FAR (oldest first):\n${r.history.map((t) => `${t.role === 'user' ? 'Rep' : 'You'}: ${t.text}`).join('\n')}`);
  }
  return lines.join('\n\n');
}

function catalogue(): string {
  return ASSISTANT_FRAMEWORKS.map((f) => `- id "${f.id}": ${f.name}. Best for: ${f.bestFor}.`).join('\n');
}

function resolveFramework(r: AssistantRequest, preferred?: string): AssistantFramework | undefined {
  const mentioned = r.message ? detectFrameworkMention(r.message) : undefined;
  return (
    findAssistantFramework(mentioned) ||
    findAssistantFramework(preferred) ||
    findAssistantFramework(r.plan?.frameworkId) ||
    findAssistantFramework(r.frameworkId)
  );
}

function fallbackFramework(kind: AssistantTemplateKind): AssistantFramework {
  const id = kind === 'followup' || kind === 'breakup' || kind === 'reply' ? 'voss-no-oriented' : 'braun-poke-the-bear';
  return findAssistantFramework(id) || ASSISTANT_FRAMEWORKS[0];
}

function frameworkSection(f: AssistantFramework | undefined, sequence: boolean): string {
  if (f) return `FRAMEWORK (follow its structure faithfully${sequence ? ' in every email' : ''}):\n${frameworkBrief(f, MERGE_VALUES)}`;
  return `FRAMEWORK: pick the single best fit${sequence ? ' for EACH email (they may differ; a breakup suits "voss-no-oriented")' : ''} from this catalogue, follow its structure, and return its id:\n${catalogue()}`;
}

/** Suggested waits between emails (days after the previous one). */
const WAITS = [0, 3, 4, 5, 6, 7];

// ---------------------------------------------------------------------------
// Merge-field and subject hygiene
// ---------------------------------------------------------------------------

const TOKEN_ALIASES: Record<string, string> = {
  first_name: 'first_name', firstname: 'first_name', first: 'first_name', name: 'first_name', prospect_name: 'first_name', contact_name: 'first_name',
  company: 'company', company_name: 'company', companyname: 'company', their_company: 'company', account: 'company',
  title: 'title', job_title: 'title', role: 'title', position: 'title',
  sender_name: 'sender_name', your_name: 'sender_name', sender: 'sender_name', rep_name: 'sender_name', my_name: 'sender_name',
  sender_company: 'sender_company', your_company: 'sender_company', my_company: 'sender_company', company_sender: 'sender_company',
  meeting_time: 'meeting_time', meeting: 'meeting_time', meeting_date: 'meeting_time', agreed_time: 'meeting_time',
  callback_time: 'callback_time', callback: 'callback_time', call_back_time: 'callback_time',
};

const BRACKET_ALIASES: [RegExp, string][] = [
  [/\[(?:first name|prospect first name|name|prospect name)\]/gi, '{{first_name}}'],
  [/\[(?:company|company name|their company|prospect company)\]/gi, '{{company}}'],
  [/\[(?:title|job title|their role|role)\]/gi, '{{title}}'],
  [/\[(?:your name|sender name|rep name)\]/gi, '{{sender_name}}'],
  [/\[(?:your company|sender company)\]/gi, '{{sender_company}}'],
  [/\[(?:meeting time|time|date and time)\]/gi, '{{meeting_time}}'],
  [/\[(?:callback time)\]/gi, '{{callback_time}}'],
];

/** "{{ First_Name }}" -> "{{first_name}}", "[Company]" -> "{{company}}", common aliases mapped. */
export function normalizeMergeFields(text: string): string {
  const swapped = BRACKET_ALIASES.reduce((t, [re, to]) => t.replace(re, to), text);
  return swapped.replace(/\{\{\s*([a-zA-Z_ ]+?)\s*\}\}/g, (whole, raw: string) => {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
    const mapped = TOKEN_ALIASES[key];
    return mapped ? `{{${mapped}}}` : whole;
  });
}

/** Lowercase, 2 to 6 words, merge fields kept intact, no clickbait. */
export function normalizeTemplateSubject(raw: string, fallback: string): string {
  const norm = normalizeMergeFields(raw || '').replace(/^(re|fwd?):\s*/i, '');
  const parts = norm.split(/(\{\{[a-z_]+\}\})/g);
  const cleaned = parts
    .map((p) =>
      /^\{\{[a-z_]+\}\}$/.test(p)
        ? p
        : p
            .toLowerCase()
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
            .replace(/[^a-z0-9&',\s-]/g, ' ')
            .replace(/\b(free|urgent|guaranteed|act now|limited time)\b/g, ' '),
    )
    .join('')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
    .replace(/,(?=.*,)/g, '')
    .replace(/^,|,$/g, '')
    .trim();
  return countWords(cleaned) >= 2 ? cleaned : fallback;
}

function finishBody(raw: string): string {
  const body = ensureSignature(cleanBody(normalizeMergeFields(raw)), SENDER_TOKEN);
  // Greeting with the merge field when the model wrote a generic one.
  return body.replace(/^(hi|hey|hello)\s+(there|team|friend)\s*,/i, 'Hi {{first_name}},');
}

function shortName(subject: string, kind: AssistantTemplateKind): string {
  const words = subject.replace(/\{\{([a-z_]+)\}\}/g, '$1').replace(/_/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  const label = kind === 'followup' ? 'Follow-up' : kind === 'breakup' ? 'Breakup' : kind === 'reply' ? 'Reply' : 'Cold';
  return `${label}: ${words || 'new template'}`.slice(0, 80);
}

// ---------------------------------------------------------------------------
// Stage: questions
// ---------------------------------------------------------------------------

function normalizeQuestions(raw: unknown): AssistantQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((q, i) => {
      const o = (q && typeof q === 'object' ? q : {}) as Json;
      const text = s(o.text, 160);
      const id = (s(o.id, 30) || `q${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '') || `q${i + 1}`;
      const options = (Array.isArray(o.options) ? o.options : []).map((x) => s(x, 60)).filter(Boolean).slice(0, 4);
      return { id: seen.has(id) ? `${id}${i}` : (seen.add(id), id), text, options };
    })
    .filter((q) => q.text)
    .slice(0, MAX_QUESTIONS);
}

function fallbackQuestions(r: AssistantRequest, seq: SequenceSpec | null): AssistantQuestion[] {
  const idea = r.idea.toLowerCase();
  const qs: AssistantQuestion[] = [];
  if (idea.split(/\s+/).length < 6) {
    qs.push({ id: 'audience', text: 'Who is this for (industry and role)?', options: ['Owners and founders', 'Operations leaders', 'Sales leaders'] });
  }
  if (!r.campaign?.pain) qs.push({ id: 'pain', text: 'Which pain or trigger should it lead with?', options: [] });
  if (!r.campaign?.proof && !/\d/.test(idea)) qs.push({ id: 'proof', text: 'Any proof or numbers I can use?', options: ['No numbers, keep it qualitative'] });
  if (seq) qs.push({ id: 'goal', text: 'What should the sequence get you?', options: ['A reply', 'A short call', 'OK to send a video'] });
  if (qs.length < 2) qs.push({ id: 'tone', text: 'Which tone?', options: ['Calm and curious', 'Direct and brief', 'Warm and personal'] });
  return qs.slice(0, MAX_QUESTIONS);
}

export async function templateQuestionsStage(r: AssistantRequest, ask: AskModel): Promise<AssistantResponse> {
  const selected = findAssistantFramework(r.frameworkId);
  const seq = sequenceSpec(r);
  const what = seq ? `a ${seq.emails}-email sequence${seq.breakup ? ' plus a breakup email' : ''}` : `one ${singleKind(r)} template`;
  const prompt = `You are a calm, senior cold-email writing partner helping a B2B sales manager build reusable email templates. You plan before you write.

${contextBlock(r)}

THE REP WANTS: ${what}.
FRAMEWORK: ${selected ? selected.name : 'Auto: you will pick the best fit later'}

STEP NOW: UNDERSTAND. Ask 2 to 4 short questions, all at once, ONLY about things that are essential and NOT already known from the idea or the campaign message. This is a template for many prospects, so never ask about one specific person. Topics, in priority order:
1. The audience (industry, role, company size or situation)
2. The goal (a reply, a short call, permission to send something)
3. Which pain or trigger to lead with
4. Any proof or numbers to use
5. Tone
Skip every topic that is already answered. If nothing essential is missing, return an empty "questions" array.
Each question: at most 12 words. Give 2 to 4 tappable answer options (each at most 6 words) that are plausible answers drawn from the idea. Options must never contain invented numbers or names; for the proof question offer options like "No numbers, keep it qualitative".

Return JSON only:
{"message": "one short friendly sentence", "questions": [{"id": "audience|goal|pain|proof|tone", "text": "...", "options": ["...", "..."]}]}`;
  const out = await ask(prompt, 0.4);
  if (out) {
    const questions = normalizeQuestions(out.questions);
    if (questions.length === 0) return templatePlanStage(r, ask, 'I have what I need. Here is the plan:');
    return { stage: 'questions', message: s(out.message, 200) || 'A few quick questions so the template lands:', questions, framework: selected ? fw(selected) : AUTO, source: 'gemini' };
  }
  return { stage: 'questions', message: 'A few quick questions so the template lands:', questions: fallbackQuestions(r, seq), framework: selected ? fw(selected) : AUTO, source: 'fallback' };
}

// ---------------------------------------------------------------------------
// Stage: plan
// ---------------------------------------------------------------------------

function sequenceBeatsRule(seq: SequenceSpec): string {
  const labels = [...Array.from({ length: seq.emails }, (_, i) => `"Email ${i + 1}: <its one idea and CTA style>"`), ...(seq.breakup ? ['"Breakup: <how it closes the loop>"'] : [])];
  return `exactly ${labels.length} beats, one per email, in this order: ${labels.join(', ')}. Each under 18 words. Every email has ONE idea and a different angle or proof; never repeat the same email.`;
}

function fallbackPlan(r: AssistantRequest, seq: SequenceSpec | null): AssistantPlan {
  const kind = seq ? 'sequence' : singleKind(r);
  const f = resolveFramework(r) || fallbackFramework(kind);
  const pain = r.campaign?.pain || 'the problem behind the idea';
  if (seq) {
    const beats = [
      ...Array.from({ length: seq.emails }, (_, i) =>
        i === 0 ? `Email 1: name the pain (${pain}) with a diagnostic question` : i === 1 ? 'Email 2: a different angle on the same pain, no-oriented question' : `Email ${i + 1}: show the before and after, permission-based question`,
      ),
      ...(seq.breakup ? ['Breakup: assume it is not a priority, leave the door open'] : []),
    ];
    return { frameworkId: f.id, frameworkName: f.name, why: 'One idea per email, each with a fresh angle.', angle: r.campaign?.angle || r.idea.slice(0, 160), beats, ctaType: 'Interest-based question', targetWords: ASSISTANT_TARGET_WORDS, campaignName: campaignNameFrom(r.idea) };
  }
  return {
    frameworkId: f.id,
    frameworkName: f.name,
    why: `Best fit for ${f.bestFor.split(';')[0]}.`,
    angle: r.campaign?.angle || r.idea.slice(0, 160),
    beats: ['Hook: an observation about their world', `Pain: ${pain}`, `Value: ${r.campaign?.offer || 'one sentence on what changes'}`, 'CTA: one low-pressure question'],
    ctaType: 'Interest-based question',
    targetWords: ASSISTANT_TARGET_WORDS,
  };
}

function campaignNameFrom(idea: string): string {
  const m = idea.match(/\bfor ([a-z0-9&' -]{3,40}?)(?:\s+(?:companies|teams|owners|leaders|firms|businesses)\b|[.,]|$)/i);
  const who = m ? m[1].trim() : '';
  return (who ? `${who.charAt(0).toUpperCase()}${who.slice(1)} cold sequence` : 'Cold sequence').slice(0, 60);
}

export async function templatePlanStage(r: AssistantRequest, ask: AskModel, lead?: string): Promise<AssistantResponse> {
  const seq = sequenceSpec(r);
  const kind = seq ? 'sequence' : singleKind(r);
  const locked = resolveFramework(r);
  const change = r.message && r.plan ? `\nTHE REP WANTS THIS CHANGED IN YOUR PREVIOUS PLAN: "${r.message}"\nPREVIOUS PLAN: ${JSON.stringify(r.plan)}` : '';
  const prompt = `You are a calm, senior cold-email writing partner helping a B2B sales manager build reusable email templates. You plan before you write.

${contextBlock(r)}
${change}

${TEMPLATE_RULES}
${seq ? `TEMPLATE TYPE: a sequence of ${seq.emails} cold emails${seq.breakup ? ' plus a breakup email at the end' : ''}, sent days apart to prospects who have not replied.` : kindRule(kind, templateOutcome(r))}

${locked ? `FRAMEWORK (chosen by the rep, use it):\n${frameworkBrief(locked, MERGE_VALUES)}` : `FRAMEWORK: pick the single best fit from this catalogue and say why in one short sentence:\n${catalogue()}`}

STEP NOW: PLAN. Do not write the ${seq ? 'emails' : 'email'} yet. Produce a short plan:
- angle: the one idea the ${seq ? 'sequence' : 'template'} is built on (one sentence, in the rep's terms)
- beats: ${seq ? sequenceBeatsRule(seq) : "3 or 4 beats in order, hook -> pain -> value -> CTA, each under 14 words, following the framework's steps"}
- ctaType: the low-pressure CTA style
- why: one short sentence on why this framework fits${seq ? '\n- campaignName: a short name for the campaign these templates will be saved in, 2 to 5 words, e.g. "Logistics cold sequence"' : ''}
Only use facts that were given. Target about ${ASSISTANT_TARGET_WORDS} words per email.

${ASSISTANT_STYLE_RULES}

Return JSON only:
{"message": "one short sentence introducing the plan", "plan": {"frameworkId": "${locked ? locked.id : 'one of the catalogue ids'}", "why": "...", "angle": "...", "beats": ["..."], "ctaType": "..."${seq ? ', "campaignName": "..."' : ''}}}`;

  const out = await ask(prompt, 0.4);
  const p = (out?.plan && typeof out.plan === 'object' ? out.plan : null) as Json | null;
  if (out && p && Array.isArray(p.beats)) {
    const f = locked || findAssistantFramework(s(p.frameworkId, 60)) || fallbackFramework(kind);
    const beats = (p.beats as unknown[]).map((b) => sanitizeColdEmail(s(b, 200)).cleanText).filter(Boolean).slice(0, seq ? MAX_SEQUENCE_BEATS : 4);
    const plan: AssistantPlan = {
      frameworkId: f.id,
      frameworkName: f.name,
      why: sanitizeColdEmail(s(p.why, 240)).cleanText,
      angle: sanitizeColdEmail(s(p.angle, 240)).cleanText,
      beats,
      ctaType: s(p.ctaType, 100) || 'Interest-based question',
      targetWords: ASSISTANT_TARGET_WORDS,
      ...(seq ? { campaignName: capitalize(s(p.campaignName, 60) || r.plan?.campaignName || campaignNameFrom(r.idea)) } : {}),
    };
    if (beats.length >= (seq ? 2 : 3)) {
      return { stage: 'plan', message: lead || s(out.message, 200) || 'Here is the plan:', plan, framework: fw(f), source: 'gemini' };
    }
  }
  const plan = fallbackPlan(r, seq);
  return { stage: 'plan', message: lead || 'Here is the plan:', plan, framework: { id: plan.frameworkId, name: plan.frameworkName }, source: 'fallback' };
}

// ---------------------------------------------------------------------------
// Stage: draft (one template, or a sequence)
// ---------------------------------------------------------------------------

const UNAVAILABLE = 'The writing model is unavailable right now, so I could not write this. Try again in a moment.';

export async function templateDraftStage(r: AssistantRequest, ask: AskModel): Promise<AssistantResponse> {
  const seq = sequenceSpec(r);
  return seq ? sequenceDraft(r, seq, ask) : singleDraft(r, ask);
}

const LENGTH_RULE = `LENGTH (HARD RULE): aim for about ${ASSISTANT_TARGET_WORDS} words. Each body MUST be fewer than ${ASSISTANT_WORD_LIMIT} words counting the greeting, every sentence, the CTA and the sign-off.`;

async function singleDraft(r: AssistantRequest, ask: AskModel): Promise<AssistantResponse> {
  const kind = singleKind(r);
  const outcome = templateOutcome(r);
  const f = resolveFramework(r);
  const isRefine = Boolean(r.currentDraft?.body && r.message);
  const task = isRefine
    ? `TASK: REFINE. Revise the CURRENT TEMPLATE exactly as the rep asks: "${r.message}". Keep everything that already works and every merge field; change only what was asked.\nCURRENT TEMPLATE:\nSubject: ${r.currentDraft?.subject}\n${r.currentDraft?.body}`
    : r.plan
      ? `TASK: WRITE the template following the APPROVED PLAN exactly.\nAPPROVED PLAN:\n- Framework: ${r.plan.frameworkName}\n- Angle: ${r.plan.angle}\n- Beats: ${r.plan.beats.join(' | ')}\n- CTA type: ${r.plan.ctaType}`
      : `TASK: WRITE the template now from the rep's idea${r.message && r.message !== r.idea ? ` and latest note: "${r.message}"` : ''}.`;

  const basePrompt = `You are a calm, senior cold-email writer building a reusable template for a B2B sales team.

${contextBlock(r)}

${TEMPLATE_RULES}
${kindRule(kind, outcome)}

${frameworkSection(f, false)}

${task}

${ASSISTANT_STYLE_RULES}

${LENGTH_RULE}
FORMAT: body = "Hi {{first_name}}," on its own line, then 2 or 3 short paragraphs, then the single CTA question as its own paragraph, then the sign-off "Best,\\n{{sender_name}}". Use \\n\\n between paragraphs.
SUBJECT: 2 to 5 words, all lowercase, no punctuation except one comma, may use {{company}}, no clickbait.${kind === 'followup' && outcome === 'booked' ? ' May use {{meeting_time}}.' : kind === 'followup' && outcome === 'callback' ? ' May use {{callback_time}}.' : ''}
name: a short library name for the template, 2 to 6 words, e.g. "Logistics: first touch".
message: ONE short sentence to the rep about what you wrote${f ? '' : ' and which framework you picked'}.

Return JSON only:
{"message": "...", "frameworkId": "${f ? f.id : 'catalogue id'}", "name": "...", "subject": "...", "body": "..."}`;

  let out = await ask(basePrompt, 0.5);
  if (!out || typeof out.body !== 'string' || !out.body.trim()) {
    return { stage: 'draft', message: UNAVAILABLE, framework: f ? fw(f) : AUTO, source: 'fallback' };
  }
  let body = finishBody(out.body as string);
  if (countWords(body) >= ASSISTANT_WORD_LIMIT) {
    const retry = await ask(
      `${basePrompt}\n\nYOUR PREVIOUS DRAFT WAS ${countWords(body)} WORDS, WHICH BREAKS THE HARD RULE:\n"""\n${body}\n"""\nRewrite it to at most 70 words in total, greeting and sign-off included. Keep the same angle, the merge fields, the single CTA question and the sign-off. Return the same JSON.`,
      0.3,
    );
    if (retry && typeof retry.body === 'string' && retry.body.trim()) {
      out = { ...out, ...retry };
      body = finishBody(retry.body as string);
    }
  }
  const limited = enforceWordLimit(body);
  body = limited.body;
  const chosen = f || findAssistantFramework(s(out.frameworkId, 60)) || fallbackFramework(kind);
  const fallbackSubject = kind === 'breakup' ? 'closing the loop' : kind === 'followup' ? 'next step from our call' : 'quick question, {{company}}';
  const subject = normalizeTemplateSubject(s(out.subject, 150), fallbackSubject);
  const tag = kind === 'followup' ? OUTCOME_TAG[outcome] : undefined;
  return {
    stage: 'draft',
    message: sanitizeColdEmail(s(out.message, 240)).cleanText || `Here is a ${chosen.name} template.`,
    framework: fw(chosen),
    subject,
    body,
    wordCount: countWords(body),
    trimmed: limited.trimmed,
    template: {
      name: sanitizeColdEmail(s(out.name, 80)).cleanText || shortName(subject, kind),
      purpose: kind,
      outcomeTags: tag ? [tag] : [],
      frameworkId: chosen.id,
    },
    source: 'gemini',
  };
}

async function sequenceDraft(r: AssistantRequest, seq: SequenceSpec, ask: AskModel): Promise<AssistantResponse> {
  const total = seq.emails + (seq.breakup ? 1 : 0);
  const f = resolveFramework(r);
  const isRefine = Boolean(r.currentSequence && r.currentSequence.length > 0 && r.message);
  const order = [
    ...Array.from({ length: seq.emails }, (_, i) => `email ${i + 1}${i === 0 ? ' (first touch)' : ` (sent ${WAITS[i]} days after email ${i}, to someone who did not reply)`}`),
    ...(seq.breakup ? [`email ${total}: the BREAKUP (sent ${WAITS[total - 1]} days later). ${kindRule('breakup', 'other')}`] : []),
  ];
  const task = isRefine
    ? `TASK: REFINE the CURRENT SEQUENCE exactly as the rep asks: "${r.message}". Keep what works and every merge field; change only what was asked. Return all ${total} emails.\nCURRENT SEQUENCE:\n${(r.currentSequence || []).map((e, i) => `--- Email ${i + 1}\nSubject: ${e.subject}\n${e.body}`).join('\n')}`
    : r.plan
      ? `TASK: WRITE the sequence following the APPROVED PLAN exactly (one email per beat).\nAPPROVED PLAN:\n- Framework: ${r.plan.frameworkName}\n- Angle: ${r.plan.angle}\n- Beats: ${r.plan.beats.join(' | ')}\n- CTA type: ${r.plan.ctaType}`
      : `TASK: WRITE the sequence now from the rep's idea${r.message && r.message !== r.idea ? ` and latest note: "${r.message}"` : ''}.`;

  const basePrompt = `You are a calm, senior cold-email writer building a reusable email SEQUENCE for a B2B sales team's template library.

${contextBlock(r)}

${TEMPLATE_RULES}
SEQUENCE: exactly ${total} emails, in this order:
${order.map((o) => `- ${o}`).join('\n')}
Each email stands alone (the prospect may not have read the others), has ONE idea, a fresh angle and a different subject. Never say you are following up ("I am following up", "just following up", "bumping this", "circling back", "as I mentioned"): open each email with something new about their world.

${frameworkSection(f, true)}

${task}

${ASSISTANT_STYLE_RULES}

${LENGTH_RULE}
FORMAT for every body: "Hi {{first_name}}," on its own line, then 1 to 3 short paragraphs, then the single CTA question as its own paragraph, then "Best,\\n{{sender_name}}". Use \\n\\n between paragraphs.
SUBJECT for every email: 2 to 5 words, all lowercase, no punctuation except one comma, may use {{company}}, no clickbait, no "re:".
campaignName: a short name for the campaign, 2 to 5 words.
message: ONE short sentence to the rep about the sequence.

Return JSON only:
{"message": "...", "campaignName": "...", "emails": [{"frameworkId": "${f ? f.id : 'catalogue id'}", "subject": "...", "body": "..."}]}`;

  let out = await ask(basePrompt, 0.5);
  const emailsOf = (o: Json | null) => (o && Array.isArray(o.emails) ? (o.emails as unknown[]).map((e) => (e && typeof e === 'object' ? (e as Json) : {})).filter((e) => typeof e.body === 'string' && (e.body as string).trim()) : []);
  let raw = emailsOf(out);
  if (raw.length === 0) return { stage: 'draft', message: UNAVAILABLE, framework: f ? fw(f) : AUTO, source: 'fallback' };

  let bodies = raw.slice(0, total).map((e) => finishBody(e.body as string));
  const over = bodies.map((b, i) => [i + 1, countWords(b)] as const).filter(([, n]) => n >= ASSISTANT_WORD_LIMIT);
  if (over.length > 0) {
    const retry = await ask(
      `${basePrompt}\n\nIN YOUR PREVIOUS SEQUENCE THESE EMAILS BROKE THE HARD LENGTH RULE: ${over.map(([i, n]) => `email ${i} (${n} words)`).join(', ')}.\nPREVIOUS SEQUENCE:\n${bodies.map((b, i) => `--- Email ${i + 1}\n${b}`).join('\n')}\nRewrite the whole sequence so every body is at most 70 words, greeting and sign-off included. Keep the angles, merge fields, CTAs and sign-offs. Return the same JSON with all ${total} emails.`,
      0.3,
    );
    const again = emailsOf(retry);
    if (again.length >= raw.length) {
      out = { ...(out as Json), ...(retry as Json) };
      raw = again;
      bodies = raw.slice(0, total).map((e) => finishBody(e.body as string));
    }
  }

  const campaignName = capitalize(sanitizeColdEmail(s(out?.campaignName, 60)).cleanText || r.plan?.campaignName || campaignNameFrom(r.idea));
  const n = bodies.length;
  const sequence: AssistantSequenceEmail[] = bodies.map((b, i) => {
    const limited = enforceWordLimit(b);
    const isBreakup = seq.breakup && i === n - 1 && n === total;
    const ef = findAssistantFramework(s(raw[i].frameworkId, 60)) || f || fallbackFramework(isBreakup ? 'breakup' : 'cold');
    const subject = normalizeTemplateSubject(s(raw[i].subject, 150), isBreakup ? 'closing the loop' : `${campaignName.toLowerCase().split(/\s+/).slice(0, 3).join(' ')} ${i + 1}`);
    return {
      step: i + 1,
      purpose: isBreakup ? 'breakup' : 'sequence',
      name: `${campaignName}: ${isBreakup ? 'breakup' : `email ${i + 1}`}`.slice(0, 80),
      subject,
      body: limited.body,
      wordCount: countWords(limited.body),
      waitDays: WAITS[i] ?? 7,
      frameworkId: ef.id,
      trimmed: limited.trimmed,
    };
  });
  const chosen = f || findAssistantFramework(sequence[0]?.frameworkId) || fallbackFramework('cold');
  return {
    stage: 'draft',
    message: sanitizeColdEmail(s(out?.message, 240)).cleanText || `Here is a ${sequence.length}-email sequence.`,
    framework: f ? fw(f) : { id: chosen.id, name: chosen.name },
    sequence,
    campaignName,
    source: 'gemini',
  };
}
