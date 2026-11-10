/**
 * Workflow assistant engine (server-only): turns an untrusted spec (from Gemini or the rules
 * below) into a validated WorkflowSpec, then compiles it into canvas nodes and edges built only
 * from node types in the registry, with every property checked against the node's schema.
 *
 * Nothing here sends, saves or runs anything; the route decides what to persist.
 */
import crypto from 'node:crypto';
import { getNodeDefinition } from '@/registry';
import {
  CALL_OUTCOMES,
  TEXT_VARIABLES,
  formatWait,
  scrubDemoDeep,
  scrubDemoText,
  type AssistantAnswer,
  type AssistantQuestion,
  type CallOutcome,
  type CanvasEdgeLite,
  type CanvasNodeLite,
  type CanvasProposal,
  type ConditionField,
  type ConditionOperator,
  type PlanSetting,
  type PlanStep,
  type Recipient,
  type SpecStep,
  type SpecTrigger,
  type UnderstandingLine,
  type WaitUnit,
  type WorkflowPlan,
  type WorkflowSpec,
} from '@/lib/workflowAssistant';

export interface EngineContext {
  /** The platform's demo workspace (sending allowed, sample names allowed). */
  isDemo: boolean;
  connected: { slack: boolean; sms: boolean; google: boolean };
  timezone: string;
}

type Json = Record<string, unknown>;

const MAX_TOP_STEPS = 12;
const MAX_BRANCH_STEPS = 8;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

// ---------------------------------------------------------------------------------- text helpers

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');

