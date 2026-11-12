/**
 * Copilot answers that are built from computed data or structured AI output (server only).
 * - Team report emails, coaching and objection summaries: the numbers are computed in copilotReport;
 *   the AI only rewrites the words, and any line with a number that isn't in the data is replaced by the
 *   deterministic line.
 * - Rep helpers (objection rebuttals, short emails, LinkedIn posts): structured AI output with length
 *   checks, and honest templates when the AI is unavailable.
 */
import {
  OBJECTION_RULES,
  coachingCandidates,
  composeReportEmail,
  dataQuality,
  fmtInt,
  knownNumbers,
  reportMetrics,
  usesOnlyKnownNumbers,
  type ReportData,
  type ReportEmail,
} from '@/lib/copilotReport';
import { getPresetRebuttals, type ARMRebuttal } from '@/lib/dialerRebuttals';
import { parseJsonObject, raceGemini } from '@/lib/server/gemini';

export interface CopilotAction {
  label: string;
  href: string;
}

export interface CopilotDraft {
  kind: 'email' | 'linkedin';
  subject?: string;
  body: string;
  words: number;
}

export interface CopilotReply {
  answer: string;
  category: string;
  source?: string;
  report?: ReportEmail;
  draft?: CopilotDraft;
  actions?: CopilotAction[];
}

export interface Turn {
  from: 'user' | 'ai';
  text: string;
}

const PRACTICE_ACTION: CopilotAction = { label: 'Practise an objection', href: '/practice?tab=dialer' };
const REPORTS_ACTION: CopilotAction = { label: 'Open Reports', href: '/reports' };
const DIALER_ACTION: CopilotAction = { label: 'Open the Dialer', href: '/dialer' };

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

function historyBlock(history: Turn[]) {
  if (!history.length) return '';
  return `\nCONVERSATION SO FAR (most recent last, use it for follow-ups like "make it shorter"):\n${history
    .map((t) => `${t.from === 'user' ? 'User' : 'Copilot'}: ${t.text}`)
    .join('\n')}\n`;
}

/** Compact JSON for prompts: drops empty fields. */
const compact = (v: unknown) => JSON.stringify(v, (_k, x) => (x === null || (Array.isArray(x) && x.length === 0) ? undefined : x));

// ------------------------------------------------------------------ team report email

