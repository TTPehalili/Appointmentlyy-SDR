/**
 * Shared helpers for the /api/meeting-plans and /api/tenant/profile route handlers (route files may
 * only export handlers). The workspace always comes from the session, never the request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isDemoSession } from '@/lib/demoMode';
import { EMAIL_RE, type Role } from '@/lib/roles';
import {
  MEETING_PLAN_LIMITS,
  type Assignee,
  type CallContext,
  type CompanyProfile,
  type CreateMeetingPlanInput,
  type LeadSnapshot,
  type MeetingPlan,
  type MeetingPlanSummary,
} from '@/lib/meetingPlan';
import type { OnePagerBrand } from '@/lib/onePagerRender';
import { getServerSession, hasRank, type ServerSession } from '@/lib/server/session';
import { getTenantStore, type Member, type Tenant } from '@/lib/server/tenantStore';
import { displayNameFor } from '@/lib/server/tenancy';
import { normalizeWebsite, isLinkedinHost } from '@/lib/server/meetingPlan/safeFetch';
import { DEMO_MEETING_PLAN_SEEDS } from '@/lib/server/meetingPlan/meetingPlanSeeds';
import {
  getCompanyProfileStore,
  getMeetingPlanStore,
  type StoredMeetingPlan,
} from '@/lib/server/meetingPlanStore';
import { isMeetingPlanRunning } from '@/lib/server/meetingPlan/job';
export { friendlyError } from '@/lib/server/meetingPlan/job';

// ------------------------------------------------------------------ responses

export const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (status: number, error: string, field?: string) => json({ success: false, error, ...(field ? { field } : {}) }, status);

export const planNotFound = () => fail(404, 'Meeting plan not found.');

/** The signed-in person, or the 401 to send. */
export async function requireSession(req: NextRequest): Promise<ServerSession | NextResponse> {
  const session = await getServerSession(req);
  if (!session) return fail(401, 'Please sign in again.');
  return session;
}

/** Largest JSON body any meeting-plan route accepts (notes + transcript + a full plan fit easily). */
const MAX_BODY_CHARS = 120_000;

