/**
 * Server only. "Provision workspace from a Client Project" (Phase 1). A vertical checklist on the project (owner only):
 * every step shows a preview (provisionView), runs only on the owner's own click, writes only into THIS project's linked
 * client workspace, and is idempotent (running it again changes nothing, or resumes what was left half done).
 *
 *   1 workspace  createTenant + the first Admin via inviteMember (no email) + the project link (setWorkspace)
 *   2 branding   cleanBranding + updateTenant (brand colour, display name, initials, support email if the owner sets it)
 *   3 logo       the accepted intake logo into the workspace logo store (tenantLogos: same byte and sanitiser rules)
 *   4 members    the accepted user list via inviteMember, with the seat check up front (no email)
 *     invites    a SEPARATE click: sendInvite per pending member, spaced out, per-row results; never twice per person
 *   5 templates  AI drafts (provisionAi) -> the owner edits / deselects -> Seed (emailTemplateStore.seed, stable ids)
 *   6 record     project.settings.provision (status, time, actor per step) + 'provision' events (counts only)
 *
 * It never targets the platform workspace (APPOINTMENTLYY): step 1 refuses that code and every later step goes through
 * clientWorkspace(), which never returns it. Nothing here emails anyone except "Send invites".
 */
import { EMAIL_RE, PLATFORM_TENANT_CODE, TENANT_CODE_RE, parseRole, CLIENT_ROLES, type Role } from '@/lib/roles';
import { getAdminEmails } from '@/lib/authToken';
import { getResendApiKey } from '@/lib/resendConfig';
import { getTenantStore, nowIso, type Member, type Tenant } from '@/lib/server/tenantStore';
import { TenancyError, cleanBranding, createTenant, inviteMember, seatsUsed, type Actor } from '@/lib/server/tenancy';
import { inviteDelivery, sendInvite } from '@/lib/server/authLinks';
import { authOutboxRequested, isLocalTestServer } from '@/lib/server/agreements/mail';
import { getEmailTemplateStore, seedId } from '@/lib/server/emailTemplateStore';
import { LogoRefused, LogoStorageError, saveTenantLogo, tenantLogoMeta } from '@/lib/server/tenantLogos';
import { getClientProjectStore, INTAKE_SOURCE } from '@/lib/server/clientProjectStore';
import { line, taskKey } from '@/lib/server/clientProjects/core';
import { CpError, log, setStatus, type Ctx } from '@/lib/server/clientProjects/service';
import { intakeOn, setWorkspace } from '@/lib/server/clientProjects/intake';
import { clientWorkspace } from '@/lib/server/clientProjects/intakeApply';
import { extractPdfText } from '@/lib/server/clientProjects/pdfText';
import { docxText } from '@/lib/server/clientProjects/uploads';
import { aiMode } from '@/lib/server/clientProjects/ai';
import { NO_AI_MESSAGE, SOURCE_CAPS, draftTemplates, hasSource, sourceNumbersOf, type TemplateSource } from '@/lib/server/clientProjects/provisionAi';
import { eventText } from '@/components/clientProjects/eventText';
import { logoSrc } from '@/lib/tenantLogo';
import { validateTemplate, type TemplateInput } from '@/lib/emailTemplates';
import { FORM_TEMPLATES, answerText, type CpRequest, type CpSubmission, type TableRow } from '@/lib/clientProjects/intake';
import {
  CORE_STEPS,
  STARTER_CAMPAIGN,
  STARTER_KEYS,
  STARTER_LABEL,
  STARTER_PURPOSE,
  STARTER_STEP,
  WORKSPACE_SOP_KEY,
  templateIssues,
  type ProvisionRecord,
  type ProvisionStep,
  type StarterKey,
  type StepStatus,
  type TemplateDraft,
} from '@/lib/clientProjects/provision';
import type { Project, TaskStatus } from '@/lib/clientProjects/types';

const store = () => getClientProjectStore();

export const PLANS = ['Pilot', 'Standard', 'GTM Turnkey', 'Enterprise'];
/** Invite emails per "Send invites" click (the rest go on the next click) and the gap between two sends. */
export const INVITE_BATCH = 40;
const INVITE_GAP_MS = 550;

// ------------------------------------------------------------------ one step at a time per project

const g = globalThis as typeof globalThis & { __cpProvisionBusy?: Set<string> };
const busy = (g.__cpProvisionBusy ??= new Set<string>());

/** A double click, a second tab or two steps at once: the second one is refused (409) instead of racing the first. */
export async function exclusive<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  if (busy.has(projectId)) throw new CpError(409, 'Another provisioning step is running for this project. Wait for it to finish, then reload.', { code: 'busy' });
  busy.add(projectId);
  try {
    return await fn();
  } finally {
    busy.delete(projectId);
  }
}

// ------------------------------------------------------------------ the record (project.settings.provision)

const emptyRecord = (): ProvisionRecord => ({ steps: {} });
export const recordOf = (p: Pick<Project, 'settings'>): ProvisionRecord => {
  const r = p.settings?.provision;
  return r && typeof r === 'object' ? { ...emptyRecord(), ...r, steps: { ...(r.steps ?? {}) } } : emptyRecord();
};

