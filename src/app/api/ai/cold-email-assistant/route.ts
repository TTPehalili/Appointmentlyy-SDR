import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/server/session';
import { applyRateLimit } from '@/lib/security';
import { sanitizeColdEmail } from '@/lib/coldEmailStudio';
import {
  ASSISTANT_FRAMEWORKS,
  ASSISTANT_STYLE_RULES,
  ASSISTANT_TARGET_WORDS,
  ASSISTANT_WORD_LIMIT,
  AUTO_FRAMEWORK_ID,
  MAX_PLAN_BEATS,
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
  normalizeSubject,
  outcomeKind,
  type AssistantCampaign,
  type AssistantFramework,
  type AssistantLinkedInPost,
  type AssistantPlan,
  type AssistantQuestion,
  type AssistantRequest,
  type AssistantResponse,
  type AssistantStage,
} from '@/lib/coldEmailAssistant';
import { parseTemplateKind, templateDraftStage, templatePlanStage, templateQuestionsStage } from '@/lib/server/templateAssistant';

/**
 * Cold email writing assistant. Plans before it writes:
 *   stage 'questions' -> 2 to 4 tappable questions (or straight to a plan when nothing is missing)
 *   stage 'plan'      -> framework, angle, beats, CTA type
 *   stage 'draft'     -> the email (new, refined, or mirrored from a LinkedIn post)
 *   stage 'linkedin'  -> a LinkedIn post that mirrors the email and the campaign message
 * Draft bodies are always under 90 words including the CTA and signature (checked here).
 */

const CANDIDATE_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
const MODEL_TIMEOUT_MS = 20000;
const STAGES: AssistantStage[] = ['questions', 'plan', 'draft', 'linkedin'];

type Json = Record<string, unknown>;

