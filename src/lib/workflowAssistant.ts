/**
 * Workflow assistant: shared types and small helpers (safe for the browser and the server).
 *
 * The AI never writes canvas nodes. It describes the automation as a small "spec" (a trigger and
 * plain steps from a fixed list); the server validates that spec and compiles it into real nodes
 * from the node registry (lib/server/workflowAssistantEngine.ts). The confirmation text and the
 * plan are generated from the validated spec, so what the admin approves is exactly what is built.
 */

export const CALL_OUTCOMES = [
  'Meeting Booked',
  'Follow-up Required',
  'Referral / Update Contact',
  'Call back',
  'No answer',
  'Not interested',
  'Disqualified',
  'Do not call',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export type WaitUnit = 'minutes' | 'hours' | 'days';

export type SpecTrigger =
  | { type: 'call_outcome'; outcome: CallOutcome }
  | { type: 'new_contacts' }
  | { type: 'schedule'; frequency: 'hourly' | 'daily' | 'weekdays' | 'weekly'; time: string }
  | { type: 'manual' }
  | { type: 'webhook'; source: string };

export type Recipient = 'lead' | 'manager' | 'rep' | 'custom';

export type ConditionField = 'no_answer_count' | 'call_attempts' | 'lead_score' | 'has_email' | 'has_phone' | 'replied';
export type ConditionOperator = '>=' | '>' | '==' | '<' | '<=' | 'notEmpty';

export type SpecStep =
  | { type: 'send_email'; to: Recipient; address?: string; subject: string; body: string; purpose?: string }
  | { type: 'send_sms'; to: Recipient; phone?: string; message: string }
  | { type: 'slack_message'; channel: string; message: string; audience?: string }
  | { type: 'wait'; amount: number; unit: WaitUnit }
  | { type: 'update_lead'; stage: string }
  | { type: 'linkedin_task'; task: 'connect' | 'message' | 'engage'; note: string }
  | { type: 'add_to_sheet'; sheetName: string }
  | {
      type: 'condition';
      field: ConditionField;
      operator: ConditionOperator;
      value: string;
      then: SpecStep[];
      otherwise: SpecStep[];
    };

export interface WorkflowSpec {
  name: string;
  trigger: SpecTrigger;
  steps: SpecStep[];
}

export interface AssistantQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface AssistantAnswer {
  id?: string;
  question: string;
  answer: string;
}

/** One line of "Here's what I understood". */
export interface UnderstandingLine {
  kind: 'when' | 'then' | 'wait' | 'if' | 'otherwise';
  text: string;
  /** Nesting depth (steps inside an If). */
  depth: number;
}

export interface PlanSetting {
  label: string;
  value: string;
}

export interface PlanStep {
  number: number;
  /** Friendly node type, e.g. "Send an email". */
  kind: string;
  title: string;
  does: string;
  settings: PlanSetting[];
  /** Things the admin must fill in or connect before switching the workflow on. */
  todo: string[];
  /** "If yes" / "If no" for steps inside a branch. */
  branch?: string;
}

export interface WorkflowPlan {
  name: string;
  steps: PlanStep[];
  todo: string[];
}

export interface CanvasNodeLite {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data: {
    nodeType: string;
    label: string;
    subtitle?: string;
    category?: string;
    icon?: string;
    isTriggerPill?: boolean;
    config?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface CanvasEdgeLite {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** A proposed canvas change: nothing changes until the admin presses Apply. */
export interface CanvasProposal {
  summary: string;
  changes: string[];
  updated: CanvasNodeLite[];
  added: CanvasNodeLite[];
  removedIds: string[];
  edges: CanvasEdgeLite[];
}

/** How the assistant can fix one problem. */
export type FixHint =
  /** The server can propose a value straight away (Apply/Cancel). */
  | { kind: 'propose' }
  /** Only the admin knows the answer: ask, then propose. */
  | { kind: 'ask'; question: string; options: string[]; placeholder: string; input: 'email' | 'phone' | 'channel' | 'sheet' | 'text' | 'trigger' | 'step' }
  /** Done outside the canvas (e.g. connecting an integration). */
  | { kind: 'external' };

export interface CheckIssue {
  code: string;
  message: string;
  fix: FixHint;
}

export interface CheckItem {
  /** null for workflow-level items (no trigger, broken connections). */
  nodeId: string | null;
  number: number;
  label: string;
  ready: boolean;
  issues: CheckIssue[];
  /** Outside-the-canvas prerequisites (don't block "ready"). */
  notes: string[];
}

export interface Checklist {
  items: CheckItem[];
  readyCount: number;
  total: number;
  ready: boolean;
  /** Plain-English "what will happen", in order. */
  summary: string[];
  /** Before it can send for real (integrations etc.). */
  external: string[];
}

export interface TestRunStep {
  number: number;
  label: string;
  status: 'ok' | 'skipped' | 'failed';
  text: string;
}

export interface TestRunResult {
  passed: boolean;
  steps: TestRunStep[];
  warnings: string[];
  /** First failing node, so the assistant can fix it. */
  failedNodeId: string | null;
  explanation: string;
}

export interface AssistantAsk {
  question: string;
  options: string[];
  placeholder: string;
  /** Echoed back with the answer. */
  context: { nodeId: string | null; code: string };
  error?: string;
}

export type AssistantStage = 'interpret' | 'plan' | 'build' | 'edit' | 'check' | 'fix' | 'test';

export type AssistantResponse =
  | { ok: true; type: 'questions'; intro: string; questions: AssistantQuestion[]; source: 'ai' | 'rules' }
  | { ok: true; type: 'understanding'; spec: WorkflowSpec; lines: UnderstandingLine[]; source: 'ai' | 'rules' }
  | { ok: true; type: 'plan'; spec: WorkflowSpec; plan: WorkflowPlan }
  | { ok: true; type: 'built'; workflowId: string; name: string }
  | { ok: true; type: 'answer'; text: string; source: 'ai' | 'rules' }
  | { ok: true; type: 'proposal'; proposal: CanvasProposal; source: 'ai' | 'rules' }
  | { ok: true; type: 'checklist'; checklist: Checklist; intro?: string }
  | { ok: true; type: 'ask'; ask: AssistantAsk }
  | { ok: true; type: 'test'; result: TestRunResult }
  | { ok: false; error: string; retryable: boolean };

export const EXAMPLE_PROMPTS = [
  'When a lead is booked, email them a confirmation and alert the manager',
  "If a lead doesn't answer 3 times, move them to nurture and send a follow-up email",
  'Send new Contacts CSV leads a 3-step email sequence',
];

export const CANVAS_EXAMPLES = [
  'Check my workflow',
  'Make the wait 2 days',
  'Explain step 2',
  'Add a step after the wait',
  'Run a safe test',
];

/** Variables a step may use in its text (filled in from the lead when the workflow runs). */
export const TEXT_VARIABLES = ['leadName', 'company', 'email', 'phone', 'scheduledTime', 'repName', 'title'] as const;

/**
 * Demo sample names that must never show in a client workspace (templates and node defaults were
 * written for the platform's demo workspace).
 */
const DEMO_NAME_RULES: [RegExp, string][] = [
  [/\bEmil(?:\s+(?:Pe)?halili)?\b/gi, 'your rep'],
  [/\bApex Global(?:\s+BPO)?\b/gi, 'Example Co'],
  [/\bJulian(?:\s+Vance)?\b/gi, 'the lead'],
  [/\bArthur Vance\b/gi, 'Sample Lead'],
  [/\bAppointmentlyy\b/gi, 'our team'],
];

export function scrubDemoText(text: string): string {
  let out = text;
  for (const [re, sub] of DEMO_NAME_RULES) out = out.replace(re, sub);
  return out;
}

export function hasDemoNames(text: string): boolean {
  return DEMO_NAME_RULES.some(([re]) => new RegExp(re.source, 'i').test(text));
}

/** Deep copy with every string scrubbed of demo names. */
export function scrubDemoDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubDemoText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubDemoDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDemoDeep(v);
    return out as T;
  }
  return value;
}

export function formatWait(amount: number, unit: WaitUnit): string {
  const n = Math.max(1, Math.round(amount));
  const word = unit === 'minutes' ? 'minute' : unit === 'hours' ? 'hour' : 'day';
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