export async function reportEmailReply(
  data: ReportData,
  ctx: { tenantName: string; senderName: string; activeMembers?: number; apiKey?: string },
): Promise<CopilotReply> {
  const draft = composeReportEmail(data, ctx);
  const quality = dataQuality(data);
  let report = draft;
  let source = 'rules';

  // No activity: the deterministic "not enough data" report is the honest answer; no AI needed.
  if (quality !== 'none' && ctx.apiKey) {
    const prompt = `You write a short sales activity report email from a sales manager to their team and leadership.
Return JSON only, exactly this shape:
{"subject": string, "summary": [string, string], "wins": string[], "risks": string[], "nextSteps": [string, string, string]}

Rules:
- Use ONLY numbers that appear in DATA or DRAFT. Never calculate new numbers, percentages, averages or differences. If a number isn't there, don't mention one.
- Use only rep names that appear in DATA. Never invent people, companies or events.
- summary: exactly 2 short sentences (max 28 words each): the headline result, then the most important pattern.
- wins: 2-4 bullets (top performers, what is working). risks: 2-4 bullets: who needs coaching and on what, and the top objections. nextSteps: exactly 3 specific actions for next ${data.period.includes('day') || data.period === 'today' ? 'day' : 'week'}.
- Every bullet is one plain sentence, max 26 words. No markdown, no emojis, no hype.
- subject: under 90 characters and includes "${data.periodLabel}".
${quality === 'thin' ? '- DATA is thin: say plainly that the numbers are early signals, and do not single out any rep for coaching from so few calls.\n' : ''}${data.source === 'demo_sample' ? '- This is the demo workspace sample data; write it as a normal report.\n' : ''}
WORKSPACE: ${ctx.tenantName}
PERIOD: ${data.periodLabel} (${data.rangeLabel}); comparison window: ${data.previous ? data.previousLabel : 'none available'}
DATA: ${compact({ totals: data.totals, previous: data.previous, reps: data.reps, objections: data.objections, outcomes: data.outcomes, keyNumbers: draft.metrics })}
DRAFT (correct facts you may reword and improve): ${compact({ subject: draft.subject, summary: draft.summary, wins: draft.wins, risks: draft.risks, nextSteps: draft.nextSteps })}`;

    const winner = await raceGemini(ctx.apiKey, prompt, {
      json: true,
      timeoutMs: 12000,
      maxTokens: 1200,
      temperature: 0.3,
      accept: (t) => !!parseJsonObject(t),
    });
    const ai = winner ? parseJsonObject<Record<string, unknown>>(winner.text) : null;
    if (ai) {
      const known = knownNumbers(data, draft);
      const ok = (s: string) => !!s && usesOnlyKnownNumbers(s, known);
      const lines = (v: unknown, max: number) =>
        (Array.isArray(v) ? v : [])
          .map((x) => clip(x, 260))
          .filter(ok)
          .slice(0, max);
      const subject = clip(ai.subject, 120);
      const summary = lines(ai.summary, 2);
      const wins = lines(ai.wins, 4);
      const risks = lines(ai.risks, 4);
      const nextSteps = lines(ai.nextSteps, 3);
      report = {
        ...draft,
        subject: ok(subject) ? subject : draft.subject,
        summary: summary.length === 2 ? summary : draft.summary,
        wins: wins.length ? wins : draft.wins,
        risks: risks.length ? risks : draft.risks,
        nextSteps: nextSteps.length === 3 ? nextSteps : draft.nextSteps,
        writer: 'ai',
      };
      source = `gemini_${winner!.model}`;
    }
  }

  const intro =
    quality === 'none'
      ? `There isn't enough data for a real report ${data.periodLabel.toLowerCase()} yet, so here's a short, honest one you can send.`
      : `Here's your ${data.scope === 'rep' ? 'activity' : 'team'} report for ${data.periodLabel.toLowerCase()} (${data.rangeLabel}). Every number comes from ${
          data.source === 'demo_sample' ? 'the demo sample data in Reports' : 'your activity log'
        }.`;
  return { answer: intro, category: 'report_email', source, report, actions: [REPORTS_ACTION] };
}

// ------------------------------------------------------------------ coaching / objections (deterministic)

function presetFor(label: string, presets: ARMRebuttal[]): ARMRebuttal | undefined {
  const id = OBJECTION_RULES.find((r) => r.label === label)?.presetId;
  return id ? presets.find((p) => p.id === id) : undefined;
}

const fill = (s: string, tenantName: string) =>
  s.replace(/\{\{first_name\}\}/g, '[name]').replace(/\{\{company\}\}/g, '[their company]').replace(/\{\{my_company\}\}/g, tenantName);

