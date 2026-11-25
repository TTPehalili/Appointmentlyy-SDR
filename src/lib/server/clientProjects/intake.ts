/**
 * Server only. Client Intake: every client item on a board completes through a proper method (a form with uploads, a
 * system check, a signature, a payment), and its status syncs back to the owner's board.
 *
 *  - Requests are created from the SOP (SOP_INTAKE) for projects with intake on, lazily and idempotently (one per card,
 *    unique task_id), so live projects get them the first time they are opened after intake is turned on.
 *  - Every change goes through transition(): ONE optimistic write (rev), ONE `intake` event, the kanban column follows
 *    the unified status (not started -> To do, in progress / waiting on us -> In progress, complete -> Done, through
 *    setStatus so the existing automations and the Delivery Report see it), and the owner is told when something is
 *    waiting on us (the existing "Client completes an item" rule, claimed first).
 *  - Submissions are versioned and immutable; only the owner accepts or asks for changes; only the owner records a
 *    payment. Auto-apply runs only behind the owner's Accept click (intakeApply.ts).
 *  - The client board sees only what publicIntake() builds (called from the one public projection).
 */
import { rateLimit } from '@/lib/authToken';
import { isLocalTestServer } from '@/lib/server/agreements/mail';
import { getAgreementStore } from '@/lib/server/agreementStore';
import { clientNameOf, signingUrl, unsealToken } from '@/lib/server/agreements/core';
import { paymentStatus, balanceOf, paidSoFar } from '@/lib/agreements/envelope';
import type { Envelope } from '@/lib/agreements/envelope';
import { getTenantStore } from '@/lib/server/tenantStore';
import { getAppBaseUrl } from '@/lib/authToken';
import { getClientProjectStore, INTAKE_SOURCE, isCpId } from '@/lib/server/clientProjectStore';
import { liveBoardUrl, taskKey, text, today, uatOpen } from '@/lib/server/clientProjects/core';
import { CpError, claim, clientCtx, clientTask, log, mailOwner, safely, sendMail, setStatus, settle, type Ctx } from '@/lib/server/clientProjects/service';
import { checkIntakeFile } from '@/lib/server/clientProjects/uploads';
import { checkRecords, cleanDomain, cleanRecords, recordsFor } from '@/lib/server/clientProjects/dnsCheck';
import { listKeyChecks } from '@/lib/server/keyChecks';
import { applyBranding, applyCompany, applyInvites, applyTesters, clientWorkspace } from '@/lib/server/clientProjects/intakeApply';
import { newId, nowIso } from '@/lib/server/tenantStore';
import type { Actor } from '@/lib/server/tenancy';
import { PLATFORM_TENANT_CODE } from '@/lib/roles';
import { addBusinessDays, isDate, ruleOn, todayManila, type OwnerIntakeChip, type Project, type Task } from '@/lib/clientProjects/types';
import {
  COLUMN_FOR,
  FORM_TEMPLATES,
  INTAKE_LIMITS,
  PAYMENT_METHODS,
  PROVIDER_LABEL,
  SOP_INTAKE,
  UNIFIED_LABEL,
  acceptOf,
  cleanSchema,
  csvToTable,
  unifiedOf,
  sameTemplateFamily,
  validateAnswers,
  type Answers,
  type ApplyResult,
  type CpRequest,
  type CpSubmission,
  type FileKind,
  type IntakeFileRef,
  type PaymentMethod,
  type PublicIntake,
  type PublicIntakeFile,
  type RequestKind,
  type SysStatus,
  type TableRow,
  type UnifiedStatus,
} from '@/lib/clientProjects/intake';

const store = () => getClientProjectStore();
export const intakeOn = (p: Pick<Project, 'settings'>) => p.settings?.intake?.enabled === true;
const SYSTEM: Ctx = { actor: 'system' };

// ------------------------------------------------------------------ building requests

function initialSys(kind: RequestKind): SysStatus | null {
  if (kind === 'form') return null;
  if (kind === 'payment') return 'awaiting';
  return 'open';
}

