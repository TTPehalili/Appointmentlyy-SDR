import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRank } from '@/lib/server/session';
import { isDemoSession } from '@/lib/demoMode';
import { parseJsonObject, raceGemini } from '@/lib/server/gemini';
import { getIntegrationStore } from '@/lib/server/integrationStore';
import { workflowDbForTenant } from '@/lib/db';
import { scrubDemoText, type AssistantAnswer, type AssistantResponse, type WorkflowSpec } from '@/lib/workflowAssistant';
import {
  buildProposal,
  cleanCanvas,
  cleanQuestions,
  compileSpec,
  editPrompt,
  editWithRules,
  humanize,
  interpretPrompt,
  interpretWithRules,
  understandingLines,
  validateSpec,
  type EngineContext,
} from '@/lib/server/workflowAssistantEngine';
import { STEP_OPTIONS, checkWorkflow, fixFor, simulateRun, stepFromChoice } from '@/lib/server/workflowAssistantCheck';

/**
 * Workflow assistant for workspace admins.
 *   stage 'interpret' -> clarifying questions, or "Here's what I understood" (from the validated spec)
 *   stage 'plan'      -> numbered plan with settings and what the admin must still fill in
 *   stage 'build'     -> saves the compiled workflow as a DRAFT in this workspace (never active)
 *   stage 'edit'      -> canvas chat: an answer, a diagnosis, or a proposed change (applied only by the admin)
 *   stage 'check'     -> validation checklist ("3 of 5 steps ready")
 *   stage 'fix'       -> for one checklist problem: a question for the admin, or a proposed fix
 *   stage 'test'      -> safe simulated run with a sample lead (nothing is executed or sent)
 * The model only ever describes a spec; nodes are compiled and validated here.
 */

export const maxDuration = 60;

const AI_TIMEOUT_MS = 20000;
const AI_DOWN = 'I couldn’t reach the AI just now. Please try again in a moment.';

type Json = Record<string, unknown>;
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max).trim() : '');

function reply(body: AssistantResponse, status = 200) {
  return NextResponse.json(body, { status });
}

async function connectedProviders(tenantCode: string): Promise<EngineContext['connected']> {
  const none = { slack: false, sms: false, google: false };
  try {
    const list = await Promise.race([
      getIntegrationStore().listConnections({ tenantCode }),
      new Promise<null>((r) => setTimeout(() => r(null), 2500)),
    ]);
    if (!list) return none;
    const on = new Set(list.filter((c) => c.status === 'connected').map((c) => c.provider));
    return { slack: on.has('slack'), sms: on.has('twilio'), google: on.has('google_workspace') };
  } catch {
    return none;
  }
}