export function coachingReply(data: ReportData): CopilotReply {
  const head = `### Who needs coaching: ${data.periodLabel} (${data.rangeLabel})`;
  if (data.totals.activities === 0)
    return {
      answer: `${head}\n\nNo calls were logged ${data.periodLabel.toLowerCase()}, so there's nothing to judge yet.\n\nLog every call outcome in the **Dialer** and ask again once the team has a few calls in.`,
      category: 'coaching',
      actions: [DIALER_ACTION],
    };
  const list = coachingCandidates(data);
  const rows = data.reps
    .slice(0, 10)
    .map((r) => `| ${r.name} | ${fmtInt(r.dials)} | ${r.connectRate === null ? 'n/a' : `${r.connectRate}%`} | ${fmtInt(r.meetings)} |`)
    .join('\n');
  const body = list.length
    ? list.map((c) => `- **${c.rep.name}**: ${c.reason}. Focus on ${c.focus}.`).join('\n')
    : data.reps.filter((r) => r.dials >= 5).length < 2
    ? '- Not enough calls per rep yet to compare people fairly (each rep needs at least 5 dials this period).'
    : '- Nobody stands out as behind: every rep with 5+ dials is close to the team average.';
  const team = `Team: ${plural(data.totals.dials, 'dial')}, ${data.totals.connectRate === null ? 'no connect rate yet' : `${data.totals.connectRate}% connect rate`}, ${plural(data.totals.meetings, 'meeting')} booked.`;
  return {
    answer: `${head}\n\n${team}\n\n${body}\n\n| Rep | Dials | Connect rate | Meetings |\n| :--- | :--- | :--- | :--- |\n${rows}${
      data.objections[0] ? `\n\n> Most common objection: **${data.objections[0].label}** (${plural(data.objections[0].count, 'time')}).` : ''
    }`,
    category: 'coaching',
    actions: [PRACTICE_ACTION, REPORTS_ACTION],
  };
}

export function objectionStatsReply(data: ReportData, ctx: { isDemo: boolean; tenantName: string; scopeLabel: string }): CopilotReply {
  const head = `### Top objections${ctx.scopeLabel}: ${data.periodLabel} (${data.rangeLabel})`;
  if (!data.objections.length) {
    return {
      answer: `${head}\n\nNo objections are recorded for ${data.periodLabel.toLowerCase()} yet${
        data.totals.activities ? ` (${plural(data.totals.activities, 'activity', 'activities')} logged, none with an objection in the outcome or notes)` : ''
      }.\n\nPick an outcome like **Not interested: no budget** in the Dialer, or write the objection in your call notes, and it will show up here.`,
      category: 'objection_stats',
      actions: [DIALER_ACTION],
    };
  }
  const presets = getPresetRebuttals(ctx.isDemo);
  const lines = data.objections.map((o, i) => `${i + 1}. **${o.label}**: ${plural(o.count, 'time')}`).join('\n');
  const top = data.objections[0];
  const p = presetFor(top.label, presets);
  const line = p ? `\n\n**Suggested line for "${top.label}"**\n\n> ${fill(p.fullSpoken, ctx.tenantName)}` : '';
  return {
    answer: `${head}\n\n${lines}${line}`,
    category: 'objection_stats',
    actions: [PRACTICE_ACTION],
  };
}

export function personalSummaryReply(data: ReportData | null, ctx: { askedForTeam: boolean }): CopilotReply {
  const note = ctx.askedForTeam ? 'Team reports are for supervisors, managers and admins, so here is your own summary instead.\n\n' : '';
  if (!data) {
    return {
      answer: `${note}I couldn't read your activity just now. Open **Reports** to see your numbers, or try again in a moment.`,
      category: 'personal_summary',
      actions: [REPORTS_ACTION],
    };
  }
  const head = `### Your activity: ${data.periodLabel} (${data.rangeLabel})`;
  if (data.totals.activities === 0) {
    return {
      answer: `${note}${head}\n\nYou haven't logged any calls, emails or LinkedIn touches ${data.periodLabel.toLowerCase()} yet.\n\nPick an outcome after each call in the **Dialer** and it will count here and in Reports.`,
      category: 'personal_summary',
      actions: [DIALER_ACTION, PRACTICE_ACTION],
    };
  }
  const rows = reportMetrics(data)
    .map((m) => `| ${m.label} | ${m.value} |`)
    .join('\n');
  const obj = data.objections.length ? `\n\n**Objections you heard:** ${data.objections.map((o) => `${o.label} (${o.count})`).join(', ')}.` : '';
  const sample = data.source === 'demo_sample' ? '\n\n> Demo workspace: these are the sample numbers shown in Reports.' : '';
  return {
    answer: `${note}${head}\n\n| Metric | You |\n| :--- | :--- |\n${rows}${obj}${sample}`,
    category: 'personal_summary',
    actions: [PRACTICE_ACTION, REPORTS_ACTION],
  };
}