/** Change the record on a FRESH read of the project (other settings, such as intake, are kept as they are). */
async function saveRecord(p: Project, mut: (r: ProvisionRecord) => void): Promise<{ project: Project; record: ProvisionRecord }> {
  const fresh = (await store().getProject(p.id)) ?? p;
  const record = recordOf(fresh);
  mut(record);
  const updated = await store().updateProject(p.id, { settings: { ...(fresh.settings ?? {}), provision: record } as Project['settings'] });
  if (!updated) throw new CpError(404, 'Project not found.');
  return { project: updated, record };
}

function mark(r: ProvisionRecord, step: ProvisionStep, status: StepStatus, summary: string, actor: string) {
  const prev = r.steps[step];
  r.steps[step] = { status, at: nowIso(), by: actor, summary, runs: (prev?.runs ?? 0) + 1 };
}

async function finishStep(p: Project, ctx: Ctx, step: ProvisionStep, status: StepStatus, summary: string, detail: Record<string, unknown>, extra?: (r: ProvisionRecord) => void): Promise<Project> {
  const { project } = await saveRecord(p, (r) => {
    mark(r, step, status, summary, ctx.actor);
    extra?.(r);
  });
  await log(p, null, ctx.actor, 'provision', { action: step, status, ...detail });
  return CORE_STEPS.includes(step) ? maybeCompleteSop(project, ctx) : project;
}

/**
 * Steps 1 to 4 all done: the SOP "Branded workspace with users and roles" card is completed (by the owner's click), once.
 * Only that ordinary task card: a milestone (gate), a payment or a signature card is never completed this way.
 */
async function maybeCompleteSop(p: Project, ctx: Ctx): Promise<Project> {
  const r = recordOf(p);
  if (r.sopCompletedAt || !CORE_STEPS.every((k) => r.steps[k]?.status === 'done')) return p;
  const tasks = await store().listTasks(p.id);
  const card = tasks.find((t) => t.sopKey === WORKSPACE_SOP_KEY && t.type === 'task' && t.ownerSide === 'us');
  if (card && card.status !== 'done') await setStatus(p, card, 'done', ctx, {}, { because: 'Provisioning: steps 1 to 4 done' });
  const { project } = await saveRecord(p, (x) => {
    x.sopCompletedAt = nowIso();
  });
  if (card) await log(p, card.id, ctx.actor, 'provision', { action: 'sop_completed', key: taskKey(p, card), status: 'done' });
  return project;
}

// ------------------------------------------------------------------ what the client sent (accepted versions only)

interface Accepted {
  req: CpRequest;
  sub: CpSubmission;
}
interface AcceptedIntake {
  brand: Accepted | null;
  users: Accepted | null;
  questionnaire: Accepted | null;
  scripts: Accepted | null;
}

async function acceptedIntake(p: Project): Promise<AcceptedIntake> {
  const s = store();
  const reqs = await s.listRequests(p.id);
  const subs = reqs.some((r) => r.version > 0) ? await s.listSubmissions(p.id, { limit: 1000 }) : [];
  const pick = (tk: string): Accepted | null => {
    for (const req of reqs.filter((r) => r.templateKey === tk)) {
      const sub = subs.filter((x) => x.requestId === req.id && x.status === 'accepted').sort((a, b) => b.version - a.version)[0];
      if (sub) return { req, sub };
    }
    return null;
  };
  return { brand: pick('brand'), users: pick('users'), questionnaire: pick('questionnaire'), scripts: pick('scripts') };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

// ------------------------------------------------------------------ step 1 suggestions

const LEGAL = new Set(['inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited', 'llc', 'co', 'company', 'pty', 'pte', 'plc', 'gmbh', 'opc', 'llp', 'lp', 'the']);

/** A workspace code from the client's name: letters and digits, legal suffixes dropped, never the platform's code. */
export function suggestCode(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !LEGAL.has(w.toLowerCase()));
  let code = words.join('').toUpperCase().slice(0, 20);
  if (code.length < 2) code = `${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}WS`.slice(0, 20);
  if (code.length < 2) code = 'CLIENT';
  if (code === PLATFORM_TENANT_CODE) code = `${code.slice(0, 13)}-CLIENT`;
  return code;
}