export function newRequest(p: Pick<Project, 'id'>, t: Pick<Task, 'id'>, kind: RequestKind, templateKey: string, schema: CpRequest['schema'], config: CpRequest['config']): CpRequest {
  const now = nowIso();
  return {
    id: newId(),
    projectId: p.id,
    taskId: t.id,
    kind,
    templateKey,
    schema: schema ? JSON.parse(JSON.stringify(schema)) : null,
    formStatus: schema ? 'open' : null,
    sysStatus: initialSys(kind),
    draft: {},
    draftAt: null,
    draftBy: '',
    files: [],
    config: { ...config },
    state: {},
    version: 0,
    rev: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The project's requests, creating the SOP ones that are missing (client-side SOP cards only). Idempotent: the
 * unique task_id decides, so two requests racing create one row per card. With intake off, nothing is created.
 */
export async function ensureRequests(p: Project, tasks: Task[]): Promise<CpRequest[]> {
  const s = store();
  const have = await s.listRequests(p.id);
  if (!intakeOn(p)) return have;
  const byTask = new Set(have.map((r) => r.taskId));
  const missing = tasks
    .filter((t) => t.sopKey && SOP_INTAKE[t.sopKey] && t.ownerSide === 'client' && t.type !== 'defect' && !byTask.has(t.id))
    .map((t) => {
      const d = SOP_INTAKE[t.sopKey as string];
      return newRequest(p, t, d.kind, d.form ?? d.kind, d.form ? FORM_TEMPLATES[d.form] : null, d.config ?? {});
    });
  if (!missing.length) return have;
  await s.insertRequests(missing);
  return s.listRequests(p.id);
}

// ------------------------------------------------------------------ the one transition

export interface TransitionOpts {
  action: string;
  detail?: Record<string, unknown>;
  /** The card's status change is made as this actor (the owner for Accept / payment received; else the system). */
  statusCtx?: Ctx;
  /** Tell the owner (the "Client completes an item" rule), deduplicated on this key. */
  notify?: { key: string; subject: string; lines: string[] };
}

/**
 * Write the request change (optimistic on rev), log the event, move the card with the unified status, and notify.
 * Returns the updated request; throws 409 when the request changed in the meantime.
 */
export async function transition(p: Project, t: Task, req: CpRequest, patch: Partial<CpRequest>, ctx: Ctx, o: TransitionOpts): Promise<CpRequest> {
  const before: UnifiedStatus = unifiedOf(req);
  const updated = await store().updateRequest(req.id, patch, req.rev);
  if (!updated) throw new CpError(409, 'This item was just changed (in another tab, or by us). Reload and try again.', { code: 'stale' });
  const after: UnifiedStatus = unifiedOf(updated);
  await log(p, t.id, ctx.actor, 'intake', { action: o.action, key: taskKey(p, t), kind: req.kind, from: before, to: after, ...(o.detail ?? {}) });
  if (after !== before) await moveCard(p, t, after, o.statusCtx ?? { ...SYSTEM, origin: ctx.origin });
  if (o.notify && after === 'waiting_on_us' && ruleOn(p, 'client_done')) {
    const n = o.notify;
    await safely('intake-notify', async () => {
      const ev = await claim(p, 'client_done', t.id, { trigger: 'intake', key: taskKey(p, t), action: o.action }, n.key.slice(0, 200));
      if (ev) await settle(ev, await mailOwner(p, ctx, n.subject, n.lines));
    });
  }
  return updated;
}

/** The card follows the unified status. A Blocked card is only ever moved to Done (blocked means more than the form). */
async function moveCard(p: Project, t: Task, u: UnifiedStatus, ctx: Ctx): Promise<void> {
  const fresh = (await store().getTask(t.id)) ?? t;
  const to = COLUMN_FOR[u];
  if (fresh.status === to) return;
  if (fresh.status === 'blocked' && to !== 'done') return;
  await setStatus(p, fresh, to, ctx, {}, { because: `Client Intake: ${UNIFIED_LABEL[u].toLowerCase()}` });
}

// ------------------------------------------------------------------ the client's view (part of the ONE public projection)

const pubFile = (f: IntakeFileRef): PublicIntakeFile => ({ id: f.id, name: f.name, size: f.size, mime: f.mime, field: f.field });

/**
 * What the client board shows for one card's request. Built field by field: no config, no envelope ids, no payment
 * amounts or references, no review details beyond the owner's "changes requested" note, nothing about other cards.
 */
export function publicIntake(p: Project, req: CpRequest, latest: CpSubmission | null): PublicIntake {
  const u = unifiedOf(req);
  const form = req.schema
    ? {
        schema: req.schema,
        status: req.formStatus ?? 'open',
        draft: req.draft,
        draftAt: req.draftAt,
        version: req.version,
        submitted: latest ? latest.answers : null,
        submittedAt: latest ? latest.submittedAt : null,
        ownerNote: req.formStatus === 'changes_requested' ? (req.state.ownerNote ?? null) : null,
        files: req.files.filter((f) => f.field !== '__receipt').map(pubFile),
        locked: req.formStatus === 'submitted' || req.formStatus === 'accepted',
      }
    : null;
  let label: string = UNIFIED_LABEL[u];
  let tone: PublicIntake['tone'] = u === 'complete' ? 'success' : u === 'waiting_on_us' ? 'warning' : u === 'in_progress' ? 'brand' : 'neutral';
  let dns: PublicIntake['dns'] = null;
  let keys: PublicIntake['keys'] = null;
  let signature: PublicIntake['signature'] = null;
  let payment: PublicIntake['payment'] = null;
  let uat: PublicIntake['uat'] = null;
  if (req.kind === 'form' && form) {
    label = { open: 'Not started', draft: 'Draft saved', changes_requested: 'Changes requested', submitted: 'Submitted, in review', accepted: 'Accepted' }[form.status];
  }
  if (req.kind === 'dns') {
    const domain = req.config.domain ?? '';
    const records = domain ? recordsFor(p.id, domain, req.config.extraRecords ?? []) : [];
    const res = req.state.dns?.results ?? [];
    dns = { domain, records: records.map((r) => ({ ...r, ok: res.find((x) => x.type === r.type && x.name === r.name)?.ok ?? null })), checkedAt: req.state.dns?.checkedAt ?? null, canSetDomain: req.sysStatus !== 'verified' };
    label = req.sysStatus === 'verified' ? 'Verified' : !domain ? 'Tell us your sending domain' : req.sysStatus === 'partial' ? 'Some records are not found yet' : 'Add the records, then check';
  }
  if (req.kind === 'keys') {
    const ks = req.state.keys?.providers ?? [];
    const want = req.config.providers ?? [];
    keys = {
      providers: want.map((pv) => ({ provider: pv, label: PROVIDER_LABEL[pv] ?? pv, ok: ks.find((x) => x.provider === pv)?.ok === true })),
      workspaceUrl: p.settings?.intake?.tenantCode ? `${getAppBaseUrl()}/admin/ai-providers` : null,
      checkedAt: req.state.keys?.checkedAt ?? null,
      ready: Boolean(p.settings?.intake?.tenantCode),
    };
    label = req.sysStatus === 'verified' ? 'All providers passed' : req.sysStatus === 'partial' ? 'Some providers have not passed yet' : 'Not connected yet';
  }
  if (req.kind === 'signature') {
    const env = req.state.envelope;
    const ready = Boolean(req.config.envelopeId && env && ['sent', 'opened', 'signed', 'completed'].includes(env.status));
    const ack = req.config.templateId === 'delivery-report-v1';
    signature = {
      ready: ready && !['signed', 'completed', 'deemed', 'concern'].includes(req.sysStatus ?? ''),
      action: ack ? 'acknowledge' : 'sign',
      done: ['completed', 'deemed'].includes(req.sysStatus ?? ''),
      deemed: req.sysStatus === 'deemed',
      note: req.sysStatus === 'deemed' ? 'Treated as confirmed: no reply within 2 business days, as the agreement says.' : req.sysStatus === 'signed' ? 'Signed. We countersign and send you the final copy.' : req.sysStatus === 'concern' ? 'You raised a concern. We will reply here.' : null,
    };
    if (form && req.sysStatus !== 'completed' && req.sysStatus !== 'deemed') {
      label = form.status === 'accepted' ? (ready ? 'Ready to sign' : 'Details accepted') : form.status === 'submitted' ? 'Details submitted, in review' : ready ? 'Ready to sign' : 'Not started';
    } else
      label =
        req.sysStatus === 'completed' ? (ack ? 'Confirmed' : 'Signed') : req.sysStatus === 'deemed' ? 'Deemed confirmed' : req.sysStatus === 'signed' ? 'Signed, we are countersigning' : req.sysStatus === 'concern' ? 'Concern raised' : ready ? (ack ? 'Ready to confirm' : 'Ready to sign') : 'Not sent yet';
  }
  if (req.kind === 'payment') {
    const st = req.sysStatus === 'received' ? 'paid' : req.sysStatus === 'client_says_paid' ? 'confirming' : 'awaiting';
    const pay = req.state.payment ?? {};
    const receipt = pay.receiptFileId ? req.files.find((f) => f.id === pay.receiptFileId) : undefined;
    payment = {
      state: st,
      chip: st === 'paid' ? 'Paid ✓' : st === 'confirming' ? 'Confirming your payment' : 'Awaiting payment',
      // The owner's follow-up note, only while the card is back to "awaiting".
      note: st === 'awaiting' && pay.followUpAt ? `We haven’t received this yet.${pay.followUpNote ? ` ${pay.followUpNote}` : ''}` : null,
      canClaim: st === 'awaiting',
      statement: Boolean(req.config.envelopeId && req.state.envelope && ['sent', 'opened', 'signed', 'completed'].includes(req.state.envelope.status)),
      receipt: receipt ? pubFile(receipt) : null,
    };
    label = payment.chip;
    tone = st === 'paid' ? 'success' : st === 'confirming' ? 'warning' : 'neutral';
  }
  if (req.kind === 'uat') {
    uat = { note: req.sysStatus === 'completed' ? 'Testing is complete: the UAT certificate is signed.' : req.sysStatus === 'running' ? 'Testing is open. Report any issue in “UAT issues” below.' : 'Testing opens with the Readiness Notice.' };
    label = req.sysStatus === 'completed' ? 'Complete' : req.sysStatus === 'running' ? 'Testing open' : 'Not started';
  }
  return { requestId: req.id, kind: req.kind, unified: u, label, tone, form, dns, keys, signature, payment, uat };
}

/** The board's intake summary and the per-card views (only cards the client can see). */
export async function boardIntake(p: Project, tasks: Task[]): Promise<{ byTask: Map<string, PublicIntake>; summary: { forms: number; formsSubmitted: number; items: number; itemsComplete: number } } | null> {
  if (!intakeOn(p)) return null;
  let reqs: CpRequest[];
  try {
    reqs = await ensureRequests(p, tasks);
    reqs = await syncRequests(p, tasks, reqs, { throttleMs: 15_000 });
  } catch (err) {
    console.error('[client-intake board]', err instanceof Error ? err.message : err);
    return null;
  }
  const visible = new Set(tasks.filter((t) => t.clientVisible).map((t) => t.id));
  const subs = reqs.some((r) => r.version > 0) ? await store().listSubmissions(p.id, { limit: 500 }) : [];
  const byTask = new Map<string, PublicIntake>();
  for (const r of reqs) {
    if (!visible.has(r.taskId)) continue;
    const latest = subs.filter((x) => x.requestId === r.id).sort((a, b) => b.version - a.version)[0] ?? null;
    byTask.set(r.taskId, publicIntake(p, r, latest));
  }
  const shown = reqs.filter((r) => visible.has(r.taskId));
  const forms = shown.filter((r) => r.schema);
  return {
    byTask,
    summary: {
      forms: forms.length,
      formsSubmitted: forms.filter((r) => r.formStatus === 'submitted' || r.formStatus === 'accepted').length,
      items: shown.length,
      itemsComplete: shown.filter((r) => unifiedOf(r) === 'complete').length,
    },
  };
}

/** Owner board chips, one per card with a request. */
export async function ownerChips(p: Project, tasks: Task[]): Promise<Map<string, OwnerIntakeChip>> {
  const out = new Map<string, OwnerIntakeChip>();
  if (!intakeOn(p)) return out;
  try {
    let reqs = await ensureRequests(p, tasks);
    reqs = await syncRequests(p, tasks, reqs, { throttleMs: 15_000 });
    for (const r of reqs) {
      const pub = publicIntake(p, r, null);
      out.set(r.taskId, { requestId: r.id, kind: r.kind, unified: pub.unified, label: pub.unified === 'waiting_on_us' ? 'Waiting on us' : pub.label, review: r.formStatus === 'submitted' || r.sysStatus === 'client_says_paid' });
    }
  } catch (err) {
    console.error('[client-intake chips]', err instanceof Error ? err.message : err);
  }
  return out;
}

// ------------------------------------------------------------------ sync with the platform (envelopes, keys, UAT)

const g = globalThis as typeof globalThis & { __cpIntakeSync?: Map<string, number> };
const lastSync = (g.__cpIntakeSync ??= new Map());

/** Legal-form words dropped from the END of a company name before comparing ("Business Services" is not one). */
const LEGAL_SUFFIXES = new Set(['inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited', 'llc', 'co', 'company', 'pty', 'pte', 'plc', 'gmbh', 'opc', 'llp', 'lp']);
/** A company name compared on its words: lower case, punctuation as spaces, trailing legal forms dropped. */
export function clientKey(v: string): string {
  const words = v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}
/**
 * The same client? EXACT equality of the normalised names (security review H2: a substring match let "Ace Co" pick up
 * "Space Coast Ltd"'s envelopes). Used by the auto-link and by the owner's link guard alike.
 */
export const sameClient = (a: string, b: string) => {
  const x = clientKey(a);
  const y = clientKey(b);
  return Boolean(x && y && x === y);
};

/** Delivery Reports are treated as confirmed when 2 Business Days pass after they were sent without a reply. */
export function deemedOn(sentAt: string | null): string | null {
  if (!sentAt) return null;
  return addBusinessDays(todayManila(new Date(sentAt)), 2);
}

function envelopeSys(req: CpRequest, e: Envelope, now: string): { sys: SysStatus; deemed: string | null } {
  if (req.kind === 'payment') {
    if (e.billing && paymentStatus(e.billing) === 'paid') return { sys: 'received', deemed: null };
    return { sys: req.sysStatus === 'client_says_paid' ? 'client_says_paid' : 'awaiting', deemed: null };
  }
  const ack = e.templateMeta?.action === 'acknowledge' || e.templateId === 'delivery-report-v1';
  if (e.status === 'completed') {
    if (ack && e.signer?.outcome === 'concern') return { sys: 'concern', deemed: null };
    return { sys: 'completed', deemed: null };
  }
  if (e.status === 'signed') return { sys: 'signed', deemed: null };
  if (ack && (e.status === 'sent' || e.status === 'opened')) {
    const d = deemedOn(e.sentAt);
    if (d && now > d) return { sys: 'deemed', deemed: d };
  }
  if (e.status === 'sent' || e.status === 'opened') return { sys: 'sent', deemed: null };
  return { sys: 'open', deemed: null };
}

/**
 * Bring signature, payment, keys and UAT requests up to date with the platform. Auto-links an envelope by template
 * and client name when none is linked (the Nth envelope of that template for this client, oldest first, not already
 * linked to another card). Cheap: one envelope list and one key-check read per call, throttled per project.
 */
export async function syncRequests(p: Project, tasks: Task[], reqs: CpRequest[], o: { throttleMs?: number; force?: boolean } = {}): Promise<CpRequest[]> {
  if (!intakeOn(p)) return reqs;
  const since = Date.now() - (lastSync.get(p.id) ?? 0);
  if (!o.force && o.throttleMs && since < o.throttleMs) return reqs;
  lastSync.set(p.id, Date.now());
  if (lastSync.size > 5000) lastSync.clear();
  const now = today();
  const needEnv = reqs.some((r) => (r.kind === 'signature' || r.kind === 'payment') && !['completed', 'received', 'deemed'].includes(r.sysStatus ?? ''));
  let envelopes: Envelope[] = [];
  if (needEnv) {
    try {
      envelopes = (await getAgreementStore().listEnvelopes()).filter((e) => !['revoked', 'declined', 'expired'].includes(e.status));
    } catch (err) {
      console.error('[client-intake sync envelopes]', err instanceof Error ? err.message : err);
    }
  }
  const out: CpRequest[] = [];
  const taken = new Set(reqs.map((r) => r.config.envelopeId).filter(Boolean) as string[]);
  for (const r0 of reqs) {
    let r = r0;
    const t = tasks.find((x) => x.id === r.taskId);
    if (!t) {
      out.push(r);
      continue;
    }
    try {
      if ((r.kind === 'signature' || r.kind === 'payment') && !['completed', 'received', 'deemed'].includes(r.sysStatus ?? '')) r = await syncEnvelope(p, t, r, envelopes, taken, now);
      else if (r.kind === 'keys' && r.sysStatus !== 'verified') r = await syncKeys(p, t, r, false);
      else if (r.kind === 'uat' && r.sysStatus !== 'completed') r = await syncUat(p, t, r, tasks, reqs);
    } catch (err) {
      if (!(err instanceof CpError)) console.error('[client-intake sync]', err instanceof Error ? err.message : err);
    }
    out.push(r);
  }
  return out;
}

async function syncEnvelope(p: Project, t: Task, r: CpRequest, envelopes: Envelope[], taken: Set<string>, now: string): Promise<CpRequest> {
  let e = r.config.envelopeId ? envelopes.find((x) => x.id === r.config.envelopeId) : undefined;
  let linked = false;
  if (!r.config.envelopeId && r.config.templateId) {
    const mine = envelopes.filter((x) => sameTemplateFamily(x.templateId, r.config.templateId!) && sameClient(clientNameOf(x), p.clientName)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    // The Nth envelope of that template for this client (Delivery Report #2 is the second one), if no card has it.
    const want = mine[(r.config.ordinal ?? 1) - 1];
    const pick = want && !taken.has(want.id) ? want : undefined;
    if (pick) {
      e = pick;
      linked = true;
      taken.add(pick.id);
    }
  }
  if (!e) return r;
  const { sys, deemed } = envelopeSys(r, e, now);
  const envState = { status: e.status, title: e.title.slice(0, 200), outcome: e.signer?.outcome ?? null, signedAt: e.signedAt, completedAt: e.completedAt, sentAt: e.sentAt, deemedOn: deemed, paid: e.billing ? paymentStatus(e.billing) === 'paid' : undefined };
  const same = JSON.stringify(r.state.envelope ?? null) === JSON.stringify(envState) && sys === r.sysStatus && !linked;
  if (same) return r;
  const patch: Partial<CpRequest> = { sysStatus: sys, state: { ...r.state, envelope: envState } };
  if (linked) patch.config = { ...r.config, envelopeId: e.id, envelopeLinkedBy: 'auto' };
  if (r.kind === 'payment' && sys === 'received' && r.sysStatus !== 'received') {
    const b = e.billing;
    const lastPay = b?.payments[b.payments.length - 1];
    patch.state = { ...patch.state, payment: { ...(r.state.payment ?? {}), received: { amount: b ? paidSoFar(b) : 0, date: lastPay?.date ?? now, method: 'other', reference: lastPay?.reference ?? '', by: lastPay?.by ?? 'agreements', at: nowIso(), via: 'agreements' } }, completedVia: 'payment recorded in Agreements', completedAt: nowIso() };
  }
  if (sys === 'deemed') patch.state = { ...patch.state, completedVia: `deemed confirmed on ${deemed} (2 business days after it was sent, no reply)`, completedAt: nowIso() };
  if (sys === 'completed') patch.state = { ...patch.state, completedVia: e.signer?.outcome === 'confirmed' ? 'confirmed in Agreements' : 'signed in Agreements', completedAt: nowIso() };
  if (linked) await log(p, t.id, 'system', 'intake', { action: 'envelope_linked', key: taskKey(p, t), envelopeId: e.id, auto: true });
  const action = sys === 'deemed' ? 'deemed_confirmed' : r.kind === 'payment' && sys === 'received' ? 'payment_received' : 'envelope_status';
  return transition(p, t, r, patch, SYSTEM, {
    action,
    detail: { status: e.status, ...(sys === 'deemed' ? { sentOn: todayManila(new Date(e.sentAt as string)), deemedOn: deemed } : {}), ...(action === 'payment_received' ? { via: 'agreements' } : {}) },
    notify: sys === 'signed' || sys === 'concern' ? { key: `intake|${r.id}|${sys}`, subject: `${p.clientName}: ${taskKey(p, t)} ${sys === 'signed' ? 'signed by the client (your countersignature is next)' : 'the client raised a concern on the Delivery Report'}`, lines: [`“${t.title}”: ${sys === 'signed' ? 'the client has signed. Countersign it in Agreements to complete it.' : 'the client raised a concern. Open the envelope in Agreements to read and answer it.'}`] } : undefined,
  });
}

async function keyResults(p: Project, providers: string[]): Promise<{ provider: string; ok: boolean; at: string | null }[]> {
  const ws = await clientWorkspace(p);
  const checks = ws ? await listKeyChecks(ws.code) : [];
  return providers.map((pv) => {
    const group = pv === 'ai' ? ['claude', 'openai', 'gemini'] : [pv];
    const hit = checks.filter((c) => group.includes(c.provider) && c.ok).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
    return { provider: pv, ok: Boolean(hit), at: hit?.checkedAt ?? null };
  });
}

async function syncKeys(p: Project, t: Task, r: CpRequest, logAlways: boolean, ctx: Ctx = SYSTEM): Promise<CpRequest> {
  const providers = r.config.providers ?? [];
  const res = await keyResults(p, providers);
  const ok = res.filter((x) => x.ok).length;
  const sys: SysStatus = providers.length && ok === providers.length ? 'verified' : ok > 0 ? 'partial' : 'open';
  if (!logAlways && sys === r.sysStatus && JSON.stringify(r.state.keys?.providers ?? []) === JSON.stringify(res)) return r;
  return transition(p, t, r, { sysStatus: sys, state: { ...r.state, keys: { checkedAt: nowIso(), providers: res }, ...(sys === 'verified' ? { completedVia: 'every required provider passed “Test connection” in the client’s workspace', completedAt: nowIso() } : {}) } }, ctx, { action: 'keys_checked', detail: { ok, total: providers.length } });
}

async function syncUat(p: Project, t: Task, r: CpRequest, tasks: Task[], reqs: CpRequest[]): Promise<CpRequest> {
  const cert = tasks.find((x) => x.sopKey === (r.config.followsSopKey ?? 'uat-signoff') && x.type !== 'defect');
  const certReq = cert ? reqs.find((x) => x.taskId === cert.id) : undefined;
  const certDone = Boolean(cert && (cert.status === 'done' || (certReq && unifiedOf(certReq) === 'complete')));
  const sys: SysStatus = certDone ? 'completed' : uatOpen(p) ? 'running' : 'open';
  if (sys === r.sysStatus) return r;
  return transition(p, t, r, { sysStatus: sys, state: { ...r.state, ...(sys === 'completed' ? { completedVia: 'the UAT Sign-off Certificate is complete', completedAt: nowIso() } : {}) } }, SYSTEM, { action: sys === 'completed' ? 'uat_complete' : 'status' });
}

// ------------------------------------------------------------------ client actions (shared board, token-scoped)

export interface ClientIntakeInput {
  requestId: unknown;
  name: unknown;
  answers?: unknown;
  fileId?: unknown;
  domain?: unknown;
  receiptFileId?: unknown;
}

/** The request of a card the client can see, in this project, with intake on. Anything else is a 404. */
async function clientRequest(p: Project, requestId: unknown): Promise<{ req: CpRequest; task: Task }> {
  if (!intakeOn(p)) throw new CpError(404, 'Item not found.');
  const req = isCpId(requestId) ? await store().getRequest(requestId) : null;
  if (!req || req.projectId !== p.id) throw new CpError(404, 'Item not found.');
  const task = await clientTask(p, req.taskId);
  return { req, task };
}

const answersTooBig = (v: unknown) => JSON.stringify(v ?? {}).length > INTAKE_LIMITS.answersBytes;
const fileName = (r: CpRequest) => (id: string) => r.files.find((f) => f.id === id)?.name ?? 'a file';

export async function clientSaveDraft(p: Project, input: ClientIntakeInput, origin?: string): Promise<CpRequest> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  if (!req.schema) throw new CpError(400, 'This item has no form.');
  if (req.formStatus === 'submitted' || req.formStatus === 'accepted') throw new CpError(409, req.formStatus === 'accepted' ? 'This form was accepted and is locked.' : 'This form is in review. We will tell you if anything needs changing.');
  if (answersTooBig(input.answers)) throw new CpError(413, 'The form is too large. Shorten the longest answers.');
  const v = validateAnswers(req.schema, input.answers, req.files, 'draft');
  // A draft keeps what is valid and reports the rest (it is a partial form by definition).
  return transition(p, task, req, { draft: v.value, draftAt: nowIso(), draftBy: ctx.actor.slice(7), formStatus: req.formStatus === 'changes_requested' ? 'changes_requested' : 'draft' }, ctx, { action: 'draft_saved', detail: { fields: Object.keys(v.value).length, problems: Object.keys(v.errors).length } });
}

export async function clientSubmit(p: Project, input: ClientIntakeInput, origin?: string): Promise<{ request: CpRequest; submission: CpSubmission }> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  if (!req.schema) throw new CpError(400, 'This item has no form.');
  if (req.formStatus === 'submitted' || req.formStatus === 'accepted') throw new CpError(409, req.formStatus === 'accepted' ? 'This form was accepted and is locked.' : 'This form is already in review.');
  if (answersTooBig(input.answers)) throw new CpError(413, 'The form is too large. Shorten the longest answers.');
  const v = validateAnswers(req.schema, input.answers, req.files, 'submit');
  if (!v.ok) throw new CpError(400, 'Some answers need fixing before you submit.', { code: 'invalid', errors: v.errors });
  const s = store();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  if ((await s.listSubmissions(p.id, { since, limit: INTAKE_LIMITS.submissionsPerDay + 1 })).length >= INTAKE_LIMITS.submissionsPerDay) throw new CpError(429, 'This board has had many submissions today. Please try again tomorrow, or contact us directly.');
  const version = req.version + 1;
  const used = new Set(Object.entries(v.value).flatMap(([k, val]) => (req.schema?.fields.find((f) => f.key === k)?.type === 'file' ? (val as string[]) : [])));
  const files = req.files.filter((f) => used.has(f.id) || (f.field && req.schema?.fields.find((x) => x.key === f.field)?.type === 'table'));
  const sub: CpSubmission = { id: newId(), projectId: p.id, requestId: req.id, taskId: task.id, version, answers: v.value, files, actor: ctx.actor, submittedAt: nowIso(), status: 'submitted', reviewNote: '', reviewedBy: null, reviewedAt: null, applied: [] };
  const saved = await s.addSubmission(sub);
  if (!saved) throw new CpError(409, 'This version was already submitted. Reload the board.');
  // Earlier versions still waiting for review are superseded by this one.
  for (const old of await s.listSubmissions(p.id, { requestId: req.id, limit: 50 })) if (old.id !== saved.id && old.status === 'submitted') await s.reviewSubmission(old.id, { status: 'superseded' }, ['submitted']);
  const state = { ...req.state };
  delete state.ownerNote;
  delete state.ownerNoteAt;
  const updated = await transition(p, task, req, { draft: v.value, draftAt: nowIso(), draftBy: ctx.actor.slice(7), formStatus: 'submitted', version, state }, ctx, {
    action: 'submitted',
    detail: { version, files: files.length, submissionId: saved.id },
    notify: { key: `intake-submit|${req.id}|v${version}`, subject: `${p.clientName}: ${taskKey(p, task)} submitted for your review (v${version})`, lines: [`${ctx.actor.slice(7)} (self-identified on the shared board) submitted “${req.schema.title}”, version ${version}${files.length ? `, with ${files.length} file${files.length === 1 ? '' : 's'}` : ''}.`, 'Open the project to accept it or ask for changes. Nothing is applied until you accept.'] },
  });
  return { request: updated, submission: saved };
}

/** Upload one file into the request's working set (a form field, a CSV for a table, or the payment receipt). */
export async function clientUpload(p: Project, input: { requestId: unknown; field: unknown; name: unknown; personName: unknown }, bytes: Uint8Array, origin?: string): Promise<{ file: IntakeFileRef; csv?: { rows: TableRow[]; unmatched: string[]; error?: string } }> {
  const ctx = clientCtx(input.personName, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  const field = typeof input.field === 'string' ? input.field : '';
  let accept: FileKind[];
  let csvTable = false;
  if (field === '__receipt') {
    if (req.kind !== 'payment') throw new CpError(400, 'Receipts belong on a payment item.');
    if (req.sysStatus === 'received') throw new CpError(409, 'This payment is already confirmed.');
    accept = ['pdf', 'png', 'jpg'];
  } else {
    if (!req.schema) throw new CpError(400, 'This item has no form.');
    if (req.formStatus === 'submitted' || req.formStatus === 'accepted') throw new CpError(409, 'This form is locked while it is in review or accepted.');
    const f = req.schema.fields.find((x) => x.key === field);
    if (!f || (f.type !== 'file' && !(f.type === 'table' && f.csv))) throw new CpError(400, 'That field does not take files.');
    csvTable = f.type === 'table';
    accept = csvTable ? ['csv'] : acceptOf(f);
    const inField = req.files.filter((x) => x.field === field).length;
    if (!csvTable && inField >= Math.min(f.max ?? 10, INTAKE_LIMITS.filesPerRequest)) throw new CpError(409, `This field holds at most ${Math.min(f.max ?? 10, INTAKE_LIMITS.filesPerRequest)} file(s). Remove one first.`);
  }
  if (req.files.length >= INTAKE_LIMITS.filesPerRequest) throw new CpError(409, `At most ${INTAKE_LIMITS.filesPerRequest} files per item. Remove one first.`);
  const s = store();
  const all = await s.listFiles(p.id, 'intake');
  if (all.length >= INTAKE_LIMITS.projectFiles || all.reduce((n, f) => n + f.size, 0) + bytes.length > INTAKE_LIMITS.projectBytes) throw new CpError(409, 'This board has reached its file allowance. Contact us to send more.');
  if (!rateLimit(`cp-intake-upload-day:${p.id}`, INTAKE_LIMITS.uploadsPerDay, 24 * 3600_000)) throw new CpError(429, 'This board has had many uploads today. Please try again tomorrow.');
  const checked = await checkIntakeFile(bytes, input.name, accept);
  if (!checked.ok) throw new CpError(400, checked.error);
  const meta = await s.putFile({ projectId: p.id, name: checked.name, pages: 0, source: INTAKE_SOURCE, taskId: task.id, clientVisible: false, mime: checked.mime }, checked.bytes);
  const ref: IntakeFileRef = { id: meta.id, name: meta.name, size: meta.size, mime: meta.mime, sha256: meta.sha256, field, ...(checked.originalSha256 ? { originalSha256: checked.originalSha256 } : {}), at: meta.createdAt };
  // The working set gains the file (re-read on a concurrent change: two uploads at once both land).
  let cur = req;
  for (let i = 0; i < 4; i++) {
    const files = csvTable ? [...cur.files.filter((x) => x.field !== field), ref] : [...cur.files, ref];
    try {
      cur = await transition(p, task, cur, { files }, ctx, { action: 'file_added', detail: { kind: checked.kind, size: meta.size, sha256: meta.sha256, field: field === '__receipt' ? 'receipt' : 'form' } });
      break;
    } catch (err) {
      if (!(err instanceof CpError && err.extra.code === 'stale') || i === 3) {
        await s.deleteFile(meta.id).catch(() => undefined);
        throw err;
      }
      const again = await s.getRequest(req.id);
      if (!again) throw err;
      cur = again;
    }
  }
  // A replaced CSV for a table is removed if no submission refers to it.
  if (csvTable) for (const old of req.files.filter((x) => x.field === field)) await dropIfUnused(p, req, old.id);
  const csv = csvTable && checked.csvRows && req.schema ? csvToTable(req.schema.fields.find((x) => x.key === field) as NonNullable<typeof req.schema>['fields'][number], checked.csvRows) : undefined;
  return { file: ref, ...(csv ? { csv } : {}) };
}

async function dropIfUnused(p: Project, req: CpRequest, fileId: string): Promise<void> {
  const subs = await store().listSubmissions(p.id, { requestId: req.id, limit: 200 });
  if (subs.some((x) => x.files.some((f) => f.id === fileId))) return; // evidence: kept
  await store().deleteFile(fileId);
}

export async function clientRemoveFile(p: Project, input: ClientIntakeInput, origin?: string): Promise<CpRequest> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  const f = req.files.find((x) => x.id === input.fileId);
  if (!f) throw new CpError(404, 'File not found.');
  if (f.field !== '__receipt' && (req.formStatus === 'submitted' || req.formStatus === 'accepted')) throw new CpError(409, 'This form is locked while it is in review or accepted.');
  if (f.field === '__receipt' && req.sysStatus !== 'awaiting') throw new CpError(409, 'The receipt was sent with your payment. Contact us if it is wrong.');
  const draft = { ...req.draft };
  for (const [k, v] of Object.entries(draft)) if (Array.isArray(v) && (v as unknown[]).includes(f.id)) draft[k] = (v as string[]).filter((x) => x !== f.id);
  const updated = await transition(p, task, req, { files: req.files.filter((x) => x.id !== f.id), draft }, ctx, { action: 'file_removed', detail: { sha256: f.sha256 } });
  await dropIfUnused(p, req, f.id);
  return updated;
}

export async function clientSetDomain(p: Project, input: ClientIntakeInput, origin?: string): Promise<CpRequest> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  if (req.kind !== 'dns') throw new CpError(400, 'This item is not a DNS item.');
  if (req.sysStatus === 'verified') throw new CpError(409, 'This domain is already verified.');
  const domain = cleanDomain(input.domain);
  if (!domain) throw new CpError(400, 'Enter your sending domain, for example mail.yourcompany.com.');
  return transition(p, task, req, { config: { ...req.config, domain }, sysStatus: 'open', state: { ...req.state, dns: undefined } }, ctx, { action: 'domain_set' });
}