/** Keep only {{ $json.<known variable> }} expressions; anything else ($env, $node, code) is removed. */
export function safeTemplate(text: string, max: number): string {
  const cleaned = text
    .slice(0, max * 2)
    .replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_m, expr: string) => {
      const m = expr.trim().match(/^\$json\.([A-Za-z]+)$/);
      return m && (TEXT_VARIABLES as readonly string[]).includes(m[1]) ? `{{ $json.${m[1]} }}` : '';
    })
    // Bracket placeholders like [Name] read as unfinished copy.
    .replace(/\[(first name|name|lead name|your name|company|company name)\]/gi, (_m, w: string) =>
      /company/i.test(w) ? '{{ $json.company }}' : /your/i.test(w) ? '{{ $json.repName }}' : '{{ $json.leadName }}',
    );
  return cleaned.slice(0, max).trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function htmlToBody(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Human-friendly view of template variables in plan and summary text. */
export function humanize(text: string): string {
  const names: Record<string, string> = {
    leadName: 'lead’s name',
    company: 'company',
    email: 'lead’s email',
    phone: 'lead’s phone',
    scheduledTime: 'meeting time',
    repName: 'rep’s name',
    title: 'job title',
  };
  return text.replace(/\{\{\s*\$json\.([A-Za-z]+)\s*\}\}/g, (_m, k: string) => `[${names[k] || k}]`);
}

const outcomeLabel = (o: CallOutcome) =>
  ({
    'Meeting Booked': 'Meeting booked',
    'Follow-up Required': 'Follow-up required',
    'Referral / Update Contact': 'Referral',
    'Call back': 'Call back',
    'No answer': 'No answer',
    'Not interested': 'Not interested',
    Disqualified: 'Disqualified',
    'Do not call': 'Do not call',
  })[o];

function matchOutcome(v: unknown): CallOutcome | null {
  const t = str(v, 60).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const exact = CALL_OUTCOMES.find((o) => o.toLowerCase() === str(v, 60).toLowerCase());
  if (exact) return exact;
  if (/book|meeting|appointment/.test(t)) return 'Meeting Booked';
  if (/no answer|unanswered|didn t answer|not answer|no pick/.test(t)) return 'No answer';
  if (/not interested/.test(t)) return 'Not interested';
  if (/call ?back/.test(t)) return 'Call back';
  if (/follow/.test(t)) return 'Follow-up Required';
  if (/refer/.test(t)) return 'Referral / Update Contact';
  if (/disqual/.test(t)) return 'Disqualified';
  if (/do not call|dnc/.test(t)) return 'Do not call';
  return null;
}

// ---------------------------------------------------------------------------------- spec validation

function cleanRecipient(v: unknown): Recipient {
  const t = str(v, 30).toLowerCase();
  if (/manager|supervisor|boss|team lead|owner|admin/.test(t)) return 'manager';
  if (/rep|agent|sdr|caller|owner/.test(t)) return 'rep';
  if (t === 'custom' || EMAIL_RE.test(t)) return 'custom';
  return 'lead';
}

function cleanUnit(v: unknown): WaitUnit {
  const t = str(v, 20).toLowerCase();
  if (t.startsWith('min')) return 'minutes';
  if (t.startsWith('h')) return 'hours';
  if (t.startsWith('w')) return 'days';
  return 'days';
}

function cleanWait(o: Json): SpecStep {
  const unitRaw = str(o.unit, 20).toLowerCase();
  let amount = Number(o.amount);
  if (!Number.isFinite(amount) || amount <= 0) amount = 1;
  if (unitRaw.startsWith('w')) amount *= 7;
  const unit = cleanUnit(o.unit);
  const max = unit === 'minutes' ? 59 * 24 : unit === 'hours' ? 24 * 30 : 90;
  return { type: 'wait', amount: Math.min(max, Math.max(1, Math.round(amount))), unit };
}

const CONDITION_FIELDS: ConditionField[] = ['no_answer_count', 'call_attempts', 'lead_score', 'has_email', 'has_phone', 'replied'];
const CONDITION_OPS: ConditionOperator[] = ['>=', '>', '==', '<', '<=', 'notEmpty'];

function cleanStep(raw: unknown, depth: number, issues: string[]): SpecStep | SpecStep[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Json;
  const type = str(o.type, 30).toLowerCase();
  switch (type) {
    case 'send_email':
    case 'email': {
      const to = cleanRecipient(o.to);
      const address = str(o.address ?? (EMAIL_RE.test(str(o.to, 120)) ? o.to : ''), 120);
      return {
        type: 'send_email',
        to: to === 'custom' && !EMAIL_RE.test(address) ? 'manager' : to,
        address: EMAIL_RE.test(address) ? address : '',
        subject: safeTemplate(str(o.subject, 200), 140),
        body: safeTemplate(str(o.body, 2400), 1500),
        purpose: str(o.purpose, 40),
      };
    }
    case 'send_sms':
    case 'sms':
    case 'text': {
      const phone = str(o.phone, 40).replace(/[^\d+()\s-]/g, '');
      return { type: 'send_sms', to: cleanRecipient(o.to), phone, message: safeTemplate(str(o.message, 600), 320) };
    }
    case 'slack_message':
    case 'slack': {
      let channel = str(o.channel, 80).replace(/\s+/g, '-');
      if (channel && !channel.startsWith('#') && !channel.startsWith('@')) channel = `#${channel}`;
      if (!/^[#@][\w.-]{1,79}$/.test(channel)) channel = '';
      return { type: 'slack_message', channel, message: safeTemplate(str(o.message, 600), 400), audience: str(o.audience, 40) };
    }
    case 'wait':
    case 'delay':
      return cleanWait(o);
    case 'update_lead':
    case 'move_stage': {
      const stage = str(o.stage ?? o.value, 40).replace(/[^\p{L}\p{N} &/-]/gu, '').trim();
      return { type: 'update_lead', stage: stage ? stage.replace(/^\w/, (c) => c.toUpperCase()) : 'Nurture' };
    }
    case 'linkedin_task':
    case 'linkedin': {
      const t = str(o.task, 20).toLowerCase();
      const task = t.startsWith('mess') || t === 'dm' ? 'message' : t.startsWith('eng') ? 'engage' : 'connect';
      return { type: 'linkedin_task', task, note: safeTemplate(str(o.note ?? o.message, 600), 300) };
    }
    case 'add_to_sheet':
    case 'google_sheet': {
      return { type: 'add_to_sheet', sheetName: str(o.sheetName ?? o.sheet, 60).replace(/[^\p{L}\p{N} _-]/gu, '') || 'Leads' };
    }
    case 'condition':
    case 'if': {
      const branch = (v: unknown) => cleanSteps(v, depth + 1, issues).slice(0, MAX_BRANCH_STEPS);
      if (depth > 0) {
        // One level of branching keeps the canvas readable: a nested If keeps its "yes" steps.
        issues.push('nested_condition_flattened');
        return branch(o.then);
      }
      const field = CONDITION_FIELDS.includes(o.field as ConditionField) ? (o.field as ConditionField) : 'no_answer_count';
      let operator = CONDITION_OPS.includes(o.operator as ConditionOperator) ? (o.operator as ConditionOperator) : '>=';
      let value = str(String(o.value ?? ''), 20);
      if (field === 'has_email' || field === 'has_phone') {
        operator = 'notEmpty';
        value = '';
      } else if (field === 'replied') {
        operator = '==';
        value = 'true';
      } else if (!/^\d{1,4}$/.test(value)) {
        value = field === 'lead_score' ? '80' : '3';
      }
      const then = branch(o.then);
      const otherwise = branch(o.otherwise ?? o.else);
      if (!then.length && !otherwise.length) return null;
      return { type: 'condition', field, operator, value, then, otherwise };
    }
    default:
      if (type) issues.push(`unknown_step:${type}`);
      return null;
  }
}

function cleanSteps(raw: unknown, depth: number, issues: string[]): SpecStep[] {
  const out: SpecStep[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, 30) : []) {
    const s = cleanStep(r, depth, issues);
    if (Array.isArray(s)) out.push(...s);
    else if (s) out.push(s);
  }
  // Two waits in a row become one, and a wait at the very end does nothing, so it's dropped.
  const tidy: SpecStep[] = [];
  for (const s of out) {
    if (s.type === 'wait' && tidy[tidy.length - 1]?.type === 'wait') {
      tidy[tidy.length - 1] = s;
      continue;
    }
    tidy.push(s);
  }
  while (tidy.length && tidy[tidy.length - 1].type === 'wait') tidy.pop();
  return tidy;
}

function cleanTrigger(raw: unknown): SpecTrigger | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Json;
  const type = str(o.type, 30).toLowerCase();
  if (type === 'call_outcome' || type === 'disposition') {
    const outcome = matchOutcome(o.outcome);
    return outcome ? { type: 'call_outcome', outcome } : null;
  }
  if (type === 'new_contacts' || type === 'csv_upload' || type === 'new_leads') return { type: 'new_contacts' };
  if (type === 'schedule') {
    const f = str(o.frequency, 20).toLowerCase();
    const frequency = f.startsWith('hour') ? 'hourly' : f.startsWith('weekd') ? 'weekdays' : f.startsWith('week') ? 'weekly' : 'daily';
    const m = str(o.time, 10).match(/^(\d{1,2}):(\d{2})$/);
    const time = m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : '09:00';
    return { type: 'schedule', frequency, time };
  }
  if (type === 'manual') return { type: 'manual' };
  if (type === 'webhook' || type === 'form') return { type: 'webhook', source: str(o.source, 60) || 'another app' };
  return null;
}

/**
 * Validate and repair an untrusted spec. Unknown steps are dropped, a condition is always the last
 * top-level step (later steps move into its "yes" branch), and empty emails get sensible copy.
 */
export function validateSpec(raw: unknown): { spec: WorkflowSpec | null; issues: string[] } {
  const issues: string[] = [];
  if (!raw || typeof raw !== 'object') return { spec: null, issues: ['not_an_object'] };
  const o = raw as Json;
  const trigger = cleanTrigger(o.trigger);
  if (!trigger) return { spec: null, issues: ['missing_trigger'] };
  let steps = cleanSteps(o.steps, 0, issues);

  const ci = steps.findIndex((s) => s.type === 'condition');
  if (ci >= 0 && ci < steps.length - 1) {
    const cond = steps[ci] as Extract<SpecStep, { type: 'condition' }>;
    cond.then = [...cond.then, ...steps.slice(ci + 1).filter((s) => s.type !== 'condition')].slice(0, MAX_BRANCH_STEPS);
    steps = steps.slice(0, ci + 1);
    issues.push('steps_after_condition_moved');
  }
  steps = steps.slice(0, MAX_TOP_STEPS);
  if (!steps.length) return { spec: null, issues: [...issues, 'no_steps'] };

  // Number the emails of a sequence and fill empty copy.
  const fill = (list: SpecStep[]) => {
    const emails = list.filter((s) => s.type === 'send_email' && s.to === 'lead').length;
    let n = 0;
    for (const s of list) {
      if (s.type === 'send_email') {
        if (s.to === 'lead') n++;
        const d = defaultEmail(s, trigger, emails > 1 ? n : 0, emails);
        if (!s.subject) s.subject = d.subject;
        if (!s.body) s.body = d.body;
      } else if (s.type === 'send_sms' && !s.message) {
        s.message = s.to === 'lead' ? 'Hi {{ $json.leadName }}, thanks for your time today. Reply here if you have any questions. {{ $json.repName }}' : 'Heads up: {{ $json.leadName }} from {{ $json.company }} needs your attention.';
      } else if (s.type === 'slack_message' && !s.message) {
        s.message = defaultAlert(trigger);
      } else if (s.type === 'linkedin_task' && !s.note) {
        s.note = 'Hi {{ $json.leadName }}, great to connect. I work with teams like {{ $json.company }} and would love to stay in touch.';
      } else if (s.type === 'condition') {
        fill(s.then);
        fill(s.otherwise);
      }
    }
  };
  fill(steps);

  const name = str(o.name, 80).replace(/[{}<>]/g, '') || defaultName(trigger, steps);
  return { spec: { name, trigger, steps }, issues };
}

function defaultName(trigger: SpecTrigger, steps: SpecStep[]): string {
  const emails = steps.filter((s) => s.type === 'send_email').length;
  if (trigger.type === 'call_outcome') {
    if (trigger.outcome === 'Meeting Booked') return 'Meeting booked: confirm and alert';
    if (trigger.outcome === 'No answer') return 'No answer: nurture and follow up';
    return `${outcomeLabel(trigger.outcome)} follow-up`;
  }
  if (trigger.type === 'new_contacts') return emails > 1 ? `New contacts: ${emails}-step email sequence` : 'New contacts follow-up';
  if (trigger.type === 'schedule') return 'Scheduled automation';
  return 'New automation';
}

function defaultAlert(trigger: SpecTrigger): string {
  if (trigger.type === 'call_outcome' && trigger.outcome === 'Meeting Booked') {
    return 'New meeting booked: {{ $json.leadName }} from {{ $json.company }} for {{ $json.scheduledTime }}, booked by {{ $json.repName }}.';
  }
  return 'Heads up: {{ $json.leadName }} from {{ $json.company }} needs attention.';
}

function defaultEmail(s: Extract<SpecStep, { type: 'send_email' }>, trigger: SpecTrigger, n: number, total: number) {
  const booked = trigger.type === 'call_outcome' && trigger.outcome === 'Meeting Booked';
  if (s.to !== 'lead') {
    return booked
      ? {
          subject: 'New meeting booked: {{ $json.leadName }} ({{ $json.company }})',
          body: '{{ $json.repName }} just booked a meeting with {{ $json.leadName }} from {{ $json.company }} for {{ $json.scheduledTime }}.\n\nNo action needed. This is an automatic alert.',
        }
      : {
          subject: 'Heads up: {{ $json.leadName }} ({{ $json.company }})',
          body: '{{ $json.leadName }} from {{ $json.company }} needs attention.\n\nThis is an automatic alert from your workflow.',
        };
  }
  if (booked || /confirm/i.test(s.purpose || '')) {
    return {
      subject: 'Your meeting is confirmed',
      body: 'Hi {{ $json.leadName }},\n\nThanks for booking a time with us. Your meeting is confirmed for {{ $json.scheduledTime }}, and a calendar invite is on its way.\n\nIf you need to change the time, just reply to this email.\n\nBest,\n{{ $json.repName }}',
    };
  }
  if (trigger.type === 'call_outcome' && trigger.outcome === 'No answer') {
    return {
      subject: 'Sorry I missed you, {{ $json.leadName }}',
      body: 'Hi {{ $json.leadName }},\n\nI tried to reach you by phone a few times but couldn’t catch you. Would a quick 15-minute call later this week work better?\n\nJust reply with a time that suits you.\n\nBest,\n{{ $json.repName }}',
    };
  }
  if (n > 0) {
    const seq = [
      {
        subject: 'Quick question for {{ $json.company }}',
        body: 'Hi {{ $json.leadName }},\n\nI help teams like {{ $json.company }} book more meetings without adding headcount. Would it be worth a quick 15-minute chat to see if it fits?\n\nBest,\n{{ $json.repName }}',
      },
      {
        subject: 'Following up, {{ $json.leadName }}',
        body: 'Hi {{ $json.leadName }},\n\nJust following up on my last note. Happy to share how similar teams handle this, in 15 minutes or less.\n\nWould later this week work?\n\nBest,\n{{ $json.repName }}',
      },
      {
        subject: 'Should I close the loop?',
        body: 'Hi {{ $json.leadName }},\n\nI haven’t heard back, so I’ll assume the timing isn’t right. If that changes, just reply and I’ll pick it up from here.\n\nBest,\n{{ $json.repName }}',
      },
    ];
    const pick = n === total && total >= 3 ? seq[2] : seq[Math.min(n - 1, 1)];
    return pick;
  }
  return {
    subject: 'Following up, {{ $json.leadName }}',
    body: 'Hi {{ $json.leadName }},\n\nThanks for your time. I wanted to follow up and see if a quick 15-minute call later this week would help.\n\nBest,\n{{ $json.repName }}',
  };
}

// ---------------------------------------------------------------------------------- understanding

function who(r: Recipient, address?: string): string {
  if (r === 'lead') return 'the lead';
  if (r === 'manager') return address ? `the manager (${address})` : 'the manager';
  if (r === 'rep') return address ? `the rep (${address})` : 'the rep';
  return address || 'someone';
}

export function triggerText(t: SpecTrigger): string {
  switch (t.type) {
    case 'call_outcome':
      return t.outcome === 'Meeting Booked'
        ? 'a rep books a meeting with a lead (call outcome “Meeting booked” in the Dialer)'
        : `a call is saved in the Dialer with the outcome “${outcomeLabel(t.outcome)}”`;
    case 'new_contacts':
      return 'new leads are added from a Contacts CSV upload';
    case 'schedule':
      return t.frequency === 'hourly'
        ? 'every hour'
        : `every ${t.frequency === 'weekdays' ? 'weekday' : t.frequency === 'weekly' ? 'Monday' : 'day'} at ${t.time}`;
    case 'manual':
      return 'you start it yourself from the canvas';
    case 'webhook':
      return `${t.source} sends new data`;
  }
}

export function conditionText(s: Extract<SpecStep, { type: 'condition' }>): string {
  const n = s.value;
  const amount = (noun: string) =>
    s.operator === '>=' ? `${n} or more ${noun}` : s.operator === '>' ? `more than ${n} ${noun}` : s.operator === '<' ? `fewer than ${n} ${noun}` : s.operator === '<=' ? `${n} or fewer ${noun}` : `exactly ${n} ${noun}`;
  switch (s.field) {
    case 'no_answer_count':
      return `the lead has had ${amount('“No answer” calls')}`;
    case 'call_attempts':
      return `the lead has been called ${amount('times').replace(' times', '')} times`;
    case 'lead_score':
      return `the lead score is ${s.operator === '>=' ? `${n} or higher` : s.operator === '<' ? `below ${n}` : `${s.operator} ${n}`}`;
    case 'has_email':
      return 'the lead has an email address';
    case 'has_phone':
      return 'the lead has a phone number';
    case 'replied':
      return 'the lead has replied';
  }
}

/** One short plain-English line for a step ("Email the lead: “Subject”"). */
export function stepSummary(s: SpecStep): string {
  return stepLine(s).text;
}

function stepLine(s: SpecStep): { kind: UnderstandingLine['kind']; text: string } {
  switch (s.type) {
    case 'send_email':
      return { kind: 'then', text: `Email ${who(s.to, s.address)}: “${clip(humanize(s.subject), 80)}”` };
    case 'send_sms':
      return { kind: 'then', text: `Text ${who(s.to, s.phone)}: “${clip(humanize(s.message), 80)}”` };
    case 'slack_message':
      return { kind: 'then', text: `${/manager/i.test(s.audience || '') ? 'Alert the manager' : 'Post an alert'} in Slack${s.channel ? ` (${s.channel})` : ''}: “${clip(humanize(s.message), 80)}”` };
    case 'wait':
      return { kind: 'wait', text: formatWait(s.amount, s.unit) };
    case 'update_lead':
      return { kind: 'then', text: `Move the lead to the “${s.stage}” stage` };
    case 'linkedin_task':
      return { kind: 'then', text: `Create a LinkedIn task for the rep (${s.task === 'connect' ? 'connection request' : s.task === 'message' ? 'direct message' : 'engage with a post'})` };
    case 'add_to_sheet':
      return { kind: 'then', text: `Add the lead to the Google Sheet tab “${s.sheetName}”` };
    case 'condition':
      return { kind: 'if', text: conditionText(s) };
  }
}

export function understandingLines(spec: WorkflowSpec): UnderstandingLine[] {
  const lines: UnderstandingLine[] = [{ kind: 'when', text: triggerText(spec.trigger), depth: 0 }];
  for (const s of spec.steps) {
    lines.push({ ...stepLine(s), depth: 0 });
    if (s.type === 'condition') {
      for (const t of s.then) lines.push({ ...stepLine(t), depth: 1 });
      lines.push({ kind: 'otherwise', text: s.otherwise.length ? '' : 'stop here (nothing else happens)', depth: 0 });
      for (const t of s.otherwise) lines.push({ ...stepLine(t), depth: 1 });
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------------- compile

const TRIGGER_TYPES = new Set(['webhookTrigger', 'scheduleTrigger', 'manualTrigger', 'emailTrigger', 'borisDispositionTrigger']);

const CONDITION_EXPR: Record<ConditionField, string> = {
  no_answer_count: '{{ $json.noAnswerCount }}',
  call_attempts: '{{ $json.callAttempts }}',
  lead_score: '{{ $json.leadScore }}',
  has_email: '{{ $json.email }}',
  has_phone: '{{ $json.phone }}',
  replied: '{{ $json.replied }}',
};

const WAIT_SECONDS: Record<WaitUnit, number> = { minutes: 60, hours: 3600, days: 86400 };

interface BuiltNode {
  node: CanvasNodeLite;
  /** Friendly fields for the plan. */
  kind: string;
  does: string;
  settings: PlanSetting[];
}

/**
 * Fill every schema property (so the config drawer never falls back to sample defaults), coerce
 * types and reject option values the node doesn't support.
 */
function conformConfig(nodeType: string, config: Json, ctx: EngineContext): Json {
  const def = getNodeDefinition(nodeType);
  if (!def) throw new Error(`Unknown node type ${nodeType}`);
  const out: Json = { ...config };
  for (const p of def.properties) {
    let v = out[p.name];
    if (v === undefined) v = typeof p.default === 'string' && !ctx.isDemo ? scrubDemoText(p.default) : p.default;
    if (p.type === 'options') {
      const allowed = (p.options || []).map((x) => x.value);
      if (!allowed.includes(String(v))) v = p.default;
    } else if (p.type === 'number') {
      const n = Number(v);
      v = Number.isFinite(n) ? n : p.default;
    } else if (p.type === 'boolean') {
      v = Boolean(v);
    } else if (typeof v !== 'string') {
      v = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    }
    out[p.name] = v;
  }
  return ctx.isDemo ? out : scrubDemoDeep(out);
}

function makeNode(id: string, nodeType: string, label: string, subtitle: string, config: Json, ctx: EngineContext): CanvasNodeLite {
  const def = getNodeDefinition(nodeType)!;
  const icon = nodeType === 'slackNode' ? 'Slack' : nodeType === 'linkedInNode' ? 'LinkedIn' : def.icon;
  const data: CanvasNodeLite['data'] = {
    nodeType: def.name,
    label: ctx.isDemo ? label : scrubDemoText(label),
    subtitle: ctx.isDemo ? subtitle : scrubDemoText(subtitle),
    category: def.category,
    icon,
    config: conformConfig(def.name, config, ctx),
  };
  if (TRIGGER_TYPES.has(def.name)) data.isTriggerPill = true;
  return { id, type: 'customNode', position: { x: 0, y: 0 }, data };
}

function cronFor(t: Extract<SpecTrigger, { type: 'schedule' }>): string {
  const [h, m] = t.time.split(':').map(Number);
  if (t.frequency === 'weekdays') return `${m} ${h} * * 1-5`;
  if (t.frequency === 'weekly') return `${m} ${h} * * 1`;
  return `${m} ${h} * * *`;
}

export function buildTriggerNode(t: SpecTrigger, id: string, ctx: EngineContext, usesLeadEmail: boolean): BuiltNode {
  switch (t.type) {
    case 'call_outcome':
      return {
        node: makeNode(id, 'borisDispositionTrigger', `Call outcome: ${outcomeLabel(t.outcome)}`, 'Saved in the Dialer', { dispositionFilter: t.outcome, requirePhone: false, requireEmail: usesLeadEmail }, ctx),
        kind: 'Trigger: call outcome',
        does: `Starts when ${triggerText(t)}.`,
        settings: [
          { label: 'Call outcome', value: outcomeLabel(t.outcome) },
          { label: 'Only leads with an email', value: usesLeadEmail ? 'Yes' : 'No' },
        ],
      };
    case 'new_contacts':
      return {
        node: makeNode(id, 'webhookTrigger', 'New leads from Contacts CSV', 'When a CSV upload adds leads', {
          httpMethod: 'POST',
          path: `new-contacts-${crypto.randomBytes(3).toString('hex')}`,
          responseMode: 'onReceived',
          authSecret: crypto.randomBytes(18).toString('base64url'),
        }, ctx),
        kind: 'Trigger: new contacts',
        does: 'Starts for each new lead added from a Contacts CSV upload.',
        settings: [{ label: 'Source', value: 'Contacts › Upload CSV' }],
      };
    case 'schedule': {
      const hourly = t.frequency === 'hourly';
      return {
        node: makeNode(id, 'scheduleTrigger', hourly ? 'Every hour' : `Every ${t.frequency === 'weekdays' ? 'weekday' : t.frequency === 'weekly' ? 'Monday' : 'day'} at ${t.time}`, `Time zone: ${ctx.timezone}`, {
          mode: hourly ? 'interval' : 'cron',
          intervalMinutes: 60,
          cronExpression: cronFor(t),
          timezone: ctx.timezone,
        }, ctx),
        kind: 'Trigger: schedule',
        does: `Starts ${triggerText(t)}.`,
        settings: [
          { label: 'Repeats', value: triggerText(t) },
          { label: 'Time zone', value: ctx.timezone },
        ],
      };
    }
    case 'manual':
      return {
        node: makeNode(id, 'manualTrigger', 'Start manually', 'Run from the canvas', { mockPayload: '{\n  "leadName": "Sample Lead",\n  "company": "Example Co",\n  "email": "lead@example.com"\n}' }, ctx),
        kind: 'Trigger: manual',
        does: 'Starts when you run it yourself.',
        settings: [],
      };
    case 'webhook':
      return {
        node: makeNode(id, 'webhookTrigger', `When ${clip(t.source, 30)} sends data`, 'Incoming webhook', {
          httpMethod: 'POST',
          path: `hook-${crypto.randomBytes(3).toString('hex')}`,
          responseMode: 'onReceived',
          authSecret: crypto.randomBytes(18).toString('base64url'),
        }, ctx),
        kind: 'Trigger: another app',
        does: `Starts when ${t.source} sends new data to this workflow.`,
        settings: [{ label: 'Source', value: t.source }],
      };
  }
}

export function buildStepNode(s: Exclude<SpecStep, { type: 'condition' }> | Extract<SpecStep, { type: 'condition' }>, id: string, ctx: EngineContext): BuiltNode {
  switch (s.type) {
    case 'send_email': {
      const to = s.to === 'lead' ? '{{ $json.email }}' : s.address || '';
      const label = s.to === 'lead' ? `Email lead: ${clip(humanize(s.subject), 34)}` : `Email ${s.to === 'manager' ? 'manager' : s.to === 'rep' ? 'rep' : s.address}: alert`;
      return {
        node: makeNode(id, 'resendNode', label, s.to === 'lead' ? 'To the lead' : s.address || `To the ${s.to === 'custom' ? 'recipient' : s.to}`, { to, subject: s.subject, htmlBody: bodyToHtml(s.body) }, ctx),
        kind: 'Send an email',
        does: `Emails ${who(s.to, s.address)}.`,
        settings: [
          { label: 'To', value: s.to === 'lead' ? 'The lead’s email address' : s.address || 'Not set yet' },
          { label: 'Subject', value: humanize(s.subject) },
          { label: 'Message', value: clip(humanize(s.body).replace(/\s*\n+\s*/g, ' '), 160) },
        ],
      };
    }
    case 'send_sms': {
      const to = s.to === 'lead' ? '{{ $json.phone }}' : s.phone || '';
      return {
        node: makeNode(id, 'twilioSmsNode', `Text ${s.to === 'lead' ? 'lead' : s.to}`, clip(humanize(s.message), 40), { operation: 'sendSms', to, from: '', message: s.message }, ctx),
        kind: 'Send a text message',
        does: `Texts ${who(s.to, s.phone)}.`,
        settings: [
          { label: 'To', value: s.to === 'lead' ? 'The lead’s phone number' : s.phone || 'Not set yet' },
          { label: 'Message', value: clip(humanize(s.message), 160) },
        ],
      };
    }
    case 'slack_message':
      return {
        node: makeNode(id, 'slackNode', /manager/i.test(s.audience || '') ? 'Slack alert to manager' : 'Slack alert', s.channel ? `channel: ${s.channel}` : 'Channel not chosen yet', { operation: 'postMessage', channel: s.channel, text: s.message }, ctx),
        kind: 'Slack message',
        does: `Posts an alert in Slack${s.channel ? ` (${s.channel})` : ''}.`,
        settings: [
          { label: 'Channel', value: s.channel || 'Not chosen yet' },
          { label: 'Message', value: clip(humanize(s.message), 160) },
        ],
      };
    case 'wait':
      return {
        node: makeNode(id, 'delayNode', `Wait ${formatWait(s.amount, s.unit)}`, 'Pause before the next step', { seconds: s.amount * WAIT_SECONDS[s.unit], unit: s.unit, amount: s.amount }, ctx),
        kind: 'Wait',
        does: `Pauses for ${formatWait(s.amount, s.unit)} before the next step.`,
        settings: [{ label: 'How long', value: formatWait(s.amount, s.unit) }],
      };
    case 'update_lead':
      return {
        node: makeNode(id, 'supabaseNode', `Move lead to ${s.stage}`, `Lead stage → ${s.stage}`, { operation: 'update', table: 'leads', field: 'stage', value: s.stage }, ctx),
        kind: 'Update the lead',
        does: `Moves the lead to the “${s.stage}” stage.`,
        settings: [{ label: 'New stage', value: s.stage }],
      };
    case 'linkedin_task': {
      const op = s.task === 'connect' ? 'sendConnectionInvite' : s.task === 'message' ? 'sendDirectMessage' : 'engagePost';
      return {
        node: makeNode(id, 'linkedInNode', 'LinkedIn task for the rep', s.task === 'connect' ? 'Connection request' : s.task === 'message' ? 'Direct message' : 'Engage with a post', { operation: op, profileUrl: '{{ $json.linkedInUrl }}', message: s.note, assignedRep: '{{ $json.repName }}' }, ctx),
        kind: 'LinkedIn task',
        does: 'Creates a task for the rep with a pre-written note. Nothing is posted automatically.',
        settings: [{ label: 'Note', value: clip(humanize(s.note), 160) }],
      };
    }
    case 'add_to_sheet':
      return {
        node: makeNode(id, 'googleSheetsNode', `Add to sheet: ${clip(s.sheetName, 24)}`, 'Append a row', { operation: 'appendRow', spreadsheetId: '', sheetName: s.sheetName }, ctx),
        kind: 'Google Sheets',
        does: `Adds the lead as a new row in the “${s.sheetName}” tab.`,
        settings: [{ label: 'Tab', value: s.sheetName }],
      };
    case 'condition':
      return {
        node: makeNode(id, 'ifNode', `If ${clip(conditionText(s), 40)}`, 'Yes → top · No → bottom', { field: CONDITION_EXPR[s.field], operator: s.operator, value: s.value }, ctx),
        kind: 'If / Branch',
        does: `Checks whether ${conditionText(s)}. “Yes” continues on the top path, “No” on the bottom path.`,
        settings: [{ label: 'Check', value: conditionText(s) }],
      };
  }
}

/** What the admin still has to fill in or connect for one node. */
export function nodeTodo(node: CanvasNodeLite, ctx: EngineContext): string[] {
  const c = (node.data.config || {}) as Json;
  const out: string[] = [];
  const val = (k: string) => (typeof c[k] === 'string' ? (c[k] as string).trim() : c[k]);
  switch (node.data.nodeType) {
    case 'resendNode':
      if (!val('to')) out.push('Add the email address this goes to');
      if (!val('subject') || !val('htmlBody')) out.push('Write the email');
      if (!ctx.isDemo) out.push('Connect your email in Admin › Integrations (sending is paused until then)');
      break;
    case 'twilioSmsNode':
      if (!val('to')) out.push('Add the phone number this text goes to');
      if (!val('from')) out.push('Add the phone number texts are sent from');
      if (!ctx.connected.sms) out.push('Connect text messaging (SMS) in Admin › Integrations');
      break;
    case 'slackNode':
      if (!val('channel') || !/^[#@][\w.-]+$/.test(String(val('channel')))) out.push('Choose the Slack channel');
      if (!ctx.connected.slack) out.push('Connect Slack in Admin › Integrations');
      break;
    case 'googleSheetsNode':
      if (!val('spreadsheetId')) out.push('Choose which Google Sheet to use');
      if (!ctx.connected.google) out.push('Connect Google in Admin › Integrations');
      break;
    case 'webhookTrigger':
      if (/^new-contacts-/.test(String(val('path') || ''))) out.push('Link Contacts CSV uploads to this workflow before you switch it on');
      else out.push('Give the other app this workflow’s webhook address');
      break;
    default:
      break;
  }
  return out;
}

export interface CompiledWorkflow {
  nodes: CanvasNodeLite[];
  edges: CanvasEdgeLite[];
  plan: WorkflowPlan;
}

const COL = 300;
const ROW_MAIN = 200;
const ROW_YES = 70;
const ROW_NO = 340;

export function compileSpec(spec: WorkflowSpec, ctx: EngineContext): CompiledWorkflow {
  const prefix = `ai${Date.now().toString(36)}`;
  let seq = 0;
  const nextId = () => `${prefix}-${++seq}`;
  const nodes: CanvasNodeLite[] = [];
  const edges: CanvasEdgeLite[] = [];
  const planSteps: PlanStep[] = [];

  const usesLeadEmail = JSON.stringify(spec.steps).includes('"to":"lead"') && /send_email/.test(JSON.stringify(spec.steps));
  const add = (b: BuiltNode, x: number, y: number, branch?: string) => {
    b.node.position = { x, y };
    nodes.push(b.node);
    planSteps.push({
      number: planSteps.length + 1,
      kind: b.kind,
      title: b.node.data.label,
      does: b.does,
      settings: b.settings.map((s) => ({ label: s.label, value: ctx.isDemo ? s.value : scrubDemoText(s.value) })),
      todo: nodeTodo(b.node, ctx),
      branch,
    });
    return b.node.id;
  };
  const link = (source: string, target: string, sourceHandle = 'output') =>
    edges.push({ id: `${prefix}-e${edges.length + 1}`, source, target, sourceHandle, targetHandle: 'input' });

  let prev = add(buildTriggerNode(spec.trigger, nextId(), ctx, usesLeadEmail), 80, ROW_MAIN);
  let col = 1;
  for (const s of spec.steps) {
    const id = add(buildStepNode(s, nextId(), ctx), 80 + col * COL, ROW_MAIN);
    link(prev, id);
    prev = id;
    col++;
    if (s.type === 'condition') {
      const branchCol = col;
      const chain = (list: SpecStep[], handle: 'true' | 'false', y: number, label: string) => {
        let from = id;
        let c = branchCol;
        let first = true;
        for (const t of list) {
          const tid = add(buildStepNode(t, nextId(), ctx), 80 + c * COL, y, label);
          link(from, tid, first ? handle : 'output');
          first = false;
          from = tid;
          c++;
        }
      };
      chain(s.then, 'true', ROW_YES, 'If yes');
      chain(s.otherwise, 'false', ROW_NO, 'If no');
    }
  }

  const todo = [...new Set(planSteps.flatMap((p) => p.todo))];
  return { nodes, edges, plan: { name: spec.name, steps: planSteps, todo } };
}

// ---------------------------------------------------------------------------------- rules fallback

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, once: 1, twice: 2 };
const toNum = (s: string | undefined) => (s ? (NUM_WORDS[s.toLowerCase()] ?? Number(s)) : NaN);

function detectTrigger(t: string): SpecTrigger | null {
  if (/\b(csv|upload(ed|s)?|import(ed|s)?|new contacts?|new leads?|added to contacts)\b/.test(t)) return { type: 'new_contacts' };
  if (/(doesn'?t|does not|didn'?t|did not|don'?t|do not|can'?t|never)\s+(answer|pick up)|no[- ]answer|unanswered|not answer/.test(t)) return { type: 'call_outcome', outcome: 'No answer' };
  if (/\b(booked|books|book a (meeting|demo|call)|meeting is (set|scheduled)|schedules? a (meeting|demo))\b/.test(t)) return { type: 'call_outcome', outcome: 'Meeting Booked' };
  if (/not interested/.test(t)) return { type: 'call_outcome', outcome: 'Not interested' };
  if (/call ?back/.test(t)) return { type: 'call_outcome', outcome: 'Call back' };
  if (/disqualif/.test(t)) return { type: 'call_outcome', outcome: 'Disqualified' };
  if (/do not call|\bdnc\b/.test(t)) return { type: 'call_outcome', outcome: 'Do not call' };
  if (/referr/.test(t)) return { type: 'call_outcome', outcome: 'Referral / Update Contact' };
  const sched = t.match(/every (hour|day|morning|weekday|monday|week)|\b(daily|weekly|hourly)\b/);
  if (sched) {
    const w = sched[1] || sched[2];
    const frequency = /hour/.test(w) ? 'hourly' : /weekday/.test(w) ? 'weekdays' : /week|monday/.test(w) ? 'weekly' : 'daily';
    const tm = t.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    let time = '09:00';
    if (tm) {
      let h = Number(tm[1]) % 24;
      if (tm[3] === 'pm' && h < 12) h += 12;
      if (tm[3] === 'am' && h === 12) h = 0;
      time = `${String(h).padStart(2, '0')}:${tm[2] || '00'}`;
    }
    return { type: 'schedule', frequency, time };
  }
  return null;
}

function answerFor(answers: AssistantAnswer[], id: string): string {
  return (answers.find((a) => a.id === id)?.answer || '').trim();
}

function parseWaitText(t: string): { amount: number; unit: WaitUnit } | null {
  if (/right away|immediately|straight away|same time|no wait/.test(t)) return { amount: 0, unit: 'days' };
  const m = t.match(/(\d+|one|two|three|four|five|six|seven)\s*(minute|min|hour|hr|day|week)s?/);
  if (!m) return null;
  let amount = toNum(m[1]);
  let unit: WaitUnit = /min/.test(m[2]) ? 'minutes' : /h/.test(m[2]) ? 'hours' : 'days';
  if (/week/.test(m[2])) {
    amount *= 7;
    unit = 'days';
  }
  return Number.isFinite(amount) && amount > 0 ? { amount, unit } : null;
}

type RulesResult = { kind: 'questions'; intro: string; questions: AssistantQuestion[] } | { kind: 'spec'; spec: WorkflowSpec } | null;

/**
 * Deterministic interpreter for common requests (used when Gemini is unavailable or returns
 * something unusable). Asks at most one round of questions.
 */
export function interpretWithRules(request: string, answers: AssistantAnswer[]): RulesResult {
  const t = request.toLowerCase().replace(/[’']/g, "'");
  const answered = answers.length > 0;
  const questions: AssistantQuestion[] = [];

  let trigger = detectTrigger(t);
  const trigAns = answerFor(answers, 'trigger').toLowerCase();
  if (!trigger && trigAns) {
    trigger = detectTrigger(trigAns) || (/myself|manual/.test(trigAns) ? { type: 'manual' } : /schedule|every/.test(trigAns) ? { type: 'schedule', frequency: 'daily', time: '09:00' } : /call/.test(trigAns) ? { type: 'call_outcome', outcome: matchOutcome(trigAns) || 'Meeting Booked' } : null);
  }
  if (!trigger) {
    if (answered) return null;
    questions.push({ id: 'trigger', question: 'What should start this workflow?', options: ['A rep books a meeting', 'A call ends with no answer', 'New leads are uploaded (CSV)', 'Every weekday morning'] });
  }

  const steps: SpecStep[] = [];
  const clauses = t.split(/,|;|\band then\b|\bthen\b|\band\b|\balso\b/).map((c) => c.trim()).filter(Boolean);
  let pendingWait: { amount: number; unit: WaitUnit } | null = null;
  const managerRe = /\b(manager|supervisor|boss|team lead|sales lead|head of sales|owner)\b/;

  for (const c of clauses) {
    const w = c.match(/\b(wait|after|later|delay)\b/) ? parseWaitText(c) : null;
    if (w && w.amount > 0) pendingWait = w;
    const pushStep = (s: SpecStep) => {
      if (pendingWait) steps.push({ type: 'wait', ...pendingWait });
      pendingWait = null;
      steps.push(s);
    };

    const seq = c.match(/(\d+|two|three|four|five)[- ](step|email|touch|part)/);
    if (seq && /e-?mail|sequence|cadence|step|touch/.test(c)) {
      const n = Math.min(5, Math.max(2, toNum(seq[1])));
      let gap = parseWaitText(c.replace(seq[0], ''));
      const spacing = answerFor(answers, 'spacing').toLowerCase();
      if (!gap && spacing) gap = parseWaitText(spacing);
      if (!gap) {
        if (!answered) questions.push({ id: 'spacing', question: 'How far apart should the emails go out?', options: ['1 day apart', '2 days apart', '3 days apart'] });
        gap = { amount: 2, unit: 'days' };
      }
      for (let i = 0; i < n; i++) {
        if (i > 0) steps.push({ type: 'wait', amount: gap.amount || 2, unit: gap.unit });
        steps.push({ type: 'send_email', to: 'lead', address: '', subject: '', body: '' });
      }
      continue;
    }

    if (managerRe.test(c) && /alert|notify|tell|let|ping|message|email|text|inform|loop in|cc/.test(c)) {
      const chAns = answerFor(answers, 'manager_channel').toLowerCase();
      const contact = answerFor(answers, 'manager_contact');
      const ch = /slack/.test(c) ? 'slack' : /\b(text|sms)\b/.test(c) ? 'sms' : /e-?mail/.test(c) ? 'email' : /slack/.test(chAns) ? 'slack' : /text|sms/.test(chAns) ? 'sms' : /e-?mail/.test(chAns) ? 'email' : '';
      if (!ch && !answered) {
        questions.push({ id: 'manager_channel', question: 'How should we alert the manager?', options: ['Email', 'Slack message', 'Text message'] });
        questions.push({ id: 'manager_contact', question: 'What’s the manager’s email or Slack channel? (optional)', options: ['I’ll add it later'] });
      }
      const email = contact.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}/)?.[0] || c.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}/)?.[0] || '';
      const channel = contact.match(/#[\w.-]+/)?.[0] || c.match(/#[\w.-]+/)?.[0] || '';
      if (ch === 'slack') pushStep({ type: 'slack_message', channel, message: '', audience: 'manager' });
      else if (ch === 'sms') pushStep({ type: 'send_sms', to: 'manager', phone: '', message: '' });
      else pushStep({ type: 'send_email', to: 'manager', address: email, subject: '', body: '' });
      continue;
    }

    const move = c.match(/\b(move|put|change|set|mark|add)\b.*?\b(?:to|in|into|as)\s+(?:the\s+)?([a-z][a-z -]{1,24}?)(?:\s+(?:stage|list|status|bucket|pipeline))?$/);
    if (move && !/e-?mail|text|sms|slack|sheet/.test(c)) {
      const stage = move[2].replace(/\b(stage|list|status|bucket)\b/g, '').trim();
      pushStep({ type: 'update_lead', stage: stage.replace(/\b\w/g, (x) => x.toUpperCase()) || 'Nurture' });
      continue;
    }
    if (/\bnurture\b/.test(c) && !/e-?mail/.test(c)) {
      pushStep({ type: 'update_lead', stage: 'Nurture' });
      continue;
    }
    if (/slack/.test(c)) {
      pushStep({ type: 'slack_message', channel: c.match(/#[\w.-]+/)?.[0] || '', message: '' });
      continue;
    }
    if (/linkedin/.test(c)) {
      pushStep({ type: 'linkedin_task', task: /message|dm|inmail/.test(c) ? 'message' : 'connect', note: '' });
      continue;
    }
    if (/\b(google )?sheet|spreadsheet\b/.test(c)) {
      pushStep({ type: 'add_to_sheet', sheetName: 'Leads' });
      continue;
    }
    if (/\b(text|sms)\b/.test(c)) {
      pushStep({ type: 'send_sms', to: 'lead', phone: '', message: '' });
      continue;
    }
    if (/e-?mail/.test(c)) {
      const purpose = /confirm/.test(c) ? 'confirmation' : /follow/.test(c) ? 'follow-up' : '';
      // "follow-up email" after a no-answer: ask when, once.
      if (purpose === 'follow-up' && !pendingWait && !steps.some((s) => s.type === 'wait')) {
        const timing = answerFor(answers, 'followup_timing').toLowerCase();
        const w2 = timing ? parseWaitText(timing) : null;
        if (!timing && !answered) questions.push({ id: 'followup_timing', question: 'When should the follow-up email go out?', options: ['Right away', '1 day later', '3 days later'] });
        if (w2 && w2.amount > 0) pendingWait = w2;
      }
      pushStep({ type: 'send_email', to: 'lead', address: '', subject: '', body: '', purpose });
      continue;
    }
  }

  if (questions.length && !answered) {
    return { kind: 'questions', intro: 'A couple of quick questions so I build the right thing:', questions: questions.slice(0, 3) };
  }
  if (!trigger || !steps.length) return null;

  let finalSteps = steps;
  if (trigger.type === 'call_outcome' && trigger.outcome === 'No answer') {
    const m = t.match(/(\d+|one|two|three|four|five|six|seven|once|twice)\s*(times|x|attempts|calls|tries|dials)/);
    const n = m ? toNum(m[1]) : NaN;
    if (Number.isFinite(n) && n > 1) {
      finalSteps = [{ type: 'condition', field: 'no_answer_count', operator: '>=', value: String(n), then: steps, otherwise: [] }];
    }
  }
  const v = validateSpec({ trigger, steps: finalSteps });
  return v.spec ? { kind: 'spec', spec: v.spec } : null;
}

// ---------------------------------------------------------------------------------- canvas edits

/** Step order on the canvas: from the trigger(s), following edges; anything unreachable last. */
export function orderNodes(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[]): CanvasNodeLite[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Set(edges.map((e) => e.target));
  const starts = nodes.filter((n) => !incoming.has(n.id)).sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
  const seen = new Set<string>();
  const out: CanvasNodeLite[] = [];
  const queue = [...starts];
  while (queue.length) {
    const n = queue.shift()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    const next = edges
      .filter((e) => e.source === n.id)
      .sort((a, b) => (a.sourceHandle === 'false' ? 1 : 0) - (b.sourceHandle === 'false' ? 1 : 0))
      .map((e) => byId.get(e.target))
      .filter((x): x is CanvasNodeLite => Boolean(x));
    queue.push(...next);
  }
  for (const n of nodes) if (!seen.has(n.id)) out.push(n);
  return out;
}

/** Read a canvas node back into a spec step (or trigger) so edits go through the same builder. */
export function readNode(node: CanvasNodeLite): { trigger?: SpecTrigger; step?: SpecStep } | null {
  const c = (node.data.config || {}) as Json;
  const s = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  switch (node.data.nodeType) {
    case 'borisDispositionTrigger': {
      const o = matchOutcome(c.dispositionFilter);
      return o ? { trigger: { type: 'call_outcome', outcome: o } } : null;
    }
    case 'webhookTrigger':
      return /^new-contacts-/.test(s('path')) ? { trigger: { type: 'new_contacts' } } : { trigger: { type: 'webhook', source: 'another app' } };
    case 'manualTrigger':
      return { trigger: { type: 'manual' } };
    case 'delayNode': {
      const unit = (['minutes', 'hours', 'days'] as const).includes(c.unit as WaitUnit) ? (c.unit as WaitUnit) : null;
      const amount = Number(c.amount);
      if (unit && Number.isFinite(amount) && amount > 0) return { step: { type: 'wait', amount, unit } };
      const sec = Number(c.seconds) || 0;
      if (sec >= 86400 && sec % 86400 === 0) return { step: { type: 'wait', amount: sec / 86400, unit: 'days' } };
      if (sec >= 3600 && sec % 3600 === 0) return { step: { type: 'wait', amount: sec / 3600, unit: 'hours' } };
      return { step: { type: 'wait', amount: Math.max(1, Math.round(sec / 60)), unit: 'minutes' } };
    }
    case 'resendNode': {
      const to = s('to');
      const lead = /\$json\.email/.test(to);
      return { step: { type: 'send_email', to: lead ? 'lead' : 'custom', address: lead ? '' : to, subject: s('subject'), body: htmlToBody(s('htmlBody')) } };
    }
    case 'twilioSmsNode': {
      const to = s('to');
      const lead = /\$json\.phone/.test(to);
      return { step: { type: 'send_sms', to: lead ? 'lead' : 'custom', phone: lead ? '' : to, message: s('message') } };
    }
    case 'slackNode':
      return { step: { type: 'slack_message', channel: s('channel'), message: s('text') } };
    case 'supabaseNode':
      return { step: { type: 'update_lead', stage: s('value') || 'Nurture' } };
    case 'linkedInNode': {
      const op = s('operation');
      return { step: { type: 'linkedin_task', task: op === 'sendDirectMessage' ? 'message' : op === 'engagePost' ? 'engage' : 'connect', note: s('message') } };
    }
    case 'googleSheetsNode':
      return { step: { type: 'add_to_sheet', sheetName: s('sheetName') || 'Leads' } };
    default:
      return null;
  }
}

/** Friendly one-line value of a step, used for diffs ("1 day → 2 days"). */
function stepFields(step: SpecStep | SpecTrigger): Record<string, string> {
  switch (step.type) {
    case 'wait':
      return { Wait: formatWait(step.amount, step.unit) };
    case 'send_email':
      return { To: step.to === 'lead' ? 'the lead' : step.address || 'not set', Subject: humanize(step.subject), Message: clip(humanize(step.body).replace(/\s+/g, ' '), 90) };
    case 'send_sms':
      return { To: step.to === 'lead' ? 'the lead' : step.phone || 'not set', Message: clip(humanize(step.message), 90) };
    case 'slack_message':
      return { Channel: step.channel || 'not chosen', Message: clip(humanize(step.message), 90) };
    case 'update_lead':
      return { Stage: step.stage };
    case 'linkedin_task':
      return { Task: step.task, Note: clip(humanize(step.note), 90) };
    case 'add_to_sheet':
      return { Tab: step.sheetName };
    case 'call_outcome':
      return { 'Call outcome': outcomeLabel(step.outcome) };
    default:
      return {};
  }
}

/** Plain-English description of one canvas node (for "explain step 2"). */
export function describeNode(node: CanvasNodeLite, index: number, ctx: EngineContext): string {
  const read = readNode(node);
  let text: string;
  if (read?.trigger) text = `Step ${index} starts the workflow when ${triggerText(read.trigger)}.`;
  else if (read?.step) {
    const b = buildStepNode(read.step, node.id, ctx);
    text = `Step ${index}, “${node.data.label}”: ${b.does}${b.settings.length ? ' ' + b.settings.map((x) => `${x.label}: ${x.value}`).join('. ') + '.' : ''}`;
  } else if (node.data.nodeType === 'ifNode') {
    const c = (node.data.config || {}) as Json;
    text = `Step ${index}, “${node.data.label}”, checks a condition (${humanize(String(c.field || ''))} ${String(c.operator || '')} ${String(c.value || '')}). The top path runs when it’s true, the bottom path when it isn’t.`;
  } else {
    const def = getNodeDefinition(node.data.nodeType);
    text = `Step ${index}, “${node.data.label}”: ${def?.description || 'a workflow step'}.`;
  }
  const todo = nodeTodo(node, ctx);
  if (todo.length) text += ` Still to do: ${todo.join('; ')}.`;
  return ctx.isDemo ? text : scrubDemoText(text);
}

export function todoAnswer(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], ctx: EngineContext): string {
  const ordered = orderNodes(nodes, edges);
  const lines: string[] = [];
  ordered.forEach((n, i) => {
    for (const t of nodeTodo(n, ctx)) lines.push(`Step ${i + 1} (${n.data.label}): ${t}`);
  });
  if (!nodes.length) return 'This workflow is empty. Describe what you want to automate and I’ll add the steps.';
  if (!lines.length) return 'Everything is filled in. Review the wording of each message, then ask your platform team to switch the workflow on.';
  return `Here’s what’s left before this workflow can be switched on:\n${lines.map((l) => `• ${l}`).join('\n')}`;
}

export type EditOp =
  | { op: 'update'; nodeId: string; settings: Json }
  | { op: 'add'; afterNodeId?: string; step: Json }
  | { op: 'remove'; nodeId: string }
  /** Set one schema property of a node (checked against the registry). */
  | { op: 'set_config'; nodeId: string; key: string; value: unknown }
  | { op: 'connect'; source: string; target: string; sourceHandle?: string }
  | { op: 'remove_edge'; edgeId: string }
  /** Add (or replace) the trigger and connect it to the first steps. */
  | { op: 'set_trigger'; trigger: Json };

function cleanOps(raw: unknown): EditOp[] {
  const out: EditOp[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, 4) : []) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Json;
    const op = str(o.op, 10);
    if (op === 'update' && typeof o.nodeId === 'string' && o.settings && typeof o.settings === 'object') out.push({ op, nodeId: o.nodeId, settings: o.settings as Json });
    else if (op === 'add' && o.step && typeof o.step === 'object') out.push({ op, afterNodeId: typeof o.afterNodeId === 'string' ? o.afterNodeId : undefined, step: o.step as Json });
    else if (op === 'remove' && typeof o.nodeId === 'string') out.push({ op, nodeId: o.nodeId });
    else if (op === 'set_config' && typeof o.nodeId === 'string' && typeof o.key === 'string') out.push({ op, nodeId: o.nodeId, key: o.key, value: o.value });
    else if (op === 'connect' && typeof o.source === 'string' && typeof o.target === 'string') out.push({ op, source: o.source, target: o.target, sourceHandle: typeof o.sourceHandle === 'string' ? o.sourceHandle : undefined });
    else if (op === 'remove_edge' && typeof o.edgeId === 'string') out.push({ op, edgeId: o.edgeId });
    else if (op === 'set_trigger' && o.trigger && typeof o.trigger === 'object') out.push({ op, trigger: o.trigger as Json });
  }
  return out;
}

const SECRET_KEYS = new Set(['authSecret']);

/** Coerce a value for one registry property; null when the key or value isn't allowed. */
function coerceProperty(nodeType: string, key: string, value: unknown): { value: unknown; label: string } | null {
  const def = getNodeDefinition(nodeType);
  const p = def?.properties.find((x) => x.name === key);
  if (!p) return null;
  if (p.type === 'options') {
    const v = String(value ?? '');
    return (p.options || []).some((o) => o.value === v) ? { value: v, label: p.displayName } : null;
  }
  if (p.type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? { value: n, label: p.displayName } : null;
  }
  if (p.type === 'boolean') return { value: Boolean(value), label: p.displayName };
  if (p.type === 'code') return null; // never let the assistant write code
  const text = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  // Expressions are limited to known lead fields; HTML bodies keep their markup.
  return { value: safeTemplate(text, 4000), label: p.displayName };
}

const autoLabel = (node: CanvasNodeLite, ctx: EngineContext): string | null => {
  const r = readNode(node);
  if (r?.step) return buildStepNode(r.step, node.id, ctx).node.data.label;
  if (r?.trigger) return buildTriggerNode(r.trigger, node.id, ctx, false).node.data.label;
  return null;
};

/**
 * Turn untrusted edit operations into a proposal: the full replacement nodes, any new nodes and the
 * new edge list, with a plain-English diff. Returns null when no operation is valid.
 */
export function buildProposal(rawOps: unknown, nodesIn: CanvasNodeLite[], edgesIn: CanvasEdgeLite[], ctx: EngineContext): CanvasProposal | { error: string } | null {
  const ops = cleanOps(rawOps);
  if (!ops.length) return null;
  let nodes: CanvasNodeLite[] = nodesIn.map((n) => ({ ...n, position: { ...(n.position || { x: 0, y: 0 }) }, data: { ...n.data, config: { ...(n.data.config || {}) } } }));
  let edges = edgesIn.map((e) => ({ ...e }));
  const updated = new Map<string, CanvasNodeLite>();
  const added: CanvasNodeLite[] = [];
  const removedIds: string[] = [];
  const changes: string[] = [];
  const summaries: string[] = [];
  const ordered = () => orderNodes(nodes, edges);

  for (const op of ops) {
    if (op.op === 'update') {
      const node = nodes.find((n) => n.id === op.nodeId);
      if (!node) continue;
      const read = readNode(node);
      const settings = op.settings;
      const newLabel = str(settings.label, 60);
      let next: CanvasNodeLite | null = null;
      let before: Record<string, string> = {};
      let after: Record<string, string> = {};
      if (read?.step && read.step.type !== 'condition') {
        const merged: Json = { ...read.step };
        for (const [k, v] of Object.entries(settings)) if (k !== 'label' && k !== 'type' && v !== undefined && v !== null && v !== '') merged[k] = v;
        if (read.step.type === 'send_email' && typeof settings.to === 'string') {
          const to = settings.to.trim();
          if (/^(the )?lead$/i.test(to)) Object.assign(merged, { to: 'lead', address: '' });
          else if (EMAIL_RE.test(to)) Object.assign(merged, { to: 'custom', address: to });
          else delete merged.to;
          if (!merged.to) merged.to = read.step.to;
        }
        const cleaned = cleanStep(merged, 1, []);
        if (!cleaned || Array.isArray(cleaned)) continue;
        // Keep the step's own copy when the model only changed other fields.
        if (cleaned.type === 'send_email' && read.step.type === 'send_email') {
          if (!str(settings.subject, 200)) cleaned.subject = read.step.subject;
          if (!str(settings.body, 2400)) cleaned.body = read.step.body;
        }
        const built = buildStepNode(cleaned, node.id, ctx).node;
        before = stepFields(read.step);
        after = stepFields(cleaned);
        const oldAuto = autoLabel(node, ctx);
        next = {
          ...node,
          data: {
            ...node.data,
            config: { ...(node.data.config || {}), ...built.data.config },
            label: newLabel || (oldAuto && oldAuto === node.data.label ? built.data.label : node.data.label),
            subtitle: oldAuto && oldAuto === node.data.label ? built.data.subtitle : node.data.subtitle,
          },
        };
      } else if (read?.trigger && read.trigger.type === 'call_outcome') {
        const outcome = matchOutcome(settings.outcome) || read.trigger.outcome;
        const built = buildTriggerNode({ type: 'call_outcome', outcome }, node.id, ctx, Boolean((node.data.config as Json)?.requireEmail)).node;
        before = stepFields(read.trigger);
        after = stepFields({ type: 'call_outcome', outcome });
        next = { ...node, data: { ...node.data, config: { ...(node.data.config || {}), dispositionFilter: outcome }, label: newLabel || built.data.label } };
      } else if (node.data.nodeType === 'ifNode') {
        const c = (node.data.config || {}) as Json;
        const value = str(String(settings.value ?? ''), 20);
        if (!/^\d{1,4}$/.test(value) && !newLabel) continue;
        before = { Threshold: String(c.value ?? '') };
        after = { Threshold: value || String(c.value ?? '') };
        const label = newLabel || (typeof node.data.label === 'string' ? node.data.label.replace(String(c.value ?? ''), value || String(c.value ?? '')) : node.data.label);
        next = { ...node, data: { ...node.data, label, config: { ...c, value: value || c.value } } };
      } else if (newLabel) {
        next = { ...node, data: { ...node.data, label: newLabel } };
      }
      if (!next) continue;
      if (newLabel && newLabel !== node.data.label) {
        before.Name = node.data.label;
        after.Name = newLabel;
      }
      const diffs = Object.keys(after).filter((k) => before[k] !== after[k]).map((k) => `${k}: ${before[k] ?? '—'} → ${after[k]}`);
      if (!diffs.length) continue;
      changes.push(...diffs.map((d) => `“${node.data.label}”: ${d}`));
      const first = Object.keys(after).find((k) => before[k] !== after[k])!;
      summaries.push(read?.step?.type === 'wait' ? `I’ll change ${node.data.label.startsWith('Wait') ? 'Wait' : `“${node.data.label}”`} from ${before[first]} to ${after[first]}` : `I’ll change the ${first.toLowerCase()} of “${node.data.label}” from “${clip(before[first] ?? '', 50)}” to “${clip(after[first], 50)}”`);
      nodes = nodes.map((n) => (n.id === node.id ? next! : n));
      updated.set(node.id, next);
    } else if (op.op === 'add') {
      const issues: string[] = [];
      const step = cleanStep(op.step, 1, issues);
      if (!step || Array.isArray(step) || step.type === 'condition') continue;
      const v = validateSpec({ trigger: { type: 'manual' }, steps: [step] });
      const filled = v.spec?.steps[0];
      if (!filled) continue;
      const list = ordered();
      let anchor = op.afterNodeId ? nodes.find((n) => n.id === op.afterNodeId) : undefined;
      if (!anchor) {
        const leaves = list.filter((n) => !edges.some((e) => e.source === n.id));
        anchor = leaves.sort((a, b) => (b.position?.x ?? 0) - (a.position?.x ?? 0))[0] || list[list.length - 1];
      }
      if (!anchor) continue;
      const id = `ai${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
      const built = buildStepNode(filled, id, ctx).node;
      const ax = anchor.position?.x ?? 0;
      const ay = anchor.position?.y ?? ROW_MAIN;
      built.position = { x: ax + COL, y: ay };
      // Make room: everything to the right of the anchor moves one column right.
      nodes = nodes.map((n) => {
        if ((n.position?.x ?? 0) > ax) {
          const moved = { ...n, position: { x: (n.position?.x ?? 0) + COL, y: n.position?.y ?? 0 } };
          if (!added.some((a) => a.id === n.id)) updated.set(n.id, moved);
          else added.splice(added.findIndex((a) => a.id === n.id), 1, moved);
          return moved;
        }
        return n;
      });
      const handle = anchor.data.nodeType === 'ifNode' ? 'true' : 'output';
      const outs = edges.filter((e) => e.source === anchor!.id && (anchor!.data.nodeType !== 'ifNode' || e.sourceHandle === 'true'));
      edges = edges.filter((e) => !outs.includes(e));
      edges.push({ id: `${id}-in`, source: anchor.id, target: id, sourceHandle: handle, targetHandle: 'input' });
      outs.forEach((e, i) => edges.push({ id: `${id}-out${i}`, source: id, target: e.target, sourceHandle: 'output', targetHandle: e.targetHandle || 'input' }));
      nodes.push(built);
      added.push(built);
      const line = stepLine(filled).text;
      changes.push(`New step after “${anchor.data.label}”: ${line}`);
      summaries.push(`I’ll add a step after “${anchor.data.label}”: ${line.charAt(0).toLowerCase()}${line.slice(1)}`);
    } else if (op.op === 'remove') {
      const node = nodes.find((n) => n.id === op.nodeId);
      if (!node) continue;
      if (TRIGGER_TYPES.has(node.data.nodeType)) return { error: 'The first step starts the workflow, so it can’t be removed. You can change what starts it instead.' };
      const ins = edges.filter((e) => e.target === node.id);
      const outs = edges.filter((e) => e.source === node.id);
      edges = edges.filter((e) => e.source !== node.id && e.target !== node.id);
      for (const i of ins) for (const o of outs) edges.push({ id: `${i.id}-${o.target}`, source: i.source, target: o.target, sourceHandle: i.sourceHandle || 'output', targetHandle: o.targetHandle || 'input' });
      nodes = nodes.filter((n) => n.id !== node.id);
      updated.delete(node.id);
      const ai = added.findIndex((a) => a.id === node.id);
      if (ai >= 0) added.splice(ai, 1);
      else removedIds.push(node.id);
      changes.push(`Remove “${node.data.label}”`);
      summaries.push(`I’ll remove “${node.data.label}” and connect the steps around it`);
    } else if (op.op === 'set_config') {
      const node = nodes.find((n) => n.id === op.nodeId);
      if (!node) continue;
      const c = coerceProperty(node.data.nodeType, op.key, op.value);
      if (!c) continue;
      const oldVal = (node.data.config || {})[op.key];
      if (JSON.stringify(oldVal) === JSON.stringify(c.value)) continue;
      const show = (v: unknown) => (SECRET_KEYS.has(op.key) ? (v ? '••••••' : 'empty') : clip(humanize(htmlToBody(String(v ?? ''))) || 'empty', 60));
      const next = { ...node, data: { ...node.data, config: { ...(node.data.config || {}), [op.key]: c.value } } };
      if (node.data.nodeType === 'slackNode' && op.key === 'channel') next.data.subtitle = `channel: ${String(c.value)}`;
      if (node.data.nodeType === 'resendNode' && op.key === 'to' && !/\$json/.test(String(c.value))) next.data.subtitle = String(c.value);
      nodes = nodes.map((n) => (n.id === node.id ? next : n));
      const ai = added.findIndex((a) => a.id === node.id);
      if (ai >= 0) added.splice(ai, 1, next);
      else updated.set(node.id, next);
      changes.push(`“${node.data.label}”: ${c.label}: ${show(oldVal)} → ${show(c.value)}`);
      summaries.push(`I’ll set “${c.label}” on “${node.data.label}” to ${SECRET_KEYS.has(op.key) ? 'a new random secret' : `“${show(c.value)}”`}`);
    } else if (op.op === 'connect') {
      const a = nodes.find((n) => n.id === op.source);
      const b = nodes.find((n) => n.id === op.target);
      if (!a || !b || a.id === b.id || TRIGGER_TYPES.has(b.data.nodeType)) continue;
      const handle = a.data.nodeType === 'ifNode' ? (op.sourceHandle === 'false' ? 'false' : 'true') : 'output';
      if (edges.some((e) => e.source === a.id && e.target === b.id && (e.sourceHandle || 'output') === handle)) continue;
      edges.push({ id: `ai-c-${a.id}-${b.id}`, source: a.id, target: b.id, sourceHandle: handle, targetHandle: 'input' });
      changes.push(`Connect “${a.data.label}” → “${b.data.label}”`);
      summaries.push(`I’ll connect “${a.data.label}” to “${b.data.label}” so it runs after it`);
    } else if (op.op === 'remove_edge') {
      const e = edges.find((x) => x.id === op.edgeId);
      if (!e) continue;
      edges = edges.filter((x) => x.id !== op.edgeId);
      const a = nodes.find((n) => n.id === e.source)?.data.label || 'a missing step';
      const b = nodes.find((n) => n.id === e.target)?.data.label || 'a missing step';
      changes.push(`Remove the broken connection “${a}” → “${b}”`);
      if (!summaries.some((x) => x.startsWith('I’ll remove the broken'))) summaries.push('I’ll remove the broken connections');
    } else if (op.op === 'set_trigger') {
      const trigger = cleanTrigger(op.trigger);
      if (!trigger) continue;
      const old = nodes.find((n) => TRIGGER_TYPES.has(n.data.nodeType));
      const id = `ai${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
      const built = buildTriggerNode(trigger, id, ctx, true).node;
      if (old) {
        built.position = { ...(old.position || { x: 80, y: ROW_MAIN }) };
        edges = edges.map((e) => (e.source === old.id ? { ...e, source: id } : e));
        nodes = nodes.filter((n) => n.id !== old.id);
        updated.delete(old.id);
        removedIds.push(old.id);
        changes.push(`Replace the start “${old.data.label}” with “${built.data.label}”`);
      } else {
        const minX = Math.min(...nodes.map((n) => n.position?.x ?? 0), 380);
        built.position = { x: minX - COL, y: ROW_MAIN };
        const roots = nodes.filter((n) => !edges.some((e) => e.target === n.id));
        roots.forEach((r) => edges.push({ id: `${id}-${r.id}`, source: id, target: r.id, sourceHandle: 'output', targetHandle: 'input' }));
        changes.push(`Add “${built.data.label}” as the start${roots.length ? `, connected to “${roots[0].data.label}”` : ''}`);
      }
      nodes.push(built);
      added.push(built);
      summaries.push(`I’ll start the workflow when ${triggerText(trigger)}`);
    }
  }

  if (!changes.length) return null;
  const scrub = <T,>(v: T): T => (ctx.isDemo ? v : scrubDemoDeep(v));
  // "I'll change Wait from 2 days to 3 days" twice reads as "both waits".
  const unique = [...new Set(summaries)];
  const merged = unique.map((u) => {
    const n = summaries.filter((x) => x === u).length;
    return n > 1 && u.startsWith('I’ll change Wait ') ? u.replace('I’ll change Wait ', `I’ll change ${n === 2 ? 'both waits' : `all ${n} waits`} `) : u;
  });
  return {
    summary: scrub(`${merged.join('. ')}.`),
    changes: scrub(changes),
    updated: [...updated.values()],
    added,
    removedIds,
    edges,
  };
}

/** Rules for the canvas chat: what's left, explain step N, change waits, add a Slack alert. */
export function editWithRules(message: string, nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], ctx: EngineContext):
  | { kind: 'answer'; text: string }
  | { kind: 'ops'; ops: EditOp[] }
  | { kind: 'check'; intro: string }
  | { kind: 'test' }
  | { kind: 'ask_step'; afterNodeId: string; label: string }
  | null {
  const t = message.toLowerCase().replace(/[’']/g, "'");
  const ordered = orderNodes(nodes, edges);
  if (/\b(test|dry[- ]?run|try it|simulate)\b/.test(t) && !/\b(add|email|text)\b/.test(t)) return { kind: 'test' };
  if (/(is ?n'?t|is not|not|doesn'?t|does not|won'?t|never) (send|sending|work|working|run|running|fire|firing|go|going)|broken|nothing happen|why (isn'?t|doesn'?t|won'?t)|what'?s wrong|problem/.test(t)) {
    return { kind: 'check', intro: 'Let me look. This is a draft, so it doesn’t run until it’s switched on, and here’s what I found on the canvas:' };
  }
  if (/\b(check|validate|verify|review)\b|is it (ready|working|done)|ready\??$|what('s| is) left|still (need|to do)|left to (set|config|do|fill)|missing|to configure|finish (setting|it)|set up\??$|not (set|done)|fix (it|this|my)/.test(t)) {
    return { kind: 'check', intro: '' };
  }
  const stepNo = t.match(/\bstep\s*(\d{1,2})\b/);
  const target = stepNo ? ordered[Number(stepNo[1]) - 1] : undefined;
  if (/\b(explain|what does|what is|what's|tell me about|describe)\b/.test(t)) {
    const byName = target || ordered.find((n) => t.includes(n.data.label.toLowerCase())) || (/wait|delay/.test(t) ? ordered.find((n) => n.data.nodeType === 'delayNode') : undefined) || (/\bif\b|condition|branch/.test(t) ? ordered.find((n) => n.data.nodeType === 'ifNode') : undefined) || (/trigger|start/.test(t) ? ordered[0] : undefined);
    if (byName) return { kind: 'answer', text: describeNode(byName, ordered.indexOf(byName) + 1, ctx) };
    if (/workflow|this|it\b/.test(t)) return { kind: 'answer', text: ordered.map((n, i) => describeNode(n, i + 1, ctx)).join('\n') };
  }
  const w = /wait|delay|pause/.test(t) ? parseWaitText(t) : null;
  if (w && w.amount > 0) {
    const waits = target?.data.nodeType === 'delayNode' ? [target] : ordered.filter((n) => n.data.nodeType === 'delayNode');
    if (waits.length) return { kind: 'ops', ops: waits.map((n) => ({ op: 'update' as const, nodeId: n.id, settings: { amount: w.amount, unit: w.unit } })) };
  }
  const after = t.match(/\b(?:add|insert|put)\b.*\b(?:after|before)\s+(?:the\s+)?(?:(step\s*\d+)|([a-z][a-z ]{1,30}?))(?:\s+step)?\s*$/);
  if (after && !/e-?mail|text|sms|slack|wait \d|linkedin|sheet|nurture|stage/.test(t.replace(after[0].match(/after.*$/)?.[0] || '', ''))) {
    const ref = after[1] ? ordered[Number(after[1].replace(/\D/g, '')) - 1] : ordered.find((n) => n.data.label.toLowerCase().includes(after[2]?.trim() || '~') || (/wait|delay/.test(after[2] || '') && n.data.nodeType === 'delayNode') || (/trigger|start/.test(after[2] || '') && n === ordered[0]) || (/email/.test(after[2] || '') && n.data.nodeType === 'resendNode'));
    if (ref) return { kind: 'ask_step', afterNodeId: ref.id, label: ref.data.label };
  }
  if (/\b(add|append|include|also)\b/.test(t) && /slack/.test(t)) {
    return { kind: 'ops', ops: [{ op: 'add', step: { type: 'slack_message', channel: t.match(/#[\w.-]+/)?.[0] || '', message: '', audience: /manager/.test(t) ? 'manager' : '' } }] };
  }
  if (/\b(remove|delete|drop)\b/.test(t) && target) return { kind: 'ops', ops: [{ op: 'remove', nodeId: target.id }] };
  return null;
}

/** Compact view of the canvas for the model (no secrets, no webhook tokens). */
export function canvasForPrompt(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[]): string {
  const ordered = orderNodes(nodes, edges);
  return ordered
    .map((n, i) => {
      const read = readNode(n);
      const fields = read?.step ? stepFields(read.step) : read?.trigger ? stepFields(read.trigger) : {};
      const kind = read?.step?.type || (read?.trigger ? 'trigger' : n.data.nodeType === 'ifNode' ? 'condition' : n.data.nodeType);
      const settings = Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
      return `${i + 1}. id=${n.id} kind=${kind} label=${JSON.stringify(n.data.label)}${settings ? ` (${settings})` : ''}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------------- prompts

const STEP_CATALOG = `TRIGGER (exactly one):
- {"type":"call_outcome","outcome": one of ${JSON.stringify(CALL_OUTCOMES)}}  (a rep saves a call outcome in the Dialer; "booked" = "Meeting Booked"; "doesn't answer" = "No answer")
- {"type":"new_contacts"}  (new leads added from a Contacts CSV upload)
- {"type":"schedule","frequency":"hourly|daily|weekdays|weekly","time":"HH:MM"}
- {"type":"manual"}  (the admin starts it)
- {"type":"webhook","source":"name of the other app or form"}
STEPS (in order):
- {"type":"send_email","to":"lead|manager|rep|custom","address":"email if the user gave one, else empty","subject":"...","body":"plain text, short paragraphs separated by blank lines","purpose":"confirmation|follow-up|alert|sequence"}
- {"type":"send_sms","to":"lead|manager|rep","phone":"if given","message":"..."}
- {"type":"slack_message","channel":"#channel if given, else empty","message":"...","audience":"manager|team"}
- {"type":"wait","amount":number,"unit":"minutes|hours|days"}
- {"type":"update_lead","stage":"e.g. Nurture"}
- {"type":"linkedin_task","task":"connect|message|engage","note":"pre-written note for the rep"}
- {"type":"add_to_sheet","sheetName":"tab name"}
- {"type":"condition","field":"no_answer_count|call_attempts|lead_score|has_email|has_phone|replied","operator":">=|>|==|<|<=","value":"number","then":[steps],"otherwise":[steps]}  (must be the LAST step; no condition inside another)
Text variables you may use in subjects and messages (nothing else): ${TEXT_VARIABLES.map((v) => `{{ $json.${v} }}`).join(', ')}`;

export function interpretPrompt(input: {
  request: string;
  answers: AssistantAnswer[];
  previous?: WorkflowSpec | null;
  change?: string;
  questionsAsked: boolean;
}): string {
  const lines = [
    'You help a non-technical sales admin automate their outbound sales work. You turn their plain-English request into a small workflow spec.',
    'Reply with ONE JSON object only:',
    '{"status":"questions"|"ready","intro":"one short friendly sentence","questions":[{"id":"short_id","question":"...","options":["2 to 4 short tappable answers"]}],"workflow":{"name":"short name, max 6 words","trigger":{...},"steps":[...]}}',
    '',
    STEP_CATALOG,
    '',
    'Rules:',
    '- Use only the trigger and step types above. Map the request onto them as closely as you can.',
    '- Ask questions (status "questions") ONLY when something essential is missing: what starts the workflow, how long to wait between steps of a sequence, or which channel to use to alert someone (email, Slack or text) and their email address or Slack channel. Ask 1 to 3 questions, all at once, each with 2 to 4 short options. Plain words, no jargon.',
    '- If nothing essential is missing, reply "ready" straight away with no questions.',
    '- Never suggest or ask about extra steps the admin did not mention (no extra notifications, no reports, no goals of an email). Build exactly what they asked for, nothing more.',
    '- When you need an address or channel, make the options short like ["I’ll add it later"]; the admin can type the real value in their own words.',
    '- Don’t ask about things the request already says, and never ask about email wording or which address emails are sent from (that is set up in Admin › Integrations): draft it yourself.',
    '- "Move them to nurture" means update_lead with stage "Nurture". "Alert/notify the manager" is send_email, slack_message or send_sms to the manager, depending on the channel.',
    '- "If a lead doesn’t answer N times" = trigger call_outcome "No answer" + a condition step no_answer_count >= N whose "then" holds the actions.',
    '- A "3-step email sequence" = 3 send_email steps to the lead with a wait between each.',
    '- Emails: friendly, under 80 words, plain text, no links, no [placeholders], greet with {{ $json.leadName }} and sign off with {{ $json.repName }}. Never invent people’s names, company names or email addresses.',
    '- Never activate, run or send anything. You only describe the workflow.',
  ];
  if (input.questionsAsked || input.answers.length) {
    lines.push('- The admin has already answered your questions. Status MUST be "ready". Use sensible defaults for anything still unclear.');
  }
  if (input.previous) {
    lines.push('', 'Current workflow spec (the admin wants to change it; keep everything they did not ask to change):', JSON.stringify(input.previous));
    lines.push(`Requested change: ${JSON.stringify(input.change || '')}`, 'Status MUST be "ready" unless the change is impossible to understand.');
  }
  lines.push('', `Request: ${JSON.stringify(input.request)}`);
  if (input.answers.length) lines.push(`Answers: ${JSON.stringify(input.answers.map((a) => ({ question: a.question, answer: a.answer })))}`);
  return lines.join('\n');
}

export function editPrompt(message: string, nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], history: { role: string; text: string }[], problems: string[] = []): string {
  return [
    'You are the assistant inside a workflow canvas for a non-technical sales admin. Steps on the canvas, in order:',
    canvasForPrompt(nodes, edges),
    problems.length ? `Known problems found by the checker: ${JSON.stringify(problems)}. If the admin asks why something doesn’t work, explain these in plain words and propose a fix.` : 'The checker found no problems.',
    'The workflow is a draft: it never runs until an admin switches it on.',
    '',
    'Reply with ONE JSON object only, either:',
    '{"type":"answer","text":"plain-English answer, max 90 words"}  (to explain a step, the workflow, or answer a question)',
    'or',
    '{"type":"change","operations":[...]}  (when they ask to change, add or remove something)',
    'Operations (1 to 3):',
    '- {"op":"update","nodeId":"id","settings":{...}}. Settings by kind: wait {"amount":n,"unit":"minutes|hours|days"}; send_email {"to":"lead or an email address","subject":"...","body":"plain text"}; send_sms {"message":"..."}; slack_message {"channel":"#name","message":"..."}; update_lead {"stage":"..."}; linkedin_task {"note":"..."}; add_to_sheet {"sheetName":"..."}; trigger {"outcome":"Meeting Booked|No answer|..."}; condition {"value":"number"}. Any step: {"label":"new name"}.',
    '- {"op":"add","afterNodeId":"id or omit for the end","step":{one step: send_email|send_sms|slack_message|wait|update_lead|linkedin_task|add_to_sheet, same fields as the workflow spec}}',
    '- {"op":"remove","nodeId":"id"}',
    `Text variables allowed: ${TEXT_VARIABLES.map((v) => `{{ $json.${v} }}`).join(', ')}. Never invent names or addresses. Never run, activate or send anything.`,
    history.length ? `Recent chat: ${JSON.stringify(history.slice(-6))}` : '',
    `Admin: ${JSON.stringify(message)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function cleanQuestions(raw: unknown): AssistantQuestion[] {
  const out: AssistantQuestion[] = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, 3) : []) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Json;
    const question = str(o.question, 160).replace(/[{}<>]/g, '');
    if (!question) continue;
    const options = (Array.isArray(o.options) ? o.options : [])
      .map((x) => str(x, 48).replace(/[{}<>]/g, ''))
      // "I'll type it in" is what the free-text box is for.
      .filter((x) => x && !/\b(type it|provide it|enter it|tell you)\b/i.test(x))
      .slice(0, 4);
    out.push({ id: str(o.id, 30).replace(/[^\w-]/g, '') || `q${out.length + 1}`, question, options });
  }
  return out;
}

function plainConfig(v: unknown): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  try {
    const json = JSON.stringify(v);
    return json.length <= 20000 ? (JSON.parse(json) as Json) : {};
  } catch {
    return {};
  }
}

/** Validate a model's or client's copy of canvas nodes and edges (bounded; registry types only kept as-is). */
export function cleanCanvas(nodesRaw: unknown, edgesRaw: unknown): { nodes: CanvasNodeLite[]; edges: CanvasEdgeLite[] } {
  const nodes: CanvasNodeLite[] = [];
  for (const r of Array.isArray(nodesRaw) ? nodesRaw.slice(0, 120) : []) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Json;
    const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Json;
    const id = str(o.id, 80);
    const nodeType = str(data.nodeType, 60);
    if (!id || !nodeType) continue;
    const pos = (o.position && typeof o.position === 'object' ? o.position : {}) as Json;
    nodes.push({
      id,
      type: 'customNode',
      position: { x: Number(pos.x) || 0, y: Number(pos.y) || 0 },
      data: {
        nodeType,
        label: str(data.label, 120) || nodeType,
        subtitle: str(data.subtitle, 120),
        category: str(data.category, 60),
        icon: str(data.icon, 40),
        isTriggerPill: Boolean(data.isTriggerPill),
        config: plainConfig(data.config),
      },
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges: CanvasEdgeLite[] = [];
  for (const r of Array.isArray(edgesRaw) ? edgesRaw.slice(0, 240) : []) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Json;
    const source = str(o.source, 80);
    const target = str(o.target, 80);
    if (!ids.has(source) || !ids.has(target)) continue;
    edges.push({ id: str(o.id, 120) || `${source}-${target}`, source, target, sourceHandle: str(o.sourceHandle, 30) || 'output', targetHandle: str(o.targetHandle, 30) || 'input' });
  }
  return { nodes, edges };
}
