/**
 * "Is this workflow actually working?" (server-only)
 *
 * - checkWorkflow: a validation pass over the real canvas graph. Every node must be a registry
 *   type with its required settings filled, every connection must be valid, there must be a
 *   trigger, nothing may be left unconnected and an If must lead somewhere when it's true.
 * - fixFor: for one problem, either asks the admin a simple question or proposes edit operations
 *   (always shown as Apply/Cancel; nothing changes until the admin applies it).
 * - simulateRun: a safe test run. It walks the graph with a sample lead and reports what each step
 *   WOULD do. It never calls a node's execute(), so nothing is sent, saved or fetched.
 *
 * Rules are a table per node type (NODE_RULES), so new step types (email templates, reply
 * classification, AI drafts) plug in with their own checks.
 */
import crypto from 'node:crypto';
import { getNodeDefinition } from '@/registry';
import { TEXT_VARIABLES, formatWait, scrubDemoText, type CallOutcome, type CheckIssue, type CheckItem, type Checklist, type CanvasEdgeLite, type CanvasNodeLite, type SpecTrigger, type TestRunResult, type TestRunStep } from '@/lib/workflowAssistant';
import { describeNode, humanize, nodeTodo, orderNodes, readNode, safeTemplate, stepSummary, triggerText, type EditOp, type EngineContext } from '@/lib/server/workflowAssistantEngine';

type Json = Record<string, unknown>;

export const TRIGGER_TYPES = new Set(['webhookTrigger', 'scheduleTrigger', 'manualTrigger', 'emailTrigger', 'borisDispositionTrigger']);
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const EXPR_RE = /^\s*\{\{\s*\$json\.[A-Za-z][\w.]*\s*\}\}\s*$/;
const CHANNEL_RE = /^[#@][\w.-]{1,79}$/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;

const val = (n: CanvasNodeLite, k: string): string => {
  const v = (n.data.config || {})[k];
  return typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v);
};

const ask = (question: string, input: Extract<CheckIssue['fix'], { kind: 'ask' }>['input'], placeholder: string, options: string[] = []): CheckIssue['fix'] => ({
  kind: 'ask',
  question,
  options,
  placeholder,
  input,
});
const PROPOSE: CheckIssue['fix'] = { kind: 'propose' };

export const STEP_OPTIONS = ['Send an email', 'Send a text message', 'Slack alert', 'Wait 1 day', 'Move the lead to Nurture'];
const TRIGGER_OPTIONS = ['A rep books a meeting', 'A call ends with no answer', 'New leads are uploaded (CSV)', 'I’ll start it myself'];