function checkAllowance(p: Project, who: string): void {
  if (!rateLimit(`cp-intake-check:${p.id}`, INTAKE_LIMITS.checksPerDay, 24 * 3600_000) || !rateLimit(`cp-intake-check1:${p.id}:${who}`, 20, 10 * 60_000)) throw new CpError(429, 'Too many checks. Wait a few minutes and try again.');
}

export async function runDnsCheck(p: Project, t: Task, req: CpRequest, ctx: Ctx): Promise<CpRequest> {
  const domain = req.config.domain;
  if (!domain) throw new CpError(400, 'Set the sending domain first.');
  const records = recordsFor(p.id, domain, req.config.extraRecords ?? []);
  const results = await checkRecords(records);
  const ok = results.filter((x) => x.ok).length;
  const sys: SysStatus = ok === results.length ? 'verified' : 'partial';
  return transition(p, t, req, { sysStatus: sys, state: { ...req.state, dns: { checkedAt: nowIso(), results }, ...(sys === 'verified' ? { completedVia: 'every DNS record was found', completedAt: nowIso() } : {}) } }, ctx, { action: 'dns_checked', detail: { ok, total: results.length } });
}

export async function clientCheckDns(p: Project, input: ClientIntakeInput, origin?: string): Promise<CpRequest> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  if (req.kind !== 'dns') throw new CpError(400, 'This item is not a DNS item.');
  if (req.sysStatus === 'verified') return req;
  checkAllowance(p, 'client');
  return runDnsCheck(p, task, req, ctx);
}