/** The body as a JSON object, or null (bad JSON, not an object, or too large). */
export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BODY_CHARS) return null;
  try {
    const body = JSON.parse(raw) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ visibility

/** Supervisor and above see every plan in the workspace. */
export const seesAllPlans = (s: ServerSession) => hasRank(s, 'Supervisor');

/**
 * Who may open a plan: Supervisor+ (platform staff included) see all of the workspace's plans;
 * everyone else sees plans they booked or are assigned to. In the demo workspace the sample plans
 * are visible to everyone, so every demo login has something to show.
 */
export function canSeePlan(s: ServerSession, p: Pick<MeetingPlan, 'tenantCode' | 'bookedBy' | 'assignedAe'> & { seedKey?: string | null }): boolean {
  if (p.tenantCode !== s.tenantCode) return false;
  if (seesAllPlans(s)) return true;
  const me = s.email.toLowerCase();
  if (p.bookedBy === me || p.assignedAe === me) return true;
  return Boolean(p.seedKey) && isDemoSession(s);
}

/**
 * Demo workspace sample plans are shown as assigned to whoever is looking, so every demo login finds
 * them under "My meetings" and sees their own name as the contact on the one-pager and PDF.
 * View-only: the stored row is unchanged.
 */
export function forViewer<T extends { assignedAe: string; assignedAeName: string; seedKey?: string | null }>(s: ServerSession, p: T): T {
  if (!p.seedKey || !isDemoSession(s)) return p;
  return { ...p, assignedAe: s.email.toLowerCase(), assignedAeName: s.name || p.assignedAeName };
}

/** Load a plan the session may see (tenant from the session), or null. Applies the stale sweep. */
export async function loadVisiblePlan(s: ServerSession, id: string): Promise<StoredMeetingPlan | null> {
  const p = await getMeetingPlanStore().get(s.tenantCode, id);
  if (!p || !canSeePlan(s, p)) return null;
  return forViewer(s, await sweepStale(p));
}

// ------------------------------------------------------------------ stale 'preparing' sweep

/** A plan still 'preparing' this long after its last change was lost (server restart, timeout). */
export const STALE_PREPARING_MS = 10 * 60_000;
export const STALE_PREPARING_ERROR = 'Preparing this plan took too long. Please try again.';

/**
 * Lazily (on read) mark plans stuck in 'preparing' as failed, so a restart mid-generation never leaves
 * a plan spinning forever. Only applies while the plan is still 'preparing' and no job is running it here.
 */
export async function sweepStale(p: StoredMeetingPlan): Promise<StoredMeetingPlan> {
  if (p.status !== 'preparing') return p;
  if (Date.now() - Date.parse(p.updatedAt) < STALE_PREPARING_MS) return p;
  if (isMeetingPlanRunning(p.tenantCode, p.id)) return p;
  const failed = { status: 'failed' as const, error: STALE_PREPARING_ERROR };
  try {
    const saved = await getMeetingPlanStore().update(p.tenantCode, p.id, failed, { onlyIfStatus: 'preparing' });
    return saved ?? { ...p, ...failed };
  } catch (err) {
    console.error('[meeting-plans sweep]', err);
    return { ...p, ...failed };
  }
}

// ------------------------------------------------------------------ shapes sent to the browser

/** The public plan (server-only bookkeeping removed). */
export function toPublic(p: StoredMeetingPlan): MeetingPlan {
  return {
    id: p.id,
    tenantCode: p.tenantCode,
    contactKey: p.contactKey,
    lead: p.lead,
    call: p.call,
    bookedBy: p.bookedBy,
    bookedByName: p.bookedByName,
    assignedAe: p.assignedAe,
    assignedAeName: p.assignedAeName,
    status: p.status,
    research: p.research,
    plan: p.plan,
    onePager: p.onePager,
    error: p.error,
    sentAt: p.sentAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toSummary(p: MeetingPlan): MeetingPlanSummary {
  return {
    id: p.id,
    contactKey: p.contactKey,
    status: p.status,
    bookedBy: p.bookedBy,
    bookedByName: p.bookedByName,
    assignedAe: p.assignedAe,
    assignedAeName: p.assignedAeName,
    sentAt: p.sentAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    error: p.error,
    lead: {
      name: p.lead.name,
      email: p.lead.email,
      company: p.lead.company,
      ...(p.lead.title ? { title: p.lead.title } : {}),
      ...(p.lead.website ? { website: p.lead.website } : {}),
    },
    ...(p.call.meetingAt ? { meetingAt: p.call.meetingAt } : {}),
  };
}

// ------------------------------------------------------------------ brand

export function tenantDisplayName(t: Pick<Tenant, 'name' | 'branding'>): string {
  return (t.branding?.displayName || '').trim() || t.name;
}

export function buildBrand(t: Pick<Tenant, 'name' | 'branding'>, profile: Pick<CompanyProfile, 'website'> | null): OnePagerBrand {
  const companyName = tenantDisplayName(t);
  const initials =
    t.branding?.logoInitials ||
    companyName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
  return {
    companyName,
    ...(t.branding?.brandColor ? { brandColor: t.branding.brandColor } : {}),
    ...(initials ? { logoInitials: initials.slice(0, 2) } : {}),
    ...(profile?.website ? { website: profile.website } : {}),
  };
}

/** The session's workspace brand for the one-pager (profile read errors fall back to no website). */
export async function brandFor(s: ServerSession): Promise<OnePagerBrand> {
  const profile = await getCompanyProfileStore().get(s.tenantCode).catch(() => null);
  return buildBrand(s.identity.tenant, profile);
}

/** The plan's saved one-pager as a PDF (caller checks that a one-pager exists). */
export async function renderPlanPdf(p: MeetingPlan, brand: OnePagerBrand): Promise<Buffer> {
  if (!p.onePager) throw new Error('No one-pager to render.');
  // Loaded on demand so the PDF renderer only enters the routes that draw a PDF.
  const { renderOnePagerPdf } = await import('@/lib/server/meetingPlan/onePagerPdf');
  return renderOnePagerPdf({
    copy: p.onePager,
    lead: { name: p.lead.name, company: p.lead.company, ...(p.lead.title ? { title: p.lead.title } : {}) },
    ...(p.call.meetingAt ? { meetingAt: p.call.meetingAt } : {}),
    brand,
    ae: { name: p.assignedAeName || p.assignedAe, email: p.assignedAe },
  });
}

// ------------------------------------------------------------------ assignees

export const isAccountExecutive = (role: Role) => role === 'Account Executive';

/** Active members of the session's workspace (never another workspace's). */
export async function activeMembers(s: ServerSession): Promise<Member[]> {
  const members = await getTenantStore().listMembers({ tenantCode: s.tenantCode });
  return members.filter((m) => m.status === 'active');
}

export function memberName(m: Pick<Member, 'email' | 'name'>): string {
  return displayNameFor(m.email, m.name);
}

/** AEs first, then everyone else by seniority-agnostic name order. The signed-in person is always offered. */
export async function listAssignees(s: ServerSession): Promise<Assignee[]> {
  const list: Assignee[] = (await activeMembers(s)).map((m) => ({ email: m.email, name: memberName(m), role: m.role }));
  if (!list.some((a) => a.email === s.email.toLowerCase())) list.push({ email: s.email.toLowerCase(), name: s.name, role: s.role });
  return list.sort(
    (a, b) =>
      Number(isAccountExecutive(b.role as Role)) - Number(isAccountExecutive(a.role as Role)) || a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
  );
}

/**
 * Resolve an assignee email to { email, name }. Empty = the signed-in person. Anyone else must be an
 * active member of the session's workspace. Returns a 400 response otherwise.
 */
export async function resolveAssignee(s: ServerSession, raw: unknown): Promise<{ email: string; name: string } | NextResponse> {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return fail(400, 'Pick who will run the meeting.', 'assignedAe');
  const email = String(raw ?? '').trim().toLowerCase();
  const me = s.email.toLowerCase();
  if (!email || email === me) return { email: me, name: s.name };
  if (!EMAIL_RE.test(email) || email.length > 254) return fail(400, 'Pick who will run the meeting.', 'assignedAe');
  const m = (await activeMembers(s)).find((x) => x.email === email);
  if (!m) return fail(400, 'That person is not an active member of this workspace.', 'assignedAe');
  return { email: m.email, name: memberName(m) };
}

// ------------------------------------------------------------------ daily cap

const DEFAULT_DAILY_CAP = 40;

export function dailyCap(): number {
  const n = Math.floor(Number(process.env.MEETING_PLAN_DAILY_CAP));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

/** 429 when the workspace has started its cap of AI generations in the last 24 hours; else null. */
export async function checkDailyCap(s: ServerSession): Promise<NextResponse | null> {
  const cap = dailyCap();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const used = await getMeetingPlanStore().countGeneratedSince(s.tenantCode, since);
  if (used >= cap) {
    return fail(
      429,
      `This workspace has prepared ${cap} meeting plans in the last 24 hours, which is the daily limit. Please try again later, or ask your admin to raise the limit.`,
    );
  }
  return null;
}

// ------------------------------------------------------------------ create validation

type Valid<T> = { ok: true; value: T } | { ok: false; error: string; field: string };
const bad = (field: string, error: string): { ok: false; error: string; field: string } => ({ ok: false, error, field });

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim() : '');
/** Short single-line value, clipped to the cap. */
const short = (v: unknown, max: number = MEETING_PLAN_LIMITS.shortText) => str(v).replace(/\s+/g, ' ').slice(0, max);

function cleanLinkedin(v: unknown): string | undefined {
  const s = str(v);
  if (!s || s.length > MEETING_PLAN_LIMITS.shortText) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !isLinkedinHost(u.hostname)) return undefined;
    return `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return undefined;
  }
}

/** Validate and clean what the Dialer's handoff form sends. Lead details are clipped; call text is checked. */
export function validateCreateInput(body: Record<string, unknown>): Valid<CreateMeetingPlanInput> {
  const rawLead = body.lead && typeof body.lead === 'object' && !Array.isArray(body.lead) ? (body.lead as Record<string, unknown>) : null;
  const rawCall = body.call && typeof body.call === 'object' && !Array.isArray(body.call) ? (body.call as Record<string, unknown>) : null;
  if (!rawLead) return bad('lead', 'Add the prospect details.');
  if (!rawCall) return bad('call', 'Add what happened on the call.');

  const name = short(rawLead.name, 120);
  if (!name) return bad('lead.name', "Add the prospect's name.");
  const company = short(rawLead.company, 160);
  if (!company) return bad('lead.company', "Add the prospect's company.");
  const email = short(rawLead.email, 254).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return bad('lead.email', "The prospect's email doesn't look right.");
  const contactId = short(rawLead.contactId, 120);
  if (!email && !contactId) return bad('lead.email', "Add the prospect's email.");

  let website: string | undefined;
  const rawSite = str(rawLead.website);
  if (rawSite) {
    if (rawSite.length > MEETING_PLAN_LIMITS.shortText) return bad('lead.website', 'That website address is too long.');
    const norm = normalizeWebsite(rawSite);
    if (!norm) return bad('lead.website', "That website doesn't look right. Use something like acme.com.");
    website = norm;
  }

  const lead: LeadSnapshot = { name, email, company };
  const opt = (k: keyof LeadSnapshot, v: string | undefined) => {
    if (v) (lead as unknown as Record<string, string>)[k] = v;
  };
  opt('title', short(rawLead.title));
  opt('phone', short(rawLead.phone, 40));
  opt('website', website);
  opt('companyLinkedinUrl', cleanLinkedin(rawLead.companyLinkedinUrl));
  opt('personLinkedinUrl', cleanLinkedin(rawLead.personLinkedinUrl));
  opt('industry', short(rawLead.industry));
  opt('location', short(rawLead.location));
  opt('headcount', short(rawLead.headcount, 60));
  opt('contactId', contactId);

  if (rawCall.notes !== undefined && rawCall.notes !== null && typeof rawCall.notes !== 'string') return bad('call.notes', 'Call notes must be text.');
  const notes = str(rawCall.notes);
  if (notes.length > MEETING_PLAN_LIMITS.notes) return bad('call.notes', `Keep the call notes under ${MEETING_PLAN_LIMITS.notes} characters.`);
  const extra = str(rawCall.extraContext);
  if (extra.length > MEETING_PLAN_LIMITS.extraContext) {
    return bad('call.extraContext', `Keep the extra context under ${MEETING_PLAN_LIMITS.extraContext} characters.`);
  }
  // Keep the most recent part of a long transcript.
  const transcriptFull = str(rawCall.transcript);
  const transcript = transcriptFull.length > MEETING_PLAN_LIMITS.transcript ? transcriptFull.slice(-MEETING_PLAN_LIMITS.transcript) : transcriptFull;
  const call: CallContext = {
    outcome: short(rawCall.outcome) || 'Meeting Booked',
    notes,
    ...(short(rawCall.meetingAt, 120) ? { meetingAt: short(rawCall.meetingAt, 120) } : {}),
    ...(transcript ? { transcript } : {}),
    ...(extra ? { extraContext: extra } : {}),
  };

  const out: CreateMeetingPlanInput = { lead, call };
  if (typeof body.assignedAe === 'string' && body.assignedAe.trim()) out.assignedAe = body.assignedAe.trim().toLowerCase();
  return { ok: true, value: out };
}

// ------------------------------------------------------------------ demo seeds

const seededFor = new Set<string>();

/**
 * Demo workspace only: put the sample plans in place (deterministic ids, so concurrent or repeated
 * calls insert each one once). They are assigned to whoever lists first and are visible to every
 * demo login (canSeePlan). Client workspaces never get samples.
 */
export async function ensureDemoPlans(s: ServerSession): Promise<void> {
  if (!isDemoSession(s) || seededFor.has(s.tenantCode)) return;
  if (!Array.isArray(DEMO_MEETING_PLAN_SEEDS) || DEMO_MEETING_PLAN_SEEDS.length === 0) return;
  seededFor.add(s.tenantCode);
  try {
    await getMeetingPlanStore().ensureSeeds(
      s.tenantCode,
      DEMO_MEETING_PLAN_SEEDS.map((seed) => ({
        seedKey: seed.seedKey,
        lead: seed.lead,
        call: seed.call,
        research: seed.research ?? null,
        plan: seed.plan ?? null,
        onePager: seed.onePager ?? null,
        status: seed.status,
        daysAgo: seed.daysAgo,
        bookedBy: 'sample.sdr@appointmentlyy.com',
        bookedByName: 'Sample SDR',
        assignedAe: s.email,
        assignedAeName: s.name,
      })),
    );
  } catch (err) {
    seededFor.delete(s.tenantCode);
    throw err;
  }
}

// ------------------------------------------------------------------ audit

export async function auditPlan(s: ServerSession, action: string, p: Pick<MeetingPlan, 'id' | 'lead'>, detail: Record<string, unknown> = {}) {
  try {
    await getTenantStore().addAudit({
      actorEmail: s.email,
      tenantCode: s.tenantCode,
      action: `meeting_plan.${action}`,
      target: p.id,
      detail: { company: p.lead.company, ...detail },
    });
  } catch (err) {
    console.error('[meeting-plans audit]', err);
  }
}