/** Per node type checks. Add an entry for each new step type. */
const NODE_RULES: Record<string, (n: CanvasNodeLite) => CheckIssue[]> = {
  resendNode: (n) => {
    const out: CheckIssue[] = [];
    const to = val(n, 'to');
    if (!to) out.push({ code: 'email_to', message: 'It doesn’t know who to email yet.', fix: ask('Who should this email go to? Type their email address.', 'email', 'name@company.com', ['The lead']) });
    else if (!EXPR_RE.test(to) && !EMAIL_RE.test(to)) out.push({ code: 'email_to', message: `“${to}” isn’t a valid email address.`, fix: ask('What’s the right email address?', 'email', 'name@company.com', ['The lead']) });
    if (!val(n, 'subject')) out.push({ code: 'email_subject', message: 'The email has no subject.', fix: PROPOSE });
    if (!val(n, 'htmlBody').replace(/<[^>]+>/g, '').trim()) out.push({ code: 'email_body', message: 'The email has no message.', fix: PROPOSE });
    return out;
  },
  twilioSmsNode: (n) => {
    const out: CheckIssue[] = [];
    const to = val(n, 'to');
    if (!to || (!EXPR_RE.test(to) && !PHONE_RE.test(to))) out.push({ code: 'sms_to', message: 'It doesn’t have a phone number to text.', fix: ask('Which phone number should get this text?', 'phone', '+1 555 123 4567', ['The lead']) });
    const from = val(n, 'from');
    if (!from || !PHONE_RE.test(from)) out.push({ code: 'sms_from', message: 'It needs the phone number your texts are sent from.', fix: ask('Which of your phone numbers should texts come from?', 'phone', '+1 555 123 4567') });
    if (!val(n, 'message')) out.push({ code: 'sms_message', message: 'The text message is empty.', fix: PROPOSE });
    return out;
  },
  slackNode: (n) => {
    const out: CheckIssue[] = [];
    if (!CHANNEL_RE.test(val(n, 'channel'))) out.push({ code: 'slack_channel', message: 'It doesn’t know which Slack channel to post in.', fix: ask('Which Slack channel should get this alert?', 'channel', '#sales-alerts', ['#sales-alerts', '#managers', '#general']) });
    if (!val(n, 'text')) out.push({ code: 'slack_text', message: 'The Slack message is empty.', fix: PROPOSE });
    return out;
  },
  googleSheetsNode: (n) =>
    val(n, 'spreadsheetId') ? [] : [{ code: 'sheet_id', message: 'It doesn’t know which Google Sheet to use.', fix: ask('Paste the link to the Google Sheet (or its ID).', 'sheet', 'https://docs.google.com/spreadsheets/d/…') }],
  delayNode: (n) => {
    const c = n.data.config || {};
    const secs = Number(c.seconds);
    const amount = Number(c.amount);
    return (Number.isFinite(amount) && amount > 0) || (Number.isFinite(secs) && secs > 0) ? [] : [{ code: 'wait_length', message: 'The wait has no length.', fix: PROPOSE }];
  },
  linkedInNode: (n) => (val(n, 'message') ? [] : [{ code: 'linkedin_note', message: 'The note for the rep is empty.', fix: PROPOSE }]),
  webhookTrigger: (n) => {
    const out: CheckIssue[] = [];
    if (!/^[\w-][\w/-]{0,79}$/.test(val(n, 'path'))) out.push({ code: 'webhook_path', message: 'It has no web address to listen on.', fix: PROPOSE });
    if (!val(n, 'authSecret')) out.push({ code: 'webhook_secret', message: 'It has no secret, so it would refuse every request.', fix: PROPOSE });
    return out;
  },
  scheduleTrigger: (n) =>
    val(n, 'mode') === 'cron' && val(n, 'cronExpression').split(/\s+/).length !== 5
      ? [{ code: 'schedule_cron', message: 'The schedule isn’t a valid time pattern.', fix: PROPOSE }]
      : [],
};

/** Generic: any schema property marked required (and currently visible) must be filled. */
function requiredIssues(n: CanvasNodeLite, covered: Set<string>): CheckIssue[] {
  const def = getNodeDefinition(n.data.nodeType);
  if (!def) return [];
  const c = n.data.config || {};
  const out: CheckIssue[] = [];
  for (const p of def.properties) {
    if (!p.required || covered.has(p.name)) continue;
    const show = p.displayOptions?.show;
    if (show && !Object.entries(show).every(([k, allowed]) => allowed.includes(c[k]))) continue;
    const v = c[p.name];
    // Not set at all: the node falls back to its default, which is filled in.
    if (v === undefined) continue;
    if (typeof v === 'string' && !v.trim()) {
      out.push({ code: `required:${p.name}`, message: `“${p.displayName}” is empty.`, fix: ask(`What should “${p.displayName}” be?`, 'text', p.displayName) });
    }
  }
  return out;
}

const COVERED: Record<string, string[]> = {
  resendNode: ['to', 'subject', 'htmlBody'],
  twilioSmsNode: ['to', 'from', 'message'],
  slackNode: ['channel', 'text'],
  linkedInNode: ['message'],
  webhookTrigger: ['path'],
};