export async function clientCheckKeys(p: Project, input: ClientIntakeInput, origin?: string): Promise<CpRequest> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  if (req.kind !== 'keys') throw new CpError(400, 'This item is not a provider-keys item.');
  if (req.sysStatus === 'verified') return req;
  checkAllowance(p, 'client');
  return syncKeys(p, task, req, true, ctx);
}

/** "I've paid" (with an optional receipt already uploaded): Confirming your payment. Only the owner confirms. */
export async function clientPaid(p: Project, input: ClientIntakeInput, origin?: string): Promise<CpRequest> {
  const ctx = clientCtx(input.name, origin);
  const { req, task } = await clientRequest(p, input.requestId);
  if (req.kind !== 'payment') throw new CpError(400, 'This item is not a payment.');
  if (req.sysStatus === 'client_says_paid' || req.sysStatus === 'received') return req;
  let receipt: string | null = null;
  if (input.receiptFileId !== undefined && input.receiptFileId !== null && input.receiptFileId !== '') {
    const f = req.files.find((x) => x.id === input.receiptFileId && x.field === '__receipt');
    if (!f) throw new CpError(400, 'Upload the receipt again.');
    receipt = f.id;
  }
  const pay = { ...(req.state.payment ?? {}), claimedBy: ctx.actor.slice(7), claimedAt: nowIso(), receiptFileId: receipt };
  delete pay.followUpAt;
  delete pay.followUpNote;
  return transition(p, task, req, { sysStatus: 'client_says_paid', state: { ...req.state, payment: pay } }, ctx, {
    action: 'paid_claimed',
    detail: { receipt: Boolean(receipt) },
    notify: { key: `intake-paid|${req.id}|${today()}`, subject: `${p.clientName}: ${taskKey(p, task)} the client says it is paid (needs your confirmation)`, lines: [`${ctx.actor.slice(7)} (self-identified on the shared board) says “${task.title}” is paid${receipt ? ', with a receipt attached' : ''}.`, 'It is NOT marked paid. Check the payment, then record it on the card (Payment received) or in Agreements.'] },
  });
}