async function callGemini(apiKey: string | undefined, prompt: string, temperature = 0.5): Promise<Json | null> {
  if (!apiKey) return null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 2048 },
        }),
      });
      if (!res.ok) {
        console.warn(`[ColdEmailAssistant] ${model} returned ${res.status}`);
        continue;
      }
      const data = await res.json();
      const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) continue;
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Json;
    } catch (err) {
      console.warn(`[ColdEmailAssistant] ${model} failed:`, err);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Request parsing (bounded: everything here ends up in a prompt)
// ---------------------------------------------------------------------------

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');

function parseRequest(raw: unknown): AssistantRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Json;
  const stage = STAGES.includes(o.stage as AssistantStage) ? (o.stage as AssistantStage) : null;
  if (!stage) return null;
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Json) : {});
  const recipient = obj(o.recipient);
  const sender = obj(o.sender);
  const campaign = obj(o.campaign);
  const draft = obj(o.currentDraft);
  const plan = obj(o.plan);
  const call = obj(o.callContext);
  return {
    stage,
    purpose: o.purpose === 'followup' ? 'followup' : o.purpose === 'template' ? 'template' : 'cold',
    templateKind: o.purpose === 'template' ? parseTemplateKind(o.templateKind) : undefined,
    currentSequence: o.purpose === 'template' && Array.isArray(o.currentSequence)
      ? o.currentSequence
          .slice(0, MAX_SEQUENCE_BEATS)
          .map((e) => obj(e))
          .map((e) => ({ subject: s(e.subject, 150), body: s(e.body, 2000), purpose: e.purpose === 'breakup' ? ('breakup' as const) : ('sequence' as const) }))
          .filter((e) => e.body)
      : undefined,
    callContext: o.purpose === 'followup'
      ? {
          outcome: s(call.outcome, 120),
          notes: s(call.notes, 1200),
          scriptStep: s(call.scriptStep, 200),
          objection: s(call.objection, 200),
          agreedTime: s(call.agreedTime, 120),
          transcript: s(call.transcript, 3000),
        }
      : undefined,
    idea: s(o.idea, 1500),
    message: s(o.message, 800),
    history: (Array.isArray(o.history) ? o.history : [])
      .slice(-12)
      .map((t) => obj(t))
      .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
      .map((t) => ({ role: t.role as 'user' | 'assistant', text: s(t.text, 700) })),
    answers: (Array.isArray(o.answers) ? o.answers : [])
      .slice(0, MAX_QUESTIONS)
      .map((a) => obj(a))
      .map((a) => ({ question: s(a.question, 200), answer: s(a.answer, 400) }))
      .filter((a) => a.question && a.answer),
    plan: Array.isArray(plan.beats)
      ? {
          frameworkId: s(plan.frameworkId, 60),
          frameworkName: s(plan.frameworkName, 120),
          why: s(plan.why, 300),
          angle: s(plan.angle, 300),
          beats: (plan.beats as unknown[]).slice(0, o.purpose === 'template' ? MAX_SEQUENCE_BEATS : MAX_PLAN_BEATS).map((b) => s(b, 200)).filter(Boolean),
          ctaType: s(plan.ctaType, 120),
          targetWords: ASSISTANT_TARGET_WORDS,
          ...(o.purpose === 'template' && s(plan.campaignName, 60) ? { campaignName: s(plan.campaignName, 60) } : {}),
        }
      : undefined,
    currentDraft: draft.body ? { subject: s(draft.subject, 120), body: s(draft.body, 2000) } : undefined,
    sourcePost: s(o.sourcePost, 2500),
    recipient: { name: s(recipient.name, 80), company: s(recipient.company, 120), title: s(recipient.title, 120) },
    sender: { name: s(sender.name, 80), company: s(sender.company, 120) },
    frameworkId: s(o.frameworkId, 60) || AUTO_FRAMEWORK_ID,
    campaign: {
      angle: s(campaign.angle, 400),
      pain: s(campaign.pain, 400),
      proof: s(campaign.proof, 400),
      offer: s(campaign.offer, 400),
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt pieces
// ---------------------------------------------------------------------------

const STYLE_RULES = ASSISTANT_STYLE_RULES;

function firstName(name?: string) {
  return (name || '').trim().split(/\s+/)[0] || '';
}

function fillValues(r: AssistantRequest) {
  return {
    fullName: r.recipient?.name,
    firstName: firstName(r.recipient?.name),
    company: r.recipient?.company,
    title: r.recipient?.title,
    senderName: r.sender?.name,
    senderCompany: r.sender?.company,
  };
}

/** What each call outcome's follow-up must do. */
function outcomeRule(r: AssistantRequest): string {
  switch (outcomeKind(r.callContext?.outcome)) {
    case 'booked':
      return 'Outcome BOOKED: next steps confirm the meeting (time exactly as given, or the rep\'s answer) and that the calendar invite is on its way, plus what you will cover and why it matters to them. The CTA softly confirms the time (e.g. "Does that still work for you?" or "Anyone else worth adding?").';
    case 'callback':
      return 'Outcome CALLBACK: next steps confirm when you will call back (exactly as given, or the rep\'s answer) and give ONE useful point tied to what they said. The CTA is a light question (e.g. "Anything you want me to bring to that call?").';
    case 'not_interested':
      return 'Outcome NOT INTERESTED: gracious and brief. Acknowledge their reason without arguing, offer one useful thing for later only if the rep chose it, leave the door softly open. No pitch. The CTA is a soft door-open question (e.g. "Mind if I check back next quarter?").';
    case 'no_connect':
      return 'Outcome NO CONNECTION (voicemail, gatekeeper or no answer): short note that you tried to reach them, one line on why, one low-pressure question.';
    default:
      return 'Recap what was discussed in one line and confirm the agreed next step.';
  }
}

function callBlock(r: AssistantRequest): string {
  if (r.purpose !== 'followup' || !r.callContext) return '';
  const c = r.callContext;
  const lines = [
    'THIS IS A POST-CALL FOLLOW-UP written right after the rep spoke with the recipient. Structure: outcome-aligned subject, a quick acknowledgement of the call, the next steps (the item or service, why it matters to this prospect, the benefit of partnering), one anti-sales CTA, signature.',
    "- Recap only what the notes, transcript, objection or answers below actually say. If they say nothing about the conversation, keep the acknowledgement general (e.g. \"Thanks for your time on the call today.\") and never invent topics, numbers or agreements. Never invent a meeting time, price, result or deliverable: use only the agreed time, the notes, the transcript or the rep's answers. If the rep says the time is not agreed yet, offer to suggest one or let them pick; do not make one up.",
    c.outcome && `- Call outcome: ${c.outcome}`,
    c.agreedTime && `- Agreed time: ${c.agreedTime}`,
    c.scriptStep && `- Script step reached: ${c.scriptStep}`,
    c.objection && `- Objection raised: ${c.objection}`,
    c.notes && `- Rep's notes: ${c.notes}`,
    c.transcript && `- Call transcript (most recent part):\n${c.transcript}`,
    `- ${outcomeRule(r)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function contextBlock(r: AssistantRequest): string {
  const rec = r.recipient || {};
  const call = callBlock(r);
  const lines = [
    `RECIPIENT: ${rec.name || 'name unknown'}${rec.title ? `, ${rec.title}` : ''}${rec.company ? ` at ${rec.company}` : ''}`,
    `SENDER (signs the email): ${r.sender?.name || 'the rep'}${r.sender?.company ? ` at ${r.sender.company}` : ''}`,
    `CAMPAIGN MESSAGE (shared with the rep's LinkedIn posts; stay consistent with it: same terminology, same pain, same proof, numbers only as given):\n${campaignBrief(r.campaign)}`,
    `REP'S IDEA: "${r.idea || '(none yet)'}"`,
  ];
  if (call) lines.push(call);
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

/** Post-call follow-ups use the owner's fixed structure unless the rep picks a framework. */
const FOLLOWUP_FRAMEWORK: AssistantFramework = {
  id: 'post-call-followup',
  name: 'Post-call follow-up',
  author: 'Appointmentlyy',
  category: 'After the call',
  description: 'Subject aligned to the call outcome, a quick acknowledgement, the next steps, and an anti-sales CTA.',
  principle: 'Helpful, specific and calm: the email continues the conversation, it does not restart the pitch.',
  steps: [
    '1. Subject aligned to the outcome and specific to this prospect.',
    '2. Quick acknowledgement: one line that references the actual call.',
    '3. Next steps: the item or service the rep chose, why it matters to this prospect (from the notes, transcript or objection), and the benefit of partnering.',
    '4. One anti-sales CTA: low-pressure, no-oriented or interest-based.',
    '5. Signature.',
  ].join('\n'),
  targetWords: 75,
  bestFor: 'emails sent right after a call',
};

function resolveFramework(r: AssistantRequest, preferred?: string): AssistantFramework | undefined {
  const mentioned = r.message ? detectFrameworkMention(r.message) : undefined;
  if (r.purpose === 'followup') {
    return (
      findAssistantFramework(mentioned) ||
      findAssistantFramework(preferred) ||
      findAssistantFramework(r.frameworkId) ||
      findAssistantFramework(r.plan?.frameworkId) ||
      FOLLOWUP_FRAMEWORK
    );
  }
  return (
    findAssistantFramework(mentioned) ||
    findAssistantFramework(preferred) ||
    findAssistantFramework(r.plan?.frameworkId) ||
    findAssistantFramework(r.frameworkId)
  );
}

function fallbackFramework(r: AssistantRequest): AssistantFramework {
  const idea = `${r.idea} ${r.message || ''}`.toLowerCase();
  const id = /follow|after our call|re-?engage|went quiet|no reply/.test(idea)
    ? 'voss-no-oriented'
    : /before|after|ramp|faster|hours|days/.test(idea)
      ? 'before-after-bridge'
      : 'braun-poke-the-bear';
  return findAssistantFramework(id) || ASSISTANT_FRAMEWORKS[0];
}

const fw = (f: AssistantFramework) => ({ id: f.id, name: f.name });

/** "emil@callview.ai" -> "Emil", "john.smith@x.com" -> "John Smith"; real names pass through. */
function displayName(raw: string | undefined): string {
  const v = (raw || '').trim();
  if (!v.includes('@')) return v;
  return v
    .split('@')[0]
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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
      const options = (Array.isArray(o.options) ? o.options : [])
        .map((x) => s(x, 60))
        .filter(Boolean)
        .slice(0, 4);
      return { id: seen.has(id) ? `${id}${i}` : (seen.add(id), id), text, options };
    })
    .filter((q) => q.text)
    .slice(0, MAX_QUESTIONS);
}

/**
 * Post-call follow-up: always ask first (one turn). What to send, what the email should achieve,
 * what to highlight (prefilled from notes or the campaign message), and the time when it's unknown.
 */
function followUpQuestions(r: AssistantRequest): AssistantQuestion[] {
  const kind = outcomeKind(r.callContext?.outcome);
  const send: Record<string, string[]> = {
    booked: ['Meeting confirmation + agenda', 'The service they asked about', 'Pricing or a case study'],
    callback: ['Recap + callback time', 'The service they asked about', 'Pricing or a case study'],
    not_interested: ['"Door open" note', 'A short resource for later', 'The service they asked about'],
    no_connect: ['Quick intro + reason for calling', 'The service they asked about', '"Door open" note'],
    other: ['Recap + next step', 'The service they asked about', 'Pricing or a case study'],
  };
  const goals: Record<string, string[]> = {
    booked: ['Lock the meeting', 'Get a reply / question answered', 'Move to a next step'],
    callback: ['Move to a next step', 'Get a reply / question answered', 'Lock the meeting'],
    not_interested: ['Re-engage later', 'Get a reply / question answered', 'Move to a next step'],
    no_connect: ['Get a reply / question answered', 'Lock the meeting', 'Re-engage later'],
    other: ['Move to a next step', 'Lock the meeting', 'Get a reply / question answered', 'Re-engage later'],
  };
  const firstNote = (r.callContext?.notes || '').split(/\s*\|\s*|(?<=[.!?])\s+/).find((x) => x.trim().length > 8) || '';
  const prefill = (r.campaign?.offer || r.campaign?.angle || firstNote).slice(0, 140);
  const qs: AssistantQuestion[] = [
    { id: 'send', text: 'What do you need to send?', options: send[kind] },
    { id: 'goal', text: 'What do you want this email to accomplish?', options: goals[kind] },
    { id: 'highlight', text: 'Which service or point should we highlight?', options: [], prefill },
  ];
  if ((kind === 'booked' || kind === 'callback') && !r.callContext?.agreedTime) {
    qs.push({ id: 'time', text: 'Did you agree a time?', options: ['Not yet, suggest one', 'They will pick a time'] });
  }
  return qs.slice(0, MAX_QUESTIONS);
}

function fallbackQuestions(r: AssistantRequest): AssistantQuestion[] {
  const qs: AssistantQuestion[] = [];
  const idea = r.idea.toLowerCase();
  if (r.purpose === 'followup') return followUpQuestions(r);
  if (!r.recipient?.name && !r.recipient?.title) {
    qs.push({ id: 'who', text: 'Who is this for, and have you spoken before?', options: ['First touch, never spoken', 'Follow-up after a call', 'Re-engaging a quiet lead'] });
  }
  if (!/cta|call|reply|meeting|demo|video|look/.test(idea) && !r.campaign?.offer) {
    qs.push({ id: 'goal', text: 'What should this email get you?', options: ['A reply', 'A short call', 'OK to send a video'] });
  }
  if (!r.campaign?.pain) {
    qs.push({ id: 'pain', text: 'Which pain or trigger should it lead with?', options: [] });
  }
  if (!r.campaign?.proof && !/\d/.test(idea)) {
    qs.push({ id: 'proof', text: 'Any proof or numbers I can use?', options: ['No numbers, keep it qualitative'] });
  }
  if (qs.length < 2) qs.push({ id: 'tone', text: 'Which tone?', options: ['Calm and curious', 'Direct and brief', 'Warm and personal'] });
  return qs.slice(0, MAX_QUESTIONS);
}

async function questionsStage(r: AssistantRequest, apiKey?: string): Promise<AssistantResponse> {
  const selected = findAssistantFramework(r.frameworkId);
  if (r.purpose === 'followup') {
    // Always ask first, instantly (no model call): the rep says what to send and why.
    return {
      stage: 'questions',
      message: 'Quick check before I write it:',
      questions: followUpQuestions(r),
      framework: selected ? fw(selected) : { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' },
      source: 'fallback',
    };
  }
  const prompt = `You are a calm, senior cold-email writing partner for a B2B rep. You plan before you write, the way a careful copywriter does.

${contextBlock(r)}

FRAMEWORK: ${selected ? selected.name : 'Auto: you will pick the best fit later'}

STEP NOW: UNDERSTAND. Decide what you still need to know to write an excellent, specific email.
Ask 2 to 4 short questions, all at once, ONLY about things that are essential and NOT already known from the idea, the recipient, or the campaign message. Topics, in priority order:
1. Who it is for (role, company, any prior contact)
2. The goal (book a call, get a reply, re-engage)
3. Which pain or trigger to lead with
4. Any proof or numbers to use
5. Tone
Skip every topic that is already answered. If only one thing is missing, ask one question. If nothing essential is missing, return an empty "questions" array.
Each question: at most 12 words. Give 2 to 4 tappable answer options (each at most 6 words) that are plausible answers drawn from the idea. Options must never contain invented numbers or names; for the proof question offer options like "No numbers, keep it qualitative". The rep can also type a free answer.

Return JSON only:
{"message": "one short friendly sentence, e.g. 'A few quick questions so the email lands:'", "questions": [{"id": "who|goal|pain|proof|tone", "text": "...", "options": ["...", "..."]}]}`;

  const out = await callGemini(apiKey, prompt, 0.4);
  if (out) {
    const questions = normalizeQuestions(out.questions);
    if (questions.length === 0) return planStage(r, apiKey, 'I have what I need. Here is the plan:');
    return {
      stage: 'questions',
      message: s(out.message, 200) || 'A few quick questions so the email lands:',
      questions,
      framework: selected ? fw(selected) : { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' },
      source: 'gemini',
    };
  }
  return {
    stage: 'questions',
    message: 'A few quick questions so the email lands:',
    questions: fallbackQuestions(r),
    framework: selected ? fw(selected) : { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' },
    source: 'fallback',
  };
}

// ---------------------------------------------------------------------------
// Stage: plan
// ---------------------------------------------------------------------------

function fallbackPlan(r: AssistantRequest): AssistantPlan {
  const f = resolveFramework(r) || fallbackFramework(r);
  const offer = r.campaign?.offer;
  if (r.purpose === 'followup') {
    const highlight = (r.answers || []).find((a) => /highlight/i.test(a.question))?.answer || offer || 'the next step you agreed';
    return {
      frameworkId: f.id,
      frameworkName: f.name,
      why: 'Built for emails sent right after a call.',
      angle: highlight,
      beats: [
        `Subject: ${followUpSubject('', r)}`,
        'Acknowledge: one line about the call',
        `Next steps: ${highlight}, why it matters to them, the benefit of working together`,
        'CTA: one low-pressure question',
      ],
      ctaType: outcomeKind(r.callContext?.outcome) === 'not_interested' ? 'Soft door-open question' : 'Interest-based question',
      targetWords: ASSISTANT_TARGET_WORDS,
    };
  }
  return {
    frameworkId: f.id,
    frameworkName: f.name,
    why: `Best fit for ${f.bestFor.split(';')[0]}.`,
    angle: r.campaign?.angle || r.idea.slice(0, 160),
    beats: ['Hook: a specific observation about them', `Pain: ${r.campaign?.pain || 'the tension behind the idea'}`, `Value: ${offer || 'one sentence on what changes'}`, 'CTA: one low-pressure question'],
    ctaType: 'Interest-based question',
    targetWords: ASSISTANT_TARGET_WORDS,
  };
}

async function planStage(r: AssistantRequest, apiKey?: string, lead?: string): Promise<AssistantResponse> {
  const locked = resolveFramework(r);
  const change = r.message && r.plan ? `\nTHE REP WANTS THIS CHANGED IN YOUR PREVIOUS PLAN: "${r.message}"\nPREVIOUS PLAN: ${JSON.stringify(r.plan)}` : '';
  const prompt = `You are a calm, senior cold-email writing partner for a B2B rep. You plan before you write.

${contextBlock(r)}
${change}

${locked ? `FRAMEWORK (chosen by the rep, use it):\n${frameworkBrief(locked, fillValues(r))}` : `FRAMEWORK: pick the single best fit from this catalogue and say why in one short sentence:\n${catalogue()}`}

STEP NOW: PLAN. Do not write the email yet. Produce a short plan:
- angle: the one idea the email is built on (one sentence, in the rep's terms)
- beats: ${r.purpose === 'followup'
    ? 'exactly 4 beats in this order: "Subject: <the exact subject line>", "Acknowledge: <one line about the actual call>", "Next steps: <the item or service, why it matters to this prospect, the benefit of partnering>", "CTA: <the anti-sales question>". Each under 22 words. The subject follows the SUBJECT rule below.'
    : "3 or 4 beats in order, hook -> pain -> value -> CTA, each under 14 words, following the framework's steps"}
- ctaType: the low-pressure CTA style (e.g. "Interest-based question", "Permission to send a 2-minute video", "No-oriented question")
- why: one short sentence on why this framework fits
Only use facts that were given. Target about ${ASSISTANT_TARGET_WORDS} words for the final email.${r.purpose === 'followup' ? `\n${followUpSubjectRule(r)}` : ''}

${STYLE_RULES}

Return JSON only:
{"message": "one short sentence introducing the plan", "plan": {"frameworkId": "${locked ? locked.id : 'one of the catalogue ids'}", "why": "...", "angle": "...", "beats": ["Hook: ...", "Pain: ...", "Value: ...", "CTA: ..."], "ctaType": "..."}}`;

  const out = await callGemini(apiKey, prompt, 0.4);
  const p = (out?.plan && typeof out.plan === 'object' ? out.plan : null) as Json | null;
  if (out && p && Array.isArray(p.beats)) {
    const f = locked || findAssistantFramework(s(p.frameworkId, 60)) || fallbackFramework(r);
    const plan: AssistantPlan = {
      frameworkId: f.id,
      frameworkName: f.name,
      why: sanitizeColdEmail(s(p.why, 240)).cleanText,
      angle: sanitizeColdEmail(s(p.angle, 240)).cleanText,
      beats: (p.beats as unknown[]).map((b) => sanitizeColdEmail(s(b, 160)).cleanText).filter(Boolean).slice(0, 4),
      ctaType: s(p.ctaType, 100) || 'Interest-based question',
      targetWords: ASSISTANT_TARGET_WORDS,
    };
    if (plan.beats.length >= 3) {
      return { stage: 'plan', message: lead || s(out.message, 200) || 'Here is the plan:', plan, framework: fw(f), source: 'gemini' };
    }
  }
  const plan = fallbackPlan(r);
  return { stage: 'plan', message: lead || 'Here is the plan:', plan, framework: { id: plan.frameworkId, name: plan.frameworkName }, source: 'fallback' };
}

// ---------------------------------------------------------------------------
// Stage: draft (new, refine, mirror)
// ---------------------------------------------------------------------------

function normalizeCampaign(raw: unknown): AssistantCampaign | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Json;
  const c = { angle: s(o.angle, 300), pain: s(o.pain, 300), proof: s(o.proof, 300), offer: s(o.offer, 300) };
  return c.angle || c.pain || c.proof || c.offer ? c : undefined;
}

function finishBody(raw: string, r: AssistantRequest): string {
  return ensureSignature(cleanBody(raw), r.sender?.name || '');
}

function shortCompany(company?: string) {
  return (company || '')
    .replace(/\b(inc|llc|ltd|corp|corporation|group|solutions|services|bpo)\b\.?/gi, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/** What the next-steps part must state for this outcome. */
function followUpMustSay(r: AssistantRequest): string {
  const kind = outcomeKind(r.callContext?.outcome);
  const timeAnswer = (r.answers || []).find((a) => /time/i.test(a.question))?.answer || '';
  const agreed = r.callContext?.agreedTime || (/not yet|will pick|suggest/i.test(timeAnswer) ? '' : timeAnswer);
  if (kind === 'booked') {
    return agreed
      ? `The next steps MUST say the meeting is set for ${agreed} and that the calendar invite is on its way. `
      : 'No time is agreed yet: the next steps offer to send two time options and say the invite follows once they pick. Do NOT name any day or time anywhere in the email, CTA included (the CTA asks which works better for them, e.g. "Would mornings or afternoons suit you better?"). ';
  }
  if (kind === 'callback') {
    return agreed
      ? `The next steps MUST say you will call them on ${agreed}. `
      : 'No callback time is agreed yet: ask which day suits them. Do NOT name any day or time anywhere in the email. ';
  }
  return '';
}

function followUpSubjectRule(r: AssistantRequest): string {
  const kind = outcomeKind(r.callContext?.outcome);
  const example =
    kind === 'booked' ? '"thursday 2pm, apex global ramp time"'
    : kind === 'callback' ? '"as promised, friday call"'
    : kind === 'not_interested' ? '"thanks for the honesty"'
    : '"next step from our call"';
  return `SUBJECT: aligned to the call outcome and specific to this prospect (time, company or topic from the call), all lowercase, 3 to 6 words, at most one comma, no other punctuation, no clickbait. Example for this outcome: ${example}. Never generic ("following up", "quick question", "our call today"). Use a time only if it is the agreed time or the rep's answer.`;
}

const GENERIC_SUBJECTS = /^(following up|follow up|quick question|our call( today)?|our chat( today)?|checking in|great call|thanks|thank you|next steps?)$/;

/** Lowercase, up to 6 words, one comma allowed; falls back to an outcome-specific subject when generic. */
function followUpSubject(raw: string, r: AssistantRequest): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9&',:\s-]/g, ' ')
    .replace(/:/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,(?=.*,)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
    .replace(/,$/, '');
  if (cleaned && countWords(cleaned) >= 2 && !GENERIC_SUBJECTS.test(cleaned)) return cleaned;
  const kind = outcomeKind(r.callContext?.outcome);
  const time = (r.callContext?.agreedTime || '').toLowerCase().replace(/[^a-z0-9: ]/g, '').replace(/:00/g, '').trim();
  const co = shortCompany(r.recipient?.company);
  if (kind === 'booked') return [time, co ? `${co} next steps` : 'our meeting'].filter(Boolean).join(', ');
  if (kind === 'callback') return time ? `as promised, ${time} call` : 'as promised, our next call';
  if (kind === 'not_interested') return 'thanks for the honesty';
  return co ? `${co} next steps` : 'next step from our call';
}

async function draftStage(r: AssistantRequest, apiKey?: string): Promise<AssistantResponse> {
  const isRefine = Boolean(r.currentDraft?.body && r.message && !r.sourcePost);
  const f = resolveFramework(r);
  const greetName = firstName(r.recipient?.name);
  const signName = firstName(r.sender?.name) || 'the sender';

  let task: string;
  if (r.sourcePost) {
    task = `TASK: MIRROR. Turn the rep's LinkedIn post below into a matching 1:1 cold email: same angle, same pain, same proof, same terminology, same offer, so a prospect who sees both hears one story. An email is personal, not a broadcast: speak to this recipient.\nLINKEDIN POST:\n"""\n${r.sourcePost}\n"""`;
  } else if (isRefine) {
    task = `TASK: REFINE. Revise the CURRENT DRAFT exactly as the rep asks: "${r.message}". Keep everything that already works; change only what was asked.${detectFrameworkMention(r.message || '') ? ' The rep asked for a different framework: rebuild the draft on it, keeping the same facts and angle.' : ''}\nCURRENT DRAFT:\nSubject: ${r.currentDraft?.subject}\n${r.currentDraft?.body}`;
  } else if (r.plan) {
    task = `TASK: WRITE the email following the APPROVED PLAN exactly.\nAPPROVED PLAN:\n- Framework: ${r.plan.frameworkName}\n- Angle: ${r.plan.angle}\n- Beats: ${r.plan.beats.join(' | ')}\n- CTA type: ${r.plan.ctaType}`;
  } else if (r.purpose === 'followup') {
    task = `TASK: WRITE the post-call follow-up now${r.message && r.message !== r.idea ? `, taking into account: "${r.message}"` : ''}. Follow the FORMAT below exactly (acknowledgement, next steps, anti-sales CTA), matching the call outcome and the rep's answers.`;
  } else {
    task = `TASK: WRITE the email now from the rep's idea${r.message && r.message !== r.idea ? ` and latest note: "${r.message}"` : ''}.`;
  }

  const frameworkSection = f
    ? `FRAMEWORK (follow its structure faithfully):\n${frameworkBrief(f, fillValues(r))}`
    : `FRAMEWORK: pick the single best fit from this catalogue, follow its structure, and return its id:\n${catalogue()}\n\nDefinitions:\n${ASSISTANT_FRAMEWORKS.map((x) => frameworkBrief(x, fillValues(r))).join('\n\n')}`;

  const basePrompt = `You are a calm, senior cold-email writer for a B2B rep.

${contextBlock(r)}

${frameworkSection}

${task}

${STYLE_RULES}

LENGTH (HARD RULE): aim for about ${ASSISTANT_TARGET_WORDS} words. The body MUST be fewer than ${ASSISTANT_WORD_LIMIT} words counting the greeting, every sentence, the CTA and the sign-off.
${r.purpose === 'followup'
    ? `FORMAT (fixed order): body = "${greetName ? `Hi ${greetName},` : 'Hi there,'}" on its own line; then ONE quick acknowledgement line that references the actual call; then the next steps (the specific item or service the rep chose, why it matters to this prospect based on the notes, transcript or objection, and the benefit of partnering) in 1 or 2 short sentences; ${followUpMustSay(r)}then ONE anti-sales CTA question as its own paragraph (low-pressure, no-oriented or interest-based, never "book now" pressure); then the sign-off "Best,\\n${signName}". Use \\n\\n between paragraphs.
${followUpSubjectRule(r)}`
    : `FORMAT: body = "${greetName ? `Hi ${greetName},` : 'Hi there,'}" on its own line, then 2 or 3 short paragraphs, then the single CTA question as its own paragraph, then the sign-off "Best,\\n${signName}". Use \\n\\n between paragraphs.
SUBJECT: 2 to 4 words, all lowercase, no punctuation, no clickbait, no "re:".`}
message: ONE short sentence to the rep about what you wrote${f ? '' : ' and which framework you picked and why'}.
campaign: the angle, core pain, proof and offer exactly as used in this email (empty string when not used).

Return JSON only:
{"message": "...", "frameworkId": "${f ? f.id : 'catalogue id'}", "subject": "...", "body": "...", "campaign": {"angle": "...", "pain": "...", "proof": "...", "offer": "..."}}`;

  let out = await callGemini(apiKey, basePrompt, 0.5);
  if (!out || typeof out.body !== 'string' || !out.body.trim()) {
    return {
      stage: 'draft',
      message: 'The writing model is unavailable right now, so I could not write this draft. Try again in a moment.',
      framework: f ? fw(f) : { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' },
      source: 'fallback',
    };
  }

  let body = finishBody(out.body as string, r);
  if (countWords(body) >= ASSISTANT_WORD_LIMIT) {
    // One stricter retry before trimming deterministically.
    const retry = await callGemini(
      apiKey,
      `${basePrompt}\n\nYOUR PREVIOUS DRAFT WAS ${countWords(body)} WORDS, WHICH BREAKS THE HARD RULE:\n"""\n${body}\n"""\nRewrite it to at most 70 words in total, greeting and sign-off included. Keep the same angle, the single CTA question and the sign-off. Cut whole ideas rather than squeezing words. Return the same JSON.`,
      0.3,
    );
    if (retry && typeof retry.body === 'string' && retry.body.trim()) {
      out = { ...out, ...retry };
      body = finishBody(retry.body as string, r);
    }
  }
  const limited = enforceWordLimit(body);
  body = limited.body;

  const chosen = f || findAssistantFramework(s(out.frameworkId, 60)) || fallbackFramework(r);
  const wordCount = countWords(body);
  return {
    stage: 'draft',
    message: sanitizeColdEmail(s(out.message, 240)).cleanText || `Here is a ${chosen.name} draft.`,
    framework: fw(chosen),
    subject: r.purpose === 'followup' ? followUpSubject(s(out.subject, 100), r) : normalizeSubject(s(out.subject, 80)),
    body,
    wordCount,
    trimmed: limited.trimmed,
    campaign: normalizeCampaign(out.campaign),
    source: 'gemini',
  };
}

// ---------------------------------------------------------------------------
// Stage: linkedin (mirror the email as a post)
// ---------------------------------------------------------------------------

function postWords(p: Pick<AssistantLinkedInPost, 'hook' | 'body' | 'cta'>) {
  return countWords(`${p.hook} ${p.body} ${p.cta}`);
}

function cleanPostText(v: unknown, max: number) {
  return sanitizeColdEmail(s(v, max)).cleanText.replace(/\n{3,}/g, '\n\n');
}

async function linkedinStage(r: AssistantRequest, apiKey?: string): Promise<AssistantResponse> {
  const f = resolveFramework(r);
  const email = r.currentDraft?.body ? `Subject: ${r.currentDraft.subject}\n${r.currentDraft.body}` : '(no email yet)';
  const prompt = `You write LinkedIn posts for a B2B rep: ${r.sender?.name || 'the rep'}${r.sender?.company ? ` at ${r.sender.company}` : ''}.
The rep's prospects will see BOTH this post and the rep's cold email, so the post must MIRROR the email: same campaign angle, same pain point, same proof, same offer, same terminology. One consistent story ("surround sound").

CAMPAIGN MESSAGE:
${campaignBrief(r.campaign)}

THE COLD EMAIL TO MIRROR:
"""
${email}
"""

REP'S ORIGINAL IDEA: "${r.idea || '(none)'}"

WRITE A POST, NOT A PITCH:
- A value, insight or short story post for the rep's whole audience, not a message to one prospect. Do NOT name or address the email recipient or their company.
- Hook: 1 or 2 short lines that stop the scroll by naming the pain or a sharp observation.
- Body: the insight behind the email's angle, in short lines (1 or 2 sentences per line, blank line between lines). Teach or show; do not sell.
- CTA: one soft question that invites comments ("How are you handling this?"). No "DM me", no links, no "book a call", no hard sell.
- Facts: NEVER invent statistics, percentages, durations, customers, results or prices. Numbers only if they appear in the email or the campaign message, used exactly and written as digits.
- Length: 80 to 150 words for hook + body + CTA together.
- No em dashes, no emojis. 3 to 5 relevant hashtags.

Return JSON only:
{"message": "one short sentence to the rep", "hook": "...", "body": "...", "cta": "...", "hashtags": ["#..."]}`;

  let out = await callGemini(apiKey, prompt, 0.6);
  const build = (o: Json): AssistantLinkedInPost => {
    const post = {
      hook: cleanPostText(o.hook, 400),
      body: cleanPostText(o.body, 2000),
      cta: cleanPostText(o.cta, 300),
      hashtags: (Array.isArray(o.hashtags) ? o.hashtags : [])
        .map((h) => s(h, 40).replace(/[^#A-Za-z0-9]/g, ''))
        .filter((h) => h.length > 1)
        .map((h) => (h.startsWith('#') ? h : `#${h}`))
        .slice(0, 5),
      wordCount: 0,
    };
    post.wordCount = postWords(post);
    return post;
  };
  if (!out || typeof out.body !== 'string') {
    return {
      stage: 'linkedin',
      message: 'The writing model is unavailable right now, so I could not write the LinkedIn post. Try again in a moment.',
      framework: f ? fw(f) : { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' },
      source: 'fallback',
    };
  }
  let post = build(out);
  if (post.wordCount > 160 || post.wordCount < 60) {
    const retry = await callGemini(apiKey, `${prompt}\n\nYour previous post was ${post.wordCount} words. Rewrite it to between 90 and 140 words. Return the same JSON.`, 0.4);
    if (retry && typeof retry.body === 'string') {
      out = retry;
      post = build(retry);
    }
  }
  return {
    stage: 'linkedin',
    message: s(out.message, 200) || 'Here is a LinkedIn post that tells the same story.',
    framework: f ? fw(f) : { id: AUTO_FRAMEWORK_ID, name: 'Auto (best fit)' },
    post,
    source: 'gemini',
  };
}

// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const limited = applyRateLimit(req, { maxRequests: 30, windowMs: 60000 });
  if (limited) return limited;

  const r = parseRequest(await req.json().catch(() => null));
  if (!r) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!r.idea && !r.message && !r.sourcePost && !r.currentDraft) {
    return NextResponse.json({ error: 'Tell the assistant what the email is about.' }, { status: 400 });
  }
  // The sender is whoever is signed in; the client may only pass its own session values.
  r.sender = {
    name: displayName(r.sender?.name || session.name),
    company: r.sender?.company || session.identity.tenant.name,
  };

  const apiKey = process.env.GOOGLE_API_KEY;
  try {
    if (r.purpose === 'template') {
      // Library templates: reusable copy with merge fields (no LinkedIn stage).
      if (r.stage === 'linkedin') return NextResponse.json({ error: 'LinkedIn posts are not available for templates.' }, { status: 400 });
      const ask = (prompt: string, temperature?: number) => callGemini(apiKey, prompt, temperature);
      const result =
        r.stage === 'questions'
          ? await templateQuestionsStage(r, ask)
          : r.stage === 'plan'
            ? await templatePlanStage(r, ask)
            : await templateDraftStage(r, ask);
      return NextResponse.json(result);
    }
    const result =
      r.stage === 'questions'
        ? await questionsStage(r, apiKey)
        : r.stage === 'plan'
          ? await planStage(r, apiKey)
          : r.stage === 'linkedin'
            ? await linkedinStage(r, apiKey)
            : await draftStage(r, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ColdEmailAssistant] failed:', err);
    return NextResponse.json({ error: 'The assistant failed. Try again.' }, { status: 500 });
  }
}