// ------------------------------------------------------------------ rep helpers (objections, emails, LinkedIn)

function sellerContext(isDemo: boolean, tenantName: string) {
  return isDemo
    ? 'The seller is Appointmentlyy: an AI calling cockpit, private verified lead lists and AI practice for outbound BPO / sales teams. The usual next step is a 15-20 minute call with the founder, Emil.'
    : `The seller works at ${tenantName}. You don't know their product details, so keep it product-neutral and use [placeholders] for specifics the rep should fill in.`;
}

function presetLines(presets: ARMRebuttal[], tenantName: string) {
  return presets
    .map((p) => `- "${p.trigger}" → Acknowledge: ${fill(p.acknowledge, tenantName)} | Respond: ${fill(p.respond, tenantName)} | Move: ${fill(p.move, tenantName)}`)
    .join('\n');
}

/** The preset that best matches the objection in the question. */
function matchPreset(question: string, presets: ARMRebuttal[]): ARMRebuttal | undefined {
  const q = question.toLowerCase();
  const byId = (id: string) => presets.find((p) => p.id === id);
  if (/budget|afford|fiscal/.test(q)) return byId('OBJ_NO_BUDGET');
  if (/price|pricing|cost|expensive|how much/.test(q)) return byId('OBJ_PRICING');
  // 'outsource accelerator' stays as a legacy match for questions that still name it (matching only).
  if (/broker|outsource accelerator|lead (list|vendor)s?/.test(q)) return byId('OBJ_SHARED_LEADS_OA') || byId('OBJ_HAVE_TEAM');
  if (/vendor|already|in-house|internal|own team|provider|agency|competitor|incumbent/.test(q)) return byId('OBJ_HAVE_TEAM');
  if (/e-?mail|busy|bad time|not a good time|call me later/.test(q)) return byId('OBJ_SEND_EMAIL');
  if (/number|how did you get/.test(q)) return byId('OBJ_HOW_DID_YOU_GET_NUMBER');
  if (/not interested/.test(q)) return byId('OBJ_NOT_INTERESTED') || byId('OBJ_SEND_EMAIL');
  return undefined;
}

function armMarkdown(o: { objection: string; acknowledge: string; respond: string; move: string; alternative?: string; tip?: string }) {
  return `### Handling "${o.objection}"

**Acknowledge:** ${o.acknowledge}

**Respond:** ${o.respond}

**Move:** ${o.move}

> Say it in one go: "${o.acknowledge} ${o.respond} ${o.move}"${o.alternative ? `\n\n**If they push again:** "${o.alternative}"` : ''}${o.tip ? `\n\n*Tip:* ${o.tip}` : ''}`;
}

const MAX_LINE_WORDS = 32;