/** Where "Open to sign / confirm" and "View billing statement" go: the envelope's signer page, resolved at click time. */
export async function clientOpenLink(p: Project, requestId: unknown, origin?: string): Promise<string> {
  const { req } = await clientRequest(p, requestId);
  if ((req.kind !== 'signature' && req.kind !== 'payment') || !req.config.envelopeId) throw new CpError(404, 'Not ready yet.');
  const e = await getAgreementStore().getEnvelope(req.config.envelopeId);
  if (!e || !['sent', 'opened', 'signed', 'completed'].includes(e.status)) throw new CpError(404, 'Not ready yet.');
  const token = unsealToken(e);
  if (!token) throw new CpError(404, 'Not ready yet.');
  return signingUrl(token, origin);
}

// ------------------------------------------------------------------ owner actions

async function ownerRequest(p: Project, requestId: unknown): Promise<{ req: CpRequest; task: Task }> {
  const req = isCpId(requestId) ? await store().getRequest(requestId) : null;
  if (!req || req.projectId !== p.id) throw new CpError(404, 'Request not found.');
  const task = await store().getTask(req.taskId);
  if (!task || task.projectId !== p.id) throw new CpError(404, 'Card not found.');
  return { req, task };
}

export async function setIntakeEnabled(p: Project, on: boolean, ctx: Ctx): Promise<Project> {
  const s = store();
  const updated = await s.updateProject(p.id, { settings: { ...(p.settings ?? {}), intake: { ...(p.settings?.intake ?? {}), enabled: on } } as Project['settings'] });
  if (!updated) throw new CpError(404, 'Project not found.');
  await log(p, null, ctx.actor, 'intake', { action: on ? 'intake_enabled' : 'intake_disabled' });
  if (on) await ensureRequests(updated, await s.listTasks(p.id));
  return updated;
}