function validHandles(nodeType: string): Set<string> {
  if (nodeType === 'ifNode') return new Set(['true', 'false']);
  const def = getNodeDefinition(nodeType);
  const ids = new Set((def?.outputs || []).map((o) => o.id));
  ids.add('output');
  if (nodeType === 'aiAgentNode') ['model', 'memory', 'tool'].forEach((h) => ids.add(h));
  return ids;
}

function badEdgeIds(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const bad: string[] = [];
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    const key = `${e.source}|${e.sourceHandle || 'output'}|${e.target}`;
    if (!s || !t || e.source === e.target || TRIGGER_TYPES.has(t.data.nodeType) || !validHandles(s.data.nodeType).has(e.sourceHandle || 'output') || seen.has(key)) bad.push(e.id);
    seen.add(key);
  }
  return bad;
}

function externalNotes(n: CanvasNodeLite, ctx: EngineContext): string[] {
  return nodeTodo(n, ctx).filter((t) => /Admin › Integrations|Link Contacts CSV|webhook address/.test(t));
}

/** What will happen, in plain words, read from the canvas. */
export function canvasSummary(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], ctx: EngineContext): string[] {
  const ordered = orderNodes(nodes, edges);
  const lines: string[] = [];
  for (const n of ordered) {
    const r = readNode(n);
    if (r?.trigger) lines.push(`When ${triggerText(r.trigger)}.`);
    else if (n.data.nodeType === 'ifNode') {
      const yes = edges.find((e) => e.source === n.id && e.sourceHandle === 'true');
      const no = edges.find((e) => e.source === n.id && e.sourceHandle === 'false');
      lines.push(`It checks “${n.data.label.replace(/^If\s+/i, '')}”: yes continues to “${nodes.find((x) => x.id === yes?.target)?.data.label || 'nothing'}”${no ? `, no goes to “${nodes.find((x) => x.id === no.target)?.data.label}”` : ', otherwise it stops'}.`);
    } else if (r?.step?.type === 'wait') lines.push(`Then it waits ${formatWait(r.step.amount, r.step.unit)}.`);
    else if (r?.step) {
      const line = stepSummary(r.step);
      lines.push(`Then: ${line.charAt(0).toLowerCase()}${line.slice(1)}.`);
    } else if (TRIGGER_TYPES.has(n.data.nodeType)) lines.push(`It starts: ${n.data.label}.`);
    else lines.push(describeNode(n, 0, ctx).replace(/^Step 0, /, '').replace(/ Still to do:.*$/, ''));
  }
  return lines.map((l) => humanize(ctx.isDemo ? l : scrubDemoText(l)));
}