async function objectionReply(question: string, ctx: WritingContext): Promise<CopilotReply> {
  const presets = getPresetRebuttals(ctx.isDemo);
  const preset = matchPreset(question, presets);
  const prompt = `You coach SDRs on live cold calls. Give ONE rebuttal for the objection in the request, in A.R.M. form (Acknowledge, Respond, Move).
Return JSON only: {"objection": string, "acknowledge": string, "respond": string, "move": string, "alternative": string, "tip": string}
Rules:
- objection: the objection as the prospect would say it, max 10 words.
- acknowledge, respond, move: ONE short spoken sentence each, max 22 words, natural and calm, never pushy. Move ends with a question that earns the next step (a short call or a diagnostic question).
- alternative: one full spoken line (max 30 words) if they push back again. tip: one coaching tip, max 20 words.
- Never invent prices, statistics, customer names, guarantees, ROI or payback claims. Use [name] and [their company] for the prospect.
- If one of the team's approved rebuttals fits, keep its angle and tighten the wording.
SELLER: ${sellerContext(ctx.isDemo, ctx.tenantName)}
TEAM'S APPROVED REBUTTALS (from the Dialer):
${presetLines(presets, ctx.tenantName)}
${historyBlock(ctx.history)}
REQUEST: ${question}`;
  const winner = await raceGemini(ctx.apiKey, prompt, {
    json: true,
    timeoutMs: 10000,
    maxTokens: 600,
    temperature: 0.4,
    accept: (t) => {
      const o = parseJsonObject<Record<string, unknown>>(t);
      return !!o && ['acknowledge', 'respond', 'move'].every((k) => typeof o[k] === 'string' && wordCount(o[k] as string) <= MAX_LINE_WORDS && wordCount(o[k] as string) > 1);
    },
  });
  const o = winner ? parseJsonObject<Record<string, unknown>>(winner.text) : null;
  if (o) {
    return {
      answer: armMarkdown({
        objection: clip(o.objection, 90) || clip(question, 90),
        acknowledge: clip(o.acknowledge, 220),
        respond: clip(o.respond, 220),
        move: clip(o.move, 220),
        alternative: wordCount(clip(o.alternative, 260)) <= 40 ? clip(o.alternative, 260) : undefined,
        tip: wordCount(clip(o.tip, 200)) <= 28 ? clip(o.tip, 200) : undefined,
      }),
      category: 'objection_help',
      source: `gemini_${winner!.model}`,
      actions: [PRACTICE_ACTION],
    };
  }
  if (preset) {
    return {
      answer: armMarkdown({
        objection: preset.trigger.replace(/[.]$/, ''),
        acknowledge: fill(preset.acknowledge, ctx.tenantName),
        respond: fill(preset.respond, ctx.tenantName),
        move: fill(preset.move, ctx.tenantName),
        tip: 'Pause after the acknowledge line. It lowers their guard before you respond.',
      }),
      category: 'objection_help',
      source: 'dialer_preset',
      actions: [PRACTICE_ACTION],
    };
  }
  return {
    answer: `### Handling objections with A.R.M.

**Acknowledge** what they said in one calm line, **Respond** with one reason it's still worth a look, then **Move** with a question that earns the next step.

Rebuttals your Dialer already has:

${presets.map((p) => `- **${p.shortLabel}**: "${fill(p.fullSpoken, ctx.tenantName)}"`).join('\n')}

Tell me the exact words the prospect used and I'll tailor a line.`,
    category: 'objection_help',
    source: 'dialer_preset',
    actions: [PRACTICE_ACTION],
  };
}

const EMAIL_MAX_WORDS = 90;

function emailTemplate(cold: boolean, senderFirst: string): CopilotDraft {
  const body = cold
    ? `Hi [name],\n\nNoticed [one specific thing about their company]. Teams in that spot often find [problem] eats more time than expected.\n\nWe help with [outcome], without changing how your team works today.\n\nWorth a 15-minute look, or not a priority right now?\n\n${senderFirst}`
    : `Hi [name],\n\nThanks for the time earlier. You mentioned [their priority], so I'll keep this short.\n\nI can send [one useful thing] or we can take 15 minutes next week to see if it fits.\n\nWhich is easier for you?\n\n${senderFirst}`;
  return { kind: 'email', subject: cold ? 'quick question' : 'following up', body, words: wordCount(body) };
}