/** The client's own workspace for branding, invites and key checks. Never the platform workspace. */
export async function setWorkspace(p: Project, code: unknown, ctx: Ctx): Promise<Project> {
  let tenantCode: string | null = null;
  if (code !== null && code !== '') {
    if (typeof code !== 'string' || code === PLATFORM_TENANT_CODE) throw new CpError(400, 'Pick the client’s own workspace.');
    const t = await getTenantStore().getTenant(code);
    if (!t) throw new CpError(400, 'That workspace does not exist.');
    tenantCode = t.code;
  }
  const updated = await store().updateProject(p.id, { settings: { ...(p.settings ?? {}), intake: { ...(p.settings?.intake ?? {}), tenantCode } } as Project['settings'] });
  if (!updated) throw new CpError(404, 'Project not found.');
  await log(p, null, ctx.actor, 'intake', { action: 'workspace_set', tenantCode });
  return updated;
}

/** Attach a request to a client card: a template form, a custom form, or one of the system kinds. */
export async function attachRequest(p: Project, t: Task, raw: Record<string, unknown>, ctx: Ctx): Promise<CpRequest> {
  if (!intakeOn(p)) throw new CpError(409, 'Turn on Client Intake for this project first.');
  if (t.ownerSide !== 'client' || t.type === 'defect') throw new CpError(400, 'Only client items can carry a client intake step.');
  const s = store();
  const existing = (await s.listRequests(p.id)).find((r) => r.taskId === t.id);
  if (existing) throw new CpError(409, 'This card already has a client intake step.');
  const kind = (['form', 'dns', 'keys', 'payment'] as const).find((k) => k === raw.kind) ?? 'form';
  let schema: CpRequest['schema'] = null;
  let key: string = kind;
  if (kind === 'form') {
    if (typeof raw.template === 'string' && Object.hasOwn(FORM_TEMPLATES, raw.template)) {
      schema = FORM_TEMPLATES[raw.template];
      key = raw.template;
    } else {
      try {
        schema = cleanSchema(raw.schema);
      } catch (err) {
        throw new CpError(400, err instanceof Error ? err.message : 'The form could not be used.');
      }
      key = 'custom';
    }
  }
  const req = newRequest(p, t, kind, key, schema, kind === 'keys' ? { providers: ['ai', 'elevenlabs', 'resend'] } : {});
  if (!(await s.insertRequests([req]))) throw new CpError(409, 'This card already has a client intake step.');
  await log(p, t.id, ctx.actor, 'intake', { action: 'request_attached', key: taskKey(p, t), kind, template: key });
  return (await s.getRequest(req.id)) ?? req;
}