export function checkWorkflow(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], ctx: EngineContext): Checklist {
  const bad = new Set(badEdgeIds(nodes, edges));
  const good = edges.filter((e) => !bad.has(e.id));
  const ordered = orderNodes(nodes, good);
  const items: CheckItem[] = [];
  const triggers = nodes.filter((n) => TRIGGER_TYPES.has(n.data.nodeType));

  if (!triggers.length) {
    items.push({ nodeId: null, number: 0, label: 'What starts the workflow', ready: false, notes: [], issues: [{ code: 'no_trigger', message: 'Nothing starts this workflow yet.', fix: ask('What should start this workflow?', 'trigger', 'Describe what starts it', TRIGGER_OPTIONS) }] });
  }
  if (bad.size) {
    items.push({ nodeId: null, number: 0, label: 'Connections', ready: false, notes: [], issues: [{ code: 'bad_edges', message: `${bad.size} connection${bad.size === 1 ? ' is' : 's are'} broken (pointing at a missing step, into a trigger, or duplicated).`, fix: PROPOSE }] });
  }

  // Steps with nothing leading into them. When there are some, "nothing happens after the start"
  // is fixed by connecting them, so that issue is reported on the step, not on the trigger.
  const orphans = nodes.filter((n) => !TRIGGER_TYPES.has(n.data.nodeType) && !good.some((e) => e.target === n.id));
  ordered.forEach((n, i) => {
    const issues: CheckIssue[] = [];
    const def = getNodeDefinition(n.data.nodeType);
    if (!def) {
      issues.push({ code: 'unknown_type', message: 'This kind of step doesn’t exist any more, so it can’t run.', fix: PROPOSE });
    } else {
      const isTrigger = TRIGGER_TYPES.has(n.data.nodeType);
      const incoming = good.filter((e) => e.target === n.id);
      const outgoing = good.filter((e) => e.source === n.id);
      if (!isTrigger && !incoming.length) issues.push({ code: 'not_connected', message: 'It isn’t connected to the step before it, so it would never run.', fix: PROPOSE });
      if (isTrigger && !outgoing.length && !orphans.length) issues.push({ code: 'nothing_after', message: 'Nothing happens after the workflow starts.', fix: ask('What should happen first?', 'step', 'Describe the first step', STEP_OPTIONS) });
      if (n.data.nodeType === 'ifNode' && !outgoing.some((e) => e.sourceHandle === 'true')) {
        issues.push({ code: 'branch_yes', message: 'The “yes” path of this check doesn’t lead anywhere.', fix: ask('What should happen when the answer is yes?', 'step', 'Describe the step', STEP_OPTIONS) });
      }
      issues.push(...(NODE_RULES[n.data.nodeType]?.(n) ?? []));
      issues.push(...requiredIssues(n, new Set(COVERED[n.data.nodeType] || [])));
    }
    items.push({ nodeId: n.id, number: i + 1, label: n.data.label, ready: issues.length === 0, issues, notes: externalNotes(n, ctx) });
  });

  const nodeItems = items.filter((x) => x.nodeId);
  const readyCount = nodeItems.filter((x) => x.ready).length;
  const ready = items.every((x) => x.ready) && nodes.length > 1;
  const external = [...new Set(items.flatMap((x) => x.notes))];
  const scrub = (t: string) => (ctx.isDemo ? t : scrubDemoText(t));
  return {
    items: items.map((x) => ({ ...x, label: scrub(x.label), issues: x.issues.map((i) => ({ ...i, message: scrub(i.message) })) })),
    readyCount,
    total: nodeItems.length,
    ready,
    summary: ready ? canvasSummary(nodes, good, ctx) : [],
    external,
  };
}

// ---------------------------------------------------------------------------------- fixes