function cleanTimezone(v: unknown): string {
  const tz = s(v, 60);
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function cleanAnswers(v: unknown): AssistantAnswer[] {
  return (Array.isArray(v) ? v.slice(0, 3) : [])
    .filter((a): a is Json => Boolean(a) && typeof a === 'object')
    .map((a) => ({ id: s(a.id, 30), question: s(a.question, 200), answer: s(a.answer, 300) }))
    .filter((a) => a.question && a.answer);
}

/**
 * The model must never invent contact details: an email address, phone number or Slack channel is
 * kept only if the admin actually typed it (in the request, an answer or a change).
 */
function keepOnlyGivenContacts(spec: WorkflowSpec, userText: string): WorkflowSpec {
  const text = userText.toLowerCase();
  const digits = userText.replace(/\D/g, '');
  const given = (v: string | undefined, kind: 'email' | 'phone' | 'channel') => {
    if (!v) return '';
    if (kind === 'phone') return digits.includes(v.replace(/\D/g, '')) ? v : '';
    return text.includes(v.toLowerCase().replace(/^#/, kind === 'channel' ? '' : '#')) ? v : '';
  };
  const walk = (steps: WorkflowSpec['steps']): WorkflowSpec['steps'] =>
    steps.map((st) => {
      if (st.type === 'send_email') return { ...st, address: given(st.address, 'email') };
      if (st.type === 'send_sms') return { ...st, phone: given(st.phone, 'phone') };
      if (st.type === 'slack_message') return { ...st, channel: given(st.channel, 'channel') };
      if (st.type === 'condition') return { ...st, then: walk(st.then), otherwise: walk(st.otherwise) };
      return st;
    });
  return { ...spec, steps: walk(spec.steps) };
}

async function askModel(prompt: string): Promise<Json | null> {
  const res = await raceGemini(process.env.GOOGLE_API_KEY, prompt, {
    json: true,
    timeoutMs: AI_TIMEOUT_MS,
    maxTokens: 4096,
    temperature: 0.3,
    accept: (t) => parseJsonObject(t) !== null,
  });
  return res ? parseJsonObject<Json>(res.text) : null;
}

/**
 * Per-person limit on the stages that call the AI (interpret, edit). Checking, fixing, planning
 * and test runs are deterministic and cheap, so a guided walkthrough never hits a limit.
 */
const AI_LIMIT = 30;
const aiCalls = new Map<string, { count: number; resetAt: number }>();
function aiRateLimited(key: string): boolean {
  const now = Date.now();
  const cur = aiCalls.get(key);
  if (!cur || now > cur.resetAt) {
    aiCalls.set(key, { count: 1, resetAt: now + 60000 });
    if (aiCalls.size > 5000) aiCalls.clear();
    return false;
  }
  cur.count++;
  return cur.count > AI_LIMIT;
}

/** Recent successful builds, so a double click doesn't create two workflows. */
const recentBuilds = new Map<string, { id: string; name: string; at: number }>();

export async function POST(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) return reply({ ok: false, error: 'Please sign in again.', retryable: false }, 401);
  if (!hasRank(session, 'Admin')) {
    return reply({ ok: false, error: 'Only workspace admins can build workflows.', retryable: false }, 403);
  }
  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return reply({ ok: false, error: 'Something went wrong with that request. Please try again.', retryable: true }, 400);
  }

  const isDemo = isDemoSession(session);
  const ctx: EngineContext = { isDemo, connected: await connectedProviders(session.tenantCode), timezone: cleanTimezone(body.timezone) };
  const scrub = (t: string) => (isDemo ? t : scrubDemoText(t));
  const stage = s(body.stage, 20);
  if ((stage === 'interpret' || stage === 'edit') && aiRateLimited(`${session.tenantCode}|${session.email}`)) {
    return reply({ ok: false, error: 'That’s a lot of requests in a row. Please wait a minute and try again.', retryable: true }, 429);
  }

  try {
    if (stage === 'interpret') {
      const request = s(body.request, 1500);
      if (!request) return reply({ ok: false, error: 'Tell me what you’d like to automate first.', retryable: false }, 400);
      const answers = cleanAnswers(body.answers);
      const previousCheck = body.previous ? validateSpec(body.previous) : null;
      const previous: WorkflowSpec | null = previousCheck?.spec ?? null;
      const change = s(body.change, 800);
      const questionsAsked = body.questionsAsked === true;

      const raw = await askModel(interpretPrompt({ request, answers, previous, change, questionsAsked }));
      if (raw) {
        // Only essentials may be asked: drop questions about email wording or extra steps nobody asked for.
        const qs = cleanQuestions(raw.questions).filter(
          (q) => !/\b(say|wording|main point|tone|content|write|subject|sent from|send it from)\b|notif(y|ied) (anyone|you|me)|anyone else|would you like (to|a)/i.test(q.question),
        );
        const mayAsk = !answers.length && !questionsAsked && !previous;
        if (raw.status === 'questions' && qs.length && mayAsk) {
          return reply({ ok: true, type: 'questions', intro: scrub(s(raw.intro, 200)) || 'A couple of quick questions first:', questions: qs.map((q) => ({ ...q, question: scrub(q.question), options: q.options.map(scrub) })), source: 'ai' });
        }
        const v = validateSpec(raw.workflow);
        if (v.spec) {
          const userText = [request, change, ...answers.map((a) => a.answer), previous ? JSON.stringify(previous) : ''].join(' \n ');
          const checked = keepOnlyGivenContacts(v.spec, userText);
          const spec = isDemo ? checked : (JSON.parse(scrub(JSON.stringify(checked))) as WorkflowSpec);
          return reply({ ok: true, type: 'understanding', spec, lines: understandingLines(spec).map((l) => ({ ...l, text: humanize(l.text) })), source: 'ai' });
        }
      }
      // The model was unavailable or its answer didn't hold up: use the deterministic rules.
      if (!previous) {
        const rules = interpretWithRules(request, answers);
        if (rules?.kind === 'questions') return reply({ ok: true, type: 'questions', intro: rules.intro, questions: rules.questions, source: 'rules' });
        if (rules?.kind === 'spec') {
          return reply({ ok: true, type: 'understanding', spec: rules.spec, lines: understandingLines(rules.spec).map((l) => ({ ...l, text: humanize(l.text) })), source: 'rules' });
        }
      }
      return reply(
        raw
          ? { ok: false, error: 'I didn’t quite get that. Try describing what should start the workflow and what should happen next, for example “When a lead is booked, email them a confirmation”.', retryable: true }
          : { ok: false, error: AI_DOWN, retryable: true },
        raw ? 422 : 502,
      );
    }

    if (stage === 'plan' || stage === 'build') {
      const v = validateSpec(body.spec);
      if (!v.spec) return reply({ ok: false, error: 'That plan is missing a starting point or steps. Please go back and describe the workflow again.', retryable: false }, 400);
      const spec = isDemo ? v.spec : (JSON.parse(scrub(JSON.stringify(v.spec))) as WorkflowSpec);
      const compiled = compileSpec(spec, ctx);
      if (stage === 'plan') return reply({ ok: true, type: 'plan', spec, plan: compiled.plan });

      const store = workflowDbForTenant(session.tenantCode);
      const buildKey = `${session.tenantCode}|${s(body.buildKey, 80)}`;
      const prior = s(body.buildKey, 80) ? recentBuilds.get(buildKey) : undefined;
      if (prior && Date.now() - prior.at < 10 * 60000 && (await store.getWorkflow(prior.id))) {
        return reply({ ok: true, type: 'built', workflowId: prior.id, name: prior.name });
      }
      const name = s(body.name, 80) || spec.name;
      const lines = understandingLines(spec);
      const saved = await store.saveWorkflow({
        name: scrub(name),
        description: scrub(clipText(`Built with the assistant. When ${humanize(lines[0].text)}.`, 300)),
        folderId: s(body.folderId, 80) || undefined,
        // Always a draft: building never switches a workflow on, runs it or sends anything.
        active: false,
        nodes: compiled.nodes,
        edges: compiled.edges,
      });
      if (s(body.buildKey, 80)) {
        recentBuilds.set(buildKey, { id: saved.id, name: saved.name, at: Date.now() });
        if (recentBuilds.size > 500) recentBuilds.delete(recentBuilds.keys().next().value as string);
      }
      return reply({ ok: true, type: 'built', workflowId: saved.id, name: saved.name });
    }

    if (stage === 'check' || stage === 'test' || stage === 'fix') {
      const { nodes, edges } = cleanCanvas(body.nodes, body.edges);
      if (stage === 'check') return reply({ ok: true, type: 'checklist', checklist: checkWorkflow(nodes, edges, ctx) });
      if (stage === 'test') return reply({ ok: true, type: 'test', result: simulateRun(nodes, edges, ctx) });

      const nodeId = typeof body.nodeId === 'string' ? body.nodeId : null;
      const code = s(body.code, 60);
      const answer = s(body.answer, 300);
      if (code === 'add_after') {
        const anchor = nodes.find((n) => n.id === nodeId);
        if (!anchor) return reply({ ok: true, type: 'answer', text: 'I can’t find that step any more. Ask me again.', source: 'rules' });
        const step = answer ? stepFromChoice(answer) : null;
        if (!step) {
          return reply({ ok: true, type: 'ask', ask: { question: `What should the new step after “${anchor.data.label}” do?`, options: STEP_OPTIONS, placeholder: 'Describe the step', context: { nodeId: anchor.id, code }, error: answer ? 'Pick one of the options, or describe the step, like “send the lead an email”.' : undefined } });
        }
        const p = buildProposal([{ op: 'add', afterNodeId: anchor.id, step }], nodes, edges, ctx);
        if (p && !('error' in p)) return reply({ ok: true, type: 'proposal', proposal: p, source: 'rules' });
        return reply({ ok: true, type: 'answer', text: 'I couldn’t add that step. Try describing it differently.', source: 'rules' });
      }
      const fix = fixFor(nodes, edges, nodeId, code, answer, ctx);
      if (!fix) return reply({ ok: true, type: 'answer', text: 'I can’t fix that one automatically. Open the step (click it, then the gear) and fill it in there.', source: 'rules' });
      if ('answer' in fix) return reply({ ok: true, type: 'answer', text: scrub(fix.answer), source: 'rules' });
      if ('ask' in fix) return reply({ ok: true, type: 'ask', ask: { ...fix.ask, question: scrub(fix.ask.question), context: { nodeId, code } } });
      const p = buildProposal(fix.ops, nodes, edges, ctx);
      if (!p) return reply({ ok: true, type: 'answer', text: 'That one is already sorted.', source: 'rules' });
      if ('error' in p) return reply({ ok: true, type: 'answer', text: p.error, source: 'rules' });
      return reply({ ok: true, type: 'proposal', proposal: p, source: 'rules' });
    }

    if (stage === 'edit') {
      const message = s(body.message, 800);
      if (!message) return reply({ ok: false, error: 'Ask me something about this workflow first.', retryable: false }, 400);
      const { nodes, edges } = cleanCanvas(body.nodes, body.edges);
      const history = (Array.isArray(body.history) ? body.history : [])
        .filter((h): h is Json => Boolean(h) && typeof h === 'object')
        .map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: s(h.text, 400) }))
        .slice(-6);

      const proposalReply = (ops: unknown, source: 'ai' | 'rules') => {
        const p = buildProposal(ops, nodes, edges, ctx);
        if (!p) return null;
        if ('error' in p) return reply({ ok: true, type: 'answer', text: p.error, source });
        return reply({ ok: true, type: 'proposal', proposal: p, source });
      };

      const rules = editWithRules(message, nodes, edges, ctx);
      if (rules?.kind === 'answer') return reply({ ok: true, type: 'answer', text: rules.text, source: 'rules' });
      if (rules?.kind === 'check') return reply({ ok: true, type: 'checklist', checklist: checkWorkflow(nodes, edges, ctx), intro: rules.intro });
      if (rules?.kind === 'test') return reply({ ok: true, type: 'test', result: simulateRun(nodes, edges, ctx) });
      if (rules?.kind === 'ask_step') {
        return reply({ ok: true, type: 'ask', ask: { question: `What should the new step after “${scrub(rules.label)}” do?`, options: STEP_OPTIONS, placeholder: 'Describe the step', context: { nodeId: rules.afterNodeId, code: 'add_after' } } });
      }
      if (rules?.kind === 'ops') {
        const r = proposalReply(rules.ops, 'rules');
        if (r) return r;
      }

      const problems = checkWorkflow(nodes, edges, ctx).items.flatMap((i) => i.issues.map((x) => `${i.nodeId ? `Step ${i.number} (${i.label})` : i.label}: ${x.message}`));
      const raw = await askModel(editPrompt(message, nodes, edges, history, problems));
      if (!raw) return reply({ ok: false, error: AI_DOWN, retryable: true }, 502);
      if (raw.type === 'change') {
        const r = proposalReply(raw.operations, 'ai');
        if (r) return r;
        return reply({ ok: true, type: 'answer', text: 'I couldn’t turn that into a change on this canvas. Try naming the step, for example “make the wait in step 3 two days”.', source: 'ai' });
      }
      const text = scrub(humanize(s(raw.text, 900)).replace(/\{\{[\s\S]*?\}\}/g, ''));
      return reply({ ok: true, type: 'answer', text: text || 'I can explain a step, change a setting, add or remove a step, or tell you what’s left to set up.', source: 'ai' });
    }

    return reply({ ok: false, error: 'Unknown assistant step.', retryable: false }, 400);
  } catch (err) {
    console.error('[workflow-assistant] failed:', err);
    return reply({ ok: false, error: 'Something went wrong on our side. Please try again.', retryable: true }, 500);
  }
}

function clipText(t: string, n: number) {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