/** Owner settings on a request: the envelope link, the sending domain and extra records, the required providers. */
export async function configRequest(p: Project, requestId: unknown, raw: Record<string, unknown>, ctx: Ctx): Promise<CpRequest> {
  const { req, task } = await ownerRequest(p, requestId);
  const config = { ...req.config };
  const detail: Record<string, unknown> = {};
  let state = req.state;
  let sys = req.sysStatus;
  if ('envelopeId' in raw) {
    if (req.kind !== 'signature' && req.kind !== 'payment') throw new CpError(400, 'Only signature and payment items link to an envelope.');
    if (raw.envelopeId === null || raw.envelopeId === '') {
      config.envelopeId = null;
      config.envelopeLinkedBy = 'owner';
      state = { ...state, envelope: undefined };
      if (req.kind === 'signature') sys = 'open';
    } else {
      const e = isCpId(raw.envelopeId) ? await getAgreementStore().getEnvelope(raw.envelopeId) : null;
      if (!e) throw new CpError(400, 'That envelope was not found.');
      // Never another client's envelope: its signer link would open on this client's board.
      if (!sameClient(clientNameOf(e), p.clientName)) throw new CpError(400, `That envelope is for “${clientNameOf(e) || 'no client name'}”, not ${p.clientName}. Link this client’s own envelope.`, { code: 'other_client' });
      config.envelopeId = e.id;
      config.envelopeLinkedBy = 'owner';
    }
    detail.envelopeId = config.envelopeId ?? null;
  }
  if ('domain' in raw) {
    if (req.kind !== 'dns') throw new CpError(400, 'Only the DNS item has a domain.');
    const d = raw.domain === '' || raw.domain === null ? '' : cleanDomain(raw.domain);
    if (d === null) throw new CpError(400, 'Enter a valid domain, for example mail.client.com.');
    config.domain = d || undefined;
    state = { ...state, dns: undefined };
    if (sys === 'verified' || sys === 'partial') sys = 'open';
  }
  if ('extraRecords' in raw) {
    if (req.kind !== 'dns' || !config.domain) throw new CpError(400, 'Set the domain first.');
    try {
      config.extraRecords = cleanRecords(raw.extraRecords, config.domain);
    } catch (err) {
      throw new CpError(400, err instanceof Error ? err.message : 'Check the records.');
    }
    state = { ...state, dns: undefined };
    if (sys === 'verified') sys = 'partial';
  }
  if ('providers' in raw) {
    if (req.kind !== 'keys') throw new CpError(400, 'Only the provider-keys item has providers.');
    const list = Array.isArray(raw.providers) ? [...new Set(raw.providers.filter((x): x is string => typeof x === 'string' && Object.hasOwn(PROVIDER_LABEL, x)))] : [];
    if (!list.length) throw new CpError(400, 'Pick at least one provider.');
    config.providers = list;
  }
  const updated = await transition(p, task, req, { config, state, sysStatus: sys }, ctx, { action: 'config', detail });
  if ('envelopeId' in raw) {
    await log(p, task.id, ctx.actor, 'intake', { action: 'envelope_linked', key: taskKey(p, task), envelopeId: config.envelopeId ?? null, auto: false });
    const tasks = await store().listTasks(p.id);
    const [synced] = await syncRequests(p, tasks, [updated], { force: true });
    return synced;
  }
  return updated;
}

export async function ownerCheckDns(p: Project, requestId: unknown, ctx: Ctx): Promise<CpRequest> {
  const { req, task } = await ownerRequest(p, requestId);
  if (req.kind !== 'dns') throw new CpError(400, 'This item is not a DNS item.');
  checkAllowance(p, 'owner');
  return runDnsCheck(p, task, req, ctx);
}

export async function ownerCheckKeys(p: Project, requestId: unknown, ctx: Ctx): Promise<CpRequest> {
  const { req, task } = await ownerRequest(p, requestId);
  if (req.kind !== 'keys') throw new CpError(400, 'This item is not a provider-keys item.');
  return syncKeys(p, task, req, true, ctx);
}

export interface AcceptOptions {
  branding?: boolean;
  /** Emails to invite (the owner's approved list); omit or null = none. */
  invites?: string[] | null;
  testers?: boolean;
  company?: boolean;
}

/** Run the auto-apply targets of an accepted submission (each one explicitly chosen by the owner). */
async function runApply(p: Project, req: CpRequest, sub: CpSubmission, opts: AcceptOptions, actor: Actor, ctx: Ctx): Promise<ApplyResult[]> {
  const out: ApplyResult[] = [];
  const now = () => nowIso();
  const tk = req.templateKey;
  if (tk === 'brand' && opts.branding) out.push(await applyBranding(p, sub.answers, actor));
  if (tk === 'users' && Array.isArray(opts.invites) && opts.invites.length) out.push(await applyInvites(p, (sub.answers.users as TableRow[]) ?? [], opts.invites, actor));
  if (tk === 'uat-team' && opts.testers) out.push(await applyTesters(p, (sub.answers.testers as TableRow[]) ?? [], ctx));
  if (tk === 'company' && opts.company) out.push(await applyCompany(p, sub));
  if (tk === 'questionnaire') out.push({ target: 'questionnaire', ok: true, dataOnly: true, detail: 'Kept on Client data for the playbook and the AI planner brief.', at: now() });
  if (tk === 'scripts') out.push({ target: 'scripts', ok: true, dataOnly: true, detail: `${sub.files.length} file(s) kept on Client data for the playbook writer.`, at: now() });
  return out;
}

export async function acceptSubmission(p: Project, requestId: unknown, submissionId: unknown, opts: AcceptOptions, actor: Actor, ctx: Ctx): Promise<{ request: CpRequest; submission: CpSubmission }> {
  const { req, task } = await ownerRequest(p, requestId);
  const s = store();
  const sub = isCpId(submissionId) ? await s.getSubmission(submissionId) : null;
  if (!sub || sub.requestId !== req.id) throw new CpError(404, 'Submission not found.');
  if (sub.version !== req.version) throw new CpError(409, 'A newer version was submitted. Review that one.');
  if (sub.status !== 'submitted' || req.formStatus !== 'submitted') throw new CpError(409, 'This submission was already reviewed.');
  // Security review L5: the REQUEST is claimed first (its rev), so a version the client submits meanwhile, a second tab or
  // a double click makes this a 409 before anything is applied. Then the review is recorded, then the auto-apply runs.
  const updated = await transition(p, task, req, { formStatus: 'accepted', state: { ...req.state, ...(req.kind === 'form' ? { completedVia: `v${sub.version} accepted`, completedAt: nowIso() } : {}) } }, ctx, { action: 'accepted', detail: { version: sub.version, submissionId: sub.id }, statusCtx: ctx });
  const claimed = await s.reviewSubmission(sub.id, { status: 'accepted', reviewedBy: ctx.actor.slice(6), reviewedAt: nowIso() }, ['submitted']);
  if (!claimed) throw new CpError(409, 'This submission was already reviewed.');
  const applied = await runApply(p, req, sub, opts, actor, ctx);
  const final = (await s.reviewSubmission(sub.id, { applied })) ?? claimed;
  if (applied.length) await log(p, task.id, ctx.actor, 'intake', { action: 'applied', key: taskKey(p, task), version: sub.version, targets: applied.map((a) => `${a.target}${a.ok ? '' : ' (not applied)'}${a.dataOnly ? ' (data only)' : ''}`) });
  return { request: updated, submission: final };
}