async function emailReply(question: string, ctx: WritingContext): Promise<CopilotReply> {
  const cold = /\bcold\b|first (touch|email)|intro(duction)?\b|prospect/i.test(question) && !/follow/i.test(question);
  const senderFirst = ctx.senderName.split(/\s+/)[0] || ctx.senderName;
  const prompt = `Write a short ${cold ? 'cold' : 'follow-up'} sales email for the request below.
Return JSON only: {"subject": string, "body": string}
Rules:
- Anti-sales and human: plain words, no hype, no buzzwords, no "I hope this finds you well", no exclamation marks, no fake familiarity.
- body is UNDER ${EMAIL_MAX_WORDS} WORDS IN TOTAL, including the greeting, the call to action and the signature.
- One low-pressure call to action, phrased as a question.
- subject: 2-5 words, mostly lowercase.
- Use [name] and [their company] for the prospect and [brackets] for any detail you don't know. Never invent results, numbers, clients or facts.
- Greeting "Hi [name]," and sign off with just "${senderFirst}" on the last line. Use \\n for line breaks and \\n\\n between paragraphs.
SELLER: ${sellerContext(ctx.isDemo, ctx.tenantName)}
${historyBlock(ctx.history)}
REQUEST: ${question}`;
  const okBody = (o: Record<string, unknown> | null) => !!o && typeof o.body === 'string' && wordCount(o.body) <= EMAIL_MAX_WORDS && wordCount(o.body) >= 20;
  const winner = await raceGemini(ctx.apiKey, prompt, {
    json: true,
    timeoutMs: 10000,
    maxTokens: 500,
    temperature: 0.5,
    accept: (t) => okBody(parseJsonObject(t)),
  });
  const o = winner ? parseJsonObject<Record<string, unknown>>(winner.text) : null;
  let draft: CopilotDraft;
  let source: string;
  let lead: string;
  if (o && okBody(o)) {
    const body = String(o.body).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    draft = { kind: 'email', subject: clip(o.subject, 80) || 'quick question', body, words: wordCount(body) };
    source = `gemini_${winner!.model}`;
    lead = `Here's a ${cold ? 'cold' : 'follow-up'} email (${draft.words} words, signature included). Fill in anything in [brackets].`;
  } else {
    draft = emailTemplate(cold, senderFirst);
    source = 'template';
    lead = `The AI writer didn't respond in time, so here's a short ${cold ? 'cold' : 'follow-up'} template (${draft.words} words). Fill in the [brackets].`;
  }
  return {
    answer: `${lead}\n\n**Subject:** ${draft.subject}\n\n${draft.body}`,
    category: 'email_draft',
    source,
    draft,
  };
}

function linkedinTemplate(): CopilotDraft {
  const body = `Most cold calls aren't lost on price. They're lost in the first ten seconds.\n\nThis week I noticed the calls that went well all started the same way: I said why I was calling, plainly, and asked one real question about their day instead of pitching.\n\nThe calls that went badly? I rushed to explain what we do before they had any reason to care.\n\n[One sentence on what you changed or learned.]\n\nWhat's the opener that works best for you right now? Always keen to steal a good one.`;
  return { kind: 'linkedin', body, words: wordCount(body) };
}

async function linkedinReply(question: string, ctx: WritingContext): Promise<CopilotReply> {
  const prompt = `Write a LinkedIn post for a sales rep, for the request below.
Return JSON only: {"post": string}
Rules:
- 80 to 150 words.
- One idea: an insight or a short, true-to-life story from prospecting, cold calling or customer conversations. Hook in the first line.
- Short paragraphs of 1-2 sentences separated by \\n\\n.
- End with a soft call to action: a question to readers or an offer to share something. No hard pitch, no links.
- No invented numbers, clients, names or results; use [brackets] for any personal detail the rep should add.
- No emojis, no "I'm thrilled", at most 2 hashtags.
SELLER: ${sellerContext(ctx.isDemo, ctx.tenantName)}
${historyBlock(ctx.history)}
REQUEST: ${question}`;
  const okPost = (o: Record<string, unknown> | null) => !!o && typeof o.post === 'string' && wordCount(o.post) >= 70 && wordCount(o.post) <= 160;
  const winner = await raceGemini(ctx.apiKey, prompt, {
    json: true,
    timeoutMs: 10000,
    maxTokens: 700,
    temperature: 0.6,
    accept: (t) => okPost(parseJsonObject(t)),
  });
  const o = winner ? parseJsonObject<Record<string, unknown>>(winner.text) : null;
  if (o && okPost(o)) {
    const body = String(o.post).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const draft: CopilotDraft = { kind: 'linkedin', body, words: wordCount(body) };
    return {
      answer: `Here's a LinkedIn post (${draft.words} words):\n\n${body}`,
      category: 'linkedin_draft',
      source: `gemini_${winner!.model}`,
      draft,
    };
  }
  const draft = linkedinTemplate();
  return {
    answer: `The AI writer didn't respond in time, so here's a starter post (${draft.words} words). Add your own detail in the [brackets].\n\n${draft.body}`,
    category: 'linkedin_draft',
    source: 'template',
    draft,
  };
}