export function stepFromChoice(answer: string): Json | null {
  const t = answer.toLowerCase();
  const wait = t.match(/(\d+)\s*(minute|hour|day|week)s?/);
  if (/wait|pause|delay/.test(t)) return { type: 'wait', amount: wait ? Number(wait[1]) : 1, unit: wait?.[2] || 'days' };
  if (/slack/.test(t)) return { type: 'slack_message', channel: t.match(/#[\w.-]+/)?.[0] || '', message: '' };
  if (/\b(text|sms)\b/.test(t)) return { type: 'send_sms', to: 'lead', message: '' };
  if (/nurture|move|stage/.test(t)) return { type: 'update_lead', stage: t.match(/to (?:the )?([a-z ]{2,20})$/)?.[1]?.trim() || 'Nurture' };
  if (/linkedin/.test(t)) return { type: 'linkedin_task', task: 'connect', note: '' };
  if (/sheet/.test(t)) return { type: 'add_to_sheet', sheetName: 'Leads' };
  if (/e-?mail/.test(t)) return { type: 'send_email', to: /manager/.test(t) ? 'manager' : 'lead', subject: '', body: '' };
  return null;
}

function triggerFromChoice(answer: string): SpecTrigger | null {
  const t = answer.toLowerCase();
  if (/csv|upload|import|new lead|new contact/.test(t)) return { type: 'new_contacts' };
  if (/no answer|doesn|didn/.test(t)) return { type: 'call_outcome', outcome: 'No answer' as CallOutcome };
  if (/book|meeting/.test(t)) return { type: 'call_outcome', outcome: 'Meeting Booked' as CallOutcome };
  if (/not interested/.test(t)) return { type: 'call_outcome', outcome: 'Not interested' as CallOutcome };
  if (/every|daily|morning|schedule|weekday/.test(t)) return { type: 'schedule', frequency: /weekday/.test(t) ? 'weekdays' : 'daily', time: '09:00' };
  if (/myself|manual|i'?ll start|button/.test(t)) return { type: 'manual' };
  return null;
}

function sheetId(answer: string): string {
  const m = answer.match(/\/spreadsheets\/d\/([\w-]{20,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(answer.trim()) ? answer.trim() : '';
}

const DEFAULTS: Record<string, (n: CanvasNodeLite) => EditOp[]> = {
  email_subject: (n) => [{ op: 'set_config', nodeId: n.id, key: 'subject', value: /\$json\.email/.test(val(n, 'to')) ? 'Following up, {{ $json.leadName }}' : 'Heads up: {{ $json.leadName }} ({{ $json.company }})' }],
  email_body: (n) => [
    {
      op: 'set_config',
      nodeId: n.id,
      key: 'htmlBody',
      value: /\$json\.email/.test(val(n, 'to'))
        ? '<p>Hi {{ $json.leadName }},</p><p>Thanks for your time. Would a quick 15-minute call later this week help?</p><p>Best,<br>{{ $json.repName }}</p>'
        : '<p>{{ $json.leadName }} from {{ $json.company }} needs attention.</p><p>This is an automatic alert from your workflow.</p>',
    },
  ],
  sms_message: (n) => [{ op: 'set_config', nodeId: n.id, key: 'message', value: 'Hi {{ $json.leadName }}, thanks for your time today. Reply here if you have any questions. {{ $json.repName }}' }],
  slack_text: (n) => [{ op: 'set_config', nodeId: n.id, key: 'text', value: 'Heads up: {{ $json.leadName }} from {{ $json.company }} needs attention.' }],
  linkedin_note: (n) => [{ op: 'set_config', nodeId: n.id, key: 'message', value: 'Hi {{ $json.leadName }}, great to connect. Would love to stay in touch.' }],
  wait_length: (n) => [{ op: 'update', nodeId: n.id, settings: { amount: 1, unit: 'days' } }],
  webhook_path: (n) => [{ op: 'set_config', nodeId: n.id, key: 'path', value: `hook-${crypto.randomBytes(3).toString('hex')}` }],
  webhook_secret: (n) => [{ op: 'set_config', nodeId: n.id, key: 'authSecret', value: crypto.randomBytes(18).toString('base64url') }],
  schedule_cron: (n) => [{ op: 'set_config', nodeId: n.id, key: 'cronExpression', value: '0 9 * * 1-5' }],
  unknown_type: (n) => [{ op: 'remove', nodeId: n.id }],
};

/** The nearest step to the left of `n` that is itself reachable, to connect an orphan to. */
function connectTarget(n: CanvasNodeLite, nodes: CanvasNodeLite[], edges: CanvasEdgeLite[]): CanvasNodeLite | null {
  const reach = new Set<string>();
  const queue = nodes.filter((x) => TRIGGER_TYPES.has(x.data.nodeType)).map((x) => x.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (reach.has(id)) continue;
    reach.add(id);
    edges.filter((e) => e.source === id).forEach((e) => queue.push(e.target));
  }
  const x = n.position?.x ?? 0;
  const candidates = nodes.filter((c) => c.id !== n.id && reach.has(c.id) && (c.position?.x ?? 0) < x);
  candidates.sort((a, b) => (b.position?.x ?? 0) - (a.position?.x ?? 0) || Math.abs((a.position?.y ?? 0) - (n.position?.y ?? 0)) - Math.abs((b.position?.y ?? 0) - (n.position?.y ?? 0)));
  return candidates[0] || nodes.find((c) => TRIGGER_TYPES.has(c.data.nodeType) && c.id !== n.id) || null;
}

export type FixResult = { ops: EditOp[] } | { ask: { question: string; options: string[]; placeholder: string; error?: string } } | { answer: string } | null;

/** Turn one checklist problem (plus the admin's answer, if it needed one) into edit operations. */
export function fixFor(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], nodeId: string | null, code: string, answer: string, ctx: EngineContext): FixResult {
  const list = checkWorkflow(nodes, edges, ctx);
  const item = list.items.find((x) => x.nodeId === nodeId && x.issues.some((i) => i.code === code));
  const issue = item?.issues.find((i) => i.code === code);
  if (!item || !issue) return { answer: 'That one is already sorted.' };
  const node = nodeId ? nodes.find((n) => n.id === nodeId) : undefined;
  const a = answer.trim();
  const again = (error: string) => (issue.fix.kind === 'ask' ? { ask: { question: issue.fix.question, options: issue.fix.options, placeholder: issue.fix.placeholder, error } } : null);

  if (issue.fix.kind === 'ask') {
    if (!a) return { ask: { question: issue.fix.question, options: issue.fix.options, placeholder: issue.fix.placeholder } };
    switch (issue.fix.input) {
      case 'email':
        if (/^(the )?lead$/i.test(a)) return { ops: [{ op: 'set_config', nodeId: node!.id, key: 'to', value: '{{ $json.email }}' }] };
        if (!EMAIL_RE.test(a)) return again('That doesn’t look like an email address. Try something like name@company.com.');
        return { ops: [{ op: 'set_config', nodeId: node!.id, key: 'to', value: a }] };
      case 'phone':
        if (/^(the )?lead$/i.test(a) && code === 'sms_to') return { ops: [{ op: 'set_config', nodeId: node!.id, key: 'to', value: '{{ $json.phone }}' }] };
        if (!PHONE_RE.test(a)) return again('That doesn’t look like a phone number. Include the country code, like +1 555 123 4567.');
        return { ops: [{ op: 'set_config', nodeId: node!.id, key: code === 'sms_from' ? 'from' : 'to', value: a }] };
      case 'channel': {
        const ch = a.startsWith('#') || a.startsWith('@') ? a.replace(/\s+/g, '-') : `#${a.replace(/\s+/g, '-')}`;
        if (!CHANNEL_RE.test(ch)) return again('Slack channel names use letters, numbers and dashes, like #sales-alerts.');
        return { ops: [{ op: 'set_config', nodeId: node!.id, key: 'channel', value: ch.toLowerCase() }] };
      }
      case 'sheet': {
        const id = sheetId(a);
        if (!id) return again('I couldn’t find a sheet ID in that. Paste the full link from your browser’s address bar.');
        return { ops: [{ op: 'set_config', nodeId: node!.id, key: 'spreadsheetId', value: id }] };
      }
      case 'trigger': {
        const t = triggerFromChoice(a);
        if (!t) return again('Pick one of the options, or describe it like “when a rep books a meeting”.');
        return { ops: [{ op: 'set_trigger', trigger: t as unknown as Json }] };
      }
      case 'step': {
        const step = stepFromChoice(a);
        if (!step) return again('Pick one of the options, or describe the step, like “send the lead an email”.');
        return { ops: [{ op: 'add', afterNodeId: node!.id, step }] };
      }
      case 'text': {
        const key = code.startsWith('required:') ? code.slice(9) : '';
        if (!key) return null;
        return { ops: [{ op: 'set_config', nodeId: node!.id, key, value: a }] };
      }
    }
  }
  if (issue.fix.kind === 'external') return { answer: issue.message };

  if (code === 'bad_edges') return { ops: badEdgeIds(nodes, edges).map((edgeId) => ({ op: 'remove_edge' as const, edgeId })) };
  if (code === 'not_connected' && node) {
    const from = connectTarget(node, nodes, edges.filter((e) => !badEdgeIds(nodes, edges).includes(e.id)));
    if (!from) return { answer: 'There’s no earlier step to connect it to. Add a trigger first.' };
    return { ops: [{ op: 'connect', source: from.id, target: node.id, sourceHandle: from.data.nodeType === 'ifNode' ? 'true' : 'output' }] };
  }
  const make = node ? DEFAULTS[code] : undefined;
  return make && node ? { ops: make(node) } : null;
}

// ---------------------------------------------------------------------------------- safe test run

const SAMPLE_LEAD: Json = {
  leadName: 'Sample Lead',
  company: 'Example Co',
  email: 'sample.lead@example.com',
  phone: '+1 555 0100',
  title: 'Head of Sales',
  repName: 'Your rep',
  scheduledTime: 'Thursday at 2:00 PM',
  linkedInUrl: 'https://www.linkedin.com/in/sample-lead',
  disposition: 'Meeting Booked',
  noAnswerCount: 3,
  callAttempts: 3,
  leadScore: 85,
  replied: false,
};

const fill = (text: string, lead: Json) =>
  text.replace(/\{\{\s*\$json\.([A-Za-z][\w]*)\s*\}\}/g, (_m, k: string) => (lead[k] === undefined ? `[missing: ${k}]` : String(lead[k])));

function compare(left: unknown, op: string, right: string): boolean {
  const a = Number(left);
  const b = Number(right);
  const num = Number.isFinite(a) && Number.isFinite(b);
  switch (op) {
    case '>=':
      return num ? a >= b : false;
    case '>':
      return num ? a > b : false;
    case '<':
      return num ? a < b : false;
    case '<=':
      return num ? a <= b : false;
    case '!=':
      return String(left) !== right;
    case 'contains':
      return String(left ?? '').includes(right);
    case 'notEmpty':
      return left !== undefined && left !== null && String(left).trim() !== '';
    default:
      return String(left) === right;
  }
}

/**
 * Walk the workflow with a sample lead and say what each step would do. Never executes nodes:
 * no email, text, Slack post, HTTP call or database write happens.
 */
export function simulateRun(nodes: CanvasNodeLite[], edges: CanvasEdgeLite[], ctx: EngineContext): TestRunResult {
  const list = checkWorkflow(nodes, edges, ctx);
  const failing = list.items.find((x) => !x.ready);
  const steps: TestRunStep[] = [];
  const warnings: string[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ordered = orderNodes(nodes, edges);
  const numberOf = (id: string) => ordered.findIndex((n) => n.id === id) + 1;
  const lead: Json = { ...SAMPLE_LEAD };
  const trig = nodes.find((n) => TRIGGER_TYPES.has(n.data.nodeType));
  if (trig?.data.nodeType === 'borisDispositionTrigger') {
    const f = val(trig, 'dispositionFilter');
    if (f && f !== 'all') lead.disposition = f;
  }

  const visited = new Set<string>();
  const queue = trig ? [trig.id] : [];
  while (queue.length && steps.length < 60) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const n = byId.get(id);
    if (!n) continue;
    const issue = list.items.find((x) => x.nodeId === id && !x.ready);
    const label = n.data.label;
    const num = numberOf(id);
    if (issue) {
      steps.push({ number: num, label, status: 'failed', text: issue.issues[0].message });
      continue;
    }
    let next = edges.filter((e) => e.source === id);
    let text = '';
    const t = n.data.nodeType;
    if (TRIGGER_TYPES.has(t)) text = `Started with a sample lead: ${lead.leadName} at ${lead.company}.`;
    else if (t === 'resendNode') text = `Would email ${fill(val(n, 'to'), lead)}: “${fill(val(n, 'subject'), lead)}”. Not sent (test run).`;
    else if (t === 'twilioSmsNode') text = `Would text ${fill(val(n, 'to'), lead)}: “${fill(val(n, 'message'), lead).slice(0, 90)}”. Not sent (test run).`;
    else if (t === 'slackNode') text = `Would post in ${val(n, 'channel')}: “${fill(val(n, 'text'), lead).slice(0, 90)}”. Not posted (test run).`;
    else if (t === 'delayNode') {
      const r = readNode(n);
      text = r?.step?.type === 'wait' ? `Would wait ${formatWait(r.step.amount, r.step.unit)} (skipped in the test).` : 'Would wait (skipped in the test).';
    } else if (t === 'supabaseNode') text = `Would ${val(n, 'value') ? `move the lead to “${val(n, 'value')}”` : 'update the lead record'}. Nothing saved (test run).`;
    else if (t === 'linkedInNode') text = 'Would create a LinkedIn task for the rep. Nothing posted (test run).';
    else if (t === 'googleSheetsNode') text = `Would add a row to the “${val(n, 'sheetName') || 'Leads'}” tab. Nothing written (test run).`;
    else if (t === 'ifNode') {
      const field = val(n, 'field');
      const key = field.match(/\$json\.([A-Za-z]\w*)/)?.[1];
      const yes = compare(key ? lead[key] : field, val(n, 'operator') || '==', val(n, 'value'));
      text = `Checked with the sample lead: ${yes ? 'yes' : 'no'}, so it continues on the “${yes ? 'yes' : 'no'}” path.`;
      next = next.filter((e) => e.sourceHandle === (yes ? 'true' : 'false'));
      edges.filter((e) => e.source === id && e.sourceHandle !== (yes ? 'true' : 'false')).forEach((e) => {
        const skipped = byId.get(e.target);
        if (skipped) steps.push({ number: numberOf(skipped.id), label: skipped.data.label, status: 'skipped', text: 'Not reached for this sample lead (other path).' });
      });
      if (!next.length) text += ' Nothing else happens on that path.';
    } else text = `Would run “${label}”. Simulated only.`;

    const missing = [...new Set(JSON.stringify(n.data.config || {}).match(/\{\{\s*\$json\.([A-Za-z]\w*)\s*\}\}/g) || [])]
      .map((m) => m.replace(/[{}\s]|\$json\./g, ''))
      .filter((k) => lead[k] === undefined && !(TEXT_VARIABLES as readonly string[]).includes(k));
    if (missing.length) warnings.push(`Step ${num} (${label}) uses ${missing.join(', ')}, which leads may not have, so it could come out blank.`);
    steps.push({ number: num, label, status: 'ok', text: humanize(text) });
    next.forEach((e) => queue.push(e.target));
  }
  steps.sort((a, b) => a.number - b.number);
  const failed = steps.find((s) => s.status === 'failed');
  const firstFail = failing ?? null;
  const passed = !firstFail && !failed && steps.length > 0;
  const scrub = (s: string) => (ctx.isDemo ? s : scrubDemoText(s));
  return {
    passed,
    steps: steps.map((s) => ({ ...s, label: scrub(s.label), text: scrub(safeTemplate(s.text, 400) || s.text) })),
    warnings: warnings.map(scrub),
    failedNodeId: firstFail?.nodeId ?? null,
    explanation: passed
      ? 'Test passed. Every step ran in simulation with a sample lead. Nothing was sent.'
      : firstFail
        ? scrub(`The test stopped at ${firstFail.nodeId ? `step ${firstFail.number} (“${firstFail.label}”)` : firstFail.label.toLowerCase()}: ${firstFail.issues[0]?.message} Let’s fix it.`)
        : 'Nothing ran: the workflow has no starting step.',
  };
}