/** Apply again (e.g. after the workspace was picked): only for the accepted, latest version. */
export async function reapply(p: Project, requestId: unknown, submissionId: unknown, opts: AcceptOptions, actor: Actor, ctx: Ctx): Promise<CpSubmission> {
  const { req, task } = await ownerRequest(p, requestId);
  const s = store();
  const sub = isCpId(submissionId) ? await s.getSubmission(submissionId) : null;
  if (!sub || sub.requestId !== req.id || sub.status !== 'accepted') throw new CpError(409, 'Only an accepted submission can be applied.');
  const applied = await runApply(p, req, sub, opts, actor, ctx);
  if (!applied.length) throw new CpError(400, 'Choose what to apply.');
  const final = await s.reviewSubmission(sub.id, { applied: [...sub.applied, ...applied] }, ['accepted']);
  await log(p, task.id, ctx.actor, 'intake', { action: 'applied', key: taskKey(p, task), version: sub.version, targets: applied.map((a) => `${a.target}${a.ok ? '' : ' (not applied)'}${a.dataOnly ? ' (data only)' : ''}`) });
  return final ?? sub;
}

export async function requestChanges(p: Project, requestId: unknown, submissionId: unknown, noteRaw: unknown, ctx: Ctx): Promise<{ request: CpRequest; submission: CpSubmission }> {
  const { req, task } = await ownerRequest(p, requestId);
  const note = text(noteRaw, INTAKE_LIMITS.note);
  if (note.length < 3) throw new CpError(400, 'Write a short note so the client knows what to change.');
  const s = store();
  const sub = isCpId(submissionId) ? await s.getSubmission(submissionId) : null;
  if (!sub || sub.requestId !== req.id) throw new CpError(404, 'Submission not found.');
  if (sub.version !== req.version) throw new CpError(409, 'A newer version was submitted. Review that one.');
  const claimed = await s.reviewSubmission(sub.id, { status: 'changes_requested', reviewNote: note, reviewedBy: ctx.actor.slice(6), reviewedAt: nowIso() }, ['submitted']);
  if (!claimed) throw new CpError(409, 'This submission was already reviewed.');
  const updated = await transition(p, task, req, { formStatus: 'changes_requested', state: { ...req.state, ownerNote: note, ownerNoteAt: nowIso() } }, ctx, { action: 'changes_requested', detail: { version: sub.version, submissionId: sub.id } });
  // The client is emailed when reminders to the client are on (fixed wording and the board link; never the answers).
  await safely('intake-changes-mail', async () => {
    if (!ruleOn(p, 'client_reminders') || !p.clientContactEmail) return;
    const url = liveBoardUrl(p, ctx.origin);
    if (!url || !task.clientVisible) return;
    const ev = await claim(p, 'client_reminders', task.id, { kind: 'changes_requested', key: taskKey(p, task), version: sub.version }, `intake-changes|${req.id}|v${sub.version}`);
    if (!ev) return;
    await settle(ev, await sendMail(p, 'cp-client', p.clientContactEmail, `${p.clientName} onboarding: a change is needed on “${task.title}”`, [`We reviewed “${task.title}” and asked for a change. Our note is on the board.`, 'Open the board, update the form and submit it again.'], { label: 'Open your project board', url }));
  });
  return { request: updated, submission: claimed };
}

export interface PaymentInput {
  state: unknown;
  amount?: unknown;
  date?: unknown;
  method?: unknown;
  reference?: unknown;
  note?: unknown;
}

/**
 * The owner's payment control: Payment received (amount, date, method, optional reference: completes the card),
 * Not received / follow up (optional note shown on the client board; a client claim returns to Awaiting payment),
 * or back to Awaiting payment. Only ever the owner.
 */
export async function setPayment(p: Project, requestId: unknown, raw: PaymentInput, ctx: Ctx): Promise<CpRequest> {
  const { req, task } = await ownerRequest(p, requestId);
  if (req.kind !== 'payment') throw new CpError(400, 'This item is not a payment.');
  if (!ctx.actor.startsWith('owner:')) throw new CpError(403, 'Only the owner records payments.');
  const pay = { ...(req.state.payment ?? {}) };
  if (raw.state === 'received') {
    const amount = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new CpError(400, 'Enter the amount received.');
    if (!isDate(raw.date) || (raw.date as string) > today()) throw new CpError(400, 'Enter the date it was received (not in the future).');
    if (!(PAYMENT_METHODS as unknown[]).includes(raw.method)) throw new CpError(400, 'Pick how it was paid: bank, PayPal, Wise or other.');
    const reference = typeof raw.reference === 'string' ? raw.reference.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) : '';
    pay.received = { amount: Math.round(amount * 100) / 100, date: raw.date as string, method: raw.method as PaymentMethod, reference, by: ctx.actor.slice(6), at: nowIso(), via: 'card' };
    delete pay.followUpAt;
    delete pay.followUpNote;
    return transition(p, task, req, { sysStatus: 'received', state: { ...req.state, payment: pay, completedVia: 'payment recorded by the owner on the card', completedAt: nowIso() } }, ctx, { action: 'payment_received', detail: { via: 'card', method: raw.method, date: raw.date }, statusCtx: ctx });
  }
  if (raw.state === 'not_received') {
    if (req.sysStatus === 'received') throw new CpError(409, 'This payment is recorded as received. Set it back to awaiting first.');
    const note = text(raw.note, 400);
    pay.followUpAt = nowIso();
    pay.followUpNote = note;
    return transition(p, task, req, { sysStatus: 'awaiting', state: { ...req.state, payment: pay } }, ctx, { action: 'payment_not_received', detail: { hadClaim: req.sysStatus === 'client_says_paid', note: Boolean(note) } });
  }
  if (raw.state === 'awaiting') {
    delete pay.received;
    delete pay.followUpAt;
    delete pay.followUpNote;
    const state = { ...req.state, payment: pay };
    delete state.completedVia;
    delete state.completedAt;
    return transition(p, task, req, { sysStatus: 'awaiting', state }, ctx, { action: 'payment_reset', statusCtx: ctx });
  }
  throw new CpError(400, 'Choose Payment received, Not received, or Awaiting payment.');
}

// ------------------------------------------------------------------ owner reads

export interface EnvelopeOption {
  id: string;
  title: string;
  templateId: string;
  status: string;
  client: string;
  createdAt: string;
  /** Billing statements only: owner-only amounts. */
  billing?: { number: string; total: number; paid: number; balance: number; currency: string; status: string } | null;
}

export async function envelopeOptions(): Promise<EnvelopeOption[]> {
  try {
    return (await getAgreementStore().listEnvelopes())
      .filter((e) => ['proposal-growth-v1', 'proposal-growth-v2', 'service-agreement-v1', 'delivery-report-v1', 'uat-certificate-v1', 'billing-statement-v1', 'dev-simple-v1', 'dev-billing-v1'].includes(e.templateId) || isLocalTestServer())
      .slice(0, 300)
      .map((e) => ({ id: e.id, title: e.title.slice(0, 200), templateId: e.templateId, status: e.status, client: clientNameOf(e).slice(0, 120), createdAt: e.createdAt, billing: e.billing ? { number: e.billing.number, total: e.billing.total, paid: paidSoFar(e.billing), balance: balanceOf(e.billing), currency: e.billing.currency, status: paymentStatus(e.billing) } : null }));
  } catch {
    return [];
  }
}