export interface WritingContext {
  isDemo: boolean;
  tenantName: string;
  senderName: string;
  history: Turn[];
  apiKey?: string;
}

export function writingReply(intent: 'objection_help' | 'email' | 'linkedin', question: string, ctx: WritingContext): Promise<CopilotReply> {
  if (intent === 'email') return emailReply(question, ctx);
  if (intent === 'linkedin') return linkedinReply(question, ctx);
  return objectionReply(question, ctx);
}

// ------------------------------------------------------------------ rep chat (anything else)

export async function repChatReply(
  question: string,
  ctx: WritingContext & {
    personal: ReportData | null;
    /** 'rep' (default): only their own numbers. 'lead': a supervisor/manager asking a non-data question. */
    audience?: 'rep' | 'lead';
    /** Extra real workspace context, e.g. the rep's own leads. */
    extraContext?: string;
  },
): Promise<CopilotReply> {
  const presets = getPresetRebuttals(ctx.isDemo);
  const personal = ctx.personal;
  const lead = ctx.audience === 'lead';
  const prompt = `You are Copilot, a practical sales coach for ${lead ? 'a sales team lead' : 'an SDR'} named ${ctx.senderName} at ${ctx.tenantName}.
You help with: objection handling (A.R.M.: Acknowledge, Respond, Move), short cold and follow-up emails, LinkedIn posts, call prep, openers and what to practise next.
Rules:
- Answer in under 150 words, in clean Markdown (short bullets, bold for key lines). Be specific and kind.
${
  lead
    ? '- You have no team performance data in this conversation; if the question needs numbers, say which data is missing (for example "log call outcomes in the Dialer").'
    : "- You only have THIS rep's own numbers and leads (below). Never discuss other reps or team performance; if asked for a team report, say team reports are for supervisors and managers and offer their own summary."
}
- Only cite numbers that appear below. Never invent numbers, names or facts.
SELLER: ${sellerContext(ctx.isDemo, ctx.tenantName)}
${lead ? '' : `MY NUMBERS (${personal ? `${personal.periodLabel}, ${personal.rangeLabel}` : 'unavailable'}): ${personal ? compact({ totals: personal.totals, objections: personal.objections }) : 'none'}\n`}${ctx.extraContext ? `${ctx.extraContext}\n` : ''}TEAM'S APPROVED REBUTTALS:
${presetLines(presets, ctx.tenantName)}
${historyBlock(ctx.history)}
QUESTION: ${question}`;
  const known = knownNumbers(prompt);
  const winner = await raceGemini(ctx.apiKey, prompt, {
    timeoutMs: 12000,
    maxTokens: 700,
    temperature: 0.4,
    accept: (t) => usesOnlyKnownNumbers(t, known),
  });
  if (winner) return { answer: winner.text, category: 'rep_coach', source: `gemini_${winner.model}`, actions: [PRACTICE_ACTION] };
  return {
    answer: `I can help you with:

- **Objections:** ask "How do I handle 'we don't have budget'?" and I'll give you Acknowledge, Respond and Move lines.
- **Emails:** "Write a follow-up email after a first call" (under 90 words).
- **LinkedIn:** "Draft a LinkedIn post about cold calling".
- **Your numbers:** "How am I doing this week?"`,
    category: 'rep_coach',
    source: 'rules',
    actions: [PRACTICE_ACTION],
  };
}