async function freeCode(base: string): Promise<string> {
  const t = getTenantStore();
  for (let i = 1; i <= 20; i++) {
    const c = i === 1 ? base : `${base.slice(0, 28)}-${i}`;
    if (c !== PLATFORM_TENANT_CODE && !(await t.getTenant(c))) return c;
  }
  return `${base.slice(0, 24)}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

/** Two letters for the initials tile: the first letters of two words, or the first two letters of a one-word name. */
const initialsOf = (name: string) => {
  const words = name.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  return (words.length >= 2 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '').slice(0, 2)).toUpperCase();
};

// ------------------------------------------------------------------ step 4 rows

export type RowState = 'new' | 'invited' | 'active' | 'removed' | 'invalid_email' | 'unknown_role' | 'staff' | 'duplicate';
export interface UserRow {
  name: string;
  email: string;
  role: string;
  state: RowState;
  /** "Send invites" already emailed them (when). */
  sentAt: string | null;
}

const roleOf = (v: string): Role | null => {
  const r = parseRole(v);
  return r && CLIENT_ROLES.includes(r) ? r : null;
};

async function staffEmails(): Promise<Set<string>> {
  const rows = await getTenantStore().listMembers({ tenantCode: PLATFORM_TENANT_CODE });
  // Every Appointmentlyy member who has not been removed (any role, invited or active) is staff: never a client member.
  return new Set([...getAdminEmails(), ...rows.filter((m) => m.status !== 'removed').map((m) => m.email.trim().toLowerCase())]);
}

function userRows(raw: TableRow[], members: Member[], staff: Set<string>, sent: Record<string, string>): UserRow[] {
  const seen = new Set<string>();
  return raw.slice(0, 300).map((r) => {
    const email = str(r.email).trim().toLowerCase();
    const name = line(r.name, 80);
    const role = str(r.role);
    const base = { name, email, role: roleOf(role) ?? line(role, 30), sentAt: sent[email] ?? null };
    if (!EMAIL_RE.test(email)) return { ...base, state: 'invalid_email' as const };
    if (seen.has(email)) return { ...base, state: 'duplicate' as const };
    seen.add(email);
    if (!roleOf(role)) return { ...base, state: 'unknown_role' as const };
    if (staff.has(email)) return { ...base, state: 'staff' as const };
    const m = members.find((x) => x.email === email);
    return { ...base, state: !m ? ('new' as const) : m.status === 'active' ? ('active' as const) : m.status === 'removed' ? ('removed' as const) : ('invited' as const) };
  });
}

// ------------------------------------------------------------------ step 5 source (the client's own words, capped)

async function templateSource(p: Project, a: AcceptedIntake): Promise<TemplateSource> {
  const answers: TemplateSource['answers'] = [];
  if (a.questionnaire) {
    const schema = a.questionnaire.req.schema ?? FORM_TEMPLATES.questionnaire;
    for (const f of schema.fields) {
      if (f.type === 'file' || f.type === 'table' || f.type === 'confirm') continue;
      const v = answerText(f, a.questionnaire.sub.answers[f.key]);
      if (v) answers.push({ label: f.label, value: v.slice(0, SOURCE_CAPS.answer) });
    }
  }
  const scripts: TemplateSource['scripts'] = [];
  let notes = '';
  if (a.scripts) {
    notes = str(a.scripts.sub.answers.notes).slice(0, SOURCE_CAPS.notes);
    let total = 0;
    const s = store();
    for (const ref of a.scripts.sub.files.slice(0, SOURCE_CAPS.files)) {
      if (total >= SOURCE_CAPS.scriptsTotal) break;
      const meta = await s.getFile(ref.id);
      if (!meta || meta.projectId !== p.id || meta.source !== INTAKE_SOURCE) continue;
      const bytes = await s.getFileBytes(ref.id);
      if (!bytes) continue;
      let t: string | null = null;
      try {
        if (ref.mime === 'application/pdf') t = (await extractPdfText(bytes, 20, SOURCE_CAPS.scriptFile)).pages.map((pg) => pg.text).join('\n');
        else if (ref.mime.includes('wordprocessingml')) t = docxText(bytes, SOURCE_CAPS.scriptFile);
        else if (ref.mime.startsWith('text/')) t = new TextDecoder('utf-8').decode(bytes);
      } catch {
        t = null;
      }
      if (!t?.trim()) continue;
      const cut = t.slice(0, Math.min(SOURCE_CAPS.scriptFile, SOURCE_CAPS.scriptsTotal - total));
      total += cut.length;
      scripts.push({ name: ref.name, text: cut });
    }
  }
  return { clientName: p.clientName, answers, scripts, notes };
}

// ------------------------------------------------------------------ the preview (GET)

export interface ProvisionView {
  record: ProvisionRecord;
  intakeOn: boolean;
  linked: { code: string; name: string; status: string; plan: string; seatLimit: number; seatsUsed: number; branding: Tenant['branding']; logo: { url: string; mime: string; size: number } | null } | null;
  ai: { mode: 'live' | 'stub' | 'off'; message: string | null };
  mail: { configured: boolean; outbox: boolean };
  workspace: { name: string; code: string; plan: string; seats: number; adminEmail: string; adminName: string; adminChoices: { name: string; email: string }[]; plans: string[]; sources: string[] };
  branding: { brandColor: string; displayName: string; logoInitials: string; supportEmail: string; source: string | null };
  logo: { file: { id: string; name: string; mime: string; size: number } | null; source: string | null };
  users: { rows: UserRow[]; source: string | null; seats: { limit: number; used: number; free: number | null } | null };
  templates: { hasSource: boolean; drafts: (TemplateDraft & { issues: string[]; seeded: boolean })[]; sourceNumbers: string[]; draftedAt: string | null; mode: string | null };
  sopCard: { key: string; status: TaskStatus } | null;
  events: { at: string; actor: string; text: string }[];
}

const ver = (a: Accepted | null, label: string) => (a ? `${label} v${a.sub.version} (accepted)` : null);

export async function provisionView(p0: Project): Promise<ProvisionView> {
  const s = store();
  const p = (await s.getProject(p0.id)) ?? p0;
  const record = recordOf(p);
  const [a, ws, tasks, events, staff] = await Promise.all([acceptedIntake(p), clientWorkspace(p), s.listTasks(p.id), s.findEvents(p.id, { type: 'provision', limit: 30 }), staffEmails()]);
  const tstore = getTenantStore();
  const tenant = ws ? await tstore.getTenant(ws.code) : null;
  const members = tenant ? await tstore.listMembers({ tenantCode: tenant.code }) : [];
  const logo = tenant ? await tenantLogoMeta(tenant.code) : null;
  const company = p.settings?.intake?.company ?? null;

  const rawUsers = (a.users?.sub.answers.users as TableRow[] | undefined) ?? [];
  const rows = userRows(rawUsers, members, staff, record.sent ?? {});
  const adminRow = rows.find((r) => r.role === 'Admin' && !['invalid_email', 'staff', 'duplicate'].includes(r.state));
  const brandA = a.brand?.sub.answers ?? {};
  const name = line(str(brandA.displayName) || company?.legalName || p.clientName, 80);
  const code = tenant?.code ?? (await freeCode(suggestCode(p.clientName)));
  const logoRef = a.brand ? a.brand.sub.files.find((f) => f.field === 'logo' && Array.isArray(brandA.logo) && (brandA.logo as string[]).includes(f.id)) ?? a.brand.sub.files.find((f) => f.field === 'logo') ?? null : null;
  const sourceNumbers = record.templates?.sourceNumbers ?? [];
  const seededKeys = new Set((record.templates?.seeded ?? []).map((x) => x.key));
  const mode = aiMode();
  const card = tasks.find((t) => t.sopKey === WORKSPACE_SOP_KEY && t.type === 'task');
  const outbox = authOutboxRequested() && isLocalTestServer();
  return {
    record,
    intakeOn: intakeOn(p),
    linked: tenant
      ? {
          code: tenant.code,
          name: tenant.name,
          status: tenant.status,
          plan: tenant.plan,
          seatLimit: tenant.seatLimit,
          seatsUsed: seatsUsed(members),
          branding: tenant.branding,
          logo: logo ? { url: logoSrc(logo.version, tenant.code), mime: logo.mime, size: logo.size } : null,
        }
      : null,
    ai: { mode, message: mode === 'off' ? NO_AI_MESSAGE : null },
    mail: { configured: authOutboxRequested() ? outbox : Boolean(getResendApiKey()), outbox },
    workspace: {
      name,
      code,
      plan: 'Standard',
      seats: Math.max(10, rows.length + 2),
      adminEmail: record.adminEmail ?? adminRow?.email ?? '',
      adminName: adminRow?.name ?? '',
      adminChoices: rows.filter((r) => !['invalid_email', 'staff', 'duplicate'].includes(r.state)).map((r) => ({ name: r.name, email: r.email })),
      plans: PLANS,
      sources: [ver(a.brand, 'Brand form'), company ? `Company details v${company.version} (accepted)` : null, ver(a.users, 'User list')].filter((x): x is string => Boolean(x)),
    },
    branding: {
      brandColor: str(brandA.primary),
      displayName: str(brandA.displayName),
      logoInitials: initialsOf(str(brandA.displayName) || name),
      supportEmail: tenant?.branding.supportEmail ?? '',
      source: ver(a.brand, 'Brand form'),
    },
    logo: { file: logoRef ? { id: logoRef.id, name: logoRef.name, mime: logoRef.mime, size: logoRef.size } : null, source: ver(a.brand, 'Brand form') },
    users: { rows, source: ver(a.users, 'User list'), seats: tenant ? { limit: tenant.seatLimit, used: seatsUsed(members), free: tenant.seatLimit > 0 ? Math.max(0, tenant.seatLimit - seatsUsed(members)) : null } : null },
    templates: {
      hasSource: Boolean(a.questionnaire || a.scripts),
      drafts: (record.templates?.drafts ?? []).map((d) => ({ ...d, issues: templateIssues(d, sourceNumbers), seeded: seededKeys.has(d.key) })),
      sourceNumbers,
      draftedAt: record.templates?.draftedAt ?? null,
      mode: record.templates?.mode ?? null,
    },
    sopCard: card ? { key: taskKey(p, card), status: card.status } : null,
    events: events.map((e) => ({ at: e.at, actor: e.actor, text: eventText(e) })),
  };
}

// ------------------------------------------------------------------ helpers for the steps

/** The linked client workspace, re-read; never the platform's. Every step after the first needs it. */
async function linkedTenant(p: Project): Promise<Tenant> {
  const ws = await clientWorkspace(p);
  const t = ws ? await getTenantStore().getTenant(ws.code) : null;
  if (!t || t.code === PLATFORM_TENANT_CODE) throw new CpError(409, 'Create or link the client’s workspace first (step 1).', { code: 'no_workspace' });
  return t;
}

const tenancyFail = (err: unknown): never => {
  if (err instanceof TenancyError) throw new CpError(err.status, err.message);
  throw err;
};

// ------------------------------------------------------------------ step 1: create the workspace

export interface WorkspaceInput {
  name?: unknown;
  code?: unknown;
  plan?: unknown;
  seats?: unknown;
  adminEmail?: unknown;
  adminName?: unknown;
}

export async function runWorkspace(p: Project, owner: Actor, ctx: Ctx, body: WorkspaceInput): Promise<{ result: Record<string, unknown> }> {
  const record = recordOf(p);
  const ws = await clientWorkspace(p);
  if (ws) {
    // Already linked (by an earlier run, or by hand on Client data): nothing to create.
    const already = record.steps.workspace?.status === 'done';
    if (!already) await finishStep(p, ctx, 'workspace', 'done', `linked to workspace ${ws.code}`, { tenantCode: ws.code, linkedOnly: true });
    return { result: { skipped: true, tenantCode: ws.code, message: `Linked to ${ws.name} (${ws.code}). Nothing was created.` } };
  }
  const name = line(body.name, 80);
  if (name.length < 2) throw new CpError(400, 'Enter the workspace name.');
  const code = str(body.code).trim().toUpperCase();
  if (code === PLATFORM_TENANT_CODE) throw new CpError(400, 'The Appointmentlyy workspace can never be provisioned. Pick the client’s own workspace code.', { code: 'platform' });
  if (!TENANT_CODE_RE.test(code)) throw new CpError(400, 'The workspace code must be 2 to 32 capital letters, numbers or dashes.');
  const plan = PLANS.includes(str(body.plan)) ? str(body.plan) : 'Standard';
  const seats = Math.floor(Number(body.seats));
  if (!Number.isFinite(seats) || seats < 1 || seats > 5000) throw new CpError(400, 'Seats must be between 1 and 5000.');
  const adminEmail = str(body.adminEmail).trim().toLowerCase();
  const adminName = line(body.adminName, 80);
  if (!EMAIL_RE.test(adminEmail)) throw new CpError(400, 'Pick the client’s first admin (a valid email).');
  if ((await staffEmails()).has(adminEmail)) throw new CpError(400, 'That address belongs to Appointmentlyy staff. Pick a person from the client.');

  const tstore = getTenantStore();
  const existing = await tstore.getTenant(code);
  let tenant: Tenant;
  let resumed = false;
  if (existing) {
    // Resume a half-finished run (created, then stopped before linking) instead of reporting the code as taken, but ONLY
    // a workspace this project's step 1 created (security review M2): its code was recorded after the create, or the
    // create was announced (record.pending, saved BEFORE createTenant) and this owner made the workspace after that, with
    // nobody but the first admin inside. A workspace that already existed (another client's, made in the Platform
    // Console) is never taken over, whatever admin email is typed: the owner links it on Client data instead.
    const pend = record.pending;
    const ours =
      record.createdCode === code ||
      (pend?.code === code &&
        existing.createdBy === owner.email &&
        Date.parse(existing.createdAt) >= Date.parse(pend.at) - 5000 &&
        (await tstore.listMembers({ tenantCode: code })).every((m) => m.email === adminEmail));
    if (!ours) throw new CpError(409, `The workspace code ${code} is already taken. Pick another, or link the existing workspace on Client data.`, { code: 'taken' });
    tenant = existing;
    resumed = true;
  } else {
    await saveRecord(p, (r) => {
      r.pending = { code, at: nowIso() };
    });
    tenant = await createTenant({ name, code, plan, seatLimit: seats }, owner.email).catch(tenancyFail);
  }
  // Remember it BEFORE anything else, so a crash from here on resumes.
  await saveRecord(p, (r) => {
    r.createdCode = tenant.code;
    r.adminEmail = adminEmail;
  });
  const members = await tstore.listMembers({ tenantCode: tenant.code });
  const m = members.find((x) => x.email === adminEmail);
  let admin = 'already there';
  if (!m || m.status === 'removed') {
    await inviteMember(owner, tenant.code, { email: adminEmail, name: adminName, role: 'Admin' }).catch(tenancyFail);
    admin = 'created (no email yet)';
  }
  const fresh = (await store().getProject(p.id)) ?? p;
  await setWorkspace(fresh, tenant.code, ctx);
  const linked = (await store().getProject(p.id)) ?? fresh;
  await finishStep(linked, ctx, 'workspace', 'done', `workspace ${tenant.code} created and linked`, { tenantCode: tenant.code, resumed });
  return { result: { tenantCode: tenant.code, resumed, admin, message: `${resumed ? 'Resumed' : 'Created'} ${tenant.name} (${tenant.code}) and linked it to this project. First admin ${admin}.` } };
}

// ------------------------------------------------------------------ step 2: branding

export async function runBranding(p: Project, owner: Actor, ctx: Ctx, body: Record<string, unknown>): Promise<{ result: Record<string, unknown> }> {
  const tenant = await linkedTenant(p);
  const want: Record<string, unknown> = {};
  for (const k of ['brandColor', 'displayName', 'logoInitials', 'supportEmail'] as const) {
    const v = str(body[k]).trim();
    if (v) want[k] = v;
  }
  if (!Object.keys(want).length) throw new CpError(400, 'Nothing to apply: set at least the brand colour or the display name.');
  let branding: Tenant['branding'];
  try {
    branding = cleanBranding(want, tenant.branding);
  } catch (err) {
    return tenancyFail(err);
  }
  const keys = ['brandColor', 'displayName', 'logoInitials', 'supportEmail'] as const;
  const changed = keys.some((k) => (branding[k] ?? '') !== (tenant.branding[k] ?? ''));
  const tstore = getTenantStore();
  if (changed) {
    await tstore.updateTenant(tenant.code, { branding });
    await tstore.addAudit({ actorEmail: owner.email, tenantCode: tenant.code, action: 'tenant.update', target: tenant.code, detail: { via: 'client-projects-provision', projectId: p.id, branding: { brandColor: branding.brandColor ?? null, displayName: branding.displayName ?? null, logoInitials: branding.logoInitials ?? null, supportEmail: branding.supportEmail ? 'set' : null } } });
  }
  await finishStep(p, ctx, 'branding', 'done', 'branding applied', { changed });
  return { result: { changed, message: changed ? `Branding applied to ${tenant.name}.` : 'The workspace already has this branding. Nothing changed.' } };
}

// ------------------------------------------------------------------ step 3: logo

export async function runLogo(p: Project, owner: Actor, ctx: Ctx): Promise<{ result: Record<string, unknown> }> {
  const tenant = await linkedTenant(p);
  const a = await acceptedIntake(p);
  const answers = a.brand?.sub.answers ?? {};
  const ref = a.brand ? a.brand.sub.files.find((f) => f.field === 'logo' && Array.isArray(answers.logo) && (answers.logo as string[]).includes(f.id)) ?? a.brand.sub.files.find((f) => f.field === 'logo') : undefined;
  if (!ref) {
    const cur = await tenantLogoMeta(tenant.code);
    if (cur) {
      await finishStep(p, ctx, 'logo', 'done', 'logo set', { changed: false });
      return { result: { changed: false, message: 'There is no accepted intake logo, but the workspace already has a logo. Nothing changed.' } };
    }
    throw new CpError(409, 'There is no accepted logo yet. Accept the brand form first, or have the client’s admin upload it in Admin › Appearance.', { code: 'no_logo' });
  }
  const s = store();
  const meta = await s.getFile(ref.id);
  const bytes = meta && meta.projectId === p.id && meta.source === INTAKE_SOURCE ? await s.getFileBytes(ref.id) : null;
  if (!bytes) throw new CpError(404, 'The accepted logo file was not found.');
  try {
    const { meta: logo, changed } = await saveTenantLogo(tenant.code, bytes, owner.email);
    if (changed) await getTenantStore().addAudit({ actorEmail: owner.email, tenantCode: tenant.code, action: 'tenant.logo', target: tenant.code, detail: { via: 'client-projects-provision', projectId: p.id, mime: logo.mime, size: logo.size, version: logo.version } });
    await finishStep(p, ctx, 'logo', 'done', 'logo set', { changed });
    return { result: { changed, message: changed ? `Logo copied to ${tenant.name}.` : 'The workspace already has this logo. Nothing changed.' } };
  } catch (err) {
    if (err instanceof LogoRefused) {
      await finishStep(p, ctx, 'logo', 'failed', 'logo not set', { changed: false });
      throw new CpError(400, `The accepted logo cannot be used: ${err.message} Ask the client for a PNG, JPG, WebP or SVG under 512 KB, or upload one in the workspace’s Admin › Appearance.`, { code: 'logo_refused' });
    }
    if (err instanceof LogoStorageError) throw new CpError(503, 'Workspace logos are not set up in the database yet. Run supabase/migrations/20261128000000_tenant_logo.sql.');
    throw err;
  }
}

// ------------------------------------------------------------------ step 4: members (no email) and invites (a separate click)

type RowResult = { label: string; ok: boolean; note: string; inviteUrl?: string };

export async function runMembers(p: Project, owner: Actor, ctx: Ctx, body: Record<string, unknown>): Promise<{ result: Record<string, unknown> }> {
  const tenant = await linkedTenant(p);
  const a = await acceptedIntake(p);
  if (!a.users) throw new CpError(409, 'There is no accepted user list yet. Accept the user-list form first.', { code: 'no_users' });
  const tstore = getTenantStore();
  const members = await tstore.listMembers({ tenantCode: tenant.code });
  const record = recordOf(p);
  const rows = userRows((a.users.sub.answers.users as TableRow[]) ?? [], members, await staffEmails(), record.sent ?? {});
  const pickList = Array.isArray(body.emails) ? new Set(body.emails.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase())) : null;
  const chosen = rows.filter((r) => !pickList || pickList.has(r.email));
  if (!chosen.length) throw new CpError(400, 'Pick at least one person to create.');
  const toCreate = chosen.filter((r) => r.state === 'new');
  // The seat check comes FIRST: nothing is created when the list does not fit.
  const used = seatsUsed(members);
  if (tenant.seatLimit > 0 && used + toCreate.length > tenant.seatLimit) {
    const free = Math.max(0, tenant.seatLimit - used);
    throw new CpError(409, `This list needs ${toCreate.length} new seat${toCreate.length === 1 ? '' : 's'}, but ${tenant.name} has ${free} free of ${tenant.seatLimit}. Raise the seat limit in Platform Console › Workspaces, or deselect people. Nobody was created.`, { code: 'seats', needed: toCreate.length, free, limit: tenant.seatLimit });
  }
  const out: RowResult[] = [];
  let created = 0;
  let existing = 0;
  let failed = 0;
  for (const r of chosen) {
    const label = r.email || r.name;
    switch (r.state) {
      case 'invited':
        existing++;
        out.push({ label, ok: true, note: 'already created (invite pending)' });
        continue;
      case 'active':
        existing++;
        out.push({ label, ok: true, note: 'already an active member' });
        continue;
      case 'removed':
        failed++;
        out.push({ label, ok: false, note: 'removed from this workspace earlier: add them back from the workspace’s Members page if that is intended' });
        continue;
      case 'invalid_email':
        failed++;
        out.push({ label, ok: false, note: 'not a valid email' });
        continue;
      case 'unknown_role':
        failed++;
        out.push({ label, ok: false, note: `unknown role “${r.role.slice(0, 30)}”` });
        continue;
      case 'staff':
        failed++;
        out.push({ label, ok: false, note: 'an Appointmentlyy staff address: never added to a client workspace' });
        continue;
      case 'duplicate':
        failed++;
        out.push({ label, ok: false, note: 'listed twice: created once' });
        continue;
      case 'new':
        try {
          await inviteMember(owner, tenant.code, { email: r.email, name: r.name, role: roleOf(r.role) as Role });
          created++;
          out.push({ label, ok: true, note: `created as ${r.role} (no email sent)` });
        } catch (err) {
          failed++;
          out.push({ label, ok: false, note: err instanceof TenancyError ? err.message : 'could not be created' });
        }
    }
  }
  const status: StepStatus = failed === 0 ? 'done' : created + existing > 0 ? 'partial' : 'failed';
  await finishStep(p, ctx, 'members', status, `${created + existing} of ${chosen.length} members in place`, { created, existing, failed });
  return { result: { created, existing, failed, rows: out, message: `${created} created, ${existing} already there, ${failed} not created. No email was sent: click “Send invites” when you are ready.` } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runInvites(p: Project, owner: Actor, ctx: Ctx): Promise<{ result: Record<string, unknown> }> {
  const tenant = await linkedTenant(p);
  const a = await acceptedIntake(p);
  const tstore = getTenantStore();
  const record = recordOf(p);
  const listed = ((a.users?.sub.answers.users as TableRow[] | undefined) ?? []).map((r) => str(r.email).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
  const out0: RowResult[] = [];
  const listedAll = [...new Set([...(record.adminEmail ? [record.adminEmail] : []), ...listed])];
  const members = await tstore.listMembers({ tenantCode: tenant.code });
  // Only people who are members of the workspace are invited; rows the owner did not create (deselected, refused) are
  // reported as skipped and never hold the step open.
  const targets = listedAll.filter((e) => members.some((m) => m.email === e));
  if (!targets.length) throw new CpError(409, 'There is nobody to invite yet: create the workspace and its members first.', { code: 'no_targets' });
  for (const email of listedAll.filter((e) => !targets.includes(e))) out0.push({ label: email, ok: true, note: 'not a member of the workspace (not created): skipped' });
  const out: RowResult[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let pending = 0;
  let attempted = 0;
  const sentMap = { ...(record.sent ?? {}) };
  for (const email of targets) {
    const m = members.find((x) => x.email === email);
    if (!m) {
      pending++;
      out.push({ label: email, ok: false, note: 'not created yet: run “Create members” first' });
      continue;
    }
    if (m.status === 'active') {
      skipped++;
      out.push({ label: email, ok: true, note: 'already active: no invite needed' });
      continue;
    }
    if (m.status === 'removed') {
      skipped++;
      out.push({ label: email, ok: true, note: 'removed from the workspace: skipped' });
      continue;
    }
    if (sentMap[email]) {
      skipped++;
      out.push({ label: email, ok: true, note: `invite already sent ${sentMap[email].slice(0, 16).replace('T', ' ')} UTC: not sent again (resend from the workspace’s Members page)` });
      continue;
    }
    if (!m.inviteNonce) {
      failed++;
      out.push({ label: email, ok: false, note: 'no pending invite: re-invite from the workspace’s Members page' });
      continue;
    }
    if (attempted >= INVITE_BATCH) {
      pending++;
      out.push({ label: email, ok: false, note: `not sent yet (at most ${INVITE_BATCH} per click): click “Send invites” again` });
      continue;
    }
    if (attempted > 0) await sleep(INVITE_GAP_MS);
    attempted++;
    const res = await sendInvite({ member: m, tenant, nonce: m.inviteNonce, inviterName: owner.name || 'Appointmentlyy', requestOrigin: ctx.origin || '' });
    if (res.delivered) {
      sent++;
      const at = nowIso();
      sentMap[email] = at;
      // Recorded per send, so a request cut off half way never emails the same person twice on the next click.
      await saveRecord(p, (r) => {
        r.sent = { ...(r.sent ?? {}), [email]: at };
      });
      await tstore.addAudit({ actorEmail: owner.email, tenantCode: tenant.code, action: 'member.invite_sent', target: email, detail: { via: 'client-projects-provision', projectId: p.id } });
      out.push({ label: email, ok: true, note: 'invite email sent' });
    } else {
      failed++;
      // The link signs in as the invitee: only platform staff ever get it back (to pass on another way), and it is
      // returned in this response only, never stored.
      const d = inviteDelivery(res, { staff: true, memberId: m.id });
      out.push({ label: email, ok: false, note: `email not sent: ${res.error || 'the email could not be sent'}`, ...(d.inviteUrl ? { inviteUrl: d.inviteUrl } : {}) });
    }
  }
  out.push(...out0);
  skipped += out0.length;
  const inPlace = targets.filter((e) => sentMap[e] || members.find((x) => x.email === e)?.status === 'active').length;
  const status: StepStatus = failed === 0 && pending === 0 ? 'done' : inPlace > 0 ? 'partial' : 'failed';
  await finishStep(p, ctx, 'invites', status, `${inPlace} of ${targets.length} invites sent or accepted`, { sent, skipped, failed: failed + pending });
  return { result: { sent, skipped, failed, pending, rows: out, message: `${sent} invite email${sent === 1 ? '' : 's'} sent, ${skipped} skipped, ${failed + pending} not sent.` } };
}

// ------------------------------------------------------------------ step 5: starter templates

function cleanDrafts(raw: unknown): TemplateDraft[] {
  if (!Array.isArray(raw)) throw new CpError(400, 'Send the templates to check.');
  const out: TemplateDraft[] = [];
  for (const t of raw.slice(0, STARTER_KEYS.length)) {
    if (!t || typeof t !== 'object') continue;
    const r = t as Record<string, unknown>;
    if (typeof r.key !== 'string' || !(STARTER_KEYS as readonly string[]).includes(r.key)) throw new CpError(400, 'Unknown template.');
    const key = r.key as StarterKey;
    if (out.some((d) => d.key === key)) throw new CpError(400, 'Each template can be sent once.');
    out.push({ key, purpose: STARTER_PURPOSE[key], name: str(r.name).slice(0, 200), subject: str(r.subject).slice(0, 400), body: str(r.body).slice(0, 6000) });
  }
  return out;
}

function inputOf(d: TemplateDraft): TemplateInput | { error: string } {
  const v = validateTemplate({ name: d.name, subject: d.subject, body: d.body, purpose: d.purpose, campaign: STARTER_CAMPAIGN, visibility: 'team', outcomeTags: [], assignedTo: [], sequenceStep: STARTER_STEP[d.key], frameworkId: '' });
  return v.ok ? v.value : { error: v.error };
}

export async function runTemplatesDraft(p: Project, ctx: Ctx): Promise<{ result: Record<string, unknown> }> {
  if (aiMode() === 'off') throw new CpError(409, NO_AI_MESSAGE, { code: 'ai_off' });
  const a = await acceptedIntake(p);
  if (!a.questionnaire && !a.scripts) throw new CpError(409, 'Accept the questionnaire or the scripts first: the AI drafts from the client’s own answers.', { code: 'no_source' });
  const src = await templateSource(p, a);
  if (!hasSource(src)) throw new CpError(409, 'The accepted questionnaire and scripts have no text to draft from.', { code: 'no_source' });
  const r = await draftTemplates(src);
  if (!r.ok) throw new CpError(r.off ? 409 : 502, r.error, { code: r.off ? 'ai_off' : 'ai_failed' });
  const sourceNumbers = sourceNumbersOf(src);
  await saveRecord(p, (x) => {
    x.templates = { drafts: r.drafts, draftedAt: nowIso(), mode: r.mode, sourceNumbers, seeded: x.templates?.seeded ?? [] };
  });
  await log(p, null, ctx.actor, 'provision', { action: 'templates_drafted', count: r.drafts.length, status: 'done' });
  const issues = Object.fromEntries(r.drafts.map((d) => [d.key, templateIssues(d, sourceNumbers)]));
  return { result: { count: r.drafts.length, issues, message: `${r.drafts.length} drafts ready. Review and edit them, then seed the ones you want. Nothing is in the workspace yet.` } };
}

/** The rule check on the owner's edited drafts (nothing is stored). */
export async function checkTemplates(p: Project, body: Record<string, unknown>): Promise<{ result: Record<string, unknown> }> {
  const drafts = cleanDrafts(body.templates);
  const src = await templateSource(p, await acceptedIntake(p));
  const nums = sourceNumbersOf(src);
  const issues = Object.fromEntries(drafts.map((d) => [d.key, templateIssues(d, nums)]));
  const ok = Object.values(issues).every((x) => x.length === 0);
  return { result: { ok, issues, message: ok ? 'Every template passes the rules.' : 'Some templates need changes before they can be seeded.' } };
}

export async function runTemplatesSeed(p: Project, owner: Actor, ctx: Ctx, body: Record<string, unknown>): Promise<{ result: Record<string, unknown> }> {
  const tenant = await linkedTenant(p);
  const drafts = cleanDrafts(body.templates);
  if (!drafts.length) throw new CpError(400, 'Select at least one template to seed.');
  // Every rule is checked again here, on the server, against the client's own figures: nothing is seeded unless all pass.
  const src = await templateSource(p, await acceptedIntake(p));
  const nums = sourceNumbersOf(src);
  const issues: Record<string, string[]> = {};
  const inputs: (TemplateInput & { id: string; key: StarterKey })[] = [];
  for (const d of drafts) {
    const list = templateIssues(d, nums);
    const inp = inputOf(d);
    if ('error' in inp) list.push(inp.error);
    if (list.length) issues[d.key] = [...new Set(list)];
    else if (!('error' in inp)) inputs.push({ ...inp, id: seedId(tenant.code, `provision:${d.key}`), key: d.key });
  }
  if (Object.keys(issues).length) throw new CpError(400, 'Some templates break the rules. Fix them, then seed again. Nothing was seeded.', { code: 'issues', issues });
  const ts = getEmailTemplateStore();
  const have = new Set((await ts.list(tenant.code)).map((t) => t.id));
  const fresh = inputs.filter((t) => !have.has(t.id));
  if (fresh.length) await ts.seed(tenant.code, fresh.map(({ key: _k, ...t }) => (void _k, t)), owner.email);
  const at = nowIso();
  const rows = inputs.map((t) => ({ label: STARTER_LABEL[t.key], ok: true, note: have.has(t.id) ? 'already in the workspace (unchanged: edit it there)' : 'added to the workspace' }));
  await finishStep(p, ctx, 'templates', 'done', `${inputs.length} starter email template${inputs.length === 1 ? '' : 's'} in the workspace`, { added: fresh.length, existing: inputs.length - fresh.length }, (r) => {
    const seeded = r.templates?.seeded ?? [];
    for (const t of inputs) if (!seeded.some((x) => x.key === t.key)) seeded.push({ key: t.key, id: t.id, at });
    if (r.templates) r.templates.seeded = seeded;
    else r.templates = { drafts: [], draftedAt: at, mode: 'live', sourceNumbers: nums, seeded };
  });
  return { result: { added: fresh.length, existing: inputs.length - fresh.length, rows, message: `${fresh.length} added, ${inputs.length - fresh.length} already in the workspace.` } };
}
